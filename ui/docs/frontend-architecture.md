# Frontend architecture

How the Owl Bot web app (`src/`) is organised, and where new code and styles go.

## Folder layout

```
src/
  main.tsx                  Boots React; imports styles/index.css (the only CSS import)
  app/
    App.tsx                 Routes. Protected routes share <RequireAuth>; most pages sit in <AppShell>
    app_shell.tsx           Sidebar + page frame (layout route with <Outlet/>)
    store.ts                Redux store and typed hooks (useAppDispatch / useAppSelector)
  shared/                   Used by more than one feature — no feature imports here
    api/base_fetch.ts       Authenticated fetch base class
    lib/firebase.ts         Firebase app/auth/firestore
    ui/                     UI kit: ui.tsx (Modal, Button, Field, Toggle…), ui.css,
                            agent_avatar.tsx, owl_icon.tsx
    types.ts                Types shared across features (messages, sessions…)
  styles/
    index.css               Style entry point: @imports in cascade order
    tokens.css              Design tokens (CSS variables)
    base.css                Reset, element defaults, global scrollbar, focus rings
    layout.css              App frame (sidebar + content columns)
    themes/                 sky.css (active), sand.css — loaded last, override tokens
  features/<feature>/
    api/                    Calls to the backend for this feature
    components/             React components (pages and their parts)
    state/                  Redux slices
    hooks/, lib/, model/    Feature-only hooks, helpers, data classes (when needed)
    styles/                 This feature's stylesheets
    types.ts                Feature types
```

Features: `auth`, `chat`, `whatsapp`, `agents`, `pipelines`, `native_agents`,
`storage` (knowledge base), `insights` (usage, search), `billing`.

### Rules of thumb

- **Put code in the feature that owns it.** Move it to `shared/` only when a
  second feature needs it.
- **Imports use the `@/` alias** (`@/features/chat/api/chat_api`). Relative
  imports are fine within a folder (`./x`); ESLint rejects `../../`.
- **No barrel files** (`index.ts` re-exports). Import the module directly. Barrels
  slow Vite down and would create import cycles here (chat ↔ agents ↔ native_agents).
- **Files are `snake_case`; components are `PascalCase`.**
- **Every protected page goes inside `<Route element={<Protected />}>` in
  `App.tsx`.** Add it under `<AppShell />` if it needs the sidebar.

## Styles

All CSS is global and plain. Maintainability comes from three rules.

### 1. One entry point, explicit order

`src/main.tsx` imports `styles/index.css`, and nothing else imports CSS (ESLint
enforces this). The `@import` list in `index.css` *is* the cascade order:

1. `tokens.css`, `base.css`, `layout.css`
2. `shared/ui/ui.css`
3. each feature's stylesheets
4. the theme (last)

When two rules have the same specificity, the later file wins. Because
components don't import CSS, this order never depends on which component happens
to load first.

**Adding styles for a new component:**
- If the feature already has a suitable stylesheet in `features/<feature>/styles/`,
  add the styles there.
- Otherwise create a new file and add one `@import` line in the feature's place in
  `styles/index.css`.

### 2. Tokens, not literal values

Colours, radii, shadows, fonts and sizes live in `styles/tokens.css` as CSS
variables. Use `var(--accent)`, `var(--radius-md)`, and so on. A theme only
redefines tokens (plus a few deliberate overrides), so a hard-coded colour is a
spot the theme can't reach.

Token families: `--bg-*`, `--border*`, `--text-pri/sec/ter`, `--accent*`,
`--danger*`, `--radius-*`, `--shadow-*`, `--font*`, `--sb-w`, `--speed`. The
knowledge-base aliases (`--bg`, `--surface`, `--text-primary`…) exist for
`storage.css`; prefer the main names in new code.

### 3. One owner per class

- Each class is styled in one file, by the component that renders it. Selectors
  use the component's prefix: `chat_history_*` (sidebar), `wa_*` (WhatsApp),
  `pl_*` (pipelines), `na_*` (provider agents), `bl_*` (billing),
  `use_*`/`srch_*` (insights).
- **Don't add a second rule for the same selector in another file** to tweak it.
  Change the original rule. Override stacks are how the old CSS grew to 7,600
  lines.
- Responsive variants go in a `@media` block in the same file as the base rule.

### Shared UI kit

`shared/ui/ui.tsx` + `shared/ui/ui.css` provide the building blocks every page
uses: page header (`ag_page*`), buttons (`ag_btn`, `ag_btn--primary|ghost|danger`,
`ag_icon_btn`), inputs (`ag_input`), fields (`ag_field`), switch, segmented
control, chips and modal.

These classes keep their historical `ag_` prefix (from when they belonged to the
agents page). A rename to `ui_*` is a safe follow-up as a separate change.

### Themes

`styles/themes/sky.css` is active. To switch themes, change the last `@import` in
`styles/index.css` to `./themes/sand.css`, or remove it to get the base look.
Themes use `:root:root` so their tokens win over `tokens.css`.

## How this layout was introduced (October 2026)

The reorganisation was checked to cause no visual change:
- every screen was rendered offline before and after (13 pages at desktop size,
  plus the collapsed sidebar and 4 pages at phone size);
- the computed style of every element was compared, and all were identical;
- each CSS merge and move was also checked statically, so a rule never jumps past
  another rule that could tie with it on the same element.

Along the way:
- the `chat_modern.css` override layer was merged into the rules it overrode;
- 35 unused rules (and one unused selector) were removed;
- 1,297 rules / 5,106 declarations became 1,211 / 4,829, in 16 per-component files
  instead of 9 mixed ones.
