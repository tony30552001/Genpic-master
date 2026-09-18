# 002 — Add press feedback to the shared Button primitive and retire the four ad-hoc copies

- **Status**: DONE — implemented with a correction, see *As implemented* below
- **Commit**: df17720
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Cohesion & tokens
- **Estimated scope**: 5 files, small edits

## Problem

The shared shadcn/ui button primitive has no press feedback at all. Its base
class string only transitions colour:

```jsx
/* src/components/ui/button.jsx:8-9 — current */
const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors duration-(--motion-hover) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

Every `<Button>` in the app — the whole admin panel, every dialog footer, every
icon button in `ImageLightbox` and `AssetMetadataSheet` — therefore gives no
physical acknowledgement that it was pressed. On touch devices, where there is
no hover state to fall back on, the press registers as nothing at all.

Four places have independently noticed this and hand-rolled the same fix with
three different scale values and three different transition declarations:

```jsx
/* src/components/create/GenerateBar.jsx:150 — current */
                        "flex-1 text-sm font-bold shadow-md transition-shadow hover:shadow-lg active:scale-[0.98] motion-reduce:transform-none",
```

```jsx
/* src/components/create/PromptSuggestionPanel.jsx:78 — current */
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-shadow duration-150 hover:bg-primary/90 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

```jsx
/* src/components/templates/SaveTemplateDialog.jsx:160 — current */
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] motion-reduce:transform-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

```jsx
/* src/components/common/ThemeToggle.jsx:17 — current */
        "h-10 w-10 shrink-0 rounded-lg transition-[background-color,color,transform] active:scale-[0.97] motion-reduce:transform-none",
```

```jsx
/* src/InfographicGenerator.jsx:1204 — current */
                    className="sm:hidden fixed bottom-[calc(64px+env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg transition-[box-shadow,transform] hover:bg-primary/90 active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

Three problems compound here:

1. **Scale values diverge**: `0.98`, `0.97`, and `0.95`.
2. **Three of the five declare no transform duration at all** — `transition-shadow`
   and `transition-colors` do not cover `transform`, so `active:scale-[0.98]`
   snaps instantly on press *and* on release. That is a 0ms press, not feedback.
3. `motion-reduce:transform-none` is repeated five times because there is no
   shared place to put it.

Buttons are hit tens of times a day, so per the frequency rule this must be
**near-imperceptible** — fast and subtle, not a bouncy squish.

## Target

One shared Tailwind v4 utility in `src/index.css`, consumed by the `Button`
base class and by the five ad-hoc sites:

```css
/* target — src/index.css, alongside the other @utility blocks */
@utility press-feedback {
  transition: transform var(--dur-micro) var(--ease-out);

  &:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }
}
```

Exact values, all pre-existing tokens from `tokens.css:47-52`:

| Property | Value | Source |
| --- | --- | --- |
| Duration | `--dur-micro` = `120ms` | `tokens.css:50` — inside the 100–160ms press-feedback budget |
| Easing | `--ease-out` = `cubic-bezier(0.16, 1, 0.3, 1)` | `tokens.css:47` |
| Scale | `0.98` | subtle end of the 0.95–0.98 range, correct for a tens-per-day control |

The explicit `@media (prefers-reduced-motion: reduce)` block inside the utility
is **required**: the reduced-motion override in `src/index.css` only collapses
`--motion-enter`, `--motion-exit`, and `--motion-hover`. It does **not** touch
`--dur-micro`, so the utility must handle reduced motion itself.

Button base becomes:

```jsx
/* target — src/components/ui/button.jsx:9 */
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors duration-(--motion-hover) ease-emphasized press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
```

`transition-colors duration-(--motion-hover)` stays exactly as-is — colour
feedback keeps its 200ms timing; only `transform` gets the separate 120ms track,
which is why this must be a CSS utility rather than a Tailwind `transition-*`
utility (a single Tailwind `duration-*` cannot give two properties two
durations).

Disabled buttons are unaffected: the base already has
`disabled:pointer-events-none`, so `:active` never matches.

## Repo conventions to follow

- `src/index.css` already defines custom utilities with Tailwind v4's `@utility`
  at-rule — `bg-gradient-header`, `bg-dot-grid`, `min-w-sidebar`, `icon-xs`
  through `icon-display`. Place `press-feedback` in that same block, after
  `icon-display`.
- The repo already writes this exact press pattern in plain CSS. Exemplar —
  `src/index.css`, `.login-provider-button`:

  ```css
  transition:
    background-color var(--dur-short) var(--ease-out),
    border-color var(--dur-short) var(--ease-out),
    transform var(--dur-micro) var(--ease-out);
  ```
  ```css
  .login-provider-button:active {
    transform: translateY(1px);
  }
  ```

  Match its token choices (`--dur-micro`, `--ease-out`) exactly.
- Conditional class composition uses `cn()` from `src/lib/utils.js`.

## Steps

1. In `src/index.css`, add the `press-feedback` utility from the **Target**
   section immediately after the existing `@utility icon-display { … }` block.
   Copy it verbatim, including the nested `@media (prefers-reduced-motion: reduce)`.

2. In `src/components/ui/button.jsx`, insert `press-feedback` into the `cva`
   base string on line 9, between `ease-emphasized` and `focus-visible:outline-none`.
   Change nothing else in that file — no variant, size, or `asChild` changes.

3. In `src/components/create/GenerateBar.jsx:150`, replace
   `active:scale-[0.98] motion-reduce:transform-none` with `press-feedback`.
   Leave `transition-shadow hover:shadow-lg` intact. Result:

   ```jsx
                       "flex-1 text-sm font-bold shadow-md transition-shadow hover:shadow-lg press-feedback",
   ```

   Note this element is already a `<Button>`, so it would inherit
   `press-feedback` from step 2 anyway — removing the local copy is the point.
   You may drop the class entirely here instead of writing `press-feedback`;
   either is acceptable, but do not leave `active:scale-[0.98]` behind.

4. In `src/components/templates/SaveTemplateDialog.jsx:160`, replace
   `active:scale-[0.98] motion-reduce:transform-none` with `press-feedback`.
   This is a bare `<button>`, not a `<Button>`, so the class **must** be present.

5. In `src/components/create/PromptSuggestionPanel.jsx:78`, replace
   `active:scale-[0.98] motion-reduce:transform-none` with `press-feedback`.
   This is a bare `<button>` — the class must be present.

6. In `src/components/common/ThemeToggle.jsx:17`, replace
   `transition-[background-color,color,transform] active:scale-[0.97] motion-reduce:transform-none`
   with `transition-[background-color,color] press-feedback`. The `transform`
   entry is removed from the Tailwind transition list because `press-feedback`
   now owns the transform track at 120ms.

7. In `src/InfographicGenerator.jsx:1204`, replace
   `transition-[box-shadow,transform] hover:bg-primary/90 active:scale-95 motion-reduce:transform-none`
   with `transition-[box-shadow,background-color] hover:bg-primary/90 press-feedback`.
   This deliberately changes the scale from `0.95` to the shared `0.98`.

8. Re-run the grep below and confirm it returns **zero** results:

   ```
   active:scale-
   ```

## Boundaries

- Do NOT change the `0.98` scale value in the utility, and do NOT add a second
  scale for "bigger" buttons. One value, app-wide.
- Do NOT convert any of the five bare `<button>` elements into `<Button>`
  components — that is a structural refactor outside this plan.
- Do NOT add press feedback to non-pressable elements (cards, list rows,
  `HistoryCard`, `StyleCard`, tab triggers).
- Do NOT touch `src/tokens.css` — `--dur-micro` and `--ease-out` already exist
  with the right values.
- Do NOT change `transition-colors duration-(--motion-hover)` on the Button base.
- Do NOT add new dependencies.
- If `src/components/ui/button.jsx:9` no longer matches the excerpt above
  (drift since commit `df17720`), STOP and report.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/components/common/__tests__/ThemeToggle.test.jsx src/components/create/__tests__/GenerateBar.test.jsx` — passes.
  - `corepack pnpm build` — succeeds, and the emitted CSS in `dist/assets/*.css`
    contains `scale(0.98)` exactly once.
- **Feel check**: run `corepack pnpm dev`.
  - Press and **hold** any `<Button>` (e.g. the 取消 button in a dialog footer):
    it must shrink slightly and *stay* shrunk while held, then ease back on
    release. If it snaps instantly in either direction, the transition is not
    being applied.
  - In DevTools → Animations, set playback to 10%, then press a button and watch
    the release: the scale must glide back over the slowed-down 120ms, not jump.
  - Confirm the effect is **barely noticeable at full speed**. If it reads as a
    visible "squish", the value is wrong — it should feel like the button
    acknowledged you, not like it animated.
  - Tap a button on a touch device or in DevTools device emulation: feedback must
    fire on tap. Confirm no button gets stuck in the scaled state after the tap.
  - Hover a `<Button>` and confirm the background colour still crossfades over
    200ms, unchanged from before.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: pressing a button
    must produce **no scale at all**, while the hover/active colour change
    remains.
- **Done when**: `active:scale-` returns zero grep hits, every `<Button>` in the
  app acknowledges a press, and the shrink is invisible unless you look for it.


## As implemented

The plan's core premise — that `press-feedback` could carry the `transform`
track while each call site kept its own `transition-colors` / `transition-shadow`
utility as an independent second track — is not achievable in Tailwind v4.

`transition-colors` emits the `transition-property` / `transition-duration` /
`transition-timing-function` **longhands**, while a custom `@utility` written
with the `transition` **shorthand** resets all three. Both land in
`@layer utilities` at the same specificity (0,1,0), so source order decides — and
Tailwind's own utilities compile after the custom one. Verified in the built
stylesheet: `.press-feedback` at byte 25405, `.transition-colors` at 77647.
`transition-colors` won, `transform` never entered the transition list, and every
`<Button>` would have had a 0ms press: exactly the bug this plan set out to fix.

There was no source-order fix — whichever track compiles last silently kills the
other. The implemented utility therefore owns the **entire** transition and
carries a doubled-class specificity bump so a stray `transition-*` utility can
never override it again:

```css
@utility press-feedback {
  &.press-feedback {
    transition:
      color var(--motion-hover) var(--ease-emphasized),
      background-color var(--motion-hover) var(--ease-emphasized),
      border-color var(--motion-hover) var(--ease-emphasized),
      box-shadow var(--motion-hover) var(--ease-emphasized),
      opacity var(--motion-hover) var(--ease-emphasized),
      transform var(--dur-micro) var(--ease-out);
  }
  …
}
```

Consequences, all accepted:

- `opacity` **must** be in the list — without it the `sm:transition-opacity`
  hover-reveal on the destructive icon Button regresses to instant.
- The redundant `transition-*` classes were removed from all six call sites.
- `disabled:opacity-50` now fades over 200ms instead of snapping.
- Three bare buttons moved from a 150ms to a 200ms shadow, which is the
  cohesion outcome this plan wanted anyway.

The verification step "compiled CSS contains `scale(0.98)` exactly once" is also
wrong: the pre-existing `@keyframes image-generation-drift` matches too, so the
correct count is 2.