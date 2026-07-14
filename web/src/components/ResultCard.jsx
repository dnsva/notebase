// ============================================================================
// notebase web — ResultCard.jsx
// ============================================================================
// One search hit: subject badge, filename, page number, snippet of the
// best-matching chunk, and the similarity score as a percentage. Clicking
// the card asks App to open this result in the PdfViewer.
//
// The score is cosine similarity (-1..1, in practice ~0.2-0.8 for related
// text) shown as a rounded percentage — imprecise but gives a feel for how
// confident the match is relative to the other cards.
// ============================================================================

const SNIPPET_CHARS = 220;

export default function ResultCard({ result, isSelected, onClick }) {
  const snippet =
    result.text.length > SNIPPET_CHARS
      ? `${result.text.slice(0, SNIPPET_CHARS)}…`
      : result.text;

  return (
    <button
      type="button"
      className={`result-card${isSelected ? " selected" : ""}`}
      onClick={onClick}
    >
      <div className="result-meta">
        <span className="subject-badge">{result.subject}</span>
        <span className="result-file">
          {result.filename} — page {result.page_number}
        </span>
        <span className="result-score">{Math.round(result.score * 100)}%</span>
      </div>
      <p className="result-snippet">{snippet}</p>
    </button>
  );
}
