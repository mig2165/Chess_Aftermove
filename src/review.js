import { Chess } from "chess.js";
import { evaluationAtPly, formatEvaluation, formatEvaluationSwing, whiteAdvantageShare } from "./advantage.js";
import { boardPoint, displaySquare } from "./board-view.js";
import { adjacentPly, classifyPlayedMove, moveMark, scoreFromInfo, whiteScore } from "./engine-logic.js";

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
let boardFlipped = false;

function applyGate() {
  analyzeButton.disabled = gameLocked || !pgnValid || ready || analysisRunning;
  $("#coach-button").disabled = gameLocked || !pgnValid || !ready;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.moveSounds) {
    moveSoundsEnabled = changes.moveSounds.newValue !== false;
    $("#move-sounds").checked = moveSoundsEnabled;
  }
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

function renderBoard() {
  const boardElement = $("#chessboard");
  const selectedEntry = entries[selectedPly - 1];
  const showBestPosition = bestMoveVisible && Boolean(selectedEntry?.bestMove);
  const positionIndex = showBestPosition ? selectedPly - 1 : selectedPly;
  const position = new Chess(positions[positionIndex] || new Chess().fen());
  const board = position.board();
  const playedMove = gameHistory[selectedPly - 1];
  const bestMove = showBestPosition ? selectedEntry.bestMove : null;
  const cells = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const displayed = displaySquare(row, column, boardFlipped);
      const piece = board[displayed.row][displayed.column];
      const square = displayed.name;
      const cell = document.createElement("div");
      cell.className = `square ${(displayed.row + displayed.column) % 2 ? "dark" : "light"}`;
      const highlightedMove = showBestPosition ? null : playedMove;
      if (highlightedMove?.from === square) cell.classList.add("last-from");
      if (highlightedMove?.to === square) cell.classList.add("last-to");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${pieceName[piece.type]}` : ""}${highlightedMove?.to === square ? ", move destination" : ""}`);
      cell.textContent = piece ? pieceGlyph[piece.color + piece.type] : "";
      if (!showBestPosition && playedMove?.to === square && selectedEntry) {
        const badge = document.createElement("span");
        badge.className = "square-quality";
        badge.dataset.category = selectedEntry.category || "good";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = moveMark(selectedEntry.category, selectedEntry.checkmate).icon;
        cell.append(badge);
      } else if (showBestPosition && bestMove.slice(2, 4) === square) {
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
  if (bestMove) appendBestArrow(boardElement, bestMove);
  boardElement.setAttribute("aria-label", `Chess position after the selected move, shown from ${boardFlipped ? "Black" : "White"}'s perspective`);
  $("#previous-move").disabled = gameLocked || selectedPly === 0;
  $("#next-move").disabled = gameLocked || selectedPly >= gameHistory.length;
  $("#move-position").textContent = selectedPly === 0
    ? "Start position"
    : showBestPosition
      ? `Best move for ${Math.ceil(selectedPly / 2)}${selectedPly % 2 ? "." : "..."} · before ${selectedEntry.actualSan}`
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
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("refX", "4");
  marker.setAttribute("refY", "2.5");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("orient", "auto");
  const head = document.createElementNS(svg.namespaceURI, "path");
  head.setAttribute("d", "M0,0 L5,2.5 L0,5 Z");
  head.setAttribute("fill", "#18230f");
  marker.append(head);
  defs.append(marker);
  const line = document.createElementNS(svg.namespaceURI, "path");
  line.setAttribute("d", `M ${boardPoint(from, boardFlipped)} L ${boardPoint(to, boardFlipped)}`);
  line.setAttribute("marker-end", "url(#best-arrowhead)");
  svg.append(defs, line);
  boardElement.append(svg);
}

function jumpToPly(ply) {
  if (gameLocked) return;
  const previousPly = selectedPly;
  selectedPly = Math.max(0, Math.min(gameHistory.length, ply));
  for (const button of $("#move-list").querySelectorAll(".move-token")) {
    button.setAttribute("aria-current", Number(button.dataset.ply) === selectedPly ? "true" : "false");
  }
  bestMoveVisible = false;
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
    placeholder.textContent = "Analyze the completed game to see move ratings and engine alternatives.";
    panel.append(placeholder);
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

  const actions = document.createElement("div");
  actions.className = "move-panel-actions";
  const bestButton = document.createElement("button");
  bestButton.className = "move-panel-best";
  bestButton.type = "button";
  bestButton.disabled = !entry.bestMove || entry.checkmate;
  bestButton.textContent = bestMoveVisible ? "Hide best move" : entry.bestSan ? `Show best: ${entry.bestSan}` : "Best move unavailable";
  bestButton.addEventListener("click", () => {
    bestMoveVisible = !bestMoveVisible;
    renderBoard();
    renderSelectedMovePanel();
  });
  actions.append(bestButton);

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
  const counts = Object.fromEntries(["brilliant", "best", "excellent", "good", "inaccuracy", "mistake", "blunder"].map((category) => [
    category,
    analysis.filter((entry) => entry.category === category).length
  ]));
  const missed = counts.inaccuracy + counts.mistake + counts.blunder;
  const metrics = [
    ["Brilliant", "N/A", "not-assessed"],
    ["Great", counts.excellent, "excellent"],
    ["Best", counts.best, "best"],
    ["Good", counts.good, "good"],
    ["Inaccuracies", counts.inaccuracy, "inaccuracy"],
    ["Mistakes", counts.mistake, "mistake"],
    ["Blunders", counts.blunder, "blunder"],
    ["Misses", missed, "miss"]
  ];
  summary.replaceChildren();
  for (const [label, value, category] of metrics) {
    const item = document.createElement("span");
    item.className = "summary-stat";
    item.dataset.category = category;
    const count = document.createElement("strong");
    count.textContent = String(value);
    item.append(count, document.createTextNode(` ${label}`));
    summary.append(item);
  }
  const note = document.createElement("p");
  note.className = "summary-note";
  note.textContent = "Misses = inaccuracies + mistakes + blunders. Brilliant moves need deeper sacrifice analysis, so they aren’t guessed here.";
  summary.append(note);
  summary.hidden = false;
}

function renderAdvantage() {
  const panel = $("#advantage-panel");
  panel.hidden = gameLocked;
  if (gameLocked) return;

  const position = evaluationAtPly(entries, selectedPly);
  if (!ready || !position) {
    $("#advantage-evaluation").textContent = "Not analyzed yet";
    const track = $("#advantage-track");
    track.dataset.state = "waiting";
    track.setAttribute("aria-label", "Position advantage is not yet available.");
    $("#advantage-white").style.transform = "scaleX(0)";
    $("#advantage-swing").textContent = pgnValid
      ? "Select Analyze with Stockfish to see the evaluation and move-by-move change."
      : "Load a completed PGN, then select Analyze with Stockfish to see the evaluation and move-by-move change.";
    return;
  }

  const label = $("#advantage-evaluation");
  const track = $("#advantage-track");
  const fill = $("#advantage-white");
  const swing = $("#advantage-swing");
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
  setProgress("Loading the local engine…", 0, 0);
  let engine;
  try {
    const parsed = new Chess();
    parsed.loadPgn(pgn);
    const history = parsed.history({ verbose: true });
    if (!history.length) throw new Error("This PGN contains no playable moves.");
    if (history.length > 250) throw new Error("This game is unusually long. Import a single completed game (250 plies or fewer).");
    await ensureUnlocked();
    engine = new UciEngine(new Worker(chrome.runtime.getURL("vendor/stockfish/stockfish-19-lite-single.js")));
    activeEngine = engine;
    await engine.start();

    const replay = new Chess();
    let before = await engine.analyze(replay.fen());
    const result = [];
    for (let index = 0; index < history.length; index += 1) {
      await ensureUnlocked();
      const playedMove = history[index];
      const fen = replay.fen();
      const turn = replay.turn();
      const bestSan = uciToSan(fen, before.bestmove);
      const bestLine = uciLineToSan(fen, before.pv);
      const actual = replay.move({ from: playedMove.from, to: playedMove.to, promotion: playedMove.promotion });
      const checkmate = replay.isCheckmate();
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
          consequenceLine: [],
          ...classification,
          checkmate: true,
          beforeScore: before.score,
          afterScore: null
        });
        setProgress(`Reading move ${index + 1} of ${history.length}…`, index + 1, history.length);
        break;
      }
      const after = await engine.analyze(replay.fen());
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
        consequenceLine: uciLineToSan(replay.fen(), after.pv),
        loss: Math.round(loss),
        category,
        checkmate: false,
        beforeScore: before.score,
        afterScore: after.score
      });
      before = after;
      setProgress(`Reading move ${index + 1} of ${history.length}…`, index + 1, history.length);
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
    setProgress("Review complete.", history.length, history.length);
    $("#review-title").textContent = "Here’s what happened.";
    $("#review-summary").textContent = `${history.length} half-moves reviewed at depth 10 with Stockfish Lite. The engine did the counting; the coach did the translating.`;
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
    engine?.stop();
    if (activeEngine === engine) activeEngine = null;
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
  const settings = await chrome.storage.local.get(["aiEnabled", "aiKey", "aiModel"]);
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.aiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel || "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        {
          role: "system",
      content: "You are a kind, lightly witty chess coach. This is a completed game; never suggest or reveal live-game moves. Ground every chess claim in the supplied PGN and Stockfish findings. If a selectedMove is supplied, answer about that exact move and compare it with the engine's choice. For a weak move, do not stop at an evaluation label: name the concrete opponent reply or sequence from consequenceLine, explain the immediate tactical or positional threat it creates, and then contrast it with bestLine. If no concrete line is supplied, say so rather than inventing one. Explain strategic ideas only when supported by the position; otherwise say that the engine establishes the evaluation, not a definitive reason. Do not assume which color the user played unless the PGN or question identifies it. Explain the player's likely plan as a possibility, not a fact. Keep the answer concise, constructive, and specific. Stockfish is an engine, not proof of the player's intent."
        },
        {
          role: "user",
          content: `Question: ${question}\n\nCompleted game and engine findings:\n${JSON.stringify(aiContext(focusEntry))}`
        }
      ]
    }),
    signal: aiRequestController.signal
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error?.message || `OpenAI returned ${response.status}. Check the key and model in extension settings.`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "The coach did not return a reply.";
}

async function initialize() {
  const state = await chrome.storage.local.get(["reviewPgn", "recording", "moveSounds"]);
  pgn = state.reviewPgn || "";
  gameLocked = Boolean(state.recording);
  moveSoundsEnabled = state.moveSounds !== false;
  $("#move-sounds").checked = moveSoundsEnabled;
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
    renderBoard();
    pgnValid = true;
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
$("#previous-move").addEventListener("click", () => jumpToPly(adjacentPly(selectedPly, "ArrowLeft", gameHistory.length)));
$("#next-move").addEventListener("click", () => jumpToPly(adjacentPly(selectedPly, "ArrowRight", gameHistory.length)));
$("#flip-board").addEventListener("click", () => {
  boardFlipped = !boardFlipped;
  $("#flip-board").setAttribute("aria-pressed", String(boardFlipped));
  renderBoard();
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || gameLocked) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return;
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

initialize().catch((error) => {
  errorMessage.textContent = `Could not open this game: ${error.message}`;
  errorMessage.hidden = false;
});
