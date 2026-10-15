export function localGameEndResult(chess) {
  if (chess.isCheckmate()) return { result: chess.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  if (chess.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient material" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", reason: "threefold repetition" };
  if (chess.isDrawByFiftyMoves()) return { result: "1/2-1/2", reason: "50-move rule" };
  return null;
}
