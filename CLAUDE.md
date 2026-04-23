# CLAUDE.md

Instructions for Claude Code (and anyone else using an LLM coding assistant) working inside this repo. Read before making changes.

## What Cairn is

Cairn is a local-first desktop note / knowledge / GTD app. Vaults are user-chosen directories containing plain markdown files; per-vault config and state live in `.cairn/` inside each vault. AI is **not** in Phase 1. See `specs/SPEC_0.md` for the product spec and `docs/ARCHITECTURE.md` / `docs/DESIGN.md` for the technical and visual references.

## Stack

- Tauri 2 + Rust 1.77+ (backend)
- React 18 + TypeScript 5 + Vite 5 (frontend)
- Tailwind CSS + shadcn-style primitives (UI)
- CodeMirror 6 (editor, from M4)
- pnpm for package management

## Build / run / test

```bash
# first-time setup
pnpm install

# dev — runs Vite + Tauri windowed app
pnpm tauri:dev

# Rust-only checks
cd src-tauri && cargo check
cd src-tauri && cargo test

# Frontend-only checks
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm lint
```

## Testing discipline (required, not optional)

Every change ships with tests. **A PR that adds or changes code without tests is incomplete.**

- **Every new Rust module:** `#[cfg(test)] mod tests` in `mod.rs` covering the happy path plus at least one failure path per public function.
- **Every new React component with logic** (state, effects, handlers that touch `invoke`): a colocated `*.test.tsx` with `@testing-library/react` and mocked IPC via `@tauri-apps/api/mocks`.
- **Every bug fix:** a regression test that fails before the fix and passes after. If the bug is visual, add a DOM or snapshot assertion, not just a comment.
- **Coverage gate:** ≥ 80% lines/statements on `md::`, `vault::`, `fs::`, `reminders::`, `src/lib/frontmatter.ts`. Enforced in CI; do not lower the thresholds to unblock a PR.

Tests that hit real filesystem use `tempfile::TempDir` (Rust) or the mocked IPC layer (frontend). Never point a test at a real vault directory on the developer's machine.

## Code-quality restrictions

These are hard rules. Violations are PR-blocking.

### TypeScript / React
- `any` is forbidden. Use `unknown` + narrowing, or define the type.
- `@ts-ignore` / `@ts-expect-error` require a one-line comment above them explaining why the type checker is wrong.
- No hardcoded colors, radii, or font sizes in components. Everything comes from `tokens.css` via Tailwind classes.
- No inline `style={{…}}` except for programmatic values (drag offsets, computed widths).
- Keep files focused. Split when a file passes ~300 LOC or takes on a second responsibility.
- No new runtime dependency without a one-line justification in the PR description.
- Components exported from `src/ds/` and `src/shell/` must be `forwardRef`'d.

### Rust
- No `unwrap()` or `expect()` outside `#[cfg(test)]`. Return `AppResult<T>`.
- No `panic!` in library code. Tauri command handlers must never panic.
- Every public item on every public module carries a `///` doc comment. Private items get one only when the "why" would not be obvious.
- No direct `std::fs` calls in `commands.rs` — go through `fs::` (atomic writes and trash invariants are owned there).
- Never strip unknown frontmatter keys from a user's file when writing it back. The markdown is the user's.

### Shared
- No silent error swallowing. Either surface to the user or log with context and propagate.
- Never make a change "just in case" or to preemptively refactor unrelated code. Stay focused on the task.

## Filesystem invariants Claude must respect

These are stated in `docs/ARCHITECTURE.md` and are non-negotiable:

1. The filesystem is canonical. Do not introduce editor-local state that isn't round-tripped to disk.
2. Writes are atomic — use `fs::atomic_write` (once `fs::` is in), never a raw `fs::write` into a user-facing file.
3. `.cairn/` is app-owned; everything outside it is the user's. Anything a user-facing command writes outside `.cairn/` is a user-inspectable markdown file or asset.
4. Unknown frontmatter keys are preserved verbatim on write.
5. Deletion moves the file into `.cairn/trash/` and appends a trash-index entry. Hard deletion happens only on explicit "Empty Trash".
6. The main window's close button is a UI signal, not a process exit. When `preferences.closeToTray == true` (default), close hides the window and Quick Capture's global shortcut stays alive. Process exit happens only on explicit tray Quit, the `quit_app` IPC, or close while `closeToTray == false`.

## When to update documentation

- Visual or token change → update `docs/DESIGN.md` in the same PR.
- New module, new IPC command, or a changed invariant → update `docs/ARCHITECTURE.md` in the same PR.
- Change to build / test / conventions in this file → update this file.

## Project layout at a glance

```
Cairn/
  specs/SPEC_0.md              ← product spec (source of intent)
  docs/
    DESIGN.md                  ← visual identity, tokens, components
    ARCHITECTURE.md            ← system architecture, IPC, invariants
    EDITOR.md                  ← markdown editor reference (features, live-preview, how to extend)
  src/                         ← React frontend
    ds/                        ← design-system primitives
    shell/                     ← AppShell, Sidebar, etc.
    pages/                     ← routed pages
    editor/                    ← CodeMirror wrapper (M4)
    lib/                       ← invoke wrappers, utilities
    tokens.css                 ← CSS tokens, single source of truth
    main.tsx, app.tsx
  src-tauri/                   ← Rust backend
    src/
      main.rs, lib.rs
      commands.rs              ← IPC adapters, no business logic
      error.rs
      vault/, fs/ (M3), md/ (M4), …
    capabilities/default.json  ← Tauri permissions (FS is NOT granted here)
    tauri.conf.json
    Cargo.toml
  tests/setup.ts               ← Vitest setup, Tauri IPC mock defaults
  sample/                      ← dev/demo vault (not bundled). Open this in Cairn to smoke-test features.
  package.json
  CLAUDE.md                    ← this file
```

## If you are about to …

- **Add a new frontend → backend call:** declare it in `commands.rs`, register it in `lib.rs`'s `invoke_handler`, add a typed wrapper in `src/lib/invoke.ts`, document it in `docs/ARCHITECTURE.md` § "IPC contract", and write tests on both sides.
- **Add a new color or shadow:** put it in `tokens.css` + `tailwind.config.ts` + `docs/DESIGN.md`. Do not add it in a component.
- **Touch anything in `src/editor/`:** read `docs/EDITOR.md` first. New markdown constructs, live-preview decorations, theme classes, and interaction handlers all have a documented place in that file — update it in the same PR if architecture changes.
- **Touch anything in `.cairn/`:** stop and check that you're going through the `vault`/`fs` modules. Ad-hoc writes into `.cairn/` are a bug.
- **Write a bug fix:** write the failing test first, then the fix.
