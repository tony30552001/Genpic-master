---
type: retired integration surface
title: Retired browser-direct GPT Image client
description: Historical boundary for the removed browser-side GPT Image service; current image generation is server-mediated through the API.
tags: [frontend, gpt-image, retired]
openwiki:
  roles: [repository, integration]
  change_kinds: [deprecation, security]
  source_paths: [src/services/gptImageService.js, src/config.js]
  invariants: ["No current browser runtime module calls a configured direct GPT Image endpoint."]
---

# Retired browser-direct GPT Image client

`src/services/gptImageService.js` and its focused test were removed. `src/config.js` now exposes only local bypass, Google client, API base URL, and image-model metadata; it has no browser GPT Image endpoint or key configuration. The browser also no longer obtains provider tokens for API requests.

Current creation code uses the server API path described in [AI generation](../backend/ai-generation.md). This is intentional: the API applies tenant model policy, keeps provider credentials server-side, and can create durable image jobs. The browser-side session transition that accompanies this removal is documented in [browser application and authentication](application.md).

When investigating a request to reintroduce a browser-direct provider call, start with [AI generation](../backend/ai-generation.md) and [server sessions](../backend/sessions.md), not this retired surface. It would be a new security and public configuration boundary: assess tenant-policy bypass, bundled secrets, cancellation behavior, and focused consumer tests before adding configuration or an export. There is no current implementation or validation command for it.
