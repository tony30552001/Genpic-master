---
type: frontend administration workflow
title: Administrator panel and history preview
description: Admin-only browser workspace for tenant users, history, image policy, encrypted analysis-model role assignments, and styles, including page-local generated-image inspection.
tags: [frontend, administration, history, images, llm, accessibility]
openwiki:
  roles: [frontend, workflow, integration, testing]
  change_kinds: [administration, history-browsing, image-preview, model-configuration]
  source_paths: [src/App.jsx, src/pages/AdminPage.jsx, src/components/admin/AdminPanel.jsx, src/components/admin/UserFilterSelect.jsx, src/components/admin/LlmModelSettings.jsx, src/components/common/ImageLightbox.jsx, src/services/adminService.js, api/admin/index.js, api/_shared/historySource.js]
  symbols: [ProtectedAdminRoute, AdminPage, AdminPanel, USER_SEARCH_DEBOUNCE_MS, HISTORY_SOURCE_FILTERS, historySourceLabel, UserFilterSelect, AdminRemoteImage, loadAdminImage, LlmModelSettings, listAdminUsers, listAdminHistory, listAdminLlmModels, assignAdminLlmRole, getAdminHistoryImage, getAdminStylePreview, ImageLightbox, viewableHistoryItems]
  test_paths: [src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx, src/components/admin/__tests__/AdminHistoryPreview.test.jsx, src/components/admin/__tests__/LlmModelSettings.test.jsx, src/components/common/__tests__/ImageLightbox.test.jsx, api/admin/__tests__/adminResources.test.js]
  invariants: [The `/admin` route renders only after authenticated profile loading confirms the admin role., The panel loads only the initially active users section and loads each other section once when opened., User-list keyword input is debounced and pagination reuses the applied query., A user or history-source filter invalidates and reloads only the currently active history or styles section., Provider selectors are mutually exclusive because they share one selected user ID and filter already-loaded user options locally., The history-source filter passes only general document image-transform or unknown to the server and unknown represents records whose source is null., History preview navigation includes only image-bearing records loaded in the current page., List responses expose availability flags rather than image URLs; image URLs are retrieved through tenant-scoped admin endpoints and cached in-browser by record ID., Closing a shared lightbox restores prior focus and document scrolling., Browser model settings never receive an analysis API key.]
  validation_commands: [pnpm test --run api/admin/__tests__/adminResources.test.js src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx src/components/admin/__tests__/AdminHistoryPreview.test.jsx src/components/admin/__tests__/LlmModelSettings.test.jsx src/components/common/__tests__/ImageLightbox.test.jsx]
---

# Administrator panel and history preview

`/admin` is the administrator browser workspace. `AdminPage` is a thin wrapper around `AdminPanel`; `ProtectedAdminRoute` in [browser application and authentication](application.md) waits for profile loading and redirects non-admin users to `/`. On mount, the panel loads only its active **users** section. Opening history, styles, or models loads that section once and retains it in memory; changing the user filter invalidates history and styles but refetches only the section currently on screen. The users section debounces its keyword field for `USER_SEARCH_DEBOUNCE_MS` (300 ms), sends the trimmed applied value through `listAdminUsers`, and retains that value across its pagination and page-size reloads. `LlmModelSettings` remains the separate composition for encrypted analysis-model settings. The panel also exposes section-specific pagination, user role/status changes, image-model-policy saves, administrator style deletion, and analysis-model CRUD/role assignment. The server-side authorization, tenant scope, last-provider field, literal-safe search, list/image contract, and management endpoints are canonical in [authentication, tenancy, and administration](../backend/auth-tenancy-admin.md).

## Provider-specific user filtering

`listAdminUserOptions` supplies provider-tagged tenant users. `AdminPanel` groups that already-loaded list into Entra ID, Google, and—only when present—unknown-provider controls. Each `UserFilterSelect` performs its own case-insensitive display-name/email filtering in memory; it does not make a search request. The controls share `selectedUserId`, so selecting a user in one provider group clears the apparent selection in the other group and results in one `userId` filter for the active history or styles request. `authProvider` is nullable because accounts predating the session backfill may have no recorded provider; it is display/filter metadata, not a security boundary.

`UserFilterSelect` owns its local open state, keyword reset on selection, initial focus on the search field, Escape close, and outside-pointer close. Keep provider grouping in `AdminPanel`, where the full user option list and cross-section reload lifecycle exist; use this component only for an in-memory, provider-scoped single-select. Its values must continue to originate from the tenant-scoped administration API described in [authentication, tenancy, and administration](../backend/auth-tenancy-admin.md).

## Analysis-model settings

The **analysis models** section is a separate composition component, `LlmModelSettings`. It loads `{ models, assignments, roles, providers }` through `listAdminLlmModels`, then delegates create/update/delete, role assignment, and a deliberate live connection test to the corresponding `adminService` calls. The API returns `hasApiKey`, never the key itself; an edit with an empty `apiKey` preserves the stored ciphertext. Azure entries require a public HTTPS endpoint while Gemini entries omit one.

Assignments select a required primary and optional distinct fallback from the full tenant model catalog. The role catalog identifies the function, not a provider: any role can use Azure OpenAI or Google Gemini, and a fallback may cross providers. The selectors include the provider in each option label; when no models exist, the UI explains that no assignment selector is available. Configuration, encryption, and assignment authorization are detailed in [authentication, tenancy, and administration](../backend/auth-tenancy-admin.md); the provider-neutral runtime and failure behavior are detailed in [AI generation](../backend/ai-generation.md). The connection-test action is intentionally an admin-initiated provider call, not a normal browser startup request.

For this section, begin at `src/components/admin/LlmModelSettings.jsx` and `src/services/adminService.js`. `LlmModelSettings.test.jsx` covers the empty-catalog explanation, settings load, secret-free rendering, model creation payload, all-model role selection, cross-provider assignment, delete rejection, and connection-test UI. Run it together with the model-domain/runtime checks from [AI generation](../backend/ai-generation.md); use a live connection test only when changing real credentials or provider connectivity.

## History source filter and image inspection

The history section has an independent `historySource` state. `HISTORY_SOURCE_FILTERS` presents **general creation**, **document storyboard**, **image transform**, and **unrecorded** options; `historySourceLabel` maps a null row source to unrecorded. Changing it removes `history` from `requestedSectionsRef`, then the active-section effect calls `loadHistorySection({ userId, source, pageSize })`. It does not alter the user/style filters or trigger a request for an inactive section. `adminService::listAdminHistory` omits an empty source query parameter and preserves pagination; the API meaning of `unknown` and accepted source IDs are canonical in [resources](../backend/resources.md).

The history list returns `hasImage`, not `imageUrl`, so records without that flag remain a noninteractive **no preview** state. `AdminRemoteImage` calls `getAdminHistoryImage` for each image-bearing thumbnail. `loadAdminImage` stores resolved URLs in the module-local `adminImageCache`, so a thumbnail and a later preview reuse the same record-ID entry for the lifetime of the browser module. Selecting a thumbnail sets `previewHistoryId`; `viewableHistoryItems` filters the currently loaded `historyItems` to image-bearing records, and `previewIndex` resolves the selected ID in that filtered list. The preview effect fetches the selected record through the same cache boundary. If the ID no longer resolves, no dialog is rendered.

```mermaid
sequenceDiagram
  participant Admin as Administrator
  participant Panel as AdminPanel
  participant Service as adminService
  participant Api as management API
  participant Modal as ImageLightbox
  Admin->>Panel: open history section
  Panel->>Service: listAdminHistory page and pageSize
  Service->>Api: GET management history
  Api-->>Service: tenant records with hasImage
  Service-->>Panel: items and pagination
  Panel->>Service: getAdminHistoryImage record id
  Service->>Api: GET management history image
  Api-->>Service: imageUrl with private cache header
  Service-->>Panel: imageUrl cached by record id
  Admin->>Panel: select thumbnail
  Panel->>Modal: render selected image record
  Admin->>Modal: next previous or close
  Modal-->>Panel: change selected ID or clear it
```

This sequence shows separate tenant-scoped image retrieval over the already loaded page. It does not add an item-detail endpoint or navigate across server pages.

The dialog receives the selected image URL, an accessible image description, and record details for the user display name/email, model, style name, timestamp, full prompt, and user script. It exposes the image URL as a download link named `pixora-<history-id>.png`. Previous/next controls and left/right-arrow keyboard handling move only among image-bearing items in the loaded page. At the boundaries, the unavailable direction is disabled. Escape, the backdrop, and the close control dismiss the dialog.

The dialog is the shared `ImageLightbox` used by [Asset Center](asset-center.md). Its optional `details`, download, position, and navigation props are what make this management use case richer than the style preview; the component, not `AdminPanel`, owns document scroll locking, close-button autofocus, focus restoration, and document-level Escape/arrow listeners. Keep those lifecycle responsibilities centralized when adding another consumer.

## Change and validation guide

Consult this page for `/admin` loading, user search/provider/history-source filtering, presentation, history/style thumbnails, preview, or use of the shared lightbox. Start at `src/components/admin/AdminPanel.jsx`: `requestedSectionsRef` controls once-per-section initial loads, `loadUsersSection`/`loadHistorySection`/`loadStylesSection`/`loadSettingsSection` own independent fetches, and `runRefresh` owns explicit pagination refreshes. `USER_SEARCH_DEBOUNCE_MS` and `appliedUserSearchRef` form the user-search seam: reset to page one for a changed applied query and preserve the applied query on later user-list pagination. `PROVIDER_FILTERS`, `userFilterGroups`, and `selectedUserId` compose provider grouping; `UserFilterSelect` is deliberately client-side over the loaded options. `HISTORY_SOURCE_FILTERS`, `historySource`, and `handleHistorySourceChange` are the server-backed history-attribution seam; preserve the special null-only `unknown` option from [resources](../backend/resources.md). `AdminRemoteImage`, `loadAdminImage`, and `adminImageCache` are the protected-image seam; keep the list's availability flags separate from image URL retrieval. `previewHistoryId`, `viewableHistoryItems`, `previewIndex`, and `previewDetails` form the preview composition seam. Change `src/components/common/ImageLightbox.jsx` for modal behavior shared with the style library; update [Asset Center](asset-center.md) at the same time if the minimal-preview contract changes. Change `src/services/adminService.js` and [authentication, tenancy, and administration](../backend/auth-tenancy-admin.md) together when the management request contract changes.

Preserve these rules:

1. Route guarding is not a visual concern: retain `ProtectedAdminRoute` and do not make the panel itself the authorization boundary.
2. Keep the initial load narrow: users load on mount; an unvisited history, styles, or models section must not request data. A failed first load is retryable because its section is removed from `requestedSectionsRef`.
3. Keep user search debounced and server-backed; pagination/page-size reloads must use `appliedUserSearchRef.current`, not an un-applied input value. The provider selectors are separate, searchable client-side views of the one tenant user-options response and must share one selected user.
4. A history-source change follows the same narrow invalidation rule: reload active history with page one and the selected user, not styles/models or a guessed source for legacy null. The API accepts only `general`, `document`, `image-transform`, and special `unknown`; see [resources](../backend/resources.md).
5. The preview list is the loaded history page filtered by `hasImage`; it must not include empty-image records or invent cross-page navigation. URLs are fetched on thumbnail/preview demand through the tenant-scoped endpoint and may be reused from `adminImageCache`.
6. Details are display data from the management-list response. Do not treat optional fields as required; `ImageLightbox` omits empty detail values.
7. Do not add a browser-side storage credential or direct provider request. The authorized admin image endpoints return `{ imageUrl }` and use `Cache-Control: private, max-age=3600`.
8. Keyboard arrows are meaningful only when a predecessor or successor callback exists; Escape must remain a close path.

`AdminPanelSectionLoading.test.jsx` verifies mount-only users loading, once-only section loading, active-section filter reload, mutually isolated/searchable Entra/Google user selectors, debounced user-list keyword forwarding, and history-source label/request forwarding. `AdminHistoryPreview.test.jsx` mocks `adminService` and verifies remote image retrieval, details/download, navigation that skips an image-less record, Escape close, and the noninteractive missing-image state. `ImageLightbox.test.jsx` covers the reusable optional-control and keyboard behavior. `api/admin/__tests__/adminResources.test.js` verifies recognized and legacy source filters plus rejection of an unsupported source. Run the focused browser-and-handler checks:

```sh
pnpm test --run api/admin/__tests__/adminResources.test.js src/components/admin/__tests__/AdminPanelSectionLoading.test.jsx src/components/admin/__tests__/AdminHistoryPreview.test.jsx src/components/common/__tests__/ImageLightbox.test.jsx
```

These are internal UI checks, not proof of the shipped management contract. `api/admin/__tests__/adminResources.test.js` verifies literal-safe user search and provider fields as well as the no-URL list contract, tenant-scoped history/style image responses, cache header, and missing-resource paths. An API response shape, tenant-filter, authorization, or pagination change needs that handler suite as well as the consumer tests. Use the broader `pnpm lint && pnpm build` only when changing route wiring, aliases, shared imports, or production styling.
