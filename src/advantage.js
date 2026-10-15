import { whiteScore } from "./engine-logic.js";

const MAX_DISPLAY_CP = 500;

export function evaluationAtPly(entries, ply) {
  if (!entries.length) return null;
  if (ply <= 0) {
    return { score: entries[0].beforeScore, entry: null, swing: null, checkmate: false };
  }

  const entry = entries[ply - 1];
  if (!entry) return null;
  if (entry.checkmate) {
    return { score: null, entry, swing: null, checkmate: true };
  }

  return {
    score: entry.afterScore,
    entry,
    beforeScore: entry.beforeScore,
    swing: entry.afterScore && entry.beforeScore
      && entry.afterScore.type !== "mate"
      && entry.beforeScore.type !== "mate"
      ? whiteScore(entry.afterScore, entry.afterScore.turn) - whiteScore(entry.beforeScore, entry.beforeScore.turn)
      : null,
    checkmate: false
  };
}

export function whiteAdvantageShare(score) {
  if (score.type === "mate") return score.value * (score.turn === "w" ? 1 : -1) > 0 ? 0.97 : 0.03;
  const cp = whiteScore(score, score.turn);
  return 1 / (1 + 10 ** (-Math.max(-MAX_DISPLAY_CP, Math.min(MAX_DISPLAY_CP, cp)) / 400));
}

export function formatEvaluation(score) {
  if (score.type === "mate") {
    const whiteMates = score.value * (score.turn === "w" ? 1 : -1) > 0;
    return `${whiteMates ? "White" : "Black"} mates in ${Math.abs(score.value)}`;
  }

  const pawns = whiteScore(score, score.turn) / 100;
  if (Math.abs(pawns) < 0.1) return "Equal · 0.0";
  const leader = pawns > 0 ? "White" : "Black";
  return `${leader} +${Math.abs(pawns).toFixed(1)}`;
}

export function formatEvaluationSwing(swing, beforeScore = null, afterScore = null) {
  if (beforeScore?.type === "mate" && afterScore?.type !== "mate") return "Stockfish no longer sees a forced mate after this move.";
  if (beforeScore?.type !== "mate" && afterScore?.type === "mate") return `Forced mate found: ${formatEvaluation(afterScore)}.`;
  if (beforeScore?.type === "mate" && afterScore?.type === "mate") {
    return `Forced-mate evaluation changed from ${formatEvaluation(beforeScore)} to ${formatEvaluation(afterScore)}.`;
  }
  if (swing === null || !Number.isFinite(swing)) return "Evaluation change unavailable for this move.";
  if (Math.abs(swing) < 10) return "Evaluation stayed level on this move.";
  const side = swing > 0 ? "White" : "Black";
  return `Evaluation shifted ${(Math.abs(swing) / 100).toFixed(1)} toward ${side}.`;
}
