# AGENTS.md

## Project overview

Pixora (GenPic Master) is a React 19 + Vite frontend with a Node.js App Service API and PostgreSQL migrations.

- `src/`: frontend application, pages, components, context, hooks, and services
- `api/`: backend server and endpoint handlers
- `db/migrations/`: PostgreSQL schema migrations
- `.github/workflows/`: CI/CD configuration
- `.github/copilot-instructions.md`: detailed repository-specific guidance

## Engineering principles

- Make the smallest change that works end to end, then grow the system in layers.
- Do not preserve backward compatibility for obsolete behavior. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Keep components modular and concerns clearly separated.
- Prefer established libraries and existing project dependencies; check their documentation and types before adding packages or reimplementing functionality.
- Avoid speculative abstractions, configuration, and indirection.
- Follow existing patterns and keep unrelated files unchanged.
- Make long-term architectural decisions rather than temporary stopgaps.

## Frontend commands

Use Corepack pnpm with the repository-pinned version:

```powershell
corepack pnpm@10.33.2 install
corepack pnpm build
corepack pnpm lint
corepack pnpm exec vitest run
corepack pnpm dev
```

Run the smallest relevant validation command for the change. Always run `corepack pnpm build` before pushing.

## Backend and database rules

- Backend handlers live under `api/`; shared code belongs in `api/_shared/`.
- After modifying an API handler, run `node --check api/<function>/index.js`.
- Visually verify that every SQL `$N` placeholder count matches its parameters array.
- Add new schema changes as incrementing files under `db/migrations/`.
- Never commit secrets or expose credentials in source code, logs, or documentation.

## Application conventions

- `src/config.js` is the single source of truth for frontend environment variables and feature flags.
- New `VITE_*` variables must be added to `src/config.js` and the workflow `env` block. They are injected at build time, so changing them requires a new deployment.
- Use `cn()` from `src/lib/utils.js` for conditional class names.
- Use the existing shadcn/ui components and Tailwind CSS variables; do not hand-write replacement primitives.
- Keep new full-page creation panels aligned with the existing two-panel layout in `src/InfographicGenerator.jsx`.
- `auth.js` provides `displayName`, not only `name`. When reading identities, prefer `user.displayName || user.name || email`, and update `display_name` on every login.
- Preserve the existing image-model routing: `gemini-imagen` is the default and `gpt-image-2` is selected by tenant policy through the API gateway.

## Git and change hygiene

- Do not reset, checkout, or revert unrelated user changes.
- Do not amend commits unless explicitly requested.
- Keep changes precise, type-safe, and free of silent error handling.
- When a requested change makes an old path unnecessary, delete that path rather than layering a fallback.
