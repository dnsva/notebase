// ============================================================================
// notebase web — lib/semanticSearch.js
// ============================================================================
// Corpus-agnostic semantic ranking. Given a query vector and any array of
// items that carry an `embedding`, score every item by dot product and
// return the best ones. Knows nothing about notes, questions, or the UI —
// callers describe how to group and what to keep.
//
// Dot product == cosine similarity here because both sides are unit vectors
// (see lib/embeddings.js). Brute force is deliberate: even a few thousand
// items x 384 dims is ~10^6 float ops, microseconds in JS — no index needed.
// ============================================================================

/** Dot product of a Float32Array query and a plain-array item embedding. */
export function dot(queryVector, embedding) {
  let sum = 0;
  for (let i = 0; i < queryVector.length; i++) {
    sum += queryVector[i] * embedding[i];
  }
  return sum;
}

/**
 * Rank `items` against `queryVector`, deduplicated, best-first.
 *
 * @param {Float32Array} queryVector
 * @param {Array<object>} items — each must have an `embedding` array
 * @param {object} [options]
 * @param {(item) => string} [options.groupBy] — items mapping to the same
 *   key keep only their best-scoring representative (e.g. one hit per PDF
 *   page instead of one per overlapping chunk). Default: no grouping.
 * @param {number} [options.topK=10]
 * @returns {Array<object>} copies of the winning items with a `score` field
 */
export function rank(queryVector, items, { groupBy, topK = 10 } = {}) {
  const best = new Map();
  for (const item of items) {
    const score = dot(queryVector, item.embedding);
    // Every item gets its own key when no grouping is requested.
    const key = groupBy ? groupBy(item) : best.size + Math.random();
    const existing = best.get(key);
    if (!existing || score > existing.score) {
      best.set(key, { ...item, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}
