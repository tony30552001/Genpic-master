# Copilot Instructions — Pixora 智繪

## Hard requirements

These rules are mandatory for every change:

- **Do not preserve backward compatibility.** Remove obsolete code and paths. Do not add compatibility wrappers, behavior fallbacks, or data migrations whose only purpose is preserving obsolete behavior.
- **Choose the simplest complete implementation.** Avoid speculative abstractions, configuration, and indirection.
- **Grow the system in layers.** Start with the smallest version that works end to end; add capabilities only on top of a working product.
- **Keep concerns separated.** Components, hooks, services, API handlers, and shared infrastructure must retain clear responsibilities.
- **Prefer established libraries and existing dependencies.** Check current documentation and types before adding packages or reimplementing common functionality.
- **Make long-term architectural decisions.** Do not introduce temporary stopgaps intended to be replaced later.
- **Make breaking changes completely.** Update all callers, tests, documentation, and contracts in the same change; remove the replaced implementation.
- **Do not hide failures.** Surface errors through existing UI or API patterns; do not add silent catches or success-shaped fallbacks.
- Treat current source code and this file as authoritative. Keep product and architecture documentation in `docs/`.

## Commands

```powershell
# Frontend
corepack pnpm@10.33.2 install
corepack pnpm build
corepack pnpm lint
corepack pnpm exec vitest run
corepack pnpm exec vitest run <test-file>
corepack pnpm dev

# Backend
npm ci --prefix api
npm --prefix api start
node --check api/<function>/index.js
```

The frontend uses the repository-pinned pnpm version. The `api/` package uses npm and its own `package-lock.json`.

## Architecture

- `src/main.jsx`: initializes MSAL, handles redirect responses, restores the active account, then renders React.
- `src/App.jsx`: owns routing and protected routes.
- `src/InfographicGenerator.jsx`: owns the creation workspace, active tabs, and responsive application navigation.
- `src/components/`: feature UI grouped by `create`, `admin`, `auth`, `history`, `settings`, `styles`, and `templates`.
- `src/components/ui/`: shadcn/ui adapters; modify only when the shared primitive itself must change.
- `src/hooks/`: feature state and asynchronous workflows.
- `src/services/`: API, authentication, storage, and provider clients.
- `api/server.js`: Express entry point and canonical API route registration.
- `api/<endpoint>/index.js`: endpoint handlers.
- `api/_shared/`: authentication, identity, database, model policy, image jobs, HTTP, storage, and provider helpers.
- `db/migrations/`: ordered PostgreSQL schema changes required by the current product.

Azure Static Web Apps serves `dist/`. The linked App Service runs `api/server.js`, receives `/api/*`, and starts the image-job worker. The `main` workflow deploys both surfaces.

## Authentication

- The application supports Microsoft Entra ID through MSAL and Google OAuth.
- MSAL MUST initialize and process redirect responses before React renders.
- MSAL cache remains in `localStorage`; restore the active account after reload.
- Microsoft token acquisition MUST try silent renewal first. On HTTP 401, force one silent refresh and retry once.
- Interaction-required MSAL errors MUST use redirect re-authentication. Do not add popup fallback.
- `api/_shared/auth.js` returns `{ displayName, email }`; identity resolution MUST prefer `user.displayName || user.name || email`.
- `getOrCreateUser` MUST update `display_name` on every login.

## Image generation

- Tenant policy in `api/_shared/modelPolicy.js` controls the model; do not add a client-side model selector.
- `gemini-imagen` is the default model handled through `/api/generate-images`.
- `gpt-image-2` uses `api/_shared/gptImage.js` and the App Service image-job worker.
- Generation may return HTTP `202` with a `jobId`; the frontend polls through `aiService.waitForImageJob()`.
- If the image-job contract changes, update the worker, endpoint, polling client, tests, and UI together. Current states are `pending`, `running`, `succeeded`, and `failed`.

## Environment variables

- `VITE_*` variables are injected at build time. Changing one requires a new CI/CD deployment.
- Frontend variables MUST be declared in `src/config.js` and added to the workflow `env` block.
- Backend-only variables belong in App Service settings, not `VITE_*`.
- Keep `GPT_IMAGE_*` server-side. Do not hardcode provider endpoints or credentials in components.

## UI conventions

- Use `cn()` from `src/lib/utils.js` for conditional Tailwind classes.
- Use existing CSS color variables and shadcn/ui primitives.
- Full-page creation panels use the existing 60/40 layout: controls at `lg:col-span-3`, preview at `lg:col-span-2`.
- Do not use fixed-width panels for full-page layouts.
- Navigation breakpoints are:
  - `xl` and above: full tab navigation.
  - `md` through `xl`: compact `創作`, `素材庫`, `紀錄`, and `更多` navigation.
  - Below `md`: bottom navigation.
- Navigation labels MUST remain on one line. Shrinkable flex children use `min-w-0` and `truncate`.
- Interactive controls MUST use semantic elements, visible `focus-visible` states, and accessible labels for icon-only actions.
- `StylePalette` and `PromptTemplates` are controlled components.
- `STYLE_DIMENSIONS` is defined only in `src/components/create/styleDimensions.js`.

## Backend and database safety

- Shared backend logic belongs in `api/_shared/`; do not duplicate it across handlers.
- API handlers MUST reuse existing authentication, rate-limit, URL-validation, HTTP-response, and database helpers.
- SQL MUST remain parameterized.
- After changing an API handler, run `node --check` and verify every `$N` placeholder matches the parameter array.
- Product-required schema changes use the next numbered file in `db/migrations/`. Do not create migrations solely to preserve obsolete behavior or data shapes.
- Never commit or log secrets, credentials, tokens, or connection strings.

## Validation and Git

- Run the smallest relevant lint and test commands for changed behavior.
- Run `corepack pnpm build` before every push.
- Do not reset, checkout, or revert unrelated user changes.
- Do not amend commits unless explicitly requested.
- When a task includes a commit, push it immediately to `origin main`.

## OpenWiki maintenance

The `openwiki/` directory is the generated knowledge base for this repository.

Before pushing changes that affect source code, architecture, API behavior,
database schema, deployment, configuration, or other documented behavior:

1. Run `openwiki --update`.
2. Review the generated OpenWiki changes.
3. Verify that the generated documentation is consistent with the implementation.
4. Include relevant `openwiki/`, `AGENTS.md`, and `CLAUDE.md` changes in the same
   commit as the code changes, or create a follow-up documentation commit.
5. Only push after the working tree contains the intended code and OpenWiki changes.

Do not manually edit generated files under `openwiki/` unless explicitly requested.
Treat source code and tests as authoritative.
