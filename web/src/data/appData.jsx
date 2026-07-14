// ============================================================================
// notebase web — data/appData.jsx
// ============================================================================
// App-wide startup data as a React context: the notes index and the
// embedding model, loaded once in parallel when the app mounts, shared by
// every page (SearchPage ranks against the index; NotesPage renders its
// file list; Stage 2's question pages embed on save).
//
//   const { status, modelProgress, error, index, embedder } = useAppData();
//
// status: "loading" -> "ready" | "error". Pages that only need the index
// (NotesPage) still get it as soon as it's available via `index`, even if
// the (slower) model download is still in flight.
// ============================================================================

import { createContext, useContext, useEffect, useState } from "react";
import { loadEmbedder } from "../lib/embeddings.js";
import { loadNotesIndex } from "./notesIndex.js";

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [modelProgress, setModelProgress] = useState(0);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(null);
  const [embedder, setEmbedder] = useState(null);

  useEffect(() => {
    let cancelled = false; // StrictMode double-mount guard
    (async () => {
      try {
        // Surface the index as soon as it lands (it's tiny); the model is
        // the long pole and gates only the "ready" status.
        const indexPromise = loadNotesIndex().then((loaded) => {
          if (!cancelled) setIndex(loaded);
          return loaded;
        });
        const [, loadedEmbedder] = await Promise.all([
          indexPromise,
          loadEmbedder(setModelProgress),
        ]);
        if (cancelled) return;
        setEmbedder(() => loadedEmbedder); // function value — wrap for setState
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppDataContext.Provider value={{ status, modelProgress, error, index, embedder }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside <AppDataProvider>");
  return value;
}
