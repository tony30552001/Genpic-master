---
type: integration surface
title: Browser-direct GPT Image service
description: The configured browser-side GPT Image generation and edit client, distinct from server-mediated generation.
tags: [frontend, gpt-image, integration]
---

# Browser-direct GPT Image service

`src/services/gptImageService.js` exports `generateImageGpt` and `editImageGpt`. They call `VITE_GPT_IMAGE_ENDPOINT` or derived `VITE_GPT_IMAGE_EDIT_ENDPOINT` directly from the browser. This is distinct from `aiService.generateImage`, which calls `/api/generate-images`; the server ignores its requested model in favor of tenant policy and may enqueue work.

## Contract

- `ASPECT_RATIO_TO_SIZE` converts the supported ratios to provider pixel sizes; unknown values use `1024x1024`.
- Azure/OpenAI hostnames use `api-key`; other endpoints use `Authorization: Bearer`. If no configured image key exists, it attempts the currently authenticated Microsoft/Google token unless bypassed.
- Generation posts JSON `{ prompt, model, size, n: 1 }`; edit builds `FormData`, selecting `image[]` for Azure endpoints and `image` otherwise. It does not manually set multipart `Content-Type`.
- Both normalize either `b64_json` or provider `url` to `{ imageUrl }`, parse provider errors, and pass `AbortSignal` to `fetch`.

## Security and change implications

Any `VITE_*` key is compiled into the browser bundle. Treat this client as a deliberately exposed credential/deployment surface; prefer [server-mediated AI generation](../backend/ai-generation.md) for tenant policy, durable work, and secret isolation. Keep frontend and server aspect mappings aligned only if the provider contract requires it; they are separate implementations today.

Focused evidence is `src/services/__tests__/gptImageService.test.js`: Azure headers/payload, ratio mapping, multipart field selection, malformed and error response handling, and abort propagation. Change callers only after locating imports of these exports; they are not the main generation path documented in [creation workflows](create-workflows.md).