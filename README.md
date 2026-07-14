# notebase

Semantic search over scanned handwritten school notes.

Drop a PDF of scanned notes into `pdfs/<subject>/`, push, and a couple of
minutes later you can search all of your notes **by concept** — not exact
words — at **https://dnsva.github.io/notebase/**, landing on the exact page
of the exact PDF.

There is no server. A Python pipeline turns the PDFs into a static search
index; the browser does the actual searching.

## How a search works

```
 you type "how do I add two vectors"
   │
   ▼
 browser embeds the query into a 384-dim vector        (transformers.js,
   │                                                    all-MiniLM-L6-v2, WASM)
   ▼
 dot product against every chunk in search-index.json  (pre-computed by the
   │                                                    Python pipeline)
   ▼
 top 10 pages, ranked → click → PDF opens at that page (iframe #page=N)
```

This works because the pipeline embedded every ~200-word chunk of every page
with the *same model* the browser uses for the query. Text with similar
meaning lands close together in vector space, so "adding vectors" finds the
vector-addition page even if those exact words never appear.

## How the index is built (`pipeline/`)

Four stages, each independently runnable, each leaving an inspectable
artifact. `python pipeline/run_all.py` runs them all:

| stage | reads | writes | what it does |
|---|---|---|---|
| [`ocr.py`](pipeline/ocr.py) | `pdfs/**` | `build/ocr-output.json` | Extracts text per page. Born-digital pages (LaTeX, typed) use their embedded text layer verbatim; image scans are rendered at 300 DPI, preprocessed (grayscale, 2× contrast), and OCR'd with Tesseract. |
| [`embed.py`](pipeline/embed.py) | `build/ocr-output.json` | `build/chunks.json` | Splits pages into 200-word chunks (50-word overlap) and embeds each with all-MiniLM-L6-v2 (local, no API). |
| [`store.py`](pipeline/store.py) | `build/chunks.json` | `notes.db` | Writes chunks + vectors into SQLite via sqlite-vec, for local querying/debugging. |
| [`export.py`](pipeline/export.py) | `notes.db` | `search-index.json` | Exports everything as the JSON file the web app fetches. |

All paths and tunables (DPI, chunk sizes, model name, …) live in one place:
[`pipeline/config.py`](pipeline/config.py).

## The web app (`web/`)

React + Vite, no server, no search library. [`src/search.js`](web/src/search.js)
is the entire engine: fetch index → embed query → dot-product every chunk →
top 10, deduplicated per page. [`scripts/copy-assets.js`](web/scripts/copy-assets.js)
mirrors `pdfs/` and `search-index.json` into `public/` before every dev/build,
so the repo stores each file exactly once.

The first ever visit downloads the embedding model (~25 MB) from the Hugging
Face CDN; after that it's cached by the browser.

## CI/CD (`.github/workflows/pipeline.yml`)

Push to `main` touching `pdfs/**` (or the pipeline/frontend code) and GitHub
Actions: reruns the whole pipeline → commits the fresh `search-index.json`
back (only if its content changed, `[skip ci]`) → builds the site → deploys
to GitHub Pages. Manual rerun: Actions tab → *notebase pipeline* → *Run
workflow*.

## Adding notes

1. Scan/export your notes to a PDF.
2. Put it in `pdfs/<subject>/` — the folder name becomes the subject badge
   in search results. (A PDF directly in `pdfs/` gets subject "general".)
3. Commit and push to `main`. Done — the Action does the rest.

> **Privacy note:** everything under `pdfs/` becomes publicly downloadable
> on the GitHub Pages site.

## Running locally

```bash
# one-time setup
brew install tesseract                     # or: apt install tesseract-ocr
python3.12 -m venv .venv                   # needs a Python whose sqlite3 can
.venv/bin/pip install -r requirements.txt  # load extensions (Homebrew: yes,
                                           # python.org macOS builds: no)

# rebuild the index after adding PDFs
.venv/bin/python pipeline/run_all.py

# run the web app
cd web && npm install && npm run dev       # http://localhost:5173
```

## Known limitations (accepted, see SPEC.md §8)

- **Handwriting OCR is best-effort.** Tesseract is built for print; messy
  handwriting comes out garbled, which lowers search recall. Audit what was
  actually extracted per page in `build/ocr-output.json` (each page is
  tagged `"embedded"` or `"ocr"`).
- **Mobile Safari** ignores `#page=N` — PDFs open at page 1 there.
- The whole index rebuilds on every run — a non-issue at notebook scale
  (< ~300 pages), and much easier to reason about than caching.
