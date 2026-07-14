// ============================================================================
// notebase web — components/TokenSettings.jsx
// ============================================================================
// The "unlock editing" dialog. Question banks are stored in the GitHub repo
// (lib/github.js), so editing needs a fine-grained personal access token
// with Contents read/write on ONLY this repo. The token lives in this
// browser's localStorage — it never leaves the device except in calls to
// api.github.com.
//
// The app works read-only without a token, so this dialog is discoverable
// but never blocking. Saving reloads the page: simpler and more reliable
// than re-running every fetch path with new credentials.
// ============================================================================

import { useState } from "react";
import { getToken, setToken, OWNER, REPO } from "../lib/github.js";

export default function TokenSettings({ onClose }) {
  const [value, setValue] = useState(getToken() ?? "");

  function save() {
    setToken(value);
    window.location.reload();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="GitHub token settings">
        <h3 className="modal-title">Editing access</h3>
        <p className="modal-text">
          Question banks live in the <code>{OWNER}/{REPO}</code> GitHub repo.
          To create or edit questions from this device, paste a{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            fine-grained personal access token
          </a>{" "}
          with <strong>Contents: read &amp; write</strong> permission on only
          that repo. It's stored in this browser and sent only to
          api.github.com. Without one, everything stays read-only.
        </p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="github_pat_…"
          aria-label="GitHub personal access token"
        />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          {getToken() && (
            <button
              type="button"
              className="secondary danger"
              onClick={() => { setToken(null); window.location.reload(); }}
            >
              Remove token
            </button>
          )}
          <button type="button" className="primary" onClick={save} disabled={!value.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
