---
type: security architecture
title: Authentication, tenancy, and administration
description: Session-derived identity, tenant persistence, role enforcement, image-model policy, and encrypted tenant analysis-model administration.
tags: [backend, authentication, authorization, tenancy, administration, llm]
openwiki:
  roles: [architecture, domain, integration, testing]
  change_kinds: [authorization, tenancy, model-policy, model-configuration]
  source_paths: [api/_shared/auth.js, api/_shared/identity.js, api/_shared/llmProviders.js, api/_shared/llmModels.js, api/_shared/llmRuntime.js, api/admin/index.js, api/me/index.js]
  symbols: [requireAuth, resolveIdentity, requireAdmin, ensureModelPolicy, validateModelPolicy, LLM_ROLES, resolveRoleModel, setRoleAssignment, generateJson]
  test_paths: [api/_shared/__tests__/auth.test.js, api/_shared/__tests__/llmModels.test.js, api/_shared/__tests__/llmRuntime.test.js]
  invariants: ["A protected handler receives identity from a valid Pixora session, not a browser-supplied provider token.", "Tenant resource access remains server-scoped even when the client supplies filters.", "Analysis API keys are encrypted at rest and never included in management responses.", "Each analysis role resolves only same-tenant primary and optional distinct fallback models; provider dispatch happens at runtime."]
  validation_commands: [pnpm test --run api/_shared/__tests__/auth.test.js api/_shared/__tests__/llmModels.test.js api/_shared/__tests__/llmRuntime.test.js]
---

# Authentication, tenancy, and administration

Protected handlers call `requireAuth`, then conventionally rate-limit and resolve tenant identity. `requireAuth` uses the server session cookie and enforces CSRF for unsafe methods; it returns a normalized provider identity only after the session is live and its user is active. The complete cookie, expiry, and Entra/Google issuance flow is documented in [server sessions and BFF sign-in](sessions.md). `AUTH_DISABLED` creates a local identity only outside production; production detection explicitly ignores it.

`resolveIdentity` obtains or creates the initial tenant and upserts a user by normalized `(tenant_id, email)`. An inactive record has no usable `userId`; resource handlers conventionally turn that into 401. The durable uniqueness and session-table constraints are in [schema](../data/schema.md). A valid session carries the provider subject, but authorization remains based on the persisted tenant/user record rather than a client-selected identity.

## Administration and policy

`requireAdmin` rejects inactive users and requires role `admin`, except for the true local non-production bypass. `adminService.js` maps `/api/management/users?page&pageSize`, `/user-options`, `/history?userId&page&pageSize`, `/styles?userId&page&pageSize`, and `/settings`; updates use `PUT /users/:id` or `PUT /settings`, and admin style removal is `DELETE /styles/:id`. The API lists only the admin tenant, applies optional `userId` filters to history/styles, clamps page size to 100, validates `admin|editor|viewer` and boolean status, disallows self-disable, and prevents demoting or disabling the final active admin. Unlike normal `/styles/:id`, whose deletion requires creator ownership, management deletion can remove any style in the tenant after nulling history references. The browser's table, page-local image preview, and download presentation consume this list contract but add no detail endpoint; see [administrator panel and history preview](../frontend/admin-panel.md).

`tenant_model_settings` is created lazily by `ensureModelPolicy`. `GET /management/settings` returns `{ modelPolicy, supportedModels }`; `PUT` initializes then validates/persists `{ allowedModels, defaultModel }` with `updatedBy`. `validateModelPolicy` accepts only `gemini-imagen` and `gpt-image-2`, requires at least one allowed model, and requires the default to be allowed. Generation and history use the default, so this image-generation setting changes runtime provider selection rather than merely UI presentation.

### Tenant analysis models

`api/_shared/llmProviders.js` owns the six-role catalog; `llmModels.js` owns its tenant catalog and assignments. `GET /management/llm-models` returns models without plaintext API keys (`hasApiKey` only), assignments, roles, and provider metadata. Administrators use `POST`, `PUT`, and `DELETE /management/llm-models[/id]`; an empty update key retains the prior encrypted value, duplicate labels are conflicts, and deletion is refused while an assignment references the model. `PUT /management/llm-roles/:role` upserts a primary and optional distinct fallback, both of which must be tenant-local. Provider matching is intentionally not an assignment rule: any role can select Azure OpenAI or Google Gemini models, including a cross-provider fallback. `POST /management/llm-model-tests` tests either an already stored model or draft configuration and returns a success/latency result; it is not a secret-return path.

`resolveRoleModel(tenantId, role)` decrypts only the selected model(s) for server-side calls. `llmRuntime.js::generateJson` then dispatches each attempt by the active model's provider, so roles such as `document_analysis`, `prompt_optimization`, `deck_authoring`, `style_analysis`, `filename`, and `scene_optimization` no longer have a provider pairing. The management connection test uses this same runtime boundary, including its output-truncation handling, rather than calling a provider adapter directly. Azure endpoints must be public HTTPS URLs; Gemini endpoint input is discarded because its SDK owns the endpoint. A missing assignment is `LlmConfigurationError` (`503 llm_not_configured`), not a fallback to environment configuration. The model tables and encryption boundary are documented in [schema](../data/schema.md), and runtime callers/retry behavior are documented in [AI generation](ai-generation.md).

`/api/me` is the browser profile boundary and returns `{ user: { id, email, displayName, role }, modelPolicy }`; `AuthProvider` folds it into `profile` and `isAdmin`. See [browser application and authentication](../frontend/application.md) for the profile-load and gate lifecycle.

## Change and validation guide

Consult this page for authorization predicates, user status/roles, tenant query filters, `/api/me`, or model-policy changes. Preserve ordering: authenticate the session first, then rate-limit and resolve persisted identity before operating on tenant data. A new protected mutating route also needs the session/CSRF contract and the synchronized public declaration described in [HTTP API](http-api.md).

Run `api/_shared/__tests__/auth.test.js` for missing-session, CSRF rejection, and valid-session behavior. When changing session mechanics, add `session.test.js` from [server sessions](sessions.md). Run `src/services/__tests__/adminService.test.js` for browser URL/payload integration when it exists. There is no dedicated API-admin handler suite; authorization predicate changes require authenticated same-tenant and cross-tenant negative checks, and model-policy changes should additionally exercise the generation owner described in [AI generation](ai-generation.md).
