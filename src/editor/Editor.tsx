/**
 * React wrapper around CodeMirror 6. Owns the CM6 EditorView lifecycle,
 * debounced autosave, and paste-to-asset behavior.
 *
 * Design constraints:
 * - The editor mounts against a remote-sourced initial `body`. Remote
 *   updates (file watcher refetching after an external edit) are applied
 *   with `dispatch` rather than remount, preserving cursor position when
 *   the doc is unchanged.
 * - `onChange` fires on every keystroke with the latest body — cheap, no
 *   allocation beyond the CM6 transaction. Autosave debounce lives in the
 *   page, not here.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { livePreview } from "./live-preview";
import {
  noteDirectory,
  noteDirectoryCompartment,
} from "./live-preview/facets";
import { cairnEditorTheme } from "./editor-theme";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function dirnameOf(path: string): string {
  if (!path) return "";
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(0, idx) : "";
}

export interface EditorProps {
  /** Initial body. Not a controlled value — remote refetches sync via `remoteBody`. */
  initialBody: string;
  /** When this identity changes, the editor resets to the new content. */
  resetKey: string;
  /** Absolute path of the note, used to resolve relative image URLs via the asset protocol. */
  notePath?: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  onImagePaste?: (file: File) => Promise<string | null>;
}

export function Editor({
  initialBody,
  resetKey,
  notePath,
  onChange,
  onBlur,
  onImagePaste,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onImagePasteRef = useRef(onImagePaste);

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onImagePasteRef.current = onImagePaste;

  // Mount once. We reset content imperatively on `resetKey` change.
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialBody,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage, addKeymap: true }),
        livePreview,
        noteDirectoryCompartment.of(noteDirectory.of(dirnameOf(notePath ?? ""))),
        cairnEditorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.();
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally excludes `initialBody` — changes there come through resetKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset editor content when we navigate to a different note.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === initialBody) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: initialBody },
      selection: { anchor: 0 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Reconfigure the note directory facet whenever the note path changes
  // so image widgets can resolve relative URLs against the correct root.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: noteDirectoryCompartment.reconfigure(
        noteDirectory.of(dirnameOf(notePath ?? "")),
      ),
    });
  }, [notePath]);

  async function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    if (!onImagePasteRef.current) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const ext = item.type.slice("image/".length).toLowerCase();
      if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) continue;
      const file = item.getAsFile();
      if (!file) continue;
      event.preventDefault();
      const relativePath = await onImagePasteRef.current(file);
      if (relativePath && viewRef.current) {
        const view = viewRef.current;
        const pos = view.state.selection.main.head;
        const insertion = `![](${relativePath})`;
        view.dispatch({
          changes: { from: pos, insert: insertion },
          selection: { anchor: pos + insertion.length },
        });
      }
      break;
    }
  }

  return (
    <div
      ref={containerRef}
      onPaste={handlePaste}
      className="h-full w-full overflow-hidden text-sm"
    />
  );
}
