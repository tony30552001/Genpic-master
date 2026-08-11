import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

process.env.AUTH_SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET || "test-session-secret-0123456789012345";

const require = createRequire(import.meta.url);
const session = require("../session");

describe("session helpers", () => {
  it("parses session cookie from request headers", () => {
    const token = "opaque-token";
    const req = {
      headers: {
        cookie: `other=1; ${session.SESSION_COOKIE_NAME}=${token}; flag=yes`,
      },
    };

    expect(session.getSessionTokenFromRequest(req)).toBe(token);
  });

  it("builds HttpOnly lax cookie for session token", () => {
    const cookie = session.buildSessionCookie("opaque-token");

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("validates csrf token against stored hash", () => {
    const sessionToken = "opaque-token";
    const csrfToken = session.deriveCsrfToken(sessionToken);
    const csrfHash = session.hashCsrfToken(csrfToken);

    expect(session.validateCsrfToken(csrfToken, csrfHash)).toBe(true);
    expect(session.validateCsrfToken("invalid-token", csrfHash)).toBe(false);
  });

  it("detects idle-expired sessions", () => {
    const expired = session.isSessionExpired({
      revokedAt: null,
      idleExpiresAt: new Date(Date.now() - 1000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(expired.expired).toBe(true);
    expect(expired.reason).toBe("idle_timeout");
  });
});
