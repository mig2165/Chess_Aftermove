# Aftermove interface

## Direction

An operate-first extension for a player moving between a Chess.com board and a finished-game review. The interface treats recording status as the primary information, keeps the popup compact, and reserves the larger review surface for move-by-move explanations.

## Visual language

- Graphite green-black surfaces (`#101719`, `#172120`) echo a quiet analysis room without mimicking a chessboard.
- Chalk white carries the main text. Muted sage provides secondary information.
- Chartreuse (`#d8f36a`) marks recording safety, primary actions, and engine findings.
- Segoe UI is the workhorse interface face; Georgia is reserved for the coach's occasional emphasis.
- Thin green-charcoal separators organize sections; avoid decorative card grids.

## Interaction rules

- The active-game state and silence guarantee are visible before a recording action.
- Recording is not stoppable from the popup; all review paths remain locked until a game-over signal is confirmed.
- Analysis progress belongs to the post-game review page. Move findings and AI replies never appear in the game tab.
- Arrow keys, notation selection, and on-screen controls navigate the finished-game replay. Optional, muted-by-design synthesized sounds acknowledge selected blunders and checkmates only in the review.
- Keyboard focus remains visible; statuses and errors use live regions; controls retain explicit action labels.

## Responsive behavior

The extension popup stays a single-column task surface. The review page uses a wider reading measure on desktop and collapses findings and actions to one column on narrow viewports.
