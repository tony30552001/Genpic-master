---
type: frontend workflow
title: Creation workspace, document storyboards, and exports
description: React creation composition with optional purpose-routed image attachments, shared image job lifecycle and style controls, storyboard document editing, browser exports, and the separate PPT Master studio.
tags: [frontend, creation, image-generation, image-text, prompt-guidance, document-analysis, storyboard, export]
openwiki:
  roles: [workflow, frontend]
  change_kinds: [image-generation, image-transform, attachments, image-text, prompt-guidance, document-analysis, client-export, client-progress]
  source_paths: [src/InfographicGenerator.jsx, src/lib/imageModel.js, src/lib/imageJob.js, src/lib/attachmentPurposes.js, src/lib/imageFile.js, src/config.js, src/lib/imageTextLanguage.js, src/lib/promptHints.js, src/components/create/AttachmentPicker.jsx, src/components/create/GenerateBar.jsx, src/components/create/PromptHints.jsx, src/components/create/ImageGeneratingState.jsx, src/components/create/ImagePreview.jsx, src/lib/imageOutput.js, src/index.css, src/components/create/ScriptEditor.jsx, src/components/settings/SettingsPanel.jsx, src/hooks/useCreateWorkspace.js, src/hooks/useImageGeneration.js, src/components/create/DocumentUploader.jsx, src/components/create/DocumentScenes.jsx, src/components/create/PptMasterStudio.jsx, src/components/create/DeckSetupForm.jsx, src/components/create/DeckSetupSection.jsx, src/components/create/DeckBlueprint.jsx, src/components/create/DeckPreviewStage.jsx, src/components/create/DeckSlideRail.jsx, src/components/create/DeckRecipePicker.jsx, src/components/create/pptRecipeCopy.js, src/components/create/PptTemplatePicker.jsx, src/components/create/templatePreviewManifest.js, src/hooks/useDocumentAnalysis.js, src/hooks/usePptMasterDeck.js, src/services/aiService.js, src/services/storageService.js, src/utils/pptxExport.js, api/_shared/imagePrompt.js, api/_shared/imagePromptStrategy.js]
  symbols: [ATTACHMENT_PURPOSES, PRIMARY_ATTACHMENT_PURPOSES, getAttachmentPurpose, nearestAspectRatio, AttachmentPicker, useCreateWorkspace, getImageModelSetupError, getImageQualityError, requireImageJobId, requireImageJobAdmission, requireImageJob, requireCompletedImageJob, LANGUAGE_OPTIONS, NO_TEXT_LANGUAGE, getLanguageOption, getImageTextModeLabel, detectNoTextIntent, GenerateBar, TextModeControl, PromptHints, ImageGeneratingState, ImagePreview, getImageOutputLabel, image-generation-drift, image-generation-breathe, ScriptEditor, SettingsPanel, useImageGeneration, generateImage, transformImage, optimizePrompt, optimizeScene, useDocumentAnalysis, uploadFile, createDocumentAnalysisJob, waitForDocumentAnalysisJob, updateScene, removeScene, DocumentUploader, DocumentScenes, SceneModal, ImageLightbox, AnimatePresence, OVERLAY_ENTER, OVERLAY_EXIT, PptMasterStudio, DeckSetupForm, DeckSetupSection, DeckBlueprint, DeckPreviewStage, DeckSlideRail, DeckRecipePicker, DECK_RECIPE_OPTIONS, describeRecipe, PptTemplatePicker, TEMPLATE_PREVIEWS, describeTemplatePreview, usePptMasterDeck, waitForDeckJob, exportToPptx]
  test_paths: [api/_shared/__tests__/imagePrompt.test.js, api/_shared/__tests__/imagePromptStrategy.test.js, api/_shared/__tests__/imageTextLanguage.test.js, api/_shared/__tests__/imageJobs.test.js, api/_shared/__tests__/imageCatalog.integration.test.js, api/generate-images/__tests__/index.test.js, api/image-jobs/__tests__/index.test.js, api/history/__tests__/index.test.js, api/image-transform/__tests__/index.test.js, src/__tests__/InfographicGenerator.test.jsx, src/hooks/__tests__/useCreateWorkspace.test.js, src/hooks/__tests__/useImageGeneration.test.js, src/lib/__tests__/imageFile.test.js, src/lib/__tests__/historySource.test.js, src/lib/__tests__/promptHints.test.js, src/lib/__tests__/documentFormats.test.js, src/lib/__tests__/imageOutput.test.js, src/services/__tests__/aiService.test.js, src/components/create/__tests__/AttachmentPicker.test.jsx, src/components/create/__tests__/GenerateBar.test.jsx, src/components/create/__tests__/ScriptEditor.test.jsx, src/components/create/__tests__/ImageGeneratingState.test.jsx, src/components/create/__tests__/ImagePreview.test.jsx, src/components/settings/__tests__/SettingsPanel.test.jsx, src/hooks/__tests__/usePptMasterDeck.test.jsx, src/components/create/__tests__/PptMasterStudio.test.jsx, src/components/create/__tests__/pptRecipeCopy.test.js, src/components/create/__tests__/templatePreviewManifest.test.js, src/utils/__tests__/pptxExport.test.js]
  invariants: [An optional attachment defaults to reference generation; refine bg_replace element_extract and style_transfer dispatch to image-transform while retaining the attachment upload ID., Transform purposes lock output to the nearest supported source aspect ratio; removing the attachment resets the purpose to reference and restores ordinary generation., Refine requires a prompt and ignores saved or palette style; background replacement element extraction and style transfer may run without a prompt and retain style context., The content attachment and the separately uploaded style reference are independent; a style reference never becomes referenceUploadId., Generation and transforms share catalog-derived quality image-language progress cancellation and preview state through GenerateBar and useImageGeneration., A queued image job is polled through the existing image-job endpoint; admission and terminal responses must preserve the same job ID model and operation, and cancelling the browser wait does not cancel already queued server work., General creation selects infographic storyboard or freeform purpose, while storyboard-scene generation remains fixed to storyboard., The persisted image-text language preference is forwarded to generation transforms and optimizer calls., Document analysis produces only storyboard scenes., The hook uploads first and falls back to base64 only for files no larger than 80 KB., Deleting a storyboard scene re-numbers scene_number and updates total_scenes., DocumentScenes retains SceneModal and its private zoom lightbox in separate AnimatePresence boundaries so their Motion exits complete without changing their existing interaction contracts., PPT Master job state is separate from storyboard state and persists its active job ID for resumption; the studio's decorative GenerationSignature maps local isGenerating/deck state to working/success/idle without changing job state., A PPT recipe is a suggestion that pre-fills but never locks slide count image density or an available preferred style., The PPT studio owns one controlled setup object; the idle blueprint and generated preview stage derive from that same object and preview cache., The preview stage follows the highest authored page until an explicit selection, which remains fixed until the user returns to latest., Template previews are optional generated static sample assets; an absent or failed preview falls back to a text card.]
  validation_commands: [pnpm test --run src/hooks/__tests__/useCreateWorkspace.test.js src/components/create/__tests__/AttachmentPicker.test.jsx src/components/create/__tests__/ScriptEditor.test.jsx src/components/create/__tests__/GenerateBar.test.jsx src/__tests__/InfographicGenerator.test.jsx src/hooks/__tests__/useImageGeneration.test.js src/lib/__tests__/imageFile.test.js, pnpm test --run api/_shared/__tests__/imagePromptStrategy.test.js api/_shared/__tests__/imagePrompt.test.js api/_shared/__tests__/imageTextLanguage.test.js api/image-transform/__tests__/index.test.js, "pnpm test --run api/_shared/__tests__/imageCatalog.integration.test.js (conditional: requires TEST_DATABASE_URL and an approved disposable PostgreSQL database)", pnpm test --run src/lib/__tests__/documentFormats.test.js src/utils/__tests__/pptxExport.test.js, pnpm test --run src/components/create/__tests__/PptMasterStudio.test.jsx src/components/create/__tests__/pptRecipeCopy.test.js src/components/create/__tests__/templatePreviewManifest.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx]
---

# Creation workspace, document storyboards, and exports

`InfographicGenerator.jsx` is the browser composition point for the unified creation workspace, document storyboards, settings, library, and PPT Master. Image transforms are no longer a tab: an optional attachment and its purpose route the same creation form to generation or editing. Shared asset lists compose through [Asset Center](asset-center.md); server model, prompt, and document contracts are canonical in [AI generation](../backend/ai-generation.md).

The document area has two intentionally independent paths: **Document storyboard** calls `useDocumentAnalysis` and renders `DocumentScenes`; **PPT Master** renders `PptMasterStudio` and owns durable deck-job state. The previous editable company-template presentation path is not a current browser or API surface. Do not introduce `slides`, `slideCount`, or a presentation `mode` into the document-analysis request without restoring a complete server contract, route registration, and consumer workflow.

## General image output settings

`InfographicGenerator` derives its active image-model configuration from the authenticated public profile: it finds `modelPolicy.defaultModel` in `imageModels`, initializes quality from that model's `defaultQuality`, and blocks generation or editing for a missing catalog/default or a quality no longer supported by that model. `GenerateBar` renders only the selected model's configured quality options; quality remains rendering effort, not resolution. The unified general workspace and active storyboard expose Traditional Chinese and no-text as direct `aria-pressed` choices plus a select for the other supported text languages, and the model/size summary includes the active text mode. Transform purposes keep this same language state. The browser has no renderer/model picker: policy selection remains server-owned. Its `profileError` is also a configuration error rather than a reason to guess a model.

`generateImage` serializes `imageQuality` under the API field name `quality`, but it no longer submits a final `prompt` or a client-selected `model`. It sends `userScript`, optional reusable `stylePrompt`, palette `styleTags` as an array, `purpose`, `imageLanguage`, and aspect ratio; the BFF applies tenant model policy and assembles the final labeled prompt. `InfographicGenerator` owns ordinary-creation `imagePurpose`, initialized to `infographic`, and passes it through `ScriptEditor`'s `infographic`, `storyboard`, and `freeform` selector. Storyboard-scene generation remains fixed at `purpose: 'storyboard'`. `freeform` omits only deliverable-specific composition defaults; explicit canvas, style, reference, and text settings still reach the server. The other purposes add system composition only when content has not already specified framing. The client retains palette selections as an array so the server can normalize/de-duplicate them, while history still records a human-readable joined style string. `useImageGeneration` uses the returned `prompt` as `finalPrompt`; for queued GPT work that prompt arrives with the `202` job response.

## Optional attachment and transform-purpose routing

`AttachmentPicker` adds one optional image to the ordinary creation form. It accepts an uploaded image or re-uploads the current generated result through the owner-scoped lifecycle documented in [uploads](../backend/uploads.md). `useCreateWorkspace` stores the ready `uploadId`, preview, origin, filename, and `nearestAspectRatio` result. Files over 10 MB are rejected before upload. Clearing the attachment also resets its purpose to `reference`, preventing a hidden transform mode from surviving into a later plain request.

`src/lib/attachmentPurposes.js` is the routing catalog:

| Purpose | Endpoint path | Prompt required | Style context | Aspect ratio | History source |
|---|---|---:|---|---|---|
| `reference` | `generate-images` with `referenceUploadId` | yes | applied | user-selected | `general` |
| `refine` | `image-transform` | yes | ignored | nearest source ratio | `refine` |
| `bg_replace` | `image-transform` | no | applied | nearest source ratio | `bg_replace` |
| `element_extract` | `image-transform` | no | applied | nearest source ratio | `element_extract` |
| `style_transfer` | `image-transform` | no | applied | nearest source ratio | `style_transfer` |

`reference`, `refine`, `bg_replace`, and `element_extract` are shown beside the attachment. `style_transfer` is intentionally selected from the collapsible **Advanced: style** section, where it can be understood together with the chosen style. `ScriptEditor` changes its field label, placeholder, optimizer mode, and action copy from the active catalog entry; it hides the infographic/storyboard/freeform selector for transforms. `refine` deliberately clears style prompt, tags, and style ID before dispatch, while the other transform purposes may apply saved, analyzed, or palette style context.

The advanced style section is collapsed by default and remembers its open state under `genpic_advanced_style_open`. Its **style reference image** is a separate upload used only by `analyzeStyle`; it never populates the content attachment or `referenceUploadId`. This separation prevents style analysis from silently changing the generated subject. Applied style can be summarized and cleared while the section remains collapsed.

```mermaid
sequenceDiagram
  participant User
  participant Picker as AttachmentPicker
  participant Workspace as useCreateWorkspace
  participant Jobs as useImageGeneration
  participant Api as image APIs
  participant History
  User->>Picker: upload image or use current result
  Picker->>Workspace: ready upload and selected purpose
  alt reference or no attachment
    Workspace->>Jobs: generateImage with optional referenceUploadId
    Jobs->>Api: queue generate-images job
  else transform purpose
    Workspace->>Jobs: transformImage with uploadId and purpose mode
    Jobs->>Api: queue image-transform edit job
  end
  loop until terminal
    Jobs->>Api: poll image-jobs by jobId
  end
  Api-->>Jobs: owner-scoped completed image
  Workspace->>History: save job with general or purpose source
```

This sequence shows the browser routing layer; endpoint admission and worker execution remain server-owned in [AI generation](../backend/ai-generation.md), and purpose values persisted in history are constrained by [schema](../data/schema.md).

`useImageGeneration::runImageJob` now owns one progress clock, abort controller, filename request, admission validation, owner-scoped polling, and preview update for both generation and transforms. `useCreateWorkspace::submit` decides which adapter to admit, forwards quality and image language, then records the completed job. Cancelling aborts browser waiting only; queued work can continue. Transform purposes disable ratio controls and display **use source aspect ratio**; `nearestAspectRatio` selects from the provider-supported ratio set before admission. Ordinary reference generation leaves ratio selection unlocked.

`getImageOutputLabel` remains the presentation formatter for unlocked output settings and `ImagePreview`. Its browser map still labels `16:9` as `1536×1024` and `9:16` as `1024×1536`, while the provider adapter requests `1536x864` and `864x1536`; treat that mismatch as a cross-layer correction. `GenerateBar` retains visible status text and a decorative `Loader2`; `ImageGeneratingState` remains an atomic busy region with reduced-motion-safe animation. Their presentation contract is documented in [shared UI motion, theme, and semantic icon styling](design-system.md).

For an attachment purpose, change `attachmentPurposes.js`, `useCreateWorkspace.js`, `AttachmentPicker.jsx`, `ScriptEditor.jsx`, `InfographicGenerator.jsx`, server prompt mode handling, history source normalization/labels, and migration constraints together. A purpose is not complete if only the UI catalog knows it. For dispatch or job lifecycle changes, follow `useCreateWorkspace::submit` -> `useImageGeneration::runImageJob` -> `aiService` -> the owning handler; preserve `jobId`, model, and operation checks. For ratio detection, change `imageFile.js`; for provider dimensions, change `api/_shared/gptImage.js`. The removed `ImageTransformPanel` and `useImageTransform` are not extension seams.

```sh
pnpm test --run src/hooks/__tests__/useCreateWorkspace.test.js src/components/create/__tests__/AttachmentPicker.test.jsx src/components/create/__tests__/ScriptEditor.test.jsx src/components/create/__tests__/GenerateBar.test.jsx src/__tests__/InfographicGenerator.test.jsx src/hooks/__tests__/useImageGeneration.test.js src/lib/__tests__/imageFile.test.js
```

`useCreateWorkspace.test.js` covers no-attachment generation, reference attachment routing, every transform purpose, refine style suppression, prompt requirements, source-ratio locking, reset, 10 MB rejection, and current-result reuse. `AttachmentPicker.test.jsx` covers upload, purpose choice, removal, and the one-time merged-tab notice. `InfographicGenerator.test.jsx` verifies reference and transform orchestration, purpose history, style-reference isolation, model-policy guards, and returning to plain generation after removal. `ScriptEditor.test.jsx` covers transform optimizer context and persisted advanced-style state; `GenerateBar.test.jsx` covers disabled ratio controls. `useImageGeneration.test.js` proves generation and transform share admission/polling and operation validation. These are browser/mocked checks, not a live Blob, worker, provider, or migration test.

## Image-text preference and optimization flow

`InfographicGenerator` initializes `imageLanguage` from `localStorage` key `genpic_image_language`, with `DEFAULT_IMAGE_LANGUAGE` as the fallback, and persists every change through `handleLanguageChange`. The general/storyboard `GenerateBar`, the general `ScriptEditor` hint action, and `SettingsPanel` all receive that same state and setter, so a choice made beside generation is immediately reflected in settings and subsequent requests. The setting controls text rendered **inside generated images**, not the browser UI language or the language of a user's prompt. Changing language or aspect ratio clears `optimizedPromptEn`, preventing an optimized content brief from being reused under changed optimizer context.

`src/lib/imageTextLanguage.js` is the canonical browser option catalog. `LANGUAGE_OPTIONS` supplies IDs and all labels to `GenerateBar` and `SettingsPanel`; `NO_TEXT_LANGUAGE` names the `none` value; `getLanguageOption` falls back to `DEFAULT_IMAGE_LANGUAGE` for an unknown ID; and `getImageTextModeLabel` formats the bar summary. This browser catalog must remain aligned with the accepted server IDs in `api/_shared/imageTextLanguage.js`, but the two modules have different ownership: the browser module owns choices and labels, while the server module owns prompt directives.

`ScriptEditor` calls the pure `detectNoTextIntent` rule for the current prompt. The rule deliberately recognizes only conservative whole-image Chinese and English requests such as no text, without text, or remove all text; it rejects local subjects such as a title, sign, or background and qualifiers such as too much text. When intent matches and `imageLanguage` is not `none`, `ScriptEditor` supplies a hint descriptor to `PromptHints`. The reusable card is a `role="status"` region with a primary action and dismiss action: applying it calls `handleLanguageChange('none')`, while dismissal records the exact current prompt string. The hint remains dismissed until the prompt value changes, and choosing no-text hides it. Its CSS entry uses the shared duration/easing and a reduced-motion translation fallback from [shared UI motion, theme, and semantic icon styling](design-system.md); it does not change generation automatically.

```mermaid
flowchart TD
  Catalog["Browser LANGUAGE_OPTIONS catalog"] --> Bar["GenerateBar text mode control"]
  Catalog --> Settings["SettingsPanel language choices"]
  Prompt["ScriptEditor prompt"] --> Detector["detectNoTextIntent"]
  Detector --> Hint{"Whole image no-text intent"}
  Hint -->|yes and mode is not none| Card["PromptHints status card"]
  Card -->|apply| Setter["InfographicGenerator handleLanguageChange"]
  Bar --> Setter
  Settings --> Setter
  Setter --> Storage["Persist genpic_image_language"]
  Setter --> Clear["Clear optimizedPromptEn"]
  Setter --> Requests["Generation optimization and transform consumers"]
```

This flow shows the single browser preference owner and the advisory no-text path. The hint recommends a state change; `InfographicGenerator` remains the only owner that persists it and invalidates an optimized prompt.

`ScriptEditor::handleSmartOptimize` calls `aiService::optimizePrompt` with `optimizationMode: 'generation'` for plain/reference generation and switches to `optimizationMode: 'transform'` plus the attachment purpose as `transformMode` for edits. It also sends style context, image language, image purpose, and aspect ratio; purpose, attachment, language, ratio, or style changes clear the stored optimized English brief. `DocumentScenes::SceneModal` calls `aiService::optimizeScene` with scene fields and the same applicable context. `AssetMetadataSheet` uses `optimizationMode: 'style_description'` to improve unsaved style prose. `aiService.js` is the common serialization seam. The server-side strategy and final prompt contract are canonical in [AI generation](../backend/ai-generation.md); every wrapper or reshaped request must preserve its applicable context.

For a new language ID, update `src/lib/imageTextLanguage.js` first, then reconcile the browser controls and settings tests, the accepted IDs and directives in `api/_shared/imageTextLanguage.js`, `imagePrompt.js`, `imagePromptStrategy.js`, generation and transform paths, and both optimizer request paths. Do not restore a private option list in `SettingsPanel` or `GenerateBar`. For a new prompt-coaching rule, keep detection pure in `src/lib/promptHints.js`, construct rule state and actions in `ScriptEditor`, and keep `PromptHints` generic; test detector positives and conservative false positives separately from component display, dismissal, and action wiring.

The server helper accepts only `en`, `zh-TW`, `zh-CN`, `ja`, `ko`, `es`, `fr`, `de`, and `none`; absent or unsupported values intentionally produce no extra directive. For a recognized language, quoted literal text stays exactly as authored and is rendered only at the requested count; necessary requested text without exact wording uses the selected language, while filler text is forbidden. `none` prohibits all text. `freeform` retains this explicit setting, despite omitting purpose-specific composition defaults. `InfographicGenerator.test.jsx` proves the bar choice updates the editor-facing state, local storage, and the generation request; `GenerateBar.test.jsx` proves direct choice state, other-language display, and summary text; `SettingsPanel.test.jsx` proves it renders the shared catalog; `promptHints.test.js` covers whole-image matches and local/unrelated exclusions; and `ScriptEditor.test.jsx` covers offer, action, no-text suppression, and prompt-scoped dismissal. These remain browser tests: there is still no focused optimizer-handler test, and `aiService.test.js` does not assert either optimization payload.

```sh
pnpm test --run src/lib/__tests__/promptHints.test.js src/components/create/__tests__/GenerateBar.test.jsx src/components/create/__tests__/ScriptEditor.test.jsx src/components/settings/__tests__/SettingsPanel.test.jsx src/__tests__/InfographicGenerator.test.jsx
```

Run the server prompt contract separately only when changing accepted IDs, directives, or optimizer context:

```sh
pnpm test --run api/_shared/__tests__/imagePromptStrategy.test.js api/_shared/__tests__/imagePrompt.test.js api/_shared/__tests__/imageTextLanguage.test.js
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

`DocumentScenes` retains `SceneModal` in `AnimatePresence`; the modal overlay and its panel fade/scale with `OVERLAY_ENTER` / `OVERLAY_EXIT`. Its private zoomable `ImageLightbox` is also retained in an inner presence boundary, so closing it does not snap away. This private component is separate from the shared `src/components/common/ImageLightbox.jsx` used by the Asset Center and administration panel; do not merge them as a motion-only edit because their interaction and accessibility contracts differ. The style picker and source-text disclosure retain CSS entry animation using the shared enter token and explicitly disable it for reduced-motion users.

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

The studio's persistent action/status row renders the shared `GenerationSignature` before its textual hint. It derives `working` while `isGenerating`, `success` once `deck` exists and generation has ended, and `idle` otherwise; the success state uses `text-success`, while the other states use `text-primary`. This is a decorative lifecycle cue (`aria-hidden`), not deck-job state or an additional completion condition: the hook and server response remain authoritative. Its animation and reduced-motion behavior are owned by [shared UI motion, theme, and semantic icon styling](design-system.md).

For studio composition, setup forwarding, blueprint samples, polling, event, or preview changes, start with `PptMasterStudio.jsx`, `DeckSetupForm.jsx`, `DeckSetupSection.jsx`, `DeckBlueprint.jsx`, `DeckPreviewStage.jsx`, `DeckSlideRail.jsx`, `DeckRecipePicker.jsx`, `pptRecipeCopy.js`, `PptTemplatePicker.jsx`, `templatePreviewManifest.js`, `usePptMasterDeck.js`, `DeckProgress.jsx`, `DeckTimeline.jsx`, `deckSteps.js`, and `aiService.js`, then follow the durable job seam in [PPT Master deck jobs](../backend/ppt-master-decks.md). Do not hand-edit `templatePreviewManifest.js` or files under `public/template-previews/styles/`; regenerate them from the canonical script when a source-backed preview change is required. `PptMasterStudio.test.jsx` covers idle blueprint and disabled submission, setup collapse, planned-page placeholders, latest-page following, manual pinning and return to latest, image-density forwarding, recipe prefill/available-style behavior, and structured-brief forwarding; it does not assert the action-row `GenerationSignature` state or color mapping. `pptRecipeCopy.test.js` ensures frontend options and defaults match backend recipe IDs and accepted slide range; `templatePreviewManifest.test.js` verifies declared files exist and missing entries return an empty list. `usePptMasterDeck.test.jsx` covers resumption, missing/failed jobs, transient failure, stop tracking, preview revision caching, URL release, and non-fatal preview failure. These are not handler, Blob, worker, or authorization tests.

```sh
pnpm test --run src/components/create/__tests__/PptMasterStudio.test.jsx src/components/create/__tests__/pptRecipeCopy.test.js src/components/create/__tests__/templatePreviewManifest.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx src/services/__tests__/aiService.test.js
```

## Change navigation

Consult this page for React composition, document upload/fallback, storyboard state, browser exports, or the PPT Master browser lifecycle. Start with `InfographicGenerator.jsx` to identify the active path. For a storyboard modal or inline creation-panel animation, change the owner and child together: `DocumentScenes` owns the outer and nested `AnimatePresence` boundaries, while `SceneModal` and its private zoom lightbox own Motion props. Preserve Escape/backdrop behavior and use the shared tokens from [shared UI motion, theme, and semantic icon styling](design-system.md); no focused test currently proves these exits. Use [AI generation](../backend/ai-generation.md) for document/model/provider changes, [PPT Master deck jobs](../backend/ppt-master-decks.md) for deck worker or contract changes, [HTTP API](../backend/http-api.md) for public route/OpenAPI changes, and [operations](../operations/development-deployment.md) only for configuration or deployment work.
