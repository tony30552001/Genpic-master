# Copilot Instructions — Pixora 智繪

## Commands

```bash
# All commands use corepack pnpm (not npm)
corepack pnpm build           # Production build (Vite)
corepack pnpm lint            # ESLint 9
corepack pnpm exec vitest run # Run all tests (Vitest 4)
corepack pnpm exec vitest run src/services/__tests__/gptImageService.test.js  # Single test file
corepack pnpm dev             # Local dev server (port 5173)
```

The CI pipeline (`azure-static-web-apps-thankful-island-0ab89420f.yml`) runs `pnpm install --frozen-lockfile` → `pnpm build`. **Always run `corepack pnpm build` locally before pushing** to catch import/export errors before CI does.

## Architecture

```
Frontend (React 19 + Vite + Tailwind 4)
  └── src/
       ├── InfographicGenerator.jsx   ← root page, most-edited file
       ├── config.js                  ← single source of truth for env vars & feature flags
       ├── components/
       │   ├── create/                ← ScriptEditor, StylePalette, PromptTemplates, GenerateBar
       │   ├── styles/                ← StyleLibrary, StyleCard (shared style feature)
       │   ├── auth/                  ← SessionExpiryBanner
       │   └── ui/                    ← shadcn/ui adapter components (don't edit directly)
       ├── context/AuthContext.jsx    ← Google + MSAL auth state, token refresh logic
       ├── services/
       │   ├── aiService.js           ← Gemini API via Azure Functions gateway
       │   ├── authService.js         ← acquireAccessToken (Google first, then MSAL silent→popup)
       │   └── gptImageService.js     ← Azure AI Foundry (GPT-Image-2)
       └── hooks/

Backend (Azure Functions Node.js)
  └── api/                           ← One folder per function endpoint
       ├── generate-images/           ← Calls Gemini Imagen via @google/genai
       ├── analyze-document/          ← Gemini document analysis
       ├── styles/                    ← Shared style library CRUD (PostgreSQL)
       └── _shared/                  ← Shared utilities and DB connection

Database
  └── db/migrations/                 ← PostgreSQL migration files (run manually or via script)
```

**Hosting**: Azure Static Web Apps (`dist/` + `api/`). Push to `main` triggers automatic CI/CD deployment.

**Auth**: Dual provider — Microsoft MSAL (Entra ID) for enterprise users + Google OAuth for personal users. Both share `AuthContext.jsx`. `acquireAccessToken` in `authService.js` tries Google token first, then MSAL silent, then MSAL popup fallback.

**`identity.js` field precedence (critical):** `auth.js` always returns `{ displayName, email }` — **not** `{ name, email }`. When reading user identity in `api/_shared/identity.js`, always prefer `user.displayName || user.name || email`. Never use `user.name` alone (it is always `undefined`). `getOrCreateUser` must also **UPDATE** `display_name` on every login (not only on INSERT) so existing users with email stored as display name get corrected automatically.

**Image models**:
- `gemini-imagen` ("Nano Banana 2") — default, via Azure Functions API gateway  
- `gpt-image-2` ("GPT Image 2") — Azure AI Foundry endpoint, direct from frontend

## Environment Variables

`VITE_*` variables are **injected at build time** by Vite — they are NOT available at runtime. Changing a `VITE_*` variable in Azure Portal or GitHub Secrets requires **re-triggering a CI/CD deployment** (re-run the GitHub Actions workflow) to take effect. Always tell the user this when they modify env vars.

All env vars are declared in `src/config.js`. New env vars must be added there AND to the `env:` block in `.github/workflows/azure-static-web-apps-thankful-island-0ab89420f.yml`.

## Design System

UI is built on **shadcn/ui** (copy-paste components in `src/components/ui/`) + **Tailwind CSS v4** (via `@tailwindcss/vite`). Full design spec is in `DESIGN_GUIDELINE.md`.

- Use `cn()` from `src/lib/utils.js` for conditional class merging (not template literals)
- Use CSS variables for colors: `hsl(var(--primary))`, `hsl(var(--brand-primary))`, etc.
- Primary color: indigo-600 (`#4F46E5`). Icons: Lucide React (1.5px stroke).
- Add shadcn/ui components via `npx shadcn@latest add <component>` — do not hand-write Radix UI primitives directly
- Target: desktop 1920×1080 as primary viewport; ensure no wasted side margins

## Key Conventions

**Before every push:**
1. Run `corepack pnpm build` — catches import/export errors before CI
2. If only deleting lines and the pre-commit hook rejects, verify there are no unintended regressions, then you may use `git commit --no-verify` with an explanation in the commit message
3. **Backend SQL safety check:** After modifying any Azure Function, run `node --check api/<function>/index.js` AND visually verify that every SQL query's `$N` placeholder count matches the length of the params array. A mismatch causes a runtime 500 that `node --check` will NOT catch.

**Pre-commit hook (Husky):** Runs lint + type-check. For delete-only commits, Husky may produce a false-positive failure. Only bypass with `--no-verify` after confirming the staged diff is intentional.

**Docs:** When creating UX plans or feature specs, write them to `docs/` as markdown. Examples: `docs/SHARED_STYLE_LIBRARY.md`, `docs/GENERAL_CREATION_LAYOUT_UX_PLAN.md`.

**Database migrations:** New SQL schema changes go in `db/migrations/` with incrementing numbers (e.g., `006_*.sql`). Run migrations manually against the Azure PostgreSQL instance.

**Controlled components in `src/components/create/`:** `StylePalette` and `PromptTemplates` are controlled — state lives in `ScriptEditor.jsx`. When refactoring these, ensure named exports (`STYLE_DIMENSIONS`, etc.) stay in sync with all importers. Build verify is mandatory after any export change.

**Auto-push:** When user says "幫我 push" or "push", always run `git push origin main` after committing. If user ends a request with "做完後 push" or similar, push is part of the task.
