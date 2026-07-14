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
});
