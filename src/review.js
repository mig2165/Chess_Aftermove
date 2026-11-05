import { Chess } from "chess.js";
import { evaluationAtPly, formatEvaluation, formatEvaluationSwing, whiteAdvantageShare } from "./advantage.js";
import { boardPoint, displaySquare } from "./board-view.js";
import { adjacentMistakePly, adjacentPly, classifyPlayedMove, dispatchParallelTasks, isBadMove, moveMark, playerAccuracy, scoreFromInfo, whiteScore } from "./engine-logic.js";

const $ = (selector) => document.querySelector(selector);
const analyzeButton = $("#analyze-button");
const progressRegion = $("#progress-region");
const progressBar = $("#progress-bar");
const errorMessage = $("#error-message");
const findingsElement = $("#findings");
const entries = [];
const positions = [];
let gameHistory = [];
let pgn = "";
let ready = false;
let pgnValid = false;
let gameLocked = false;
let analysisRunning = false;
let activeEngine;
let aiRequestController;
let moveSoundsEnabled = true;
let soundContext;
let bestMoveVisible = false;
let bestMoveDismissed = false;
let bestSequenceStep = 0;
let boardFlipped = false;
let whatIfGame = null;
let whatIfStartPly = null;
let whatIfSelectedSquare = "";
let whatIfBaseline = null;
let whatIfLastMove = null;
let whatIfRunning = false;
let whatIfRequest = 0;
let whatIfError = "";

function applyGate() {
  analyzeButton.disabled = gameLocked || !pgnValid || ready || analysisRunning;
  $("#coach-button").disabled = gameLocked || !pgnValid || !ready;
  const depthSelect = $("#engine-depth-select");
  if (depthSelect) depthSelect.disabled = gameLocked || !pgnValid || ready || analysisRunning;
}

async function updateCoachSettingsStatus() {
  const settings = await chrome.storage.local.get(["aiEnabled", "aiKey"]);
  const status = $("#review-ai-status");
  if (!settings.aiKey) {
    status.textContent = "AI is off. Add an API key here, tick Enable AI coach, and save.";
    return;
  }
  if (!settings.aiEnabled) {
    status.textContent = "Your key is saved, but AI coaching is switched off. Tick Enable AI coach and save.";
    return;
  }
  status.textContent = ready
    ? "AI coach is ready. Ask a question below."
    : "AI coach is saved. Run Stockfish analysis first, then ask a question.";
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.moveSounds) {
    moveSoundsEnabled = changes.moveSounds.newValue !== false;
    $("#move-sounds").checked = moveSoundsEnabled;
  }
  if (changes.aiEnabled || changes.aiKey || changes.aiModel) updateCoachSettingsStatus().catch(() => {});
  if (!changes.recording) return;
  gameLocked = Boolean(changes.recording.newValue);
  if (gameLocked) {
    ready = false;
    entries.splice(0);
    activeEngine?.stop();
    activeEngine = null;
    aiRequestController?.abort();
    pgn = "";
    pgnValid = false;
    gameHistory = [];
    positions.splice(0, positions.length, new Chess().fen());
    selectedPly = 0;
    exitWhatIf();
    $("#pgn-display").value = "";
    $("#coach-question").value = "";
    $("#coach-question").disabled = true;
    $("#pgn-display").disabled = true;
    $("#move-sounds").disabled = true;
    $("#flip-board").disabled = true;
    $("#move-list").replaceChildren();
    $("#move-summary").hidden = true;
    $("#advantage-panel").hidden = true;
    $("#selected-move-panel").textContent = "Review is locked while a game is being recorded.";
    renderBoard();
    findingsElement.textContent = "Review is locked while a game is being recorded. Aftermove stays silent until the result.";
    $("#finding-count").textContent = "Review locked";
    $("#coach-answer").textContent = "";
    $("#coach-privacy").textContent = "A game is in progress. Analysis and coaching are locked until its result is confirmed.";
    errorMessage.hidden = true;
  } else {
    $("#coach-privacy").textContent = "Built-in notes stay on this device. Optional AI is off until enabled in the extension settings.";
    $("#move-sounds").disabled = false;
    $("#flip-board").disabled = false;
  }
  applyGate();
});

function setProgress(message, done, total) {
  $("#progress-message").textContent = message;
  $("#progress-number").textContent = total ? `${done} / ${total}` : "";
  progressBar.style.transform = `scaleX(${total ? Math.round((done / total) * 100) / 100 : 0.08})`;
}

class UciEngine {
  constructor(worker) {
    this.worker = worker;
    this.waiter = null;
    worker.addEventListener("message", (event) => {
      const line = typeof event.data === "string" ? event.data : String(event.data);
      this.waiter?.(line);
    });
    worker.addEventListener("error", (event) => {
      this.waiter?.(null, new Error(event.message || "Stockfish worker failed to load."));
    });
  }

  waitFor(predicate, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Stockfish did not respond in time."));
      }, timeoutMs);
      this.waiter = (line, error) => {
        if (error) {
          clearTimeout(timeout);
          this.waiter = null;
          reject(error);
        } else if (predicate(line)) {
          clearTimeout(timeout);
          this.waiter = null;
          resolve(line);
        }
      };
    });
  }

  async start() {
    const uci = this.waitFor((line) => line === "uciok");
    this.worker.postMessage("uci");
    await uci;
    const ready = this.waitFor((line) => line === "readyok");
    this.worker.postMessage("isready");
    await ready;
  }

  analyze(fen, depth = 10) {
    return new Promise((resolve, reject) => {
      let latestScore = null;
      let latestPv = [];
      const timeout = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Stockfish analysis timed out. Try a shorter game."));
      }, 60000);
      this.waiter = (line, error) => {
        if (error) {
          clearTimeout(timeout);
          this.waiter = null;
          reject(error);
          return;
        }
        if (line.startsWith("info ")) {
          latestScore = scoreFromInfo(line, fen.split(" ")[1]);
          const pv = line.match(/\bpv\s+(.+)$/);
          if (pv) latestPv = pv[1].trim().split(/\s+/).filter(Boolean);
        }
        if (line.startsWith("bestmove ")) {
          clearTimeout(timeout);
          this.waiter = null;
          if (!latestScore) {
            reject(new Error("Stockfish returned no evaluation for a position."));
            return;
          }
          resolve({ score: latestScore, bestmove: line.split(/\s+/)[1], pv: latestPv });
        }
      };
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  stop() {
    this.waiter?.(null, new Error("Review paused because a game is being recorded."));
    this.waiter = null;
    this.worker.terminate();
  }
}

function getOptimalPoolSize() {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.min(4, Math.max(2, Math.floor(cores / 2)));
}

class EnginePool {
  constructor(size = getOptimalPoolSize()) {
    this.size = size;
    this.engines = [];
    this.stopped = false;
  }

  async start() {
    this.engines = [];
    const startPromises = [];
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(chrome.runtime.getURL("vendor/stockfish/stockfish-19-lite-single.js"));
      const engine = new UciEngine(worker);
      this.engines.push(engine);
      startPromises.push(engine.start());
    }
    await Promise.all(startPromises);
  }

  stop() {
    this.stopped = true;
    for (const engine of this.engines) {
      engine.stop();
    }
    this.engines = [];
  }
}

function uciToSan(fen, move) {
  if (!move || move === "(none)" || move === "0000") return "";
  const board = new Chess(fen);
  try {
    const played = board.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move[4]?.toLowerCase()
    });
    return played.san;
  } catch {
    return "";
  }
}

function uciLineToSan(fen, moves, limit = 5) {
  const board = new Chess(fen);
  const line = [];
  for (const move of (moves || []).slice(0, limit)) {
    try {
      const played = board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]?.toLowerCase() });
      if (!played) break;
      line.push(played.san);
    } catch {
      break;
    }
  }
  return line;
}

function humanNote(entry) {
  const move = entry.actualSan;
  const best = entry.bestSan;
  if (entry.checkmate) return `${move} — checkmate. No notes. Just enjoy that one.`;
  if (entry.category === "blunder") return `${move} gave away a lot of ground. ${best ? `Stockfish preferred ${best}.` : "There was a safer continuation."} The board has a flair for drama.`;
  if (entry.category === "mistake") return `${move} made the position harder than it needed to be. ${best ? `${best} kept more of the edge.` : "Stockfish found a steadier option."}`;
  if (entry.category === "inaccuracy") return `${move} was playable, but it let some advantage slip. ${best ? `The engine's cleaner idea was ${best}.` : "A small tune-up was available."}`;
  if (entry.category === "excellent") return `${move} gained ground in the engine's evaluation. Quietly excellent; the engine approves.`;
  if (entry.category === "best") return `${move} matches Stockfish's top choice at this search depth.`;
  return `${move} held up well under engine review. No drama detected.`;
}

function bestMoveReason(entry) {
  if (entry.checkmate) return `${entry.actualSan} ends the game immediately. This review does not need an alternative move.`;
  if (!entry.bestSan) return "Stockfish did not return a legal alternative for this position.";
  const actual = entry.actualSan.replace(/[+#]$/, "");
  const best = entry.bestSan.replace(/[+#]$/, "");
  if (actual === best) return `${entry.bestSan} was also Stockfish’s top choice at depth 10.`;
  if (entry.loss >= 75) {
    return `Stockfish preferred ${entry.bestSan}. Its depth-10 evaluation suggests this alternative would have avoided about ${(entry.loss / 100).toFixed(1)} pawns of lost advantage.`;
  }
  if (entry.loss <= -75) {
    return `The played move ${entry.actualSan} scored better than Stockfish’s initial ${entry.bestSan} choice at this search depth. Engine preferences can change at deeper searches.`;
  }
  return `Stockfish’s top choice was ${entry.bestSan}. The evaluation difference was small at depth 10, so this is an alternative, not a clear correction.`;
}

function tacticalExplanation(entry) {
  const bestLine = entry.bestLine?.join(" ");
  const consequenceLine = entry.consequenceLine?.join(" ");
  const parts = [humanNote(entry), bestMoveReason(entry)];
  if (bestLine && bestLine !== entry.actualSan) parts.push(`Better plan: ${bestLine}.`);
  if (consequenceLine) parts.push(`After ${entry.actualSan}, Stockfish’s concrete reply is: ${consequenceLine}.`);
  if (!consequenceLine && entry.loss >= 75) parts.push("The local engine did not return a full reply line, so this review can show the evaluation swing but not responsibly invent a tactic.");
  return parts.join(" ");
}

function moveNumber(entry) {
  return `${Math.ceil(entry.ply / 2)}${entry.turn === "b" ? "..." : "."} ${entry.actualSan}`;
}

const pieceGlyph = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟"
};
const pieceName = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
let selectedPly = 0;

function getBestContinuationSequence(entry, ply) {
  if (!entry || !entry.bestMove) return null;
  const startFen = positions[ply - 1] || new Chess().fen();
  const testGame = new Chess(startFen);
  const uciMoves = entry.bestPv || [];
  const steps = [];

  const movesToTry = uciMoves.length > 0 ? uciMoves : (entry.bestLine || []);

  for (let i = 0; i < Math.min(3, movesToTry.length); i++) {
    const rawMove = movesToTry[i];
    let played = null;
    try {
      if (typeof rawMove === "string" && rawMove.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(rawMove)) {
        played = testGame.move({
          from: rawMove.slice(0, 2),
          to: rawMove.slice(2, 4),
          promotion: rawMove[4]?.toLowerCase()
        });
      } else {
        played = testGame.move(rawMove);
      }
    } catch {
      break;
    }
    if (!played) break;
    steps.push({
      stepNumber: i + 1,
      san: played.san,
      uci: `${played.from}${played.to}${played.promotion || ""}`,
      from: played.from,
      to: played.to,
      fen: testGame.fen(),
      color: played.color
    });
  }

  if (steps.length === 0 && entry.bestSan) {
    try {
      const g = new Chess(startFen);
      const played = g.move(entry.bestSan) || g.move({ from: entry.bestMove.slice(0, 2), to: entry.bestMove.slice(2, 4) });
      if (played) {
        steps.push({
          stepNumber: 1,
          san: played.san,
          uci: `${played.from}${played.to}`,
          from: played.from,
          to: played.to,
          fen: g.fen(),
          color: played.color
        });
      }
    } catch {}
  }

  return steps.length > 0 ? steps : null;
}

function renderBoard() {
  const boardElement = $("#chessboard");
  const selectedEntry = entries[selectedPly - 1];
  const freeplay = Boolean(whatIfGame);

  const continuation = !freeplay && isBadMove(selectedEntry)
    ? getBestContinuationSequence(selectedEntry, selectedPly)
    : null;
  const inContinuationPreview = Boolean(continuation && bestSequenceStep > 0);
  const previewStepData = inContinuationPreview
    ? continuation[Math.min(bestSequenceStep, continuation.length) - 1]
    : null;

  const position = inContinuationPreview
    ? new Chess(previewStepData.fen)
    : freeplay
    ? whatIfGame
    : new Chess(positions[selectedPly] || new Chess().fen());

  const board = position.board();
  const playedMove = freeplay || inContinuationPreview ? null : gameHistory[selectedPly - 1];

  let arrowMove = null;
  if (inContinuationPreview) {
    arrowMove = previewStepData.uci;
  } else if (!freeplay && selectedEntry?.bestMove) {
    const bad = isBadMove(selectedEntry);
    if ((bad && !bestMoveDismissed) || (!bad && bestMoveVisible)) {
      arrowMove = selectedEntry.bestMove;
    }
  }

  let originGhost = null;
  if (arrowMove && !inContinuationPreview) {
    const arrowFrom = arrowMove.slice(0, 2);
    const pieceAtFrom = position.get(arrowFrom);
    if (!pieceAtFrom) {
      const prevPosition = new Chess(positions[selectedPly - 1] || new Chess().fen());
      const orig = prevPosition.get(arrowFrom);
      if (orig) {
        originGhost = { square: arrowFrom, piece: orig };
      }
    }
  }

  const legalMoves = freeplay && whatIfSelectedSquare
    ? position.moves({ square: whatIfSelectedSquare, verbose: true })
    : [];
  const legalSquares = new Set(legalMoves.map((move) => move.to));
  const cells = [];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const displayed = displaySquare(row, column, boardFlipped);
      const piece = board[displayed.row][displayed.column];
      const square = displayed.name;
      const cell = document.createElement("div");
      cell.className = `square ${(displayed.row + displayed.column) % 2 ? "dark" : "light"}`;

      if (freeplay) {
        cell.classList.add("freeplay");
        cell.tabIndex = 0;
        if (square === whatIfSelectedSquare) cell.classList.add("is-selected");
        if (legalSquares.has(square)) {
          cell.classList.add("is-legal");
          if (piece) cell.classList.add("has-piece");
        }
        cell.addEventListener("click", () => handleWhatIfSquare(square));
        cell.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleWhatIfSquare(square);
          }
        });
      }

      if (playedMove?.from === square) cell.classList.add("last-from");
      if (playedMove?.to === square) cell.classList.add("last-to");

      if (arrowMove && arrowMove.slice(2, 4) === square) {
        cell.classList.add("best-target-square");
      }

      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${pieceName[piece.type]}` : ""}${playedMove?.to === square ? ", move destination" : ""}`);
      cell.textContent = piece ? pieceGlyph[piece.color + piece.type] : "";

      if (originGhost && originGhost.square === square) {
        const ghost = document.createElement("span");
        ghost.className = "square-ghost-origin";
        ghost.textContent = pieceGlyph[originGhost.piece.color + originGhost.piece.type];
        ghost.setAttribute("aria-hidden", "true");
        cell.append(ghost);
      }

      if (!inContinuationPreview && playedMove?.to === square && selectedEntry) {
        const badge = document.createElement("span");
        badge.className = "square-quality";
        badge.dataset.category = selectedEntry.category || "good";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = moveMark(selectedEntry.category, selectedEntry.checkmate).icon;
        cell.append(badge);
      } else if (inContinuationPreview && previewStepData && previewStepData.to === square) {
        const badge = document.createElement("span");
        badge.className = "square-quality best-destination";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = "✓";
        cell.append(badge);
      }

      cells.push(cell);
    }
  }

  boardElement.replaceChildren(...cells);
  if (arrowMove) appendBestArrow(boardElement, arrowMove);

  boardElement.setAttribute("aria-label", `Chess position after the selected move, shown from ${boardFlipped ? "Black" : "White"}'s perspective`);
  $("#previous-move").disabled = gameLocked || freeplay || inContinuationPreview || selectedPly === 0;
  $("#next-move").disabled = gameLocked || freeplay || inContinuationPreview || selectedPly >= gameHistory.length;

  const prevMistakeBtn = $("#prev-mistake");
  const nextMistakeBtn = $("#next-mistake");
  if (prevMistakeBtn && nextMistakeBtn) {
    if (gameLocked || freeplay || inContinuationPreview || entries.length === 0) {
      prevMistakeBtn.disabled = true;
      nextMistakeBtn.disabled = true;
    } else {
      prevMistakeBtn.disabled = adjacentMistakePly(selectedPly, "prev", entries) == null;
      nextMistakeBtn.disabled = adjacentMistakePly(selectedPly, "next", entries) == null;
    }
  }

  $("#move-position").textContent = freeplay
    ? `Freeplay · ${whatIfGame.turn() === "w" ? "White" : "Black"} to move`
    : inContinuationPreview
    ? `Best continuation (${previewStepData.stepNumber} of ${continuation.length}) · ${previewStepData.san}`
    : selectedPly === 0
    ? "Start position"
    : `${Math.ceil(selectedPly / 2)}${selectedPly % 2 ? "." : "..."} ${gameHistory[selectedPly - 1].san} · ${selectedPly} of ${gameHistory.length}`;
}

function appendBestArrow(boardElement, uciMove) {
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("best-arrow");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  const defs = document.createElementNS(svg.namespaceURI, "defs");
  const marker = document.createElementNS(svg.namespaceURI, "marker");
  marker.setAttribute("id", "best-arrowhead");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("refX", "4.5");
  marker.setAttribute("refY", "3");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("orient", "auto");
  const head = document.createElementNS(svg.namespaceURI, "path");
  head.setAttribute("d", "M0,0.5 L5.5,3 L0,5.5 Z");
  head.setAttribute("class", "arrow-head");
  marker.append(head);
  defs.append(marker);
  const line = document.createElementNS(svg.namespaceURI, "path");
  line.setAttribute("class", "arrow-line");
  line.setAttribute("d", `M ${boardPoint(from, boardFlipped)} L ${boardPoint(to, boardFlipped)}`);
  line.setAttribute("marker-end", "url(#best-arrowhead)");
  svg.append(defs, line);
  boardElement.append(svg);
}

function jumpToPly(ply) {
  if (gameLocked || whatIfGame) return;
  const previousPly = selectedPly;
  selectedPly = Math.max(0, Math.min(gameHistory.length, ply));
  for (const button of $("#move-list").querySelectorAll(".move-token")) {
    button.setAttribute("aria-current", Number(button.dataset.ply) === selectedPly ? "true" : "false");
  }
  bestMoveVisible = false;
  bestMoveDismissed = false;
  bestSequenceStep = 0;
  renderBoard();
  renderAdvantage();
  renderSelectedMovePanel();
  if (selectedPly !== previousPly) playMoveCue(selectedPly);
}

function renderSelectedMovePanel() {
  const panel = $("#selected-move-panel");
  panel.replaceChildren();
  const entry = entries[selectedPly - 1];
  if (!ready || !entry) {
    const placeholder = document.createElement("p");
    placeholder.className = "move-panel-placeholder";
    placeholder.textContent = pgnValid
      ? "You can explore this position now, or analyze the full game for move-by-move ratings."
      : "Analyze the completed game to see move ratings and engine alternatives.";
    panel.append(placeholder);
    if (pgnValid) panel.append(createExploreButton());
    return;
  }

  const mark = moveMark(entry.category, entry.checkmate);
  const heading = document.createElement("div");
  heading.className = "move-panel-heading";
  const title = document.createElement("h3");
  title.className = "move-panel-title";
  title.textContent = `${moveNumber(entry)} · ${mark.label}`;
  const label = document.createElement("span");
  label.className = "move-panel-category";
  label.textContent = entry.checkmate ? "MATE" : mark.label;
  heading.append(title, label);
  panel.append(heading);

  const reason = document.createElement("p");
  reason.className = "move-panel-reason";
  reason.textContent = entry.checkmate ? humanNote(entry) : bestMoveReason(entry);
  panel.append(reason);

  const badMove = isBadMove(entry);
  const continuation = badMove ? getBestContinuationSequence(entry, selectedPly) : null;

  if (continuation && continuation.length > 0) {
    const continuationCard = document.createElement("div");
    continuationCard.className = "best-line-card";

    const cardHeader = document.createElement("div");
    cardHeader.className = "best-line-header";
    cardHeader.innerHTML = `
      <span class="best-line-badge">BEST CONTINUATION</span>
      <span class="best-line-note">${continuation.length} moves ahead</span>
    `;
    continuationCard.append(cardHeader);

    const stepsContainer = document.createElement("div");
    stepsContainer.className = "best-line-steps";

    continuation.forEach((step, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `best-line-chip ${bestSequenceStep === step.stepNumber ? "is-active" : ""}`;
      const moveNum = Math.ceil((selectedPly + idx) / 2);
      const isWhite = step.color === "w";
      const prefix = isWhite ? `${moveNum}. ` : idx === 0 ? `${moveNum}... ` : "";
      chip.textContent = `${prefix}${step.san}`;
      chip.title = `Click to preview step ${step.stepNumber}: ${step.san}`;
      chip.addEventListener("click", () => {
        bestSequenceStep = bestSequenceStep === step.stepNumber ? 0 : step.stepNumber;
        renderBoard();
        renderSelectedMovePanel();
      });
      stepsContainer.append(chip);
    });
    continuationCard.append(stepsContainer);

    const actionsContainer = document.createElement("div");
    actionsContainer.className = "best-line-actions";

    if (bestSequenceStep === 0) {
      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "best-line-btn-primary";
      previewBtn.innerHTML = `Preview 3-move sequence ▶`;
      previewBtn.addEventListener("click", () => {
        bestSequenceStep = 1;
        renderBoard();
        renderSelectedMovePanel();
      });
      actionsContainer.append(previewBtn);
    } else {
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "best-line-nav-btn";
      prevBtn.setAttribute("aria-label", "Previous move in continuation");
      prevBtn.textContent = "◀";
      prevBtn.disabled = bestSequenceStep <= 1;
      prevBtn.addEventListener("click", () => {
        if (bestSequenceStep > 1) {
          bestSequenceStep -= 1;
          renderBoard();
          renderSelectedMovePanel();
        }
      });
      actionsContainer.append(prevBtn);

      const stepIndicator = document.createElement("span");
      stepIndicator.style.fontSize = "11px";
      stepIndicator.style.fontWeight = "700";
      stepIndicator.style.color = "#4ade80";
      stepIndicator.textContent = `Step ${bestSequenceStep} of ${continuation.length}`;
      actionsContainer.append(stepIndicator);

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "best-line-nav-btn";
      nextBtn.setAttribute("aria-label", "Next move in continuation");
      nextBtn.textContent = "▶";
      nextBtn.disabled = bestSequenceStep >= continuation.length;
      nextBtn.addEventListener("click", () => {
        if (bestSequenceStep < continuation.length) {
          bestSequenceStep += 1;
          renderBoard();
          renderSelectedMovePanel();
        }
      });
      actionsContainer.append(nextBtn);

      const exitBtn = document.createElement("button");
      exitBtn.type = "button";
      exitBtn.className = "best-line-exit-btn";
      exitBtn.textContent = "Exit preview ✕";
      exitBtn.addEventListener("click", () => {
        bestSequenceStep = 0;
        renderBoard();
        renderSelectedMovePanel();
      });
      actionsContainer.append(exitBtn);
    }

    continuationCard.append(actionsContainer);
    panel.append(continuationCard);
  }

  const actions = document.createElement("div");
  actions.className = "move-panel-actions";

  if (entry.bestMove && !entry.checkmate) {
    const bestButton = document.createElement("button");
    bestButton.className = "move-panel-best";
    bestButton.type = "button";
    if (badMove) {
      bestButton.textContent = bestMoveDismissed
        ? `Show best arrow: ${entry.bestSan || ""}`
        : `Hide best arrow`;
      bestButton.addEventListener("click", () => {
        bestMoveDismissed = !bestMoveDismissed;
        renderBoard();
        renderSelectedMovePanel();
      });
    } else {
      bestButton.textContent = bestMoveVisible
        ? "Hide best move"
        : entry.bestSan
        ? `Show best: ${entry.bestSan}`
        : "Best move unavailable";
      bestButton.addEventListener("click", () => {
        bestMoveVisible = !bestMoveVisible;
        renderBoard();
        renderSelectedMovePanel();
      });
    }
    actions.append(bestButton);
  }

  const exploreButton = document.createElement("button");
  exploreButton.className = "move-panel-explore";
  exploreButton.type = "button";
  exploreButton.disabled = gameLocked || !pgnValid;
  exploreButton.textContent = bestSequenceStep > 0
    ? `Explore from continuation step ${bestSequenceStep}`
    : "Explore alternatives from here";
  exploreButton.addEventListener("click", () => {
    if (bestSequenceStep > 0 && continuation) {
      const stepData = continuation[bestSequenceStep - 1];
      startWhatIf(stepData.fen);
    } else {
      startWhatIf();
    }
  });
  actions.append(exploreButton);

  const coachButton = document.createElement("button");
  coachButton.className = "move-panel-coach";
  coachButton.type = "button";
  coachButton.disabled = gameLocked;
  coachButton.textContent = "Ask coach why";
  coachButton.addEventListener("click", async () => {
    const question = `Why was ${moveNumber(entry)} played instead of ${entry.bestSan || "another move"}? Explain the engine's alternative and the position.`;
    const answer = $("#coach-answer");
    answer.textContent = "Thinking through this move…";
    $("#coach-question").value = question;
    try {
      answer.textContent = await askCoach(question, entry);
      answer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      answer.textContent = error.message;
    }
  });
  actions.append(coachButton);
  panel.append(actions);
}

function createExploreButton() {
  const button = document.createElement("button");
  button.className = "move-panel-explore";
  button.type = "button";
  button.disabled = gameLocked || !pgnValid;
  button.textContent = "Explore alternatives from here";
  button.addEventListener("click", () => startWhatIf());
  return button;
}

function startWhatIf(customFen) {
  if (gameLocked || !pgnValid) return;
  whatIfGame = new Chess(customFen || positions[selectedPly] || new Chess().fen());
  whatIfStartPly = selectedPly;
  whatIfSelectedSquare = "";
  whatIfBaseline = null;
  whatIfLastMove = null;
  whatIfError = "";
  bestMoveVisible = false;
  bestSequenceStep = 0;
  renderBoard();
  renderWhatIfPanel();
  renderAdvantage();
  analyzeWhatIfPosition();
}

function exitWhatIf() {
  whatIfRequest += 1;
  whatIfGame = null;
  whatIfStartPly = null;
  whatIfSelectedSquare = "";
  whatIfBaseline = null;
  whatIfLastMove = null;
  whatIfError = "";
  whatIfRunning = false;
  const panel = $("#what-if-panel");
  if (panel) panel.hidden = true;
  $("#selected-move-panel").hidden = false;
  renderAdvantage();
}

function renderWhatIfPanel() {
  const panel = $("#what-if-panel");
  panel.hidden = !whatIfGame;
  if (!whatIfGame) return;
  const evaluation = $("#what-if-evaluation");
  const status = $("#what-if-status");
  const line = $("#what-if-line");
  const undo = $("#what-if-undo");
  undo.disabled = whatIfRunning || whatIfGame.history().length === 0;
  if (whatIfRunning) {
    evaluation.textContent = "Stockfish is thinking…";
    status.textContent = "Evaluating this exact position locally…";
    line.textContent = "";
    return;
  }
  if (whatIfError) {
    evaluation.textContent = "Evaluation unavailable";
    status.textContent = `Stockfish could not evaluate this line: ${whatIfError}`;
    line.textContent = "Try another move, or reload the extension after running npm run build.";
    return;
  }
  evaluation.textContent = whatIfBaseline?.result?.score ? formatEvaluation(whatIfBaseline.result.score) : "Evaluation unavailable";
  if (whatIfLastMove?.rating) {
    const mark = moveMark(whatIfLastMove.rating.category);
    status.textContent = `${whatIfLastMove.move.san}: ${mark.icon} ${mark.label}. ${whatIfLastMove.rating.loss > 0 ? `It gives away about ${(whatIfLastMove.rating.loss / 100).toFixed(1)} pawn${Math.abs(whatIfLastMove.rating.loss) === 100 ? "" : "s"} of value.` : "It holds or improves the position."}`;
  } else {
    status.textContent = `Started from move ${whatIfStartPly === 0 ? "1" : whatIfStartPly}. Click a piece, then a highlighted square; each alternate move is scored by Stockfish.`;
  }
  const result = whatIfBaseline?.result;
  const best = result ? uciToSan(whatIfGame.fen(), result.bestmove) : "";
  const pv = result ? uciLineToSan(whatIfGame.fen(), result.pv, 4).join(" ") : "";
  line.textContent = best ? `Stockfish now prefers ${best}${pv ? ` · line: ${pv}` : ""}` : "";
}

function handleWhatIfSquare(square) {
  if (!whatIfGame || whatIfRunning) return;
  const piece = whatIfGame.get(square);
  if (!whatIfSelectedSquare) {
    if (piece?.color === whatIfGame.turn()) {
      whatIfSelectedSquare = square;
      renderBoard();
    }
    return;
  }
  if (piece?.color === whatIfGame.turn()) {
    whatIfSelectedSquare = square;
    renderBoard();
    return;
  }
  const move = whatIfGame.moves({ square: whatIfSelectedSquare, verbose: true }).find((candidate) => candidate.to === square);
  if (!move) {
    whatIfSelectedSquare = "";
    renderBoard();
    return;
  }
  const beforeScore = whatIfBaseline?.result?.score || evaluationAtPly(entries, whatIfStartPly)?.score;
  let before = whatIfBaseline;
  if (!before && beforeScore) {
    before = { fen: positions[whatIfStartPly] || whatIfGame.fen(), result: { score: beforeScore, bestmove: "" } };
  }
  const played = whatIfGame.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  whatIfSelectedSquare = "";
  whatIfLastMove = { move: played, rating: null, previousScore: beforeScore };
  renderBoard();
  renderWhatIfPanel();
  renderAdvantage();
  analyzeWhatIfPosition(before, played);
}

async function analyzeWhatIfPosition(previous = null, played = null) {
  if (!whatIfGame) return;
  const request = ++whatIfRequest;
  const fen = whatIfGame.fen();
  whatIfError = "";
  whatIfRunning = true;
  renderWhatIfPanel();
  renderAdvantage();
  let engine;
  try {
    engine = new UciEngine(new Worker(chrome.runtime.getURL("vendor/stockfish/stockfish-19-lite-single.js")));
    await engine.start();
    const result = await engine.analyze(fen, 12);
    if (request !== whatIfRequest || !whatIfGame || whatIfGame.fen() !== fen) return;
    const rating = previous?.result && played
      ? classifyPlayedMove({ beforeScore: previous.result.score, afterScore: result.score, turn: played.color, actualSan: played.san, bestSan: uciToSan(previous.fen, previous.result.bestmove), checkmatedOpponent: whatIfGame.isCheckmate() })
      : null;
    whatIfBaseline = { fen, result };
    if (played) {
      whatIfLastMove = {
        move: played,
        rating,
        previousScore: previous?.result?.score || whatIfLastMove?.previousScore
      };
    }
  } catch (error) {
    if (request === whatIfRequest) {
      whatIfBaseline = null;
      whatIfLastMove = { move: played || whatIfLastMove?.move, rating: null, previousScore: previous?.result?.score };
      whatIfError = error.message;
    }
  } finally {
    engine?.stop();
    if (request === whatIfRequest) {
      whatIfRunning = false;
      renderBoard();
      renderWhatIfPanel();
      renderAdvantage();
    }
  }
}

function playMoveCue(ply) {
  if (!moveSoundsEnabled || gameLocked || document.hidden || ply < 1) return;
  const entry = entries[ply - 1];
  const cue = entry?.checkmate ? "mate" : entry?.category === "blunder" ? "blunder" : null;
  if (!cue) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      $("#sound-status").textContent = "Move sounds are not supported by this browser.";
      return;
    }
    soundContext ||= new AudioContextClass();
    const now = soundContext.currentTime;
    const notes = cue === "mate"
      ? [{ frequency: 523.25, start: 0, duration: 0.24 }, { frequency: 659.25, start: 0.09, duration: 0.28 }, { frequency: 783.99, start: 0.18, duration: 0.42 }]
      : [{ frequency: 190, start: 0, duration: 0.12 }, { frequency: 142, start: 0.13, duration: 0.16 }];
    for (const note of notes) {
      const oscillator = soundContext.createOscillator();
      const volume = soundContext.createGain();
      oscillator.type = cue === "mate" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
      volume.gain.setValueAtTime(0.0001, now + note.start);
      volume.gain.exponentialRampToValueAtTime(cue === "mate" ? 0.035 : 0.045, now + note.start + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      oscillator.connect(volume);
      volume.connect(soundContext.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.01);
    }
    $("#sound-status").textContent = cue === "mate" ? "Checkmate sound played." : "Blunder sound played.";
  } catch (error) {
    $("#sound-status").textContent = `Move sound could not play: ${error.message}`;
  }
}

function renderMoveList(analysis) {
  const list = $("#move-list");
  const cells = [];
  for (let index = 0; index < gameHistory.length; index += 2) {
    const number = document.createElement("span");
    number.className = "move-number";
    number.textContent = `${Math.floor(index / 2) + 1}.`;
    cells.push(number);
    for (const offset of [0, 1]) {
      const entry = analysis[index + offset];
      const cell = document.createElement("div");
      cell.className = "move-cell";
      if (entry) {
        const move = document.createElement("button");
        move.className = "move-token";
        move.type = "button";
        move.dataset.ply = String(entry.ply);
        move.dataset.category = entry.checkmate ? "checkmate" : entry.category || "good";
        move.setAttribute("aria-current", "false");
        const mark = moveMark(entry.category, entry.checkmate);
        move.title = `${mark.label} move`;
        move.setAttribute("aria-label", `${gameHistory[index + offset].san}, ${mark.label}`);
        move.addEventListener("click", () => jumpToPly(entry.ply));
        const san = document.createElement("span");
        san.textContent = gameHistory[index + offset].san;
        move.append(san);
        const icon = document.createElement("span");
        icon.className = "move-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = mark.icon;
        move.append(icon);
        if (entry.checkmate) {
          const tag = document.createElement("span");
          tag.className = "move-tag";
          tag.textContent = "MATE";
          move.append(tag);
        }
        cell.append(move);
      }
      cells.push(cell);
    }
  }
  list.replaceChildren(...cells);
  jumpToPly(selectedPly);
}

function renderFindings(analysis) {
  const notable = analysis.filter((entry) => ["blunder", "mistake", "inaccuracy", "excellent", "best"].includes(entry.category)).sort((a, b) => b.loss - a.loss);
  const chosen = notable.slice(0, 16).sort((a, b) => a.ply - b.ply);
  $("#finding-count").textContent = `${analysis.length} moves reviewed · ${notable.length} noteworthy`;
  if (!chosen.length) {
    findingsElement.innerHTML = '<p class="empty-state">No big swings this time. A quietly solid game — Stockfish had very little to complain about.</p>';
    return;
  }
  findingsElement.replaceChildren(...chosen.map((entry) => {
    const row = document.createElement("article");
    row.className = "finding";
    const move = document.createElement("div");
    move.className = "move-label";
    move.textContent = moveNumber(entry);
    const copy = document.createElement("div");
    const title = document.createElement("p");
    title.className = "finding-title";
    title.textContent = entry.checkmate ? "Checkmate" : ({
      best: "Engine’s top choice",
      excellent: "Great move",
      inaccuracy: "An inaccuracy",
      mistake: "A mistake",
      blunder: "A blunder"
    }[entry.category] || "A strong moment");
    const description = document.createElement("p");
    description.className = "finding-copy";
    description.textContent = humanNote(entry);
    copy.append(title, description);
    const badge = document.createElement("span");
    badge.className = "finding-tag";
    badge.textContent = entry.category;
    row.append(move, copy, badge);
    return row;
  }));
}

function renderMoveSummary(analysis) {
  const summary = $("#move-summary");

  const whiteAcc = playerAccuracy(analysis, "w");
  const blackAcc = playerAccuracy(analysis, "b");

  if (whiteAcc != null) {
    const el = $("#white-acc-val");
    if (el) el.textContent = `${whiteAcc}%`;
    const badge = $("#white-accuracy-badge");
    if (badge) badge.hidden = false;
  }
  if (blackAcc != null) {
    const el = $("#black-acc-val");
    if (el) el.textContent = `${blackAcc}%`;
    const badge = $("#black-accuracy-badge");
    if (badge) badge.hidden = false;
  }

  const whiteMoves = analysis.filter((entry) => entry.turn === "w");
  const blackMoves = analysis.filter((entry) => entry.turn === "b");

  const countCat = (moves, cat) => moves.filter((e) => e.category === cat).length;
  const countMissed = (moves) => moves.filter((e) => ["inaccuracy", "mistake", "blunder"].includes(e.category)).length;

  const rows = [
    { label: "Brilliant", icon: "✧", cat: "brilliant", white: "—", black: "—" },
    { label: "Great", icon: "✦", cat: "excellent", white: countCat(whiteMoves, "excellent"), black: countCat(blackMoves, "excellent") },
    { label: "Best", icon: "✓", cat: "best", white: countCat(whiteMoves, "best"), black: countCat(blackMoves, "best") },
    { label: "Good", icon: "·", cat: "good", white: countCat(whiteMoves, "good"), black: countCat(blackMoves, "good") },
    { label: "Inaccuracies", icon: "?!", cat: "inaccuracy", white: countCat(whiteMoves, "inaccuracy"), black: countCat(blackMoves, "inaccuracy") },
    { label: "Mistakes", icon: "!", cat: "mistake", white: countCat(whiteMoves, "mistake"), black: countCat(blackMoves, "mistake") },
    { label: "Blunders", icon: "‼", cat: "blunder", white: countCat(whiteMoves, "blunder"), black: countCat(blackMoves, "blunder") },
    { label: "Misses", icon: "×", cat: "miss", white: countMissed(whiteMoves), black: countMissed(blackMoves) }
  ];

  const table = document.createElement("div");
  table.className = "breakdown-table";
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Move classification breakdown for White and Black");

  const header = document.createElement("div");
  header.className = "breakdown-row breakdown-header";
  header.setAttribute("role", "row");
  header.innerHTML = `
    <span class="col-side col-white" role="columnheader">WHITE ${whiteAcc != null ? `<strong>${whiteAcc}%</strong>` : ""}</span>
    <span class="col-category" role="columnheader">MOVE QUALITY</span>
    <span class="col-side col-black" role="columnheader">BLACK ${blackAcc != null ? `<strong>${blackAcc}%</strong>` : ""}</span>
  `;
  table.append(header);

  for (const row of rows) {
    const tr = document.createElement("div");
    tr.className = `breakdown-row row-${row.cat}`;
    tr.setAttribute("role", "row");

    const wCol = document.createElement("span");
    wCol.className = "col-side col-white-val";
    wCol.setAttribute("role", "cell");
    wCol.textContent = String(row.white);

    const catCol = document.createElement("span");
    catCol.className = "col-category-val";
    catCol.setAttribute("role", "cell");
    catCol.innerHTML = `<span class="cat-icon cat-${row.cat}">${row.icon}</span> <span class="cat-label">${row.label}</span>`;

    const bCol = document.createElement("span");
    bCol.className = "col-side col-black-val";
    bCol.setAttribute("role", "cell");
    bCol.textContent = String(row.black);

    tr.append(wCol, catCol, bCol);
    table.append(tr);
  }

  const note = document.createElement("p");
  note.className = "summary-note";
  note.textContent = "Accuracy is computed on standard logarithmic centipawn loss (CAPS). Misses include inaccuracies, mistakes, and blunders.";

  summary.replaceChildren(table, note);
  summary.hidden = false;
}

function renderAdvantage() {
  const panel = $("#advantage-panel");
  panel.hidden = gameLocked;
  if (gameLocked) return;

  const label = $("#advantage-evaluation");
  const track = $("#advantage-track");
  const fill = $("#advantage-white");
  const swing = $("#advantage-swing");

  // If in free play mode
  if (whatIfGame) {
    track.dataset.state = "ready";

    if (whatIfGame.isCheckmate()) {
      const winner = whatIfGame.turn() === "w" ? "Black" : "White";
      label.textContent = `${winner} wins · checkmate`;
      fill.style.transform = `scaleX(${winner === "White" ? 0.97 : 0.03})`;
      fill.dataset.leader = winner.toLowerCase();
      track.setAttribute("aria-label", `${winner} wins by checkmate`);
      swing.textContent = `${whatIfLastMove?.move?.san || "Move"} delivers checkmate.`;
      return;
    }

    if (whatIfGame.isDraw()) {
      label.textContent = "Draw · 0.0";
      fill.style.transform = "scaleX(0.5)";
      fill.dataset.leader = "even";
      track.setAttribute("aria-label", "Drawn position");
      swing.textContent = "Position is a draw.";
      return;
    }

    const currentScore = whatIfBaseline?.result?.score;
    if (currentScore) {
      const score = whiteScore(currentScore, currentScore.turn);
      const share = whiteAdvantageShare(currentScore);
      const evaluation = formatEvaluation(currentScore);
      label.textContent = evaluation;
      fill.style.transform = `scaleX(${share})`;
      fill.dataset.leader = score > 0 ? "white" : score < 0 ? "black" : "even";
      track.setAttribute("aria-label", `${evaluation}. White advantage scale at ${Math.round(share * 100)} percent.`);

      if (whatIfLastMove?.previousScore) {
        const moveSwing = (currentScore.type !== "mate" && whatIfLastMove.previousScore.type !== "mate")
          ? whiteScore(currentScore, currentScore.turn) - whiteScore(whatIfLastMove.previousScore, whatIfLastMove.previousScore.turn)
          : null;
        swing.textContent = formatEvaluationSwing(moveSwing, whatIfLastMove.previousScore, currentScore);
      } else {
        swing.textContent = `Alternate line · ${whatIfGame.history().length} move${whatIfGame.history().length === 1 ? "" : "s"} explored.`;
      }
      return;
    }

    if (whatIfRunning) {
      label.textContent = "Stockfish thinking…";
      track.dataset.state = "waiting";
      swing.textContent = whatIfLastMove?.move?.san
        ? `Evaluating ${whatIfLastMove.move.san} with Stockfish…`
        : "Evaluating alternate position…";
      return;
    }

    const baseEntry = evaluationAtPly(entries, whatIfStartPly);
    if (baseEntry?.score) {
      const score = whiteScore(baseEntry.score, baseEntry.score.turn);
      const share = whiteAdvantageShare(baseEntry.score);
      const evaluation = formatEvaluation(baseEntry.score);
      label.textContent = evaluation;
      fill.style.transform = `scaleX(${share})`;
      fill.dataset.leader = score > 0 ? "white" : score < 0 ? "black" : "even";
      track.setAttribute("aria-label", `${evaluation}. White advantage scale at ${Math.round(share * 100)} percent.`);
      swing.textContent = "Exploring alternative moves from this position.";
      return;
    }

    label.textContent = "Not analyzed yet";
    track.dataset.state = "waiting";
    fill.style.transform = "scaleX(0.5)";
    fill.dataset.leader = "even";
    swing.textContent = "Make a move on the board to see Stockfish's evaluation.";
    return;
  }

  // Normal mainline review mode:
  const position = evaluationAtPly(entries, selectedPly);
  if (!ready || !position) {
    label.textContent = "Not analyzed yet";
    track.dataset.state = "waiting";
    track.setAttribute("aria-label", "Position advantage is not yet available.");
    fill.style.transform = "scaleX(0)";
    swing.textContent = pgnValid
      ? "Select Analyze with Stockfish to see the evaluation and move-by-move change."
      : "Load a completed PGN, then select Analyze with Stockfish to see the evaluation and move-by-move change.";
    return;
  }

  track.dataset.state = "ready";

  if (position.checkmate) {
    const winner = position.entry.turn === "w" ? "White" : "Black";
    label.textContent = `${winner} wins · checkmate`;
    fill.style.transform = `scaleX(${winner === "White" ? 0.97 : 0.03})`;
    fill.dataset.leader = winner.toLowerCase();
    track.setAttribute("aria-label", `${winner} wins by checkmate`);
    swing.textContent = "The game ends here.";
    return;
  }

  if (!position.score) {
    label.textContent = "Evaluation unavailable";
    fill.style.transform = "scaleX(.5)";
    fill.dataset.leader = "even";
    track.setAttribute("aria-label", "Stockfish did not return an evaluation for this position.");
    swing.textContent = "No evaluation change is available for this position.";
    return;
  }

  const score = whiteScore(position.score, position.score.turn);
  const share = whiteAdvantageShare(position.score);
  const evaluation = formatEvaluation(position.score);
  label.textContent = evaluation;
  fill.style.transform = `scaleX(${share})`;
  fill.dataset.leader = score > 0 ? "white" : score < 0 ? "black" : "even";
  track.setAttribute("aria-label", `${evaluation}. White advantage scale at ${Math.round(share * 100)} percent.`);
  swing.textContent = selectedPly === 0
    ? "Starting position."
    : formatEvaluationSwing(position.swing, position.beforeScore, position.score);
}

async function analyzeGame() {
  errorMessage.hidden = true;
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Reviewing the game…";
  analysisRunning = true;
  analyzeButton.classList.add("is-loading");
  analyzeButton.setAttribute("aria-busy", "true");
  applyGate();
  progressRegion.hidden = false;
  setProgress("Loading the local engine pool…", 0, 0);

  const depth = Number($("#engine-depth-select")?.value) || 12;
  await chrome.storage.local.set({ analysisDepth: depth }).catch(() => {});

  const poolSize = getOptimalPoolSize();
  let pool;
  try {
    const parsed = new Chess();
    parsed.loadPgn(pgn);
    const history = parsed.history({ verbose: true });
    if (!history.length) throw new Error("This PGN contains no playable moves.");
    if (history.length > 250) throw new Error("This game is unusually long. Import a single completed game (250 plies or fewer).");
    await ensureUnlocked();

    setProgress(`Starting ${poolSize} parallel engine workers…`, 0, 1);
    pool = new EnginePool(poolSize);
    activeEngine = pool;
    await pool.start();

    const replayPre = new Chess();
    const fensToAnalyze = [replayPre.fen()];
    let checkmatePly = null;
    for (let i = 0; i < history.length; i++) {
      replayPre.move({ from: history[i].from, to: history[i].to, promotion: history[i].promotion });
      if (replayPre.isCheckmate()) {
        checkmatePly = i + 1;
        break;
      }
      fensToAnalyze.push(replayPre.fen());
    }

    setProgress(`Analyzing moves (depth ${depth}) across ${poolSize} workers…`, 0, fensToAnalyze.length);

    const evaluations = await dispatchParallelTasks(
      fensToAnalyze,
      pool.engines,
      async (workerEngine, fen) => {
        await ensureUnlocked();
        return workerEngine.analyze(fen, depth);
      },
      (done, total) => {
        setProgress(`Evaluated ${done} of ${total} positions (depth ${depth})…`, done, total);
      }
    );

    const replayGame = new Chess();
    const result = [];
    const limit = checkmatePly !== null ? checkmatePly : history.length;
    for (let index = 0; index < limit; index += 1) {
      const playedMove = history[index];
      const fen = replayGame.fen();
      const turn = replayGame.turn();
      const before = evaluations[index];
      const bestSan = uciToSan(fen, before.bestmove);
      const bestLine = uciLineToSan(fen, before.pv);
      const actual = replayGame.move({ from: playedMove.from, to: playedMove.to, promotion: playedMove.promotion });
      const checkmate = replayGame.isCheckmate();
      if (checkmate) {
        const classification = classifyPlayedMove({
          beforeScore: before.score,
          turn,
          actualSan: actual.san,
          bestSan,
          checkmatedOpponent: true
        });
        result.push({
          ply: index + 1,
          turn,
          actualSan: actual.san,
          bestSan,
          bestMove: before.bestmove,
          bestLine,
          bestPv: before.pv || [],
          consequenceLine: [],
          ...classification,
          checkmate: true,
          beforeScore: before.score,
          afterScore: null
        });
        break;
      }
      const after = evaluations[index + 1];
      const { loss, category } = classifyPlayedMove({
        beforeScore: before.score,
        afterScore: after.score,
        turn,
        actualSan: actual.san,
        bestSan
      });
      result.push({
        ply: index + 1,
        turn,
        actualSan: actual.san,
        bestSan,
        bestMove: before.bestmove,
        bestLine,
        bestPv: before.pv || [],
        consequenceLine: uciLineToSan(replayGame.fen(), after.pv),
        loss: Math.round(loss),
        category,
        checkmate: false,
        beforeScore: before.score,
        afterScore: after.score
      });
    }

    entries.splice(0, entries.length, ...result);
    gameHistory = history.slice(0, result.length);
    positions.splice(0, positions.length, new Chess().fen());
    const replayPositions = new Chess();
    for (const move of gameHistory) {
      replayPositions.move({ from: move.from, to: move.to, promotion: move.promotion });
      positions.push(replayPositions.fen());
    }
    renderMoveList(result);
    renderFindings(result);
    ready = true;
    renderMoveSummary(result);
    renderAdvantage();
    renderSelectedMovePanel();
    setProgress("Review complete.", result.length, result.length);
    updateCoachSettingsStatus().catch(() => {});
    $("#review-title").textContent = "Here’s what happened.";
    $("#review-summary").textContent = `${result.length} half-moves reviewed at depth ${depth} across ${poolSize} parallel engine workers.`;
    analyzeButton.textContent = "Analysis complete";
  } catch (error) {
    if (!gameLocked) {
      errorMessage.textContent = error.message.includes("Failed to construct")
        ? "Stockfish is missing. From the project folder, run `npm run setup:engine`, then `npm run build` and reload the unpacked extension."
        : `Review could not finish: ${error.message}`;
      errorMessage.hidden = false;
      analyzeButton.textContent = "Try analysis again";
    }
  } finally {
    pool?.stop();
    if (activeEngine === pool) activeEngine = null;
    analysisRunning = false;
    analyzeButton.classList.remove("is-loading");
    analyzeButton.removeAttribute("aria-busy");
    applyGate();
  }
}

async function ensureUnlocked() {
  const state = await chrome.storage.local.get(["recording"]);
  if (state.recording || gameLocked) throw new Error("Analysis is locked until the active game ends.");
}

function aiContext(focusEntry = null) {
  return {
    pgn,
    findings: entries.map(({ ply, turn, actualSan, bestSan, loss, category }) => ({
      ply, side: turn === "w" ? "White" : "Black", played: actualSan, engineChoice: bestSan, centipawnSwing: loss, label: category
    })),
    selectedMove: focusEntry ? {
      ply: focusEntry.ply,
      notation: moveNumber(focusEntry),
      played: focusEntry.actualSan,
      engineChoice: focusEntry.bestSan,
      centipawnSwing: focusEntry.loss,
      label: moveMark(focusEntry.category, focusEntry.checkmate).label,
      explanation: tacticalExplanation(focusEntry),
      bestLine: focusEntry.bestLine,
      consequenceLine: focusEntry.consequenceLine
    } : null
  };
}

async function askCoach(question, focusEntry = null) {
  await ensureUnlocked();
  if (!ready) throw new Error("Run Stockfish analysis before asking the coach.");
  const settings = await chrome.storage.local.get(["aiEnabled", "aiKey", "aiModel", "aiProvider"]);
  if (!settings.aiEnabled || !settings.aiKey) {
    if (focusEntry) {
      if (focusEntry.category === "best") return `${moveNumber(focusEntry)} matches Stockfish’s top choice at depth 10. The engine confirms the move, but it can’t know the thought behind it.`;
        return tacticalExplanation(focusEntry);
    }
    const moveNumberMatch = question.match(/\b(\d+)\s*\.{1,3}/);
    const requestedNumber = moveNumberMatch ? Number(moveNumberMatch[1]) : null;
    const requestsBlack = Boolean(question.match(/\b\d+\s*\.{2,3}/));
    const key = entries
      .filter((entry) => entry.category)
      .find((entry) => requestedNumber === null
        || (Math.ceil(entry.ply / 2) === requestedNumber && (!requestsBlack || entry.turn === "b")))
      || entries.filter((entry) => entry.category).sort((a, b) => b.loss - a.loss)[0];
    return key
      ? humanNote(key)
      : "No major engine swing stood out in this game. Enable AI in the extension settings for a free-form discussion of your plans.";
  }
  if (!ready) throw new Error("Run Stockfish analysis before asking the AI coach.");

  $("#coach-privacy").textContent = "You asked for AI coaching: this completed PGN and its engine findings are being sent to OpenAI.";
  aiRequestController = new AbortController();
  const prompt = `Question: ${question}\n\nCompleted game and engine findings:\n${JSON.stringify(aiContext(focusEntry))}`;
  const system = "You are a kind chess coach. This is a completed game only. For a weak move, name the concrete opponent reply from consequenceLine and explain the immediate threat; contrast it with bestLine. Do not invent lines not supplied.";
  const google = settings.aiProvider === "google";
  const model = settings.aiModel || (google ? "gemini-2.0-flash" : "gpt-4o-mini");
  const response = await fetch(google
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.aiKey)}`
    : "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(google ? {} : { "Authorization": `Bearer ${settings.aiKey}` })
    },
    body: JSON.stringify({
      ...(google ? { contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }], generationConfig: { temperature: 0.5 } } : { model, temperature: 0.5, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] })
    }),
    signal: aiRequestController.signal
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error?.message || `OpenAI returned ${response.status}. Check the key and model in extension settings.`);
  }
  const data = await response.json();
  return google ? (data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "The coach did not return a reply.") : (data.choices?.[0]?.message?.content || "The coach did not return a reply.");
}

function extractPgnHeaders(pgnText) {
  const headers = {};
  const regex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = regex.exec(pgnText)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

function renderMatchBanner(headers = {}) {
  const banner = $("#match-banner");
  if (!banner) return;
  const whiteName = headers.White || "White";
  const blackName = headers.Black || "Black";
  const whiteElo = headers.WhiteElo ? `(${headers.WhiteElo})` : "";
  const blackElo = headers.BlackElo ? `(${headers.BlackElo})` : "";
  const result = headers.Result || "*";
  const date = headers.Date || headers.UTCDate || "";

  const wNameEl = $("#player-white-name");
  const wEloEl = $("#player-white-elo");
  const bNameEl = $("#player-black-name");
  const bEloEl = $("#player-black-elo");
  const dateEl = $("#match-date");

  if (wNameEl) wNameEl.textContent = whiteName;
  if (wEloEl) wEloEl.textContent = whiteElo;
  if (bNameEl) bNameEl.textContent = blackName;
  if (bEloEl) bEloEl.textContent = blackElo;
  if (dateEl) dateEl.textContent = date && date !== "????.??.??" ? date : "";

  const badge = $("#match-result-badge");
  if (badge) {
    badge.className = "result-badge";
    if (result === "1-0") {
      badge.textContent = "1-0 · White wins";
      badge.classList.add("white-win");
    } else if (result === "0-1") {
      badge.textContent = "0-1 · Black wins";
      badge.classList.add("black-win");
    } else if (result === "1/2-1/2" || result === "½-½") {
      badge.textContent = "½-½ · Draw";
      badge.classList.add("draw");
    } else {
      badge.textContent = result !== "*" ? result : "VS";
    }
  }

  banner.hidden = false;
}

async function initialize() {
  const state = await chrome.storage.local.get(["reviewPgn", "recording", "moveSounds", "aiEnabled", "aiKey", "aiModel", "analysisDepth"]);
  pgn = state.reviewPgn || "";
  gameLocked = Boolean(state.recording);
  moveSoundsEnabled = state.moveSounds !== false;
  $("#move-sounds").checked = moveSoundsEnabled;
  $("#review-ai-enabled").checked = Boolean(state.aiEnabled);
  $("#review-ai-key").value = state.aiKey || "";
  $("#review-ai-model").value = state.aiModel || "gpt-4o-mini";
  if (state.analysisDepth) {
    const depthSelect = $("#engine-depth-select");
    if (depthSelect) depthSelect.value = String(state.analysisDepth);
  }
  await updateCoachSettingsStatus();
  $("#move-sounds").disabled = gameLocked;
  $("#flip-board").disabled = gameLocked;
  $("#pgn-display").value = pgn;
  if (!pgn) {
    $("#review-summary").textContent = "No game PGN was found. Open Aftermove and fetch a public game, record a Chess.com game, or paste a PGN.";
    analyzeButton.disabled = true;
    renderAdvantage();
    applyGate();
    return;
  }
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    gameHistory = game.history({ verbose: true });
    if (!gameHistory.length) throw new Error("No moves");
    positions.splice(0, positions.length, new Chess().fen());
    const replay = new Chess();
    for (const move of gameHistory) {
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      positions.push(replay.fen());
    }
    selectedPly = gameHistory.length;
    renderMatchBanner(extractPgnHeaders(pgn));
    renderBoard();
    pgnValid = true;
    renderSelectedMovePanel();
    $("#review-summary").textContent = `${gameHistory.length} half-moves ready for local Stockfish review.`;
    if (gameLocked) {
      $("#coach-privacy").textContent = "A game is in progress. Analysis and coaching are locked until its result is confirmed.";
      findingsElement.textContent = "Review is locked while a game is being recorded. Aftermove stays silent until the result.";
    }
  } catch (error) {
    errorMessage.textContent = `This PGN could not be read: ${error.message}`;
    errorMessage.hidden = false;
    analyzeButton.disabled = true;
  }
  renderAdvantage();
  applyGate();
}

analyzeButton.addEventListener("click", analyzeGame);
$("#engine-depth-select")?.addEventListener("change", async (event) => {
  const depth = Number(event.currentTarget.value) || 12;
  await chrome.storage.local.set({ analysisDepth: depth }).catch(() => {});
});
$("#previous-move").addEventListener("click", () => jumpToPly(adjacentPly(selectedPly, "ArrowLeft", gameHistory.length)));
$("#next-move").addEventListener("click", () => jumpToPly(adjacentPly(selectedPly, "ArrowRight", gameHistory.length)));
$("#prev-mistake")?.addEventListener("click", () => {
  const nextPly = adjacentMistakePly(selectedPly, "prev", entries);
  if (nextPly != null) jumpToPly(nextPly);
});
$("#next-mistake")?.addEventListener("click", () => {
  const nextPly = adjacentMistakePly(selectedPly, "next", entries);
  if (nextPly != null) jumpToPly(nextPly);
});
$("#flip-board").addEventListener("click", () => {
  boardFlipped = !boardFlipped;
  $("#flip-board").setAttribute("aria-pressed", String(boardFlipped));
  renderBoard();
});
$("#what-if-undo").addEventListener("click", () => {
  if (!whatIfGame || whatIfRunning || !whatIfGame.history().length) return;
  whatIfGame.undo();
  whatIfSelectedSquare = "";
  whatIfLastMove = null;
  whatIfBaseline = null;
  whatIfError = "";
  renderBoard();
  renderWhatIfPanel();
  renderAdvantage();
  analyzeWhatIfPosition();
});
$("#what-if-exit").addEventListener("click", () => {
  exitWhatIf();
  renderBoard();
  renderSelectedMovePanel();
  renderAdvantage();
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || gameLocked || whatIfGame) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return;
  if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? "next" : "prev";
    const nextPly = adjacentMistakePly(selectedPly, dir, entries);
    if (nextPly != null) jumpToPly(nextPly);
    return;
  }
  const nextPly = adjacentPly(selectedPly, event.key, gameHistory.length);
  if (nextPly === selectedPly) return;
  event.preventDefault();
  jumpToPly(nextPly);
});
$("#move-sounds").addEventListener("change", async (event) => {
  moveSoundsEnabled = event.currentTarget.checked;
  try {
    await chrome.storage.local.set({ moveSounds: moveSoundsEnabled });
    $("#sound-status").textContent = moveSoundsEnabled ? "Move sounds on." : "Move sounds off.";
  } catch (error) {
    moveSoundsEnabled = !moveSoundsEnabled;
    event.currentTarget.checked = moveSoundsEnabled;
    $("#sound-status").textContent = `Could not save sound preference: ${error.message}`;
  }
});
$("#coach-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = $("#coach-question").value.trim();
  if (!question) return;
  const button = $("#coach-button");
  button.disabled = true;
  $("#coach-answer").textContent = "Thinking through the finished game…";
  try {
    const answer = await askCoach(question);
    if (!gameLocked) $("#coach-answer").textContent = answer;
  } catch (error) {
    if (!gameLocked) $("#coach-answer").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#review-ai-key").addEventListener("input", (event) => {
  if (event.currentTarget.value.trim()) $("#review-ai-enabled").checked = true;
});

$("#review-save-ai").addEventListener("click", async () => {
  const key = $("#review-ai-key").value.trim();
  await chrome.storage.local.set({
    aiEnabled: $("#review-ai-enabled").checked && Boolean(key),
    aiKey: key,
    aiModel: $("#review-ai-model").value.trim() || "gpt-4o-mini"
  });
  await updateCoachSettingsStatus();
});

initialize().catch((error) => {
  errorMessage.textContent = `Could not open this game: ${error.message}`;
  errorMessage.hidden = false;
});
