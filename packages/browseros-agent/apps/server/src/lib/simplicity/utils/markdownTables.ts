/* Dependency-free GFM markdown table -> CSV conversion, used by the answer
   export's "CSV (tables)" download (see MessageActions/Download.tsx). No new
   npm dependency — this feature is explicitly dep-free only, so table
   detection/parsing here is a small heuristic rather than a full markdown
   parser: a table is recognised as a row containing at least one `|`
   immediately followed by a GFM separator row (dashes, optional leading/
   trailing `:` alignment markers), which is exactly how GFM itself defines
   a table's start. */

/** A pipe escaped as `\|` is kept as a literal pipe rather than treated as a
 * column boundary — the "handle escaped pipes minimally" the spec calls
 * for, not a full inline-markdown parser. */
const splitRow = (line: string): string[] => {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);

  const cells: string[] = [];
  let current = '';

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());

  return cells;
};

const isTableRow = (line: string) => line.includes('|');

const isSeparatorRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('-')) return false;

  const cells = splitRow(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

/** Every table found in `markdown`, each as header row + data rows (the
 * separator row itself is dropped). */
export const extractMarkdownTables = (markdown: string): string[][][] => {
  const lines = markdown.split(/\r?\n/);
  const tables: string[][][] = [];

  let i = 0;
  while (i < lines.length) {
    const headerLine = lines[i];
    const separatorLine = lines[i + 1];

    if (
      headerLine !== undefined &&
      separatorLine !== undefined &&
      isTableRow(headerLine) &&
      isSeparatorRow(separatorLine)
    ) {
      const rows: string[][] = [splitRow(headerLine)];

      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== '' && isTableRow(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }

      tables.push(rows);
      i = j;
    } else {
      i++;
    }
  }

  return tables;
};

export const hasMarkdownTable = (markdown: string): boolean =>
  extractMarkdownTables(markdown).length > 0;

/** Standard CSV quoting: only wraps a cell in quotes when it contains a
 * comma, quote or newline, doubling any inner quotes. */
const csvEscape = (cell: string): string =>
  /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

const tableToCsv = (rows: string[][]): string =>
  rows.map((row) => row.map(csvEscape).join(',')).join('\n');

/** Every table in `markdown`, each converted to CSV and concatenated with a
 * blank line between — one downloadable file covering every table in the
 * answer. */
export const markdownTablesToCsv = (markdown: string): string =>
  extractMarkdownTables(markdown)
    .map(tableToCsv)
    .join('\n\n');
