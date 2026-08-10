---
type: security architecture
title: Authentication, tenancy, and administration
description: Token verification, persisted tenant identity, role enforcement, and model-policy administration.
tags: [backend, authentication, authorization]
---

# Authentication, tenancy, and administration

Most protected handlers call `requireAuth`, `rateLimit`, then `resolveIdentity`. `requireAuth` takes `X-Auth-Token` before standard Bearer; only when absent does it parse `x-ms-client-principal` (SWA). Google ID tokens are verified through `google-auth-library`; Microsoft tokens require RS256 JWKS validation with configured tenant/client audience. Unsigned HS256/no-`kid` tokens are rejected. `AUTH_DISABLED` works only outside production; production detection explicitly ignores it.

`resolveIdentity` obtains/creates the first tenant then upserts a user by normalized `(tenant_id, email)`. An inactive record returns no `userId`; resource handlers conventionally turn that into 401. The canonical uniqueness/migration story is in [schema](../data/schema.md).

## Administration and policy

`requireAdmin` rejects inactive users and requires role `admin`, except for a true local non-production bypass. `adminService.js` maps `/api/management/users?page&pageSize`, `/user-options`, `/history?userId&page&pageSize`, `/styles?userId&page&pageSize`, and `/settings`; updates use `PUT /users/:id` or `PUT /settings`, and admin style removal is `DELETE /styles/:id`. The API lists only the admin tenant, applies optional `userId` filters to history/styles, and clamps page size to 100. It validates `admin|editor|viewer` and boolean status, disallows self-disable, and prevents demoting/disabling the final active admin. Unlike normal `/styles/:id`, whose deletion requires creator ownership, management deletion can remove any style in the tenant after nulling history references.

`tenant_model_settings` is created lazily by `ensureModelPolicy`. `GET /management/settings` returns `{ modelPolicy, supportedModels }`; `PUT` initializes then validates/persists `{ allowedModels, defaultModel }` with `updatedBy`. `validateModelPolicy` accepts only `gemini-imagen` and `gpt-image-2`, requires at least one allowed model, and requires the default to be allowed. Generation and history use the default, so an admin setting changes runtime provider selection rather than merely UI presentation.

`/api/me` is the client profile boundary and returns `{ user: { id, email, displayName, role }, modelPolicy }`; the browser folds it into `profile` and `isAdmin`. Management lists return `{ items, pagination: { page, pageSize, total, totalPages } }` for users/history/styles; user-options is an unpaginated user array. User update returns the mapped user (including counts); style deletion is 204. Settings GET/PUT return `{ modelPolicy, supportedModels }`. The React admin gate is described in [application](../frontend/application.md).

## Validation

Run the focused `api/_shared/__tests__/auth.test.js` for authentication cases and `src/services/__tests__/adminService.test.js` for browser URL/payload integration. No API-admin handler test suite was found; changes to authorization predicates need manual authenticated and cross-tenant negative checks.