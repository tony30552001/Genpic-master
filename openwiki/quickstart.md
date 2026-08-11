---
type: repository guide
title: Pixora code wiki quickstart
description: Navigation and change routing for the Pixora React, BFF API, session, persistence, AI, and deployment systems.
tags: [quickstart, navigation]
openwiki:
  roles: [repository, workflow]
  change_kinds: [change-routing]
---

# Pixora code wiki quickstart

Pixora is a React/Vite image and presentation creation application with a Node BFF API, PostgreSQL tenant data and sessions, Azure Blob assets, Gemini/Azure AI providers, and optional LINE bot sharing. This wiki explains browser, server, data, and operational ownership boundaries—not a replacement for source or provider setup guides. Start with [architecture](architecture/overview.md), then use the router below.

## Change router

| Change area or user intent | Relevant wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation command |
|---|---|---|---|---|---|
| Login, Entra callback, Google credential exchange, cookies, CSRF, logout, or expiry | [server sessions](backend/sessions.md) | `api/auth/index.js`, `api/_shared/session.js`, `api/_shared/entra.js`, `api/_shared/auth.js` | `createSession`, `requireAuth`, `redeemEntraAuthorizationCode` | `api/_shared/__tests__/auth.test.js`, `session.test.js` | `pnpm test --run api/_shared/__tests__/auth.test.js api/_shared/__tests__/session.test.js` |
| Browser sign-in UI, session bootstrap, request credentials, CSRF header, or 401 recovery | [browser application](frontend/application.md) | `src/context/AuthContext.jsx`, `src/services/authService.js`, `src/services/apiClient.js` | `AuthProvider`, `getAuthSession`, `requestWithRetry` | `src/context/__tests__/AuthContext.test.jsx`, `authService.test.js`, `apiClient.test.js` | `pnpm test --run src/context/__tests__/AuthContext.test.jsx src/services/__tests__/authService.test.js src/services/__tests__/apiClient.test.js` |
| Creation UI, document scenes, document-style selection, transforms, exports, or generation progress | [creation workflows](frontend/create-workflows.md) | `src/InfographicGenerator.jsx`, `src/components/create/DocumentUploader.jsx`, `src/components/create/DocumentScenes.jsx`, `src/components/create/ImagePreview.jsx`, `src/components/create/ImageGeneratingState.jsx` | `handleGenerateScene`, `AnalysisProgress`, `ImageGeneratingState`, `exportToPptx` | `src/services/__tests__/aiService.test.js`, `src/utils/__tests__/pptxExport.test.js`; no focused generating-state component test | `pnpm exec eslint src/components/create/ImagePreview.jsx src/components/create/DocumentScenes.jsx src/components/create/ImageGeneratingState.jsx` |
| `/library` routing, unified templates/styles/history browsing, section-specific search, or template/style metadata editing | [Asset Center](frontend/asset-center.md) | `src/App.jsx`, `src/pages/LibraryPage.jsx`, `src/InfographicGenerator.jsx`, `src/components/library/AssetCenter.jsx`, `src/components/library/AssetMetadataSheet.jsx` | `LibraryPage`, `AssetCenter`, `AssetMetadataSheet`, `handleSaveMetadata` | `src/services/__tests__/storageService.test.js` covers only style PUT; no focused Asset Center or template-update test | `pnpm test --run src/services/__tests__/storageService.test.js` |
| Document upload formats, browser MIME fallback, document conversion, required AI-recommended style, or document-analysis provider input | [creation workflows](frontend/create-workflows.md) and [AI generation](backend/ai-generation.md) | `src/lib/documentFormats.js`, `src/hooks/useDocumentAnalysis.js`, `api/_shared/documentParser.js`, `api/analyze-document/index.js`, `api/_shared/azureOpenAI.js` | `isSupportedDocumentFile`, `normalizeRecommendedStyle`, `parseDocumentBuffer`, `generateJsonCompletion` | `src/lib/__tests__/documentFormats.test.js`, `src/services/__tests__/aiService.test.js`, `api/_shared/__tests__/documentParser.test.js`, `api/_shared/__tests__/azureOpenAI.test.js` | `pnpm test --run src/lib/__tests__/documentFormats.test.js src/services/__tests__/aiService.test.js api/_shared/__tests__/documentParser.test.js api/_shared/__tests__/azureOpenAI.test.js` |
| API route, handler adaptation, CORS, response contract, or interactive reference | [HTTP API](backend/http-api.md) | `api/server.js`, `api/openapi.js`, owning endpoint handler, `api/_shared/http.js` | `invokeFunction`, `registerRoutes`, `addOperation`, `operation` | handler-specific tests where present | `cd api && node --check server.js && node --check openapi.js` |
| Model/provider selection, generation, document analysis, or durable GPT image job | [AI generation](backend/ai-generation.md) | `api/generate-images`, `api/analyze-document/index.js`, `api/_shared/azureOpenAI.js`, `api/_shared/imageJobs.js`, `src/services/aiService.js` | `generateImage`, `generateJsonCompletion`, `waitForImageJob`, job-state helpers | `api/_shared/__tests__/azureOpenAI.test.js`, `src/services/__tests__/aiService.test.js` | `pnpm test --run api/_shared/__tests__/azureOpenAI.test.js` |
| Styles, history, templates, uploads, Blob assets, or LINE | [resources](backend/resources.md) | owning `api/` resource handler, `api/blob-sas/index.js`, `src/services/storageService.js` | `requestBlobSas`, `SUPPORTED_MIME_TYPES`, `storageService` exports | `src/services/__tests__/storageService.test.js`, `api/_shared/__tests__/documentParser.test.js` | `pnpm test --run src/services/__tests__/storageService.test.js api/_shared/__tests__/documentParser.test.js` |
| Tenant identity, roles, admin policy, or `/api/me` | [authentication and administration](backend/auth-tenancy-admin.md) | `api/_shared/auth.js`, `api/_shared/identity.js`, admin handlers | `requireAuth`, `resolveIdentity`, `requireAdmin` | `api/_shared/__tests__/auth.test.js` | `pnpm test --run api/_shared/__tests__/auth.test.js` |
| Tables, tenant constraints, session storage, or migrations | [schema](data/schema.md) | `db/migrations`, `api/_shared/session.js`, query-owning handlers | migration SQL, `auth_sessions` | session tests or migration-specific checks | `cd api && npm run migrate` against a disposable database |
| Local configuration, deployment, Entra registration, CORS, or API process startup | [development, migrations, and deployment](operations/development-deployment.md) | root `package.json`, `api/package.json`, `api/_shared/http.js`, deployment workflow | `ENTRA_REDIRECT_URI`, `AUTH_SESSION_SECRET`, `CORS_ALLOW_ORIGIN` | focused application test for changed surface | `pnpm lint && pnpm build` |

The BFF session, tenant identity, API routes, AI jobs, and resource ownership are cross-system concerns summarized in [architecture](architecture/overview.md). Browser-side provider token and direct GPT Image clients are not current runtime surfaces.

## Main concepts

- **Browser runtime:** [browser application and authentication](frontend/application.md) owns React startup, routes, UI session state, and credentialed API requests; it bootstraps from [server sessions](backend/sessions.md).
- **BFF authentication:** [server sessions](backend/sessions.md) exchanges provider identity for opaque cookies and protects unsafe API requests with CSRF; [authentication and administration](backend/auth-tenancy-admin.md) resolves that session to persisted tenant policy.
- **Creation experience:** [creation workflows](frontend/create-workflows.md) owns document editing, transforms, and browser-produced exports; [Asset Center](frontend/asset-center.md) separately owns template, saved-style, and generation-history management, while [AI generation](backend/ai-generation.md) owns server provider calls and job state.
- **Assets and resources:** [Asset Center](frontend/asset-center.md) composes the browser-facing template/style/history views; [resources](backend/resources.md) distinguishes direct SAS upload from generated-job Blob output and owns their API contracts; [schema](data/schema.md) is canonical for durable constraints and migration order.
- **Operations:** [development, migrations, and deployment](operations/development-deployment.md) covers local commands, non-secret configuration categories, BFF deployment boundaries, and Entra callback constraints.

## Backlog / evidence limitations

- No dedicated API handler tests were found for document-analysis normalization, jobs, resource APIs, LINE, or migrations; existing frontend service/unit tests cover selected contracts only.
- `AssetMetadataSheet` has no component test, and `api/templates/index.js` replacement-style PUT is not covered by a handler test. The Asset Center currently retains template replacement fields in its metadata-edit payload; add coverage for that preservation contract; see [Asset Center](frontend/asset-center.md) and [resources](backend/resources.md).
- LIFF is present as a dependency/configuration concept but has no source consumer or fallback runtime path; LINE sharing currently requires a configured bot binding.

Use `pnpm lint && pnpm test && pnpm build` as the compact frontend baseline only when broad frontend validation is warranted. Follow [development, migrations, and deployment](operations/development-deployment.md) for API and migration work.
