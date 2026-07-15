// ============================================================================
// notebase web — components/editor/RichTextEditor.jsx
// ============================================================================
// The TipTap editor used for both questions and answers.
//
// Toolbar: undo/redo, bold, italic, bullet/ordered list, inline code,
// math, image.
//
// MATH — the ∑ button prompts for LaTeX (selected text becomes the initial
// source) and inserts an inline-math node typeset live by KaTeX. Clicking
// any existing math node re-opens the prompt prefilled with its LaTeX;
// submitting empty text deletes the node. (Prompt-based on purpose: a
// custom math popover is more code than this whole file and no faster to
// use.)
//
// IMAGES — three ways in: the 🖼 button, pasting an image, or dropping a
// file onto the editor. All go through the same path: downscale + commit to
// the repo (lib/github.js), WAIT until the committed URL actually serves
// (raw.githubusercontent's CDN can lag a fresh commit by a few seconds —
// inserting before that produced the "broken image" flakiness), then insert
// the node. While that runs, a placeholder chip shows in the toolbar. Once
// inserted, images are resizable and individually deletable via the node
// view (ImageView.jsx).
//
// Controlled-ish: `content` seeds the editor; every change reports the full
// TipTap JSON doc through onChange. Parents keep the doc in their own state.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { richTextExtensions, ResizableImage } from "../../lib/richtext.js";
import { uploadImage } from "../../lib/github.js";
import ImageView from "./ImageView.jsx";
import "katex/dist/katex.min.css";

/** Poll a freshly committed asset URL until the CDN serves it (or time out). */
async function waitUntilServed(url, attempts = 8, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (response.ok) return true;
    } catch { /* network hiccup — keep trying */ }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false; // insert anyway; ImageView's Retry covers the stragglers
}

function ToolbarButton({ label, title, active, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`toolbar-btn${active ? " active" : ""}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      // preventDefault keeps the editor focused/selection intact on click
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
    >
      {label}
    </button>
  );
}

export default function RichTextEditor({ content, onChange, autoFocus = false }) {
  const fileInputRef = useRef(null);
  const editorRef = useRef(null); // for the math onClick closure (see below)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  // Re-render on every transaction so toolbar active/disabled states track
  // the selection (TipTap doesn't re-render the host component by itself).
  const [, forceRender] = useState(0);

  /**
   * Click-to-edit math. Registered once via extension config, so it reads
   * the live editor through a ref. Empty submission deletes the node —
   * that's also the only discoverable way to remove math, so keep it.
   */
  function handleMathClick(kind, node, pos) {
    const editor = editorRef.current;
    if (!editor) return;
    const latex = window.prompt("Edit LaTeX (clear to remove):", node.attrs.latex);
    if (latex === null) return; // cancelled
    const { tr } = editor.state;
    if (latex.trim() === "") {
      editor.view.dispatch(tr.delete(pos, pos + node.nodeSize));
    } else {
      editor.view.dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex }));
    }
    editor.commands.focus();
  }

  const editor = useEditor({
    extensions: [
      // Swap the shared image extension for one carrying the interactive
      // node view — same schema ("image"), so documents are identical.
      ...richTextExtensions({ onMathClick: handleMathClick }).map((ext) =>
        ext.name === "image"
          ? ResizableImage.extend({
              addNodeView: () => ReactNodeViewRenderer(ImageView),
            })
          : ext
      ),
    ],
    content,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
    onTransaction: () => forceRender((n) => n + 1),
    editorProps: {
      // Paste and drop feed the same upload pipeline as the toolbar button.
      handlePaste: (view, event) => {
        const file = [...(event.clipboardData?.files ?? [])].find((f) =>
          f.type.startsWith("image/")
        );
        if (!file) return false;
        insertImageFile(file);
        return true; // we own this paste
      },
      handleDrop: (view, event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
          f.type.startsWith("image/")
        );
        if (!file) return false;
        // Drop position -> caret, so the image lands where it was dropped.
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords) editorRef.current?.commands.setTextSelection(coords.pos);
        insertImageFile(file);
        return true;
      },
    },
  });
  editorRef.current = editor;

  // Surface upload state to screen readers as well as visually.
  useEffect(() => {
    if (!uploading) return undefined;
    document.body.style.cursor = "progress";
    return () => { document.body.style.cursor = ""; };
  }, [uploading]);

  if (!editor) return null;

  async function insertImageFile(file) {
    if (uploading) return; // one at a time keeps failure states legible
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      await waitUntilServed(url);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error(err);
      setUploadError(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  function insertMath() {
    const selection = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to
    );
    const latex = window.prompt("LaTeX (e.g. \\vec{a} + \\vec{b}):", selection);
    if (!latex?.trim()) return;
    editor.chain().focus().deleteSelection().insertInlineMath({ latex }).run();
  }

  function handleImageChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (file) insertImageFile(file);
  }

  return (
    <div className="rich-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <ToolbarButton label="↺" title="Undo" disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label="↻" title="Redo" disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()} />
        <span className="toolbar-divider" />
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
        <span className="toolbar-divider" />
        <ToolbarButton label="∑" title="Insert LaTeX math (click existing math to edit)"
          onClick={insertMath} />
        <ToolbarButton label={uploading ? "…" : "🖼"} title="Insert image (or paste/drop one)"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()} />
        {uploading && (
          <span className="toolbar-status" role="status">uploading image…</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleImageChosen}
        />
      </div>
      <EditorContent editor={editor} className="editor-surface" />
      {uploadError && <p className="status"><span className="error">{uploadError}</span></p>}
    </div>
  );
}
