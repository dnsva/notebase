// ============================================================================
// notebase web — SearchBox.jsx
// ============================================================================
// Controlled search input. Submits on Enter or button click; disabled until
// App reports the index + model are ready (the placeholder explains nothing —
// App's status line does that job).
// ============================================================================

import { useState } from "react";

export default function SearchBox({ onSearch, disabled }) {
  const [query, setQuery] = useState("");

  function handleSubmit(event) {
    event.preventDefault(); // stay a single-page app — no form navigation
    onSearch(query);
  }

  return (
    <form className="search-box" onSubmit={handleSubmit}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="e.g. how to add two vectors"
        disabled={disabled}
        autoFocus
        aria-label="Search notes"
      />
      <button type="submit" disabled={disabled || !query.trim()}>
        Search
      </button>
    </form>
  );
}
