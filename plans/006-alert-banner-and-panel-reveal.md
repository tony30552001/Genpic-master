# 006 — Bridge the generation error/warning banner and unify the inline panel reveal recipe

- **Status**: TODO
- **Commit**: df17720
- **Severity**: LOW
- **Category**: Cohesion & tokens / Accessibility
- **Estimated scope**: 12 files, one class-string change each

## Problem

### 6a — The banner that teleports

When a generation fails, an error banner is inserted above the workspace with no
transition at all, shoving the entire creation area down by its own height in a
single frame:

```jsx
/* src/InfographicGenerator.jsx:853-868 — current */
                        {(errorMsg || warningMsg) && (
                            <div className="shrink-0 px-4 lg:px-8 pt-3 space-y-2">
                                {errorMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive">
                                        <AlertCircle className="icon-sm shrink-0" />
                                        <span className="text-sm">{errorMsg}</span>
                                    </div>
                                )}
                                {warningMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-warning/50 bg-warning/10">
                                        <AlertCircle className="icon-sm text-warning shrink-0" />
                                        <span className="text-sm text-foreground">{warningMsg}</span>
                                    </div>
                                )}
                            </div>
                        )}
```

This is the one place in the app where an unexpected layout jump lands on the
user at their least patient moment.

### 6b — Twelve near-identical reveals, three durations, almost no reduced-motion

The repo already has a house recipe for inline disclosure panels —
`animate-in fade-in slide-in-from-top-2` — applied twelve times with three
different duration treatments and, in nine cases, **no reduced-motion opt-out
at all**:

| File:line | Current duration | `motion-reduce:animate-none`? |
| --- | --- | --- |
| `src/components/history/HistoryPanel.jsx:374` | none (tw default) | ✗ |
| `src/components/styles/StyleLibrary.jsx:744` | none | ✗ |
| `src/components/templates/TemplateLibrary.jsx:662` | none | ✗ |
| `src/components/create/ScriptEditor.jsx:485` | none | ✗ |
| `src/components/create/StyleAnalyzer.jsx:126` | none | ✗ |
| `src/components/create/StyleAnalyzer.jsx:144` | none | ✗ |
| `src/components/settings/LineSettings.jsx:326` | `duration-200` | ✗ |
| `src/components/create/DocumentScenes.jsx:603` | `duration-200` | ✗ |
| `src/components/create/DocumentScenes.jsx:1171` | `duration-200` | ✗ |
| `src/components/create/StyleSourceTabs.jsx:265` | `duration-200` | ✗ |
| `src/components/templates/SaveTemplateDialog.jsx:59` | `duration-300` | ✗ |
| `src/components/create/PromptSuggestionPanel.jsx:24` | `duration-300` | ✗ |
| `src/components/create/DocumentUploader.jsx:277` | `duration-300` (fade only) | ✗ |

Four more reveals in `AssetCenter` already handle reduced motion correctly but
still hardcode their duration, and they slide from the **bottom**, not the top —
a deliberate, different direction that must be preserved:

| File:line | Current | Keep direction |
| --- | --- | --- |
| `src/components/library/AssetCenter.jsx:591` | `animate-in fade-in duration-200 motion-reduce:animate-none` | fade only |
| `src/components/library/AssetCenter.jsx:655` | `animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none` | `slide-in-from-bottom-2` |
| `src/components/library/AssetCenter.jsx:671` | same as `:655` | `slide-in-from-bottom-2` |
| `src/components/library/AssetCenter.jsx:699` | same as `:655` | `slide-in-from-bottom-2` |

Hardcoded `200` / `300` values duplicate `--motion-enter`, which already exists
and already collapses to `0.01ms` under `prefers-reduced-motion`.

## Target

One recipe, used everywhere, built entirely from existing tokens:

```
animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none
```

- `duration-(--motion-enter)` = **250ms** (`src/index.css`), inside the sub-300ms
  UI budget.
- `ease-emphasized` = `cubic-bezier(0.22, 1, 0.36, 1)` (`src/index.css` `@theme`)
  — a strong ease-out, correct for an entrance.
- `motion-reduce:animate-none` removes the slide for reduced-motion users; the
  element still appears, it simply does not travel.
- `slide-in-from-top-2` is an 8px nudge from the direction the panel grows —
  never a large offset, never `scale(0)`.

For the banner (6a), the same recipe applied to each of the two inner banners:

```jsx
/* target — src/InfographicGenerator.jsx:856 */
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
```

The class goes on the two **inner** banners, not the outer `shrink-0` wrapper,
so that a warning appearing while an error is already shown animates on its own.

## Repo conventions to follow

- Duration tokens are consumed as Tailwind arbitrary properties:
  `duration-(--motion-enter)`. Exemplar — `src/components/ui/alert-dialog.jsx:16`.
  Never write `duration-200` or `duration-300` for a UI entrance.
- Easing utilities `ease-emphasized` and `ease-exit` are registered in the
  `@theme` block of `src/index.css:64-68`. Use the utility, not a raw
  cubic-bezier.
- Reduced motion for CSS-driven animation is expressed as
  `motion-reduce:animate-none`. Exemplar — `src/components/library/AssetCenter.jsx:591`.
- This plan is **pure Tailwind class edits**. It adds no imports, no `motion`
  usage, and no new CSS.

## Steps

1. `src/InfographicGenerator.jsx` — append the recipe string to the `className`
   of the error banner (line 856) and the warning banner (line 862). Leave the
   outer wrapper at line 854 unchanged.

2. For each of the twelve rows in the first 6b table, edit that element's
   `className`:
   - Remove any existing `duration-200` / `duration-300`.
   - Ensure the string contains exactly:
     `animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none`
   - **Exception — `src/components/create/DocumentUploader.jsx:277`** currently
     has `animate-in fade-in duration-300` with *no* slide. It is a one-line
     helper caption, not a panel; keep it fade-only:
     `animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none`
   - Change nothing else in these files — no markup, no logic, no other classes.

3. For the four `AssetCenter` rows in the second 6b table, change **only**
   `duration-200` → `duration-(--motion-enter)` and add `ease-emphasized`.
   **Keep `slide-in-from-bottom-2` on `:655`, `:671`, and `:699`** — those
   sections deliberately rise from below when you switch asset type; do not
   flip them to `slide-in-from-top-2`. `:591` stays fade-only.

4. Verify with a grep that no `duration-200` or `duration-300` remains paired
   with `animate-in` anywhere under `src/`.

## Boundaries

- Do NOT touch `src/components/library/AssetCenter.jsx:105`. That is the card
  **stagger** (`fill-mode-both` + an inline `animationDelay` of
  `Math.min(index, 8) * 40ms`); it already carries `motion-reduce:animate-none`
  and adding a duration could desynchronise the stagger.
- Do NOT touch the `duration-500` image reveals at
  `src/components/create/ImagePreview.jsx:95`, `:126`, or
  `src/components/create/ImageTransformPanel.jsx:106`. Those exceed the 300ms UI
  budget deliberately — they are the payoff reveal after a multi-second
  generation, which is the one place a longer beat is earned.
- Do NOT touch any overlay/modal/sheet. Those are converted to `motion` by plan
  `003`; editing their classes here will collide.
- Do NOT touch `src/components/ui/*.jsx`. The Radix primitives are already
  correct.
- Do NOT add `role="alert"` or any other ARIA attribute. The error/warning
  banners at `src/InfographicGenerator.jsx:856` and `:862` are indeed missing
  `role="alert"`, but that is an accessibility change tracked separately in
  `plans/README.md` — not a motion change.
- Do NOT add an exit animation to these panels. They are plain conditional
  renders and adding `AnimatePresence` here is out of scope.
- Do NOT add new dependencies or new CSS utilities.
- If a cited line does not match, STOP and report.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/__tests__/InfographicGenerator.test.jsx src/components/settings/__tests__/SettingsPanel.test.jsx src/components/templates/__tests__/TemplateLibrary.test.jsx` — all pass.
  - `corepack pnpm build` — succeeds.
  - Grep `src/` for `animate-in` and confirm every remaining hit either contains
    `duration-(--motion-enter)`, or is one of the documented exceptions
    (`AssetCenter.jsx:105`, the three `duration-500` image reveals, and anything
    converted to `motion` by plan `003`).
- **Feel check**: run `corepack pnpm dev`.
  - Trigger a generation error (e.g. submit with an invalid image-model
    configuration): the banner must **ease down into place** over 250ms while the
    workspace below it settles, rather than the page snapping.
  - Confirm the banner text is readable almost immediately — with a strong
    ease-out, most of the travel is done in the first ~80ms. If the text appears
    to drift in slowly, `ease-emphasized` is missing and the browser default
    ease-in-out is being used.
  - Open several of the affected disclosure panels in sequence (AI 優化 note in
    ScriptEditor, the style picker in DocumentScenes, the 批次操作列 in
    HistoryPanel): they must all now open at the **same speed and with the same
    curve**. Any panel that feels faster or slower than its neighbours was missed.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: every one of these
    panels must appear **instantly with no slide**, and no content may be hidden
    or stuck at `opacity: 0`.
- **Done when**: the generation error/warning banners animate in, every inline
  panel shares one 250ms `ease-emphasized` entrance sourced from
  `--motion-enter`, no hardcoded `duration-200`/`duration-300` remains next to an
  `animate-in`, and every one of them honours reduced motion.
