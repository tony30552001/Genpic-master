---
type: API reference
title: HTTP API composition and routes
description: Express adapter behavior and the public API route families registered by the local service.
tags: [backend, api, openapi, scalar]
openwiki:
  roles: [integration, operations, workflow]
  change_kinds: [api-routing, api-reference, public-api]
  source_paths: [api/server.js, api/openapi.js, api/_shared/http.js]
  symbols: [invokeFunction, registerRoute, registerRoutes, operation, addOperation]
  invariants: ["The OpenAPI catalog and Express route registry are separate declarations that must describe the same public adapter surface.", "The Scalar and OpenAPI endpoints are served only by the standalone Express adapter."]
  validation_commands: [cd api && node --check server.js && node --check openapi.js]
---

# HTTP API composition and routes

`api/server.js` is a local Express host for Azure-Functions-style modules. `invokeFunction` supplies `{ req, bindingData, log, res }`; after a handler it serializes `context.res`. JSON parsing uses `API_BODY_LIMIT` or `100mb`, proxy trust is enabled, and syntax errors become `400 bad_request`. Unknown `/api` paths become `404 not_found`; unhandled exceptions become `500 internal_error`.

`_shared/http.js` owns `ok`, `error`, and `options`: JSON bodies use `{ error: { code, message } }`. CORS permits wildcard/unset origins in development, otherwise selects configured `CORS_ALLOW_ORIGIN` values and allows `X-Auth-Token`.

## Interactive API reference

The standalone Express adapter also exposes two public discovery endpoints before it registers the function-style handler routes:

- `GET /api/openapi.json` returns the OpenAPI 3.0.3 object exported by `api/openapi.js`, with the adapter's CORS headers.
- `GET /api/docs` serves Scalar (`@scalar/express-api-reference`), configured to load that same-host `/api/openapi.json` document and titled **Pixora API Reference**.

`api/openapi.js` builds its catalog through `operation`, `addOperation`, `pathParameters`, and the shared `paths` map. It declares the supported method/path families, the two accepted authentication schemes (`X-Auth-Token` and Bearer `Authorization`), common status responses, and generic JSON-object request/response schemas. It is an interactive route catalog, **not** a complete payload-schema source: `additionalProperties: true` intentionally does not describe individual handler fields or validation rules. Consult the owner pages—[AI generation](ai-generation.md), [resources](resources.md), and [authentication and administration](auth-tenancy-admin.md)—and the handlers for those contracts.

The catalog and `registerRoutes` are separate declarations. When adding, removing, or changing a public adapter route, update both the handler registry in `api/server.js` and the corresponding `addOperation` definition in `api/openapi.js`; otherwise Scalar can advertise an unavailable endpoint or omit a live one. This surface exists only in the standalone Express process, so validate it through the local adapter or an App Service deployment, not the Azure Functions host.

## Registered families

| Routes | Owner |
|---|---|
| `GET /health`, `GET /me` | health, identity/profile |
| `POST /analyze-document`, `/analyze-style`, `/optimize-prompt`, `/optimize-scene`, `/generate-filename`, `/embeddings` | [AI generation](ai-generation.md) |
| `POST /generate-images`, `/image-transform`; `GET /image-jobs/:id` | [AI generation](ai-generation.md) |
| `/styles`, `/styles/search`, `/styles/backfill-embeddings`, `/history`, `/templates`, `/blob-sas` | [resources](resources.md) |
| `/line-config`, `/send-line-image` | [resources](resources.md) |
| `/management/*` | [auth and admin](auth-tenancy-admin.md) |

All listed route registrations also accept `OPTIONS`; handler-level auth/rate-limit/identity ordering varies only where noted by their owner page. Route additions require an import and `registerRoutes` change in `server.js`, handler implementation, frontend service consumer, a matching `addOperation` entry in `openapi.js`, and appropriate tests. `api/host.json` is deployment host metadata, not this local registry.

## Change and validation guide

Consult this page for adapter routing, the OpenAPI catalog, CORS, or response serialization changes. Start with `api/server.js` (`app.get`, `app.use`, `invokeFunction`, `registerRoute`, `registerRoutes`) and `api/openapi.js` (`operation`, `addOperation`, `paths`). Preserve lifecycle ordering: JSON parsing precedes the documentation and handler routes; the documentation routes must remain before the `/api` fallback; a function handler receives the compatibility `context` and only `context.res` is serialized after it resolves.

For a catalog-only or adapter-wiring change, first run the narrow syntax check:

```sh
cd api && node --check server.js && node --check openapi.js
```

Because this is a shipped adapter surface, internal syntax success is insufficient. After `npm install` and `npm start`, smoke-test the consumer path with `curl -fsS http://localhost:3000/api/openapi.json`; open `http://localhost:3000/api/docs` to confirm Scalar loads the document. Run handler-specific tests and authenticated endpoint checks only when the operation, authentication declaration, or handler behavior changed. Use [development, migrations, and deployment](../operations/development-deployment.md) when validating the linked Static Web App proxy or App Service deployment.