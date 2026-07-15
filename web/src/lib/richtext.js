// ============================================================================
// notebase web — lib/richtext.js
// ============================================================================
// The single definition of "what rich text is" in notebase: which TipTap
// extensions are enabled, how a stored document becomes plain text (for
// embeddings + search snippets), and how it becomes HTML (for read-only
// rendering with KaTeX math).
//
// Everything that touches question content — the editor, the study-view
// cards, the search index — imports from here, so the three can never
// disagree about the schema.
// ============================================================================

import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { generateHTML } from "@tiptap/html";
import katex from "katex";

/**
 * Image node with a persistent display width. The editor lets you drag a
 * handle to resize (components/editor/ImageView.jsx attaches the node view);
 * the width is stored in the document as a `width` attribute (CSS pixels)
 * so it round-trips through save/reload and renders identically in the
 * read-only views. max-width:100% (index.css) keeps any stored width from
 * overflowing narrow screens.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) =>
          attrs.width ? { style: `width: ${attrs.width}px` } : {},
        parseHTML: (element) => {
          const styleWidth = Number.parseInt(element.style?.width, 10);
          return Number.isFinite(styleWidth) ? styleWidth : null;
        },
      },
    };
  },
});

/**
 * The extension set shared by the editor and the HTML renderer.
 *
 * @param {object} [options]
 * @param {(kind, node, pos) => void} [options.onMathClick] — editor-only:
 *   invoked when a math node is clicked so the editor can offer editing.
 *   Omitted in read contexts (RichContent, Node scripts).
 */
export function richTextExtensions({ onMathClick } = {}) {
  return [
    StarterKit,
    ResizableImage,
    // throwOnError:false renders bad LaTeX as red source instead of crashing
    Mathematics.configure({
      inlineOptions: {
        katexOptions: { throwOnError: false },
        ...(onMathClick && { onClick: (node, pos) => onMathClick("inline", node, pos) }),
      },
      blockOptions: {
        katexOptions: { throwOnError: false },
        ...(onMathClick && { onClick: (node, pos) => onMathClick("block", node, pos) }),
      },
    }),
  ];
}

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Extract plain text from a stored TipTap JSON document — used to build
 * the text that gets embedded and the snippets search results show.
 * Math nodes contribute their LaTeX source; images contribute nothing.
 */
export function extractText(doc) {
  const parts = [];
  (function walk(node) {
    if (!node) return;
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.attrs?.latex) parts.push(node.attrs.latex);
    (node.content ?? []).forEach(walk);
  })(doc);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function isEmptyDoc(doc) {
  return extractText(doc) === "" && !JSON.stringify(doc).includes('"image"');
}

/**
 * Render a stored document to HTML with math typeset by KaTeX.
 *
 * generateHTML serializes math nodes as spans/divs carrying data-latex
 * (that's the extension's renderHTML output); KaTeX then replaces each
 * one's contents with typeset math. Returned string is built entirely from
 * our own serializer over schema-validated content — safe to inject.
 */
export function renderToHtml(doc) {
  const container = document.createElement("div");
  container.innerHTML = generateHTML(doc, richTextExtensions());
  for (const el of container.querySelectorAll("[data-type='inline-math'], [data-type='block-math']")) {
    katex.render(el.getAttribute("data-latex") ?? "", el, {
      displayMode: el.getAttribute("data-type") === "block-math",
      throwOnError: false,
    });
  }
  return container.innerHTML;
}
