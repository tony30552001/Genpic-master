---
type: API reference
title: HTTP API composition and routes
description: Express adapter behavior, cookie-session API contracts, and the route catalog served by the local API process.
tags: [backend, api, openapi, scalar, sessions]
openwiki:
  roles: [integration, operations, workflow]
  change_kinds: [api-routing, api-reference, public-api, authentication]
  source_paths: [api/server.js, api/openapi.js, api/_shared/http.js, api/auth/index.js]
  symbols: [invokeFunction, registerRoute, registerRoutes, operation, addOperation]
  invariants: ["The OpenAPI catalog and Express route registry are separate declarations that must describe the same public adapter surface.", "Protected unsafe operations require the session cookie plus X-CSRF-Token."]
  validation_commands: [cd api && node --check server.js && node --check openapi.js]
---

# HTTP API composition and routes

`api/server.js` is a local Express host for Azure-Functions-style modules. `invokeFunction` supplies `{ req, bindingData, log, res }`; after a handler it serializes `context.res`. JSON parsing uses `API_BODY_LIMIT` or `100mb`, proxy trust is enabled, syntax errors become `400 bad_request`, unknown `/api` paths become `404 not_found`, and unhandled exceptions become `500 internal_error`.

`_shared/http.js` owns `ok`, `error`, and `options`: JSON errors use `{ error: { code, message } }`. It supports credentialed session requests: configured exact origins receive `Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials: true`; wildcard origins are ignored. The preflight allow-list is `Content-Type,X-CSRF-Token`; it intentionally does not accept the retired `Authorization` or `X-Auth-Token` contract. Session endpoints and middleware semantics are canonical in [server sessions](sessions.md).

## Interactive API reference

The standalone Express adapter exposes discovery endpoints before function-style handler routes:

- `GET /api/openapi.json` returns the OpenAPI 3.0.3 object exported by `api/openapi.js`, with adapter CORS headers.
- `GET /api/docs` serves Scalar (`@scalar/express-api-reference`), configured to load same-host `/api/openapi.json` and titled **Pixora API Reference**.

`api/openapi.js` builds its catalog through `operation`, `addOperation`, `pathParameters`, and `paths`. It declares the cookie `pixora_session` security scheme and marks CSRF-protected unsafe operations with required `X-CSRF-Token`. The catalog is an interactive route catalog, **not** a complete payload-schema source: generic object schemas intentionally do not describe individual handler fields or validation rules. Consult [AI generation](ai-generation.md), [resources](resources.md), and [authentication and administration](auth-tenancy-admin.md) for owner contracts.

The catalog and `registerRoutes` are separate declarations. When adding, removing, or changing a public adapter route, update both the handler registry in `api/server.js` and matching `addOperation` definition in `api/openapi.js`; otherwise Scalar can advertise an unavailable endpoint or omit a live one. The Scalar/OpenAPI surface exists only in the standalone Express process, not the Azure Functions host.

## Registered families

| Routes | Owner |
|---|---|
| `GET /health` | health |
| `GET /auth/entra/start`, `GET /auth/entra/callback`, `POST /auth/google`, `GET /auth/session`, `POST /auth/logout` | [server sessions](sessions.md) |
| `GET /me` | [authentication and administration](auth-tenancy-admin.md) |
| `POST /analyze-document`, `/analyze-style`, `/optimize-prompt`, `/optimize-scene`, `/generate-filename`, `/embeddings` | [AI generation](ai-generation.md) |
| `POST /generate-images`, `/image-transform`; `GET /image-jobs/:id` | [AI generation](ai-generation.md) |
| `/styles`, `/styles/search`, `/styles/backfill-embeddings`, `/history`, `/templates`, `/blob-sas` | [resources](resources.md) |
| `/line-config`, `/send-line-image` | [resources](resources.md) |
| `/management/*` | [authentication and administration](auth-tenancy-admin.md) |

All listed function registrations also accept `OPTIONS`. New protected unsafe operations must have a browser-acquirable CSRF token path and a `csrf: true` catalog declaration, not only a cookie security declaration.

## Change and validation guide

Consult this page for adapter routing, CORS, OpenAPI, Scalar, or response serialization. Start with `api/server.js` (`invokeFunction`, `registerRoute`, `registerRoutes`) and `api/openapi.js` (`operation`, `addOperation`, `paths`). Preserve lifecycle ordering: JSON parsing precedes documentation and handler routes, documentation routes remain before `/api` fallback, and a function handler receives compatibility context with only `context.res` serialized after resolution.

For catalog-only or adapter-wiring changes, run:

```sh
cd api && node --check server.js && node --check openapi.js
```

Because this is a shipped adapter surface, syntax success is insufficient. After `npm install` and `npm start`, use `curl -fsS http://localhost:3000/api/openapi.json` and open `http://localhost:3000/api/docs`. For a session or CORS change, complete sign-in in a same-origin browser and verify `GET /api/auth/session` plus one CSRF-protected mutation. Run handler-specific checks only when the operation or handler changed; use [operations](../operations/development-deployment.md) for Static Web App proxy or App Service deployment validation.
