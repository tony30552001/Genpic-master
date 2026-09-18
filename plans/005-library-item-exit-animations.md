# 005 — Animate library items out on delete instead of letting the grid jump

- **Status**: DONE — step 7 fallback taken, see *As implemented* below
- **Commit**: df17720
- **Severity**: LOW
- **Category**: Cohesion & tokens / Missed opportunities
- **Estimated scope**: 5 files, 6 item roots + 6 map sites

> **Depends on plan `003`**: it introduces `OVERLAY_EXIT` in
> `src/lib/motionTokens.js`. Execute `003` first, or add that export here.

## Problem

Deleting a style, template, or history record removes the item from state and
the card disappears in a single frame, snapping every following card into a new
grid cell. There is no bridge between the two layouts:

```jsx
/* src/components/history/HistoryPanel.jsx:498-511 — current (grid) */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[1920px]:grid-cols-7 pb-10">
          {filtered.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              …
              onDelete={(id) => setPendingDeleteId(id)}
```

The same pattern repeats six times:

| File | Line | View |
| --- | --- | --- |
| `src/components/history/HistoryPanel.jsx` | 484 | list |
| `src/components/history/HistoryPanel.jsx` | 499 | grid |
| `src/components/styles/StyleLibrary.jsx` | 836 | list |
| `src/components/styles/StyleLibrary.jsx` | 854 | grid |
| `src/components/templates/TemplateLibrary.jsx` | 788 | list |
| `src/components/templates/TemplateLibrary.jsx` | 805 | grid |

In the 5-to-7-column grids used at wide breakpoints, deleting one card can
reshuffle a whole row. The user confirmed the deletion of *one* item and the
entire page appears to change.

Note the entrance side is already handled elsewhere in this codebase —
`src/components/library/AssetCenter.jsx:105-106` staggers cards in at 40ms
intervals — so the exit is the only missing half.

## Target

Wrap each `.map()` in `AnimatePresence` and make each item root a motion
element that carries a `layout` prop and a mirrored exit.

```jsx
/* target — item root pattern */
    <M.article
      layout
      exit={{ opacity: 0, scale: 0.97, transition: OVERLAY_EXIT }}
      className="…unchanged classes…"
    >
```

```jsx
/* target — map site pattern */
        <div className="grid grid-cols-1 gap-3 …">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((item) => (
              <HistoryCard key={item.id} … />
            ))}
          </AnimatePresence>
        </div>
```

Exact values:

| Property | Value | Source |
| --- | --- | --- |
| Exit opacity | `0` | — |
| Exit scale | `0.97` | inside the required 0.9–0.97 range; never `scale(0)` |
| Exit transition | `OVERLAY_EXIT` = `{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }` | `--motion-exit` / `--ease-exit` |
| Neighbour reflow | Motion `layout` projection | transform-based, no layout thrash |

`initial={false}` on `AnimatePresence` suppresses an entrance animation on first
paint — this plan adds **exits only**. `mode="popLayout"` lifts the departing
card out of flow so its neighbours begin closing the gap immediately rather than
waiting 150ms.

Reduced motion needs no handling: `MotionConfig reducedMotion="user"`
(`src/components/motion/MotionProvider.jsx:8`) disables both `scale` and
`layout` projection while leaving the opacity fade.

## Repo conventions to follow

- `LazyMotion` is `strict` (`src/components/motion/MotionProvider.jsx:9`).
  Import from `motion/react-m`, never `motion/react`, for elements. Exemplar —
  `src/components/icons/GenerationSignature.jsx:1`:
  ```jsx
  import * as M from "motion/react-m";
  ```
  `AnimatePresence` comes from `motion/react`.
- Timing values live in `src/lib/motionTokens.js`.
- The three list rows share an identical root signature already, so the same
  edit applies verbatim to each:
  ```jsx
  <article
    className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card p-3 transition-[border-color,box-shadow] duration-200 ${…}`}
  >
  ```

## Steps

1. Confirm `OVERLAY_EXIT` exists in `src/lib/motionTokens.js` (added by plan
   `003`). If not, add:
   ```js
   export const OVERLAY_EXIT = {
     duration: 0.15,
     ease: [0.4, 0, 0.2, 1],
   };
   ```

2. **`src/components/history/HistoryCard.jsx`** — convert the root at line 41
   from `<div role="button" …>` to `<M.div role="button" …>`, add `layout` and
   the `exit` prop, and close with `</M.div>`. Add
   `import * as M from "motion/react-m";` and
   `import { OVERLAY_EXIT } from "@/lib/motionTokens";`. Leave the `className`
   template literal, `onClick`, `onKeyDown`, `tabIndex`, and all ARIA
   attributes exactly as they are.

3. **`src/components/history/HistoryPanel.jsx`** — convert the `HistoryListRow`
   root `<article>` at line 82 to `<M.article>` with `layout` and `exit`
   (closing tag too). Then wrap both `.map()` calls — line 484 (list) and
   line 499 (grid) — in `<AnimatePresence mode="popLayout" initial={false}>`,
   placed *inside* the existing wrapper `div` so the grid/`space-y-2` classes
   still apply to the items. Add the three imports.

4. **`src/components/styles/StyleCard.jsx`** — the root is a shadcn `<Card>`
   (line 86), which is a plain `div` carrying
   `"rounded-lg border bg-card text-card-foreground shadow-sm"`
   (`src/components/ui/card.jsx:5-9`). Replace it with `<M.div>` and prepend
   those four utilities to the existing class string:
   ```jsx
       <M.div
         layout
         exit={{ opacity: 0, scale: 0.97, transition: OVERLAY_EXIT }}
         tabIndex={isSelectionMode ? 0 : undefined}
         aria-pressed={isSelectionMode ? isSelected : undefined}
         aria-label={isSelectionMode ? `選取風格 ${style.name}` : undefined}
         onClick={handleSelectionClick}
         onKeyDown={handleSelectionKeyDown}
         className={`rounded-lg border bg-card text-card-foreground shadow-sm group relative flex flex-col overflow-hidden transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected
           ? "border-primary ring-2 ring-primary/20 shadow-md"
           : "hover:border-primary/30 hover:shadow-lg"
           } ${isSelectionMode ? "cursor-pointer" : ""}`}
       >
   ```
   Change the matching `</Card>` to `</M.div>`, and narrow the import on line 21
   to `import { CardContent, CardFooter } from "@/components/ui/card";`.
   `CardContent` and `CardFooter` remain in use inside the component.

5. **`src/components/styles/StyleLibrary.jsx`** — convert the `StyleListRow`
   root `<article>` at line 288 to `<M.article>` with `layout` and `exit`, then
   wrap the `.map()` calls at lines 836 (list) and 854 (grid) in
   `<AnimatePresence mode="popLayout" initial={false}>`. Note these two maps
   return via an intermediate `const actions = getStyleActions(style); return (…)`
   block — leave that logic untouched, only wrap the `.map()` call itself.

6. **`src/components/templates/TemplateLibrary.jsx`** — convert the
   `TemplateCard` root `<div role="button">` at line 52 to `<M.div>` and the
   `TemplateListRow` root `<article>` at line 263 to `<M.article>`, both with
   `layout` and `exit`. Wrap the `.map()` calls at lines 788 (list) and 805
   (grid) in `<AnimatePresence mode="popLayout" initial={false}>`.

7. Run the feel check below. **If `mode="popLayout"` causes cards to overlap,
   jump, or collapse to zero width during the exit**, change all six
   `AnimatePresence` usages to plain `<AnimatePresence initial={false}>` and
   report that you did so. The gap will then close after the fade rather than
   during it — still correct, just less fluid. Do not invent a third approach.

## Boundaries

- Do NOT touch the **table** views: `HistoryTable` (`HistoryPanel.jsx:142`),
  `StyleTable` (`StyleLibrary.jsx:358`), `TemplateTable`
  (`TemplateLibrary.jsx:347`). Transform and `position: absolute` on `<tr>`
  elements do not behave predictably; table rows are deliberately out of scope.
- Do NOT add entrance animations. `initial={false}` is mandatory on every
  `AnimatePresence` in this plan — the grids already stagger in via
  `AssetCenter.jsx:105` where that is wanted, and re-animating on every filter
  keystroke would be worse than no animation.
- Do NOT add `layoutId` or shared-element transitions between views.
- Do NOT change delete confirmation flows, `AlertDialog` usage, selection mode,
  or any `onDelete` / `onToggleSelect` handler.
- Do NOT change the `key={item.id}` props — `AnimatePresence` depends on them
  being stable and unique.
- Do NOT add `motion-reduce:*` classes; the provider handles reduced motion.
- Do NOT add new dependencies.
- If any excerpt above does not match the file you find, STOP and report.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/components/styles/__tests__/StyleCard.test.jsx src/components/templates/__tests__/TemplateLibrary.test.jsx src/hooks/__tests__/useHistory.test.js` — all pass.
  - `corepack pnpm build` — succeeds.
- **Feel check**: run `corepack pnpm dev` and open 素材庫.
  - Delete a single card from the middle of a wide grid: it must fade and shrink
    slightly while the cards after it **slide** into their new positions. Nothing
    may teleport.
  - Confirm the exiting card shrinks only slightly — if it collapses toward zero,
    the scale value is wrong.
  - Use 批次管理 to delete several items at once: all selected cards must exit
    together without the survivors flickering or double-animating.
  - Type into the search box and watch filtering: cards that no longer match must
    fade out, and **cards that remain must not re-animate in**. Any entrance
    animation here means `initial={false}` is missing.
  - Switch between grid / list / table views: the table view must be completely
    unchanged, and switching views must not trigger exit animations.
  - In DevTools → Animations, set playback to 10% and delete a card; confirm the
    neighbours' movement is driven by `transform` (check the Elements panel — the
    surviving cards should have a `transform` style applied during the
    transition, not changing `top`/`left`).
  - DevTools → Performance: record a batch delete of ~10 cards in a 7-column grid
    and confirm no long tasks over 50ms. If `layout` is too expensive at this
    scale, report it rather than silently removing the prop.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: deleted cards must
    still fade, but neighbours must snap into place with no sliding.
- **Done when**: deleting from any grid or list view in 紀錄, 風格, and 範本
  fades the item out over 150ms while its neighbours slide into the gap, search
  filtering never replays entrance animations, and the table views are untouched.


## As implemented

**Step 7's fallback was taken, for a reason the plan did not anticipate.**

The `layout` prop and `mode="popLayout"` both require Motion's layout-projection
feature, which ships only in the `domMax` bundle. This repo loads `domAnimation`
(`src/lib/motionFeatures.js`), whose feature set is
`renderer, animation, exit, inView, tap, focus, hover` — no `layout`. Under
`domAnimation` the `layout` prop is silently inert, and `popLayout` would be
actively worse than the status quo: it pulls the exiting card out of flow
immediately, so neighbours would snap into the gap *at once* while a ghost faded
on top of them.

Switching to `domMax` was measured rather than assumed:

| Bundle | `motionFeatures` chunk | gzip |
| --- | --- | --- |
| `domAnimation` (current) | 37.28 kB | 14.01 kB |
| `domMax` | 84.48 kB | 27.75 kB |

That is **+13.7 kB gzip on a chunk fetched on every page load**, plus the drag
and pan features the product never uses, to buy neighbour-reflow on a LOW
severity item. Not worth it, so `src/lib/motionFeatures.js` is unchanged.

What shipped: all six map sites use plain `<AnimatePresence initial={false}>`,
every item root carries
`exit={{ opacity: 0, scale: 0.97, transition: OVERLAY_EXIT }}`, and no `layout`
prop was added (a dead prop is worse than none). The deleted card fades and
shrinks over 150ms and the grid closes the gap once it unmounts — the plan's own
"still correct, just less fluid" outcome.

**If neighbour reflow is wanted later**, the whole change is: flip
`src/lib/motionFeatures.js` to `domMax`, add `layout` to the six item roots, and
add `mode="popLayout"` to the six `AnimatePresence` wrappers.

One extra fix: `StyleCard`'s root replaced the shadcn `<Card>` wrapper, which had
been merging classes through `cn()`/tailwind-merge. Inlining `Card`'s base
utilities into a raw template literal broke the selected state — `.shadow-sm`
compiles *after* `.shadow-md` (bytes 67268 vs 67018), so the base `shadow-sm`
silently overrode the selected `shadow-md`. The root therefore keeps `cn()`.