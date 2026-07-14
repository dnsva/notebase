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

/** The extension set shared by the editor and the HTML renderer. */
export function richTextExtensions() {
  return [
    StarterKit,
    Image,
    // throwOnError:false renders bad LaTeX as red source instead of crashing
    Mathematics.configure({
      inlineOptions: { katexOptions: { throwOnError: false } },
      blockOptions: { katexOptions: { throwOnError: false } },
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
