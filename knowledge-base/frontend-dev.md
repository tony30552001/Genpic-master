## Analyze-style embedding fallback
**Date:** 2026-02-11
**Context:** When analyze-style returns embedding, allow DB insert to continue even if embedding generation fails, and expose a warning to UI.
**Best practices:**
- Backend: if embedding generation fails, keep insert, return `embedding_error`, and set `embedding` to null.
- Frontend: show non-blocking warning when `embedding_error` exists and clear it on success.
- Keep `styleId` in the response to enable later backfill.
