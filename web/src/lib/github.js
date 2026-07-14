// ============================================================================
// notebase web — lib/github.js
// ============================================================================
// The GitHub persistence layer for question banks (SPEC.md §11). The repo
// itself is the database:
//
//     data/question-banks/<bank-id>.json     one file per bank
//     data/assets/<asset-id>.<ext>           images uploaded from the editor
//
// READS work for everyone:
//   * with a token  -> contents API (always fresh, 5000 req/h)
//   * without       -> git trees API to list + raw.githubusercontent to
//                      fetch (CDN-cached, may lag edits by ~5 min — fine
//                      for anonymous readers)
//
// WRITES require a fine-grained personal access token with contents
// read/write on THIS repo only, pasted once in the app's settings and kept
// in localStorage (this device only, never sent anywhere except
// api.github.com). Every save is a real git commit — question history is
// browsable in the repo like any other change.
//
// CONCURRENCY: the contents API requires the file's current sha on update;
// a stale sha means someone edited elsewhere. We surface that as a clear
// error and let data/questionBanks.jsx refetch — last-writer-wins after a
// reload, which is plenty for a single-user study tool.
// ============================================================================

// The repo that IS the database. Changing these is all it takes to fork.
export const OWNER = "dnsva";
export const REPO = "notebase";
export const BRANCH = "main";
export const BANKS_DIR = "data/question-banks";
export const ASSETS_DIR = "data/assets";

const API = "https://api.github.com";
const TOKEN_KEY = "notebase.github-token";

// ---------------------------------------------------------------- token ---

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token.trim());
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasToken() {
  return !!getToken();
}

/** Throws with the API's message on non-2xx; parses JSON on success. */
async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      detail = `${detail}: ${(await response.json()).message}`;
    } catch { /* body wasn't JSON — keep the status line */ }
    const error = new Error(`GitHub API ${path} failed (${detail})`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

// -------------------------------------------------------- base64 helpers ---
// atob/btoa are latin-1 only; question text is unicode. Round-trip through
// TextEncoder/TextDecoder, chunked to stay under argument-count limits.

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------- reads ---

/**
 * List the paths of all question-bank JSON files in the repo.
 * Returns [] when the data/ tree doesn't exist yet (fresh repo).
 */
export async function listBankPaths() {
  try {
    if (hasToken()) {
      const entries = await api(
        `/repos/${OWNER}/${REPO}/contents/${BANKS_DIR}?ref=${BRANCH}`
      );
      return entries.filter((e) => e.name.endsWith(".json")).map((e) => e.path);
    }
    // Anonymous: one trees call for the whole repo, filtered client-side.
    const tree = await api(
      `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`
    );
    return tree.tree
      .filter((e) => e.path.startsWith(`${BANKS_DIR}/`) && e.path.endsWith(".json"))
      .map((e) => e.path);
  } catch (error) {
    if (error.status === 404) return []; // no data/ tree yet
    throw error;
  }
}

/**
 * Fetch one JSON file. Returns { data, sha }; sha is null on the anonymous
 * raw path (anonymous users can't write, so they never need it).
 */
export async function fetchJsonFile(path) {
  if (hasToken()) {
    const file = await api(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`);
    return { data: JSON.parse(decodeBase64(file.content)), sha: file.sha };
  }
  // Cache-busting query keeps raw's CDN from serving a minutes-old copy to
  // the person who just edited on another device.
  const response = await fetch(`${rawUrl(path)}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not fetch ${path} (HTTP ${response.status})`);
  return { data: await response.json(), sha: null };
}

export function rawUrl(path) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

// --------------------------------------------------------------- writes ---

/**
 * Create or update a JSON file. Pass the current `sha` when updating an
 * existing file (GitHub's optimistic-concurrency check); omit for creates.
 * Returns the new sha.
 */
export async function saveJsonFile(path, data, sha, message) {
  const body = {
    message,
    branch: BRANCH,
    // indent=1 keeps diffs readable in the repo without bloating size much
    content: encodeBase64(JSON.stringify(data, null, 1)),
    ...(sha ? { sha } : {}),
  };
  const result = await api(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return result.content.sha;
}

export async function deleteJsonFile(path, sha, message) {
  await api(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify({ message, branch: BRANCH, sha }),
  });
}

// --------------------------------------------------------------- images ---

/**
 * Downscale an image File to <= maxDim px on its long edge (screenshots and
 * phone photos are otherwise multi-MB), commit it to data/assets/, and
 * return a URL usable in rich text immediately (raw URL, no redeploy).
 */
export async function uploadImage(file, maxDim = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // JPEG at 0.85: photos and screenshots of notes compress well; PNGs of
  // diagrams lose transparency but questions don't need it.
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );

  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `${ASSETS_DIR}/${id}.jpg`;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  await api(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `assets: upload ${id}.jpg`,
      branch: BRANCH,
      content: btoa(binary),
    }),
  });
  return rawUrl(path);
}
