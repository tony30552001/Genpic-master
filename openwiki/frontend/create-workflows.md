---
type: frontend workflow
title: Creation workspace, documents, and exports
description: Main Pixora creation state, document-to-scene generation, transformations, persistence, and client-side exports.
tags: [frontend, creation, export]
---

# Creation workspace, documents, and exports

`InfographicGenerator.jsx` is the creation workspace composition point. It combines generation, document analysis, transforms, styles, templates, history, settings and sharing components. Its hooks isolate remote interactions: `useImageGeneration`, `useDocumentAnalysis`, `useImageTransform`, `useStyles`, `useTemplates`, and `useHistory`.

## Generation and persistence

`useImageGeneration.runGeneration` requires a script, aborts an earlier browser wait, concurrently asks for a filename, builds a style/content/language prompt, calls `generateImage`, and polls a returned job. The generation model is display/progress state; server policy is authoritative. `useHistory` compresses images to max 800px JPEG before saving, while history deletion is optimistic and restores only failed deletions. Styles are debounced (300ms) server searches; saving compresses preview images. Templates snapshot script/style data.

`useImageTransform` limits source files to 10 MB, requests Blob SAS, uploads with XHR progress, retains preview plus SAS URL, and merges user prompt, palette tags and saved-style prompt before `/image-transform`. Cancellation aborts waiting, not necessarily remote work. See [AI generation](../backend/ai-generation.md) and [resources](../backend/resources.md).

## Document-to-scenes

`useDocumentAnalysis` accepts PDF/text/markdown/images up to 50 MB. It uploads first to Blob to avoid SWA body limits; only if upload fails and the file is at most 80 KB does it send base64. It sends filename, MIME, requested `sceneCount` (or `auto`), and `mode` (`storyboard` or `presentation`). The returned normalized object includes `title`, `summary`, `scenes`, `characters`, `total_scenes`, `estimated_generation_time`, and `analysis_mode`. Each scene has compatible snake/camel source fields mapped to `scene_number`, title, description, visual prompt, key elements, mood, source text, plus guarded array `bullet_points`, `speaker_notes`, and `layout_type`. Local scene edits and deletions renumber `scene_number`; consumers must preserve this ordering when generating/exporting scenes. Server fetching, parsing recovery, and failure codes are specified in [AI generation](../backend/ai-generation.md).

## Export boundary

Image, PDF, and PowerPoint output are browser artifacts, not API records. `DocumentScenes.jsx::exportToPptx()` excludes scenes without `generatedImage`; if none qualify it reports rather than writes a deck. It creates a 16:9 deck, one slide per included scene, with scene number/title, editable bullet text, generated image on the right, and optional speaker notes. Bullets use `bullet_points` when nonempty, otherwise `scene_description`. It loads/embed-converts images in parallel; a failed/CORS-blocked image becomes `null`, produces a partial-image warning, and does not discard other slides. Export-level errors remain visible. Filename sanitization permits word/CJK/space/hyphen characters with `presentation` fallback. Keep client-only download failures visible to the user; no server cleanup occurs. `jspdf` is the PDF dependency.

Focused tests: `generationProgress.test.js` validates time/model progress phases; `pptxExport.test.js` mirrors bullet fallback, API bullet guards, and filename sanitization. Service tests validate request contracts. Run `pnpm test`; browser-test actual export downloads after layout changes.