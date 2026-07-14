"""
================================================================================
 notebase pipeline — run_all.py
================================================================================
Runs the whole pipeline, in order, with one command:

    python pipeline/run_all.py

      stage 1  ocr.py     pdfs/**            -> build/ocr-output.json
      stage 2  embed.py   build/ocr-output.json -> build/chunks.json
      stage 3  store.py   build/chunks.json  -> notes.db
      stage 4  export.py  notes.db           -> search-index.json

This is a FULL REBUILD — no caching, no incremental logic. At notebase's
scale (spec: < ~300 pages) the whole run takes minutes, and "rerun one
command, get a correct index" is worth far more than saved seconds.

Each stage is also independently runnable (python pipeline/<stage>.py) and
leaves an inspectable artifact behind, so if something looks off you can
bisect the pipeline by eye.

Any stage that fails stops the run (its own error message says why).
================================================================================
"""

import ocr
import embed
import store
import export


def main() -> None:
    """Run all four stages in order; each prints its own summary line."""
    for stage in (ocr, embed, store, export):
        print(f"\n--- running {stage.__name__}.py " + "-" * 40)
        stage.main()
    print("\nPipeline finished: search-index.json is up to date.")


if __name__ == "__main__":
    main()
