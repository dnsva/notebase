// ============================================================================
// notebase web — components/QuestionCard.jsx
// ============================================================================
// One question in the study view. The question body is always visible; the
// answer sits behind an expand/collapse control (the core study loop: read,
// answer in your head, reveal). Expansion state is owned by the parent so
// "expand all / collapse all" works.
//
// Edit/duplicate/delete/move actions render only when editing is possible
// (token present); handlers come from the parent, which talks to the
// questionBanks context.
// ============================================================================

import RichContent from "./editor/RichContent.jsx";

const DIFFICULTY_LABEL = { easy: "easy", medium: "medium", hard: "hard" };

export default function QuestionCard({
  question,
  expanded,
  onToggle,
  canEdit,
  onEdit,
  onDuplicate,
  onDelete,
  onMove, // null when there's no other bank to move to
}) {
  return (
    <article className={`question-card${expanded ? " expanded" : ""}`}>
      <div className="question-head">
        <div className="question-badges">
          {question.difficulty && (
            <span className={`difficulty difficulty-${question.difficulty}`}>
              {DIFFICULTY_LABEL[question.difficulty]}
            </span>
          )}
          {question.tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        {canEdit && (
          <div className="question-actions">
            <button type="button" title="Edit" onClick={onEdit}>✎</button>
            <button type="button" title="Duplicate" onClick={onDuplicate}>⧉</button>
            {onMove && (
              <button type="button" title="Move to another bank" onClick={onMove}>⇄</button>
            )}
            <button type="button" title="Delete" className="danger" onClick={onDelete}>🗑</button>
          </div>
        )}
      </div>

      <RichContent doc={question.question} className="question-body" />

      <button type="button" className="answer-toggle" onClick={onToggle}>
        {expanded ? "▾ Hide answer" : "▸ Show answer"}
      </button>
      {expanded && <RichContent doc={question.answer} className="answer-body" />}
    </article>
  );
}
