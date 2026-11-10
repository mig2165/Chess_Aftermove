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

export function isBadMove(categoryOrEntry) {
  if (!categoryOrEntry) return false;
  const category = typeof categoryOrEntry === "string" ? categoryOrEntry : categoryOrEntry.category;
  const loss = typeof categoryOrEntry === "object" ? categoryOrEntry.loss : null;
  if (category === "blunder" || category === "mistake" || category === "inaccuracy" || category === "miss") {
    return true;
  }
  if (typeof loss === "number" && loss >= 75) {
    return true;
  }
  return false;
}

export function moveAccuracy(loss) {
  if (typeof loss !== "number" || isNaN(loss) || loss <= 0) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * (loss / 10)) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function playerAccuracy(entries, turn) {
  const playerMoves = (entries || []).filter((e) => e.turn === turn && typeof e.loss === "number");
  if (!playerMoves.length) return null;
  const total = playerMoves.reduce((sum, e) => sum + moveAccuracy(e.loss), 0);
  return Math.round((total / playerMoves.length) * 10) / 10;
}

export function adjacentMistakePly(currentPly, direction, entries) {
  if (!entries || !entries.length) return currentPly;
  const step = direction >= 0 ? 1 : -1;
  let target = currentPly + step;
  while (target >= 1 && target <= entries.length) {
    const entry = entries[target - 1];
    if (isBadMove(entry)) {
      return target;
    }
    target += step;
  }
  return currentPly;
}

export function classifyPlayedMove({ beforeScore, afterScore, turn, actualSan = "", bestSan = "", checkmatedOpponent = false, legalMovesCount = null }) {
  if (checkmatedOpponent) return { loss: -100000, category: "best" };
  const cleanActual = actualSan.replace(/[+#]$/, "");
  const cleanBest = bestSan.replace(/[+#]$/, "");
  const sameMove = cleanActual && cleanBest && cleanActual === cleanBest;

  // If the move played matches Stockfish's best move, or it was the only legal move available (forced)
  if (sameMove || legalMovesCount === 1) {
    return { loss: 0, category: "best" };
  }

  const loss = Math.round(moveLoss(beforeScore, afterScore, turn));
  if (loss >= 300) return { loss, category: "blunder" };
  if (loss >= 150) return { loss, category: "mistake" };
  if (loss >= 75) return { loss, category: "inaccuracy" };
  if (loss <= -100) return { loss, category: "excellent" };
  return { loss, category: "good" };
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
    case "excellent":
    case "great": return { icon: "✦", label: "great" };
    case "brilliant": return { icon: "✧", label: "brilliant" };
    case "miss": return { icon: "×", label: "miss" };
    case "best": return { icon: "✓", label: "best" };
    default: return { icon: "·", label: "good" };
  }
}

export function adjacentPly(current, key, moveCount) {
  if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(key)) return current;
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return Math.max(0, Math.min(moveCount, current + direction));
}

export async function dispatchParallelTasks(items, workers, processItem, onProgress) {
  if (!items.length) return [];
  if (!workers.length) throw new Error("At least one worker is required.");
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function workerLoop(worker) {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await processItem(worker, items[idx], idx);
      completed++;
      if (onProgress) onProgress(completed, items.length);
    }
  }

  await Promise.all(workers.map((worker) => workerLoop(worker)));
  return results;
}
