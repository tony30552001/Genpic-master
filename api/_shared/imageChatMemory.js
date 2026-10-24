/**
 * Per-user chat memory: one markdown document of preferences and rules that
 * every image chat follows. The user edits the whole document; the assistant
 * only appends lines to it.
 */

const { query } = require("./db");
const { ImageChatRequestError } = require("./imageChats");

const MAX_MEMORY_CHARS = 4000;

const toMemory = (row) => ({
  content: row?.content ?? "",
  updatedAt: row?.updated_at ?? null,
});

const getMemory = async ({ tenantId, userId }) => {
  const result = await query(
    `SELECT content, updated_at FROM image_chat_memories WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );
  return toMemory(result.rows[0]);
};

const validateMemoryRequest = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.content !== "string") {
    throw new ImageChatRequestError("記憶內容格式錯誤");
  }
  const content = body.content.trim();
  if (content.length > MAX_MEMORY_CHARS) {
    throw new ImageChatRequestError(`記憶不可超過 ${MAX_MEMORY_CHARS} 字`);
  }
  return content;
};

const saveMemory = async ({ tenantId, userId, content }) => {
  const result = await query(
    `INSERT INTO image_chat_memories (tenant_id, user_id, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET content = EXCLUDED.content, updated_at = now()
     RETURNING content, updated_at`,
    [tenantId, userId, content]
  );
  return toMemory(result.rows[0]);
};

/** Appends one bullet line per note, or fails when the document would exceed its limit. */
const appendMemoryNotes = async ({ tenantId, userId, notes }) => {
  const addition = notes.map((note) => `- ${note}`).join("\n");
  const result = await query(
    `INSERT INTO image_chat_memories AS m (tenant_id, user_id, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET
       content = CASE WHEN m.content = '' THEN $3 ELSE m.content || E'\\n' || $3 END,
       updated_at = now()
     WHERE length(m.content) + 1 + length($3) <= $4
     RETURNING content, updated_at`,
    [tenantId, userId, addition, MAX_MEMORY_CHARS]
  );
  if (!result.rows[0]) {
    throw new ImageChatRequestError(
      `偏好記憶已滿（上限 ${MAX_MEMORY_CHARS} 字），請先整理記憶後再重試`,
      "memory_full",
      409
    );
  }
  return toMemory(result.rows[0]);
};

module.exports = {
  MAX_MEMORY_CHARS,
  appendMemoryNotes,
  getMemory,
  saveMemory,
  validateMemoryRequest,
};
