import { Chess } from "chess.js";

const figurines = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": "", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N", "♟": "" };

function normalizeSan(value) {
  return value.replace(/0/g, "O").replace(/[+#]$/, "");
}

export function moveTokens(value) {
  const text = String(value || "")
    .replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, (piece) => figurines[piece])
    .replace(/\b\d+\.(?:\.\.)?/g, " ")
    .replace(/[!?]+/g, " ");
  const uci = [...text.matchAll(/\b([a-h][1-8])([a-h][1-8])([qrbn])?\b/ig)]
    .map((match) => ({ type: "uci", from: match[1].toLowerCase(), to: match[2].toLowerCase(), promotion: match[3]?.toLowerCase() }));
  if (uci.length) return uci;
  return (text.match(/(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)/g) || [])
    .map((san) => ({ type: "san", san }));
}

// Replays whatever representation Chess.com exposes. A single DOM node may contain
// one ply, a numbered pair of plies, or the entire move list.
export function replayMoveTexts(values) {
  const game = new Chess();
  const moves = [];
  for (const value of values) {
    for (const token of moveTokens(value)) {
      let san;
      if (token.type === "uci") {
        san = game.moves({ verbose: true }).find((move) =>
          move.from === token.from && move.to === token.to && move.promotion === token.promotion
        )?.san;
      } else {
        san = game.moves().find((move) => normalizeSan(move) === normalizeSan(token.san));
      }
      if (!san) return { game, moves, complete: false, failedToken: token };
      game.move(san);
      moves.push(san);
    }
  }
  return { game, moves, complete: moves.length > 0, failedToken: null };
}
