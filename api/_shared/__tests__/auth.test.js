import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { requireAuth } = require("../auth");

const makeSwaHeader = (userDetails = "swa-user@example.com") =>
  Buffer.from(
    JSON.stringify({
      userDetails,
      identityProvider: "aad",
      userId: "swa-user-id",
      userRoles: ["authenticated"],
    }),
    "utf8"
  ).toString("base64");

describe("requireAuth", () => {
  it("uses Azure SWA principal when no app token is present", async () => {
    const context = {};
    const req = {
      headers: {
        "x-ms-client-principal": makeSwaHeader(),
      },
    };

    const auth = await requireAuth(context, req);

    expect(auth.user.email).toBe("swa-user@example.com");
    expect(auth.user.authType).toBe("aad");
    expect(context.res).toBeUndefined();
  });

  it("does not let Azure SWA principal override a present app token", async () => {
    const context = {};
    const req = {
      headers: {
        "x-auth-token": "not-a-valid-jwt",
        "x-ms-client-principal": makeSwaHeader(),
      },
    };

    const auth = await requireAuth(context, req);

    expect(auth).toBeNull();
    expect(context.res.status).toBe(401);
  });
});
