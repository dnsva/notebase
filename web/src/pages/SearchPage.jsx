// ============================================================================
// notebase web — pages/SearchPage.jsx
// ============================================================================
// Global semantic search across BOTH corpora at once:
//
//   notes      chunks of search-index.json (embedded by the Python pipeline)
//   questions  every question of every bank (embedded in-browser on save)
//
// Both corpora carry vectors from the same model in the same space (see
// lib/embeddings.js), so one query embedding ranks everything together in a
// single pass — a 46% note and a 46% question are genuinely equally close.
//
// Clicking a note result opens the PDF at the matched page, inline.
// Clicking a question result deep-links into its bank (#/banks/b/<id>
// ?expand=<qid>) with that answer expanded and scrolled into view.
//
// If question banks are still loading (or failed) when a search runs, the
// search covers notes only — better a partial answer now than a spinner.
// ============================================================================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../data/appData.jsx";
import { useQuestionBanks } from "../data/questionBanks.jsx";
import { rank } from "../lib/semanticSearch.js";
import SearchBox from "../components/SearchBox.jsx";
import ResultCard from "../components/ResultCard.jsx";
import PdfViewer from "../components/PdfViewer.jsx";

export default function SearchPage() {
  const { status, modelProgress, error, index, embedder } = useAppData();
  const { banks, status: banksStatus } = useQuestionBanks();
  const navigate = useNavigate();
  const [results, setResults] = useState(null); // null = no search yet
  const [lastQuery, setLastQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null); // note result in the viewer

  // One combined corpus, rebuilt only when the underlying data changes.
  // Each item carries `kind`, a display `snippetText`, and its embedding.
  const corpus = useMemo(() => {
    const notes = (index?.chunks ?? []).map((chunk) => ({
      kind: "note",
      snippetText: chunk.text,
      ...chunk,
    }));
    const questions = banks.flatMap((bank) =>
      bank.questions.map((question) => ({
        kind: "question",
        bankId: bank.id,
        bankTitle: bank.title,
        folder: bank.folder,
        questionId: question.id,
        snippetText: `${question.question_text} — ${question.answer_text}`,
        embedding: question.embedding,
      }))
    );
    return [...notes, ...questions];
  }, [index, banks]);

  async function handleSearch(query) {
    if (status !== "ready" || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setLastQuery(query);
    try {
      const output = await embedder(query, { pooling: "mean", normalize: true });
      // Group notes to their best chunk per PDF page; questions are already
      // unique. Mixed grouping via a kind-prefixed key.
      setResults(
        rank(output.data, corpus, {
          groupBy: (item) =>
            item.kind === "note"
              ? `note\0${item.filename}\0${item.page_number}`
              : `question\0${item.questionId}`,
        })
      );
    } catch (err) {
      console.error(err);
      setSearchError(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  }

  function open(result) {
    if (result.kind === "question") {
      navigate(`/banks/b/${result.bankId}?expand=${result.questionId}`);
    } else {
      setSelected(result);
    }
  }

  const questionCount = banks.reduce((sum, b) => sum + b.questions.length, 0);

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
            ? `Ready — ${index.chunks.length} note chunks and ${questionCount} questions indexed. Search by concept, not exact words.`
            : `${results.length} result${results.length === 1 ? "" : "s"}`
        )}
        {/* Searching notes-only is better than blocking, but say so. */}
        {status === "ready" && banksStatus === "error" && (
          <span className="error"> (question banks unavailable — searching notes only)</span>
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
              key={result.kind === "note"
                ? `n-${result.filename}-${result.page_number}`
                : `q-${result.questionId}`}
              result={result}
              query={lastQuery}
              isSelected={selected === result}
              onClick={() => open(result)}
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
