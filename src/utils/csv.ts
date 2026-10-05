/**
 * Shared CSV export utilities.
 * XLSX exports were removed for performance (the xlsx library is heavy and was
 * loaded on every page). Only Nusuk .xlsx *imports* still use the xlsx library
 * (see VisasPage.tsx). All downloads below are plain CSV.
 */

/** Escape one CSV cell: wrap in quotes if it contains comma, quote, or newline. */
export function escapeCSVCell(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert an array of objects to a CSV string.
 * The header row is taken from the first object's keys (insertion order).
 * Dates/numbers are written as-is; strings are escaped when needed.
 */
export function rowsToCSV(rows: Record<string, any>[]): string {
  const data = rows.length > 0 ? rows : [{ Note: 'No records in the selected period.' }];
  const headers = Object.keys(data[0]);
  const lines: string[] = [headers.map(escapeCSVCell).join(',')];
  for (const row of data) {
    lines.push(headers.map((h) => escapeCSVCell((row as Record<string, any>)[h])).join(','));
  }
  return lines.join('\n');
}

/**
 * Convert an array-of-arrays (first row = header) to a CSV string.
 * Useful for statements that need title/blank/footer rows mixed with tables.
 */
export function aoaToCSV(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map(escapeCSVCell).join(',')).join('\n');
}

/** Trigger a browser download of a raw CSV string. */
export function downloadCSVText(csvContent: string, fileName: string): void {
  const withBom = '﻿' + csvContent; // BOM so Excel opens UTF-8 correctly
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dated(base: string): string {
  return `${base}-${new Date().toISOString().split('T')[0]}`;
}

/**
 * Convert rows to CSV and trigger a download.
 * `fileName` should be a base name (without extension or date); a YYYY-MM-DD
 * suffix and .csv extension are added automatically.
 */
export function downloadCSV(rows: Record<string, any>[], fileName: string): void {
  downloadCSVText(rowsToCSV(rows), dated(fileName));
}
