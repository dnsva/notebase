"""
================================================================================
 notebase pipeline — stage 4: export.py
================================================================================
Exports the database into the static JSON file the web app searches.

READS:   notes.db             (stage 3 — chunks + vectors)
WRITES:  search-index.json    committed to the repo, fetched by the frontend

FORMAT:
    {
      "model": "all-MiniLM-L6-v2",     // frontend sanity-checks these two
      "dimensions": 384,               // fields before searching
      "generated_at": "2026-07-14T12:00:00Z",
      "chunks": [
        {"subject": "math", "filename": "vectors.pdf", "page_number": 3,
         "chunk_index": 0, "text": "...", "embedding": [0.013254, ...]},
        ...
      ]
    }

Embedding floats are rounded to EXPORT_FLOAT_DECIMALS (6) places — far below
ranking-relevant precision, roughly 40% smaller on disk. GitHub Pages then
gzips the file in transit, so the browser typically downloads ~1/3 of the
size printed by this script's summary.

CLI:
    python pipeline/export.py
================================================================================
"""

import json
import logging
import sqlite3
import struct
import sys
from datetime import datetime, timezone

import sqlite_vec

from config import DB_PATH, EMBED_DIM, EXPORT_FLOAT_DECIMALS, INDEX_PATH, MODEL_NAME

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("export")


def deserialize_vector(blob: bytes) -> list[float]:
    """Unpack a vec0 float32 blob back into a rounded list of floats."""
    vector = struct.unpack(f"<{len(blob) // 4}f", blob)
    return [round(v, EXPORT_FLOAT_DECIMALS) for v in vector]


def read_chunks(db: sqlite3.Connection) -> list[dict]:
    """Read every chunk joined with its embedding, ordered by id."""
    rows = db.execute(
        """
        SELECT c.subject, c.filename, c.page_number, c.chunk_index, c.text,
               v.embedding
        FROM chunks c
        JOIN chunk_vectors v ON v.rowid = c.id
        ORDER BY c.id
        """
    ).fetchall()
    return [
        {
            "subject": subject,
            "filename": filename,
            "page_number": page_number,
            "chunk_index": chunk_index,
            "text": text,
            "embedding": deserialize_vector(blob),
        }
        for subject, filename, page_number, chunk_index, text, blob in rows
    ]


def main() -> None:
    """Run stage 4 and print a one-line summary (see module docstring)."""
    if not DB_PATH.is_file():
        log.error("Missing %s — run pipeline/store.py first.", DB_PATH)
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    db.enable_load_extension(True)
    sqlite_vec.load(db)  # needed to read the vec0 virtual table
    db.enable_load_extension(False)
    try:
        chunks = read_chunks(db)
    finally:
        db.close()

    if not chunks:
        log.error("notes.db contains no chunks — nothing to export.")
        sys.exit(1)

    index = {
        "model": MODEL_NAME,
        "dimensions": EMBED_DIM,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "chunks": chunks,
    }
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False))

    pages = {(c["filename"], c["page_number"]) for c in chunks}
    pdfs = {c["filename"] for c in chunks}
    size_mb = INDEX_PATH.stat().st_size / 1_000_000
    print(
        f"Export complete: {len(chunks)} chunks covering {len(pages)} pages of "
        f"{len(pdfs)} PDFs -> {INDEX_PATH.name} ({size_mb:.2f} MB)"
    )


if __name__ == "__main__":
    main()
