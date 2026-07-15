// ============================================================================
// notebase web — lib/useEscape.js
// ============================================================================
// Escape-key handling for modals, in one place so every dialog behaves the
// same. The handler is kept in a ref so callers can pass a fresh closure
// each render without re-binding the listener.
// ============================================================================

import { useEffect, useRef } from "react";

export default function useEscape(onEscape) {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        handlerRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
