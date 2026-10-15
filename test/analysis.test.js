import test from "node:test";
import assert from "node:assert/strict";
import { boardPoint, displaySquare } from "../src/board-view.js";
import { Chess } from "chess.js";
import { evaluationAtPly, formatEvaluation, formatEvaluationSwing, whiteAdvantageShare } from "../src/advantage.js";
import { adjacentPly, classify, classifyPlayedMove, moveLoss, moveMark, scoreFromInfo } from "../src/engine-logic.js";
import { localGameEndResult } from "../src/game-end.js";
import { moveTokens, replayMoveTexts } from "../src/move-capture.js";
import { terminalResultFromTexts } from "../src/terminal-result.js";

test("move loss measures evaluations from the mover's perspective", () => {
  assert.equal(moveLoss({ type: "cp", value: 100 }, { type: "cp", value: 250 }, "w"), 350);
  assert.equal(moveLoss({ type: "cp", value: 100 }, { type: "cp", value: 250 }, "b"), 350);
});

test("mate scores retain the evaluated side's winning perspective", () => {
  assert.equal(moveLoss({ type: "mate", value: 3 }, { type: "mate", value: -2 }, "w"), 0);
  assert.equal(moveLoss({ type: "mate", value: 2 }, { type: "mate", value: -3 }, "b"), 0);
  assert.equal(moveLoss({ type: "mate", value: 3 }, { type: "mate", value: 2 }, "w"), 200000);
  assert.equal(moveLoss({ type: "mate", value: 2 }, { type: "mate", value: 3 }, "b"), 200000);
});

test("Stockfish UCI scores and review labels are decoded consistently", () => {
  assert.deepEqual(scoreFromInfo("info depth 8 score cp -41 nodes 99", "b"), { type: "cp", value: -41, turn: "b" });
  assert.deepEqual(scoreFromInfo("info depth 8 score mate 4 nodes 99", "w"), { type: "mate", value: 4, turn: "w" });
  assert.equal(classify(350), "blunder");
  assert.equal(classify(200), "mistake");
  assert.equal(classify(90), "inaccuracy");
  assert.equal(classify(-120), "strong");
  assert.equal(classify(20), null);
});

test("a checkmate delivered is never mislabeled as a blunder", () => {
  assert.deepEqual(classifyPlayedMove({
    beforeScore: { type: "cp", value: 600 },
    afterScore: null,
    turn: "w",
    checkmatedOpponent: true
  }), { loss: -100000, category: "best" });
});

test("ordinary moves receive a chess-review label based on engine loss and best move", () => {
  const beforeScore = { type: "cp", value: 0 };
  assert.equal(classifyPlayedMove({ beforeScore, afterScore: { type: "cp", value: 0 }, turn: "w", actualSan: "e4", bestSan: "Nf3" }).category, "good");
  assert.equal(classifyPlayedMove({ beforeScore, afterScore: { type: "cp", value: 0 }, turn: "w", actualSan: "Nf3", bestSan: "Nf3" }).category, "best");
  assert.equal(classifyPlayedMove({ beforeScore, afterScore: { type: "cp", value: 125 }, turn: "w", actualSan: "a4", bestSan: "Nf3" }).category, "inaccuracy");
});

test("arrow keys traverse plies without moving beyond either end", () => {
  assert.equal(adjacentPly(2, "ArrowLeft", 7), 1);
  assert.equal(adjacentPly(2, "ArrowUp", 7), 1);
  assert.equal(adjacentPly(2, "ArrowRight", 7), 3);
  assert.equal(adjacentPly(2, "ArrowDown", 7), 3);
  assert.equal(adjacentPly(0, "ArrowLeft", 7), 0);
  assert.equal(adjacentPly(7, "ArrowRight", 7), 7);
  assert.equal(adjacentPly(3, "Escape", 7), 3);
});

test("every move quality has a distinct accessible icon and label", () => {
  assert.deepEqual(moveMark("good"), { icon: "·", label: "good" });
  assert.deepEqual(moveMark("best"), { icon: "✓", label: "best" });
  assert.deepEqual(moveMark("excellent"), { icon: "✦", label: "great" });
  assert.deepEqual(moveMark("miss"), { icon: "×", label: "miss" });
  assert.deepEqual(moveMark("brilliant"), { icon: "✧", label: "brilliant" });
  assert.deepEqual(moveMark("inaccuracy"), { icon: "?!", label: "inaccuracy" });
  assert.deepEqual(moveMark("mistake"), { icon: "!", label: "mistake" });
  assert.deepEqual(moveMark("blunder"), { icon: "‼", label: "blunder" });
  assert.deepEqual(moveMark(null, true), { icon: "♚", label: "checkmate" });
});

test("visible checkmate and result messages confirm completed games", () => {
  assert.equal(terminalResultFromTexts(["Checkmate! White wins."]), "1-0");
  assert.equal(terminalResultFromTexts(["Black won by checkmate"]), "0-1");
  assert.equal(terminalResultFromTexts(["White resigned"]), "0-1");
  assert.equal(terminalResultFromTexts(["Black resigned"]), "1-0");
  assert.equal(terminalResultFromTexts(["You won on time"]), "*");
  assert.equal(terminalResultFromTexts(["You lost by resignation"]), "*");
  assert.equal(terminalResultFromTexts(["Game finished — opponent disconnected"]), "*");
  assert.equal(terminalResultFromTexts(["Draw by stalemate"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["A comment mentions checkmate"]), null);
  assert.equal(terminalResultFromTexts(["Game in progress"]), null);
});

test("move capture replays individual, paired, figurine, and UCI move-list entries", () => {
  assert.deepEqual(moveTokens("1. e4 e5 2. ♘f3 ♞c6").map((token) => token.san), ["e4", "e5", "Nf3", "Nc6"]);
  const paired = replayMoveTexts(["1. e4 e5", "2. Nf3 Nc6", "3. Bb5 a6"]);
  assert.equal(paired.complete, true);
  assert.deepEqual(paired.moves, ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  const uci = replayMoveTexts(["e2e4 e7e5", "g1f3 b8c6"]);
  assert.equal(uci.complete, true);
  assert.equal(uci.game.fen().includes(" w KQkq - 2 3"), true);
});

test("move capture refuses move lists whose legal sequence breaks", () => {
  const wrongOrder = replayMoveTexts(["1. e4 e5", "2. e4"]);
  assert.equal(wrongOrder.complete, false);
});

test("local chess rules identify checkmate without relying on Chess.com result text", () => {
  const game = new Chess();
  for (const move of ["f3", "e5", "g4", "Qh4#"]) game.move(move);
  assert.deepEqual(localGameEndResult(game), { result: "0-1", reason: "checkmate" });
});

test("local chess rules identify stalemate and insufficient material draws", () => {
  const stalemate = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  assert.deepEqual(localGameEndResult(stalemate), { result: "1/2-1/2", reason: "stalemate" });
  const insufficient = new Chess("7k/8/6K1/8/8/8/8/8 w - - 0 1");
  assert.deepEqual(localGameEndResult(insufficient), { result: "1/2-1/2", reason: "insufficient material" });
});

test("local chess rules identify repetition and fifty-move draws", () => {
  const repetition = new Chess();
  for (let count = 0; count < 2; count += 1) {
    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8"]) repetition.move(move);
  }
  assert.deepEqual(localGameEndResult(repetition), { result: "1/2-1/2", reason: "threefold repetition" });
  const fiftyMoves = new Chess("7k/8/8/8/8/8/8/K6R w - - 100 51");
  assert.deepEqual(localGameEndResult(fiftyMoves), { result: "1/2-1/2", reason: "50-move rule" });
});

test("an ordinary check or playable position does not count as game over", () => {
  const game = new Chess();
  for (const move of ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"]) game.move(move);
  assert.equal(localGameEndResult(game), null);
});

test("advantage evaluations track each selected position and move swing", () => {
  const entries = [
    {
      beforeScore: { type: "cp", value: 0, turn: "w" },
      afterScore: { type: "cp", value: -75, turn: "b" }
    },
    {
      beforeScore: { type: "cp", value: -75, turn: "b" },
      afterScore: { type: "cp", value: 120, turn: "w" }
    }
  ];

  assert.deepEqual(evaluationAtPly(entries, 0), {
    score: entries[0].beforeScore,
    entry: null,
    swing: null,
    checkmate: false
  });
  assert.deepEqual(evaluationAtPly(entries, 1), {
    score: entries[0].afterScore,
    entry: entries[0],
    beforeScore: entries[0].beforeScore,
    swing: 75,
    checkmate: false
  });
  assert.equal(evaluationAtPly(entries, 2).swing, 45);
  assert.equal(evaluationAtPly(entries, 3), null);
});

test("advantage labels and bar positions respect White and Black perspectives", () => {
  assert.equal(formatEvaluation({ type: "cp", value: 125, turn: "w" }), "White +1.3");
  assert.equal(formatEvaluation({ type: "cp", value: -80, turn: "b" }), "White +0.8");
  assert.equal(formatEvaluation({ type: "cp", value: 0, turn: "b" }), "Equal · 0.0");
  assert.equal(formatEvaluation({ type: "mate", value: 3, turn: "w" }), "White mates in 3");
  assert.equal(formatEvaluation({ type: "mate", value: -4, turn: "w" }), "Black mates in 4");
  assert.ok(whiteAdvantageShare({ type: "cp", value: 300, turn: "w" }) > 0.5);
  assert.ok(whiteAdvantageShare({ type: "cp", value: 300, turn: "b" }) < 0.5);
  assert.equal(formatEvaluationSwing(125), "Evaluation shifted 1.3 toward White.");
  assert.equal(formatEvaluationSwing(-75), "Evaluation shifted 0.8 toward Black.");
  assert.equal(formatEvaluationSwing(0), "Evaluation stayed level on this move.");
  assert.equal(formatEvaluationSwing(null, { type: "cp", value: 0, turn: "w" }, { type: "mate", value: 3, turn: "w" }), "Forced mate found: White mates in 3.");
  assert.equal(formatEvaluationSwing(null, { type: "mate", value: 3, turn: "w" }, { type: "cp", value: 100, turn: "w" }), "Stockfish no longer sees a forced mate after this move.");
});

test("a checkmating move sets the selected position advantage for its winner", () => {
  const entry = { ply: 4, turn: "b", checkmate: true };
  assert.deepEqual(evaluationAtPly([entry], 1), {
    score: null,
    entry,
    swing: null,
    checkmate: true
  });

  test("flipping the board reverses displayed squares without changing chess coordinates", () => {
    assert.deepEqual(displaySquare(0, 0, false), { row: 0, column: 0, name: "a8" });
    assert.deepEqual(displaySquare(0, 0, true), { row: 7, column: 7, name: "h1" });
    assert.deepEqual(displaySquare(7, 7, true), { row: 0, column: 0, name: "a8" });
    assert.equal(boardPoint("a8", false), "6.25,6.25");
    assert.equal(boardPoint("a8", true), "93.75,93.75");
  });
});
