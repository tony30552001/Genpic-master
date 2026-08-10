---
type: operations guide
title: Development, migrations, and deployment
description: Local commands, runtime entrypoints, migration procedure, and non-secret configuration categories.
tags: [operations, development, deployment]
---

# Development, migrations, and deployment

The root package requires Node `>=22.22.0` and pnpm `>=10`; use `corepack pnpm@10.33.2 install`. Root scripts are `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm preview`. Vite listens on 5175 and uses `@` for `src`.

The API is a separate Node package requiring Node `>=22.22.0`: run its `start` script to execute `server.js`. Standalone startup also starts the in-process image job polling worker. This differs from Azure Functions handling where GPT image generation is synchronous (`FUNCTIONS_WORKER_RUNTIME` branch). API migration command runs `api/scripts/migrate.cjs`, which needs a database connection configuration and executes all SQL files in lexicographic order.

## Configuration categories

Do not place values in source. Browser configuration covers MSAL/Google IDs, API base URL, optional direct GPT Image endpoint/deployment and `VITE_AUTH_BYPASS`. API configuration covers IdP audience/tenant and Google client ID, database, Blob account/containers, allowed CORS origins, Google/Azure AI provider settings, optional OpenAI deployment, API body limit, job poll interval, and LINE encryption/key configuration. `AUTH_DISABLED` is rejected in production by code; `CORS_ALLOW_ORIGIN` should be explicit in production.

`staticwebapp.config.json` supplies API route allowance and SPA fallback. The Azure Static Web Apps workflow in `.github/workflows` is deployment evidence; existing `docs/` deployment and identity guides are supporting operational material, not runtime authority.

## Entra session operations

The browser's Microsoft path uses MSAL silent renewal before an ID token has fewer than five minutes remaining, then redirects back to the initiating page only when interactive authentication is required. This protects API calls from a stale cached ID token but cannot guarantee a permanent SPA session: Entra refresh tokens still have service-side lifetime limits (the setup guide describes the typical SPA limit as about 24 hours). After that limit, a user must interactively re-authenticate; a long-lived no-prompt product session would require a server-side BFF/session design rather than a browser-only change. See the runtime ownership and focused regression check in [browser application and authentication](../frontend/application.md).

When changing Entra redirect settings, register the exact `VITE_MSAL_REDIRECT_URI` value as a SPA redirect URI and manually exercise login, a return to the original page, and an expired-session re-authentication in the target environment. Do not use production credentials in local validation.

Run `pnpm lint && pnpm test && pnpm build` for frontend changes. For schema/API changes, run migrations on a disposable database and start the API with non-production credentials; add authenticated manual checks for CORS, policy selection, and job behavior. Never use a production direct browser key for normal server-owned generation.

## API reference operation

The standalone `api/server.js` process serves the interactive Scalar reference at `/api/docs` and its OpenAPI document at `/api/openapi.json`. Locally, after `cd api && npm start`, use `curl -fsS http://localhost:3000/api/openapi.json` as the narrow contract-discovery smoke check, then open `http://localhost:3000/api/docs` when verifying the rendered UI. The Azure Static Web App linked-backend path exposes the same routes under its own `/api` origin; a deployment change that affects proxying or the API package should check `https://<swa-domain>/api/openapi.json` and `https://<swa-domain>/api/docs` after the health endpoint.

These routes belong to the Express adapter rather than the Azure Functions host, and the JSON catalog intentionally uses generic object schemas. For route registration, catalog synchronization, authentication declarations, and handler-contract ownership, consult [HTTP API composition and routes](../backend/http-api.md); do not treat a successful documentation UI render as a substitute for authenticated endpoint or provider validation.