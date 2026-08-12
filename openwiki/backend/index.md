# Files

- [AI generation, document analysis, and presentation rendering](ai-generation.md) - Provider adapters, document-analysis contracts, company-template PowerPoint rendering, model policy, and the durable GPT image job lifecycle.
- [Authentication, tenancy, and administration](auth-tenancy-admin.md) - Session-derived identity, tenant persistence, role enforcement, and tenant model-policy administration.
- [HTTP API composition and routes](http-api.md) - Express adapter behavior, cookie-session API contracts, and the route catalog served by the local API process.
- [PPT Master asynchronous deck generation](ppt-master-decks.md) - Tenant-scoped PPT Master deck jobs that author SVG slides, validate them through a Python sidecar, compile native PPTX, store output in Blob Storage, and expose a polling/download API.
- [Resource APIs, Blob assets, and LINE sharing](resources.md) - Tenant-scoped styles, history, templates, uploads, generated assets, and LINE integration behavior.
- [Server sessions and BFF sign-in](sessions.md) - The BFF authorization-code and Google credential flows that issue opaque Pixora sessions, enforce CSRF, and preserve tenant identity without browser-held provider tokens.
