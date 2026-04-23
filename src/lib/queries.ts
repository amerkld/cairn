/**
 * TanStack Query keys + hooks wrapping the typed invoke layer.
 *
 * Why a wrapper module: TanStack Query's cache keys are strings; tests,
 * event-driven invalidations, and mutations all need to agree on the same
 * names. Centralizing them here is how we keep that contract consistent.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  api,
  type FolderContents,
  type HomeAction,
  type MoveTarget,
  type NewNoteArgs,
  type NoteRef,
  type ParsedNote,
  type Preferences,
  type ReminderEntry,
  type TagInfo,
  type Tree,
  type TrashEntry,
  type VaultSummary,
} from "./invoke";

export const queryKeys = {
  vaults: ["vaults"] as const,
  activeVault: ["vault", "active"] as const,
  tree: ["tree"] as const,
  note: (path: string) => ["note", path] as const,
  homeActions: ["home-actions"] as const,
  folder: (path: string) => ["folder", path] as const,
  reminders: ["reminders"] as const,
  tags: ["tags"] as const,
  trash: ["trash"] as const,
  preferences: ["preferences"] as const,
};

export function useVaultsQuery(
  options?: Omit<UseQueryOptions<VaultSummary[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.vaults,
    queryFn: api.listVaults,
    ...options,
  });
}

export function useActiveVaultQuery(
  options?: Omit<UseQueryOptions<VaultSummary | null>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.activeVault,
    queryFn: api.getActiveVault,
    ...options,
  });
}

export function useTreeQuery(
  options?: Omit<UseQueryOptions<Tree>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.tree,
    queryFn: api.listTree,
    ...options,
  });
}

export function useNoteQuery(
  path: string | null,
  options?: Omit<UseQueryOptions<ParsedNote>, "queryKey" | "queryFn" | "enabled">,
) {
  return useQuery({
    queryKey: queryKeys.note(path ?? ""),
    queryFn: () => {
      if (!path) throw new Error("note path required");
      return api.readNote(path);
    },
    enabled: !!path,
    ...options,
  });
}

export function useOpenVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.openVault(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vaults });
      qc.invalidateQueries({ queryKey: queryKeys.activeVault });
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useSwitchVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.switchVault(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vaults });
      qc.invalidateQueries({ queryKey: queryKeys.activeVault });
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useForgetVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.forgetVault(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vaults });
      qc.invalidateQueries({ queryKey: queryKeys.activeVault });
    },
  });
}

export function useCloseActiveVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.closeActiveVault(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.activeVault });
      qc.removeQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useCreateCapture() {
  const qc = useQueryClient();
  return useMutation<NoteRef, unknown, NewNoteArgs | undefined>({
    mutationFn: (args) => api.createCapture(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useCreateSomeday() {
  const qc = useQueryClient();
  return useMutation<NoteRef, unknown, NewNoteArgs | undefined>({
    mutationFn: (args) => api.createSomeday(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useMoveNote() {
  const qc = useQueryClient();
  return useMutation<string, unknown, { src: string; target: MoveTarget }>({
    mutationFn: ({ src, target }) => api.moveNote(src, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

export function useWriteNote() {
  const qc = useQueryClient();
  return useMutation<void, unknown, { path: string; note: ParsedNote }>({
    mutationFn: ({ path, note }) => api.writeNote(path, note),
    onSuccess: (_void, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.note(variables.path) });
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
    },
  });
}

export function useHomeActionsQuery() {
  return useQuery<HomeAction[]>({
    queryKey: queryKeys.homeActions,
    queryFn: api.listHomeActions,
  });
}

export function useFolderQuery(
  path: string | null,
  options?: Omit<UseQueryOptions<FolderContents>, "queryKey" | "queryFn" | "enabled">,
) {
  return useQuery({
    queryKey: queryKeys.folder(path ?? ""),
    queryFn: () => {
      if (!path) throw new Error("folder path required");
      return api.listFolder(path);
    },
    enabled: !!path,
    ...options,
  });
}

export function useRemindersQuery() {
  return useQuery<ReminderEntry[]>({
    queryKey: queryKeys.reminders,
    queryFn: api.listReminders,
  });
}

export function useSetRemindAt() {
  const qc = useQueryClient();
  return useMutation<void, unknown, { path: string; remindAt: string | null }>({
    mutationFn: ({ path, remindAt }) => api.setRemindAt(path, remindAt),
    onSuccess: (_void, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.note(variables.path) });
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
      qc.invalidateQueries({ queryKey: queryKeys.reminders });
    },
  });
}

export function useTagsQuery() {
  return useQuery<TagInfo[]>({
    queryKey: queryKeys.tags,
    queryFn: api.listTags,
  });
}

/** Any tag mutation may rewrite many notes — invalidate everything that
 * reads them so the UI stays coherent without a full reload. */
function invalidateAfterTagRewrite(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.tags });
  qc.invalidateQueries({ queryKey: queryKeys.tree });
  qc.invalidateQueries({ queryKey: queryKeys.homeActions });
  qc.invalidateQueries({ queryKey: ["folder"] });
  qc.invalidateQueries({ queryKey: ["note"] });
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation<number, unknown, { oldLabel: string; newLabel: string }>({
    mutationFn: ({ oldLabel, newLabel }) => api.renameTag(oldLabel, newLabel),
    onSuccess: () => invalidateAfterTagRewrite(qc),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation<number, unknown, string>({
    mutationFn: (label) => api.deleteTag(label),
    onSuccess: () => invalidateAfterTagRewrite(qc),
  });
}

export function useSetTagColor() {
  const qc = useQueryClient();
  return useMutation<void, unknown, { label: string; color: string | null }>({
    mutationFn: ({ label, color }) => api.setTagColor(label, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useTrashQuery() {
  return useQuery<TrashEntry[]>({
    queryKey: queryKeys.trash,
    queryFn: api.listTrash,
  });
}

/** Invalidate anything that might display the note being trashed/restored. */
function invalidateAfterTrashMove(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.tree });
  qc.invalidateQueries({ queryKey: queryKeys.homeActions });
  qc.invalidateQueries({ queryKey: queryKeys.trash });
  qc.invalidateQueries({ queryKey: queryKeys.tags });
  qc.invalidateQueries({ queryKey: queryKeys.reminders });
  qc.invalidateQueries({ queryKey: ["folder"] });
}

export function useTrashNote() {
  const qc = useQueryClient();
  return useMutation<string, unknown, string>({
    mutationFn: (path) => api.trashNote(path),
    onSuccess: () => invalidateAfterTrashMove(qc),
  });
}

export function useRestoreTrash() {
  const qc = useQueryClient();
  return useMutation<string, unknown, string>({
    mutationFn: (trashedPath) => api.restoreTrash(trashedPath),
    onSuccess: () => invalidateAfterTrashMove(qc),
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation<number, unknown, void>({
    mutationFn: () => api.emptyTrash(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash });
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation<string, unknown, string>({
    mutationFn: (name) => api.createProject(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
    },
  });
}

/** After a project rename or delete, every path-keyed cache that could
 * contain references inside the project needs to refetch. */
function invalidateAfterProjectMove(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.tree });
  qc.invalidateQueries({ queryKey: queryKeys.homeActions });
  qc.invalidateQueries({ queryKey: queryKeys.reminders });
  qc.invalidateQueries({ queryKey: queryKeys.trash });
  qc.invalidateQueries({ queryKey: ["folder"] });
  qc.invalidateQueries({ queryKey: ["note"] });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation<
    string,
    unknown,
    { oldPath: string; newName: string }
  >({
    mutationFn: ({ oldPath, newName }) => api.renameProject(oldPath, newName),
    onSuccess: () => invalidateAfterProjectMove(qc),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (path) => api.deleteProject(path),
    onSuccess: () => invalidateAfterProjectMove(qc),
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation<
    NoteRef,
    unknown,
    { projectPath: string; title?: string; body?: string }
  >({
    mutationFn: ({ projectPath, title, body }) => {
      const args: NewNoteArgs = {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
      };
      return api.createAction(projectPath, args);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
    },
  });
}

export function usePreferencesQuery(
  options?: Omit<UseQueryOptions<Preferences>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: api.getPreferences,
    ...options,
  });
}

export function useSetQuickCaptureShortcut() {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (accelerator) => api.setQuickCaptureShortcut(accelerator),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.preferences });
    },
  });
}

export function useSetCloseToTray() {
  const qc = useQueryClient();
  return useMutation<void, unknown, boolean>({
    mutationFn: (enabled) => api.setCloseToTray(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.preferences });
    },
  });
}

export function useCompleteAction() {
  const qc = useQueryClient();
  return useMutation<string, unknown, { path: string; note?: string }>({
    mutationFn: ({ path, note }) => api.completeAction(path, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tree });
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
    },
  });
}

export function useReorderActions() {
  const qc = useQueryClient();
  return useMutation<string[], unknown, string[]>({
    mutationFn: (order) => api.reorderActions(order),
    // Optimistically set the new order so the drag animation doesn't snap
    // back while the mutation is in flight.
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: queryKeys.homeActions });
      const previous = qc.getQueryData<HomeAction[]>(queryKeys.homeActions);
      if (previous) {
        const indexOf = new Map(order.map((p, i) => [p, i]));
        const reordered = [...previous].sort(
          (a, b) =>
            (indexOf.get(a.action.path) ?? Number.MAX_SAFE_INTEGER) -
            (indexOf.get(b.action.path) ?? Number.MAX_SAFE_INTEGER),
        );
        qc.setQueryData(queryKeys.homeActions, reordered);
      }
      return { previous };
    },
    onError: (_err, _order, ctx) => {
      const previous = (ctx as { previous?: HomeAction[] } | undefined)?.previous;
      if (previous) qc.setQueryData(queryKeys.homeActions, previous);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.homeActions });
    },
  });
}
