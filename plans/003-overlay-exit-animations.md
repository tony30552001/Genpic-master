# 003 — Give every hand-rolled overlay an exit animation that mirrors its entrance

- **Status**: DONE — two spec errata, see *As implemented* below
- **Commit**: df17720
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Interruptibility
- **Estimated scope**: 2 new token exports + 5 overlay components + 5 call sites

## Problem

Radix-backed surfaces in this repo already do enter **and** exit correctly:

```jsx
/* src/components/ui/alert-dialog.jsx:16 — current, CORRECT, do not change */
    "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-(--motion-enter) data-[state=open]:ease-emphasized data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-(--motion-exit) data-[state=closed]:ease-exit motion-reduce:animate-none",
```

Every **hand-rolled** overlay animates in and then vanishes. They are plain
conditional renders, so `tw-animate-css`'s `animate-in` classes have no unmount
lifecycle to hook into and there is no `animate-out` counterpart. Six surfaces:

```jsx
/* src/components/common/ImageLightbox.jsx:65 — current (backdrop) */
      className="fixed inset-0 z-[70] flex items-center justify-center overscroll-contain bg-black/70 p-3 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none sm:p-6"
```
```jsx
/* src/components/common/ImageLightbox.jsx:84 — current (panel) */
        className="relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-card shadow-2xl animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
```
```jsx
/* src/components/library/AssetMetadataSheet.jsx:155 — current (backdrop) */
      className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/40 p-0 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none sm:items-center sm:p-4"
```
```jsx
/* src/components/library/AssetMetadataSheet.jsx:171 — current (sheet body) */
        className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 motion-reduce:animate-none sm:max-h-[88dvh] sm:max-w-2xl sm:rounded-2xl lg:max-w-3xl"
```
```jsx
/* src/InfographicGenerator.jsx:1170 — current (mobile preview sheet body) */
                        className="relative z-10 flex max-h-[85dvh] flex-col rounded-t-2xl bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none"
```
```jsx
/* src/components/create/DocumentScenes.jsx:208 — current (local zoom viewer backdrop) */
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
```
```jsx
/* src/components/create/DocumentScenes.jsx:358-360 — current (SceneModal) */
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl animate-in zoom-in-95 duration-200">
```
```jsx
/* src/components/history/ComparisonView.jsx:21 — current */
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
```

A surface that slides up from the bottom edge and then disappears from nowhere
breaks spatial consistency: the user is never shown where it went. The bottom
sheets are the worst case — `slide-in-from-bottom` establishes an origin that
the dismissal then contradicts.

Three of these (`DocumentScenes.jsx:208`, `:358`, `ComparisonView.jsx:21`) also
have **no `motion-reduce:animate-none`** at all.

## Target

Drive these overlays with `motion` (already a dependency at `13.1.1`, already
provider-mounted) instead of `tw-animate-css`, so `AnimatePresence` can hold the
element mounted for the duration of a mirrored exit.

Two new transition tokens, mirroring the CSS tokens exactly:

```js
/* target — appended to src/lib/motionTokens.js */
export const OVERLAY_ENTER = {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1],
};

export const OVERLAY_EXIT = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
};
```

`0.25s` / `[0.22, 1, 0.36, 1]` is `--motion-enter` / `--ease-emphasized`.
`0.15s` / `[0.4, 0, 0.2, 1]` is `--motion-exit` / `--ease-exit`. Both are
declared in `src/index.css` — no new curve is being invented.

Per-surface motion values:

| Surface | `initial` / `exit` | `animate` |
| --- | --- | --- |
| Any backdrop | `{ opacity: 0 }` | `{ opacity: 1 }` |
| Centred panel (`ImageLightbox` body, `SceneModal` body, `ComparisonView` body) | `{ opacity: 0, scale: 0.95 }` | `{ opacity: 1, scale: 1 }` |
| Bottom sheet (`AssetMetadataSheet` body, mobile preview sheet) | `{ opacity: 0, y: "100%" }` | `{ opacity: 1, y: 0 }` |

`y: "100%"` is a percentage of the element's own height — never a pixel offset.

Standard shape for every converted element:

```jsx
/* target pattern */
<M.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0, transition: OVERLAY_EXIT }}
  transition={OVERLAY_ENTER}
  className="…same classes, minus every animate-in / fade-in / zoom-in / slide-in / duration-* / motion-reduce:animate-none token…"
>
```

### Why the shorthand props, not a `transform` string

`src/components/motion/MotionProvider.jsx:8` mounts
`<MotionConfig reducedMotion="user">`. That setting strips **transform** values
(`scale`, `y`, `x`, `rotate`) automatically when the OS requests reduced motion,
while leaving `opacity` intact — precisely the required behaviour ("fewer and
gentler, not zero"). It can only do that for the shorthand keys. Passing a raw
`transform: "translateY(100%)"` string would defeat it. Use `scale` and `y`.
**Do not "optimise" these into transform strings.**

This also means the converted overlays need **no** `motion-reduce:*` class and
no `useReducedMotion()` branch — the provider handles it.

## Repo conventions to follow

- **`LazyMotion` runs in `strict` mode** (`src/components/motion/MotionProvider.jsx:9`).
  `motion.div` will throw. Import motion elements from `motion/react-m`.
  Exemplar — `src/components/icons/GenerationSignature.jsx:1`:
  ```jsx
  import * as M from "motion/react-m";
  ```
  `AnimatePresence` is **not** a motion component and is imported normally:
  ```jsx
  import { AnimatePresence } from "motion/react";
  ```
- All durations and curves live in `src/lib/motionTokens.js`. Never hand-type
  `0.15` or a cubic-bezier array in a component.
- `MotionProvider` wraps the whole app at `src/main.jsx:16`, so every overlay is
  already inside the provider.

## Steps

1. Append `OVERLAY_ENTER` and `OVERLAY_EXIT` to `src/lib/motionTokens.js`
   exactly as written in **Target**. Do not modify the four existing exports.

2. **`src/components/common/ImageLightbox.jsx`** — add the two imports, convert
   the backdrop (line 65) and panel (line 84) to `M.div`, and strip the
   animation classes from both `className` strings: remove `animate-in`,
   `fade-in`, `zoom-in-95`, `duration-200`, and `motion-reduce:animate-none`.
   Keep every layout/colour class. Backdrop gets the backdrop row from the
   Target table; panel gets the centred-panel row. Leave the `if (!src) return null;`
   guard, the focus management, and the keyboard handlers untouched.

3. Wrap the **three** call sites of that component in `<AnimatePresence>`:
   - `src/components/admin/AdminPanel.jsx:1211` — `{previewItem && (<ImageLightbox …/>)}`
   - `src/components/styles/StyleLibrary.jsx:872` — `{previewStyle?.previewUrl && (<ImageLightbox …/>)}`
   Each becomes:
   ```jsx
   <AnimatePresence>
     {previewItem && (
       <ImageLightbox … />
     )}
   </AnimatePresence>
   ```
   Add `import { AnimatePresence } from "motion/react";` to each file.

4. **`src/components/create/DocumentScenes.jsx` has its own local, duplicated
   `ImageLightbox` at line 148** — it does *not* import the shared one. Convert
   its root (line 202-208) to `M.div` with the backdrop values, strip
   `animate-in fade-in duration-200`, and wrap its render site
   (line 652, `{lightboxSrc && (<ImageLightbox …/>)}`) in `<AnimatePresence>`.
   Do **not** attempt to merge it with the shared component — see Boundaries.

5. **`src/components/create/DocumentScenes.jsx` `SceneModal`** — convert the
   backdrop (line 358) and the inner panel (line 360) to `M.div` using the
   backdrop and centred-panel rows, stripping `animate-in fade-in duration-200`
   and `animate-in zoom-in-95 duration-200`. Wrap its render site at line 1482
   (`{modalScene && (<SceneModal …/>)}`) in `<AnimatePresence>`. One
   `AnimatePresence` import serves both step 4 and step 5.

6. **`src/components/library/AssetMetadataSheet.jsx`** — convert the backdrop
   (line 155) and the `<form>` at line 171. The form becomes `<M.form>`, using
   the bottom-sheet row. Strip `animate-in slide-in-from-bottom-4 fade-in
   duration-200 motion-reduce:animate-none` from it and
   `animate-in fade-in duration-200 motion-reduce:animate-none` from the backdrop.
   Keep `onSubmit`, `onKeyDown`, `ref`, and the inline `style` prop.

7. The call site at `src/components/library/AssetCenter.jsx:715` currently
   renders `<AssetMetadataSheet>` **unconditionally** and relies on the
   component's internal `if (!asset) return null`. `AnimatePresence` cannot
   detect a removal that way. Change it to a conditional render inside
   `AnimatePresence`, preserving the existing `key`:
   ```jsx
   <AnimatePresence>
     {editingAsset && (
       <AssetMetadataSheet
         key={`${editingAsset.type}-${editingAsset.asset.id}`}
         asset={editingAsset.asset}
         type={editingAsset.type}
         … all remaining props unchanged …
       />
     )}
   </AnimatePresence>
   ```
   Leave the component's internal `if (!asset) return null;` guard in place.

8. **`src/InfographicGenerator.jsx`** — wrap the block starting at line 1152
   (`{showMobilePreview && generatedImage && (`) in `<AnimatePresence>`, convert
   its outer `div` and the sheet body at line 1170 to `M.div`, and apply the
   backdrop / bottom-sheet rows. Note the backdrop here is the sibling
   `<button className="absolute inset-0 bg-black/40 backdrop-blur-sm">` — convert
   that to `M.button` with the backdrop values, and give the outer positioning
   `div` (line 1155) `opacity` values too or leave it un-animated; either is
   fine as long as backdrop and sheet both fade/slide out. Strip
   `animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none`.

9. **`src/components/history/ComparisonView.jsx`** — convert line 21 to `M.div`
   (backdrop row) and line 22 to `M.div` (centred-panel row); strip
   `animate-in fade-in duration-200`. Wrap its render site in
   `src/components/history/HistoryPanel.jsx` (`{showComparison && selectedItems.length === 2 && (`)
   in `<AnimatePresence>`.

10. Grep for `animate-in` across `src/components/common`, `src/components/library`,
    `src/components/history`, `src/components/create/DocumentScenes.jsx`, and
    `src/InfographicGenerator.jsx`. The only remaining hits should be the
    *non-overlay* inline panels (e.g. `HistoryPanel.jsx:374`,
    `AssetCenter.jsx:105/591/655/671/699`, `DocumentScenes.jsx:603/1171`), which
    are out of scope.

## Boundaries

- Do NOT touch `src/components/ui/alert-dialog.jsx`, `select.jsx`, or
  `tooltip.jsx`. Radix already drives their enter/exit correctly with the CSS
  tokens; converting them to `motion` would be a regression.
- Do NOT consolidate the duplicate `ImageLightbox` in
  `src/components/create/DocumentScenes.jsx:148` with
  `src/components/common/ImageLightbox.jsx`. It is a real duplication, but
  removing it is a structural refactor with its own test surface — it is
  recorded as a separate observation in `plans/README.md`.
- Do NOT add `motion-reduce:*` classes or `useReducedMotion()` calls to the
  converted elements. `MotionConfig reducedMotion="user"` already handles it.
- Do NOT change any duration to a value not in `motionTokens.js`.
- Do NOT convert the inline, non-overlay `animate-in` panels listed in step 10.
- Do NOT change focus management, scroll locking, `Escape` handlers, `role`,
  `aria-modal`, or any other accessibility attribute on these overlays.
- Do NOT add new dependencies. `motion@13.1.1` is already in `package.json`.
- If any excerpt above does not match the file you find, STOP and report.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/components/common/__tests__/ImageLightbox.test.jsx src/components/library/__tests__/AssetMetadataSheet.test.jsx src/components/motion/__tests__/MotionProvider.test.jsx src/__tests__/InfographicGenerator.test.jsx` — all pass.
    These tests render the overlays **outside** `MotionProvider`; `m` components
    render statically without a provider, which is why
    `src/components/icons/__tests__/KineticGlyphs.test.jsx` already passes that
    way. If a test now throws a `strict` mode error, you imported from
    `motion/react` instead of `motion/react-m` — fix the import, do not wrap the
    test.
  - `corepack pnpm build` — succeeds.
- **Feel check**: run `corepack pnpm dev`.
  - Open the asset metadata sheet on a narrow viewport and close it: the sheet
    must slide **back down through the bottom edge it came from**, not fade in
    place and not jump.
  - Open the image lightbox (素材庫 → a style preview) and press `Escape`: the
    panel must scale down slightly and fade while the backdrop fades, both
    finishing together in ~150ms.
  - Confirm the exit is visibly **faster** than the entrance. If they feel the
    same length, `OVERLAY_EXIT` is not being applied — check that it is passed
    inside the `exit` object, not as the element's `transition`.
  - Open and close the same overlay rapidly, five times: it must never get stuck
    half-open, and re-opening mid-exit must retarget smoothly rather than
    restarting from fully hidden.
  - In DevTools → Animations, set playback to 10% and close the mobile preview
    sheet; confirm the sheet translates by exactly its own height and the
    backdrop fades over the same window.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: every overlay must
    still **fade** in and out, but must not slide or scale. If movement remains,
    a `transform` string was used instead of the `scale`/`y` shorthands.
- **Done when**: all six overlays exit along the same path they entered, exits
  run at 150ms against 250ms entrances, rapid toggling never strands an overlay,
  and reduced motion leaves opacity-only transitions.


## As implemented

Two errata in the spec:

1. **Step 3 says the shared `ImageLightbox` has "three call sites". It has two**
   — `src/components/admin/AdminPanel.jsx` and
   `src/components/styles/StyleLibrary.jsx`. The presumed third is the private
   duplicate defined in `src/components/create/DocumentScenes.jsx`, which step 4
   already covers separately.

2. **`AssetMetadataSheet` did not get a full bottom-sheet slide.** The plan
   specified `y: "100%"`, but that element is only a bottom sheet below `sm`; at
   `sm` and above it is a centred dialog (`sm:items-center`, `sm:rounded-2xl`)
   up to `max-h-[88dvh]` tall. A 100% translate would have flung a ~700px panel
   up from off-centre on every desktop open. Its original entrance was
   `slide-in-from-bottom-4`, so the implementation keeps that 16px rise and adds
   the missing exit:

   ```jsx
   initial={{ opacity: 0, y: 16 }}
   animate={{ opacity: 1, y: 0 }}
   exit={{ opacity: 0, y: 16, transition: OVERLAY_EXIT }}
   transition={OVERLAY_ENTER}
   ```

   The mobile preview sheet in `src/InfographicGenerator.jsx` **is** `sm:hidden`,
   so it does use the full `y: "100%"` slide.

`AssetCenter.jsx` previously rendered `AssetMetadataSheet` unconditionally and
relied on an internal `if (!asset) return null`. `AnimatePresence` cannot observe
that, so the call site became a real conditional render.