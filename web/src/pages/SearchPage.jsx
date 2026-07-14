// ============================================================================
// notebase web — pages/SearchPage.jsx
// ============================================================================
// Global semantic search. Stage 1 behavior, relocated from the old App.jsx:
// embed the query, rank every note chunk, show the top pages, click to open
// the PDF at that page. Stage 2 Phase 6 folds question-bank results in here.
// ============================================================================

import { useState } from "react";
import { useAppData } from "../data/appData.jsx";
import { rank } from "../lib/semanticSearch.js";
import SearchBox from "../components/SearchBox.jsx";
import ResultCard from "../components/ResultCard.jsx";
import PdfViewer from "../components/PdfViewer.jsx";

export default function SearchPage() {
  const { status, modelProgress, error, index, embedder } = useAppData();
  const [results, setResults] = useState(null); // null = no search yet
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null); // result open in the viewer

  async function handleSearch(query) {
    if (status !== "ready" || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const output = await embedder(query, { pooling: "mean", normalize: true });
      // One result per PDF page — overlapping chunks of the same page would
      // otherwise crowd the list with near-duplicates.
      setResults(
        rank(output.data, index.chunks, {
          groupBy: (chunk) => `${chunk.filename}\0${chunk.page_number}`,
        })
      );
    } catch (err) {
      console.error(err);
      setSearchError(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="page">
      <SearchBox onSearch={handleSearch} disabled={status !== "ready" || searching} />

      {/* Status line: always tells the user why search may be unavailable. */}
      <p className="status" role="status">
        {status === "loading" &&
          (modelProgress > 0 && modelProgress < 100
            ? `Loading embedding model… ${modelProgress}%`
            : "Loading search index and embedding model…")}
        {status === "ready" && !searching && !searchError && (
          results === null
            ? `Ready — ${index.chunks.length} chunks indexed. Search by concept, not exact words.`
            : `${results.length} result${results.length === 1 ? "" : "s"}`
        )}
        {searching && "Searching…"}
        {status === "error" && <span className="error">{error}</span>}
        {searchError && <span className="error">{searchError}</span>}
      </p>

      <div className="split">
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
          <PdfViewer
            subject={selected.subject}
            filename={selected.filename}
            page={selected.page_number}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
