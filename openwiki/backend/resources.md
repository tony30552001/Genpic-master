---
type: backend domain reference
title: Resource APIs, Blob assets, and LINE sharing
description: Tenant-scoped styles, history, templates, uploads, generated assets, and LINE integration behavior.
tags: [backend, resources, storage, line, history]
openwiki:
  roles: [domain, integration, workflow]
  change_kinds: [resource-api, storage, history-attribution]
  source_paths: [api/history/index.js, api/_shared/historySource.js, api/blob-sas/index.js, api/styles/index.js, api/templates/index.js, api/uploads/index.js]
  symbols: [normalizeHistorySource, HISTORY_SOURCES, saveHistoryItem, uploadFile]
  test_paths: [api/admin/__tests__/adminResources.test.js, src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx, src/services/__tests__/storageService.test.js, api/uploads/__tests__/index.test.js, api/send-line-image/__tests__/index.test.js, src/services/__tests__/lineService.test.js]
  invariants: [History records remain tenant and user scoped., A history source is general document image-transform or null for legacy or unrecognized values., User-upload authorization is established by a ready owner-scoped upload record, not a Blob URL.]
  validation_commands: [pnpm test --run api/admin/__tests__/adminResources.test.js src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx]
---

# Resource APIs, Blob assets, and LINE sharing

## Persistent resource APIs

`/styles` normalizes tags to trimmed arrays, categories to `social`, `presentation`, `poster`, `ecommerce`, `education`, `document`, `brand`, or `general`, and visibility to `private|shared`. Creation requires nonempty name/prompt and sets `published_at` immediately for shared styles. `mine` means tenant + owner, `shared` means tenant + shared visibility, and `all` means either; all support category/tag/text filters and updated/newest/popular/curated ordering. Read/use allows own or shared; update, delete, publish, and unpublish require creator ownership. A shared source can be copied to a new private owner record and increments source `copy_count`; `use` increments `usage_count`. Deletion first clears matching tenant `history.style_id` then deletes the owner record.

`/styles/search` searches only the caller's own embedded styles by pgvector distance. `/styles/backfill-embeddings` processes at most 100 missing embeddings per request; it supports dry run and reports per-record failures. History lists/creates/deletes tenant+user records; templates list/create/update/delete tenant+creator records. Their frontend adapters live in `storageService.js` and hooks.

### History creation-source attribution

`history.source` records the creation workflow that wrote an image. `api/_shared/historySource.js::normalizeHistorySource` accepts exactly `general`, `document`, and `image-transform`; absent, unknown, or malformed input becomes `null`. The database constraint added by [schema](../data/schema.md) accepts the same three values or null. This is attribution rather than authorization: reads and deletes remain scoped by `tenant_id` and `user_id`, and a client cannot make an arbitrary source value persistent.

`useHistory::saveHistoryItem` forwards source to `POST /history`. `InfographicGenerator` supplies `general` for ordinary image generation, `document` for a generated storyboard scene, and `image-transform` after an image transformation. The user history GET/POST response carries `source`, so consumers should display null as unrecorded rather than infer a workflow for pre-migration rows.

Administrators use `GET /management/history?source=...` to filter the tenant list. A recognized workflow is matched with `h.source = $n`; `source=unknown` deliberately selects `h.source IS NULL`; any other nonempty filter receives `400 bad_request`. The admin list includes the nullable source but continues to return `hasImage` instead of an image URL. The browser control and lazy section-loading rules are owned by [administrator panel and history preview](../frontend/admin-panel.md).

For source changes, update the shared allowed list, the schema constraint/migration, every write call site, list serialization, admin query validation, and the UI labels together. `adminResources.test.js` exercises a recognized source, legacy `unknown`, and rejection of an unsupported admin filter; `AdminPanelSectionLoading.test.jsx` verifies source label rendering and request forwarding. There is no focused `api/history` handler test for source persistence or user-history serialization. Run:

```sh
pnpm test --run api/admin/__tests__/adminResources.test.js src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx
```

`PUT /styles/:id` is a partial update: it changes only supplied `name`, `prompt`, `description`, `tags`, `previewUrl`, or `category` fields and requires creator ownership. `PUT /templates/:id`, however, requires `name` and replaces every persisted template field: omitted `userScript`, `stylePrompt`, `styleId`, and `previewUrl` become `null`, while omitted `category` becomes `general`. The [Asset Center](../frontend/asset-center.md) accounts for this by sending those retained fields from the selected template with its metadata edits. Keep that client payload complete while the handler remains a replacement update; a newly added replacement field must be wired through it, and a partial-update handler would require an intentional client-contract change.

## Upload-backed Blob assets

The arbitrary `/blob-sas` signer is retired: it now returns `410 upload_api_replaced` after session/rate-limit checks so stale bundles fail deterministically. New browser uploads must use the owner-scoped staged lifecycle in [Owner-scoped uploads and staged Blob storage](uploads.md). That system fixes the container and UUID object names server-side, verifies size/MIME during staging-to-ready promotion, and supplies only a ready `uploadId` to consumers.

The document extension policy remains deliberately parallel: `src/lib/documentFormats.js` controls browser acceptance/MIME fallback while `_shared/documentParser.js` is the server authority. Change both deliberately, then run `pnpm test --run src/lib/__tests__/documentFormats.test.js api/_shared/__tests__/documentParser.test.js`. That coverage proves format recognition and parsing, not Blob authorization or a live upload.

Generated job output remains a separate Blob domain: image/deck workers use generated-storage helpers and return their consumer contracts through their owning workflows. Do not substitute a user upload ID for generated output ownership, or infer authorization from a signed URL. The consumer-specific ownership checks for document, image, deck, and LINE inputs are centralized in [Owner-scoped uploads and staged Blob storage](uploads.md).

## LINE configuration and sharing

`line_configs` is one row per user+tenant. `/line-config?action=verify` calls LINE bot info and returns `{ valid: true, channelName, pictureUrl }` or `200 { valid: false, message }`; GET never returns credentials. POST AES-256-GCM encrypts supplied credentials, preserves existing encrypted fields when UI sends `********`, and upserts target/name; DELETE removes it.

`POST /send-line-image` accepts `uploadId` and optional text `message`, explicitly rejects caller-supplied `imageUrl`, resolves only the caller's ready owned image upload, and creates its short read grant entirely on the server. It then requires an active configuration and target, decrypts the configured access token, and POSTs an optional text message (trimmed/capped at 2,000 characters) followed by the image message to LINE Messaging API. The read SAS is not returned to the browser or persisted in the LINE configuration. It returns `{ track: "bot", success: true }`, or errors for missing/expired/unowned upload, missing binding, disabled config, missing target, malformed target, and provider failures. The upload ownership/read-grant boundary is owned by [Owner-scoped uploads and staged Blob storage](uploads.md).

`ShareToLineButton` creates and completes an image upload through the browser storage adapter, then invokes bot push with its `uploadId`. `{ success: true }` means the LINE Messaging API accepted the push request; the repository does not receive a delivery receipt and makes no guarantee about recipient delivery after acceptance (for example, recipient/network/platform outcomes). Although `@line/liff` and LIFF deployment configuration exist, no `src` code consumes LIFF and no implemented LIFF fallback exists; do not document one as runtime behavior.

`api/send-line-image/__tests__/index.test.js` covers owner-scoped upload use and server-side grants; `src/services/__tests__/lineService.test.js` covers the client payload. The schema invariant is documented in [schema](../data/schema.md).