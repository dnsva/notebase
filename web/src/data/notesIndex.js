// ============================================================================
// notebase web — data/notesIndex.js
// ============================================================================
// Everything about the PDF notes corpus: loading/validating the pipeline's
// search-index.json, grouping its file list into subject folders for the
// Notes browser, and resolving a note's static PDF URL.
//
// The index is produced by pipeline/export.py — see its docstring for the
// exact format. Two consumers here:
//   * SearchPage ranks index.chunks semantically (via lib/semanticSearch)
//   * NotesPage renders index.files as subject folders -> PDF lists
// ============================================================================

import { EXPECTED_MODEL, EXPECTED_DIMENSIONS } from "../lib/embeddings.js";

/**
 * Fetch and validate search-index.json.
 * Uses Vite's BASE_URL so the same code works at "/" in dev and under
 * "/<repo>/" on GitHub Pages.
 */
export async function loadNotesIndex() {
  const response = await fetch(`${import.meta.env.BASE_URL}search-index.json`);
  if (!response.ok) {
    throw new Error(`Could not load search index (HTTP ${response.status})`);
  }
  const index = await response.json();
  if (index.model !== EXPECTED_MODEL || index.dimensions !== EXPECTED_DIMENSIONS) {
    throw new Error(
      `Index was built with ${index.model}/${index.dimensions}d but this app ` +
        `expects ${EXPECTED_MODEL}/${EXPECTED_DIMENSIONS}d — rebuild the pipeline ` +
        `or update lib/embeddings.js to match.`
    );
  }
  return index;
}

/**
 * Group the index's file list into subject folders for the Notes browser.
 * Returns [{subject, files: [{subject, filename, pages, chunks}], pages}]
 * sorted by subject. Older indexes without a `files` array (pre-Stage 2)
 * degrade to an empty list rather than crashing.
 */
export function subjectFolders(index) {
  const bySubject = new Map();
  for (const file of index.files ?? []) {
    if (!bySubject.has(file.subject)) bySubject.set(file.subject, []);
    bySubject.get(file.subject).push(file);
  }
  return [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, files]) => ({
      subject,
      files,
      pages: files.reduce((sum, f) => sum + f.pages, 0),
    }));
}

/**
 * Static URL of a note PDF, for the inline viewer.
 *
 * Mirrors the pipeline's subject convention (pipeline/ocr.py): a PDF's
 * subject is its folder under pdfs/, and files directly under pdfs/ get the
 * subject "general" — those live at the top level, not in a "general/" dir.
 */
export function pdfUrl({ subject, filename }) {
  const dir = subject === "general" ? "" : `${subject}/`;
  return `${import.meta.env.BASE_URL}pdfs/${dir}${encodeURIComponent(filename)}`;
}
