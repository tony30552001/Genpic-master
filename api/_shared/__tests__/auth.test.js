import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const session = require("../session");
const { requireAuth } = require("../auth");

const originalSessionFns = {
  loadSessionFromRequest: session.loadSessionFromRequest,
  isSessionExpired: session.isSessionExpired,
  validateCsrfFromRequest: session.validateCsrfFromRequest,
  touchSession: session.touchSession,
  toAuthUser: session.toAuthUser,
  revokeSessionById: session.revokeSessionById,
  buildClearedSessionCookie: session.buildClearedSessionCookie,
};

const resetSessionMocks = () => {
  session.loadSessionFromRequest = vi.fn();
  session.isSessionExpired = vi.fn(() => ({ expired: false, reason: null }));
  session.validateCsrfFromRequest = vi.fn(() => true);
  session.touchSession = vi.fn(async (value) => value);
  session.toAuthUser = vi.fn(() => ({
    displayName: "Pixora User",
    email: "user@example.com",
    authType: "google",
    sub: "subject-1",
  }));
  session.revokeSessionById = vi.fn(async () => {});
  session.buildClearedSessionCookie = vi.fn(() => "pixora_session=; Max-Age=0");
};

const restoreSessionFns = () => {
  Object.assign(session, originalSessionFns);
};

describe("requireAuth", () => {
  beforeEach(() => {
    resetSessionMocks();
  });

  afterEach(() => {
    restoreSessionFns();
    vi.restoreAllMocks();
  });

  it("returns 401 when no session exists", async () => {
    session.loadSessionFromRequest.mockResolvedValue(null);

    const context = {};
    const auth = await requireAuth(context, { method: "GET", headers: {} });

    expect(auth).toBeNull();
    expect(context.res.status).toBe(401);
    expect(context.res.body.error.code).toBe("unauthorized");
  });

  it("enforces CSRF validation for mutating methods", async () => {
    session.loadSessionFromRequest.mockResolvedValue({
      sessionToken: "token-1",
      csrfToken: "csrf-1",
      session: {
        id: "session-id",
        isActive: true,
        csrfTokenHash: "csrf-hash",
        lastSeenAt: new Date().toISOString(),
        idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    session.validateCsrfFromRequest.mockReturnValue(false);

    const context = {};
    const auth = await requireAuth(context, { method: "POST", headers: {} });

    expect(auth).toBeNull();
    expect(context.res.status).toBe(403);
    expect(context.res.body.error.code).toBe("forbidden");
  });

  it("returns authenticated user for valid cookie session", async () => {
    const now = new Date();
    session.loadSessionFromRequest.mockResolvedValue({
      sessionToken: "token-1",
      csrfToken: "csrf-1",
      session: {
        id: "session-id",
        isActive: true,
        csrfTokenHash: "csrf-hash",
        lastSeenAt: now.toISOString(),
        idleExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    });

    const context = {};
    const auth = await requireAuth(context, { method: "GET", headers: {} });

    expect(auth).not.toBeNull();
    expect(auth.user.email).toBe("user@example.com");
    expect(session.touchSession).toHaveBeenCalledTimes(1);
  });
});
