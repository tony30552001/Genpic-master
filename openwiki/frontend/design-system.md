---
type: frontend design system
title: Shared UI motion and primitive styling
description: Cross-cutting Tailwind motion tokens, reduced-motion behavior, animation utility dependency, and the shared Radix UI primitives that consume them.
tags: [frontend, design-system, motion, accessibility, tailwind]
openwiki:
  roles: [architecture, workflow, testing]
  change_kinds: [ui-foundation, styling, accessibility]
  source_paths: [src/index.css, src/components/ui/alert-dialog.jsx, src/components/ui/badge.jsx, src/components/ui/button.jsx, src/components/ui/scroll-area.jsx, src/components/ui/select.jsx, src/components/ui/tabs.jsx, src/components/ui/tooltip.jsx, package.json]
  symbols: [--motion-enter, --motion-exit, --motion-hover, --ease-emphasized, --ease-exit, AlertDialogOverlay, AlertDialogContent, buttonVariants, badgeVariants, SelectContent, TooltipContent]
  invariants: [Shared motion duration tokens become effectively instantaneous when prefers-reduced-motion is enabled., Enter and exit primitives use distinct duration and easing tokens., Components use tw-animate-css utilities rather than the removed tailwindcss-animate plugin.]
  validation_commands: [pnpm lint, pnpm build]
---

# Shared UI motion and primitive styling

`src/index.css` is the browser-wide styling foundation used by the React application described in [browser application](application.md). It imports Tailwind and `tw-animate-css`, defines theme easing tokens, and establishes the shared motion durations. The creation experience in [creation workflows](create-workflows.md) and other feature pages consume these primitives indirectly; feature code should not reintroduce duplicate timing constants for interactions already represented by a shared primitive.

## Motion contract

Three root custom properties provide the common timing vocabulary: `--motion-enter` is 250 ms, `--motion-exit` is 150 ms, and `--motion-hover` is 200 ms. `--ease-emphasized` serves entering, expanding, and movement; `--ease-exit` serves leaving and collapsing. The stylesheet changes all three duration values to `0.01ms` under `prefers-reduced-motion: reduce`. Components that must eliminate motion rather than merely make it instantaneous additionally use `motion-reduce:animate-none`.

`alert-dialog.jsx`, `select.jsx`, and `tooltip.jsx` apply separate state-scoped enter and exit utilities with those tokens; dialogs and selects also preserve Radix transform origins. `button.jsx`, `badge.jsx`, `scroll-area.jsx`, and `tabs.jsx` use the shared hover duration/easing for color or state transitions. This is a rendering/accessibility contract, not a server or persistence concern.

## Change surface and validation

Consult this page when changing global animation dependencies, timing/easing tokens, reduced-motion behavior, or any listed primitive. Start with `src/index.css`; then change only the primitive(s) whose interaction needs differ. Keep `@import "tw-animate-css"` and `package.json` synchronized: `tailwindcss-animate` is no longer the source of animation utilities. Do not add a component-local duration merely to match the shared defaults; change a token only when the intended behavior is global.

For a primitive change, check both open and closed states, keyboard/focus behavior, and reduced-motion rendering in the consumer screen. There are no focused motion tests in the inspected sources, so `pnpm lint` is the narrow static check. Run `pnpm build` when changing Tailwind classes, CSS imports, or the animation dependency because it exercises utility generation and the browser bundle; it is conditional rather than a default check for unrelated feature work.
