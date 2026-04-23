# Cairn — Design System

Source of truth for Cairn's visual identity. If a component needs a color, radius, spacing step, or transition that isn't described here, the fix is to add it to the system — not to one-off it in the component.

Tokens live in `src/tokens.css` (CSS variables) and are re-exported through `tailwind.config.ts`. Components use Tailwind utility classes (`bg-bg-surface`, `text-fg-primary`, `border-border-subtle`); raw hex values in components are prohibited.

## Voice and tone

Calm. Focused. Premium. The interface should feel like something you turn to when you want to *think clearly*, not a busy app clamoring for your attention.

- **Not playful.** No emoji in defaults, no bouncing animations, no rainbow color coding.
- **Not enterprise.** No bloat, no heavy chrome, no "dashboard template" affordances.
- **Calm confidence.** The product is opinionated; the UI should feel decisive without being loud.

## Color

Cairn is dark-first. The palette is built on near-black neutrals with a hint of warmth so the single accent color (`#fac775`) integrates without clashing. Colors are defined as HSL triplets in `tokens.css` so Tailwind's `<alpha-value>` syntax works.

### Surface scale (backgrounds)

| Token             | HSL                | Usage                                                |
|-------------------|--------------------|------------------------------------------------------|
| `bg-base`         | `220 10% 6%`       | App background                                       |
| `bg-surface`      | `220 9% 9%`        | Sidebar, title bar, card surface                     |
| `bg-elevated`     | `220 8% 12%`       | Hovered rows, active nav, inputs-on-surface          |
| `bg-overlay`      | `220 10% 4%`       | Modal scrims, deep overlays                          |

### Foreground scale (text/icons)

| Token            | HSL               | Usage                                             |
|------------------|-------------------|---------------------------------------------------|
| `fg-primary`     | `220 15% 94%`     | Titles, body text at full emphasis                |
| `fg-secondary`   | `220 8% 70%`      | Supporting text, secondary labels                 |
| `fg-muted`       | `220 6% 52%`      | Metadata, timestamps, placeholder text            |
| `fg-onAccent`    | `30 30% 10%`      | Text that sits on top of the accent color         |

### Borders

| Token            | HSL               | Usage                                             |
|------------------|-------------------|---------------------------------------------------|
| `border-subtle`  | `220 8% 17%`      | Default borders (cards, inputs, table rows)       |
| `border-strong`  | `220 10% 26%`     | Hover state, dividers demanding more emphasis     |

### Accent — `#fac775`

`HSL(37 92% 72%)`. The single brand color. Use it sparingly:

| Token            | HSL               | Usage                                             |
|------------------|-------------------|---------------------------------------------------|
| `accent`         | `37 92% 72%`      | Primary button, focus ring, active nav indicator, single "due" chip per row |
| `accent-muted`   | `37 60% 30%`      | Low-emphasis accent-coded chips/badges            |

**Do** use the accent to mark *one* thing in a region of the screen.
**Don't** paint large flats of yellow, use gradients of the accent, or combine it with decorative fills in the same region.

### State

| Token            | HSL               | Usage                                             |
|------------------|-------------------|---------------------------------------------------|
| `danger`         | `358 70% 60%`     | Destructive action confirmation, error states     |

## Typography

- **UI:** Inter (bundled via `@fontsource/inter`), weights 400/500/600
- **Code / editor metadata:** JetBrains Mono

### Scale

| Use                 | Size / line-height / tracking              |
|---------------------|--------------------------------------------|
| Page title          | `text-2xl` (1.5rem) / `font-semibold` / `tracking-tight` |
| Section title       | `text-xs uppercase tracking-wider` (0.75rem, `font-medium`, `text-fg-muted`) |
| Body                | `text-sm` (0.875rem)                       |
| Metadata            | `text-2xs` (0.6875rem) `uppercase tracking-wider` |
| Inline code         | `text-[0.85em] font-mono`                  |

Reserve `text-3xl+` for empty-state hero moments only — never for standing UI.

## Spacing & radius

Spacing follows the Tailwind default scale (4px increments). Radius:

- `rounded-sm` (4px) — chips, badges
- `rounded` (6px) — buttons, inputs, menu items
- `rounded-md` (8px) — small cards
- `rounded-lg` (10px) — standard cards, panels
- `rounded-xl` (14px) — modals, hero surfaces

Avoid radius larger than 14px; Cairn is crisp, not bubbly.

## Layout tokens

| Token                 | Default   | Usage                                                     |
|-----------------------|-----------|-----------------------------------------------------------|
| `--editor-max-width`  | `48rem`   | Max width of the editor column (body + frontmatter title). Set to `100%` when `data-editor-width="full"` is on `:root`, flipped by the "Full-width editor" setting. |

**Page frames.** Top-level list pages (Home, Captures, Someday, Trash, Project) span the full width between the sidebar and the window edge, separated only by a `px-10 py-10` gutter — no `max-w-*` on the page wrapper. The editor is the only page that constrains its column width, via `--editor-max-width`. Small empty-state / not-found blocks inside these pages may still use `max-w-md` for a narrow centered column — that's a content treatment, not a page frame.

## Elevation

Shadows are subtle. The hierarchy is mostly conveyed through border + background contrast; shadows are reserved for overlays.

- `shadow-subtle` — small cards that need to separate from background
- `shadow-elevated` — popovers, dropdown menus
- `shadow-focus` — focus ring companion (see Focus below)

## Focus

Every focusable element gets a `focus-visible` ring composed of two shadows: an inner `bg-base` spacer (2px) and an outer `accent @ 0.55` (2px). Defined globally in `src/index.css`. Do not override per component unless there's a specific shape reason.

## Motion

Transitions are short and deliberate.

| Token               | Value          | Use                                        |
|---------------------|----------------|--------------------------------------------|
| `duration-fast`     | `120ms`        | Hover color, opacity, minor state changes  |
| `duration`          | `160ms` (default) | Open/close micro-interactions           |
| `duration-slow`     | `240ms`        | Modal/drawer enter-exit                    |
| `ease-swift`        | `cubic-bezier(0.22, 1, 0.36, 1)` | Standard easing          |

`prefers-reduced-motion: reduce` kills all transitions and animations globally (see `tokens.css`).

## Component guidelines

### Buttons

- **Primary** — single per screen region. Accent background, `fg-onAccent` text.
- **Secondary** — default. Transparent/elevated surface with `border-subtle`, hover bumps to `border-strong`.
- **Ghost** — text-only, for tertiary actions.
- **Danger** — outlined, reserved for destructive confirms.

Sizes: `sm` (h-7), `md` (h-8, default), `lg` (h-10), `icon` (h-8 w-8).

### Switch (`src/ds/Switch.tsx`)

Two-state toggle for on/off preferences (e.g. the "Full-width editor" setting). `role="switch"` with `aria-checked`; click or Space/Enter toggles. Controlled via `checked` + `onCheckedChange` — the caller owns state.

- Sizes: `sm` (h-4 w-7), `md` (h-5 w-9, default).
- On: `bg-accent`. Off: `bg-elevated` with a `border-subtle` outline. Thumb is `fg-primary` with a subtle shadow.
- Focus ring reuses the app's accent-colored `focus-visible` treatment.
- Use inside `SettingRow` (label + description + control) in the Settings dialog.

### Title bar & window chrome

Cairn draws its own title bar; OS decorations are disabled cross-platform (`decorations: false` in `tauri.conf.json`). The bar is `h-9` (36px), `bg-surface` with a 1px `border-subtle` bottom.

- **Left cluster** — logo + "Cairn" wordmark + `·` separator + vault name. Sits on the drag region; double-click toggles maximize, matching native behavior.
- **Right cluster** — minimize / maximize-or-restore / close. Rendered by `WindowControls` as three raw `<button>` elements (not DS `Button`) so they sit flush to the top-right edge with no radius.
  - Each button: `h-9 w-11`, icon only, `text-fg-secondary` default.
  - Min / max hover: `bg-bg-elevated` + `text-fg-primary`.
  - Close hover: `bg-danger` + `text-fg-primary` (white X on red, native convention).
  - Icons from `lucide-react`: `Minus`, `Square` (or `Copy` when maximized, rendered as a restore glyph), `X`. Stroke width `1.5`, size `12–14`.
  - `tabIndex={-1}` — chrome is never a tab stop.

The drag region is set in `src/index.css` via `-webkit-app-region`; buttons inside `.app-title-bar` automatically opt out.

### System tray menu

The tray icon uses the bundled app icon (`src-tauri/icons/icon.ico`); no new asset is introduced. The right-click menu is deliberately native-OS-styled — Windows 11 and macOS don't let applications theme tray menus, and a custom popup's cost (focus handling, multi-monitor positioning, accessibility) isn't worth the brand win for a tertiary surface. The menu stays terse ("Open Cairn", "Captures", "Recent Projects" section, "Quit Cairn") to blend with every other tray-resident app the user has running.

### Cards

Rounded-lg, 1px `border-subtle`, `bg-surface`. Hover feedback only if the card is interactive; otherwise cards are static containers.

### Tables / rows (Home, Captures list view)

Dense but readable. 36–40px row height. No zebra striping. Hover state is `bg-elevated` with `duration-fast` transition. Sticky header uses `bg-surface` with `border-b border-subtle`.

### Badges / chips

Small, rounded-sm, 2xs uppercase text. Three tones: `neutral`, `accent` (used once per context max), `danger`.

### Empty states

Every page has one. Structure: centered, two lines max, optional subtle icon at 50% opacity above. Copy is specific ("No actions yet — open a vault and create a project") not generic ("Nothing here").

### Loading states

Skeletons, not spinners. Animated shimmer is off-limits; prefer a static placeholder with `bg-elevated`.

## Screens (Phase 1 references)

### Home
- Page title ("Home") with "Today" eyebrow label above it
- Section: **Due** — subset of actions with `deadline <= today` or `remind_at <= now`
- Section: **Actions** — grouped by project, table rows, drag-sort, checkmark to complete
- Primary action top-right: "New capture"

### Captures
- Grid of cards (3 or 4 columns depending on width)
- Each card: title, first ~120 chars, created timestamp, tag chips
- Per-card menu: Open · Move to Project · Move to Someday · Trash
- Filter bar with tag chips at top

### Project
- Split layout: left file tree (200–240px), right editor
- Breadcrumb at top: Vault · Project · (path)

### Editor
- Metadata bar at top: title field, tag chips (add/remove), deadline picker, actions
- CodeMirror body below, padded
- Save indicator in bottom-right (subtle; appears briefly on save)
- Title and body share a single column whose width is driven by `--editor-max-width`. The "Full-width editor" preference (Settings dialog → Editor section) flips the token between `48rem` (centered readable column) and `100%` (edge-to-edge). The switch preserves undo history — it toggles the token, not the CodeMirror instance.

**Live-preview classes** (defined in `src/editor/editor-theme.ts`, applied by `live-preview.ts`):

| Class                      | Applied to      | Purpose                                              |
|----------------------------|-----------------|------------------------------------------------------|
| `cm-heading cm-heading-1…6`| Heading line    | Heading size + weight (see Typography scale)         |
| `cm-rendered-bold`         | Range over `**…**` | `font-weight: 600`                                |
| `cm-rendered-italic`       | Range over `*…*`| `font-style: italic`                                 |
| `cm-rendered-code`         | Inner text of `` `…` ``| Monospace + `bg-elevated` background          |
| `cm-rendered-code-block`   | Each line of a fenced/indented code block | Monospace, `bg-elevated` background that reads as a continuous block |
| `cm-rendered-hr`           | Thematic-break line | `::after` draws a 1px `border-subtle` rule; the `---` text is hidden on non-cursor lines |

### Someday / Trash
- Simple list view with per-row actions (Remind / Restore / Delete)

## Acceptance bar

- The UI does not look like a template. If a design feels like it could be from ten other SaaS apps, rework it.
- Accent color usage is disciplined. If two elements in a single region of the screen are both using `accent`, one of them is wrong.
- Every page has a designed empty state and a designed loading state before it can ship.
