import { Chess } from "chess.js";
import { localGameEndResult } from "./src/game-end.js";
import { extractMoveTextFromNode, replayMoveTexts } from "./src/move-capture.js";
import { terminalResultFromTexts } from "./src/terminal-result.js";

(() => {
  if (window.__aftermoveObserverInstalled) return;
  window.__aftermoveObserverInstalled = true;

  let observer;
  let pollTimer;
  let scanTimer;
  let game;
  let active = false;
  let finalizing = false;
  let captureComplete = false;
  let lastMoveKey = "";
  let lastGameId = "";

  function collectRoots() {
    const roots = [document];
    const seenRoots = new Set(roots);
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of roots[index].querySelectorAll("*")) {
        if (element.shadowRoot && !seenRoots.has(element.shadowRoot)) {
          seenRoots.add(element.shadowRoot);
          roots.push(element.shadowRoot);
        }
      }
    }
    return roots;
  }

  function moveNodes() {
    const roots = collectRoots();

    // 1. Direct [data-ply] elements (the universal Chess.com half-move identifier)
    const plyElements = roots.flatMap((root) => [
      ...root.querySelectorAll("[data-ply]")
    ]).filter((el) => {
      const cls = String(el.className || "");
      if (cls.includes("board") || (cls.includes("row") && !cls.includes("node"))) {
        return false;
      }
      return true;
    });

    if (plyElements.length > 0) {
      const plyMap = new Map();
      for (const el of plyElements) {
        const ply = Number(el.getAttribute("data-ply"));
        if (!Number.isFinite(ply) || ply <= 0) continue;
        const current = plyMap.get(ply);
        const text = (el.textContent || "").trim();
        // Prefer element with more content (contains both figurine icon and move notation)
        if (!current || text.length >= (current.textContent || "").trim().length) {
          plyMap.set(ply, el);
        }
      }
      if (plyMap.size > 0) {
        return Array.from(plyMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([, el]) => el);
      }
    }

    // 2. Class-based and web-component-based move selectors
    const standardSelectors = [
      "vertical-move-list .node:not(.row), wc-vertical-move-list .node:not(.row)",
      ".vertical-move-list .node:not(.row), wc-simple-move-list .node",
      ".move-list .node:not(.row), [data-cy='move-list'] .node",
      "[data-node='mainline-ply'], [data-node='variation-ply']",
      ".move-text-component",
      "wc-simple-move",
      ".main-line-ply",
      ".move-node",
      ".node:not(.row):not([class*='board']):not([class*='piece'])"
    ];

    for (const sel of standardSelectors) {
      const nodes = roots.flatMap((root) => [...root.querySelectorAll(sel)]);
      if (nodes.length > 0) {
        return nodes;
      }
    }

    return [];
  }

  function captureMoves() {
    if (finalizing) return Boolean(game?.history().length);
    const nodes = moveNodes();
    if (!nodes.length) {
      captureComplete = false;
      return false;
    }

    const ordered = nodes
      .map((node, index) => {
        const plyAttr = node.getAttribute("data-ply") || node.closest("[data-ply]")?.getAttribute("data-ply");
        const ply = plyAttr != null && plyAttr !== "" ? Number(plyAttr) : NaN;
        return { node, index, ply };
      })
      .sort((a, b) => (Number.isFinite(a.ply) && Number.isFinite(b.ply) ? a.ply - b.ply : a.index - b.index));

    // Deduplicate by data-ply when available
    const plyMap = new Map();
    const fallbackList = [];
    for (const item of ordered) {
      if (Number.isFinite(item.ply) && item.ply > 0) {
        if (!plyMap.has(item.ply)) {
          plyMap.set(item.ply, item);
        }
      } else {
        fallbackList.push(item);
      }
    }

    const finalOrdered = plyMap.size > 0
      ? Array.from(plyMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([, item]) => item)
      : fallbackList;

    const texts = finalOrdered.map(({ node }) => extractMoveTextFromNode(node)).filter(Boolean);
    const replay = replayMoveTexts(texts);
    captureComplete = replay.complete;
    if (replay.moves.length > 0) {
      game = replay.game;
      lastMoveKey = game.history().join(" ");
    }
    return captureComplete;
  }

  function detectPageUsername() {
    // 1. Bottom player is the local user on chess.com
    const bottomSelectors = [
      ".board-layout-player.player-bottom .user-tagline-username",
      ".board-layout-player.player-bottom [data-username]",
      ".player-bottom [data-username]",
      ".player-bottom .user-username-component",
      "[data-test='player-bottom'] [data-username]",
      ".board-layout-bottom [data-username]"
    ];
    for (const sel of bottomSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const val = el.getAttribute?.("data-username") || el.textContent?.trim();
        if (val && /^[a-zA-Z0-9_-]{2,25}$/.test(val)) return val;
      }
    }

    // 2. Navigation bar / logged-in user links
    const navSelectors = [
      "[data-test='nav-user-username']",
      ".user-nav-username",
      ".global-header-username",
      "#nav-user-username",
      "a.user-nav-profile-link",
      "a[href^='/member/']"
    ];
    for (const sel of navSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const href = el.getAttribute?.("href");
        if (href) {
          const match = href.match(/^\/member\/([a-zA-Z0-9_-]{2,25})/);
          if (match?.[1]) return match[1];
        }
        const val = el.getAttribute?.("data-username") || el.textContent?.trim();
        if (val && /^[a-zA-Z0-9_-]{2,25}$/.test(val)) return val;
      }
    }

    // 3. Fallback to general taglines
    const genericSelectors = [
      ".user-username-component",
      "[data-username]",
      ".user-tagline-username",
      "[data-test='user-tagline-username']"
    ];
    for (const sel of genericSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const val = el.getAttribute?.("data-username") || el.textContent?.trim();
        if (val && /^[a-zA-Z0-9_-]{2,25}$/.test(val)) return val;
      }
    }
    return null;
  }

  function detectGameId() {
    const match = window.location.href.match(/\/game\/(?:live|daily)\/(\d+)/);
    if (match?.[1]) return match[1];
    const link = document.querySelector("a[href*='/game/live/'], a[href*='/game/daily/']");
    if (link) {
      const linkMatch = link.getAttribute("href")?.match(/\/game\/(?:live|daily)\/(\d+)/);
      if (linkMatch?.[1]) return linkMatch[1];
    }
    const withAttr = document.querySelector("[data-game-id]");
    if (withAttr) {
      const val = withAttr.getAttribute("data-game-id");
      if (val && /^\d+$/.test(val)) return val;
    }
    return lastGameId || null;
  }

  async function fetchCallbackGamePgn(targetGameId) {
    if (!targetGameId) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`/callback/live/game/${targetGameId}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.game?.pgn && typeof data.game.pgn === "string" && data.game.pgn.trim()) {
        return data.game.pgn;
      }
    } catch {
      // silent fallback
    } finally {
      clearTimeout(timeout);
    }
    return null;
  }

  async function fetchRecentOfficialPgn(username, targetGameId) {
    if (!username) return null;
    const user = encodeURIComponent(username.trim().toLowerCase());
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(`https://api.chess.com/pub/player/${user}/games/${yyyy}/${mm}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const { games = [] } = await response.json();
      if (!games.length) return null;

      if (targetGameId) {
        const found = games.find((g) => g.url && g.url.includes("/" + targetGameId));
        if (found?.pgn) return found.pgn;
      }

      // Check most recent game finished within last 10 minutes
      const sorted = games
        .filter((g) => typeof g.pgn === "string" && g.pgn.trim())
        .sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
      const latest = sorted[0];
      if (latest && (Date.now() / 1000 - (latest.end_time || 0)) < 600) {
        return latest.pgn;
      }
    } catch {
      // API lookup failed or timed out; silent fallback
    } finally {
      clearTimeout(timeout);
    }
    return null;
  }

  function isElementVisible(el) {
    if (!el) return false;
    try {
      if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getClientRects()?.length) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      return true;
    } catch {
      return (el.offsetWidth || 0) > 0 || (el.offsetHeight || 0) > 0;
    }
  }

  function terminalResult() {
    const roots = collectRoots();

    // 1. Check for visible game-over modals and result containers
    const resultSelectors = [
      "[data-cy='game-over-modal']",
      "[data-cy='game-result-modal']",
      "[data-cy='game-over']",
      "[data-testid*='game-over']",
      "[data-testid*='game-result']",
      ".game-over-dialog-content",
      ".game-over-modal-content",
      ".game-over-modal-component",
      ".game-over-modal",
      ".modal-game-over",
      ".modal-game-over-component",
      ".game-over-component",
      ".game-over-header-component",
      ".game-over-player-component",
      ".game-result-component",
      "[data-cy='game-result-component']",
      ".board-layout-game-result",
      ".vertical-move-list-game-result",
      ".vertical-move-list-result",
      ".move-list-result",
      ".game-result",
      ".live-game-result"
    ];

    const dialogTexts = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(resultSelectors.join(","))) {
        if (isElementVisible(el)) {
          const text = el.innerText || el.textContent || "";
          if (text.trim()) dialogTexts.push(text);
        }
      }
    }
    const dialogRes = terminalResultFromTexts(dialogTexts);
    if (dialogRes) return dialogRes;

    // 2. Check for action buttons that exclusively appear post-game
    for (const root of roots) {
      const candidates = root.querySelectorAll(
        "button, a, [role='button'], [data-cy*='review'], [data-cy*='rematch'], [data-tab='review']"
      );
      for (const btn of candidates) {
        if (isElementVisible(btn)) {
          const dataCy = (btn.getAttribute("data-cy") || "").toLowerCase();
          if (dataCy === "game-review-button" || dataCy === "game-over-review-button" || dataCy === "rematch-button") {
            return "*";
          }
          const label = (btn.getAttribute("aria-label") || btn.innerText || btn.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
          if (
            /\b(?:game review|review game)\b/.test(label) ||
            /^\s*rematch(?:\s*\(\d+\))?\s*$/.test(label)
          ) {
            return "*";
          }
        }
      }
    }

    // 3. Check move list outcome banner (restricted to actual move list containers; never the live sidebar)
    const moveListSelectors = [
      "vertical-move-list",
      "wc-vertical-move-list",
      ".vertical-move-list",
      "wc-simple-move-list",
      ".move-list",
      ".move-list-component"
    ];
    const moveTexts = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(moveListSelectors.join(","))) {
        if (isElementVisible(el)) {
          const resultBadge = el.querySelector(".game-result-component, .game-result, [data-cy='game-result-component'], .vertical-move-list-game-result");
          if (resultBadge && isElementVisible(resultBadge)) {
            const badgeText = resultBadge.innerText || resultBadge.textContent || "";
            if (badgeText.trim()) moveTexts.push(badgeText);
          }
          const text = el.innerText || el.textContent || "";
          if (text.trim()) moveTexts.push(text);
        }
      }
    }
    return terminalResultFromTexts(moveTexts);
  }

  function makePgn(result) {
    if (!game) game = new Chess();
    game.header("Event", "Chess.com game");
    game.header("Site", "Chess.com");
    game.header("Date", new Date().toISOString().slice(0, 10).replaceAll("-", "."));
    game.header("Result", result || "*");
    return game.pgn({ maxWidth: 80 });
  }

  function showGameEndPrompt(pgn) {
    const existing = document.getElementById("aftermove-game-end-dialog");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "aftermove-game-end-dialog";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.pointerEvents = "none";

    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .aftermove-card {
        pointer-events: auto;
        position: fixed;
        width: 360px;
        max-width: calc(100vw - 32px);
        background: #18191c;
        border: 1px solid rgba(198, 241, 53, 0.35);
        border-radius: 14px;
        padding: 20px 22px;
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08);
        animation: aftermovePopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes aftermovePopIn {
        from {
          opacity: 0;
          transform: translateY(-12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .aftermove-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .aftermove-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #c6f135;
        background: rgba(198, 241, 53, 0.12);
        padding: 3px 8px;
        border-radius: 6px;
      }
      .aftermove-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #c6f135;
        box-shadow: 0 0 6px #c6f135;
      }
      .aftermove-close {
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      }
      .aftermove-close:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .aftermove-title {
        font-size: 17px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 6px;
        line-height: 1.3;
      }
      .aftermove-desc {
        font-size: 13px;
        line-height: 1.45;
        color: #9ca3af;
        margin-bottom: 18px;
      }
      .aftermove-actions {
        display: flex;
        gap: 10px;
      }
      .aftermove-btn-primary {
        flex: 1;
        background: #c6f135;
        color: #121316;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        padding: 10px 14px;
        cursor: pointer;
        transition: transform 0.1s, background 0.15s, box-shadow 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .aftermove-btn-primary:hover {
        background: #d4f757;
        box-shadow: 0 4px 14px rgba(198, 241, 53, 0.35);
      }
      .aftermove-btn-primary:active {
        transform: scale(0.98);
      }
      .aftermove-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #d1d5db;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 14px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .aftermove-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
      }
    `;

    const card = document.createElement("div");
    card.className = "aftermove-card";

    function updateCardPosition() {
      const board = document.querySelector("wc-chess-board, chess-board, .board-layout-main, #board-layout-main, .board");
      if (board) {
        const rect = board.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 200) {
          const top = Math.max(16, rect.top + (rect.height / 2) - 100);
          const left = Math.max(16, rect.left + (rect.width / 2) - 180);
          card.style.top = `${top}px`;
          card.style.left = `${left}px`;
          return;
        }
      }
      card.style.top = "80px";
      card.style.right = "24px";
      card.style.left = "auto";
    }

    updateCardPosition();
    window.addEventListener("resize", updateCardPosition, { passive: true });
    window.addEventListener("scroll", updateCardPosition, { passive: true });

    card.innerHTML = `
      <div class="aftermove-top">
        <span class="aftermove-badge">
          <span class="aftermove-dot"></span>
          Aftermove
        </span>
        <button class="aftermove-close" aria-label="Dismiss">&times;</button>
      </div>
      <h3 class="aftermove-title">Game end detected</h3>
      <p class="aftermove-desc">Your game has concluded and all moves were captured silently. Would you like to analyze this game with Stockfish?</p>
      <div class="aftermove-actions">
        <button class="aftermove-btn-primary">Analyze with Stockfish &rarr;</button>
        <button class="aftermove-btn-secondary">Later</button>
      </div>
    `;

    function closePrompt() {
      window.removeEventListener("resize", updateCardPosition);
      window.removeEventListener("scroll", updateCardPosition);
      window.removeEventListener("keydown", onKeyDown);
      host.remove();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") closePrompt();
    }

    window.addEventListener("keydown", onKeyDown);

    card.querySelector(".aftermove-close").addEventListener("click", closePrompt);
    card.querySelector(".aftermove-btn-secondary").addEventListener("click", closePrompt);

    card.querySelector(".aftermove-btn-primary").addEventListener("click", () => {
      closePrompt();
      chrome.runtime.sendMessage({ type: "OPEN_REVIEW", pgn });
    });

    shadow.append(style, card);
    document.documentElement.appendChild(host);
  }

  async function finalizeGame(result) {
    if (finalizing) return true;
    finalizing = true;
    active = false;
    observer?.disconnect();
    clearInterval(pollTimer);
    clearTimeout(scanTimer);

    captureMoves();

    let pgn = null;
    const gameId = detectGameId();

    // 1. Try official callback endpoint (instant same-origin on chess.com)
    if (gameId) {
      try {
        const callbackPgn = await fetchCallbackGamePgn(gameId);
        if (callbackPgn) pgn = callbackPgn;
      } catch {}
    }

    // 2. Try official API with user archives
    if (!pgn) {
      try {
        const state = await chrome.storage.local.get(["username", "detectedUsername"]);
        const user = state.username || detectPageUsername() || state.detectedUsername;
        if (user) {
          const official = await fetchRecentOfficialPgn(user, gameId);
          if (official) pgn = official;
        }
      } catch {}
    }

    // 3. Fallback to local PGN from game
    if (!pgn) {
      pgn = makePgn(result || "*");
    }

    // Save game state without forcing open a new tab immediately
    chrome.runtime.sendMessage({ type: "GAME_CAPTURED", pgn, autoOpen: false });

    // Show sleek in-page popup prompt over the chessboard
    showGameEndPrompt(pgn);
    return true;
  }

  async function finishIfConfirmed() {
    if (!active || finalizing) return false;
    captureMoves();

    // A live game cannot conclude with 0 moves recorded
    if (!game || game.history().length === 0) return false;

    const localEnd = localGameEndResult(game);
    const termRes = terminalResult();
    const result = localEnd?.result || termRes;
    if (!result) return false;

    return finalizeGame(result);
  }

  async function capturedPgnForManualReview() {
    captureMoves();

    try {
      const gameId = detectGameId();
      if (gameId) {
        const callbackPgn = await fetchCallbackGamePgn(gameId);
        if (callbackPgn) return callbackPgn;
      }
      const state = await chrome.storage.local.get(["username", "detectedUsername"]);
      const user = state.username || detectPageUsername() || state.detectedUsername;
      if (user) {
        const official = await fetchRecentOfficialPgn(user, gameId);
        if (official) return official;
      }
    } catch {
      // fallback to local
    }

    const localEnd = game && game.history().length ? localGameEndResult(game) : null;
    return makePgn(localEnd?.result || terminalResult() || "*");
  }

  function beginRecording(tabId) {
    const existingPrompt = document.getElementById("aftermove-game-end-dialog");
    if (existingPrompt) existingPrompt.remove();

    game = new Chess();
    active = true;
    finalizing = false;
    captureComplete = false;
    lastGameId = detectGameId() || "";

    const username = detectPageUsername();
    if (username) {
      chrome.storage.local.set({ detectedUsername: username }).catch(() => {});
    }

    captureMoves();
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    });

    // Polling interval ensures fast detection even if DOM mutations go idle
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!active || finalizing) return;
      const curId = detectGameId();
      if (curId && curId !== lastGameId) lastGameId = curId;
      captureMoves();
      finishIfConfirmed();
    }, 1000);

    return chrome.storage.local.set({ recording: true, recordingTabId: tabId });
  }

  function scheduleScan() {
    if (!active || finalizing) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const curId = detectGameId();
      if (curId && curId !== lastGameId) lastGameId = curId;
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
      (async () => {
        // 1. Board state end (checkmate, stalemate, repetition, etc.)
        const localEnd = game && game.history().length ? localGameEndResult(game) : null;
        if (localEnd?.result) {
          await finalizeGame(localEnd.result);
          return { ok: true };
        }

        // 2. DOM terminal result (game-over modal, post-game buttons, outcome badge)
        const domResult = terminalResult();
        if (domResult) {
          await finalizeGame(domResult);
          return { ok: true };
        }

        // 3. Callback endpoint check (/callback/live/game/{gameId})
        const gameId = detectGameId();
        if (gameId) {
          try {
            const callbackPgn = await fetchCallbackGamePgn(gameId);
            if (callbackPgn && !callbackPgn.includes('[Result "*"]')) {
              await finalizeGame("*");
              return { ok: true };
            }
          } catch {}
        }

        // 4. Official user archive API check
        try {
          const state = await chrome.storage.local.get(["username", "detectedUsername"]);
          const user = state.username || detectPageUsername() || state.detectedUsername;
          if (user) {
            const officialPgn = await fetchRecentOfficialPgn(user, gameId);
            if (officialPgn && !officialPgn.includes('[Result "*"]')) {
              await finalizeGame("*");
              return { ok: true };
            }
          }
        } catch {}

        return {
          ok: false,
          error: "The game has not ended yet. Finish your game on Chess.com first, then click here to analyze."
        };
      })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    if (message?.type === "STOP_RECORDING") {
      active = false;
      finalizing = false;
      observer?.disconnect();
      clearInterval(pollTimer);
      clearTimeout(scanTimer);
      game = null;
      captureComplete = false;
      lastMoveKey = "";
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "EXPORT_CAPTURED_PGN") {
      capturedPgnForManualReview().then((pgn) => {
        sendResponse(pgn ? { ok: true, pgn } : { ok: false, error: "Aftermove could not read any valid legal moves on this page yet." });
      }).catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: "CHECK_RECORDING" }, (state) => {
    if (state?.recording && state.sameTab) {
      beginRecording(state.tabId).catch((error) => console.error("Could not resume the silent recording.", error));
    }
  });
})();
