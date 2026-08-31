---
type: frontend workflow
title: Creation workspace, document storyboards, and exports
description: React creation composition, storyboard document upload and editing, browser exports, image transformations, and the separate PPT Master studio lifecycle.
tags: [frontend, creation, image-generation, document-analysis, storyboard, export]
openwiki:
  roles: [workflow, frontend]
  change_kinds: [image-generation, document-analysis, client-export, client-progress]
  source_paths: [src/InfographicGenerator.jsx, src/config.js, src/components/create/GenerateBar.jsx, src/components/create/ScriptEditor.jsx, src/components/create/ImageTransformPanel.jsx, src/hooks/useImageGeneration.js, src/hooks/useImageTransform.js, src/components/create/DocumentUploader.jsx, src/components/create/DocumentScenes.jsx, src/components/create/PptMasterStudio.jsx, src/components/create/DeckSetupForm.jsx, src/components/create/DeckSetupSection.jsx, src/components/create/DeckBlueprint.jsx, src/components/create/DeckPreviewStage.jsx, src/components/create/DeckSlideRail.jsx, src/components/create/DeckRecipePicker.jsx, src/components/create/pptRecipeCopy.js, src/components/create/PptTemplatePicker.jsx, src/components/create/templatePreviewManifest.js, src/hooks/useDocumentAnalysis.js, src/hooks/usePptMasterDeck.js, src/services/aiService.js, src/services/storageService.js, src/utils/pptxExport.js]
  symbols: [IMAGE_QUALITY_OPTIONS, DEFAULT_IMAGE_QUALITY, IMAGE_PURPOSE_OPTIONS, GenerateBar, ScriptEditor, ImageTransformPanel, useImageGeneration, useImageTransform, generateImage, transformImage, optimizePrompt, optimizeScene, useDocumentAnalysis, uploadFile, createDocumentAnalysisJob, waitForDocumentAnalysisJob, updateScene, removeScene, DocumentUploader, DocumentScenes, PptMasterStudio, DeckSetupForm, DeckSetupSection, DeckBlueprint, DeckPreviewStage, DeckSlideRail, DeckRecipePicker, DECK_RECIPE_OPTIONS, describeRecipe, PptTemplatePicker, TEMPLATE_PREVIEWS, describeTemplatePreview, usePptMasterDeck, waitForDeckJob, exportToPptx]
  test_paths: [api/_shared/__tests__/imagePrompt.test.js, api/_shared/__tests__/imageTextLanguage.test.js, api/_shared/__tests__/imageJobs.test.js, api/image-transform/__tests__/index.test.js, src/hooks/__tests__/useImageTransform.test.js, src/lib/__tests__/documentFormats.test.js, src/services/__tests__/aiService.test.js, src/components/create/__tests__/GenerateBar.test.jsx, src/components/create/__tests__/ImageGeneratingState.test.jsx, src/hooks/__tests__/usePptMasterDeck.test.jsx, src/components/create/__tests__/PptMasterStudio.test.jsx, src/components/create/__tests__/pptRecipeCopy.test.js, src/components/create/__tests__/templatePreviewManifest.test.js, src/utils/__tests__/pptxExport.test.js]
  invariants: [General generation and transforms share `imageSize` and GPT Image quality state through `GenerateBar`; quality defaults to medium and is serialized for both., A queued GPT transform is polled through the existing image-job endpoint; cancelling the browser wait does not cancel already queued server work., General creation selects infographic storyboard or freeform purpose, while storyboard-scene generation remains fixed to storyboard., Generation sends creative inputs rather than a final prompt and preserves palette tags as an array for server normalization., The persisted image-text language preference is forwarded to generation, transforms, and general-prompt and storyboard-scene optimization as imageLanguage; freeform generation intentionally omits its server-side directive, while missing or unsupported values add no directive., Document analysis produces only storyboard scenes., The hook uploads first and falls back to base64 only for files no larger than 80 KB., Deleting a storyboard scene re-numbers scene_number and updates total_scenes., PPT Master job state is separate from storyboard state and persists its active job ID for resumption., A PPT recipe is a suggestion that pre-fills but never locks slide count image density or an available preferred style., The PPT studio owns one controlled setup object; the idle blueprint and generated preview stage derive from that same object and preview cache., The preview stage follows the highest authored page until an explicit selection, which remains fixed until the user returns to latest., Template previews are optional generated static sample assets; an absent or failed preview falls back to a text card.]
  validation_commands: [pnpm test --run api/_shared/__tests__/imagePrompt.test.js src/services/__tests__/aiService.test.js api/_shared/__tests__/gptImage.test.js api/_shared/__tests__/imageJobs.test.js api/image-transform/__tests__/index.test.js src/hooks/__tests__/useImageTransform.test.js, pnpm test --run api/_shared/__tests__/imageTextLanguage.test.js, pnpm test --run src/lib/__tests__/documentFormats.test.js src/utils/__tests__/pptxExport.test.js, pnpm test --run src/components/create/__tests__/PptMasterStudio.test.jsx src/components/create/__tests__/pptRecipeCopy.test.js src/components/create/__tests__/templatePreviewManifest.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx]
---

# Creation workspace, document storyboards, and exports

`InfographicGenerator.jsx` is the browser composition point for general image creation, document storyboards, image transforms, settings, library, and PPT Master. Shared asset lists compose through [Asset Center](asset-center.md); server model and document contracts are canonical in [AI generation](../backend/ai-generation.md).

The document area has two intentionally independent paths: **Document storyboard** calls `useDocumentAnalysis` and renders `DocumentScenes`; **PPT Master** renders `PptMasterStudio` and owns durable deck-job state. The previous editable company-template presentation path is not a current browser or API surface. Do not introduce `slides`, `slideCount`, or a presentation `mode` into the document-analysis request without restoring a complete server contract, route registration, and consumer workflow.

## General image output settings

`InfographicGenerator` owns one `imageQuality` state value, initialized from `DEFAULT_IMAGE_QUALITY` (`medium`), and passes it to `GenerateBar`, `useImageGeneration`, and `useImageTransform`. `GenerateBar` exposes the `low`/`medium`/`high` control only when the selected configuration has `supportsQuality`—currently `gpt-image-2`. Gemini instead shows its resolution picker; quality is not a resolution alias.

`generateImage` serializes `imageQuality` under the API field name `quality`, but it no longer submits a final `prompt` or a client-selected `model`. It sends `userScript`, optional reusable `stylePrompt`, palette `styleTags` as an array, `purpose`, and `imageLanguage`; the BFF applies tenant model policy and assembles the final prompt. `InfographicGenerator` owns ordinary-creation `imagePurpose`, initialized to `infographic`, and passes it through `ScriptEditor`'s `infographic`, `storyboard`, and `freeform` selector. Storyboard-scene generation remains fixed at `purpose: 'storyboard'`. `freeform` deliberately adds no server composition or language directive, but does not discard explicit style inputs. The other purposes use system defaults only when the content has not already specified framing; their language directive preserves quoted literal text and applies the selected language only to otherwise-unspecified text. The client retains palette selections as an array so the server can normalize/de-duplicate them, while history still records a human-readable joined style string. `useImageGeneration` uses the returned `prompt` as `finalPrompt`; for queued GPT work that prompt arrives with the `202` job response.

The transform workspace reuses the fixed `GenerateBar` below `ImageTransformPanel`, rather than owning a separate output-settings or action control. `InfographicGenerator` therefore supplies the same `imageSize`, `imageQuality`, selected model, aspect-ratio controls, primary action, cancellation, and disabled state to both general generation and transforms. Its `actionKind` selects a semantic `ProductGlyph` for the current action. `ImageGeneratingState` supplies the shared animated `GenerationSignature` for both general output and compact transform progress while retaining screen-reader status text. These presentation components do not alter request inputs, progress values, or cancellation semantics; their animation and reduced-motion boundary is documented in [shared UI motion, theme, and semantic icon styling](design-system.md). `handleTransform` passes `imageSize`, `imageQuality`, and `imageLanguage` into `useImageTransform::runTransform`; that hook forwards all three to `aiService::transformImage`. `ImageTransformPanel` remains responsible for source-image, mode, prompt, style, and result UI, and it forwards `imageLanguage` only when asking the optimizer for a transform suggestion. `useImageTransform` returns the BFF-applied `prompt` when available. For `gpt-image-2`, the transform response is `202` with a job ID: `useImageTransform` preserves the BFF-built prompt, then calls `waitForImageJob` until its owner-scoped terminal result provides `imageUrl`. Gemini stays synchronous and returns its image from the transform request. Cancelling the hook aborts browser waiting only; a queued GPT edit can continue in the worker. Server assembly, validation, mode semantics, and durable-job behavior are canonical in [AI generation](../backend/ai-generation.md); the operation/source migration is in [schema](../data/schema.md).

For a purpose-selector or generation request/response change, edit `InfographicGenerator.jsx`, `ScriptEditor.jsx`, `useImageGeneration.js`, `aiService.js`, `imagePrompt.js`, `generate-images/index.js`, and `api/_shared/__tests__/imagePrompt.test.js` together. For shared output controls, follow `GenerateBar.jsx` through both its general and transform callers; keep `useImageTransform::runTransform` and `aiService::transformImage` aligned when adding a forwarded setting. Include `imageTextLanguage.js` and `imageTextLanguage.test.js` when changing language defaults or quoted-text behavior, and `ImageTransformPanel.jsx` plus `image-transform/index.js` when changing the transform-specific UI, shared language directive, or transform response. `imagePrompt.test.js` proves server prompt composition and `aiService.test.js` proves the browser payload, including `quality`; `useImageTransform.test.js` proves a queued response is polled to its result, while `image-transform/index.test.js` and `imageJobs.test.js` cover the server handoff and worker-time source resolution. These do not replace a status-handler or migration integration test.

```sh
pnpm test --run api/_shared/__tests__/imagePrompt.test.js src/services/__tests__/aiService.test.js api/_shared/__tests__/gptImage.test.js api/_shared/__tests__/imageJobs.test.js api/image-transform/__tests__/index.test.js src/hooks/__tests__/useImageTransform.test.js
```

`GenerateBar.test.jsx` checks that `actionKind` resolves to the semantic glyph and that in-progress rendering switches to the generation signature without hiding progress text. `ImageGeneratingState.test.jsx` checks one decorative signature plus the live loading status, including compact rendering. They are visual/accessibility checks, not request-boundary coverage. There is no focused generation-hook, image-job status-handler, or migration integration test for this request boundary; `useImageTransform.test.js` covers the queued-transform polling branch and `imageJobs.test.js` covers the worker's edit branch. A UI-only change normally does not require a package build; run a consumer-facing API check when changing the JSON field, allowed values, server-returned prompt, or model-dependent visibility.

## Image-text preference and optimization flow

`InfographicGenerator` initializes `imageLanguage` from `localStorage` key `genpic_image_language`, with `DEFAULT_IMAGE_LANGUAGE` as the fallback, and persists a changed value through `handleLanguageChange`. The setting controls text rendered **inside generated images**, not the browser UI language or the language of a user's prompt. It already travels with `generateImage`; it now also travels through both optimization paths so an optimized English prompt does not contradict the final image-generation instruction.

`ScriptEditor::handleOptimize` calls `aiService::optimizePrompt({ userScript, styleContext, imageLanguage })` for the general creation editor. `DocumentScenes::SceneModal` calls `aiService::optimizeScene` with the scene fields, selected style context, and the same `imageLanguage`. `ImageTransformPanel` passes it to its optimization request, while `useImageTransform` passes it to the actual transform. `aiService.js` serializes the optional field to both optimizer endpoints and `/api/image-transform`; generation sends it to `/api/generate-images`. The server-side directive and prompt contract are canonical in [AI generation](../backend/ai-generation.md). Every wrapper or reshaped request must preserve the field.

For a new language ID, a change to quoted-text/default-language behavior, or a change to no-text behavior, update the settings option, default/consumer wiring, `imageTextLanguage.js`, `imagePrompt.js`, generation and transform paths, both optimizer request paths, and focused tests together. The helper accepts only `en`, `zh-TW`, `zh-CN`, `ja`, `ko`, `es`, `fr`, `de`, and `none`; absent or unsupported values intentionally produce no extra directive. For a recognized language, quoted literal text stays exactly as authored and only otherwise-unspecified image text follows the selected language; `none` instead prohibits all rendered text. This is a generation default, not a promise that a `freeform` generation will receive a language directive. `api/_shared/__tests__/imageTextLanguage.test.js` verifies an optimizer directive, image-model quoted-text/default-language behavior, generation `none`, and absent/unsupported values. There is no focused browser-propagation or optimizer-handler test, and `aiService.test.js` does not assert either optimization payload.

```sh
pnpm test --run api/_shared/__tests__/imageTextLanguage.test.js
```

## Document upload and storyboard analysis

`DocumentUploader` accepts one supported file, permits a 1–10 or `auto` scene count, and has a 50 MB browser limit. It uses `src/lib/documentFormats.js` for the accept attribute, extension validation, and MIME fallback. The allowed set is PDF; Word, PowerPoint, and Excel variants; OpenDocument; RTF; EPUB; CSV; TXT/Markdown; and PNG/JPEG. It does not accept a pasted outline mode.

```mermaid
sequenceDiagram
  participant Workspace
  participant Hook as useDocumentAnalysis
  participant Blob as Azure Blob Storage
  participant Handler as analyze-document
  participant View as DocumentScenes
  Workspace->>Hook: file and sceneCount
  Hook->>Blob: create, PUT, and complete owner-scoped upload
  alt upload succeeds
    Hook->>Handler: create analysis job with uploadId
    loop poll up to twenty minutes
      Hook->>Handler: get analysis job
    end
    Handler-->>Hook: succeeded result or terminal error
  else file is no larger than 80 KB
    Hook->>Handler: base64 document and sceneCount
    Handler-->>Hook: storyboard scenes and style
  end
  Hook->>View: commit matching result
```

This diagram covers client transport only; server-owned upload authorization is canonical in [Owner-scoped uploads and staged Blob storage](../backend/uploads.md), while parsing, model selection, normalization, and the durable queue are in [AI generation](../backend/ai-generation.md).

`useDocumentAnalysis` uses `storageService::uploadFile` first: create the record, direct-PUT the fixed staging URL, and complete promotion before it calls `aiService::analyzeDocument`. With an `uploadId`, that adapter creates a document job and polls it every two seconds for up to twenty minutes; it returns the persisted `result` only after `succeeded`, and propagates terminal job errors. After an upload failure it sends base64 only for files at most 80 KB to the synchronous fallback. It commits state only when `result.scenes` is nonempty. `AnalysisProgress` is elapsed-time/coarse-phase feedback capped below completion; it is not queue telemetry. `clearDocument` clears the local result, selected-file metadata, phase, and error.

For browser format, upload, or request-shape work, update `documentFormats.js`, `DocumentUploader.jsx`, `useDocumentAnalysis.js`, `storageService.js`, and `aiService.js` together, then align the server pages linked above. Do not send a document URL, SAS token, container, or filename as a trusted analysis source once an upload ID exists. `documentFormats.test.js` covers extension acceptance/MIME fallback; `storageService.test.js` covers browser grant validation and the create-PUT-complete flow; `aiService.test.js` covers document-job serialization/polling.

```sh
pnpm test --run src/lib/__tests__/documentFormats.test.js src/services/__tests__/storageService.test.js src/services/__tests__/aiService.test.js src/hooks/__tests__/useDocumentAnalysis.test.js
```

## Storyboard editing and browser exports

Storyboard responses contain scenes plus a required AI-recommended style. `DocumentScenes` uses the recommendation by default; applying a saved style creates a local `documentStyleOverride`, and clearing/replacing the document clears that override. Scene generation uses the selected prompt as `analyzedStyle`, saves output to history, and marks a saved style as used only for an explicit override.

`useDocumentAnalysis::updateScene` merges edits by index. `removeScene` removes an item, reassigns `scene_number` in display order, and synchronizes `total_scenes`. These are local draft changes. Keep the scene contract separate from the server's normalization boundary: users can edit data after it was normalized.

`DocumentScenes::exportToPptx()` passes valid object scenes to `src/utils/pptxExport.js`. The browser dynamically loads `pptxgenjs`, fetches/base64-embeds available images, and downloads a 16:9 deck. PDF is also browser output. Valid native table/chart data takes precedence over a generated image or placeholder. The pure exporter retains image-less valid scenes once an export action is available.

`getPptxTables` and `getPptxCharts` re-normalize editable data: one table/chart, eight table columns, ten rows, twelve chart labels, and four series. `pptxExport.test.js` covers valid scene selection, image-less scenes, bullet fallback, filename sanitization, table limits, and chart aliases/numbers.

```sh
pnpm test --run src/utils/__tests__/pptxExport.test.js
```

## PPT Master design-deck workflow

`PptMasterStudio` is an asynchronous topic-or-document deck generator, distinct from the document storyboard. It accepts a topic of at least four characters or an optional supported file, limits a file to 50 MB, selects sidecar-provided style/layout plus `none`, `key`, or `every` image density, and allows 4–20 slides. The selected file uploads to `uploads`; `usePptMasterDeck::generate` creates the durable job.

The studio keeps these inputs in one `setup` object. `DeckSetupForm` is its controlled editor, organized as collapsible content, specification, and visual-design sections; it emits field patches and contains the recipe prefill rule. Before generation, `DeckBlueprint` derives its title, setup digest, and optional selected-style samples from that object. This keeps the preflight summary and submitted job input aligned without giving the blueprint its own state. Once a job is generating or ready, `DeckSetupSummary` collapses the form but can reopen it for inspection; it does not alter an already submitted job.

```mermaid
sequenceDiagram
  participant Studio as PptMasterStudio
  participant Hook as usePptMasterDeck
  participant Store as localStorage
  participant Blob as Azure Blob Storage
  participant Api as Deck job API
  Studio->>Hook: topic or file and template choices
  opt file selected
    Hook->>Blob: upload source document
  end
  Hook->>Api: create deck job
  Hook->>Store: persist job ID
  loop every four seconds up to forty minutes
    Hook->>Api: get deck job
    Api-->>Hook: phase progress and events
  end
  Hook->>Api: download successful PPTX
```

This sequence shows the PPT Master browser lifecycle from setup through server-owned job completion.

`DeckRecipePicker` appears before the normal topic/template settings. It selects `general` or a purpose-driven recipe and applies only local suggestions for slide count, image density, and a preferred style that is actually present in the fetched catalog; users may change all three afterwards. `PptMasterStudio` also collects optional purpose, audience, and intended-outcome fields, each capped at 200 characters to match the handler. `usePptMasterDeck::generate` -> `aiService::createDeckJob` forwards `recipeId` and the three brief fields alongside the existing job input. The recipe controls narrative structure; style/layout controls visual intent. Server normalization, persistence, design-system generation, and enforced spine behavior are canonical in [PPT Master deck jobs](../backend/ppt-master-decks.md).

`PptTemplatePicker` remains a text-first selector. `DeckBlueprint` is now the sole pre-generation display for static SVG samples from `templatePreviewManifest.js`; it shows the selected style's samples alongside the setup digest. A template with no manifest entry, or an image that fails to load, still renders as a selectable text card or an empty blueprint state. Samples demonstrate color, type, and decorative vocabulary—not deterministic page geometry—because production pages are independently authored. The manifest and `public/template-previews/styles/` SVG pairs are generated browser assets: `node api/scripts/generate-style-previews.cjs` is their producer, and it must be rerun after a PPT Master version, design-system, or frame change. Their generation pipeline is described in [PPT Master deck jobs](../backend/ppt-master-decks.md); the API registry is documented in [HTTP API](../backend/http-api.md).

The hook stores the active job under `genpic_deck_job`. On mount, queued/processing jobs resume polling; succeeded jobs restore the download state; a missing job clears the ID without an error; a terminal failure clears it with the server message. `waitForDeckJob` polls every four seconds for up to forty minutes, propagates `AbortError`, `AuthExpiredError`, and `404` immediately, retries other poll errors until five consecutive failures, and retains the ID after transient failure. `stopWatching` stops local browser I/O and removes continuation state; it does not cancel server work.

Previews are keyed by slide revision. `usePptMasterDeck` fetches each needed SVG once, exposes an object URL, refetches after a revision changes, revokes replaced/reset/unmounted URLs, and treats preview failure as non-fatal to job lifecycle. `DeckPreviewStage` composes the large current-page image with `DeckSlideRail`. With no explicit selection, `PptMasterStudio` passes the highest authored preview as the stage page, so the stage follows progress. Selecting a rail item or previous/next navigation pins that page; `回到最新` clears the selection and resumes following. The rail remains a sandboxed `<img>` representation of the server-authored SVG and provides placeholders for planned but not-yet-authored pages. `DeckProgress` and `DeckTimeline` consume the append-only server event trace; `buildTimeline` sorts events by ID and keeps the newest state per step and per slide.

For studio composition, setup forwarding, blueprint samples, polling, event, or preview changes, start with `PptMasterStudio.jsx`, `DeckSetupForm.jsx`, `DeckSetupSection.jsx`, `DeckBlueprint.jsx`, `DeckPreviewStage.jsx`, `DeckSlideRail.jsx`, `DeckRecipePicker.jsx`, `pptRecipeCopy.js`, `PptTemplatePicker.jsx`, `templatePreviewManifest.js`, `usePptMasterDeck.js`, `DeckProgress.jsx`, `DeckTimeline.jsx`, `deckSteps.js`, and `aiService.js`, then follow the durable job seam in [PPT Master deck jobs](../backend/ppt-master-decks.md). Do not hand-edit `templatePreviewManifest.js` or files under `public/template-previews/styles/`; regenerate them from the canonical script when a source-backed preview change is required. `PptMasterStudio.test.jsx` covers idle blueprint and disabled submission, setup collapse, planned-page placeholders, latest-page following, manual pinning and return to latest, image-density forwarding, recipe prefill/available-style behavior, and structured-brief forwarding. `pptRecipeCopy.test.js` ensures frontend options and defaults match backend recipe IDs and accepted slide range; `templatePreviewManifest.test.js` verifies declared files exist and missing entries return an empty list. `usePptMasterDeck.test.jsx` covers resumption, missing/failed jobs, transient failure, stop tracking, preview revision caching, URL release, and non-fatal preview failure. These are not handler, Blob, worker, or authorization tests.

```sh
pnpm test --run src/components/create/__tests__/PptMasterStudio.test.jsx src/components/create/__tests__/pptRecipeCopy.test.js src/components/create/__tests__/templatePreviewManifest.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx src/services/__tests__/aiService.test.js
```

## Change navigation

Consult this page for React composition, document upload/fallback, storyboard state, browser exports, or the PPT Master browser lifecycle. Start with `InfographicGenerator.jsx` to identify the active path. Use [AI generation](../backend/ai-generation.md) for document/model/provider changes, [PPT Master deck jobs](../backend/ppt-master-decks.md) for deck worker or contract changes, [HTTP API](../backend/http-api.md) for public route/OpenAPI changes, and [operations](../operations/development-deployment.md) only for configuration or deployment work.
