/**
 * Escape a single cell value for safe TSV pasting into Google Sheets / Excel.
 *
 * Line breaks and tabs are flattened first because direct clipboard pasting in
 * spreadsheet apps does not consistently honour quoted multi-line TSV cells.
 * Quotes are then escaped using RFC 4180-style quoting.
 */
export function tsvEscapeCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value).replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    if (s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**
 * Build a full TSV string from a 2D array, with proper cell escaping.
 * Each inner array is one row; values are tab-separated; rows are newline-separated.
 */
export function buildTsv(rows: unknown[][]): string {
    return rows.map(row => row.map(tsvEscapeCell).join('\t')).join('\n');
}
