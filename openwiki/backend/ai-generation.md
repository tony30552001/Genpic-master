---
type: backend workflow
title: AI generation and durable image jobs
description: Provider adapters, AI endpoint behavior, model policy, transformation, and the durable GPT image job lifecycle.
tags: [backend, ai-generation, document-analysis]
openwiki:
  roles: [workflow, integration]
  change_kinds: [document-analysis, response-contract, provider-adapter]
  source_paths: [api/analyze-document/index.js, api/generate-presentation/index.js, api/_shared/presentationSchema.js, api/_shared/pptxAutomizer.js, api/_shared/documentParser.js, api/_shared/azureOpenAI.js]
  symbols: [normalizeRecommendedStyle, normalizePresentationScene, normalizeTable, normalizeChart, buildAnalysisPrompt, generateJsonCompletion, generatePresentationPptx, normalizeScenes, toDataImage]
  test_paths: [api/_shared/__tests__/presentationSchema.test.js, api/_shared/__tests__/pptxAutomizer.test.js, api/_shared/__tests__/documentParser.test.js, api/_shared/__tests__/azureOpenAI.test.js]
  invariants: [Document analysis rejects an AI response with no nonempty recommended_style.prompt., Presentation visual data is bounded and normalized before it leaves the handler., Server PPTX export accepts no more than ten normalized scenes and only embedded image data URLs.]
  validation_commands: [pnpm test --run api/_shared/__tests__/pptxAutomizer.test.js]
---

# AI generation and durable image jobs

Handlers authenticate, rate-limit, and generally resolve identity before work. `_shared/gemini.js` creates Google GenAI clients and normalizes JSON-ish textual output; `_shared/gptImage.js` maps aspect ratios, chooses Azure `api-key` or Bearer, and normalizes image response data. `azureOpenAI.js` separately powers prompt optimization through Responses JSON output.

## Generation and transformation

`POST /generate-images` requires `prompt`, loads the tenant default model, and **does not honor the client supplied model**. Gemini builds text plus an allowed reference image, retries overload-like failures twice with exponential delay, then returns a data URL. For `gpt-image-2`, Azure Functions runtime generates synchronously; standalone Express creates a job and returns `202 { jobId, status }`.

`POST /image-transform` accepts base64 or an allowed Blob URL. `buildTransformPrompt` supports `style_transfer`, `element_extract`, `bg_replace`, and default `reference_gen`; GPT edits multipart source data, Gemini sends inline data. Both return a model-tagged image. `isUrlAllowed` restricts production fetches to HTTPS, non-private addresses, and normally the configured Blob host.

### Document analysis contract

`POST /analyze-document` accepts `documentUrl` or `base64Content`, filename/MIME, `sceneCount`, and `mode`. `storyboard` requests visual scenes; `presentation` also requests bullets, speaker notes, and layout. Numeric requested count is clamped to 1–10. It recognizes the shared server format set in `_shared/documentParser.js`: PDF; Word, PowerPoint, and Excel variants; OpenDocument; RTF; EPUB; CSV; TXT/Markdown; and PNG/JPEG, by filename extension or MIME type. A same-account Blob URL is read with the Storage SDK; another URL must pass `isUrlAllowed`; missing/octet-stream MIME falls back to filename.

```mermaid
sequenceDiagram
  participant Browser
  participant Blob as Azure Blob Storage
  participant Handler as analyze-document
  participant Parser as documentParser
  participant Azure as Azure OpenAI Responses
  Browser->>Blob: upload document
  Browser->>Handler: document URL or base64 and analysis options
  opt document URL is provided
    Handler->>Blob: download same-account document
  end
  Handler->>Parser: parse buffer and identify input kind
  alt text or converted document
    Parser-->>Handler: text and parser metadata
    Handler->>Azure: JSON request with text
  else image or scanned PDF
    Parser-->>Handler: vision buffer and parser metadata
    Handler->>Azure: JSON request with image or PDF file
  end
  Azure-->>Handler: structured analysis
  Handler-->>Browser: normalized scenes, style recommendation, and provenance
```

This sequence shows the document-analysis request path; the handler downloads only when the request identifies a Blob URL.

`parseDocumentBuffer` strips a text BOM and sends TXT/Markdown directly as text. It converts other recognized document formats to Markdown through `@firecrawl/anydoc`; a PDF that AnyDoc reports unsupported is instead sent as a PDF file for GPT vision. Images are sent as image input. The handler rejects empty or conversion failures with mapped `DocumentConversionError` status/code, and rejects text over `DOCUMENT_ANALYSIS_MAX_CHARS` (default `500000`) with `413 document_text_too_large`; it does not truncate. It then uses `_shared/azureOpenAI.js::generateJsonCompletion` against the configured Azure OpenAI deployment with JSON output and `maxOutputTokens: 8192`. The Responses adapter permits exactly one attached image or file input.

A valid model response must also supply `recommended_style.prompt`. `normalizeRecommendedStyle` converts the document-level recommendation to `{ name, description, prompt, tags }`: it stringifies scalar fields, splits string tags on ASCII or full-width commas, removes empty tags, and supplies the name `AI 文件建議風格` when absent. A missing or blank prompt is an `invalid_response` `502`; it is not silently replaced with an empty scene style. Provider errors, missing scenes, and fully empty normalized scenes return distinct failure responses.

Every returned scene passes through `_shared/presentationSchema.js::normalizePresentationScene` before the handler filters it; presentation mode is the mode that asks the model to supply visual data. It accepts compatible snake/camel aliases, gives an invalid scene number/title/layout a safe fallback, and emits at most one normalized table and one normalized chart. Tables allow at most eight columns and ten rows; charts allow at most twelve labels and four series. Empty visual structures are removed; numeric chart values are normalized, missing values are zero-filled, and `column`/`donut` aliases become `bar`/`doughnut`. Only `default`, `title_content`, `two_column`, `table`, `chart`, and `closing` layouts survive; any other value becomes `default`. The presentation prompt asks the model to use only source-backed tabular or numeric data, but this normalizer—not prompt compliance—is the response safety boundary. Presentation responses include `presentation_schema_version` (`1`); storyboard responses return it as `null`.

Valid output returns title, summary, `recommended_style`, scenes, characters, total count, estimated time, mode, `analysis_provider`, `analysis_model`, `source_parser`, `source_format`, and the presentation schema version. [Creation workflows](../frontend/create-workflows.md) consumes the recommendation and the normalized visual fields; it independently validates edited visual data again before PPTX rendering.

For a format, conversion, Responses-input, or response-normalization change, begin with `documentParser.js`, `azureOpenAI.js`, `presentationSchema.js`, and `analyze-document/index.js`, then trace the browser consumer in [creation workflows](../frontend/create-workflows.md). `api/_shared/__tests__/presentationSchema.test.js` covers scene fallback, aliases, preservation of valid visuals, and rejection of empty/non-numeric visual data; run `pnpm test --run api/_shared/__tests__/presentationSchema.test.js` for schema-only work. `documentParser.test.js` covers extension/MIME recognition, direct text, CSV conversion, image routing, and conversion error mapping; `azureOpenAI.test.js` covers image/PDF Responses input and configured deployment output. Run `pnpm test --run api/_shared/__tests__/documentParser.test.js api/_shared/__tests__/azureOpenAI.test.js` only when parser or provider-input behavior changes. There is no focused handler test for `recommended_style` normalization or its required-prompt rejection, so a change there needs a targeted handler test or controlled API integration. Handler-level route behavior and live conversion/provider behavior remain integration concerns; do not validate provider credentials for an adapter-only change.

Other AI routes: `analyze-style` returns style prompt/metadata, `optimize-scene` falls back to original fields if model JSON cannot parse, `optimize-prompt` requires Azure OpenAI JSON fields, embedding expects the configured vector dimension, and filename generation sanitizes/falls back rather than blocking creation.

### Server-rendered PowerPoint export

`POST /generate-presentation` is an authenticated, rate-limited, CSRF-protected binary endpoint. It rejects a missing/empty `scenes` array and more than ten supplied scenes with `400 bad_request`; it first calls `_shared/pptxAutomizer.js::normalizeScenes`, rejects a result with no usable description/prompt, and rejects any retained `generatedImage` that is not a `data:image/...;base64,` URL with `400 invalid_image`. It returns a no-store `.pptx` attachment with the Office presentation content type. The public route and OpenAPI binary response declaration are kept in [HTTP API](http-api.md); the browser conversion and download lifecycle is owned by [creation workflows](../frontend/create-workflows.md).

```mermaid
sequenceDiagram
  participant Browser
  participant Client as apiPostBlob
  participant Handler as generate-presentation
  participant Renderer as pptxAutomizer
  Browser->>Client: normalized scenes and embedded images
  Client->>Handler: cookie and CSRF protected POST
  Handler->>Handler: validate and normalize scenes
  Handler->>Renderer: create presentation archive
  Renderer-->>Handler: PPTX buffer
  Handler-->>Client: binary attachment
  Client-->>Browser: Blob download
```

This sequence shows the export boundary: browser code converts usable images before the request, while server code re-normalizes presentation data and never fetches client-supplied URLs. `generatePresentationPptx` memoizes an in-memory 16:9 root template, then has `pptx-automizer` load it as both root and named source. It removes the template slide and adds one generated slide per normalized scene. `addScene` repeats the local exporter’s visual precedence: native table/chart data beats an embedded image, and an image beats the placeholder. It accepts only the normalized layouts and rendering data from `presentationSchema`; speaker notes are not added by this bridge.

For server-export work, change `api/generate-presentation/index.js` for request/response policy and `_shared/pptxAutomizer.js` for normalization, root-template lifecycle, or slide rendering. `api/_shared/__tests__/pptxAutomizer.test.js` verifies embedded-image preservation and creates an actual ZIP-based PPTX with native visuals; run:

```sh
pnpm test --run api/_shared/__tests__/pptxAutomizer.test.js
```

Run the client blob checks in [creation workflows](../frontend/create-workflows.md) when the browser contract changes. There is no focused handler test for authentication, CSRF, rate limits, validation status codes, or attachment headers; add one before changing those handler branches. Do not run a provider check: this export has no AI-provider call or external storage fetch.

## Job state machine

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> processing: claim next job
  processing --> succeeded: provider and Blob upload
  processing --> queued: failure before third attempt
  processing --> failed: final failure or stale final lock
```

The worker in `_shared/imageJobs.js` runs one local cycle at a time. `claimNextImageJob` uses a transaction and `FOR UPDATE SKIP LOCKED`, increments attempts, and can reclaim a processing lock older than 15 minutes. It retries up to three attempts with a five-second delay; a stale job at max attempts fails. Success stores an image in Blob and records its name/mime type. `GET /image-jobs/:id` validates UUID and scopes retrieval to tenant and user before reading Blob into a data URL. Browser polling is `waitForImageJob` every two seconds, maximum 20 minutes; aborting stops browser waiting but cannot guarantee provider work is cancelled.

See [resources](resources.md) for storage details and [creation workflows](../frontend/create-workflows.md) for callers. Focused client coverage is `aiService.test.js` and `generationProgress.test.js`; no worker handler test was found. Validate provider-free changes with the focused client test, then use controlled API integration tests for job locking/provider configuration.
