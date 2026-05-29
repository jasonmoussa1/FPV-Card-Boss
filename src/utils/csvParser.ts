/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FpvAssignment } from '../types';

/**
 * Robust RFC-4180 compliant CSV parser.
 * Correctly handles nested quotes, multiline cells, and comma variations.
 */
export function parseCSV(text: string): string[][] {
  const results: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(value);
      results.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (row.length > 0 || value !== '') {
    row.push(value);
    results.push(row);
  }

  return results;
}

/**
 * Parses raw FPV Shot List CSV and extracts a clean list of assignments.
 */
export function extractFpvAssignments(rawCsvText: string): FpvAssignment[] {
  const rows = parseCSV(rawCsvText);
  const assignments: FpvAssignment[] = [];

  let headerRowIndex = -1;
  let headerRow: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const hasHeaderString = row.some(cell => {
      const trimmed = cell.trim();
      return trimmed === "ARTIST / CONTENT" || trimmed.includes("ARTIST / CONTENT");
    });

    if (hasHeaderString) {
      headerRowIndex = i;
      headerRow = row;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error("True header 'ARTIST / CONTENT' not found in CSV.");
    return [];
  }

  // Column Mapping Locators
  let artistColIndex = -1;
  let assigneeColIndex = -1;
  let flyTimeColIndex = -1;
  let notesColIndex = -1;

  for (let idx = 0; idx < headerRow.length; idx++) {
    const val = headerRow[idx].trim().toUpperCase();
    if (val === "ARTIST / CONTENT" || val.includes("ARTIST / CONTENT")) {
      artistColIndex = idx;
    } else if (val === "ASSIGNEE") {
      assigneeColIndex = idx;
    } else if (val === "FLY TIME") {
      flyTimeColIndex = idx;
    } else if (val === "NOTES") {
      notesColIndex = idx;
    }
  }

  // Structural Fallbacks
  if (artistColIndex === -1) artistColIndex = 0;
  if (assigneeColIndex === -1) assigneeColIndex = 3;
  if (flyTimeColIndex === -1) flyTimeColIndex = 4;
  if (notesColIndex === -1) notesColIndex = 8;

  let currentDaySection = "";

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    const firstCol = row[0] ? row[0].trim() : "";
    const secondCol = row[1] ? row[1].trim() : "";

    // Stop parser if overview footer grid reached
    if (firstCol.toLowerCase() === "day 1" && secondCol.toLowerCase() === "day 1") {
      break;
    }

    // Detect Day Section Markers
    const hasDayWord = /\bDAY\b/i.test(firstCol);
    const otherColumnsEmpty = row.slice(1).every(cell => !cell || cell.trim() === "");
    const isDayMarker = hasDayWord && otherColumnsEmpty && firstCol.length > 3;

    if (isDayMarker) {
      currentDaySection = firstCol;
      continue;
    }

    const artistVal = row[artistColIndex] ? row[artistColIndex].trim() : "";
    const assigneeVal = row[assigneeColIndex] ? row[assigneeColIndex].trim() : "";
    const flyTimeVal = row[flyTimeColIndex] ? row[flyTimeColIndex].trim() : "";
    const notesVal = row[notesColIndex] ? row[notesColIndex].trim() : "";

    if (!artistVal || !assigneeVal) continue;

    // Filters administration rows
    const artistLower = artistVal.toLowerCase();
    if (
      artistLower === "guidelines" ||
      artistLower.startsWith("guidelines:") ||
      artistLower === "call times" ||
      artistLower.startsWith("call times:") ||
      artistLower === "move to main fest grounds"
    ) {
      continue;
    }

    assignments.push({
      daySection: currentDaySection || "Unknown Day/Section",
      pilot: assigneeVal,
      assignment: artistVal,
      flyTime: flyTimeVal,
      notes: notesVal
    });
  }

  return assignments;
}
