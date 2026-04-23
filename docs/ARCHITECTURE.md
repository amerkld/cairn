# Cairn — Architecture

Reference for how Cairn's processes, modules, and data layers are organized. Keep this current when you change module boundaries, add new IPC commands, or change a core invariant.

## 10,000 ft view

Cairn is a desktop Tauri application. One process, two halves:

- **Frontend** (React + TypeScript, rendered by the Tauri webview) — UI, keyboard shortcuts, transient view state.
- **Backend** (Rust, compiled into the Tauri binary) — vault lifecycle, filesystem I/O, reminder scheduling, OS notifications, search.

The filesystem is canonical. The frontend never holds notes exclusively in memory; every mutation is round-tripped through the Rust backend to disk and observed back via a file watcher. That means external edits (git pull, another editor) are picked up automatically and there is no divergent "editor state" to reconcile.

```
┌────────────────────────── Cairn process ──────────────────────────┐
│                                                                   │
│  React frontend (webview)                                         │
│  ├─ pages/        Home, Captures, Project, Someday, Trash         │
│  ├─ shell/        AppShell, Sidebar, CommandPalette, TitleBar     │
│  ├─ ds/           Tokenized design-system primitives              │
│  ├─ editor/       CodeMirror 6 wrapper + live-preview extension   │
│  └─ lib/          invoke wrappers, event subscriptions, utils     │
│                                                                   │
│          ▲                                   ▲                    │
│          │ invoke("open_vault", …)           │ event("reminder_   │
│          │                                   │        due", …)    │
│          ▼                                   ▼                    │
│  Tauri IPC bridge                                                 │
│          ▲                                   ▲                    │
│          │                                   │                    │
│          ▼                                   ▼                    │
│  Rust core (cairn_lib)                                            │
│  ├─ commands.rs    #[tauri::command] adapters                     │
│  ├─ vault::        open/create/bootstrap, registry                │
│  ├─ fs::           atomic IO, file watcher, trash (M3)            │
│  ├─ md::           frontmatter parse/serialize (M4)               │
│  ├─ index::        in-memory index of notes + frontmatter (M4)    │
│  ├─ reminders::    scanner + Tokio scheduler (M6)                 │
│  ├─ search::       substring scan across vault (M8)               │
│  └─ error          AppError + typed result alias                  │
│                                                                   │
└────────────────────────── OS filesystem ──────────────────────────┘
```

## Window chrome

OS decorations are disabled (`decorations: false` in `src-tauri/tauri.conf.json`), and the frontend draws its own title bar in `src/shell/TitleBar.tsx` with minimize/maximize/close rendered by `src/shell/WindowControls.tsx`. Window controls use the built-in Tauri window API directly (`@tauri-apps/api/window` → `getCurrentWindow()`), not a Cairn IPC command. The granted capabilities in `src-tauri/capabilities/default.json` are `core:window:allow-start-dragging`, `allow-minimize`, `allow-toggle-maximize`, `allow-close`, `allow-is-maximized`, `allow-hide`, `allow-show`, `allow-set-focus`.

## Quick Capture window

A second Tauri window (label `quick-capture`) is declared in `tauri.conf.json` alongside `main`. It's 520×300, undecorated, always-on-top, hidden by default, and bundled as a separate Vite entry point (`quick-capture.html` → `src/quick-capture/main.tsx`) so its webview boots with only the dialog — no AppShell, sidebar, or watcher subscriptions.

On every show, `show_quick_capture_window` recenters the window on the monitor currently holding the mouse cursor (not the primary display) so users on multi-monitor setups see it where they're actually working. The monitor is resolved by iterating `app.available_monitors()` and point-testing the cursor; if nothing matches, it falls back to the primary monitor.

The floating window is opened by a system-wide global shortcut (default `CommandOrControl+Shift+N`, configurable from Settings). `tauri-plugin-global-shortcut` delivers the keypress to the Rust handler in `lib.rs`, which checks whether any Cairn window already has OS focus — if so it returns without doing anything (the user is already inside Cairn and a floating dialog on top would be disruptive). Otherwise it calls `show_quick_capture_window`: it shows + focuses the window and emits the `quick-capture:open` event the React side listens for to reset form state. On submit or Esc, the React side calls `hide_quick_capture` to dismiss without closing — the window persists so the next shortcut press reuses it.

On close requests (Cmd/Ctrl+W, X button), the setup hook intercepts the event and hides the window instead so the shortcut stays live.

## System tray & close-to-tray

With the `tray-icon` feature enabled on the `tauri` crate, `src-tauri/src/tray/mod.rs` installs a tray icon during setup. Right-click opens a native OS menu; left-click toggles the main window show/hide.

The menu is built at tray creation and rebuilt whenever the active vault changes (inside `replace_watcher`), after `record_project_visit` (inside the command), and after project rename/delete (both of which also rewrite `projectRecency` paths in `.cairn/state.json`).

```
Menu layout
───────────
Open Cairn
─────────
Captures
─────────
Recent Projects   ← disabled header; replaced by "No recent projects"
  <project 1>       when no vault is active or recency list is empty
  <project 2>
  <project 3>
─────────
Quit Cairn
```

Project menu items use opaque IDs `tray:project:<idx>` that are resolved back to absolute paths via a side table kept in `TrayMenuState` — absolute Windows paths contain characters (colons, backslashes) we'd rather not encode round-trip through OS menu ids.

**Close-to-tray invariant.** The main window's close button signals UI intent, not process exit. Process exit happens on exactly two paths: (1) explicit Quit from the tray menu (or the `quit_app` IPC command), or (2) window close while `preferences.closeToTray == false`. When `closeToTray == true`, the main-window `CloseRequested` handler calls `api.prevent_close()` + `window.hide()` — the same pattern used for the Quick Capture window. This keeps the Quick Capture global shortcut alive, which is the whole point.

A one-time notification ("Cairn is still running — right-click the tray icon to quit.") fires the first time the user closes into the tray, gated by the sticky `trayHintShown` flag in `preferences.json`.

**Single instance.** `tauri-plugin-single-instance` is registered first so a second launch attempt while the main window is hidden surfaces the existing window instead of spawning a duplicate process (which would create a second tray icon and fail to register the global shortcut).

**Navigation from tray.** Menu clicks that target a route emit `tray:navigate` events (`{ target: "captures" }` or `{ target: "project", path }`). The frontend listens in `src/lib/tauri-events.ts::useTrayNavigate` and routes via `setState` in `AppShell`.

**Project recency.** Driven by the frontend: `AppShell` fires `record_project_visit(path)` fire-and-forget in a `useEffect` keyed on the project route. Backed by `state::project_recency` in `.cairn/state.json`, capped at `PROJECT_RECENCY_CAP` (8), with the top 3 surfaced to the tray.

## Module boundaries

Each module is a compilation unit with a single responsibility and a narrow public surface.

| Module        | Owns                                                        | Depends on |
|---------------|-------------------------------------------------------------|------------|
| `error`       | `AppError`, `AppResult<T>`; IPC-safe serialization          | —          |
| `vault`       | Vault directory lifecycle, `.cairn/` bootstrap, `VaultSummary`, config read/write | `error` |
| `registry`    | App-level registry of known vaults; persists to `app_data_dir/registry.json` | `error`, `vault` |
| `preferences` | App-level user preferences (Quick Capture shortcut); persists to `app_data_dir/preferences.json` | `error` |
| `md`          | YAML frontmatter parse + serialize (preserving unknowns); preview + title derivation | `error` |
| `fs`          | Atomic write, `list_tree`, `create_note`, `move_note`, `read_note`, `write_note` | `error`, `md`, `vault` |
| `watcher`     | Debounced vault change events; filters `.cairn/`            | `error`, `vault` |
| `state`       | Per-vault state at `.cairn/state.json` (action order, etc.) | `error`, `vault` |
| `tags`        | List/rename/delete tags across vault; config color assignment; frontmatter rewrites preserve unknown keys | `error`, `vault`, `fs`, `md` |
| `trash`       | Soft-delete via mirror tree in `.cairn/trash/`; index at `.cairn/trash-index.json`; restore with collision rename; empty-trash | `error`, `vault`, `md` |
| `search`      | Case-insensitive substring scan over titles + bodies; ranks title > body > match density; skips `.cairn/` | `error`, `vault`, `md` |
| `reminders`   | `remind_at` scanner, index at `.cairn/reminders.json`, Tokio poll-loop scheduler, OS notifications + `reminder_due` event | `md`, `fs`, `vault` |
| `tray`        | System tray icon + native menu, left-click window toggle, `tray:navigate` event emission, `refresh_tray_menu` on recency/vault changes | `state`, `AppState` |
| `search` *(M8)*| Bounded walk + case-insensitive substring scan             | `fs`       |
| `commands`    | `#[tauri::command]` IPC adapters — pure translation layer  | all of the above |

Rule: a module may not import a module from a column to its right without explicit review. This keeps the graph flat and testable.

## Vault-on-disk contract

```
<Vault>/                     ← user-visible, git-friendly
  .cairn/                    ← app-owned, do not touch from UI
    config.json              ← { name, tags, editorFullWidth }
    state.json
    reminders.json
    trash/
    trash-index.json
  Captures/                  ← .md files, flat
  Someday/                   ← .md files, flat
  Projects/
    <Project>/
      Actions/
        Archive/             ← completed actions
      assets/                ← pasted images
      <user subdirs>/
```

`config.json` carries vault metadata (`name`), tag color definitions (`tags`), and per-vault UI preferences (`editorFullWidth`). New preference keys append here — the field is read via `#[serde(default)]` so configs written before a field existed still deserialize without rewriting on load.

`state.json` holds per-vault transient state kept out of the notes themselves: `actionOrder` (cross-project Home drag order) and `projectRecency` (last-opened timestamps that drive the tray's Recent Projects menu, capped at `PROJECT_RECENCY_CAP`). Same `#[serde(default)]` forward-compatibility rule applies.

**Invariants** (enforced by `vault::` and `fs::`, never bypassed):

1. The filesystem is canonical — every read comes from disk or a watcher-invalidated cache, never from editor-local state alone.
2. Writes are atomic: temp file → rename. The destination is never half-written.
3. `.cairn/` is app-owned. No UI path writes outside it except through typed operations (create capture, move, trash, etc.).
4. User files are plain markdown. Unknown frontmatter keys are preserved on write.
5. Deletion is a move into `.cairn/trash/` plus a trash-index entry. Hard delete only via "Empty Trash".

## IPC contract

Commands are declared in `src-tauri/src/commands.rs` and proxied from the frontend by `src/lib/invoke.ts`. Every command returns `AppResult<T>`; errors serialize as `{ code, message }` on the wire.

### Phase 1 commands

| Command            | Args                    | Returns                  | Notes         |
|--------------------|-------------------------|--------------------------|---------------|
| `list_vaults`      | —                       | `VaultSummary[]`         | ordered newest-first by `last_opened_at` |
| `open_vault`       | `{ path }`              | `VaultSummary`           | bootstraps if missing; stamps last-opened; sets active |
| `create_vault`     | `{ path, name }`        | `VaultSummary`           | errors if already exists; sets active |
| `get_active_vault` | —                       | `VaultSummary \| null`   |               |
| `switch_vault`     | `{ path }`              | `VaultSummary`           | re-reads config from disk, sets active |
| `close_active_vault` | —                     | `void`                   | clears active; app returns to the picker |
| `forget_vault`     | `{ path }`              | `void`                   | removes from registry (on-disk vault untouched) |
| `list_tree`        | —                       | `Tree`                   | uses the active vault; returns `{ captures, someday, projects, trash }` |
| `create_capture`   | `{ title?, body? }`     | `NoteRef`                | writes `Captures/<ulid>.md` with default frontmatter; title goes into `title` frontmatter field (trimmed; blank dropped) |
| `move_note`        | `{ src, target }`       | `string` (final path)    | `target` is `"captures"`, `"someday"`, or a vault-relative path; collision-renames on conflict |
| `read_note`       | `{ path }`              | `ParsedNote`             | path must be inside the active vault |
| `write_note`      | `{ path, note }`        | `void`                   | atomic; preserves unknown frontmatter keys |
| `paste_image`     | `{ notePath, ext, bytes }` | `string` (asset path relative to note) | writes `<note-dir>/assets/<ulid>.<ext>` |
| `create_project`  | `{ name }`              | `string` (project path)  | creates `Projects/<name>/Actions/` |
| `rename_project`  | `{ oldPath, newName }`  | `string` (new project path) | sanitizes name; errors on collision; rewrites reminder/action-order paths; triggers scheduler rebuild |
| `delete_project`  | `{ path }`              | `void`                   | soft-delete: moves folder to `.cairn/trash/` as one entry, purges reminder/action-order refs |
| `create_action`   | `{ projectPath, title?, body? }` | `NoteRef`        | writes action with `status: open`; title in frontmatter |
| `complete_action` | `{ path, note? }`       | `string` (archive path)  | sets `completed_at` + moves to `Actions/Archive/` |
| `list_home_actions` | —                     | `HomeAction[]`           | flat list of open actions, ordered by state.json |
| `reorder_actions` | `{ order: string[] }`   | `string[]`               | persists `actionOrder` to state.json |
| `list_folder`     | `{ path }`              | `FolderContents`         | single-folder listing (markdown files + direct subfolders), excludes hidden + `assets/`; callers filter context-specific dirs |
| `create_someday`  | `{ title?, body? }`     | `NoteRef`                | writes a new markdown note to `Someday/` |
| `set_remind_at`   | `{ path, remindAt: string \| null }` | `void`     | patches `remind_at` frontmatter; triggers scheduler rebuild |
| `list_reminders`  | —                       | `ReminderEntry[]`        | current reminder index (pending entries only) |
| `list_tags`       | —                       | `TagInfo[]`              | declared + ad-hoc tags, with usage counts |
| `rename_tag`      | `{ old, new }`          | `number` (rewrite count) | rewrites frontmatter across vault; deduplicates if target exists |
| `delete_tag`      | `{ label }`             | `number` (rewrite count) | strips from all notes + removes from config |
| `set_tag_color`   | `{ label, color?: string \| null }` | `void`       | upserts color in config (inserts TagDef if new) |
| `trash_note`      | `{ path }`              | `string` (trashed path)  | soft-delete into `.cairn/trash/` with mirrored path |
| `restore_trash`   | `{ trashedPath }`       | `string` (restored path) | moves back to original, collision-renames if needed |
| `empty_trash`     | —                       | `number` (removed count) | permanently deletes everything in `.cairn/trash/` |
| `list_trash`      | —                       | `TrashEntry[]`           | index entries, newest first |
| `search_notes`    | `{ query, limit? }`     | `SearchHit[]`            | substring search over titles + bodies |
| `get_editor_full_width` | —                 | `boolean`                | reads `editorFullWidth` from the active vault's `.cairn/config.json`; `false` on legacy configs missing the field |
| `set_editor_full_width` | `{ value: bool }` | `void`                   | persists the editor layout preference into the active vault's config |
| `get_preferences` | —                       | `Preferences`            | returns user-level preferences (`{ quickCaptureShortcut, closeToTray, trayHintShown }`) |
| `set_quick_capture_shortcut` | `{ accelerator }` | `void`               | validates + registers the new accelerator, unregisters the old, persists to `preferences.json`. `AppError::Shortcut` on failure leaves the previous binding live |
| `set_close_to_tray` | `{ enabled: bool }`   | `void`                   | persists the close-to-tray preference; takes effect on the next main-window close (pref is re-read at fire time) |
| `set_tray_hint_shown` | —                   | `void`                   | marks the one-time tray hint as shown (sticky). Normally invoked from Rust after the notification fires |
| `record_project_visit` | `{ path }`         | `void`                   | upserts the project into the active vault's recency list and rebuilds the tray menu |
| `list_recent_projects` | `{ limit: number }` | `Project[]`             | top-N hydrated project entries for the active vault; excludes paths whose folders no longer exist |
| `quit_app`        | —                       | `void`                   | `app.exit(0)` — used by UI paths that need a full exit; the tray's native "Quit" item calls `app.exit(0)` directly from Rust |
| `show_quick_capture` | —                    | `void`                   | shows + focuses the Quick Capture window and emits `quick-capture:open` |
| `hide_quick_capture` | —                    | `void`                   | hides (not closes) the Quick Capture window |
| `focus_main_window` | —                     | `void`                   | brings the main window to the foreground (used by QC's no-vault empty state) |
| `set_tag` *(M7)*  | `{ path, tags: string[] }` | `void`                |               |
| `trash_note` *(M8)*| `{ path }`              | `void`                   |               |
| `restore_trash` *(M8)*| `{ path }`          | `void`                   | collision-renames on restore |
| `empty_trash` *(M8)*| —                      | `void`                   |               |
| `search` *(M8)*   | `{ query, limit? }`     | `SearchHit[]`            |               |

### Events (backend → frontend)

| Event         | Payload                       | Fired by    |
|---------------|-------------------------------|-------------|
| `vault.changed` | `{ paths: string[] }`       | `fs` watcher, debounced 150ms |
| `reminder_due` | `{ path, title, remindAt }` | `reminders` scheduler |
| `quick-capture:open` | —                       | `lib.rs` on global-shortcut press / `show_quick_capture` command |
| `tray:navigate` | `{ target: "captures" } \| { target: "project", path }` | `tray` menu handler after surfacing the main window |

### In-app shortcuts (DOM keydown — main window only)

| Keys       | Action                                              |
|------------|-----------------------------------------------------|
| Ctrl/Cmd+K | Toggle the command palette (always global) |
| Ctrl/Cmd+N | New capture + navigate to Captures (ignored while typing) |
| `?`        | Open the keyboard shortcuts sheet (ignored while typing) |

### System-wide shortcuts

Registered via `tauri-plugin-global-shortcut` in `lib.rs`'s setup hook. These fire even when Cairn does not own focus, as long as the process is running.

| Keys (default)            | Action                                          |
|---------------------------|-------------------------------------------------|
| CommandOrControl+Shift+N  | Open Quick Capture (configurable in Settings)   |

Frontend subscribes to these in `src/lib/tauri-events.ts` and invalidates the corresponding TanStack Query keys.

## Threading

- The Tauri runtime runs the webview on the main thread and command handlers on a Tokio blocking pool.
- The reminder scheduler (from M6) is a single Tokio task that parks on the earliest due instant; file saves nudge it via a channel to recompute.
- The file watcher (from M3) runs on the `notify` crate's internal thread; events are debounced (150ms) before being forwarded to the frontend, to collapse editor-save bursts.

## Editor (live-preview)

The note editor in `src/editor/` is a CodeMirror 6 wrapper whose defining extension is `live-preview.ts`. The extension decorates the markdown syntax tree so that, on any line that does not currently hold the cursor, syntax markers (`#`, `**`, `_`, `` ` ``, fenced-code fences, `---`) are hidden and the line renders formatted; on the cursor's line the raw text is shown so editing stays plain-markdown rather than WYSIWYG. Constructs handled: ATX headings 1–6, bold, italic, inline code, fenced and indented code blocks, thematic breaks.

Decorations are collected into an unsorted array and handed to `Decoration.set(ranges, /* sort */ true)` instead of a hand-ordered `RangeSetBuilder`. The builder rejects out-of-order additions, and certain well-formed trees (a heading containing inline emphasis; nested emphasis) naturally produce such sequences when line and mark decorations are emitted from the same walk. The walk itself is wrapped in a `try/catch` that keeps the previous decoration set on error rather than clearing the view.

The builder is exported as a pure function over `(EditorState, visibleRanges)` so it can be unit-tested without an `EditorView` (jsdom lacks the layout primitives a real view needs).

## Frontend state conventions

- **TanStack Query** owns server state (everything that came from `invoke`).
  - Keys are namespaced: `["vault"]`, `["tree", vaultPath]`, `["note", path]`, `["reminders", vaultPath]`.
  - `vault.changed` events invalidate `["tree", …]` and potentially specific `["note", path]` keys.
  - `reminder_due` events append to a local query for the Home "Due" section and refetch.
- **Component state (`useState`)** is reserved for purely visual / transient concerns (hover, menu open, text input being typed). Any state that would need to survive a navigation lives in a query key or URL.
- **No global store** (Redux/Zustand). If we find we need one, revisit — in Phase 1 it's not justified.

## Error handling

- Rust: every fallible operation returns `AppResult<T>`. No `unwrap`/`expect` outside tests. `AppError` variants are exhaustive and match on `code` is safe.
- Frontend: `invoke` wrappers catch errors and let TanStack Query surface them. Mutations show a toast via a shared error handler; queries show inline "couldn't load" states with a retry button.
- Never silently swallow an error. Either surface it to the user or log and rethrow.

## Testing layout

```
src-tauri/src/<module>/mod.rs   ← #[cfg(test)] mod tests
src-tauri/tests/integration.rs  ← end-to-end vault lifecycle in TempDir (M2+)
src/<module>/*.test.ts[x]       ← Vitest unit tests
tests/setup.ts                  ← jsdom + @tauri-apps/api/mocks boilerplate
```

Coverage gates (`vitest --coverage`, `cargo tarpaulin`) enforce ≥ 80% on `md::`, `vault::`, `fs::`, `reminders::`, and `src/lib/frontmatter.ts`. View components are tested at behavior level, not coverage.

## Out of scope (Phase 2+)

Freeform canvas for Captures · AI integration · sync / cloud / multi-device · mobile · plugin system · graph view · semantic search · light theme · collaborative editing.
