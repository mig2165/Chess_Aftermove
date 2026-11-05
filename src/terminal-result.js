export function terminalResultFromTexts(texts) {
  for (const value of texts) {
    const raw = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!raw) continue;

    // Guard against casual chat mentions or discussions
    if (/\b(?:comment|chat|message|mentions?)\b/.test(raw)) continue;

    // Filter out live in-game interactive texts before matching
    const text = raw
      .replace(/\boffer(?:s|ed|ing)?\s+draw\b/g, "")
      .replace(/\bdraw\s+offer(?:ed|s)?\b/g, "")
      .replace(/\bare you sure you want to resign\b/g, "")
      .replace(/\bclick (?:again )?to resign\b/g, "")
      .replace(/\bclaim draw\b/g, "")
      .replace(/\bdraw arrows?\b/g, "")
      .trim();

    // If the entire text was an in-game action button or empty after cleaning, ignore it
    if (!text || text === "resign" || text === "draw" || text === "cancel") continue;

    // 1. Direct standard chess game result scores
    if (/(?:^|\s|\b)1-0(?:\s|\b|$)/.test(text)) return "1-0";
    if (/(?:^|\s|\b)0-1(?:\s|\b|$)/.test(text)) return "0-1";
    if (/(?:1\/2\s*-\s*1\/2|½\s*-\s*½)/.test(text)) return "1/2-1/2";

    // 2. Explicit Draw outcomes
    if (
      /\bdraw\s*(?:by|•|·|–|—|-|:)\s*(?:agreement|stalemate|repetition|threefold|insufficient|50.move|fifty.move)/.test(text) ||
      /\b(?:stalemate|threefold repetition|50.move rule|fifty.move rule|insufficient material)\b/.test(text) ||
      /\bgame\s+(?:drawn|ended in a draw)\b/.test(text) ||
      /\bagreed to a draw\b/.test(text) ||
      /^(?:draw|game drawn|drawn)$/.test(text)
    ) {
      return "1/2-1/2";
    }

    // 3. White victory expressions
    if (
      /white (?:won|wins|is victorious|victorious)/.test(text) ||
      /black (?:resigned|resigns|flagged|ran out of time|timed out)/.test(text) ||
      /\bwon by white\b/.test(text) ||
      /\bwhite won\b[\s•·|–—\-:]*\b(?:by checkmate|by resignation|on time|by timeout)/.test(text)
    ) {
      return "1-0";
    }

    // 4. Black victory expressions
    if (
      /black (?:won|wins|is victorious|victorious)/.test(text) ||
      /white (?:resigned|resigns|flagged|ran out of time|timed out)/.test(text) ||
      /\bwon by black\b/.test(text) ||
      /\bblack won\b[\s•·|–—\-:]*\b(?:by checkmate|by resignation|on time|by timeout)/.test(text)
    ) {
      return "0-1";
    }

    // 5. Generic game-end signals (outcome confirmed; winner may be indicated by username):
    if (
      /\b(?:won|lost)\b[\s•·|–—\-:]*\b(?:by checkmate|by resignation|on time|by timeout|abandonment|abandoned|checkmate|resignation)\b/.test(text) ||
      /\b(?:white|black|you|opponent|[a-z0-9_-]+)\s+(?:resigned|timed out|ran out of time|flagged)\b/.test(text) ||
      /\b(?:resigned|resignation)\b/.test(text) ||
      /\b(?:ran out of time|timed out|flagged)\b/.test(text) ||
      /\b(?:you won|you lost)\b/.test(text) ||
      /\bgame (?:over|finished|ended|abandoned)\b/.test(text) ||
      /\bcheckmate\b/.test(text) ||
      /\b(?:game review|review game|rematch)\b/.test(text) ||
      /\b(?:victory|defeat)\b/.test(text)
    ) {
      return "*";
    }
  }
  return null;
}
