// ============================================================================
// notebase web — components/editor/RichContent.jsx
// ============================================================================
// Read-only renderer for stored TipTap documents (question/answer bodies in
// study view and search results). Deliberately NOT a TipTap editor instance:
// a bank page renders dozens of these, and dozens of ProseMirror editors
// would be pure overhead. Instead lib/richtext.renderToHtml serializes the
// doc to HTML (with KaTeX typesetting the math) and we inject it — the HTML
// comes from our own serializer over schema-validated content, not from
// arbitrary user strings.
// ============================================================================

import { useMemo } from "react";
import { renderToHtml } from "../../lib/richtext.js";
import "katex/dist/katex.min.css";

export default function RichContent({ doc, className = "" }) {
  const html = useMemo(() => (doc ? renderToHtml(doc) : ""), [doc]);
  return (
    <div
      className={`rich-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
