// ============================================================================
// notebase web — pages/BankPage.jsx
// ============================================================================
// One question bank: the study view. Question cards with answers collapsed
// (expand one at a time as you quiz yourself, or expand all to review),
// filterable by tags (AND) and difficulty. With a token: add, edit,
// duplicate, delete, and move questions to another bank.
//
// Route: #/banks/b/:bankId  (deep-linkable; search results land here too,
// via the ?q= param handled in Phase 6.)
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuestionBanks } from "../data/questionBanks.jsx";
import QuestionCard from "../components/QuestionCard.jsx";
import QuestionEditor from "../components/QuestionEditor.jsx";
import FilterBar from "../components/FilterBar.jsx";

export default function BankPage() {
  const { bankId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    banks, status, error, canEdit,
    saveQuestion, duplicateQuestion, deleteQuestion, moveQuestion,
  } = useQuestionBanks();

  // Search results deep-link as #/banks/b/<id>?expand=<questionId> — that
  // question starts expanded so the found answer is immediately visible.
  const [expanded, setExpanded] = useState(() => new Set(
    searchParams.get("expand") ? [searchParams.get("expand")] : []
  ));
  const [activeTags, setActiveTags] = useState([]);
  const [activeDifficulty, setActiveDifficulty] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | question
  const [actionError, setActionError] = useState(null);

  const bank = banks.find((b) => b.id === bankId);

  // Arriving from a search result (?expand=<qid>): scroll the found
  // question into view once the bank has rendered.
  const expandParam = searchParams.get("expand");
  useEffect(() => {
    if (!expandParam || !bank) return;
    document.getElementById(`q-${expandParam}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [expandParam, bank]);

  const allTags = useMemo(
    () => [...new Set((bank?.questions ?? []).flatMap((q) => q.tags))].sort(),
    [bank]
  );

  if (status === "loading") return <p className="status">Loading question banks…</p>;
  if (status === "error") return <p className="status"><span className="error">{error}</span></p>;
  if (!bank) return <p className="empty">No such bank.</p>;

  const visible = bank.questions.filter(
    (q) =>
      activeTags.every((tag) => q.tags.includes(tag)) &&
      (!activeDifficulty || q.difficulty === activeDifficulty)
  );

  function toggle(questionId) {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }

  /** Wrap a context action: surface failures inline instead of throwing away. */
  async function run(action) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setActionError(err.message);
    }
  }

  function handleMove(question) {
    const others = banks.filter((b) => b.id !== bank.id);
    const choice = window.prompt(
      `Move to which bank?\n${others.map((b, i) => `${i + 1}. ${b.title} (${b.folder})`).join("\n")}\n\nEnter a number:`
    );
    const target = others[Number(choice) - 1];
    if (target) run(() => moveQuestion(bank.id, target.id, question.id));
  }

  return (
    <div className="page">
      <nav className="breadcrumb">
        <button type="button" onClick={() => navigate("/banks")}>Question banks</button>
        <span aria-hidden="true"> / </span>
        <button type="button" onClick={() => navigate(`/banks/f/${bank.folder}`)}>{bank.folder}</button>
        <span aria-hidden="true"> / </span>
        <span>{bank.title}</span>
      </nav>

      <div className="page-head">
        <h2 className="page-title">{bank.title}</h2>
        <div className="page-head-actions">
          {bank.questions.length > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setExpanded(expanded.size === visible.length
                  ? new Set()
                  : new Set(visible.map((q) => q.id)))
              }
            >
              {expanded.size === visible.length && visible.length > 0
                ? "Collapse all"
                : "Expand all"}
            </button>
          )}
          {canEdit && (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              + New question
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="status">Read-only — add a GitHub token in Settings to edit.</p>
      )}
      {actionError && <p className="status"><span className="error">{actionError}</span></p>}

      <FilterBar
        allTags={allTags}
        activeTags={activeTags}
        onToggleTag={(tag) =>
          setActiveTags((current) =>
            current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
          )
        }
        anyDifficulty={bank.questions.some((q) => q.difficulty)}
        activeDifficulty={activeDifficulty}
        onSetDifficulty={setActiveDifficulty}
      />

      {visible.length === 0 && (
        <p className="empty">
          {bank.questions.length === 0 ? "No questions yet." : "No questions match the filters."}
        </p>
      )}

      <div className="question-list">
        {visible.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            expanded={expanded.has(question.id)}
            onToggle={() => toggle(question.id)}
            canEdit={canEdit}
            onEdit={() => setEditing(question)}
            onDuplicate={() => run(() => duplicateQuestion(bank.id, question.id))}
            onDelete={() =>
              window.confirm("Delete this question? (Recoverable from git history.)") &&
              run(() => deleteQuestion(bank.id, question.id))
            }
            onMove={banks.length > 1 ? () => handleMove(question) : null}
          />
        ))}
      </div>

      {editing && (
        <QuestionEditor
          initial={editing === "new" ? null : editing}
          onSave={async (draft) => {
            await saveQuestion(bank.id, draft);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
