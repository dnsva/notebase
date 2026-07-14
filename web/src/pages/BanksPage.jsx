// ============================================================================
// notebase web — pages/BanksPage.jsx
// ============================================================================
// The question-bank browser: folder cards -> the folder's banks -> BankPage
// (separate route). Mirrors NotesPage's folder/list structure, sharing
// FolderGrid.
//
// Editing (create bank, rename, move to another folder, delete) appears
// only with a GitHub token (questionBanks.canEdit); everyone else gets a
// clean read-only browser. Bank create/edit use a small inline form modal —
// a bank is just a title + folder, no rich text needed.
//
// Routes handled here (see App.jsx):
//   #/banks             folder grid
//   #/banks/f/<folder>  one folder's banks (folder names may contain "/",
//                       hence the splat route)
// ============================================================================

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { bankFolders, useQuestionBanks } from "../data/questionBanks.jsx";
import FolderGrid from "../components/FolderGrid.jsx";

function BankMetaEditor({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), folder: folder.trim() });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-label={initial ? "Edit bank" : "New bank"}>
        <h3 className="modal-title">{initial ? "Edit bank" : "New question bank"}</h3>
        <label className="field-label" htmlFor="bm-title">Title</label>
        <input id="bm-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Vectors — basics" />
        <label className="field-label" htmlFor="bm-folder">Folder</label>
        <input id="bm-folder" type="text" value={folder} onChange={(e) => setFolder(e.target.value)}
          placeholder="math (use / to nest, e.g. math/unit-6)" />
        {error && <p className="status"><span className="error">{error}</span></p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="primary" onClick={handleSave}
            disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BanksPage() {
  const { banks, status, error, canEdit, createBank, updateBankMeta, deleteBank } =
    useQuestionBanks();
  const { "*": folderParam } = useParams(); // splat: folder names can contain "/"
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null); // null | "new" | bank object

  if (status === "loading") return <p className="status">Loading question banks…</p>;
  if (status === "error") {
    return <p className="status"><span className="error">{error}</span></p>;
  }

  const folders = bankFolders(banks);

  async function handleDelete(bank) {
    const count = bank.questions.length;
    if (!window.confirm(
      `Delete "${bank.title}"${count ? ` and its ${count} question${count === 1 ? "" : "s"}` : ""}? ` +
      "This makes a commit — recoverable from git history, but gone from the app."
    )) return;
    await deleteBank(bank.id);
  }

  // ---- folder grid view ---------------------------------------------------
  if (!folderParam) {
    return (
      <div className="page">
        <div className="page-head">
          <h2 className="page-title">Question banks</h2>
          {canEdit && (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              + New bank
            </button>
          )}
        </div>
        {!canEdit && banks.length === 0 && (
          <p className="empty">No question banks yet.</p>
        )}
        <FolderGrid
          folders={folders.map((f) => ({
            key: f.folder,
            name: f.folder,
            detail: `${f.banks.length} bank${f.banks.length === 1 ? "" : "s"} · ${f.questionCount} questions`,
          }))}
          onOpen={(key) => navigate(`/banks/f/${key}`)}
        />
        {editing === "new" && (
          <BankMetaEditor
            onSave={async (meta) => {
              const bank = await createBank(meta);
              setEditing(null);
              navigate(`/banks/b/${bank.id}`);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    );
  }

  // ---- one folder's banks ---------------------------------------------------
  const folder = folders.find((f) => f.folder === folderParam);
  return (
    <div className="page">
      <nav className="breadcrumb">
        <button type="button" onClick={() => navigate("/banks")}>Question banks</button>
        <span aria-hidden="true"> / </span>
        <span>{folderParam}</span>
      </nav>

      {!folder && <p className="empty">No such folder.</p>}

      <div className="results">
        {(folder?.banks ?? []).map((bank) => (
          <div key={bank.id} className="result-card bank-row">
            <button
              type="button"
              className="bank-open"
              onClick={() => navigate(`/banks/b/${bank.id}`)}
            >
              <span className="result-file">{bank.title}</span>
              <span className="result-score">
                {bank.questions.length} question{bank.questions.length === 1 ? "" : "s"}
              </span>
            </button>
            {canEdit && (
              <span className="question-actions">
                <button type="button" title="Rename / move folder" onClick={() => setEditing(bank)}>✎</button>
                <button type="button" title="Delete bank" className="danger"
                  onClick={() => handleDelete(bank)}>🗑</button>
              </span>
            )}
          </div>
        ))}
      </div>

      {editing && editing !== "new" && (
        <BankMetaEditor
          initial={editing}
          onSave={async (meta) => {
            await updateBankMeta(editing.id, meta);
            setEditing(null);
            // If the bank moved folders, follow it there.
            if (meta.folder !== folderParam) navigate(`/banks/f/${meta.folder}`);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
