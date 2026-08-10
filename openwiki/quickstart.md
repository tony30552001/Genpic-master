---
type: repository guide
title: Pixora code wiki quickstart
description: Navigation and change routing for the Pixora React, API, AI, persistence, and deployment systems.
tags: [quickstart, navigation]
openwiki:
  roles: [repository, workflow]
  change_kinds: [change-routing]
---

# Pixora code wiki quickstart

Pixora is a React/Vite image and presentation creation application with a Node API, PostgreSQL tenant data, Azure Blob assets, Gemini/Azure AI providers, and optional LINE bot sharing. This wiki explains the browser, server, data, and operational ownership boundaries—not a replacement for source or provider setup guides. Start with [architecture](architecture/overview.md), then use the router below.

## Change router

| Change area or user intent | Relevant wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation command |
|---|---|---|---|---|---|
| Login, redirect return, Microsoft token renewal, or API-token retry | [browser application and authentication](frontend/application.md) | `src/main.jsx`, `src/context/AuthContext.jsx`, `src/services/authService.js`, `src/services/msalClient.js`, `src/services/apiClient.js` | `AuthProvider`, `acquireAccessToken`, `acquireMicrosoftTokenSilently`, `msalConfig`, `requestWithRetry` | `src/services/__tests__/authService.test.js`; add `apiClient.test.js` for headers or 401 retry | `pnpm test -- --run src/services/__tests__/authService.test.js` |
| Creation UI, scenes, transforms, exports, or generation progress | [creation workflows](frontend/create-workflows.md) | `src/InfographicGenerator.jsx`, creation components and hooks | `InfographicGenerator`, generation hooks | `src/utils/__tests__/pptxExport.test.js`, `src/utils/__tests__/generationProgress.test.js` | `pnpm test -- --run src/utils/__tests__/pptxExport.test.js` |
| Configured direct browser GPT Image calls | [direct GPT Image](frontend/direct-gpt-image.md) | `src/services/gptImageService.js`, `src/config.js` | `generateImageGpt`, `editImageGpt` | `src/services/__tests__/gptImageService.test.js` | `pnpm test -- --run src/services/__tests__/gptImageService.test.js` |
| API route, handler adaptation, CORS, response contract, or interactive reference | [HTTP API](backend/http-api.md) | `api/server.js`, `api/openapi.js`, owning endpoint handler, `api/_shared/http.js` | `invokeFunction`, `registerRoutes`, `addOperation`, `operation` | handler-specific tests where present | `cd api && node --check server.js && node --check openapi.js` |
| Model/provider selection, generation, or durable GPT image job | [AI generation](backend/ai-generation.md) | `api/generate-images`, `api/_shared/imageJobs.js`, `src/services/aiService.js` | `generateImage`, `waitForImageJob`, job-state helpers | `src/services/__tests__/aiService.test.js` | `pnpm test -- --run src/services/__tests__/aiService.test.js` |
| Styles, history, templates, uploads, Blob assets, or LINE | [resources](backend/resources.md) | owning `api/` resource handler, `src/services/storageService.js` | `requestBlobSas`, `storageService` exports | `src/services/__tests__/storageService.test.js` | `pnpm test -- --run src/services/__tests__/storageService.test.js` |
| Token verification, tenant identity, roles, or admin model policy | [authentication, tenancy, and administration](backend/auth-tenancy-admin.md) | `api/_shared/auth.js`, `api/_shared/identity.js`, admin handlers | `requireAuth`, `resolveIdentity`, `requireAdmin` | `api/_shared/__tests__/auth.test.js` | `pnpm test -- --run api/_shared/__tests__/auth.test.js` |
| Tables, tenant constraints, or migrations | [schema](data/schema.md) | `db/migrations`, query-owning handlers | migration SQL and resource owner predicates | migration-specific checks if added | `cd api && npm run migrate` against a disposable database |
| Local configuration, deployment, Entra registration, or API process startup | [development, migrations, and deployment](operations/development-deployment.md) | root `package.json`, `api/package.json`, `vite.config.js`, deployment workflow | `VITE_MSAL_REDIRECT_URI`, API `start` script | focused application test for the changed surface | `pnpm lint && pnpm build` |

The API routes, server-side identity, AI jobs, and resource ownership are cross-system concerns summarized in [architecture](architecture/overview.md). Browser-only direct GPT calls are a separate configured surface documented in [direct GPT Image](frontend/direct-gpt-image.md), not the normal server-owned generation path.

## Main concepts

- **Browser runtime:** [browser application and authentication](frontend/application.md) owns React startup, routes, provider state, and the authenticated request client; it dispatches server identity checks to [authentication, tenancy, and administration](backend/auth-tenancy-admin.md).
- **Creation experience:** [creation workflows](frontend/create-workflows.md) owns document editing, transforms, and browser-produced exports, while [AI generation](backend/ai-generation.md) owns server provider calls and job state.
- **Tenant identity and policy:** persisted user resolution makes resource access tenant-scoped; administrators select the tenant default model, and browser requests cannot choose around it.
- **Assets and resources:** [resources](backend/resources.md) distinguishes direct SAS upload from generated-job Blob output; [schema](data/schema.md) is canonical for durable constraints and migration order.
- **Operations:** [development, migrations, and deployment](operations/development-deployment.md) covers local commands, non-secret configuration categories, deployment boundaries, and Entra session constraints.

## Backlog / evidence limitations

- No dedicated API handler tests were found for jobs, resource APIs, LINE, or migrations; existing frontend service/unit tests cover selected contracts only.
- LIFF is present as a dependency/configuration concept but has no source consumer or fallback runtime path; LINE sharing currently requires a configured bot binding.

Use `pnpm lint && pnpm test && pnpm build` as the compact frontend baseline. Follow [development, migrations, and deployment](operations/development-deployment.md) for API and migration work.