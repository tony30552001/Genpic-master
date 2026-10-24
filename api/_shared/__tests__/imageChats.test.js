import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
db.query = vi.fn();
db.getPool = vi.fn();

const agent = require("../imageChatAgent");
const chats = require("../imageChats");
const { settleImageChatTurns } = require("../imageChatTurns");

const settings = { aspectRatio: "1:1", quality: null, imageLanguage: "zh-TW", purpose: "infographic" };
const turn = { settings, style: null, hasAttachment: false, hasSelectedImage: false };

describe("image chat agent contract", () => {
  it("offers refine only when a version is selected, and always offers memory", () => {
    expect(agent.toolsFor(turn).map((tool) => tool.name)).toEqual(["generate_image", "remember_preference"]);
    expect(agent.toolsFor({ ...turn, hasSelectedImage: true }).map((tool) => tool.name))
      .toEqual(["generate_image", "refine_image", "remember_preference"]);
    expect(agent.buildSystemMessage(turn)).toContain("目前沒有選取的圖片");
  });

  it("puts the user's memory in the system message", () => {
    expect(agent.buildSystemMessage({ ...turn, memory: "- 不要人臉" })).toContain("- 不要人臉");
    expect(agent.buildSystemMessage(turn)).toContain("（目前沒有）");
  });

  it("resolves images and memory notes from the tool calls", () => {
    expect(agent.resolveDecision([], turn)).toEqual({ images: [], notes: [] });
    expect(agent.resolveDecision([{ name: "generate_image", arguments: { prompt: " 貓 " } }], turn))
      .toEqual({ images: [{ action: "generate", prompt: "貓", purpose: "infographic" }], notes: [] });
    expect(agent.resolveDecision(
      [{ name: "generate_image", arguments: { prompt: "貓", purpose: "storyboard" } }], turn
    ).images[0]).toMatchObject({ purpose: "storyboard" });
    expect(agent.resolveDecision(
      [{ name: "refine_image", arguments: { instruction: "改藍色" } }], { ...turn, hasSelectedImage: true }
    )).toEqual({ images: [{ action: "refine", prompt: "改藍色" }], notes: [] });
    expect(agent.resolveDecision([
      { name: "generate_image", arguments: { prompt: "春" } },
      { name: "remember_preference", arguments: { note: " - 一律\n  16:9 " } },
      { name: "generate_image", arguments: { prompt: "秋" } },
    ], turn)).toEqual({
      images: [
        { action: "generate", prompt: "春", purpose: "infographic" },
        { action: "generate", prompt: "秋", purpose: "infographic" },
      ],
      notes: ["一律 16:9"],
    });
  });

  const call = (prompt) => ({ name: "generate_image", arguments: { prompt } });
  it.each([
    [[call("a"), call("b"), call("c"), call("d"), call("e")]],
    [Array.from({ length: 4 }, () => ({ name: "remember_preference", arguments: { note: "x" } }))],
    [[{ name: "remember_preference", arguments: { note: "  " } }]],
    [[{ name: "remember_preference", arguments: { note: "x".repeat(201) } }]],
    [[call("  ")]],
    [[call("x".repeat(4001))]],
    [[{ name: "generate_image", arguments: { prompt: "a", purpose: "poster" } }]],
    [[{ name: "refine_image", arguments: { instruction: "a" } }]],
    [[{ name: "delete_everything", arguments: {} }]],
  ])("rejects invalid tool calls %#", (calls) => {
    expect(() => agent.resolveDecision(calls, turn)).toThrow(agent.ImageChatDecisionError);
  });

  it("keeps the newest history within budget, starting with a user turn", () => {
    const history = [
      { role: "user", content: "a".repeat(10000) },
      { role: "assistant", content: "舊回覆", images: [], status: "completed", input: {} },
      { role: "user", content: "改成夜景" },
      {
        role: "assistant", content: "好", status: "image_pending",
        images: [
          { action: "generate", prompt: "night city" },
          { action: "refine", prompt: "add rain" },
        ],
        input: { memoryNotes: ["偏好夜景"] },
      },
    ];
    const messages = agent.buildModelMessages(history, "b".repeat(6000));
    expect(messages).toEqual([
      { role: "user", content: "改成夜景" },
      {
        role: "assistant",
        content: "好\n[已送出生成新圖：night city]\n[已送出修改圖片：add rain]\n[已記住：偏好夜景]",
      },
      { role: "user", content: "b".repeat(6000) },
    ]);
  });
});

describe("image chat persistence", () => {
  let client;
  beforeEach(() => {
    vi.resetAllMocks();
    client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
  });

  it("validates state and settings strictly", () => {
    expect(chats.validateStateRequest({ stateVersion: 1, draft: " x ", settings, selectedJobId: null }))
      .toEqual({ stateVersion: 1, draft: "x", settings, selectedJobId: null });
    expect(() => chats.validateSettings({ ...settings, imageLanguage: "xx" })).toThrow(chats.ImageChatRequestError);
    expect(() => chats.validateStateRequest({ stateVersion: 0, draft: "", settings })).toThrow();
  });

  it("pages chats by an exact updated_at cursor", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `t${index}`,
      updated_at: new Date(),
      updated_at_key: "2025-01-01 00:00:00.123456+00",
    }));
    db.query.mockResolvedValueOnce({ rows });
    const page = await chats.listChats({ tenantId: "t", userId: "u" });
    expect(page.items).toHaveLength(30);
    db.query.mockResolvedValueOnce({ rows: [] });
    await chats.listChats({ tenantId: "t", userId: "u", cursor: page.nextCursor });
    expect(db.query.mock.calls[1][1]).toEqual([
      "t", "u", "2025-01-01 00:00:00.123456+00", rows[29].id, 31,
    ]);
    await expect(chats.listChats({ tenantId: "t", userId: "u", cursor: "bad" })).rejects.toMatchObject({ status: 400 });
  });

  it("maps a second concurrent turn to turn_in_progress and rolls back", async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "chat" }] })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(chats.beginTurn(
      { tenantId: "t", userId: "u", chatId: "chat" },
      { turnId: "turn", content: "hi", settings, style: null, attachmentUploadId: null, sourceJobId: null }
    )).rejects.toMatchObject({ status: 409, code: "turn_in_progress" });
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("refuses to link a job to a reply that is no longer open", async () => {
    await expect(chats.attachImageJob(client, {
      messageId: "m", action: "generate", job: { id: "job" }, sourceJobId: null, content: "", prompt: "p", position: 0,
    })).rejects.toMatchObject({ code: "turn_stopped" });
    expect(client.query.mock.calls[0][0]).toContain("status IN ('responding', 'image_pending')");
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("links each job to its reply by position", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "m" }] }).mockResolvedValueOnce({ rows: [] });
    await chats.attachImageJob(client, {
      messageId: "m", action: "refine", job: { id: "job" }, sourceJobId: "src", content: "好", prompt: "p", position: 2,
    });
    expect(client.query.mock.calls[1][1]).toEqual(["job", "m", 2, "refine", "src", "p"]);
  });

  it("distinguishes a missing chat from a state conflict", async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "c", state_version: 4 }] });
    await expect(chats.saveChatState(
      { tenantId: "t", userId: "u", chatId: "c" },
      { stateVersion: 3, draft: "", settings, selectedJobId: null }
    )).rejects.toMatchObject({ code: "state_conflict", chat: expect.objectContaining({ stateVersion: 4 }) });

    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(chats.deleteChat({ tenantId: "t", userId: "u", chatId: "c" }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe("chat turn settlement", () => {
  let client;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
  });

  const lockedTurn = (overrides) => ({
    id: "m1", tenant_id: "t", user_id: "u", request: { style: { id: "s1", prompt: "watercolor" } }, ...overrides,
  });
  const image = (overrides) => ({
    job_id: "job-1", status: "succeeded", model: "flare", prompt: "full prompt", script: "a cat",
    error_code: null, error_message: null, ...overrides,
  });
  const settleWith = async (images, turn = lockedTurn()) => {
    db.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: turn.id }] });
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [turn] })
      .mockResolvedValueOnce({ rows: images });
    await settleImageChatTurns();
  };
  const sqlCalls = () => client.query.mock.calls.map(([sql]) => sql);

  it("records a succeeded job in history once and completes the turn", async () => {
    await settleWith([image()]);
    const insert = client.query.mock.calls[3];
    expect(insert[0]).toContain("ON CONFLICT (image_job_id) WHERE source = 'chat' DO NOTHING");
    expect(insert[1]).toEqual([
      "t", "u", "full prompt", "/api/image-jobs/job-1/image", "a cat", "watercolor", "flare", "s1", "chat", "job-1",
    ]);
    expect(client.query.mock.calls[4][0]).toContain("status = 'completed'");
    expect(client.query.mock.calls[5][0]).toBe("COMMIT");
  });

  it("waits until every image of the turn has finished", async () => {
    await settleWith([image(), image({ job_id: "job-2", status: "processing" })]);
    expect(sqlCalls()).toEqual([
      "BEGIN", expect.stringContaining("FOR UPDATE OF m SKIP LOCKED"), expect.stringContaining("image_chat_images"), "ROLLBACK",
    ]);
  });

  it("completes a turn with partial success and records only the succeeded images", async () => {
    await settleWith([
      image({ job_id: "job-1", status: "failed", error_code: "content_filter", error_message: "blocked" }),
      image({ job_id: "job-2", script: "autumn" }),
    ]);
    const inserts = client.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO history"));
    expect(inserts.map(([, params]) => params[9])).toEqual(["job-2"]);
    expect(sqlCalls().some((sql) => sql.includes("status = 'completed'"))).toBe(true);
    expect(sqlCalls().some((sql) => sql.includes("status = 'failed'"))).toBe(false);
  });

  it("fails the turn with the first job error when no image succeeded", async () => {
    await settleWith([
      image({ status: "failed", error_code: "content_filter", error_message: "blocked" }),
      image({ job_id: "job-2", status: "failed", error_code: "other", error_message: "later" }),
    ]);
    const failed = client.query.mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(failed[1]).toEqual(["m1", "content_filter", "blocked"]);
    expect(sqlCalls().some((sql) => sql.includes("INSERT INTO history"))).toBe(false);
  });

  it("keeps settling the batch after one turn fails to settle", async () => {
    db.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: "m1" }, { id: "m2" }] });
    client.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("lock failed"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [lockedTurn({ id: "m2" })] })
      .mockResolvedValueOnce({ rows: [image()] });
    await settleImageChatTurns();
    expect(client.query.mock.calls.some(([sql, params]) => sql.includes("status = 'completed'") && params[0] === "m2"))
      .toBe(true);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
