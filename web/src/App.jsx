// ============================================================================
// notebase web — src/App.jsx
// ============================================================================
// The application shell: responsive navigation + routes. All data loading
// lives in data/appData.jsx (provided in main.jsx); all feature logic lives
// in pages/. This file only decides what's on screen where.
//
// Navigation is one <nav> styled two ways (src/index.css):
//   >= 900px  vertical sidebar on the left
//   <  900px  fixed tab bar along the bottom (thumb-reachable on phones)
//
// Routes (HashRouter, so GitHub Pages needs no server config — every deep
// link is just index.html plus a #/ fragment):
//   #/               global semantic search
//   #/notes          subject folders
//   #/notes/:subject one subject's PDFs
//   #/banks          question banks (Phase 5)
// ============================================================================

import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { QuestionBanksProvider } from "./data/questionBanks.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import NotesPage from "./pages/NotesPage.jsx";
import BanksPage from "./pages/BanksPage.jsx";
import BankPage from "./pages/BankPage.jsx";
import TokenSettings from "./components/TokenSettings.jsx";
import { hasToken } from "./lib/github.js";

export default function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-title">notebase</span>
        </div>
        {/* NavLink sets aria-current + .active on the matching route. */}
        <NavLink to="/" end className="nav-link">
          <span className="nav-icon" aria-hidden="true">🔍</span>
          <span>Search</span>
        </NavLink>
        <NavLink to="/notes" className="nav-link">
          <span className="nav-icon" aria-hidden="true">📚</span>
          <span>Notes</span>
        </NavLink>
        <NavLink to="/banks" className="nav-link">
          <span className="nav-icon" aria-hidden="true">🗂️</span>
          <span>Questions</span>
        </NavLink>
        {/* Editing unlock: dot marks whether a GitHub token is configured. */}
        <button
          type="button"
          className="nav-link nav-settings"
          onClick={() => setShowSettings(true)}
        >
          <span className="nav-icon" aria-hidden="true">{hasToken() ? "🔓" : "⚙️"}</span>
          <span>Settings</span>
        </button>
      </nav>

      <main className="content">
        <QuestionBanksProvider>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:subject" element={<NotesPage />} />
            <Route path="/banks/b/:bankId" element={<BankPage />} />
            <Route path="/banks/f/*" element={<BanksPage />} />
            <Route path="/banks" element={<BanksPage />} />
            {/* Catch-all: stale bookmarks/typos land somewhere useful. */}
            <Route path="*" element={
              <div className="page"><p className="empty">Page not found — use the navigation.</p></div>
            } />
          </Routes>
        </QuestionBanksProvider>
      </main>

      {showSettings && <TokenSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
