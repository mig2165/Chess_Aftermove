export function terminalResultFromTexts(texts) {
  for (const value of texts) {
    const text = value.toLowerCase().replace(/\s+/g, " ").trim();
    if (/\b1-0\b|white (won|wins)|white won/.test(text)) return "1-0";
    if (/\b0-1\b|black (won|wins)|black won/.test(text)) return "0-1";
    if (/1\/2-1\/2|\bdraw\b|stalemate|insufficient material|threefold repetition|50.move rule|fifty.move rule/.test(text)) return "1/2-1/2";
    if (/white (resigned|resigns|flagged|ran out of time)/.test(text)) return "0-1";
    if (/black (resigned|resigns|flagged|ran out of time)/.test(text)) return "1-0";
    if (/resigned|resignation|flagged|timeout|time out|on time|abandoned|disconnected/.test(text)) return "*";
  }
  return null;
}
