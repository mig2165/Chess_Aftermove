export function displaySquare(row, column, flipped) {
  const boardRow = flipped ? 7 - row : row;
  const boardColumn = flipped ? 7 - column : column;
  return {
    row: boardRow,
    column: boardColumn,
    name: `${String.fromCharCode(97 + boardColumn)}${8 - boardRow}`
  };
}

export function boardPoint(square, flipped) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const column = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return `${(column + 0.5) * 12.5},${(row + 0.5) * 12.5}`;
}
