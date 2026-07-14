// ============================================================================
// notebase web — vite.config.js
// ============================================================================
// The only non-default setting is `base`: GitHub Pages serves project sites
// under https://<user>.github.io/<repo>/, so every asset URL must be prefixed
// with /<repo>/. CI sets VITE_BASE=/<repo>/ before `npm run build`; local dev
// and local builds fall back to "/" and just work.
// ============================================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The three heavyweight libraries change on their own release
        // cadence, not ours — splitting them means a one-line app change
        // doesn't force browsers to re-download ~500 KB of vendor code.
        manualChunks: {
          transformers: ["@huggingface/transformers"],
          editor: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-image",
                   "@tiptap/extension-mathematics", "@tiptap/html"],
          katex: ["katex"],
        },
      },
    },
  },
});
