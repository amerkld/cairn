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

OS decorations are disabled (`decorations: false` in `src-tauri/tauri.conf.json`), and the frontend draws its own title bar in `src/shell/TitleBar.tsx` with minimize/maximize/close rendered by `src/shell/WindowControls.tsx`. Window controls use the built-in Tauri window API directly (`@tauri-apps/api/window` → `getCurrentWindow()`), not a Cairn IPC command. The granted capabilities in `src-tauri/capabilities/default.json` are `core:window:allow-start-dragging`, `allow-minimize`, `allow-toggle-maximize`, `allow-close`, `allow-is-maximized`.

## Module boundaries

Each module is a compilation unit with a single responsibility and a narrow public surface.

| Module        | Owns                                                        | Depends on |
|---------------|-------------------------------------------------------------|------------|
| `error`       | `AppError`, `AppResult<T>`; IPC-safe serialization          | —          |
| `vault`       | Vault directory lifecycle, `.cairn/` bootstrap, `VaultSummary`, config read/write | `error` |
| `registry`    | App-level registry of known vaults; persists to `app_data_dir/registry.json` | `error`, `vault` |
| `md`          | YAML frontmatter parse + serialize (preserving unknowns); preview + title derivation | `error` |
| `fs`          | Atomic write, `list_tree`, `create_note`, `move_note`, `read_note`, `write_note` | `error`, `md`, `vault` |
| `watcher`     | Debounced vault change events; filters `.cairn/`            | `error`, `vault` |
| `state`       | Per-vault state at `.cairn/state.json` (action order, etc.) | `error`, `vault` |
| `tags`        | List/rename/delete tags across vault; config color assignment; frontmatter rewrites preserve unknown keys | `error`, `vault`, `fs`, `md` |
| `trash`       | Soft-delete via mirror tree in `.cairn/trash/`; index at `.cairn/trash-index.json`; restore with collision rename; empty-trash | `error`, `vault`, `md` |
| `search`      | Case-insensitive substring scan over titles + bodies; ranks title > body > match density; skips `.cairn/` | `error`, `vault`, `md` |
| `reminders`   | `remind_at` scanner, index at `.cairn/reminders.json`, Tokio poll-loop scheduler, OS notifications + `reminder_due` event | `md`, `fs`, `vault` |
| `search` *(M8)*| Bounded walk + case-insensitive substring scan             | `fs`       |
| `commands`    | `#[tauri::command]` IPC adapters — pure translation layer  | all of the above |

Rule: a module may not import a module from a column to its right without explicit review. This keeps the graph flat and testable.

## Vault-on-disk contract

```
<Vault>/                     ← user-visible, git-friendly
  .cairn/                    ← app-owned, do not touch from UI
    config.json
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
| `create_capture`   | `{ body? }`             | `NoteRef`                | writes `Captures/<ulid>.md` with default frontmatter |
| `move_note`        | `{ src, target }`       | `string` (final path)    | `target` is `"captures"`, `"someday"`, or a vault-relative path; collision-renames on conflict |
| `read_note`       | `{ path }`              | `ParsedNote`             | path must be inside the active vault |
| `write_note`      | `{ path, note }`        | `void`                   | atomic; preserves unknown frontmatter keys |
| `paste_image`     | `{ notePath, ext, bytes }` | `string` (asset path relative to note) | writes `<note-dir>/assets/<ulid>.<ext>` |
| `create_project`  | `{ name }`              | `string` (project path)  | creates `Projects/<name>/Actions/` |
| `rename_project`  | `{ oldPath, newName }`  | `string` (new project path) | sanitizes name; errors on collision; rewrites reminder/action-order paths; triggers scheduler rebuild |
| `delete_project`  | `{ path }`              | `void`                   | soft-delete: moves folder to `.cairn/trash/` as one entry, purges reminder/action-order refs |
| `create_action`   | `{ projectPath, body? }` | `NoteRef`               | writes action with `status: open` |
| `complete_action` | `{ path, note? }`       | `string` (archive path)  | sets `completed_at` + moves to `Actions/Archive/` |
| `list_home_actions` | —                     | `HomeAction[]`           | flat list of open actions, ordered by state.json |
| `reorder_actions` | `{ order: string[] }`   | `string[]`               | persists `actionOrder` to state.json |
| `list_folder`     | `{ path }`              | `FolderContents`         | single-folder listing (markdown files + direct subfolders), excludes hidden + `assets/`; callers filter context-specific dirs |
| `create_someday`  | `{ body? }`             | `NoteRef`                | writes a new markdown note to `Someday/` |
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

### Global shortcuts (frontend)

| Keys       | Action                                              |
|------------|-----------------------------------------------------|
| Ctrl/Cmd+K | Toggle the command palette (always global) |
| Ctrl/Cmd+N | New capture + navigate to Captures (ignored while typing) |
| `?`        | Open the keyboard shortcuts sheet (ignored while typing) |

Frontend subscribes to these in `src/lib/tauri-events.ts` and invalidates the corresponding TanStack Query keys.

## Threading

- The Tauri runtime runs the webview on the main thread and command handlers on a Tokio blocking pool.
- The reminder scheduler (from M6) is a single Tokio task that parks on the earliest due instant; file saves nudge it via a channel to recompute.
- The file watcher (from M3) runs on the `notify` crate's internal thread; events are debounced (150ms) before being forwarded to the frontend, to collapse editor-save bursts.

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
