import test from "node:test";
import assert from "node:assert/strict";
import { boardPoint, displaySquare } from "../src/board-view.js";
import { Chess } from "chess.js";
import { evaluationAtPly, formatEvaluation, formatEvaluationSwing, whiteAdvantageShare } from "../src/advantage.js";
import { adjacentMistakePly, adjacentPly, classify, classifyPlayedMove, dispatchParallelTasks, isBadMove, moveAccuracy, moveLoss, moveMark, playerAccuracy, scoreFromInfo } from "../src/engine-logic.js";
import { localGameEndResult } from "../src/game-end.js";
import { extractMoveTextFromNode, moveTokens, replayMoveTexts } from "../src/move-capture.js";
import { terminalResultFromTexts } from "../src/terminal-result.js";
import { detectGamePatterns } from "../src/reflection.js";

test("detectGamePatterns flags post-castling drift and premature queen moves", () => {
  const dummyEntries = [
    { ply: 16, actualSan: "h3", category: "mistake", loss: 160 },
    { ply: 18, actualSan: "Re1", category: "inaccuracy", loss: 90 },
    { ply: 4, actualSan: "Qh5", category: "blunder", loss: 320 }
  ];
  const patterns = detectGamePatterns(dummyEntries, []);
  const ids = patterns.map((p) => p.id);
  assert.ok(ids.includes("opening-post-castling"));
  assert.ok(ids.includes("early-queen"));
});

test("detectGamePatterns flags wrong trades and king safety issues", () => {
  const history = [{ color: "w", san: "O-O" }];
  const dummyEntries = [
    { ply: 18, turn: "w", actualSan: "Bxe4", category: "mistake", loss: 260, consequenceLine: ["Nxe4"] },
    { ply: 22, turn: "w", actualSan: "Bxf7+", category: "blunder", loss: 300, consequenceLine: ["Kxf7"] },
    { ply: 20, turn: "w", actualSan: "g4", category: "blunder", loss: 350 }
  ];
  const patterns = detectGamePatterns(dummyEntries, history);
  const ids = patterns.map((p) => p.id);
  assert.ok(ids.includes("wrong-trade"));
  assert.ok(ids.includes("king-safety"));
});

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

test("isBadMove flags blunders, mistakes, inaccuracies, and misses automatically", () => {
  assert.equal(isBadMove("blunder"), true);
  assert.equal(isBadMove("mistake"), true);
  assert.equal(isBadMove("inaccuracy"), true);
  assert.equal(isBadMove("miss"), true);
  assert.equal(isBadMove({ category: "blunder", loss: 350 }), true);
  assert.equal(isBadMove({ category: "mistake", loss: 160 }), true);
  assert.equal(isBadMove({ category: "inaccuracy", loss: 85 }), true);
  assert.equal(isBadMove({ category: "best", loss: 0 }), false);
  assert.equal(isBadMove({ category: "good", loss: 15 }), false);
  assert.equal(isBadMove({ category: "excellent", loss: -100 }), false);
  assert.equal(isBadMove(null), false);
});

test("moveAccuracy and playerAccuracy compute realistic percentage scores from loss", () => {
  assert.equal(moveAccuracy(0), 100);
  assert.equal(moveAccuracy(-50), 100);
  assert.ok(moveAccuracy(80) > 65 && moveAccuracy(80) < 75);
  assert.ok(moveAccuracy(300) > 15 && moveAccuracy(300) < 35);
  assert.equal(moveAccuracy(2000), 0);

  const whiteEntries = [
    { turn: "w", loss: 0 },
    { turn: "b", loss: 300 },
    { turn: "w", loss: 20 },
    { turn: "b", loss: 150 }
  ];
  const whiteAcc = playerAccuracy(whiteEntries, "w");
  const blackAcc = playerAccuracy(whiteEntries, "b");
  assert.ok(whiteAcc > 90);
  assert.ok(blackAcc < 50);
});

test("adjacentMistakePly skips directly between blunders and mistakes", () => {
  const entries = [
    { ply: 1, category: "best", loss: 0 },
    { ply: 2, category: "inaccuracy", loss: 80 },
    { ply: 3, category: "good", loss: 20 },
    { ply: 4, category: "blunder", loss: 350 },
    { ply: 5, category: "best", loss: 0 }
  ];
  assert.equal(adjacentMistakePly(1, 1, entries), 2);
  assert.equal(adjacentMistakePly(2, 1, entries), 4);
  assert.equal(adjacentMistakePly(4, 1, entries), 4); // no more mistakes forward
  assert.equal(adjacentMistakePly(5, -1, entries), 4);
  assert.equal(adjacentMistakePly(4, -1, entries), 2);
  assert.equal(adjacentMistakePly(2, -1, entries), 2); // no more mistakes backward
});

test("dispatchParallelTasks distributes work across multiple workers preserving order", async () => {
  const items = ["fen0", "fen1", "fen2", "fen3", "fen4", "fen5", "fen6", "fen7"];
  const mockWorkers = [{ id: "w1" }, { id: "w2" }, { id: "w3" }];
  const progressLogs = [];

  const results = await dispatchParallelTasks(
    items,
    mockWorkers,
    async (worker, item, idx) => {
      // Simulate variable latency (e.g. later items finish earlier)
      await new Promise((resolve) => setTimeout(resolve, (items.length - idx) * 3));
      return { workerId: worker.id, item, idx, resultScore: idx * 10 };
    },
    (done, total) => {
      progressLogs.push({ done, total });
    }
  );

  assert.equal(results.length, items.length);
  // Verify strict ordering is maintained despite out-of-order completions
  for (let i = 0; i < items.length; i++) {
    assert.equal(results[i].idx, i);
    assert.equal(results[i].item, items[i]);
    assert.equal(results[i].resultScore, i * 10);
  }
  assert.equal(progressLogs.length, items.length);
  assert.equal(progressLogs[progressLogs.length - 1].done, items.length);
  assert.equal(progressLogs[progressLogs.length - 1].total, items.length);
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
  assert.equal(terminalResultFromTexts(["White is victorious"]), "1-0");
  assert.equal(terminalResultFromTexts(["Black is victorious"]), "0-1");
  assert.equal(terminalResultFromTexts(["Checkmate"]), "*");
  assert.equal(terminalResultFromTexts(["Game Review"]), "*");
  assert.equal(terminalResultFromTexts(["Rematch"]), "*");
  assert.equal(terminalResultFromTexts(["New 3 min"]), null);
  assert.equal(terminalResultFromTexts(["New Game"]), null);
  assert.equal(terminalResultFromTexts(["Draw by agreement"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["Hikaru won • Checkmate"]), "*");
  assert.equal(terminalResultFromTexts(["magnus won • checkmate"]), "*");
  assert.equal(terminalResultFromTexts(["opponent won • Resignation"]), "*");
  assert.equal(terminalResultFromTexts(["hikaru won • by resignation"]), "*");
  assert.equal(terminalResultFromTexts(["1/2-1/2"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["½-½"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["1-0"]), "1-0");
  assert.equal(terminalResultFromTexts(["0-1"]), "0-1");
  assert.equal(terminalResultFromTexts(["White won on time"]), "1-0");
  assert.equal(terminalResultFromTexts(["Black won on time"]), "0-1");
  assert.equal(terminalResultFromTexts(["Black timed out"]), "1-0");
  assert.equal(terminalResultFromTexts(["White timed out"]), "0-1");
  assert.equal(terminalResultFromTexts(["Stalemate"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["Draw by repetition"]), "1/2-1/2");
  assert.equal(terminalResultFromTexts(["Threefold repetition"]), "1/2-1/2");

  // In-game live action controls MUST NOT trigger completed game
  assert.equal(terminalResultFromTexts(["Offer Draw"]), null);
  assert.equal(terminalResultFromTexts(["Draw offer"]), null);
  assert.equal(terminalResultFromTexts(["Resign"]), null);
  assert.equal(terminalResultFromTexts(["Are you sure you want to resign?"]), null);
  assert.equal(terminalResultFromTexts(["Click again to resign"]), null);
  assert.equal(terminalResultFromTexts(["Draw"]), null);
  assert.equal(terminalResultFromTexts(["Cancel"]), null);
  assert.equal(terminalResultFromTexts(["1. e4 e5 Offer Draw Resign"]), null);
  assert.equal(terminalResultFromTexts(["Draw arrows"]), null);
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

test("move capture parses castling 0-0, 0-0-0, checks, and disambiguated piece moves without truncation", () => {
  assert.deepEqual(moveTokens("0-0").map((t) => t.san), ["O-O"]);
  assert.deepEqual(moveTokens("0-0-0").map((t) => t.san), ["O-O-O"]);
  assert.deepEqual(moveTokens("0-0+").map((t) => t.san), ["O-O+"]);
  assert.deepEqual(moveTokens("0-0-0#").map((t) => t.san), ["O-O-O#"]);
  assert.deepEqual(moveTokens("0-0 +0.3 2:54").map((t) => t.san), ["O-O"]);
  assert.deepEqual(moveTokens("0-0-0 -0.8 1:12").map((t) => t.san), ["O-O-O"]);

  const fakeCastleNode = {
    getAttribute: () => null,
    hasAttribute: () => false,
    textContent: "0-0",
    cloneNode: () => fakeCastleNode,
    querySelectorAll: () => []
  };
  assert.equal(extractMoveTextFromNode(fakeCastleNode), "O-O");

  const fakeCastleQueenNode = {
    getAttribute: () => null,
    hasAttribute: () => false,
    textContent: "0-0-0 2:10",
    cloneNode: () => fakeCastleQueenNode,
    querySelectorAll: () => []
  };
  assert.equal(extractMoveTextFromNode(fakeCastleQueenNode), "O-O-O");

  // Replay a 13-move Queen's Gambit opening with both Kingside and Queenside castling
  const qgd = [
    "1. d4 2:59 d5 2:58",
    "2. c4 2:56 e6 2:55",
    "3. Nc3 2:50 Nf6 2:48",
    "4. Bg5 2:45 Be7 2:40",
    "5. e3 2:38 0-0 2:35",
    "6. Qc2 2:30 c6 2:25",
    "7. 0-0-0 2:20 Nbd7 2:15"
  ];
  const replayed = replayMoveTexts(qgd);
  assert.equal(replayed.complete, true);
  assert.equal(replayed.moves.length, 14);
  assert.ok(replayed.moves.includes("O-O"));
  assert.ok(replayed.moves.includes("O-O-O"));
  assert.ok(replayed.moves.includes("Nbd7"));
});

test("move capture handles clock times, eval badges, and extracts figurines accurately", () => {
  assert.deepEqual(moveTokens("1. e4 2:59 e5 2:58 2. Nf3 +0.4 Nc6 -0.1").map((token) => token.san), ["e4", "e5", "Nf3", "Nc6"]);

  const fakeKnightNode = {
    getAttribute: (attr) => (attr === "data-figurine" ? "N" : null),
    hasAttribute: (attr) => attr === "data-figurine",
    textContent: "f3 2:45",
    cloneNode: () => fakeKnightNode,
    querySelectorAll: () => []
  };
  assert.equal(extractMoveTextFromNode(fakeKnightNode), "Nf3");

  const fakeBishopIconNode = {
    getAttribute: () => null,
    hasAttribute: () => false,
    textContent: "xd5",
    cloneNode: () => fakeBishopIconNode,
    querySelectorAll: (sel) => (sel.includes("icon-font-chess") ? [{ className: "icon-font-chess bishop-white" }] : [])
  };
  assert.equal(extractMoveTextFromNode(fakeBishopIconNode), "Bxd5");
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
