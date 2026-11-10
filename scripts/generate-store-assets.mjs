import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const assetsDir = path.join(root, "store-assets");

await fsp.mkdir(assetsDir, { recursive: true });

// Build a verified, tactical club game with best moves, great moves, inaccuracies, mistakes, blunders, and checkmate.
const SAMPLE_PGN = [
  '[Event "Live Chess"]',
  '[Site "Chess.com"]',
  '[Date "2026.11.05"]',
  '[White "Alex_M"]',
  '[Black "Nora_V"]',
  '[Result "1-0"]',
  '[WhiteElo "1645"]',
  '[BlackElo "1630"]',
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb6 7. Nc3 d6",
  "8. h3 O-O 9. O-O h6 10. Re1 Re8 11. Bf4 Nxe4 12. Nxe4 d5 13. Bxd5 Qxd5",
  "14. Nf6+ gxf6 15. Rxe8+ Kg7 16. Qd2 Qh5 17. Bxh6+ Qxh6 18. Rg8+ Kxg8 19. Qxh6 Nxd4",
  "20. Nxd4 Bxd4 21. Rd1 c5 22. Rd3 Bf5 23. Rg3+ Bg6 24. h4 Re8 25. h5 Re1+",
  "26. Kh2 Be5 27. f4 Bd4 28. hxg6 Bg1+ 29. Kh3 fxg6 30. Qxg6+ Kf8 31. Qxf6+ Ke8",
  "32. Rg8+ Kd7 33. Rd8+ Kc7 34. Qd6# 1-0"
].join("\n");

// Verify PGN legality up front with chess.js
{
  const check = new Chess();
  check.loadPgn(SAMPLE_PGN);
  if (!check.isCheckmate()) {
    throw new Error("Sample PGN did not end in checkmate as expected.");
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const CHROME_SHIM = `<script>
(() => {
  const store = {
    reviewPgn: ${JSON.stringify(SAMPLE_PGN)},
    recording: false,
    moveSounds: false,
    aiEnabled: false,
    aiKey: "",
    aiModel: "gpt-4o-mini",
    analysisDepth: 10
  };
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return { ...store };
          if (typeof keys === "string") return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((k) => [k, store[k]]));
          }
          return { ... keys, ...store };
        },
        set: async (obj) => {
          Object.assign(store, obj);
        },
        remove: async (keys) => {
          for (const k of [].concat(keys)) delete store[k];
        }
      },
      onChanged: {
        addListener: () => {}
      }
    },
    runtime: {
      getURL: (p) => "/" + String(p).replace(/^\\/+/, "")
    }
  };
})();
</script>`;

const PROMO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 440px;
        height: 280px;
        overflow: hidden;
        font-family: "Segoe UI", "Helvetica Neue", sans-serif;
        background:
          radial-gradient(ellipse at 88% 12%, rgba(216, 243, 106, 0.16), transparent 48%),
          radial-gradient(ellipse at 12% 100%, rgba(34, 197, 94, 0.10), transparent 45%),
          #101719;
        color: #f3f5ef;
        display: grid;
        grid-template-columns: 1.18fr 0.82fr;
        align-items: center;
        padding: 26px 26px 24px 28px;
        gap: 16px;
        position: relative;
        border: 1px solid #2b3833;
      }
      .copy {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
        z-index: 2;
      }
      .wordmark {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.16em;
        color: #f3f5ef;
      }
      .wordmark .mark {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 1.5px solid #d8f36a;
        border-radius: 8px 8px 8px 3px;
        color: #d8f36a;
        font: 700 17px Georgia, serif;
        letter-spacing: 0;
        background: rgba(216, 243, 106, 0.07);
      }
      .headline {
        margin-top: 8px;
      }
      .kicker {
        color: #d8f36a;
        font-size: 8.5px;
        font-weight: 750;
        letter-spacing: 0.15em;
        margin-bottom: 7px;
      }
      h1 {
        font-size: 27px;
        line-height: 1.04;
        letter-spacing: -0.045em;
        font-weight: 800;
        color: #f3f5ef;
      }
      h1 em {
        font-style: italic;
        font-family: Georgia, serif;
        font-weight: 400;
        color: #d8f36a;
      }
      .sub {
        margin-top: 9px;
        font-size: 11.5px;
        line-height: 1.42;
        color: #b7c3bc;
      }
      .pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .pill {
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #35453e;
        background: #17211e;
        color: #d8e2d9;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .pill.accent {
        border-color: rgba(216, 243, 106, 0.45);
        background: rgba(216, 243, 106, 0.12);
        color: #d8f36a;
      }
      .board-card {
        position: relative;
        width: 156px;
        height: 156px;
        justify-self: end;
        border: 1px solid #64756a;
        border-radius: 5px;
        overflow: hidden;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.48);
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(4, 1fr);
      }
      .sq {
        display: grid;
        place-items: center;
        font-family: "Segoe UI Symbol", "Noto Sans Symbols 2", sans-serif;
        font-size: 26px;
        color: #16211b;
        position: relative;
      }
      .sq.l { background: #d4d9c8; }
      .sq.d { background: #718876; }
      .sq.hl { background: #cadb7b; }
      .sq.target { box-shadow: inset 0 0 0 2.5px #22c55e; }
      .badge {
        position: absolute;
        top: 2px;
        right: 2px;
        padding: 1px 4px;
        border-radius: 3px;
        background: #f3f5ef;
        color: #8d2118;
        font: 800 9px "Segoe UI", sans-serif;
        border: 1px solid rgba(22, 33, 27, 0.2);
      }
      svg.arrow {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div class="copy">
      <div class="wordmark"><span class="mark">A</span> AFTERMOVE</div>
      <div class="headline">
        <p class="kicker">QUIET IN-GAME · HONEST AFTER</p>
        <h1>Play first.<br><em>Review locally.</em></h1>
        <p class="sub">Silent Chess.com recorder with local Stockfish accuracy, blunder arrows &amp; what-if lines.</p>
      </div>
      <div class="pills">
        <span class="pill accent">✓ Local Stockfish</span>
        <span class="pill">Zero Live Hints</span>
      </div>
    </div>
    <div class="board-card" aria-hidden="true">
      <div class="sq l"></div>
      <div class="sq d">♛</div>
      <div class="sq l"></div>
      <div class="sq d">♚</div>
      <div class="sq d"></div>
      <div class="sq l target"></div>
      <div class="sq d">♟</div>
      <div class="sq l">♟</div>
      <div class="sq l"></div>
      <div class="sq d"></div>
      <div class="sq l hl">♞<span class="badge">‼</span></div>
      <div class="sq d"></div>
      <div class="sq d"></div>
      <div class="sq l">♖</div>
      <div class="sq d"></div>
      <div class="sq l">♔</div>
      <svg class="arrow" viewBox="0 0 156 156">
        <defs>
          <marker id="ah" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
            <path d="M0,0.5 L5.5,3 L0,5.5 Z" fill="#22c55e" />
          </marker>
        </defs>
        <line x1="58" y1="136" x2="58" y2="66" stroke="#22c55e" stroke-width="5.5" stroke-linecap="round" marker-end="url(#ah)" opacity="0.92" />
      </svg>
    </div>
  </body>
</html>`;

function findBrowserExecutable() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not find Chrome or Edge executable to capture screenshots.");
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname === "/promo.html") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(PROMO_HTML);
          return;
        }
        const relPath = url.pathname === "/" ? "review.html" : url.pathname.replace(/^\/+/, "");
        const fullPath = path.resolve(distDir, relPath);
        if (!fullPath.startsWith(distDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        if (relPath === "review.html") {
          let html = await fsp.readFile(fullPath, "utf8");
          html = html.replace("<head>", `<head>\n${CHROME_SHIM}`);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
        const data = await fsp.readFile(fullPath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end(String(err.message));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

function launchHeadlessBrowser(browserPath, userDataDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      browserPath,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
        "--mute-audio",
        "--hide-scrollbars",
        "--window-size=1280,800",
        "about:blank"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stderrText = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timed out waiting for Chrome DevTools endpoint. Stderr:\n${stderrText}`));
    }, 15000);

    proc.stderr.on("data", (chunk) => {
      stderrText += chunk.toString("utf8");
      const match = stderrText.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ proc, wsUrl: match[1] });
      }
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Browser exited early with code ${code}. Stderr:\n${stderrText}`));
    });
  });
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, sessionId } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new CdpSession(ws);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, sessionId });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    this.ws.close();
  }
}

function readPngDimensions(buf) {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  };
}

async function captureViewportPng(cdp, sessionId, width, height, outPath) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await new Promise((r) => setTimeout(r, 300));
  const { data } = await cdp.send(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false
    },
    sessionId
  );
  const buf = Buffer.from(data, "base64");
  const dims = readPngDimensions(buf);
  if (dims.width !== width || dims.height !== height) {
    throw new Error(`Expected ${width}x${height} for ${outPath}, got ${dims.width}x${dims.height}`);
  }
  await fsp.writeFile(outPath, buf);
  console.log(`Captured ${path.relative(root, outPath)} (${dims.width}x${dims.height}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

async function evalInPage(cdp, sessionId, expression) {
  const res = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  );
  if (res.exceptionDetails) {
    throw new Error(`Page evaluation error: ${res.exceptionDetails.text}`);
  }
  return res.result?.value;
}

const userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "aftermove-shots-"));
const { server, port } = await startStaticServer();
let browserProc;
let cdp;

try {
  const browserPath = findBrowserExecutable();
  console.log(`Using browser: ${browserPath}`);
  console.log(`Local server listening on http://127.0.0.1:${port}`);

  const launched = await launchHeadlessBrowser(browserPath, userDataDir);
  browserProc = launched.proc;
  cdp = await CdpSession.connect(launched.wsUrl);

  const { targetId } = await cdp.send("Target.createTarget", {
    url: `http://127.0.0.1:${port}/review.html`
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    sessionId
  );

  // Wait for review.html to finish initializing PGN
  await evalInPage(
    cdp,
    sessionId,
    `new Promise((resolve, reject) => {
      const deadline = Date.now() + 15000;
      const timer = setInterval(() => {
        const btn = document.querySelector("#analyze-button");
        const err = document.querySelector("#error-message");
        if (err && !err.hidden && err.textContent) {
          clearInterval(timer);
          reject(new Error(err.textContent));
        } else if (btn && !btn.disabled) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for Analyze button"));
        }
      }, 100);
    })`
  );

  console.log("Running real Stockfish analysis on sample game...");
  await evalInPage(
    cdp,
    sessionId,
    `(() => {
      document.querySelector("#engine-depth-select").value = "10";
      document.querySelector("#analyze-button").click();
    })()`
  );

  await evalInPage(
    cdp,
    sessionId,
    `new Promise((resolve, reject) => {
      const deadline = Date.now() + 90000;
      const timer = setInterval(() => {
        const btn = document.querySelector("#analyze-button");
        const err = document.querySelector("#error-message");
        if (err && !err.hidden && err.textContent) {
          clearInterval(timer);
          reject(new Error(err.textContent));
        } else if (btn && btn.textContent.includes("Analysis complete")) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for Stockfish analysis"));
        }
      }, 200);
    })`
  );
  console.log("Stockfish analysis complete!");

  // Hide progress region cleanly after completion so layout is crisp
  await evalInPage(
    cdp,
    sessionId,
    `(() => {
      document.querySelector("#progress-region").hidden = true;
    })()`
  );

  // SCREENSHOT 2 FIRST (Top of page: Header + Match Banner + Accuracies + White vs Black Breakdown Table)
  await evalInPage(cdp, sessionId, `window.scrollTo(0, 6)`);
  await captureViewportPng(
    cdp,
    sessionId,
    1280,
    800,
    path.join(assetsDir, "screenshot2-breakdown.png")
  );

  // SCREENSHOT 1: Full Chessboard + Auto Best-Move Green Arrow + Blunder Badge + Advantage Bar + Active Move List
  const pickedInfo = await evalInPage(
    cdp,
    sessionId,
    `(() => {
      const tokens = [...document.querySelectorAll(".move-token")];
      const bad =
        tokens.find((t) => t.dataset.category === "blunder" && Number(t.dataset.ply) >= 16) ||
        tokens.find((t) => t.dataset.category === "blunder") ||
        tokens.find((t) => t.dataset.category === "mistake") ||
        tokens[Math.floor(tokens.length / 2)];
      if (bad) bad.click();

      const active = document.querySelector('.move-token[aria-current="true"]');
      if (active) active.scrollIntoView({ block: "center" });

      const board = document.querySelector("#chessboard");
      const boardRect = board.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, window.scrollY + boardRect.top - 16));
      return {
        ply: bad?.dataset.ply,
        category: bad?.dataset.category
      };
    })()`
  );
  console.log("Selected bad move for Screenshot 1:", pickedInfo);
  await captureViewportPng(
    cdp,
    sessionId,
    1280,
    800,
    path.join(assetsDir, "screenshot1-review.png")
  );

  // SCREENSHOT 4: 3-Move Best Continuation Sequence Card + Coach's Notes
  const shot4Info = await evalInPage(
    cdp,
    sessionId,
    `(() => {
      const tokens = [...document.querySelectorAll(".move-token")];
      const candidates = tokens.filter((t) =>
        ["blunder", "mistake", "inaccuracy"].includes(t.dataset.category)
      );
      let chosen = null;
      for (const c of candidates) {
        c.click();
        const reason = document.querySelector(".move-panel-reason")?.textContent || "";
        const hasCont = Boolean(document.querySelector(".best-continuation-box, .best-line-chips, .best-line-chip"));
        if (hasCont && !/\\d{3}\\.\\d pawns/.test(reason)) {
          chosen = { ply: c.dataset.ply, category: c.dataset.category, reason };
          if (c.dataset.category === "blunder" || c.dataset.category === "mistake") break;
        }
      }
      const panel = document.querySelector("#selected-move-panel");
      const rect = panel.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, window.scrollY + rect.top - 20));
      return chosen;
    })()`
  );
  console.log("Selected move for Screenshot 4:", shot4Info);
  await captureViewportPng(
    cdp,
    sessionId,
    1280,
    800,
    path.join(assetsDir, "screenshot4-continuation-coach.png")
  );

  // SCREENSHOT 3: Interactive Freeplay ("What-if") mode with full board, alternate move scored, + highlighted legal moves
  const freeplayInfo = await evalInPage(
    cdp,
    sessionId,
    `new Promise((resolve) => {
      // Pick a rich middlegame position (ply 22 = 11... Nxe4) where neither side is in check
      const midToken =
        document.querySelector('.move-token[data-ply="22"]') ||
        document.querySelector('.move-token[data-ply="20"]');
      if (midToken) midToken.click();

      const active = document.querySelector('.move-token[aria-current="true"]');
      if (active) active.scrollIntoView({ block: "center" });

      const exploreBtn = document.querySelector(".move-panel-explore");
      if (exploreBtn) exploreBtn.click();

      // Hide secondary panels below board via CSS display so renderAdvantage() does not unhide them
      const selPanel = document.querySelector("#selected-move-panel");
      const advPanel = document.querySelector("#advantage-panel");
      const boardTools = document.querySelector(".board-tools");
      if (selPanel) selPanel.style.display = "none";
      if (advPanel) advPanel.style.display = "none";
      if (boardTools) boardTools.style.display = "none";

      const waitIdle = (cb) => {
        const deadline = Date.now() + 20000;
        const timer = setInterval(() => {
          const evalText = document.querySelector("#what-if-evaluation")?.textContent || "";
          if (evalText && !evalText.includes("thinking") && !evalText.includes("Preparing")) {
            clearInterval(timer);
            cb(true);
          } else if (Date.now() > deadline) {
            clearInterval(timer);
            cb(false);
          }
        }, 120);
      };

      // Step 1: wait for initial Freeplay baseline, play one alternate move so Stockfish rates it
      waitIdle(() => {
        const squares = [...document.querySelectorAll("#chessboard .square.freeplay")];
        let moved = false;
        for (const sq of squares) {
          if (sq.textContent.trim()) {
            sq.click();
            const legal = document.querySelector("#chessboard .square.is-legal");
            if (legal) {
              legal.click();
              moved = true;
              break;
            }
          }
        }

        // Step 2: wait for Stockfish to finish scoring that alternate move, then select a piece with >= 3 legal moves
        setTimeout(() => {
          waitIdle(() => {
            const nextSquares = [...document.querySelectorAll("#chessboard .square.freeplay")];
            let legalCount = 0;
            for (const sq of nextSquares) {
              if (sq.textContent.trim()) {
                sq.click();
                legalCount = document.querySelectorAll("#chessboard .square.is-legal").length;
                if (legalCount >= 3) break;
              }
            }
            const board = document.querySelector("#chessboard");
            const bRect = board.getBoundingClientRect();
            window.scrollTo(0, Math.max(0, window.scrollY + bRect.top - 14));
            resolve({
              moved,
              legalCount,
              status: document.querySelector("#what-if-status")?.textContent || ""
            });
          });
        }, 150);
      });
    })`
  );
  console.log("Freeplay state for Screenshot 3:", freeplayInfo);
  await captureViewportPng(
    cdp,
    sessionId,
    1280,
    800,
    path.join(assetsDir, "screenshot3-freeplay.png")
  );

  // SCREENSHOT 5: Game Reflection & Patterns
  await evalInPage(
    cdp,
    sessionId,
    `(() => {
      // Restore any hidden panels so page layout is normal
      const selPanel = document.querySelector("#selected-move-panel");
      const advPanel = document.querySelector("#advantage-panel");
      const boardTools = document.querySelector(".board-tools");
      if (selPanel) selPanel.style.display = "";
      if (advPanel) advPanel.style.display = "";
      if (boardTools) boardTools.style.display = "";

      const habitsSummary = document.querySelector("#habits-summary");
      const habitsBanner = document.querySelector("#reflection-habits-banner");
      if (habitsSummary && habitsBanner) {
        habitsSummary.textContent = '"Trading at the Wrong Time" has appeared across 3 of your reviewed games. Focus on this in your next match!';
        habitsBanner.hidden = false;
      }

      const refSection = document.querySelector("#reflection-section");
      if (refSection) {
        refSection.hidden = false;
        const rect = refSection.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, window.scrollY + rect.top - 18));
      }
    })()`
  );
  await captureViewportPng(
    cdp,
    sessionId,
    1280,
    800,
    path.join(assetsDir, "screenshot5-reflection.png")
  );

  // PROMO TILE: 440x280 crisp HTML/CSS render
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/promo.html` }, sessionId);
  await new Promise((r) => setTimeout(r, 400));
  await captureViewportPng(
    cdp,
    sessionId,
    440,
    280,
    path.join(assetsDir, "promo-440x280.png")
  );
} finally {
  cdp?.close();
  browserProc?.kill();
  server.close();
  await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
