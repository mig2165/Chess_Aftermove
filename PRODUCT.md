# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Chess.com players who want a useful, approachable explanation of their finished games.

## Product Purpose

Observe a Chess.com game only after the player explicitly starts recording, then help them understand the finished game through engine-backed review and optional conversation.

## Positioning

The observer stays silent during play: it records moves locally and does not expose analysis, hints, reactions, or notifications until a completed game is confirmed.

## Operating Context

The first supported experience is a Chrome extension for Chess.com. Players can record the game in the active Chess.com tab or look up the latest publicly available game by Chess.com username.

## Capabilities and Constraints

- Stockfish should analyze completed games locally and for free.
- Explanations should be friendly and lightly humorous, without mocking the player.
- A built-in scenario-based voice should work without an AI provider. Optional AI coaching may explain completed-game engine findings and answer questions about the game.
- AI is opt-in, requires a user-provided API key, and must only receive game data after the game ends and the player requests AI coaching.
- Live move capture depends on Chess.com DOM behavior. When a finished game cannot be positively detected, keep the review locked rather than analyzing an active game.
- Browser support beyond Chrome and sites beyond Chess.com are open decisions.

## Brand Commitments

Use a lighthearted, encouraging coach voice. Keep the extension completely silent about chess content while a game is in progress.

## Evidence on Hand

The initial brief and README describe a Chess.com game observer, post-game review, interactive explanations, and a playful tone. No existing application code or brand assets were present.

## Product Principles

- Silence during play is a product guarantee.
- Make engine findings understandable, not just numerical.
- Keep core game capture and engine analysis on-device.
- Keep humor kind and optional AI transparent.
