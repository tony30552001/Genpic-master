# 004 — Anchor the two hand-rolled navigation menus to their triggers and give them exits

- **Status**: DONE
- **Commit**: df17720
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 1 file (`src/InfographicGenerator.jsx`), 3 edits

> **Depends on plan `002`? No.** **Depends on plan `003`: yes** — it introduces
> the `OVERLAY_ENTER` / `OVERLAY_EXIT` exports in `src/lib/motionTokens.js` that
> this plan consumes. Execute `003` first, or add those two exports as part of
> this plan if `003` has not run.

## Problem

The repo's Radix `Select` already demonstrates the correct pattern — content
scales out of the point it is anchored to:

```jsx
/* src/components/ui/select.jsx:60 — current, CORRECT, do not change */
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md origin-(--radix-select-content-transform-origin) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-(--motion-enter) data-[state=open]:ease-emphasized data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-(--motion-exit) data-[state=closed]:ease-exit …"
```

The two hand-rolled navigation menus do none of it. They have **no transform
origin, no entrance, and no exit** — they simply blink into existence detached
from the control that opened them:

```jsx
/* src/InfographicGenerator.jsx:770-775 — current (tablet compact nav, md→xl) */
                {compactOpenGroup && (
                    <div
                        className="absolute inset-x-4 top-full z-50 mt-2 rounded-xl border border-white/20 bg-card p-2 text-foreground shadow-xl ring-1 ring-black/10"
                        role="menu"
                        aria-label={`${compactOpenGroup.label}功能`}
                    >
```

```jsx
/* src/InfographicGenerator.jsx:1215-1220 — current (mobile 更多 menu, below md) */
                {mobileMoreOpen && (
                    <div
                        className="absolute inset-x-3 bottom-full z-50 mb-2 rounded-xl border border-border bg-card p-2 shadow-xl ring-1 ring-border/40"
                        role="menu"
                        aria-label="更多功能"
                    >
```

Both are positioned *against* a bar — the first hangs below the header
(`top-full`), the second sits above the bottom navigation (`bottom-full`) — yet
neither conveys that it came from there.

The disclosure chevron on the tablet trigger also transitions with Tailwind's
bare default rather than the repo's motion tokens:

```jsx
/* src/InfographicGenerator.jsx:692 — current */
                                    <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
```

## Target

Each menu scales out of the edge it is attached to, then collapses back into it.

| Menu | Anchor | `transform-origin` | `initial` / `exit` | `animate` |
| --- | --- | --- | --- | --- |
| Tablet compact nav (`:770`) | Header, opens downward | `origin-top` | `{ opacity: 0, scale: 0.96 }` | `{ opacity: 1, scale: 1 }` |
| Mobile 更多 (`:1215`) | Bottom nav, opens upward | `origin-bottom` | `{ opacity: 0, scale: 0.96 }` | `{ opacity: 1, scale: 1 }` |

```jsx
/* target — tablet compact nav */
                <AnimatePresence>
                    {compactOpenGroup && (
                        <M.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96, transition: OVERLAY_EXIT }}
                            transition={OVERLAY_ENTER}
                            className="absolute inset-x-4 top-full z-50 mt-2 origin-top rounded-xl border border-white/20 bg-card p-2 text-foreground shadow-xl ring-1 ring-black/10"
                            role="menu"
                            aria-label={`${compactOpenGroup.label}功能`}
                        >
```

Timings come from plan `003`'s tokens and land inside the 150–250ms dropdown
budget:

- Enter: `OVERLAY_ENTER` = `{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }`
  (`--motion-enter` / `--ease-emphasized`)
- Exit: `OVERLAY_EXIT` = `{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }`
  (`--motion-exit` / `--ease-exit`)

`scale: 0.96` sits inside the required 0.9–0.97 range. **Never `scale(0)`** —
the menu must grow from a near-full size, not from nothing.

Chevron target:

```jsx
/* target — src/InfographicGenerator.jsx:692 */
                                    <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform duration-(--motion-hover) ease-emphasized', isOpen && 'rotate-180')} aria-hidden="true" />
```

Reduced motion needs no handling here: `MotionConfig reducedMotion="user"` at
`src/components/motion/MotionProvider.jsx:8` strips the `scale` value and keeps
`opacity`, and `--motion-hover` collapses to `0.01ms` via the
`prefers-reduced-motion` block in `src/index.css`.

## Repo conventions to follow

- `LazyMotion` is in `strict` mode (`src/components/motion/MotionProvider.jsx:9`).
  Import motion elements from `motion/react-m`; `motion.div` throws. Exemplar —
  `src/components/icons/GenerationSignature.jsx:1`:
  ```jsx
  import * as M from "motion/react-m";
  ```
  `AnimatePresence` comes from `motion/react`.
- Timing values live in `src/lib/motionTokens.js`; CSS timing tokens live in
  `src/index.css` (`--motion-enter`, `--motion-exit`, `--motion-hover`) and are
  consumed as `duration-(--motion-hover)`. Never hand-type a millisecond value.
- Conditional classes go through `cn()` (already imported in
  `src/InfographicGenerator.jsx`).
- Transform-origin exemplar for an anchored surface: `src/components/ui/select.jsx:60`.

## Steps

1. Confirm `OVERLAY_ENTER` and `OVERLAY_EXIT` exist in `src/lib/motionTokens.js`.
   If plan `003` has not been executed, add them first:
   ```js
   export const OVERLAY_ENTER = {
     duration: 0.25,
     ease: [0.22, 1, 0.36, 1],
   };

   export const OVERLAY_EXIT = {
     duration: 0.15,
     ease: [0.4, 0, 0.2, 1],
   };
   ```

2. In `src/InfographicGenerator.jsx`, add the imports (skip any already present
   from plan `003` step 8):
   ```jsx
   import { AnimatePresence } from "motion/react";
   import * as M from "motion/react-m";
   import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
   ```

3. Replace the tablet compact-nav block at lines 770-775 with the **Target**
   excerpt above. Add `origin-top` to the class string and wrap the whole
   conditional in `<AnimatePresence>`. Everything inside the menu — the header
   row, the close button, the `compactOpenGroup.tabIds.map(…)` grid, the admin
   entry — stays byte-for-byte unchanged, as does the closing `</div>` → `</M.div>`.

4. Apply the same treatment to the mobile 更多 menu at lines 1215-1220, but with
   `origin-bottom` instead of `origin-top`:
   ```jsx
                   <AnimatePresence>
                       {mobileMoreOpen && (
                           <M.div
                               initial={{ opacity: 0, scale: 0.96 }}
                               animate={{ opacity: 1, scale: 1 }}
                               exit={{ opacity: 0, scale: 0.96, transition: OVERLAY_EXIT }}
                               transition={OVERLAY_ENTER}
                               className="absolute inset-x-3 bottom-full z-50 mb-2 origin-bottom rounded-xl border border-border bg-card p-2 shadow-xl ring-1 ring-border/40"
                               role="menu"
                               aria-label="更多功能"
                           >
   ```
   The `mobileSecondaryTabs.map(…)` grid inside is unchanged.

5. Update the chevron at line 692 to the **Target** excerpt — add
   `duration-(--motion-hover) ease-emphasized` to the existing
   `transition-transform`.

## Boundaries

- Do NOT animate the navigation itself. The desktop inline tabs
  (`src/InfographicGenerator.jsx:699-714`) and the mobile bottom-navigation bar
  (`:1221-1305`) are the highest-frequency controls in the product and must stay
  instant. In particular, **do not add a `layoutId` sliding pill to the active
  tab indicator** at `:1272` or `:1300`. This was considered and deliberately
  rejected.
- Do NOT animate the top-level tab panel swaps at `:849`, `:1049`, `:1096`,
  `:1138`. Also deliberately rejected — those panels fill the viewport and a
  crossfade reads as lag.
- Do NOT change `role="menu"`, `role="menuitem"`, `aria-label`, `aria-expanded`,
  `aria-haspopup`, or `aria-pressed` on any of these elements.
- Do NOT change the outside-click / dismissal logic around
  `src/InfographicGenerator.jsx:92`.
- Do NOT add `motion-reduce:*` classes to the `M.div` elements — the provider
  handles reduced motion for `scale`.
- Do NOT replace these menus with Radix `DropdownMenu`; that would add a
  dependency.
- Do NOT add new dependencies.
- If the excerpts above do not match the file, STOP and report.

## Verification

- **Mechanical**:
  - `corepack pnpm lint` — no new errors.
  - `corepack pnpm exec vitest run src/__tests__/InfographicGenerator.test.jsx` — passes.
  - `corepack pnpm build` — succeeds.
- **Feel check**: run `corepack pnpm dev`.
  - Resize to a tablet width (between the `md` and `xl` breakpoints) and open a
    compact nav group: the panel must appear to **unfold downward out of the
    header**, with its top edge pinned. If it grows from its own centre, the
    `origin-top` class is missing.
  - Resize below `md` and tap 更多: the panel must unfold **upward out of the
    bottom navigation bar**, bottom edge pinned.
  - Close each menu and confirm it collapses back into the same bar rather than
    disappearing.
  - In DevTools → Animations, set playback to 10%, open the tablet menu, and
    verify the top edge does not move by a single pixel during the scale.
  - Open and close a menu rapidly, and switch directly from one compact nav group
    to another: no menu may get stranded mid-animation or flash at full opacity
    before animating.
  - Watch the chevron: it must rotate over ~200ms in step with the panel opening,
    not snap.
  - DevTools → Rendering → `prefers-reduced-motion: reduce`: menus must still
    fade in and out, with **no** scaling, and the chevron must flip instantly.
- **Done when**: both menus visibly originate from the bar they are attached to,
  both collapse back into it at 150ms, the desktop tabs and bottom nav remain
  completely un-animated, and reduced motion leaves opacity-only transitions.
