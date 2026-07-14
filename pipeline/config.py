"""
================================================================================
 notebase pipeline — config.py
================================================================================
Single source of truth for every path and tunable used by the pipeline.

Nothing else in pipeline/ hardcodes a path or a magic number: if you want to
change the OCR resolution, the chunk size, or where files live, this is the
only file you edit. Every stage imports from here.

The directory layout this file describes (all paths relative to the repo root):

    pdfs/<subject>/<name>.pdf   INPUT  — scanned notes, one folder per subject
    build/ocr-output.json       stage 1 output (ocr.py)   — raw text per page
    build/chunks.json           stage 2 output (embed.py) — chunks + vectors
    notes.db                    stage 3 output (store.py) — SQLite + sqlite-vec
    search-index.json           stage 4 output (export.py) — shipped to the web app
================================================================================
"""

from pathlib import Path

# ------------------------------------------------------------------ paths ---
# ROOT is the repository root. This file lives at <root>/pipeline/config.py,
# so two .parent hops get us there. Every other path derives from ROOT —
# the pipeline works no matter what directory you invoke it from.
ROOT: Path = Path(__file__).resolve().parent.parent

PDFS_DIR: Path = ROOT / "pdfs"                   # input PDFs, organised by subject
BUILD_DIR: Path = ROOT / "build"                 # intermediate stage handoffs (gitignored)
OCR_OUTPUT_PATH: Path = BUILD_DIR / "ocr-output.json"
CHUNKS_PATH: Path = BUILD_DIR / "chunks.json"
DB_PATH: Path = ROOT / "notes.db"                # local vector DB (gitignored)
INDEX_PATH: Path = ROOT / "search-index.json"    # final artifact (committed)

# Subject label for any PDF sitting directly under pdfs/ instead of a
# subject subfolder.
DEFAULT_SUBJECT: str = "general"

# ------------------------------------------------------------------- OCR ----
# 300 DPI is the standard sweet spot for Tesseract: below ~200 accuracy drops
# sharply, above ~300 you pay render time for little gain.
RENDER_DPI: int = 300

# Pillow contrast multiplier applied after grayscale conversion. 1.0 = no
# change; 2.0 doubles contrast, which helps faint pencil/pen strokes stand
# out from the paper background before Tesseract sees them.
CONTRAST_FACTOR: float = 2.0

# Hybrid text extraction: pages from born-digital PDFs (e.g. LaTeX exports)
# carry an embedded text layer that is *perfectly* accurate — far better than
# OCR of the rendered image. If a page's embedded text has at least this many
# characters we trust it and skip OCR entirely; otherwise we treat the page
# as an image scan and OCR it. 50 chars is enough to reject pages whose only
# "text" is stray artifacts (page numbers, watermarks).
MIN_EMBEDDED_TEXT_CHARS: int = 50

# ------------------------------------------------------------- chunking -----
# Chunks are word-count windows over each page's text. 200-word chunks with
# 50 words of overlap mean a concept straddling a chunk boundary still appears
# whole in at least one chunk.
CHUNK_WORDS: int = 200        # target words per chunk
OVERLAP_WORDS: int = 50       # words shared between consecutive chunks
# A trailing window shorter than this is merged into nothing (dropped) unless
# it is the page's ONLY chunk — short pages still deserve to be indexed, but
# a 5-word tail of an already-covered page is pure noise.
MIN_CHUNK_WORDS: int = 20

# ------------------------------------------------------------ embeddings ----
# MUST stay in sync with the frontend (web/src/search.js), which loads the
# same model as "Xenova/all-MiniLM-L6-v2" via transformers.js. Both sides use
# mean pooling + L2 normalization so cosine similarity == dot product.
MODEL_NAME: str = "all-MiniLM-L6-v2"
EMBED_DIM: int = 384

# Decimal places kept when writing embeddings to search-index.json.
# 6 decimals is far below any ranking-relevant precision and shrinks the
# JSON by roughly 40% versus full float repr.
EXPORT_FLOAT_DECIMALS: int = 6
