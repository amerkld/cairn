/**
 * Editor-facing facets. Facets are the CM6-idiomatic way to feed runtime
 * context into a plugin or widget without coupling the plugin directly to
 * React. The plugin exposes a `Compartment` so the host component can
 * reconfigure the facet value when the underlying React prop changes
 * (e.g. navigating between notes).
 */
import { Compartment, Facet } from "@codemirror/state";

/**
 * Absolute directory of the currently-open note. Used by image widgets to
 * resolve relative `![](assets/foo.png)` paths into asset-protocol URLs.
 * Empty string means "unknown" — widgets treat that as "only render
 * http(s)/data URLs".
 */
export const noteDirectory = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? "",
});

/**
 * Compartment that wraps the `noteDirectory` facet so the host can
 * reconfigure it via `dispatch({ effects: compartment.reconfigure(...) })`
 * without rebuilding the entire EditorState.
 */
export const noteDirectoryCompartment = new Compartment();
