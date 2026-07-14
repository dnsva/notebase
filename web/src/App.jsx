// ============================================================================
// notebase web — src/App.jsx
// ============================================================================
// Top-level component. Owns all application state and the startup sequence:
//
//   mount ──▶ load search-index.json ─┐
//        └──▶ load embedding model ───┴──▶ status "ready" ──▶ search enabled
//
// The two loads run in parallel; the model (~25 MB on first ever visit) is
// almost always the slow one, so its download progress is shown. Until both
// finish, the search box is disabled and the status line explains why.
//
// State lives here and flows down as props; child components are pure:
//   SearchBox  — controlled input + submit
//   ResultCard — one search hit (subject, file, page, snippet, score)
//   PdfViewer  — iframe opened at the clicked result's page
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { loadIndex, loadEmbedder, search } from "./search.js";
import SearchBox from "./components/SearchBox.jsx";
import ResultCard from "./components/ResultCard.jsx";
import PdfViewer from "./components/PdfViewer.jsx";

export default function App() {
  // Startup: "loading" -> "ready", or "error" (message in `error`).
  const [status, setStatus] = useState("loading");
  const [modelProgress, setModelProgress] = useState(0);
  const [error, setError] = useState(null);

  // Search: null results = no search yet (distinct from "0 hits").
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // result open in the viewer

  // The index and embedder are big, non-render data — refs, not state.
  const indexRef = useRef(null);
  const embedderRef = useRef(null);

  useEffect(() => {
    let cancelled = false; // StrictMode double-mount guard
    (async () => {
      try {
        const [index, embedder] = await Promise.all([
          loadIndex(),
          loadEmbedder(setModelProgress),
        ]);
        if (cancelled) return;
        indexRef.current = index;
        embedderRef.current = embedder;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch(query) {
    if (status !== "ready" || !query.trim()) return;
    setSearching(true);
    try {
      setResults(await search(query, indexRef.current, embedderRef.current));
    } catch (err) {
      console.error(err);
      setError(`Search failed: ${err.message}`);
      setStatus("error");
    } finally {
      setSearching(false);
    }
  }

  const chunkCount = indexRef.current?.chunks.length;

  return (
    <div className="app">
      <header className="header">
        <h1>notebase</h1>
        <p className="tagline">semantic search over your scanned notes</p>
      </header>

      <SearchBox onSearch={handleSearch} disabled={status !== "ready" || searching} />

      {/* Status line: always tells the user why search may be unavailable. */}
      <p className="status" role="status">
        {status === "loading" &&
          (modelProgress > 0 && modelProgress < 100
            ? `Loading embedding model… ${modelProgress}%`
            : "Loading search index and embedding model…")}
        {status === "ready" && !searching && (
          results === null
            ? `Ready — ${chunkCount} chunks indexed. Search by concept, not exact words.`
            : `${results.length} result${results.length === 1 ? "" : "s"}`
        )}
        {searching && "Searching…"}
        {status === "error" && <span className="error">{error}</span>}
      </p>

      <main className="main">
        <section className="results">
          {results !== null && results.length === 0 && (
            <p className="empty">No results. Try different wording.</p>
          )}
          {(results ?? []).map((result) => (
            <ResultCard
              key={`${result.filename}-${result.page_number}`}
              result={result}
              isSelected={selected === result}
              onClick={() => setSelected(result)}
            />
          ))}
        </section>

        {selected && (
          <PdfViewer result={selected} onClose={() => setSelected(null)} />
        )}
      </main>
    </div>
  );
}
