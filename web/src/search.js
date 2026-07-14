// ============================================================================
// notebase web — src/search.js
// ============================================================================
// The entire search engine. No server: the browser does everything.
//
//   1. loadIndex()     fetches search-index.json (built by pipeline/export.py)
//                      and validates it was generated with the expected model.
//   2. loadEmbedder()  loads all-MiniLM-L6-v2 via transformers.js on the
//                      WebAssembly backend. ~25 MB downloaded from the
//                      Hugging Face CDN on the very first visit, then served
//                      from the browser cache.
//   3. search()        embeds the query, scores EVERY chunk by dot product,
//                      and returns the 10 best pages.
//
// WHY DOT PRODUCT? The Python pipeline embeds chunks with
// normalize_embeddings=True, and we embed queries with normalize: true below.
// Both sides are unit vectors, so cosine similarity reduces to a plain dot
// product. The models must also match: the pipeline uses
// sentence-transformers "all-MiniLM-L6-v2"; here we load
// "Xenova/all-MiniLM-L6-v2", the same weights converted to ONNX. Both use
// mean pooling. If you ever change the model in pipeline/config.py, change
// MODEL_ID below to match — the index's "model" field is checked at load
// time to catch exactly this kind of drift.
//
// PERFORMANCE: brute-force scoring is fine at this scale. A few hundred
// chunks x 384 multiplications is ~10^5 float ops — microseconds in JS.
// No vector database needed in the browser.
// ============================================================================

import { pipeline } from "@huggingface/transformers";

// Must stay in sync with MODEL_NAME / EMBED_DIM in pipeline/config.py.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const EXPECTED_MODEL = "all-MiniLM-L6-v2";
const EXPECTED_DIMENSIONS = 384;
const TOP_K = 10;

/**
 * Fetch and validate search-index.json.
 * Uses Vite's BASE_URL so the same code works at "/" in dev and under
 * "/<repo>/" on GitHub Pages.
 */
export async function loadIndex() {
  const response = await fetch(`${import.meta.env.BASE_URL}search-index.json`);
  if (!response.ok) {
    throw new Error(`Could not load search index (HTTP ${response.status})`);
  }
  const index = await response.json();
  if (index.model !== EXPECTED_MODEL || index.dimensions !== EXPECTED_DIMENSIONS) {
    throw new Error(
      `Index was built with ${index.model}/${index.dimensions}d but this app ` +
        `expects ${EXPECTED_MODEL}/${EXPECTED_DIMENSIONS}d — rebuild the pipeline ` +
        `or update search.js to match.`
    );
  }
  return index;
}

/**
 * Load the query embedder (feature-extraction pipeline, WASM backend).
 *
 * @param {(progress: number) => void} onProgress — called with 0..100 while
 *   model files download, so the UI can show a progress bar.
 */
export async function loadEmbedder(onProgress) {
  return pipeline("feature-extraction", MODEL_ID, {
    progress_callback: (info) => {
      // transformers.js reports per-file events; "progress" ones carry a
      // 0..100 percentage for the file currently downloading.
      if (info.status === "progress" && typeof info.progress === "number") {
        onProgress(Math.round(info.progress));
      }
    },
  });
}

/**
 * Embed `query` and rank every chunk in `index` against it.
 *
 * Returns the TOP_K best results, deduplicated so each (filename, page)
 * appears once at its best score — the user cares about which PAGE to open,
 * and overlapping chunks from the same page would otherwise crowd the list.
 *
 * @param {string} query        the user's search text
 * @param {object} index        parsed search-index.json
 * @param {object} embedder     pipeline returned by loadEmbedder()
 * @returns {Promise<Array<{subject, filename, page_number, text, score}>>}
 */
export async function search(query, index, embedder) {
  // Mean pooling + normalization mirrors the Python side exactly.
  const output = await embedder(query, { pooling: "mean", normalize: true });
  const queryVector = output.data; // Float32Array(384)

  // Best chunk per page, keyed by filename\0page (\0 can't appear in names).
  const bestPerPage = new Map();
  for (const chunk of index.chunks) {
    let score = 0;
    for (let i = 0; i < queryVector.length; i++) {
      score += queryVector[i] * chunk.embedding[i];
    }
    const key = `${chunk.filename}\0${chunk.page_number}`;
    const existing = bestPerPage.get(key);
    if (!existing || score > existing.score) {
      bestPerPage.set(key, { ...chunk, score });
    }
  }

  return [...bestPerPage.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

/**
 * Static URL of a result's PDF, for the inline viewer.
 *
 * Mirrors the pipeline's subject convention (pipeline/ocr.py): a PDF's
 * subject is its folder under pdfs/, and files directly under pdfs/ get the
 * subject "general" — those live at the top level, not in a "general/" dir.
 */
export function pdfUrl(result) {
  const dir = result.subject === "general" ? "" : `${result.subject}/`;
  return `${import.meta.env.BASE_URL}pdfs/${dir}${encodeURIComponent(result.filename)}`;
}
