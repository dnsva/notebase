// ============================================================================
// notebase web — components/QuestionEditor.jsx
// ============================================================================
// Modal for creating or editing one question: rich-text question + answer
// (RichTextEditor: formatting, LaTeX math, images), comma-separated tags,
// optional difficulty. On save, the parent persists via
// questionBanks.saveQuestion — which also (re)embeds the text — so this
// component only holds the draft.
//
// Saving is disabled while a save is in flight (each save is a real GitHub
// commit, typically ~1s) and on an empty question body.
// ============================================================================

import { useState } from "react";
import RichTextEditor from "./editor/RichTextEditor.jsx";
import { EMPTY_DOC, isEmptyDoc } from "../lib/richtext.js";

export default function QuestionEditor({ initial, onSave, onCancel }) {
  const [question, setQuestion] = useState(initial?.question ?? EMPTY_DOC);
  const [answer, setAnswer] = useState(initial?.answer ?? EMPTY_DOC);
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-label={initial ? "Edit question" : "New question"}>
        <h3 className="modal-title">{initial ? "Edit question" : "New question"}</h3>

        <label className="field-label">Question</label>
        <RichTextEditor content={question} onChange={setQuestion} />

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
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
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
