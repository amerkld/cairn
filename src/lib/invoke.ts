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
  createCapture: (body?: string) =>
    call<NoteRef>("create_capture", body !== undefined ? { body } : undefined),
  createSomeday: (body?: string) =>
    call<NoteRef>("create_someday", body !== undefined ? { body } : undefined),
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
  createAction: (projectPath: string, body?: string) =>
    call<NoteRef>(
      "create_action",
      body !== undefined ? { projectPath, body } : { projectPath },
    ),
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
};

export type Api = typeof api;
