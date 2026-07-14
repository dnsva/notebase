// ============================================================================
// notebase web — components/FilterBar.jsx
// ============================================================================
// Tag + difficulty filtering for a bank's study view. Purely presentational:
// the parent owns the selected filters and does the actual filtering. Tags
// are toggleable chips (multi-select, AND semantics); difficulty is a
// single-select row. Renders nothing when the bank has no tags or
// difficulties to filter by.
// ============================================================================

const DIFFICULTIES = ["easy", "medium", "hard"];

export default function FilterBar({
  allTags,
  activeTags,
  onToggleTag,
  anyDifficulty,
  activeDifficulty,
  onSetDifficulty,
}) {
  if (allTags.length === 0 && !anyDifficulty) return null;

  return (
    <div className="filter-bar">
      {allTags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`tag filter-chip${activeTags.includes(tag) ? " active" : ""}`}
          onClick={() => onToggleTag(tag)}
        >
          {tag}
        </button>
      ))}
      {anyDifficulty && (
        <span className="filter-difficulties">
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className={`difficulty difficulty-${level} filter-chip${
                activeDifficulty === level ? " active" : ""
              }`}
              onClick={() => onSetDifficulty(activeDifficulty === level ? null : level)}
            >
              {level}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
