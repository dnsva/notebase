// ============================================================================
// notebase web — components/editor/ImageView.jsx
// ============================================================================
// The EDITOR-side rendering of an image node (lib/richtext.js ResizableImage
// carries the schema; this node view is attached only inside RichTextEditor,
// so read-only views stay plain <img> tags).
//
// What it adds over a bare <img>:
//   * RESIZE — drag the corner handle; width is written to the node's
//     `width` attribute continuously, so what you see is exactly what is
//     saved. Pointer capture keeps the drag alive even when the cursor
//     leaves the handle. Width is clamped to [80px, natural width] and to
//     the editor's own width.
//   * DELETE — an ✕ button on hover/selection removes just this image;
//     ProseMirror seamlessly closes the gap and the surrounding text is
//     untouched.
//   * FAILURE RECOVERY — raw.githubusercontent can lag a freshly committed
//     asset by a few seconds (CDN); a failed load renders a placeholder
//     with a Retry button that cache-busts, instead of a broken-image icon.
// ============================================================================

import { useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";

const MIN_WIDTH = 80;

export default function ImageView({ node, updateAttributes, deleteNode, selected }) {
  const imgRef = useRef(null);
  const dragState = useRef(null);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  function onHandlePointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    dragState.current = { startX: event.clientX, startWidth: img.offsetWidth };
    event.target.setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(event) {
    if (!dragState.current) return;
    const { startX, startWidth } = dragState.current;
    const container = imgRef.current?.closest(".ProseMirror");
    // Never let maxWidth drop below MIN_WIDTH: if the layout is mid-reflow
    // (or the tab is background/zero-sized) clientWidth can be ~0, and
    // clamping against it would shrink the stored width to garbage.
    const maxWidth = Math.max(
      MIN_WIDTH,
      container?.clientWidth ? container.clientWidth - 24 : 800
    );
    const width = Math.round(
      Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + (event.clientX - startX)))
    );
    updateAttributes({ width });
  }

  function onHandlePointerUp(event) {
    dragState.current = null;
    event.target.releasePointerCapture?.(event.pointerId);
  }

  // Cache-busted retry for the CDN-lag case (see header comment).
  const src = retryNonce ? `${node.attrs.src}${node.attrs.src.includes("?") ? "&" : "?"}r=${retryNonce}` : node.attrs.src;

  return (
    <NodeViewWrapper
      as="span"
      className={`image-node${selected ? " selected" : ""}`}
      data-drag-handle
    >
      {failed ? (
        <span className="image-fallback" contentEditable={false}>
          <span>image failed to load</span>
          <button
            type="button"
            onClick={() => { setFailed(false); setRetryNonce(Date.now()); }}
          >
            Retry
          </button>
          <button type="button" className="danger" onClick={() => deleteNode()}>
            Remove
          </button>
        </span>
      ) : (
        <>
          <img
            ref={imgRef}
            src={src}
            alt={node.attrs.alt ?? ""}
            style={node.attrs.width ? { width: `${node.attrs.width}px` } : undefined}
            draggable={false}
            onError={() => setFailed(true)}
          />
          <button
            type="button"
            className="image-delete"
            title="Remove image"
            contentEditable={false}
            // mousedown (not click) so the editor selection isn't disturbed first
            onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}
          >
            ✕
          </button>
          <span
            className="image-resize-handle"
            title="Drag to resize"
            contentEditable={false}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
          />
        </>
      )}
    </NodeViewWrapper>
  );
}
