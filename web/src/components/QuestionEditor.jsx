// ============================================================================
// notebase web — components/QuestionEditor.jsx
// ============================================================================
// Modal for creating or editing one question: rich-text question + answer
// (RichTextEditor: formatting, LaTeX math, images), comma-separated tags,
// optional difficulty. On save, the parent persists via
// questionBanks.saveQuestion — which also (re)embeds the text — so this
// component only holds the draft.
//
// DRAFT SAFETY — the two ways to close without saving (backdrop click,
// Escape) ask for confirmation once the draft differs from what it opened
// with. Rich text takes real effort to write; losing it to a stray click
// on the dimmed background is the kind of "unexpected behavior" this
// editor must not have. The explicit Cancel button also confirms when
// dirty, for consistency.
//
// Saving is disabled while a save is in flight (each save is a real GitHub
// commit, typically ~1s) and on an empty question body.
// ============================================================================

import { useMemo, useState } from "react";
import RichTextEditor from "./editor/RichTextEditor.jsx";
import { EMPTY_DOC, isEmptyDoc } from "../lib/richtext.js";
import useEscape from "../lib/useEscape.js";

export default function QuestionEditor({ initial, onSave, onCancel }) {
  const [question, setQuestion] = useState(initial?.question ?? EMPTY_DOC);
  const [answer, setAnswer] = useState(initial?.answer ?? EMPTY_DOC);
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // What the modal opened with — the reference point for "is it dirty?".
  const opened = useMemo(
    () => JSON.stringify({
      q: initial?.question ?? EMPTY_DOC,
      a: initial?.answer ?? EMPTY_DOC,
      t: (initial?.tags ?? []).join(", "),
      d: initial?.difficulty ?? "",
    }),
    [initial]
  );
  const isDirty =
    JSON.stringify({ q: question, a: answer, t: tagsText, d: difficulty }) !== opened;

  function requestClose() {
    if (saving) return; // never abandon a commit in flight
    if (!isDirty || window.confirm("Discard unsaved changes?")) onCancel();
  }

  useEscape(requestClose);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: initial?.id,
        question,
        answer,
        tags: tagsText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        difficulty: difficulty || null,
      });
    } catch (err) {
      console.error(err);
      setError(err.message);
      setSaving(false); // stay open so the draft isn't lost
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="modal modal-wide" role="dialog" aria-label={initial ? "Edit question" : "New question"}>
        <h3 className="modal-title">{initial ? "Edit question" : "New question"}</h3>

        <label className="field-label">Question</label>
        <RichTextEditor content={question} onChange={setQuestion} autoFocus />

        <label className="field-label">Answer</label>
        <RichTextEditor content={answer} onChange={setAnswer} />

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="qe-tags">Tags (comma-separated)</label>
            <input
              id="qe-tags"
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="addition, geometry"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="qe-difficulty">Difficulty</label>
            <select id="qe-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">—</option>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </div>
        </div>

        {error && <p className="status"><span className="error">{error}</span></p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={requestClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={saving || isEmptyDoc(question)}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
