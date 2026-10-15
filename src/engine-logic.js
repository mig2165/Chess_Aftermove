export function whiteScore(score, turn) {
  const value = score.type === "mate" ? Math.sign(score.value) * 100000 : score.value;
  return turn === "w" ? value : -value;
}

export function moveLoss(beforeScore, afterScore, turn) {
  const before = whiteScore(beforeScore, turn);
  const after = whiteScore(afterScore, turn === "w" ? "b" : "w");
  return turn === "w" ? before - after : after - before;
}

export function classify(loss) {
  if (loss >= 300) return "blunder";
  if (loss >= 150) return "mistake";
  if (loss >= 75) return "inaccuracy";
  if (loss <= -100) return "strong";
  return null;
}

export function classifyPlayedMove({ beforeScore, afterScore, turn, actualSan = "", bestSan = "", checkmatedOpponent = false }) {
  if (checkmatedOpponent) return { loss: -100000, category: "best" };
  const loss = Math.round(moveLoss(beforeScore, afterScore, turn));
  if (loss >= 300) return { loss, category: "blunder" };
  if (loss >= 150) return { loss, category: "mistake" };
  if (loss >= 75) return { loss, category: "inaccuracy" };
  if (loss <= -100) return { loss, category: "excellent" };
  const sameMove = actualSan.replace(/[+#]$/, "") === bestSan.replace(/[+#]$/, "");
  return { loss, category: sameMove ? "best" : "good" };
}

export function scoreFromInfo(line, turn) {
  const match = line.match(/score (cp|mate) (-?\d+)/);
  if (!match) return null;
  return { type: match[1], value: Number(match[2]), turn };
}

export function moveMark(category, checkmate = false) {
  if (checkmate) return { icon: "♚", label: "checkmate" };
  switch (category) {
    case "blunder": return { icon: "‼", label: "blunder" };
    case "mistake": return { icon: "!", label: "mistake" };
    case "inaccuracy": return { icon: "?!", label: "inaccuracy" };
    case "excellent": return { icon: "✦", label: "excellent" };
    case "best": return { icon: "✓", label: "best" };
    default: return { icon: "·", label: "good" };
  }
}

export function adjacentPly(current, key, moveCount) {
  if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(key)) return current;
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return Math.max(0, Math.min(moveCount, current + direction));
}
