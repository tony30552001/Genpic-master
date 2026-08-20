---
type: operations guide
title: Development, migrations, and deployment
description: Local commands, API entrypoints, BFF session, encrypted analysis-model, and PPT Master sidecar configuration, migration procedure, and deployment validation boundaries.
tags: [operations, development, deployment, sessions, entra, llm, ppt-master]
openwiki:
  roles: [operations, workflow]
  change_kinds: [deployment, configuration, session-lifecycle, migrations]
  source_paths: [package.json, api/package.json, api/scripts/migrate.cjs, api/_shared/http.js, api/_shared/session.js, api/_shared/llmRuntime.js, api/_shared/azureOpenAI.js, api/_shared/imageProviders.js, api/_shared/gptImage.js, services/ppt-master-service/Dockerfile, .github/workflows/ppt-master-service.yml, .github/workflows/azure-static-web-apps-thankful-island-0ab89420f.yml]
  validation_commands: [pnpm lint && pnpm build, node api/scripts/migrate.cjs 012_deck_job_events.sql, pnpm test --run api/_shared/__tests__/deckContract.test.js, pnpm test --run api/_shared/__tests__/llmModels.test.js api/_shared/__tests__/llmRuntime.test.js]
---

# Development, migrations, and deployment

The root package requires Node `>=22.22.0` and pnpm `>=10`; use `corepack pnpm@10.33.2 install`. Root scripts are `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm preview`. Vite listens on 5175 and uses `@` for `src`.

The API is a separate Node package requiring Node `>=22.22.0`: run its `start` script to execute `server.js`. Standalone startup also starts the in-process image job polling worker. The API migration command runs `api/scripts/migrate.cjs`, which needs database connection configuration. With no arguments it executes all SQL files in lexicographic order; with exact `.sql` filenames it executes only those files (also ordered), and rejects unknown names.

## BFF session configuration

Browser configuration is limited to the public Google client ID, API base URL, and local `VITE_AUTH_BYPASS`; `.env.example` demonstrates the non-secret names. Do not put Entra client secrets, session secrets, or provider keys in Vite configuration.

The API needs Entra tenant/client/secret and the exact `ENTRA_REDIRECT_URI`, `AUTH_SESSION_SECRET` of at least 32 bytes, Google client ID, and database configuration. Production must also set exact `CORS_ALLOW_ORIGIN` values and leave `AUTH_DISABLED` false. Without configured origins outside production, `_shared/http.js` permits only its built-in localhost ports (5173–5175 on `localhost` or `127.0.0.1`). Any configured origin must match the browser origin exactly: session requests use credentials, so `*` is ignored and cannot support cookie authentication. The BFF configuration and safety rationale are explained in [server sessions](../backend/sessions.md).

Register the Entra callback as a **Web** redirect URI, for example `http://localhost:3000/api/auth/entra/callback` locally or `https://<your-swa-domain>/api/auth/entra/callback` in deployment. The callback, client secret, and session secret remain API/App Service configuration. Existing `docs/ENTRA_ID_SETUP.md` and `docs/API_LOCAL_DEV.md` provide setup details; source code is authoritative for runtime behavior.

## Development and migration guide

For browser-only changes, use the focused test from the owning wiki page, then `pnpm lint && pnpm build` when the changed surface needs a build check. For API route wiring, use the syntax and adapter smoke checks in [HTTP API](../backend/http-api.md). Avoid running the whole suite by default.

For schema changes, run migrations only against a disposable database and check the owning API behavior. Use `node api/scripts/migrate.cjs <exact-migration.sql>` for a narrow new-migration check (for example, `node api/scripts/migrate.cjs 014_llm_models.sql`); use `cd api && npm run migrate` only when validating full ordered replay. `010_auth_sessions.sql` is required for the BFF session implementation; `012_deck_job_events.sql` is required before deploying the event-aware deck-status handler because `GET /api/deck-jobs/:id` queries that table; and `014_llm_models.sql` is required before any tenant-configured analysis caller. See [schema](../data/schema.md). Do not run migrations against production as routine validation.

For a session/authentication change, run the focused browser and API tests documented by [browser application](../frontend/application.md) and [server sessions](../backend/sessions.md), then use non-production configuration to check this sequence: BFF login returns to the requested local route, `GET /api/auth/session` reports a user and CSRF value, a mutation includes cookie plus CSRF, logout clears the session, and an expired/revoked session produces recovery UI. This is conditional integration validation, not a baseline for unrelated frontend work.

## Analysis-model secret configuration

`SECRET_ENCRYPTION_KEY` is an API-only 64-character hex value used by `api/_shared/secretCrypto.js` for AES-256-GCM encryption of LINE channel tokens and tenant analysis-model API keys. It must be stable: replacing it makes existing ciphertext unreadable. Existing deployments using `LINE_TOKEN_ENCRYPTION_KEY` need to retain its key material under `SECRET_ENCRYPTION_KEY` before reading pre-existing LINE records. Generate and store the value through the deployment secret mechanism; never put it in Vite configuration, a migration, or this wiki.

After applying `014_llm_models.sql`, an administrator creates Azure OpenAI/Gemini records and assigns each role in `/admin`. The managed runtime paths are document analysis, prompt optimization, PPT Master deck authoring, style analysis, filename generation, and scene optimization. Roles are provider-neutral: the selected primary and optional fallback can be either provider, and `llmRuntime.js` dispatches each attempt by the active model; [AI generation](../backend/ai-generation.md) is canonical for those rules. A successful-but-incomplete Azure/Gemini response is retried on that same model with a doubled output budget up to 32,000 tokens; an Azure deployment that cuts output materially below the request is reported instead, so its model assignment should be replaced rather than retried. `AZURE_OPENAI_*`, `GEMINI_MODEL_ANALYSIS`, and the old deployment fallback setting no longer configure those paths. This does not change image-generation credentials or embedding configuration. Validate model persistence and runtime boundaries provider-free with:

```sh
pnpm test --run api/_shared/__tests__/llmModels.test.js api/_shared/__tests__/llmRuntime.test.js
```

Use an administrator-only connection test only when deliberately validating live provider credentials; it is not a default CI check.

## PPT Master sidecar

The optional PPT Master workflow uses a separately deployed FastAPI container because the immutable upstream Python skill performs source conversion, SVG quality checks, and deterministic SVG-to-native-PPTX compilation. The Node API remains responsible for model calls and durable jobs; the sidecar is called through `api/_shared/pptMasterClient.js` with `X-Pixora-Service-Key`. See [PPT Master deck jobs](../backend/ppt-master-decks.md) for the runtime lifecycle and [schema](../data/schema.md) for its migration.

The API always registers the public deck routes, but creation and template lookup return unavailable when `PPT_MASTER_SERVICE_URL` and `PPT_MASTER_SERVICE_KEY` are absent; the standalone worker does not start without them. Other non-secret configuration categories are request timeout, worker poll interval, lock timeout, and the optional brand-catalog flag; use the source/defaults rather than placing these values in browser configuration. Deck outline/SVG authoring resolves the tenant's assigned `deck_authoring` model and optional fallback; it no longer reads Azure deployment settings. Deck illustrations use the tenant model policy's default image model in Node: `gemini-imagen` requires the Google API key, while `gpt-image-2` requires `GPT_IMAGE_ENDPOINT` and `GPT_IMAGE_API_KEY`. If the selected image model is unavailable, the worker records the image step as failed and continues with a layout-only deck. The sidecar requires the same service key, a Python work directory, and its command timeout. No model credential belongs in the sidecar; see [PPT Master deck jobs](../backend/ppt-master-decks.md) for the model boundary and [AI generation](../backend/ai-generation.md) for retry semantics.

The sidecar Dockerfile pins the immutable `ppt-master` skill to `v4.8.0` and verifies its archive checksum before running the upstream attribution guard; a skill upgrade therefore changes the shipped compilation surface, not merely documentation. For a container or upstream-skill change, build and run the zero-AI smoke pipeline from `services/ppt-master-service/README.md`; it writes a minimal SVG, runs the authoritative gate, and exports a PPTX. This is conditional and more expensive than the Node contract test. For API outline/SVG validation changes, run the narrow check:

```sh
pnpm test --run api/_shared/__tests__/deckContract.test.js
```

`.github/workflows/ppt-master-service.yml` builds in Azure Container Registry and updates a distinct Azure Container App for `main` pushes that touch the service/workflow paths. The Docker build runs the skill-integrity gate. Because ingress accepts only App Service outbound IPs, the GitHub runner cannot poll `/health`; instead, the workflow retrieves the latest revision and polls its Azure Container Apps `runningState` for `Running` or `RunningAtMaxScale`, failing on `Failed`, `Degraded`, or a timeout. The service should be internally reachable only by the API; do not expose the shared-key control plane as a browser API.

## Deployment boundaries

OpenWiki has no scheduled GitHub Actions refresh workflow. Run `openwiki --update` locally when the generated repository wiki needs maintenance; the deleted scheduled workflow is not a deployment dependency.

`staticwebapp.config.json` supplies API route allowance and SPA fallback. On a `main` push, the Azure Static Web Apps workflow builds the frontend, syntax-checks `api/server.js`, deploys the `api` directory to App Service, and configures SWA with no managed Functions `api_location`; it therefore expects the linked App Service to serve the BFF/API. It deliberately ignores `**/*.md`, `docs/**`, and `openwiki/**` on pushes, so documentation-only pushes do not deploy. Pull requests still run the SWA preview workflow. App Service Oryx—not the GitHub Actions job—installs API production dependencies from `api/package-lock.json`; keep that lockfile synchronized with `api/package.json` and do not package local `api/node_modules`. Treat API and Static Web App deployment as a coupled operational boundary when changing proxy behavior, callback URL, CORS, or API dependencies.

For an API dependency or deployment-workflow change, run `node --check api/server.js` as the same narrow CI entrypoint check, inspect the package/lockfile pair, and use a push deployment only when App Service build behavior needs validation. `pnpm build` is a separate frontend check; it does not exercise App Service dependency installation.

App Service **Authentication / Easy Auth** must be disabled or allow unauthenticated requests. The BFF itself owns Entra authorization-code exchange, Google credential verification, cookies, and CSRF as described in [server sessions](../backend/sessions.md). A platform `RedirectToLoginPage` policy would intercept `/api/auth/*` before those routes run; do not configure it as a second authentication layer for this deployment.

The standalone `api/server.js` process serves Scalar at `/api/docs` and OpenAPI at `/api/openapi.json`. After API deployment or proxy changes, check health first, then `https://<swa-domain>/api/openapi.json` and `/api/docs` on the deployed origin. For the interactive catalog locally, after `cd api && npm start`, use `curl -fsS http://localhost:3000/api/openapi.json`. A rendered docs UI does not substitute for authenticated session or provider validation.
