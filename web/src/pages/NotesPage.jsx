// ============================================================================
// notebase web — pages/NotesPage.jsx
// ============================================================================
// The Notes browser: subject folders -> the subject's PDFs -> inline viewer.
//
// Data comes from the `files` array of search-index.json (added to
// pipeline/export.py in Stage 2) — no extra fetches. The current subject
// lives in the URL (#/notes/math) so folder views are deep-linkable and the
// browser back button walks back up the hierarchy naturally.
// ============================================================================

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppData } from "../data/appData.jsx";
import { subjectFolders } from "../data/notesIndex.js";
import FolderGrid from "../components/FolderGrid.jsx";
import PdfViewer from "../components/PdfViewer.jsx";

export default function NotesPage() {
  const { index } = useAppData();
  const { subject } = useParams(); // undefined at #/notes -> folder view
  const navigate = useNavigate();
  const [openFile, setOpenFile] = useState(null);

  if (!index) {
    return <p className="status">Loading notes…</p>;
  }

  const folders = subjectFolders(index);

  // ---- folder view: one card per subject --------------------------------
  if (!subject) {
    return (
      <div className="page">
        <h2 className="page-title">Notes</h2>
        <FolderGrid
          folders={folders.map((f) => ({
            key: f.subject,
            name: f.subject,
            detail: `${f.files.length} PDF${f.files.length === 1 ? "" : "s"} · ${f.pages} pages`,
          }))}
          onOpen={(key) => navigate(`/notes/${encodeURIComponent(key)}`)}
        />
      </div>
    );
  }

  // ---- file view: the selected subject's PDFs ----------------------------
  const folder = folders.find((f) => f.subject === subject);
  return (
    <div className="page">
      <nav className="breadcrumb">
        <button type="button" onClick={() => { setOpenFile(null); navigate("/notes"); }}>
          Notes
        </button>
        <span aria-hidden="true"> / </span>
        <span>{subject}</span>
      </nav>

      {!folder && <p className="empty">No such subject.</p>}

      <div className="split">
        <section className="results">
          {(folder?.files ?? []).map((file) => (
            <button
              key={file.filename}
              type="button"
              className={`result-card${openFile === file ? " selected" : ""}`}
              onClick={() => setOpenFile(file)}
            >
              <div className="result-meta">
                <span className="result-file">{file.filename}</span>
                <span className="result-score">{file.pages} pages</span>
              </div>
            </button>
          ))}
        </section>

        {openFile && (
          <PdfViewer
            subject={openFile.subject}
            filename={openFile.filename}
            page={1}
            onClose={() => setOpenFile(null)}
          />
        )}
      </div>
    </div>
  );
}
