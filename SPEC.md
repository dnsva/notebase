# notebase — Specification

Semantic search engine for handwritten high-school notes scanned to PDF.
A local Python pipeline OCRs and embeds every page; a static React app
(deployed on GitHub Pages) lets you search by concept and jump to the exact
page of the exact PDF.

**Status:** awaiting approval. No code has been written yet.

---

## 1. Decisions locked in (from clarifying questions)

| Decision | Choice |
|---|---|
| PDF privacy | Fully public: PDFs committed to a public repo and served from GitHub Pages. |
| OCR engine | Tesseract only — fully local, no API keys. Best-effort accuracy on handwriting is accepted; preprocessing is tuned to help. |
| Scale | Small (< ~300 pages). `search-index.json` ships as plain JSON with full-precision embeddings rounded to 6 decimals (keeps the file roughly 40% smaller with no measurable ranking impact). |
| PDF viewer | Browser-native `<iframe src="…​.pdf#page=N">`. Zero dependencies; page-jump works in desktop Chrome/Firefox/Edge. Known limitation: unreliable page-jumping on mobile Safari. |

Additional decisions made in this spec (flagging so you can veto):

- **Full rebuild every run.** At <300 pages the whole pipeline (OCR + embed)
  takes minutes, so there is no incremental/caching logic. Simple and
  re-explainable beats fast here.
- **CI commits `search-index.json` back to `main`** using the built-in
  `GITHUB_TOKEN` (with `[skip ci]` in the commit message to avoid loops).
- **Vite base path** comes from an environment variable
  (`VITE_BASE=/​<repo-name>/` in CI), so the repo can be named anything.
- **PDFs are not duplicated in git.** `web/public/pdfs/` is gitignored; the
  build step copies `pdfs/` into it so Vite serves them. One source of truth.

---

## 2. Architecture

```
                      LOCAL / CI (Python 3.11+)
┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌───────────────────┐
│ pdfs/** │──▶│  ocr.py  │──▶│ embed.py  │──▶│ store.py │──▶│    export.py      │
│ scanned │   │ render @ │   │ chunk ~200│   │ SQLite + │   │ notes.db ──▶      │
│  PDFs   │   │ 300 DPI, │   │ words /50 │   │sqlite-vec│   │ search-index.json │
└─────────┘   │ Pillow,  │   │ overlap,  │   │ (local   │   └─────────┬─────────┘
              │ Tesseract│   │ MiniLM-L6 │   │ artifact)│             │
              └──────────┘   └───────────┘   └──────────┘             │ committed
                                                                      ▼
                      BROWSER (static, GitHub Pages)
┌──────────────────────────────────────────────────────────────────────────────┐
│ React + Vite app                                                             │
│  1. fetch search-index.json          3. cosine similarity vs every chunk     │
│  2. embed query via transformers.js  4. top-10 result cards → iframe #page=N │
│     (all-MiniLM-L6-v2, WASM)                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key property: **search is 100% client-side.** No server, no API keys, no
network calls at query time except the one-time model + index downloads.

The two halves must agree on the embedding model: `all-MiniLM-L6-v2`
(384 dimensions) via sentence-transformers in Python and via
`Xenova/all-MiniLM-L6-v2` in transformers.js. Both sides use mean pooling
and L2 normalization so cosine similarity reduces to a dot product.

---

## 3. Repository layout

```
notebase/
├── pdfs/                          # INPUT — drop scanned PDFs here, one folder per subject
│   ├── math/
│   ├── physics/
│   └── chemistry/
├── pipeline/
│   ├── __init__.py
│   ├── config.py                  # single source of truth: ROOT, all paths, all tunables
│   ├── ocr.py                     # PDF → 300 DPI PNG → Pillow preprocess → Tesseract → ocr-output.json
│   ├── embed.py                   # page text → ~200-word chunks (50 overlap) → 384-dim vectors → chunks.json
│   ├── store.py                   # chunks + vectors → notes.db (sqlite-vec)
│   ├── export.py                  # notes.db → search-index.json
│   └── run_all.py                 # convenience: runs all four stages in order
├── web/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js             # base path from VITE_BASE env var
│   ├── scripts/
│   │   └── copy-assets.js         # copies ../pdfs → public/pdfs and ../search-index.json → public/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                # layout: search box, status line, results, viewer
│   │   ├── search.js              # index loading, query embedding, cosine ranking
│   │   └── components/
│   │       ├── SearchBox.jsx
│   │       ├── ResultCard.jsx     # subject, filename, page, snippet, score
│   │       └── PdfViewer.jsx      # <iframe src="pdfs/…#page=N">
│   └── public/                    # pdfs/ and search-index.json land here at build time (gitignored)
├── .github/workflows/pipeline.yml # push to main touching pdfs/** → rebuild index → deploy Pages
├── notes.db                       # gitignored — local/CI pipeline artifact
├── build/                         # gitignored — intermediate JSON handoffs between stages
├── search-index.json              # committed — the deployed search index
├── requirements.txt
├── .gitignore
├── SPEC.md                        # this file
└── README.md                      # how it works + how to add notes, re-explainable to future-you
```

Deviations from the layout sketched in the brief, and why:

- Added `pipeline/config.py` so **every** path and tunable (DPI, contrast
  factor, chunk sizes, model name) lives in one commented file instead of
  being repeated across four scripts.
- Stages hand off through explicit intermediate files in `build/`
  (`ocr-output.json`, `chunks.json`) rather than in-memory imports. Each
  stage is independently runnable and inspectable — you can open
  `build/ocr-output.json` and read exactly what Tesseract saw.
- `web/public/pdfs/` is populated by a copy script at build time, not
  committed, to avoid storing every PDF twice in git.
- Added `run_all.py` so "rebuild everything" is one command locally and one
  step in CI.

---

## 4. Pipeline stages (Phase 1)

All stages share these conventions:

- Type hints on every function; docstrings on every public function.
- A large comment block at the top of each file explaining what it does,
  what it reads, what it writes, and why.
- No hardcoded paths: everything derives from `ROOT = Path(__file__).parent.parent`
  in `config.py`.
- Per-page failures (unreadable PDF, Tesseract error, empty page) are logged
  as warnings via the `logging` module and skipped — one bad page never
  kills the run.
- Each stage ends by printing a one-line summary to stdout, e.g.
  `OCR complete: 47 pages across 6 PDFs (2 pages skipped)`.

### 4.1 `ocr.py`

1. Discover PDFs: `pdfs/<subject>/<name>.pdf` — the first directory level is
   the subject label. Files directly under `pdfs/` get subject `"general"`.
2. For each page: PyMuPDF renders at 300 DPI → Pillow converts to grayscale
   (`ImageOps.grayscale`) and applies `ImageEnhance.Contrast(...).enhance(2.0)`
   → `pytesseract.image_to_string` extracts text.
3. Startup check: if the `tesseract` binary is missing, exit immediately with
   an actionable message (`brew install tesseract` / `apt install tesseract-ocr`)
   rather than failing page-by-page.
4. Output `build/ocr-output.json`:
   `[{subject, filename, page_number, text}, ...]` (page_number is 1-based).
   Pages whose OCR text is empty/whitespace are recorded with empty text and
   counted in the summary, but excluded from chunking downstream.

### 4.2 `embed.py`

1. Read `build/ocr-output.json`.
2. Chunk each page's text by word count: 200-word windows advancing 150 words
   (i.e. 50-word overlap). A final short window is kept if it is ≥ 20 words
   or is the page's only chunk (so short pages still get indexed).
3. Load `sentence-transformers all-MiniLM-L6-v2`; encode all chunks in one
   batched call with `normalize_embeddings=True`.
4. Output `build/chunks.json`:
   `[{subject, filename, page_number, chunk_index, text, embedding}, ...]`
   where `chunk_index` is 0-based within its page and `embedding` is a list
   of 384 floats.

### 4.3 `store.py`

1. Recreate `notes.db` from scratch each run (delete if present — it's a
   derived artifact, never the source of truth).
2. Schema:
   ```sql
   CREATE TABLE chunks (
       id           INTEGER PRIMARY KEY,
       subject      TEXT NOT NULL,
       filename     TEXT NOT NULL,
       page_number  INTEGER NOT NULL,
       chunk_index  INTEGER NOT NULL,
       text         TEXT NOT NULL
   );
   CREATE VIRTUAL TABLE chunk_vectors USING vec0(
       embedding float[384]
   );
   -- chunk_vectors.rowid == chunks.id
   ```
3. Load `build/chunks.json`, insert rows + vectors in one transaction.
4. Verification query at the end: a sample `vec0` KNN search against the
   first chunk's own embedding must return that chunk as its top hit —
   proves the vector store round-trips correctly.

*(Note: sqlite-vec is required by the brief and gives you local KNN querying
of notes.db for debugging; the deployed app never touches it.)*

### 4.4 `export.py`

1. Read all rows (chunks joined with vectors) from `notes.db`.
2. Write `search-index.json`:
   ```json
   {
     "model": "all-MiniLM-L6-v2",
     "dimensions": 384,
     "generated_at": "2026-07-14T00:00:00Z",
     "chunks": [
       {"subject": "...", "filename": "...", "page_number": 1,
        "chunk_index": 0, "text": "...", "embedding": [0.0132, ...]}
     ]
   }
   ```
   Floats rounded to 6 decimal places. The top-level metadata lets the
   frontend sanity-check it loaded a compatible index.
3. Summary: chunk count, page count, PDF count, file size.

Estimated index size at maximum scale (~300 pages ≈ ~450 chunks):
~4 MB raw, ~1.5 MB after GitHub Pages' gzip — fine as a static fetch.

### 4.5 Verification — Phase 1

- `python pipeline/ocr.py` against one test PDF prints extracted text stats.
- `python pipeline/run_all.py` on `pdfs/` produces `notes.db` with ≥ 1 row
  (checked via the built-in KNN self-test) and a `search-index.json` that
  parses as JSON with all expected fields.

---

## 5. Frontend (Phase 2)

React functional components + hooks only. Vite. No UI framework — small
hand-written CSS.

### 5.1 Startup

1. `search.js` fetches `search-index.json` (relative URL, so it works under
   any base path) and validates `model`/`dimensions`.
2. transformers.js loads `Xenova/all-MiniLM-L6-v2` as a `feature-extraction`
   pipeline (WASM backend, model fetched from the Hugging Face CDN on first
   visit, then browser-cached).
3. The UI shows load state explicitly: *loading index → loading model (with
   progress) → ready*. Search is disabled until ready. Both are one-time
   costs per visit (~25 MB model download on the first ever visit).

### 5.2 Query flow

1. User submits a query → embed with `pooling: "mean", normalize: true`
   (matching the Python side exactly).
2. Score every chunk by dot product (≡ cosine since both sides are
   normalized). At ≤ a few thousand chunks, brute force in JS is instant.
3. Deduplicate to the best-scoring chunk per (filename, page), then show the
   top 10 as `ResultCard`s: subject badge, filename, page number, text
   snippet, similarity score as a percentage.
4. Clicking a card opens `PdfViewer`: an `<iframe>` pointed at
   `pdfs/<subject>/<file>.pdf#page=N` in a side/bottom panel.

### 5.3 Asset copying

`web/scripts/copy-assets.js` (plain Node, no dependency) copies
`../pdfs/**` → `web/public/pdfs/` and `../search-index.json` →
`web/public/`. It runs automatically before `vite dev` and `vite build`
via npm `predev`/`prebuild` scripts.

### 5.4 Verification — Phase 2

Run `npm run dev`, search a phrase known to appear in the test notes,
confirm ≥ 1 result renders and clicking it opens the PDF at the right page.

---

## 6. CI/CD (Phase 3)

`.github/workflows/pipeline.yml`, triggered on push to `main` with changes
under `pdfs/**` (plus `workflow_dispatch` for manual reruns after
pipeline-code changes).

Jobs/steps:

1. **Rebuild index** — ubuntu-latest: checkout; `apt-get install tesseract-ocr`;
   setup Python 3.11 with pip cache; `pip install -r requirements.txt`;
   cache the sentence-transformers model directory between runs;
   `python pipeline/run_all.py`.
2. **Commit index** — commit `search-index.json` back to `main` as
   `github-actions[bot]` with `[skip ci]`, only if it actually changed.
3. **Deploy** — `npm ci && npm run build` in `web/` with
   `VITE_BASE=/<repo>/`; upload `web/dist` and deploy via the official
   `actions/deploy-pages` flow (`permissions: contents: write, pages: write,
   id-token: write`).

### 6.1 Verification — Phase 3

Push a dummy PDF change; confirm the Action goes green, the bot commit with
the updated index appears, and the GitHub Pages URL serves the updated app
end-to-end.

---

## 7. Coding standards (restated + additions)

- Python: type hints everywhere, docstrings on public functions, `logging`
  for warnings, graceful per-page failure handling, stdout summary per stage.
- Big explanatory comment block at the top of every file (pipeline and
  frontend) — the repo should be re-explainable from the files alone.
- React: functional components and hooks only.
- All paths via `pathlib` from the single `ROOT` constant in `config.py`.
- Dependencies strictly limited to the approved stack. requirements.txt:
  `pymupdf`, `pillow`, `pytesseract`, `sentence-transformers`, `sqlite-vec`.
  web: `react`, `react-dom`, `@huggingface/transformers`, `vite` + React plugin.

---

## 8. Known limitations (accepted)

- **Handwriting OCR quality.** Tesseract will garble cursive/messy writing;
  search recall degrades with OCR quality. Mitigations: 300 DPI, grayscale +
  2.0 contrast, and embeddings' partial tolerance of noisy text. `build/ocr-output.json`
  makes it easy to audit what OCR actually extracted per page.
- **Mobile Safari page-jump.** The `#page=N` fragment is not honored by
  iOS PDF rendering; the PDF still opens, just at page 1.
- **First-visit model download** (~25 MB) before search works; cached
  thereafter.
- **Public exposure.** Everything in `pdfs/` is world-readable once pushed.

---

## 9. Open items for you

1. **Repo name / Pages URL** — needed for `VITE_BASE` in CI (I'll default to
   `/notebase/` and the site at `https://<user>.github.io/notebase/`).
   *(Resolved: `dnsva/notebase`, https://dnsva.github.io/notebase/)*
2. **A couple of sample scanned PDFs** to develop and verify against — or I
   can generate synthetic "handwriting-style" test PDFs for the verification
   steps and you swap in real scans later.
   *(Resolved: one LaTeX PDF provided; hybrid embedded-text/OCR added.)*

---
---

# PART II — Stage 2: Responsive app, notes browser, question banks

**Status:** approved 2026-07-14; Phases 4–6 built and deployed.

Stage 2 turns the single search page into a full study web-app with three
sections — **Search**, **Notes**, **Question Banks** — fully responsive,
with question banks editable directly in the browser and persisted to this
GitHub repo.

## 10. Decisions locked in (from clarifying questions)

| Decision | Choice |
|---|---|
| Question-bank persistence | **GitHub-backed.** The app reads/writes JSON files in this repo via the GitHub API. Editing requires a fine-grained personal access token (contents read/write on this repo only), pasted once per device and kept in localStorage. Without a token the app is read-only — viewing and searching still work for anyone. |
| Rich text editor | **TipTap** (ProseMirror-based WYSIWYG): bold, italic, underline, headings, bullet/numbered lists, code. Content stored as TipTap JSON documents. |
| Math | **KaTeX** via TipTap's mathematics extension — inline `$…$` and block math in questions and answers. |
| Images | Questions and answers can include **uploaded images**: client-side downscaled (max 1600 px), committed to `data/assets/` in the repo via the GitHub API, referenced by URL in the rich text. |
| Global search | **Semantic-only**, as today: search on submit using all-MiniLM-L6-v2, now across notes AND question banks. Best-effort term highlighting inside matched snippets (query words that literally occur are bolded). |

New dependencies this stage (all frontend): `@tiptap/react`,
`@tiptap/starter-kit`, `@tiptap/extension-image`,
`@tiptap/extension-mathematics` + `katex`, and `react-router-dom`
(HashRouter — hash URLs need zero GitHub Pages configuration). Approving
this spec approves these.

## 11. Data model (new `data/` tree in the repo)

```
data/
├── question-banks/
│   └── <bank-id>.json       one file per question bank (small writes, no
│                            cross-bank conflicts)
└── assets/
    └── <asset-id>.<ext>     images uploaded from the editor
```

Bank file format:

```json
{
  "id": "vectors-basics",
  "title": "Vectors — basics",
  "folder": "math",                    // "/"-separated folder path; folders
  "updated_at": "2026-07-14T…Z",       // exist implicitly via banks in them
  "questions": [
    {
      "id": "q_k3j9x2",
      "question": { …TipTap JSON… },
      "answer":   { …TipTap JSON… },
      "question_text": "plain text extracted for search/embedding",
      "answer_text":   "…",
      "embedding": [0.013, …],         // 384-dim, embedded IN THE BROWSER on
      "tags": ["addition", "geometry"],//   save with the same MiniLM model —
      "difficulty": "medium",          //   one shared vector space with notes
      "updated_at": "…"                // difficulty: easy|medium|hard|null
    }
  ]
}
```

Key point: **no pipeline run is needed for question data.** Questions are
embedded client-side (transformers.js is already loaded for search), and the
app reads bank files straight from the repo — so question edits are live
immediately, no redeploy. The Python pipeline and `search-index.json` remain
exclusively about the PDFs.

**Read path:** list `data/question-banks/` with one Git Trees API call, fetch
files raw (unauthenticated works for the public repo). With a token saved,
reads go through the authenticated contents API instead — fresher (no CDN
cache) and a 5000 req/h limit.
**Write path:** contents API PUT/DELETE with the stored token, using each
file's `sha` for optimistic concurrency (on 409: refetch, reapply, retry).

## 12. Frontend architecture (the refactor)

`web/src/` reorganized; `search.js` splits into focused modules. Every module
keeps the big explanatory header-comment convention.

```
src/
├── main.jsx                    router + app shell mount
├── App.jsx                     shell: responsive nav (sidebar ≥900px,
│                               bottom tab bar <900px), routes
├── lib/
│   ├── embeddings.js           model loading + embed()          (from search.js)
│   ├── semanticSearch.js       ranking/dedupe over any corpus   (from search.js)
│   ├── github.js               GitHub API client: tree listing, get/put/
│   │                           delete file, image upload, token handling
│   └── richtext.js             TipTap helpers: plain-text extraction, empty-doc
├── data/
│   ├── notesIndex.js           load/validate search-index.json  (from search.js)
│   └── questionBanks.js        bank CRUD + folder tree + question ops
│                               (create/edit/duplicate/delete/move), exposed
│                               through a React context + hooks
├── pages/
│   ├── SearchPage.jsx          global semantic search (notes + questions)
│   ├── NotesPage.jsx           subject folders → PDF list → inline viewer
│   ├── BanksPage.jsx           question-bank folders + bank management
│   └── BankPage.jsx            one bank: study view + editing
└── components/
    ├── editor/RichTextEditor.jsx   TipTap wrapper (toolbar, math, images)
    ├── editor/RichContent.jsx      read-only renderer for stored docs
    ├── QuestionCard.jsx            collapsed-answer card; expand/collapse
    ├── QuestionEditor.jsx          create/edit modal (Q, A, tags, difficulty)
    ├── FilterBar.jsx               tag chips + difficulty filter
    ├── FolderGrid.jsx              folder cards (shared: notes + banks)
    ├── TokenSettings.jsx           PAT setup dialog + read-only banner
    ├── PdfViewer.jsx               (existing, unchanged)
    └── ResultCard.jsx              (extended: note hits open PDFs, question
                                     hits deep-link into their bank)
```

### Section behavior

- **Notes** — folder cards per subject (with counts), then the subject's PDFs
  (title, page count), then the existing inline viewer. Page counts and file
  lists come from a new `files` array in `search-index.json` (small export.py
  addition — the only pipeline change in Stage 2).
- **Question banks** — folder grid → banks → bank page. Bank page is the
  study layout: question cards with answers collapsed, tap/click to reveal,
  expand-all/collapse-all, filter by tags and difficulty. Editing (behind the
  token): new question, edit, duplicate, delete (with confirm), move to
  another bank, and bank-level create/rename/move/delete.
- **Search** — one box, semantic, both corpora at once. Results labeled by
  type: note results open the PDF at the page; question results open the
  bank scrolled to that question with the answer expanded. Query terms that
  appear verbatim in a snippet are highlighted.
- **Responsive** — sidebar navigation ≥900 px, bottom tab bar below; PDF
  viewer becomes full-width; editor toolbar wraps; touch-friendly hit areas.

## 13. Implementation phases

- **Phase 4 — Refactor + shell + notes browser.** Split search.js into
  lib/ + data/ modules (no behavior change), add HashRouter + responsive
  shell, build the Notes section, extend export.py with the `files` array.
  *Verify:* existing search still returns identical results; notes browsing
  works on desktop + 375 px mobile viewport.
- **Phase 5 — Question banks.** github.js client + TokenSettings, bank/
  question CRUD with TipTap (math + images), study view with tags/difficulty
  filtering. *Verify:* full question lifecycle (create → edit → duplicate →
  move → delete) round-trips through real GitHub commits; images render; app
  is read-only without a token.
- **Phase 6 — Unified search + deploy.** Fold question embeddings into
  SearchPage, term highlighting, cross-section result links; polish pass;
  deploy and verify everything on the live Pages site + phone.

## 14. Accepted limitations (Stage 2)

- Question edits require the GitHub token; there is no offline queue — edits
  fail visibly if offline (data is never silently dropped).
- Anonymous readers see raw.githubusercontent's CDN cache, so someone
  browsing without a token may lag your latest edit by ~5 minutes.
- Semantic-only search is not literally instantaneous (~100–300 ms after
  submit) and finds meaning, not exact strings — chosen deliberately.
- Everything in `data/` (questions, answers, images) is public, like the PDFs.
