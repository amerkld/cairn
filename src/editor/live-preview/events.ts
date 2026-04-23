/**
 * DOM event handlers attached to the editor view. Right now this is just
 * the cmd/ctrl-click-to-open-link handler for regular links, autolinks,
 * and images.
 *
 * Opening is routed through `@tauri-apps/plugin-opener`. The plugin is
 * already declared in `package.json` and `tauri.conf.json`; import and
 * call happen synchronously but the open itself is fire-and-forget — the
 * handler returns before the OS hands off to the default browser.
 */
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { openUrl } from "@tauri-apps/plugin-opener";

function openExternal(url: string): void {
  // Fire-and-forget. Failures are logged rather than surfaced to the user
  // because a click that doesn't open a link is self-evident (nothing
  // happened) and we'd rather not block the editor thread.
  openUrl(url).catch((error) => {
    console.error("[live-preview] failed to open link", error);
  });
}

/**
 * Walk up from a document position looking for a Link, Image, or bare URL
 * node. Returns the URL string to open, or `null` if no such node covers
 * the position.
 */
function extractUrlAt(view: EditorView, pos: number): string | null {
  const tree = syntaxTree(view.state);
  let node = tree.resolveInner(pos, 0);
  while (node) {
    if (node.name === "URL") {
      return view.state.doc.sliceString(node.from, node.to);
    }
    if (node.name === "Link" || node.name === "Image") {
      const url = node.getChild("URL");
      if (url) return view.state.doc.sliceString(url.from, url.to);
      return null;
    }
    if (node.parent) {
      node = node.parent;
    } else {
      break;
    }
  }
  return null;
}

export const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    // Require a modifier (cmd on Mac, ctrl elsewhere) so plain clicks still
    // place the cursor normally. Accept either: users cross platforms.
    if (!event.metaKey && !event.ctrlKey) return false;
    if (event.button !== 0) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const url = extractUrlAt(view, pos);
    if (!url) return false;

    event.preventDefault();
    openExternal(url);
    return true;
  },
});
