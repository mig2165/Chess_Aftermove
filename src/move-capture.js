import { Chess } from "chess.js";

const figurines = {
  "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "",
  "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": ""
};

export function normalizeSan(value) {
  return String(value || "")
    .replace(/0/g, "O")
    .replace(/[+#!?]+$/g, "")
    .trim();
}

export function parseAriaLabel(label) {
  if (!label) return null;
  const l = String(label).toLowerCase().trim();
  if (l.includes("kingside") || l.includes("king-side") || l.includes("castle kingside") || l.includes("o-o")) return "O-O";
  if (l.includes("queenside") || l.includes("queen-side") || l.includes("castle queenside") || l.includes("o-o-o")) return "O-O-O";

  const match = l.match(/(knight|bishop|rook|queen|king|pawn)?\s*(?:to|takes|x)?\s*([a-h][1-8])(?:\s*(?:=|promotes to)\s*([qrbn]))?/i);
  if (match) {
    const pieceMap = { knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K", pawn: "" };
    const piece = match[1] ? (pieceMap[match[1].toLowerCase()] ?? "") : "";
    const isCapture = l.includes("take") || l.includes("x");
    const dest = match[2].toLowerCase();
    const prom = match[3] ? `=${match[3].toUpperCase()}` : "";
    return `${piece}${isCapture ? "x" : ""}${dest}${prom}`;
  }
  return null;
}

export function extractFigurineFromElement(node) {
  if (!node) return "";
  // 1. Direct attribute data-figurine on node or child
  const figElem = node.hasAttribute?.("data-figurine")
    ? node
    : node.querySelector?.("[data-figurine]");
  if (figElem) {
    const val = figElem.getAttribute("data-figurine");
    if (val && /^[KQRBN]$/i.test(val.trim())) return val.trim().toUpperCase();
  }

  // 2. Class names on icon spans
  const icons = node.querySelectorAll?.("[class*='icon-font-chess'], [class*='piece-'], [class*='chess-icon'], [class*='piece']") || [];
  for (const icon of icons) {
    const cls = String(icon.className || "").toLowerCase();
    if (/knight|\bwn\b|\bbn\b|[\b_-]n[\b_-]|\bn\b/.test(cls)) return "N";
    if (/bishop|\bwb\b|\bbb\b|[\b_-]b[\b_-]|\bb\b/.test(cls)) return "B";
    if (/rook|\bwr\b|\bbr\b|[\b_-]r[\b_-]|\br\b/.test(cls)) return "R";
    if (/queen|\bwq\b|\bbq\b|[\b_-]q[\b_-]|\bq\b/.test(cls)) return "Q";
    if (/king|\bwk\b|\bbk\b|[\b_-]k[\b_-]|\bk\b/.test(cls)) return "K";
  }

  return "";
}

export function extractMoveTextFromNode(node) {
  if (!node) return "";

  // 1. Explicit SAN, UCI, or move attributes
  const explicit = node.getAttribute?.("data-san")
    || node.getAttribute?.("data-move")
    || node.getAttribute?.("data-uci")
    || node.querySelector?.("[data-san]")?.getAttribute("data-san")
    || node.querySelector?.("[data-move]")?.getAttribute("data-move")
    || node.querySelector?.("[data-uci]")?.getAttribute("data-uci");
  if (explicit?.trim()) return explicit.trim();

  // 2. Detect piece figurine
  const figurine = extractFigurineFromElement(node);

  // 3. Extract text content without clock or eval badges
  let rawText = "";
  if (typeof node.cloneNode === "function") {
    try {
      const clone = node.cloneNode(true);
      for (const badge of clone.querySelectorAll?.(".time, [data-time], .clock, .badge, .eval, [data-cy*='eval'], [class*='time'], [class*='eval']") || []) {
        badge.remove();
      }
      rawText = clone.textContent || "";
    } catch {
      rawText = node.textContent || "";
    }
  } else {
    rawText = node.textContent || "";
  }

  // Pre-normalize castling before any numeric or eval replacements
  let text = String(rawText || "")
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/o-o-o/gi, "O-O-O")
    .replace(/o-o/gi, "O-O")
    .replace(/[♔♚]/g, "K")
    .replace(/[♕♛]/g, "Q")
    .replace(/[♖♜]/g, "R")
    .replace(/[♗♝]/g, "B")
    .replace(/[♘♞]/g, "N")
    .replace(/[♙♟]/g, "")
    .replace(/\b\d+\.(?:\.\.)?/g, "") // remove move numbers like 1. or 2...
    .replace(/\b\d+:\d+(?:\.\d+)?\b/g, "") // remove clock times like 2:45
    .replace(/\b\d+(?:\.\d+)?s\b/g, "") // remove seconds like 12.4s
    .replace(/(?:^|\s)[+-](?:\d+(?:\.\d+)?|[mM]\d+)(?:\s|$)/g, " ") // remove eval badges safely
    .trim();

  if (/^(?:O-O-O|0-0-0)[+#]?$/i.test(text)) return text.replace(/0/g, "O");
  if (/^(?:O-O|0-0)[+#]?$/i.test(text)) return text.replace(/0/g, "O");

  // Prepend figurine if piece letter is missing from start of text
  if (figurine && !/^[KQRBN]/i.test(text) && !/^O-O/i.test(text)) {
    text = figurine + text;
  }

  // Fallback to aria-label if text is empty or uninformative
  if ((!text || text.length < 2) && node.getAttribute) {
    const aria = node.getAttribute("aria-label")
      || node.querySelector?.("[aria-label]")?.getAttribute("aria-label");
    const parsedAria = parseAriaLabel(aria);
    if (parsedAria) return parsedAria;
  }

  return text;
}

export function moveTokens(value) {
  let text = String(value || "")
    .replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, (piece) => figurines[piece])
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/o-o-o/gi, "O-O-O")
    .replace(/o-o/gi, "O-O")
    .replace(/\b\d+\.(?:\.\.)?/g, " ")
    .replace(/\b\d+:\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?s\b/g, " ")
    .replace(/(?:^|\s)[+-](?:\d+(?:\.\d+)?|[mM]\d+)(?:\s|$)/g, " ")
    .replace(/[!?]+/g, " ");

  const uci = [...text.matchAll(/\b([a-h][1-8])([a-h][1-8])([qrbn])?\b/ig)]
    .map((match) => ({
      type: "uci",
      from: match[1].toLowerCase(),
      to: match[2].toLowerCase(),
      promotion: match[3]?.toLowerCase()
    }));
  if (uci.length) return uci;

  // Check for castling or SAN moves
  const tokens = [];
  const sanMatches = text.match(/(?:O-O-O[+#]?|O-O[+#]?|[KQRBN]?(?:[a-h][1-8]|[a-h]|[1-8])?x?[a-h][1-8](?:=?[QRBN])?[+#]?)/g) || [];
  for (const item of sanMatches) {
    let san = item.replace(/0/g, "O");
    // Normalize promotions like e8Q -> e8=Q
    if (/[a-h][18][QRBN]/i.test(san) && !san.includes("=")) {
      san = san.replace(/([a-h][18])([QRBN])/i, "$1=$2");
    }
    tokens.push({ type: "san", san });
  }

  if (tokens.length) return tokens;

  // Fallback: aria-label
  const fromAria = parseAriaLabel(text);
  if (fromAria) return [{ type: "san", san: fromAria }];

  return [];
}

// Replays whatever representation Chess.com exposes.
// Resiliently handles missing figurines, promotion nuances, and UCI.
export function replayMoveTexts(values) {
  const game = new Chess();
  const moves = [];

  for (const value of values) {
    for (const token of moveTokens(value)) {
      let san;
      const legalMoves = game.moves({ verbose: true });

      if (token.type === "uci") {
        san = legalMoves.find((move) =>
          move.from === token.from &&
          move.to === token.to &&
          (move.promotion || undefined) === (token.promotion || undefined)
        )?.san;
      } else {
        const target = normalizeSan(token.san);
        // 1. Exact SAN match (normalized)
        san = legalMoves.find((move) => normalizeSan(move.san) === target)?.san;

        // 2. Castling fallback
        if (!san && (target === "O-O" || target === "O-O-O")) {
          san = legalMoves.find((m) => m.san.startsWith(target))?.san;
        }

        // 3. Promotion check (e.g. e8Q vs e8=Q)
        if (!san && /[a-h][18][qrbn]/i.test(token.san)) {
          const normProm = normalizeSan(token.san.replace(/([a-h][18])([qrbn])/i, "$1=$2"));
          san = legalMoves.find((move) => normalizeSan(move.san) === normProm)?.san;
        }

        // 4. Fallback recovery: What if figurine piece or capture indicator was missing?
        // E.g. token.san is "f3" or "xd5" or "d5" or "Nf3" with disambiguation discrepancy
        if (!san) {
          const clean = token.san.replace(/[+#x!?=]/g, "").trim();
          const destMatch = clean.match(/([a-h][1-8])$/);
          if (destMatch) {
            const destSquare = destMatch[1];
            const isCapture = token.san.includes("x") || (clean.length >= 3 && /^[a-h][a-h]/.test(clean));
            let candidates = legalMoves.filter((m) => m.to === destSquare);
            if (isCapture) {
              const captureCandidates = candidates.filter((m) => m.flags.includes("c") || m.flags.includes("e") || m.captured);
              if (captureCandidates.length) candidates = captureCandidates;
            }
            const pieceLetter = token.san.match(/^[KQRBN]/)?.[0]?.toLowerCase();
            if (pieceLetter) {
              const pieceCandidates = candidates.filter((m) => m.piece === pieceLetter);
              if (pieceCandidates.length) candidates = pieceCandidates;
            }

            const fileMatch = clean.match(/^[KQRBN]?([a-h])/);
            if (fileMatch && candidates.length > 1) {
              const fromFileCandidates = candidates.filter((m) => m.from.startsWith(fileMatch[1]));
              if (fromFileCandidates.length === 1) {
                san = fromFileCandidates[0].san;
              } else if (fromFileCandidates.length > 1) {
                candidates = fromFileCandidates;
              }
            }

            const rankMatch = clean.match(/^[KQRBN]?([1-8])/);
            if (!san && rankMatch && candidates.length > 1) {
              const fromRankCandidates = candidates.filter((m) => m.from.endsWith(rankMatch[1]));
              if (fromRankCandidates.length === 1) {
                san = fromRankCandidates[0].san;
              } else if (fromRankCandidates.length > 1) {
                candidates = fromRankCandidates;
              }
            }

            if (!san && candidates.length === 1) {
              san = candidates[0].san;
            }
          }
        }
      }

      if (!san) return { game, moves, complete: false, failedToken: token };
      game.move(san);
      moves.push(san);
    }
  }

  return { game, moves, complete: moves.length > 0, failedToken: null };
}
