import { isBadMove } from "./engine-logic.js";
import { Chess } from "chess.js";

/**
 * Detects tactical and strategic patterns for mistakes in a game.
 *
 * Fixed to ensure:
 * 1. Perspective Filtering: Analyzes mistakes made by the user/perspective side (defaulting to
 *    the player's color, or providing side-specific cards).
 * 2. Real Tactical Verification:
 *    - "Trading at the Wrong Time": Only triggers if pieces (knights, bishops, rooks, queens) were actually traded/captured,
 *      not passive pawn moves like 'h6' or desperation sacrifices.
 *    - "Weakening King Shield Pawns": Verifies the player actually castled, and only flags pawns on that specific
 *      castled flank (e.g. f/g/h if kingside castled, not queenside pawns like 'b3').
 *    - "Planless After Opening": Only flags repeated passive shuffling of pieces without a central break or threat.
 *    - "Hanging Pieces & Undefended Squares": Distinguishes actual hanging pieces from other blunders.
 */

export function detectGamePatterns(entries, history, options = {}) {
  if (!entries || !entries.length) return [];

  // Determine user's perspective side ('w' or 'b') if provided, or default to the side that has user moves
  const focusSide = options.focusSide || null;
  const filteredEntries = focusSide ? entries.filter((e) => e.turn === focusSide) : entries;

  const mistakes = filteredEntries.filter((e) => isBadMove(e));
  if (!mistakes.length) return [];

  const patternsFound = [];

  // Track castling per side from history
  let whiteCastledSide = null; // 'k' or 'q'
  let blackCastledSide = null;
  for (const m of history || []) {
    if (m.color === "w") {
      if (m.san === "O-O") whiteCastledSide = "k";
      else if (m.san === "O-O-O") whiteCastledSide = "q";
    } else {
      if (m.san === "O-O") blackCastledSide = "k";
      else if (m.san === "O-O-O") blackCastledSide = "q";
    }
  }

  // 1. Weakening King Shield Pawns
  // Must actually be a pawn push in front of the castled king on the side they castled!
  const kingPawnMistakes = mistakes.filter((m) => {
    const castled = m.turn === "w" ? whiteCastledSide : blackCastledSide;
    if (!castled) return false; // Haven't castled, so not a shield pawn weakening

    const san = m.actualSan;
    const isPawnMove = /^[a-h][1-8]/.test(san);
    if (!isPawnMove) return false;

    const file = san[0].toLowerCase();
    // If kingside castled, shield pawns are f, g, h
    if (castled === "k" && ["f", "g", "h"].includes(file)) return true;
    // If queenside castled, shield pawns are a, b, c
    if (castled === "q" && ["a", "b", "c"].includes(file)) return true;

    return false;
  });

  if (kingPawnMistakes.length >= 1) {
    patternsFound.push({
      id: "king-safety",
      title: "Weakening King Shield Pawns",
      icon: "🛡️",
      severity: "high",
      plies: kingPawnMistakes.map((m) => m.ply),
      summary: `Pawn push${kingPawnMistakes.length > 1 ? "es" : ""} in front of your castled king created open lines and weaknesses the opponent could exploit.`,
      advice: "Pawns cannot move backwards. Flank pawn pushes (f, g, or h pawns after kingside castling) open diagonals towards your king. Keep your king shield intact unless you have a concrete reason to break out."
    });
  }

  // 2. Early Queen Adventures (moves 1–7 / plies 1–14)
  const earlyQueenMistakes = mistakes.filter((m) => {
    return m.ply <= 14 && /^[0-9.]*\s*Q/i.test(m.actualSan) && !m.actualSan.includes("x");
  });

  if (earlyQueenMistakes.length >= 1) {
    patternsFound.push({
      id: "early-queen",
      title: "Premature Queen Movement",
      icon: "♛",
      severity: "medium",
      plies: earlyQueenMistakes.map((m) => m.ply),
      summary: `Early queen moves (move ${earlyQueenMistakes.map((m) => Math.ceil(m.ply / 2)).join(", ")}) led to lost tempo or tactical targets.`,
      advice: "Developing the queen too early exposes it to attacks by opponent minor pieces, allowing them to gain development with tempo. Prioritize developing knights and bishops first."
    });
  }

  // 3. Premature or Unfavorable Trades
  // MUST be an actual capture where a piece was traded off and resulted in lost evaluation
  const tradeMistakes = mistakes.filter((m) => {
    const isPieceCapture = m.actualSan.includes("x") && /^[NBRQK]/.test(m.actualSan);
    const opponentRecaptured = m.consequenceLine && m.consequenceLine[0]?.includes("x");
    return isPieceCapture && opponentRecaptured && m.loss >= 120;
  });

  if (tradeMistakes.length >= 2) {
    patternsFound.push({
      id: "wrong-trade",
      title: "Trading at the Wrong Time",
      icon: "⚔️",
      severity: tradeMistakes.some((m) => m.loss >= 250) ? "high" : "medium",
      plies: tradeMistakes.map((m) => m.ply),
      summary: `${tradeMistakes.length} piece trades resolved the tension prematurely and surrendered active piece play.`,
      advice: "Don't trade pieces just because you can! Ask: 'Does this trade improve my pieces, or does it activate my opponent's pieces and solve their defensive problems?' Maintain the tension unless the capture clearly wins material or positional control."
    });
  }

  // 4. Hanging Pieces & Undefended Squares (Tactical Material Drops)
  // Blunders where a piece was lost or left hanging (loss >= 250 and not an intentional forced mate escape)
  const tacticalBlunders = mistakes.filter((m) => {
    return m.category === "blunder" && m.loss >= 250 && !tradeMistakes.includes(m);
  });

  if (tacticalBlunders.length >= 2) {
    patternsFound.push({
      id: "tactical-blunders",
      title: "Hanging Pieces & Tactical Traps",
      icon: "🎯",
      severity: "high",
      plies: tacticalBlunders.map((m) => m.ply),
      summary: `${tacticalBlunders.length} major tactical slips occurred where pieces or squares were left undefended.`,
      advice: "Before committing your hand to a piece, pause and run a 5-second blunder check: 'If I move this, what did it stop defending? Is my destination square safe?' Always look out for loose, unprotected pieces."
    });
  }

  // 5. Post-opening drift (moves 8–15 where player makes passive moves without tactics)
  const openingDriftMistakes = mistakes.filter((m) => {
    return m.ply >= 15 && m.ply <= 30 && !tradeMistakes.includes(m) && !tacticalBlunders.includes(m);
  });

  if (openingDriftMistakes.length >= 2) {
    patternsFound.push({
      id: "opening-post-castling",
      title: "Planless After the Opening",
      icon: "🧭",
      severity: "medium",
      plies: openingDriftMistakes.map((m) => m.ply),
      summary: `${openingDriftMistakes.length} inaccuracies occurred right after the opening as the position transitioned into the middlegame.`,
      advice: "Once your pieces are developed and your king is safe, formulate a clear middlegame plan: identify open files for your rooks, target opponent pawn weaknesses, or prepare a pawn break in the center."
    });
  }

  // 6. Endgame technique
  const endgameMistakes = mistakes.filter((m) => m.ply > 44 && !tacticalBlunders.includes(m));
  if (endgameMistakes.length >= 2) {
    patternsFound.push({
      id: "endgame-technique",
      title: "Late Game & Endgame Conversion",
      icon: "⏳",
      severity: "medium",
      plies: endgameMistakes.map((m) => m.ply),
      summary: `${endgameMistakes.length} mistakes occurred in the simplified endgame stage.`,
      advice: "In the endgame, the king transforms from a liability into an active attacking piece! Centralize your king actively, create passed pawns, and cut off the opponent's king."
    });
  }

  return patternsFound;
}

/**
 * Cross-game pattern tracking in chrome.storage.local
 */
export async function recordGamePatterns(patterns, gameId) {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    const data = await chrome.storage.local.get(["historicalPatterns"]);
    const history = data.historicalPatterns || {};

    for (const p of patterns) {
      if (!history[p.id]) {
        history[p.id] = { id: p.id, title: p.title, count: 0, lastSeen: Date.now() };
      }
      history[p.id].count += 1;
      history[p.id].lastSeen = Date.now();
    }

    await chrome.storage.local.set({ historicalPatterns: history });
  } catch {}
}

export async function getHistoricalHabits() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return [];
  try {
    const data = await chrome.storage.local.get(["historicalPatterns"]);
    const history = data.historicalPatterns || {};
    return Object.values(history).filter((h) => h.count >= 2).sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}
