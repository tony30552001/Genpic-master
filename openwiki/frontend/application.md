---
type: frontend architecture
title: Browser application and authentication
description: React startup, server-session bootstrap, Google and Entra sign-in entry points, CSRF request handling, and session-expiry UI.
tags: [frontend, authentication, sessions, csrf, google, entra]
openwiki:
  roles: [architecture, integration, workflow, testing]
  change_kinds: [authentication, session-lifecycle, csrf, routing]
  source_paths: [src/main.jsx, src/context/AuthContext.jsx, src/services/authService.js, src/services/apiClient.js, src/components/auth/SessionExpiryBanner.jsx]
  symbols: [AuthProvider, getAuthSession, loginWithMicrosoft, loginWithGoogle, requestWithRetry, setCsrfToken]
  test_paths: [src/services/__tests__/authService.test.js, src/services/__tests__/apiClient.test.js]
  invariants: ["The browser holds the CSRF token only in memory and sends it on unsafe requests.", "Authenticated requests include the server-issued session cookie rather than a provider token."]
  validation_commands: [pnpm test --run src/context/__tests__/AuthContext.test.jsx src/services/__tests__/authService.test.js src/services/__tests__/apiClient.test.js]
---

# Browser application and authentication

`src/main.jsx` is the browser composition root: it mounts `GoogleOAuthProvider`, `AuthProvider`, and `App`. It no longer initializes MSAL or handles a browser-side provider redirect. Microsoft sign-in is a full-page navigation to the BFF; Google supplies a credential to the BFF once. The server-side flow, cookies, and authorization-code exchange are canonical in [server sessions and BFF sign-in](../backend/sessions.md).

## Browser session lifecycle

At mount, `AuthProvider` clears legacy `google_user` and `msal.*` local-storage values, then calls `getAuthSession`. That function makes unauthenticated `GET /api/auth/session`; when the response is authenticated it keeps the returned user in React state and saves the returned CSRF value only in the module-local `apiClient` variable. A no-session response clears both user/profile state and the CSRF value.

`loginWithMicrosoft` builds an internal path, query, and hash return target then navigates to `/api/auth/entra/start`. The API creates and validates Entra state, receives the callback, and returns to that path with the HttpOnly session cookie. `loginWithGoogle` sends `{ credential }` once to `/api/auth/google`, then reloads session state. Neither provider credential is persisted by this code.

`AuthProvider` loads `/api/me` after a server session establishes `user`; its `profile.role` derives `isAdmin`. All protected routes wait for session initialization; only the admin route also waits for profile loading before it checks `isAdmin`. `handleLogout` calls the CSRF-protected API logout and clears local state even if that request fails. `SessionExpiryBanner` and `LoginPage` expose both sign-in choices when `apiClient` reports expiry.

## API client contract

`apiClient` uses `fetch` with `credentials: "include"` for all requests. `buildHeaders` adds JSON content type as needed and adds `X-CSRF-Token` only for unsafe methods (`POST`, `PUT`, `DELETE`, and other non-safe methods), unless `auth: false` or `csrf: false` is explicit. If an unsafe request lacks an in-memory CSRF value, it fails locally with `AuthExpiredError` before it reaches the network.

A protected 401 notifies the handler registered by `AuthProvider`, which clears state and shows an expiry warning; there is no token-refresh retry. Abort errors still propagate unchanged. The API verifies the cookie and CSRF header independently; this client behavior is a usability guard, not the security control. See [server sessions](../backend/sessions.md) for middleware ordering and [HTTP API](../backend/http-api.md) for endpoint registration.

## Change and validation guide

Consult this page for sign-in buttons, bootstrapping, protected-route state, client request credentials, CSRF headers, or expiry UX. Follow the complete seam: `src/context/AuthContext.jsx` owns session/profile state, `src/services/authService.js` owns auth endpoint calls and BFF navigation, `src/services/apiClient.js` owns credential and CSRF request behavior, and `src/components/auth/SessionExpiryBanner.jsx` / `src/pages/LoginPage.jsx` render recovery UI. Server behavior belongs in [server sessions](../backend/sessions.md), not a new browser token implementation.

Keep the client’s in-memory CSRF rule aligned with the API’s unsafe-method enforcement. Do not restore `X-Auth-Token`, browser MSAL initialization, provider-token storage, or a direct-GPT credential path: those modules were removed in favor of server-owned sessions and generation.

Run the focused browser checks:

```sh
pnpm test --run src/context/__tests__/AuthContext.test.jsx src/services/__tests__/authService.test.js src/services/__tests__/apiClient.test.js
```

`AuthContext.test.jsx` covers BFF-session bootstrap followed by profile loading. The auth-service suite covers session load/CSRF storage, Google posting, BFF Microsoft redirect, and logout clearing. The API-client suite covers cookie credentials, CSRF inclusion/missing-token rejection, 401 notification, and 204 handling. Perform an interactive browser check only when changing the login UI, `VITE_API_BASE_URL`, or return routing; it must cover a post-login session bootstrap, a mutation after CSRF bootstrap, logout, and expired-session recovery. Use [operations](../operations/development-deployment.md) for callback and CORS setup.
