// ============================================================================
// notebase web — scripts/copy-assets.js
// ============================================================================
// Copies the two pipeline artifacts the web app needs into web/public/ so
// Vite serves them as static files:
//
//     <repo>/pdfs/**            ->  web/public/pdfs/**       (viewer iframes)
//     <repo>/search-index.json  ->  web/public/search-index.json
//
// WHY COPY INSTEAD OF COMMIT? web/public/pdfs is gitignored — committing the
// PDFs twice (repo root + public/) would double repo size and inevitably
// drift. This script runs automatically before `npm run dev` and
// `npm run build` (see predev/prebuild in package.json), so public/ is
// always a fresh mirror of the single source of truth at the repo root.
//
// Plain Node, zero dependencies. Run manually with: node scripts/copy-assets.js
// ============================================================================

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// web/scripts/ -> web/ -> repo root
const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(webDir);

const jobs = [
  { from: join(repoRoot, "pdfs"), to: join(webDir, "public", "pdfs") },
  { from: join(repoRoot, "search-index.json"), to: join(webDir, "public", "search-index.json") },
];

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    // Missing index/PDFs is a pipeline problem, not a frontend one — fail
    // loudly here instead of letting the app 404 mysteriously at runtime.
    console.error(`copy-assets: missing ${from} — run \`python pipeline/run_all.py\` first.`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true }); // fresh mirror, no stale files
  cpSync(from, to, { recursive: true });
  console.log(`copy-assets: ${from} -> ${to}`);
}
