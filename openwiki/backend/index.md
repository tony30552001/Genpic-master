# Files

- [AI generation and document storyboard analysis](ai-generation.md) - Tenant-managed model routing, provider adapters, storyboard document-analysis contracts, image generation jobs, and the boundary to asynchronous PPT Master deck creation.
- [Authentication, tenancy, and administration](auth-tenancy-admin.md) - Session-derived identity, tenant persistence, role enforcement, image-model policy, and encrypted tenant analysis-model administration.
- [HTTP API composition and routes](http-api.md) - Express adapter behavior, cookie-session API contracts, and the route catalog served by the local API process.
- [PPT Master asynchronous deck generation](ppt-master-decks.md) - Tenant-scoped PPT Master deck jobs that author SVG slides, validate them through a Python sidecar, compile native PPTX, store output in Blob Storage, and expose a polling/download API.
- [Resource APIs, Blob assets, and LINE sharing](resources.md) - Tenant-scoped styles, history, templates, uploads, generated assets, and LINE integration behavior.
- [Server sessions and BFF sign-in](sessions.md) - The BFF authorization-code and Google credential flows that issue opaque Pixora sessions, enforce CSRF, and preserve tenant identity without browser-held provider tokens.
- [Owner-scoped uploads and staged Blob storage](uploads.md) - Authenticated upload creation, verified staging-to-ready promotion, tenant/user ownership checks, downstream consumers, and cleanup of expired staging objects.
