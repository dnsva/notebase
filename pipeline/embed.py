"""
================================================================================
 notebase pipeline — stage 2: embed.py
================================================================================
Splits each page's text into overlapping chunks and embeds every chunk.

READS:   build/ocr-output.json   (stage 1 — text per page)
WRITES:  build/chunks.json       list of {subject, filename, page_number,
                                  chunk_index, text, embedding}

CHUNKING. Embedding models capture one "topic" per vector, so whole pages
are too coarse. We slide a CHUNK_WORDS (200) word window over each page,
advancing CHUNK_WORDS - OVERLAP_WORDS (150) words per step, so consecutive
chunks share OVERLAP_WORDS (50) words. The overlap guarantees a concept that
straddles a boundary appears intact in at least one chunk. A trailing window
shorter than MIN_CHUNK_WORDS (20) is dropped as noise — unless it is the
page's only chunk, because short pages still deserve to be searchable.

EMBEDDING. all-MiniLM-L6-v2 (sentence-transformers) maps each chunk to a
384-dim vector. We pass normalize_embeddings=True so vectors are unit-length,
which lets the frontend rank by plain dot product (== cosine similarity).
The model runs fully locally; the first run downloads ~90 MB of weights to
the Hugging Face cache, after which it is offline.

  !! The frontend embeds queries with the SAME model (Xenova/all-MiniLM-L6-v2
  !! via transformers.js), also mean-pooled and normalized. If you change the
  !! model here, change web/src/search.js and config.EMBED_DIM to match.

CLI:
    python pipeline/embed.py
================================================================================
"""

import json
import logging
import sys

from sentence_transformers import SentenceTransformer

from config import (
    CHUNK_WORDS,
    CHUNKS_PATH,
    EMBED_DIM,
    MIN_CHUNK_WORDS,
    MODEL_NAME,
    OCR_OUTPUT_PATH,
    OVERLAP_WORDS,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("embed")


def chunk_words(text: str) -> list[str]:
    """Split text into overlapping word-window chunks.

    Windows are CHUNK_WORDS long and advance by CHUNK_WORDS - OVERLAP_WORDS
    words. Trailing windows shorter than MIN_CHUNK_WORDS are dropped unless
    they are the only chunk. Whitespace is normalized as a side effect of
    the split/join round-trip.
    """
    words = text.split()
    if not words:
        return []

    step = CHUNK_WORDS - OVERLAP_WORDS
    chunks: list[str] = []
    for start in range(0, len(words), step):
        window = words[start : start + CHUNK_WORDS]
        # Drop a short tail — its words are already covered by the previous
        # window's overlap — but never drop a page's only chunk.
        if len(window) < MIN_CHUNK_WORDS and chunks:
            break
        chunks.append(" ".join(window))
        if start + CHUNK_WORDS >= len(words):
            break  # this window reached the end of the page
    return chunks


def main() -> None:
    """Run stage 2 and print a one-line summary (see module docstring)."""
    if not OCR_OUTPUT_PATH.is_file():
        log.error("Missing %s — run pipeline/ocr.py first.", OCR_OUTPUT_PATH)
        sys.exit(1)

    pages: list[dict] = json.loads(OCR_OUTPUT_PATH.read_text())

    # Build every chunk record first (without vectors) so the model can
    # embed them all in one efficient batched call afterwards.
    records: list[dict] = []
    pages_with_text = 0
    for page in pages:
        texts = chunk_words(page["text"])
        if texts:
            pages_with_text += 1
        for chunk_index, text in enumerate(texts):
            records.append(
                {
                    "subject": page["subject"],
                    "filename": page["filename"],
                    "page_number": page["page_number"],
                    "chunk_index": chunk_index,  # 0-based within its page
                    "text": text,
                }
            )

    if not records:
        log.error("No text chunks produced — is build/ocr-output.json empty?")
        sys.exit(1)

    log.info("Loading %s (first run downloads the model) ...", MODEL_NAME)
    model = SentenceTransformer(MODEL_NAME)
    # normalize_embeddings=True -> unit vectors -> dot product == cosine.
    vectors = model.encode(
        [r["text"] for r in records],
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    assert vectors.shape == (len(records), EMBED_DIM), (
        f"Model returned {vectors.shape}, expected ({len(records)}, {EMBED_DIM}) — "
        "did MODEL_NAME and EMBED_DIM in config.py drift apart?"
    )
    for record, vector in zip(records, vectors):
        record["embedding"] = vector.tolist()

    CHUNKS_PATH.write_text(json.dumps(records, ensure_ascii=False))
    print(
        f"Embedding complete: {len(records)} chunks from {pages_with_text} non-empty "
        f"pages, {EMBED_DIM}-dim vectors ({MODEL_NAME}) -> build/{CHUNKS_PATH.name}"
    )


if __name__ == "__main__":
    main()
