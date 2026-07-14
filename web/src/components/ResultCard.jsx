// ============================================================================
// notebase web — components/ResultCard.jsx
// ============================================================================
// One global-search hit, for either corpus:
//
//   note result      badge = subject,       opens the PDF at the page
//   question result  badge = "question",    deep-links into its bank with
//                                           that answer expanded
//
// Purely presentational — SearchPage decides what clicking does. The score
// is cosine similarity shown as a rounded percentage: imprecise, but gives
// a feel for confidence relative to the other cards.
// ============================================================================

import Snippet from "./Snippet.jsx";

export default function ResultCard({ result, query, isSelected, onClick }) {
  const isQuestion = result.kind === "question";
  return (
    <button
      type="button"
      className={`result-card${isSelected ? " selected" : ""}`}
      onClick={onClick}
    >
      <div className="result-meta">
        <span className={`subject-badge${isQuestion ? " question-badge" : ""}`}>
          {isQuestion ? "question" : result.subject}
        </span>
        <span className="result-file">
          {isQuestion
            ? `${result.bankTitle} (${result.folder})`
            : `${result.filename} — page ${result.page_number}`}
        </span>
        <span className="result-score">{Math.round(result.score * 100)}%</span>
      </div>
      <Snippet text={result.snippetText} query={query} />
    </button>
  );
}
