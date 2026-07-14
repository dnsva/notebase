// ============================================================================
// notebase web — components/FolderGrid.jsx
// ============================================================================
// A responsive grid of folder cards, shared by the Notes browser (subject
// folders) and — in Phase 5 — the question-bank browser. Purely
// presentational: callers supply the folders and what happens on click.
//
//   <FolderGrid folders={[{ key, name, detail }]} onOpen={(key) => …} />
// ============================================================================

export default function FolderGrid({ folders, onOpen }) {
  if (folders.length === 0) {
    return <p className="empty">Nothing here yet.</p>;
  }
  return (
    <div className="folder-grid">
      {folders.map((folder) => (
        <button
          key={folder.key}
          type="button"
          className="folder-card"
          onClick={() => onOpen(folder.key)}
        >
          <span className="folder-icon" aria-hidden="true">📁</span>
          <span className="folder-name">{folder.name}</span>
          <span className="folder-detail">{folder.detail}</span>
        </button>
      ))}
    </div>
  );
}
