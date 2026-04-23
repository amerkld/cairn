/**
 * Typed wrappers over Tauri `invoke`. All frontend → backend FS access MUST
 * go through this module — never call @tauri-apps/api directly from components.
 * This keeps the IPC contract (see docs/ARCHITECTURE.md) in one place and
 * makes mocking in tests straightforward.
 */
import { invoke as rawInvoke } from "@tauri-apps/api/core";

export interface VaultSummary {
  path: string;
  name: string;
  lastOpenedAt: string | null;
}

export interface NoteRef {
  path: string;
  title: string;
  preview: string;
  createdAt: string | null;
  tags: string[];
  /** ISO 8601 UTC timestamp. Set when the user wants to be reminded about this note. */
  remindAt?: string | null;
  /** YYYY-MM-DD. Action deadline. */
  deadline?: string | null;
}

export interface ReminderEntry {
  path: string;
  title: string;
  remindAt: string;
}

export interface TagInfo {
  label: string;
  color?: string | null;
  count: number;
  /** True when the tag has a config entry (e.g. for its color). */
  declared: boolean;
}

export interface TrashEntry {
  originalPath: string;
  trashedPath: string;
  title: string;
  deletedAt: string;
  /** `"note"` for single files, `"project"` for whole folders. */
  kind?: "note" | "project";
}

export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  titleMatch: boolean;
}

export interface Project {
  name: string;
  path: string;
  actions: NoteRef[];
  /** Direct-child subdirectory names inside the project (excludes Actions, assets, hidden). */
  subdirectories: string[];
}

export interface Tree {
  captures: NoteRef[];
  someday: NoteRef[];
  projects: Project[];
  trash: NoteRef[];
}

export interface HomeAction {
  projectName: string;
  projectPath: string;
  action: NoteRef;
}

export interface FolderEntry {
  name: string;
  path: string;
}

export interface FolderContents {
  files: NoteRef[];
  folders: FolderEntry[];
}

/**
 * YAML frontmatter for a note. Mirrors Rust's `md::Frontmatter` — typed
 * known fields plus `extra` for anything else the user hand-wrote.
 *
 * Any extra keys are preserved through the read → edit → write cycle. Do not
 * strip keys from `extra` just because you don't recognize them.
 */
export interface Frontmatter {
  id?: string | null;
  title?: string | null;
  tags?: string[];
  deadline?: string | null; // YYYY-MM-DD
  remind_at?: string | null; // ISO 8601
  status?: "open" | "done" | null;
  order?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  complete_note?: string | null;
  [key: string]: unknown;
}

export interface ParsedNote {
  frontmatter: Frontmatter;
  body: string;
}

export interface AppError {
  code: string;
  message: string;
}

/** Target location for moving a note. Extra slashes map to a vault-relative path. */
export type MoveTarget = "captures" | "someday" | (string & {});

/**
 * App-level (cross-vault) preferences. Mirrors Rust's `PreferencesSnapshot`.
 */
export interface Preferences {
  /** Tauri accelerator string for the Quick Capture global shortcut, e.g. `CommandOrControl+Shift+N`. */
  quickCaptureShortcut: string;
  /**
   * When `true`, closing the main window hides it and keeps Cairn alive in
   * the system tray (preserving the Quick Capture global shortcut). When
   * `false`, closing the main window exits the app.
   */
  closeToTray: boolean;
  /**
   * Sticky flag: has the user already seen the one-time "Cairn is still
   * running in the system tray" notification? Surfaced so a future settings
   * reset can re-show the hint.
   */
  trayHintShown: boolean;
}

/**
 * Must match `preferences::DEFAULT_QUICK_CAPTURE_SHORTCUT` in the Rust side.
 * Used by the settings UI as the accelerator a "Reset to default" restores.
 */
export const DEFAULT_QUICK_CAPTURE_SHORTCUT = "CommandOrControl+Shift+N";

/**
 * Args for note-creation commands. Title is written to frontmatter; body is
 * the markdown beneath the frontmatter block. Both optional — most callers
 * will pass one or the other, not both.
 */
export interface NewNoteArgs {
  title?: string;
  body?: string;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return rawInvoke<T>(command, args);
}

export const api = {
  listVaults: () => call<VaultSummary[]>("list_vaults"),
  openVault: (path: string) => call<VaultSummary>("open_vault", { path }),
  createVault: (path: string, name: string) =>
    call<VaultSummary>("create_vault", { path, name }),
  getActiveVault: () => call<VaultSummary | null>("get_active_vault"),
  switchVault: (path: string) => call<VaultSummary>("switch_vault", { path }),
  closeActiveVault: () => call<void>("close_active_vault"),
  forgetVault: (path: string) => call<void>("forget_vault", { path }),

  listTree: () => call<Tree>("list_tree"),
  createCapture: (args: NewNoteArgs = {}) =>
    call<NoteRef>("create_capture", {
      title: args.title,
      body: args.body,
    }),
  createSomeday: (args: NewNoteArgs = {}) =>
    call<NoteRef>("create_someday", {
      title: args.title,
      body: args.body,
    }),
  moveNote: (src: string, target: MoveTarget) =>
    call<string>("move_note", { src, target }),

  readNote: (path: string) => call<ParsedNote>("read_note", { path }),
  writeNote: (path: string, note: ParsedNote) =>
    call<void>("write_note", { path, note }),
  pasteImage: (notePath: string, ext: string, bytes: number[]) =>
    call<string>("paste_image", { notePath, ext, bytes }),

  createProject: (name: string) => call<string>("create_project", { name }),
  renameProject: (oldPath: string, newName: string) =>
    call<string>("rename_project", { oldPath, newName }),
  deleteProject: (path: string) => call<void>("delete_project", { path }),
  createAction: (projectPath: string, args: NewNoteArgs = {}) =>
    call<NoteRef>("create_action", {
      projectPath,
      title: args.title,
      body: args.body,
    }),
  completeAction: (path: string, note?: string) =>
    call<string>("complete_action", note !== undefined ? { path, note } : { path }),
  listHomeActions: () => call<HomeAction[]>("list_home_actions"),
  reorderActions: (order: string[]) => call<string[]>("reorder_actions", { order }),
  listFolder: (path: string) => call<FolderContents>("list_folder", { path }),
  setRemindAt: (path: string, remindAt: string | null) =>
    call<void>("set_remind_at", { path, remindAt }),
  listReminders: () => call<ReminderEntry[]>("list_reminders"),

  listTags: () => call<TagInfo[]>("list_tags"),
  renameTag: (oldLabel: string, newLabel: string) =>
    call<number>("rename_tag", { old: oldLabel, new: newLabel }),
  deleteTag: (label: string) => call<number>("delete_tag", { label }),
  setTagColor: (label: string, color: string | null) =>
    call<void>("set_tag_color", { label, color }),

  getEditorFullWidth: () => call<boolean>("get_editor_full_width"),
  setEditorFullWidth: (value: boolean) =>
    call<void>("set_editor_full_width", { value }),

  trashNote: (path: string) => call<string>("trash_note", { path }),
  restoreTrash: (trashedPath: string) =>
    call<string>("restore_trash", { trashedPath }),
  emptyTrash: () => call<number>("empty_trash"),
  listTrash: () => call<TrashEntry[]>("list_trash"),
  searchNotes: (query: string, limit?: number) =>
    call<SearchHit[]>(
      "search_notes",
      limit !== undefined ? { query, limit } : { query },
    ),

  getPreferences: () => call<Preferences>("get_preferences"),
  setQuickCaptureShortcut: (accelerator: string) =>
    call<void>("set_quick_capture_shortcut", { accelerator }),
  setCloseToTray: (enabled: boolean) =>
    call<void>("set_close_to_tray", { enabled }),
  setTrayHintShown: () => call<void>("set_tray_hint_shown"),
  recordProjectVisit: (path: string) =>
    call<void>("record_project_visit", { path }),
  listRecentProjects: (limit: number) =>
    call<Project[]>("list_recent_projects", { limit }),
  quitApp: () => call<void>("quit_app"),
  showQuickCapture: () => call<void>("show_quick_capture"),
  hideQuickCapture: () => call<void>("hide_quick_capture"),
  focusMainWindow: () => call<void>("focus_main_window"),
};

export type Api = typeof api;
