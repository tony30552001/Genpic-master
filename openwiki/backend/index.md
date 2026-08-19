# Files

- [AI generation, document analysis, and presentation rendering](ai-generation.md) - Tenant-managed analysis-model routing, provider adapters, document-analysis contracts, company-template PowerPoint rendering, image model policy, and durable GPT image jobs.
- [Authentication, tenancy, and administration](auth-tenancy-admin.md) - Session-derived identity, tenant persistence, role enforcement, image-model policy, and encrypted tenant analysis-model administration.
- [HTTP API composition and routes](http-api.md) - Express adapter behavior, cookie-session API contracts, and the route catalog served by the local API process.
- [PPT Master asynchronous deck generation](ppt-master-decks.md) - Tenant-scoped PPT Master deck jobs that author SVG slides, validate them through a Python sidecar, compile native PPTX, store output in Blob Storage, and expose a polling/download API.
- [Resource APIs, Blob assets, and LINE sharing](resources.md) - Tenant-scoped styles, history, templates, uploads, generated assets, and LINE integration behavior.
- [Server sessions and BFF sign-in](sessions.md) - The BFF authorization-code and Google credential flows that issue opaque Pixora sessions, enforce CSRF, and preserve tenant identity without browser-held provider tokens.
