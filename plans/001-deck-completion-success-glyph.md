# 001 — Surface the unused `GenerationSignature` success state at PPT deck completion

- **Status**: DONE
- **Commit**: df17720
- **Severity**: MEDIUM
- **Category**: Missed opportunities (rare, high-emotion moment rendered flat)
- **Estimated scope**: 1 file, ~10 lines

## Problem

`src/components/icons/GenerationSignature.jsx` implements three states: `idle`,
`working`, and `success`. The `success` state draws a checkmark via an animated
`pathLength` over 320ms:

```jsx
/* src/components/icons/GenerationSignature.jsx:83-95 — current */
      <M.path
        d="m7.25 12.5 3 3 6.5-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: isSuccess ? 1 : 0, opacity: isSuccess ? 1 : 0 }}
        transition={shouldReduceMotion ? { duration: 0.01 } : GLYPH_SUCCESS}
      />
```

**`state="success"` is never rendered anywhere in the application.** The only
call site in product code passes `"working"`:

```jsx
/* src/components/create/DeckProgress.jsx:44 — current */
          <GenerationSignature state="working" className="icon-md text-primary" aria-hidden="true" />
```

A PPT deck takes 5–15 minutes to generate (stated at
`src/components/create/DeckProgress.jsx:69`). When it finishes, `DeckProgress`
simply unmounts:

```jsx
/* src/components/create/PptMasterStudio.jsx:204-212 — current */
            {isGenerating && (
              <DeckProgress
                phase={progress.phase}
                current={progress.current}
                total={progress.total}
                startedAt={progress.startedAt}
                events={events}
              />
            )}
```

The longest wait in the product ends with a hard swap and zero acknowledgement.
This is exactly the "rare / first-time" frequency tier where the delight budget
is allowed to be spent, and the code to spend it already exists.

### Critical constraint — why the glyph must stay mounted

`GenerationSignature` passes `initial={false}` to every `M.*` element
(lines 32, 43, 60, 88). `initial={false}` means **a freshly mounted component
snaps straight to its target values with no animation**. If you mount a new
`<GenerationSignature state="success" />` at completion time, the checkmark will
appear already drawn and nothing will animate.

The checkmark only draws if a *already-mounted* instance transitions from
`state="working"` to `state="success"`. Therefore the fix must place the glyph
in a region that is mounted continuously across idle → working → success.
`DeckProgress` is not such a region — it unmounts. The action-hint bar is.

## Target

Add one persistent `GenerationSignature` to the always-mounted action-hint bar
in `PptMasterStudio`, driven by the same state the hint text already uses:

```jsx
/* target — src/components/create/PptMasterStudio.jsx, action hint row */
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
          <GenerationSignature
            state={isGenerating ? "working" : deck ? "success" : "idle"}
            className={cn(
              "icon-md shrink-0",
              deck && !isGenerating ? "text-success" : "text-primary"
            )}
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{actionHint}</p>
```

Resulting behaviour, with no new timing values invented:

| Phase | `state` | What the user sees |
| --- | --- | --- |
| Before generating | `idle` | Static Pixora "P" mark, no motion |
| `isGenerating` | `working` | Existing 1.8s `GENERATION_LOOP` breathe + pixel drift |
| `deck` produced | `success` | P-mark fades to `opacity: 0.16` + `scale: 0.88` while the checkmark draws over **320ms** with `ease: [0.22, 1, 0.36, 1]` (the `GLYPH_SUCCESS` token), tinted `text-success` |

No new easing, duration, or token is introduced. `GLYPH_SUCCESS` already exists
in `src/lib/motionTokens.js:16-19` and the component already branches on
`useReducedMotion()` to collapse the transition to `{ duration: 0.01 }`.

## Repo conventions to follow

- Motion values live in `src/lib/motionTokens.js`. Do **not** hand-type a
  duration or cubic-bezier in a component. `GLYPH_SUCCESS` is
  `{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }` and is already wired up inside
  `GenerationSignature` — you do not need to touch it.
- Motion components must be imported from `motion/react-m`, not `motion/react`.
  `src/components/motion/MotionProvider.jsx:9` mounts `<LazyMotion strict>`,
  which throws if `motion.div` is used. Exemplar:
  `src/components/icons/GenerationSignature.jsx:1` —
  `import * as M from "motion/react-m";`. **This plan requires no new motion
  imports**, only a prop change.
- Conditional Tailwind classes use `cn()` from `src/lib/utils.js`. `cn` is
  already imported at `src/components/create/PptMasterStudio.jsx:20`.
- `text-success` is a real token (`--color-success` in `src/index.css`
  `@theme inline`). Do not use a raw green.

## Steps

1. Open `src/components/create/PptMasterStudio.jsx`. Confirm
   `GenerationSignature` is **not** yet imported there (at commit `df17720` it
   is not — it is only imported by `DeckProgress.jsx:5`). Add the import
   alongside the existing component imports around lines 22-28:

   ```jsx
   import GenerationSignature from "@/components/icons/GenerationSignature";
   ```

   Keep the existing import ordering style of that block.

2. Find the action-hint row. At commit `df17720` it reads:

   ```jsx
   /* src/components/create/PptMasterStudio.jsx:261-263 — current */
           <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
             <p className="min-w-0 flex-1 text-xs text-muted-foreground">{actionHint}</p>
             <div className="flex shrink-0 flex-wrap justify-end gap-2">
   ```

   Insert the glyph as the first child of that `div`, immediately before the
   `<p>`:

   ```jsx
             <GenerationSignature
               state={isGenerating ? "working" : deck ? "success" : "idle"}
               className={cn(
                 "icon-md shrink-0",
                 deck && !isGenerating ? "text-success" : "text-primary"
               )}
               aria-hidden="true"
             />
   ```

   `isGenerating` and `deck` are both already in scope in this component
   (`isGenerating` is destructured from `usePptMasterDeck` at line 105; `deck` is
   used at line 165 and line 225).

3. Do not change anything else. In particular **leave
   `src/components/create/DeckProgress.jsx:44` exactly as it is.** During
   generation two signature glyphs will be visible — one inside the progress
   card in the left column, one in the bottom action bar. This is intentional:
   they occupy different regions and express the same state. Do not "de-duplicate"
   them.

## Boundaries

- Do NOT edit `src/components/icons/GenerationSignature.jsx`. Its `success`
  branch, its `initial={false}` props, and its `useReducedMotion()` handling are
  all already correct.
- Do NOT edit `src/components/create/DeckProgress.jsx`.
- Do NOT change the `GLYPH_SUCCESS`, `GLYPH_SPRING`, `GLYPH_FEEDBACK`, or
  `GENERATION_LOOP` values in `src/lib/motionTokens.js`.
- Do NOT add a toast, confetti, sound, or any other celebration. The checkmark
  draw is the entire scope.
- Do NOT add new dependencies.
- Do NOT change `actionHint`'s text content or the `usePptMasterDeck` hook.
- If the action-hint row no longer matches the excerpt in step 2 (drift since
  commit `df17720`), STOP and report instead of improvising a location.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/components/create/__tests__/PptMasterStudio.test.jsx` — passes.
  - `corepack pnpm build` — succeeds.
- **Feel check**: run `corepack pnpm dev`, open the PPT master studio tab, and
  start a deck generation.
  - Before starting: the glyph is a **static** P-mark in `text-primary` with no
    motion at all.
  - During generation: the glyph breathes and its three pixels drift — and the
    exact same instance stays mounted the whole time (it must not blink or
    restart when progress events arrive).
  - On completion: **the checkmark must draw itself stroke-by-stroke**, not
    appear instantly. If it appears already-drawn, the glyph was remounted —
    STOP and report, because the fix is in the wrong place.
  - In DevTools → Animations panel, set playback speed to 10% and re-trigger
    completion; confirm the P-mark fades and shrinks to `scale(0.88)` *while*
    the checkmark path grows, rather than the two swapping abruptly.
  - In DevTools → Rendering → enable `prefers-reduced-motion: reduce`, then
    complete a generation: the checkmark must still **appear** (state is still
    communicated) but with no drawing motion and no breathing loop.
- **Done when**: finishing a deck generation animates a checkmark in the bottom
  action bar within 320ms, the glyph shows three visually distinct states across
  the lifecycle, and reduced-motion users still see the success state.
