// ============================================================================
// notebase web — lib/embeddings.js
// ============================================================================
// The one place the embedding model lives. Everything that needs a vector —
// the global search embedding a query, and (Stage 2) the question editor
// embedding a saved question — goes through embedText().
//
// Model: Xenova/all-MiniLM-L6-v2 via transformers.js on the WebAssembly
// backend. This is the SAME model (converted to ONNX) that the Python
// pipeline uses for note chunks, and we apply the same mean pooling +
// L2 normalization — so every vector in the app, whether it came from
// Python or the browser, lives in one shared 384-dim space where cosine
// similarity == dot product.
//
// The model is ~25 MB, downloaded from the Hugging Face CDN on the first
// ever visit and browser-cached after that. loadEmbedder() is idempotent:
// callers can race it freely, the pipeline is only created once.
// ============================================================================

import { pipeline } from "@huggingface/transformers";

// Must stay in sync with MODEL_NAME / EMBED_DIM in pipeline/config.py.
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EXPECTED_MODEL = "all-MiniLM-L6-v2";
export const EXPECTED_DIMENSIONS = 384;

let embedderPromise = null;

/**
 * Load the feature-extraction pipeline once; subsequent calls reuse it.
 *
 * @param {(progress: number) => void} [onProgress] — 0..100 while model
 *   files download, for the UI's loading bar. Only the first caller's
 *   callback is used (the model only downloads once).
 */
export function loadEmbedder(onProgress) {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", MODEL_ID, {
      progress_callback: (info) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          onProgress?.(Math.round(info.progress));
        }
      },
    });
  }
  return embedderPromise;
}

/**
 * Embed a string into a unit-length Float32Array(384).
 * Mean pooling + normalization mirror the Python pipeline exactly.
 */
export async function embedText(text) {
  const embedder = await loadEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return output.data;
}
