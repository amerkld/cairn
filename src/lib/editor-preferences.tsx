/**
 * Per-vault editor preferences loaded once at vault-open and kept in React
 * context so any component can read or mutate them without a prop drill.
 *
 * `fullWidth` flips the `data-editor-width` attribute on the document root,
 * which the `--editor-max-width` token reads from — that's how the setting
 * re-flows the editor without rebuilding CodeMirror's EditorView.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./invoke";

interface EditorPreferencesValue {
  fullWidth: boolean;
  /** True while the initial preference fetch is still in flight. */
  loading: boolean;
  setFullWidth: (value: boolean) => Promise<void>;
}

const EditorPreferencesContext = createContext<EditorPreferencesValue | null>(null);

function applyToDom(fullWidth: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.editorWidth = fullWidth ? "full" : "narrow";
}

export function EditorPreferencesProvider({ children }: { children: ReactNode }) {
  const [fullWidth, setFullWidthState] = useState(false);
  const [loading, setLoading] = useState(true);

  // Hydrate once per mount. The provider is mounted under AppShell, which
  // is only rendered when an active vault exists — so the IPC call is safe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await api.getEditorFullWidth();
        if (cancelled) return;
        setFullWidthState(value);
        applyToDom(value);
      } catch {
        // Surface-safe fallback: keep the default (narrow) layout. The
        // Settings dialog will show the current state on next open and
        // the user can retry from there.
        if (!cancelled) applyToDom(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the DOM attribute in sync after any other mutation too — belt and
  // braces in case the state is set from somewhere that forgets to call
  // `applyToDom` directly.
  useEffect(() => {
    applyToDom(fullWidth);
  }, [fullWidth]);

  const setFullWidth = useCallback(async (value: boolean) => {
    const previous = fullWidth;
    setFullWidthState(value);
    applyToDom(value);
    try {
      await api.setEditorFullWidth(value);
    } catch (err) {
      // Revert local + DOM state so the UI reflects on-disk reality.
      setFullWidthState(previous);
      applyToDom(previous);
      throw err;
    }
  }, [fullWidth]);

  return (
    <EditorPreferencesContext.Provider value={{ fullWidth, loading, setFullWidth }}>
      {children}
    </EditorPreferencesContext.Provider>
  );
}

export function useEditorPreferences(): EditorPreferencesValue {
  const ctx = useContext(EditorPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useEditorPreferences must be used within <EditorPreferencesProvider>",
    );
  }
  return ctx;
}
