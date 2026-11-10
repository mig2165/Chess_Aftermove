# Chrome Web Store Submission Guide for Aftermove

This document contains all the copy, justifications, and asset references needed to publish **Aftermove — Chess Review** to the Chrome Web Store Developer Dashboard.

---

## 1. Quick File Map (What Was Created)

| Asset | Location | Purpose |
| :--- | :--- | :--- |
| **Production ZIP** | [`aftermove.zip`](file:///c:/Users/migue/Chess_ai/aftermove.zip) | Drag-and-drop upload in the Chrome Developer Dashboard. |
| **Privacy Policy** | [`PRIVACY.md`](file:///c:/Users/migue/Chess_ai/PRIVACY.md) | Policy text to host on GitHub / Notion to get your public URL. |
| **Store Icon** | [`icons/icon128.png`](file:///c:/Users/migue/Chess_ai/icons/icon128.png) | 128×128 px store icon. |
| **Screenshot 1** | [`store-assets/screenshot1-review.png`](file:///c:/Users/migue/Chess_ai/store-assets/screenshot1-review.png) | 1280×800 px — Full chessboard replay, blunder `‼` badge, best-move green arrow, advantage bar, & annotated move list. |
| **Screenshot 2** | [`store-assets/screenshot2-breakdown.png`](file:///c:/Users/migue/Chess_ai/store-assets/screenshot2-breakdown.png) | 1280×800 px — Post-game match banner, player CAPS accuracies, & White vs. Black move quality breakdown table. |
| **Screenshot 3** | [`store-assets/screenshot3-freeplay.png`](file:///c:/Users/migue/Chess_ai/store-assets/screenshot3-freeplay.png) | 1280×800 px — Interactive Freeplay ("What-If") mode with legal move highlights & live Stockfish evaluation. |
| **Screenshot 4** | [`store-assets/screenshot4-continuation-coach.png`](file:///c:/Users/migue/Chess_ai/store-assets/screenshot4-continuation-coach.png) | 1280×800 px — Move explanation card, 3-move Best Continuation sequence preview, & Coach’s notes. |
| **Screenshot 5** | [`store-assets/screenshot5-reflection.png`](file:///c:/Users/migue/Chess_ai/store-assets/screenshot5-reflection.png) | 1280×800 px — Tactical Reflection, Elo pattern clusters & multi-game habit tracking. |
| **Promo Tile** | [`store-assets/promo-440x280.png`](file:///c:/Users/migue/Chess_ai/store-assets/promo-440x280.png) | 440×280 px — Small promotional card for Chrome Web Store search. |

---

## 2. Store Listing Copy (Copy & Paste)

### Product Name
```text
Aftermove — Chess Review
```

### Summary / Short Description (113 / 132 chars)
```text
A silent Chess.com game recorder with private, post-game Stockfish reviews.
```

### Detailed Description
```text
The game is over. Now we can talk.

Aftermove is a silent Chess.com companion that privately records your games and opens an instant, post-game engine review powered by Stockfish running directly on your computer.

KEY FEATURES

• Automatic Game Detection: Aftermove observes your game on Chess.com without any noisy overlays or popups during live play. The moment your game concludes, it detects the result and prepares your review.
• 100% Local Stockfish Review: Your moves never leave your device. Stockfish WebAssembly analyzes every position locally with zero subscription fees.
• Best Move Arrows & Continuation Sequences: Whenever a suboptimal move is played (from an inaccuracy to a blunder), Aftermove automatically displays the best engine alternative on the board, along with an interactive 3-move preview sequence showing how the game would have unfolded.
• Player Accuracies & Side-by-Side Breakdown: View White vs. Black accuracy percentages (CAPS) and an intuitive side-by-side move quality breakdown comparing Brilliant, Great, Best, Good, Inaccuracies, Mistakes, and Blunders.
• Quick Mistake Navigation: Use on-screen jump buttons or Shift + Arrow keys to navigate directly between blunders and mistakes.
• Interactive Freeplay Analysis: Test alternate moves from any board state to see how Stockfish evaluates your ideas.
• Multi-Worker Parallel Engine: Leverages your CPU's multi-core architecture to analyze games 2.5x to 4x faster.
• Optional AI Coach: Connect your OpenAI or Google Gemini API key to ask natural-language questions about your completed games.

FAIR PLAY & PRIVACY FIRST

Aftermove is strictly a post-game learning tool. Engine calculations are hard-locked during live games and no live hints or evaluation bars are ever displayed while a match is ongoing. Your games and preferences stay private in your browser.
```

### Category
```text
Fun
```
*(or "Productivity")*

---

## 3. Privacy Practices Tab (Copy & Paste)

### Single Purpose Declaration
```text
Privately record completed Chess.com games and provide post-game Stockfish engine reviews without live hints.
```

### Permission Justifications
- **`activeTab`**:
  ```text
  Used only when clicking the extension popup to detect if the current active browser tab is an active or completed Chess.com game.
  ```
- **`storage`**:
  ```text
  Used to persist local user review preferences (analysis depth, sounds, theme) and the locally recorded game PGN across sessions.
  ```
- **Host Permissions (`https://www.chess.com/*`, `https://chess.com/*`)**:
  ```text
  Required for the content script to record move notation from the Chess.com DOM and detect when a game has completed.
  ```
- **Host Permissions (`https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`)**:
  ```text
  Used only if the user explicitly enables the optional AI Coach feature to send completed game findings for coaching feedback using their own personal API key.
  ```

### Data Usage Declarations
- **Data Collection**: Check **"No, I do not collect user data"**.
- **Data Use Certification**: Check the box certifying compliance with Google's Single Purpose Policy.
- **Trader Status**: Select **"This is a non-trader account"**.
- **Privacy Policy URL**: Paste your public link to your `PRIVACY.md` (see instructions below).

