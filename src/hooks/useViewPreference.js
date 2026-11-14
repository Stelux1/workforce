import { useState } from "react";

/**
 * Persists the selected view ("grid" | "list") per page key in localStorage.
 * @param {string} key - unique page key, e.g. "employees", "documents"
 * @param {"grid"|"list"} defaultView
 */
export function useViewPreference(key, defaultView = "grid") {
  const storageKey = `view_pref_${key}`;
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || defaultView;
    } catch {
      return defaultView;
    }
  });

  const setAndPersist = (v) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  };

  return [view, setAndPersist];
}