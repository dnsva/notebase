// ============================================================================
// notebase web — PdfViewer.jsx
// ============================================================================
// Inline PDF viewer: the browser's native PDF renderer in an <iframe>, told
// which page to open via the URL fragment (…/file.pdf#page=7).
//
// Two quirks worth knowing (both are why `key` is set on the iframe):
//   1. Changing only the #fragment of an iframe src does NOT reliably make
//      the embedded PDF renderer jump pages — the browser considers it the
//      same document. Keying the iframe by the full URL forces a remount,
//      i.e. a genuine fresh load at the right page.
//   2. Mobile Safari ignores #page=N entirely (known limitation, accepted
//      in SPEC.md §8): the PDF opens at page 1 there.
// ============================================================================

import { pdfUrl } from "../search.js";

export default function PdfViewer({ result, onClose }) {
  const url = `${pdfUrl(result)}#page=${result.page_number}`;

  return (
    <aside className="pdf-viewer">
      <div className="viewer-bar">
        <span className="viewer-title">
          {result.filename} — page {result.page_number}
        </span>
        <button type="button" className="viewer-close" onClick={onClose}>
          ✕ close
        </button>
      </div>
      <iframe
        key={url}
        src={url}
        title={`${result.filename} page ${result.page_number}`}
      />
    </aside>
  );
}
