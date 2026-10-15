import { Chess } from "chess.js";
import { localGameEndResult } from "./src/game-end.js";
import { terminalResultFromTexts } from "./src/terminal-result.js";

(() => {
  if (window.__aftermoveObserverInstalled) return;
  window.__aftermoveObserverInstalled = true;

  const moveSelectorGroups = [
    ".node[data-ply]",
    ".main-line-ply",
    ".move-text-component"
  ];
  const figurines = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": "" };
  let observer;
  let scanTimer;
  let game;
  let active = false;
  let finalizing = false;
  let captureComplete = false;
  let lastMoveKey = "";

  function moveNodes() {
    for (const selector of moveSelectorGroups) {
      const nodes = [...document.querySelectorAll(selector)];
      if (nodes.length) return nodes;
    }
    return [];
  }

  function moveText(node) {
    const sources = [node, ...node.querySelectorAll("[data-san], [data-move], [data-uci], [aria-label]")];
    for (const source of sources) {
      const value = source.getAttribute("data-san")
        || source.getAttribute("data-move")
        || source.getAttribute("data-uci")
        || source.textContent
        || source.getAttribute("aria-label");
      if (value?.trim()) return value.trim().replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, (piece) => figurines[piece]);
    }
    return "";
  }

  function sanCandidates(value) {
    const cleaned = value
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/[!?]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.match(/(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)/g) || [];
  }

  function normalizeSan(value) {
    return value.replace(/0/g, "O").replace(/[+#]$/, "");
  }

  function captureMoves() {
    if (!game || finalizing) return false;
    const nodes = moveNodes();
    if (!nodes.length) {
      captureComplete = false;
      return false;
    }
    const ordered = nodes.map((node, index) => ({
      node,
      index,
      ply: Number(node.getAttribute("data-ply") || node.closest("[data-ply]")?.getAttribute("data-ply"))
    })).sort((a, b) => Number.isFinite(a.ply) && Number.isFinite(b.ply) ? a.ply - b.ply : a.index - b.index);
    const next = new Chess();
    let captured = 0;

    for (const { node } of ordered) {
      const value = moveText(node);
      const uci = value.match(/\b([a-h][1-8])([a-h][1-8])([qrbn])?\b/i);
      if (uci) {
        const from = uci[1].toLowerCase();
        const to = uci[2].toLowerCase();
        const promotion = uci[3]?.toLowerCase();
        const move = next.moves({ verbose: true }).find((legal) =>
          legal.from === from && legal.to === to && legal.promotion === promotion
        );
        if (move) {
          next.move(move.san);
          captured += 1;
          continue;
        }
      }
      const candidates = sanCandidates(value);
      let matched = false;
      for (const candidate of candidates) {
        const san = next.moves().find((legal) => normalizeSan(legal) === normalizeSan(candidate));
        if (!san) continue;
        next.move(san);
        captured += 1;
        matched = true;
        break;
      }
      if (!matched) break;
    }

    captureComplete = captured === ordered.length;
    if (captureComplete) {
      game = next;
      lastMoveKey = game.history().join(" ");
    }
    return captureComplete;
  }

  function terminalResult() {
    const selectors = [
      ".game-over-modal-content",
      ".game-over-modal",
      ".game-over-message",
      ".game-result",
      ".board-layout-game-result",
      '[data-cy="game-over"]',
      '[data-testid="game-over"]',
      '[data-testid="game-result"]'
    ];
    const texts = [...document.querySelectorAll(selectors.join(","))]
      .filter((element) => element.getClientRects().length)
      .map((element) => element.innerText || element.textContent || "");
    return terminalResultFromTexts(texts);
  }

  function makePgn(result) {
    game.header("Event", "Chess.com game");
    game.header("Site", "Chess.com");
    game.header("Date", new Date().toISOString().slice(0, 10).replaceAll("-", "."));
    game.header("Result", result);
    return game.pgn({ maxWidth: 80 });
  }

  function finishIfConfirmed() {
    if (!active || finalizing) return false;
    if (!captureMoves() || !captureComplete) return false;
    const localEnd = localGameEndResult(game);
    const result = localEnd?.result || terminalResult();
    if (!result || !game.history().length) return false;
    finalizing = true;
    active = false;
    observer?.disconnect();
    clearTimeout(scanTimer);
    const pgn = makePgn(result);
    chrome.runtime.sendMessage({ type: "GAME_CAPTURED", pgn });
    return true;
  }

  function beginRecording(tabId) {
    game = new Chess();
    active = true;
    finalizing = false;
    captureComplete = false;
    captureMoves();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    return chrome.storage.local.set({ recording: true, recordingTabId: tabId })
      .then(() => finishIfConfirmed());
  }

  function scheduleScan() {
    if (!active || finalizing) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      captureMoves();
      const currentKey = game?.history().join(" ") || "";
      if (currentKey !== lastMoveKey) lastMoveKey = currentKey;
      finishIfConfirmed();
    }, 250);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "START_RECORDING") {
      if (active) {
        sendResponse({ ok: true });
        return false;
      }
      chrome.storage.local.get(["recording", "recordingTabId"]).then((state) => {
        if (state.recording && state.recordingTabId !== message.tabId) {
          sendResponse({ ok: false, error: "Another Chess.com tab is already being recorded." });
          return;
        }
        beginRecording(message.tabId)
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
      }).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "CHECK_GAME_END") {
      captureMoves();
      const movesCaptured = captureComplete;
      const finished = finishIfConfirmed();
      const error = !movesCaptured
        ? "Chess.com’s full move list is not detected yet. Keep the game tab open and try again after its moves appear."
        : "The moves are captured, but Chess.com’s finished-game result is not visible yet. Recording stays locked until a result appears.";
      sendResponse({ ok: finished, error: finished ? undefined : error });
      return false;
    }
    if (message?.type === "STOP_RECORDING") {
      active = false;
      finalizing = false;
      observer?.disconnect();
      clearTimeout(scanTimer);
      game = null;
      captureComplete = false;
      lastMoveKey = "";
      sendResponse({ ok: true });
      return false;
    }
  });

  chrome.runtime.sendMessage({ type: "CHECK_RECORDING" }, (state) => {
    if (state?.recording && state.sameTab) {
      beginRecording(state.tabId).catch((error) => console.error("Could not resume the silent recording.", error));
    }
  });
})();
