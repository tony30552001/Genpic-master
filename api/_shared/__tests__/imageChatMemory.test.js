import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
db.query = vi.fn();

const memory = require("../imageChatMemory");

const owner = { tenantId: "t", userId: "u" };

describe("image chat memory", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads an empty memory for a user who has none", async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await memory.getMemory(owner)).toEqual({ content: "", updatedAt: null });
  });

  it("validates and trims the edited document", () => {
    expect(memory.validateMemoryRequest({ content: "  - 不要人臉 \n" })).toBe("- 不要人臉");
    expect(memory.validateMemoryRequest({ content: "" })).toBe("");
    expect(() => memory.validateMemoryRequest({ content: "字".repeat(memory.MAX_MEMORY_CHARS + 1) })).toThrow();
    expect(() => memory.validateMemoryRequest({ content: 1 })).toThrow();
    expect(() => memory.validateMemoryRequest(null)).toThrow();
  });

  it("appends one bullet per note under a length guard", async () => {
    db.query.mockResolvedValue({ rows: [{ content: "- a\n- b", updated_at: "now" }] });
    await memory.appendMemoryNotes({ ...owner, notes: ["a", "b"] });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("length(m.content) + 1 + length($3) <= $4");
    expect(params).toEqual(["t", "u", "- a\n- b", memory.MAX_MEMORY_CHARS]);
  });

  it("refuses to append when the document would exceed the limit", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(memory.appendMemoryNotes({ ...owner, notes: ["a"] }))
      .rejects.toMatchObject({ code: "memory_full", status: 409 });
  });
});
