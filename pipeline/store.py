"""
================================================================================
 notebase pipeline — stage 3: store.py
================================================================================
Writes all chunks and their vectors into a local SQLite database.

READS:   build/chunks.json   (stage 2 — chunks + 384-dim vectors)
WRITES:  notes.db            SQLite database with two tables:

    chunks         ordinary table: id, subject, filename, page_number,
                   chunk_index, text
    chunk_vectors  sqlite-vec "vec0" virtual table holding one float[384]
                   embedding per chunk; its rowid mirrors chunks.id, which
                   is how a KNN hit joins back to its metadata

WHY A DATABASE AT ALL? The deployed web app only reads search-index.json,
but notes.db gives you local, queryable access to the exact same data:
KNN searches from the sqlite3 CLI, sanity checks with plain SQL, and a
foundation for any future local tooling — without loading a 4 MB JSON blob
into a script every time.

notes.db is a DERIVED ARTIFACT: it is gitignored and rebuilt from scratch on
every run (the old file is deleted first). The PDFs are the source of truth.

SELF-TEST: after inserting, we run a vec0 KNN query using the first chunk's
own embedding and assert that chunk comes back as its own nearest neighbour.
That one query proves vectors round-trip through serialization correctly.

CLI:
    python pipeline/store.py
================================================================================
"""

import json
import logging
import sqlite3
import struct
import sys

import sqlite_vec

from config import CHUNKS_PATH, DB_PATH, EMBED_DIM

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("store")


def serialize_vector(vector: list[float]) -> bytes:
    """Pack a float list into the little-endian float32 blob vec0 expects."""
    return struct.pack(f"<{len(vector)}f", *vector)


def open_db() -> sqlite3.Connection:
    """Create a fresh notes.db with the sqlite-vec extension loaded.

    Deletes any existing file first — the DB is derived, never edited in
    place. Exits with an actionable error on Python builds compiled without
    loadable-extension support (some python.org macOS builds).
    """
    DB_PATH.unlink(missing_ok=True)
    db = sqlite3.connect(DB_PATH)
    if not hasattr(db, "enable_load_extension"):
        log.error(
            "This Python's sqlite3 was built without loadable-extension "
            "support, which sqlite-vec needs. Use a Homebrew/pyenv Python."
        )
        sys.exit(1)
    db.enable_load_extension(True)
    sqlite_vec.load(db)
    db.enable_load_extension(False)  # extension loaded; close the door again
    return db


def create_schema(db: sqlite3.Connection) -> None:
    """Create the chunks table and the vec0 virtual table (see docstring)."""
    db.execute(
        """
        CREATE TABLE chunks (
            id          INTEGER PRIMARY KEY,
            subject     TEXT    NOT NULL,
            filename    TEXT    NOT NULL,
            page_number INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text        TEXT    NOT NULL
        )
        """
    )
    db.execute(
        f"CREATE VIRTUAL TABLE chunk_vectors USING vec0(embedding float[{EMBED_DIM}])"
    )


def insert_chunks(db: sqlite3.Connection, records: list[dict]) -> None:
    """Insert all chunks + vectors in one transaction, rowids kept in sync."""
    with db:  # one transaction for the whole batch
        for row_id, record in enumerate(records, start=1):
            db.execute(
                "INSERT INTO chunks (id, subject, filename, page_number,"
                " chunk_index, text) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    row_id,
                    record["subject"],
                    record["filename"],
                    record["page_number"],
                    record["chunk_index"],
                    record["text"],
                ),
            )
            db.execute(
                "INSERT INTO chunk_vectors (rowid, embedding) VALUES (?, ?)",
                (row_id, serialize_vector(record["embedding"])),
            )


def self_test(db: sqlite3.Connection, records: list[dict]) -> None:
    """KNN-search the first chunk's own vector; it must be its own top hit."""
    top = db.execute(
        """
        SELECT rowid FROM chunk_vectors
        WHERE embedding MATCH ? AND k = 1
        ORDER BY distance
        """,
        (serialize_vector(records[0]["embedding"]),),
    ).fetchone()
    if top is None or top[0] != 1:
        log.error("Vector self-test FAILED: chunk 1 is not its own nearest "
                  "neighbour — vector storage is broken.")
        sys.exit(1)


def main() -> None:
    """Run stage 3 and print a one-line summary (see module docstring)."""
    if not CHUNKS_PATH.is_file():
        log.error("Missing %s — run pipeline/embed.py first.", CHUNKS_PATH)
        sys.exit(1)
    records: list[dict] = json.loads(CHUNKS_PATH.read_text())
    if not records:
        log.error("build/chunks.json contains no chunks.")
        sys.exit(1)

    db = open_db()
    try:
        create_schema(db)
        insert_chunks(db, records)
        self_test(db, records)
        pdf_count = db.execute("SELECT COUNT(DISTINCT filename) FROM chunks").fetchone()[0]
    finally:
        db.close()

    print(
        f"Store complete: {len(records)} chunks from {pdf_count} PDFs written to "
        f"{DB_PATH.name} (vector self-test passed)"
    )


if __name__ == "__main__":
    main()
