# Aftermove

An early Chrome extension prototype for silent Chess.com game recording and post-game Stockfish review.

## What it does

- **Record a game:** Open a Chess.com game, click the Aftermove extension icon, then select **Record this game**. While the game is active, the extension reads the move list locally. It does not send move data anywhere, analyze moves, or show chess feedback.
- **Review only after the result:** Once recording starts, the extension locks all reviews—even in other tabs—until the tracked legal moves prove a rules-based ending (checkmate or draw), or a Chess.com game-result element confirms a platform ending such as resignation or timeout. **Check for game end** retries both checks without reading unrelated page text.
- **Clear a stale recording:** If the game tab is gone and Aftermove remains locked, choose **Stop recording & discard capture**. Confirm only when no live game is in progress; this discards the incomplete recording and unlocks review. A PGN selected during the lock is queued and opens after stopping.
- **Fetch a recent game:** Enter a Chess.com username to look up its latest public game with PGN data.
- **Import a PGN:** Upload a `.pgn` or text file, or paste a completed game's PGN if automatic capture is unavailable.
- **Analyze locally:** Stockfish.js runs in the review tab, on the player's device. Scenario-based move explanations work without a cloud AI.
- **Replay visually:** Step through the analyzed position with the arrow keys, on-screen arrows, or by selecting notation; flip the board to view it from Black's perspective. A compact advantage bar beneath the board updates Stockfish's White/Black evaluation and shows the evaluation swing for each selected move; it is an engine scale, not a win-probability claim. Every move has a distinct symbol and accessible label for good, best, excellent, inaccurate, mistaken, blunder, or checkmate.
- **Hear optional cues:** With **Move sounds** enabled, selecting a blunder or checkmate move plays a short, synthesized cue in the finished-game review. Toggle sounds off at any time. Cues never play during an active game.
- **Ask an optional AI coach:** In the extension settings, enable AI and add your own OpenAI API key. The key is stored in local extension storage. PGN and Stockfish findings are sent to OpenAI only when you ask a question, after the game is over.

Recording relies on Chess.com's rendered move list plus local chess rules and scoped terminal-result UI. This first version is intentionally limited to Chess.com and Chrome; Chess.com may change its page structure, so live capture must be tested against current games. The capture gate is fail-closed: an invalid or incomplete move list cannot end a recording.

Use the extension only in ways permitted by Chess.com's current rules. It does not provide live assistance; the review controls are globally locked while a recorded game is in progress.

## Reusable open-source projects

- [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) (about 1.2k stars when checked) provides the free, lite Stockfish WASM engine. It is GPL-3.0; distribution obligations are called out in `THIRD_PARTY_NOTICES.md`.
- [jhlywa/chess.js](https://github.com/jhlywa/chess.js) (about 4.4k stars when checked) validates and replays SAN/PGN moves. It is BSD-2-Clause.
- The repository searches did not surface a Chess.com observer extension with more than 1k stars, so this prototype uses known Chess.com DOM selectors and a conservative end-of-game gate rather than depending on an unverified extension.

## Build and install locally

Requires Node.js 20+ and npm.

```sh
npm install
npm run setup:engine
npm run build
```

`npm run setup:engine` downloads the Stockfish 19 lite single-threaded WASM engine and GPLv3 license into the ignored `vendor/stockfish/` directory. Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the generated `dist/` folder.

## Test live recording before publishing

The extension does **not** need to be published or hosted online. Install the generated `dist/` folder locally using Chrome's **Load unpacked** flow. Then:

1. Sign in to Chess.com and open a live game page in Chrome.
2. Open Aftermove and click **Record this game**. The popup should say it is recording silently; the lookup and PGN review actions lock.
3. Play the game normally. No evaluation or move commentary should appear.
4. Let the game finish and wait for Chess.com's result UI. Aftermove should open the review only after it sees the completed result and all listed moves.
5. If no review opens, inspect the page's move-list/result elements in Chrome DevTools: Chess.com may have changed the DOM selectors. The extension deliberately remains locked rather than guessing that a game ended.

For safe testing, use a casual/unrated game or a finished game page. To test analysis without live tracking, paste a completed game's PGN or look up a public account's recent game.

To run the automated tests:

```sh
npm test
```

## Known prototype limits

- Chess.com can rename or restructure the move-list and result elements; the observer currently supports several known move-list selectors. Rules-based endings are detected locally; resignations and timeouts still depend on a visible, scoped Chess.com result element.
- The "best"/"excellent"/"good" labels use Stockfish evaluations; "brilliant" is not labeled yet because the current single-principal-variation analysis does not reliably identify a true tactical sacrifice.
- The recorder keeps moves in memory in the Chess.com tab; navigating away or reloading mid-game ends that capture. It does not attempt to restore or reconstruct an interrupted recording.
- Public archive lookup only works for games Chess.com exposes through its published player API.
- AI coaching requires a user-owned OpenAI API key and incurs any costs charged by that provider. AI is off by default.
- Stockfish.js is GPL-3.0; see `THIRD_PARTY_NOTICES.md`. Review the license and source-distribution requirements before distributing a packaged extension.
