// ============================================================================
// notebase web — components/editor/RichTextEditor.jsx
// ============================================================================
// The TipTap editor used for both questions and answers. Toolbar: bold,
// italic, bullet/ordered list, inline code, math, image.
//
//   * Math: prompts for LaTeX and inserts an inline-math node, typeset live
//     by KaTeX (extension configured in lib/richtext.js). Selecting text
//     first wraps THAT text as the LaTeX source.
//   * Images: picked file is downscaled + committed to the repo's
//     data/assets/ (lib/github.js uploadImage), then embedded by URL. Needs
//     the GitHub token — but so does every path that reaches this editor.
//
// Controlled-ish: `content` seeds the editor; every change reports the full
// TipTap JSON doc through onChange. Parents keep the doc in their own state.
// ============================================================================

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { richTextExtensions } from "../../lib/richtext.js";
import { uploadImage } from "../../lib/github.js";
import "katex/dist/katex.min.css";

function ToolbarButton({ label, title, active, onClick }) {
  return (
    <button
      type="button"
      className={`toolbar-btn${active ? " active" : ""}`}
      title={title}
      // preventDefault keeps the editor focused/selection intact on click
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {label}
    </button>
  );
}

export default function RichTextEditor({ content, onChange, placeholder }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const editor = useEditor({
    extensions: richTextExtensions(),
    content,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  if (!editor) return null;

  function insertMath() {
    const selection = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );
    const latex = window.prompt("LaTeX (e.g. \\vec{a} + \\vec{b}):", selection);
    if (!latex) return;
    editor.chain().focus().deleteSelection().insertInlineMath({ latex }).run();
  }

  async function handleImageChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error(err);
      setUploadError(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rich-editor">
      <div className="toolbar" role="toolbar">
        <ToolbarButton label="B" title="Bold" active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="I" title="Italic" active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="•" title="Bullet list" active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="1." title="Numbered list" active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="⌨" title="Inline code" active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolbarButton label="∑" title="Insert LaTeX math" onClick={insertMath} />
        <ToolbarButton label={uploading ? "…" : "🖼"} title="Insert image"
          onClick={() => !uploading && fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleImageChosen}
        />
      </div>
      <EditorContent editor={editor} className="editor-surface" data-placeholder={placeholder} />
      {uploadError && <p className="status"><span className="error">{uploadError}</span></p>}
    </div>
  );
}
