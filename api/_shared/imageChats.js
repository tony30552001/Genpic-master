/**
 * Image-chat persistence: request validation, owned-row access, and the
 * conditional writes that move one turn through its states.
 *
 * Every write that ends a reply is conditional on `status = 'responding'`, so
 * whichever of the streaming request, the stop endpoint, or the stale-turn
 * sweep acts first wins and the others become no-ops.
 */

const { getPool, query } = require("./db");
const { ASPECT_RATIOS } = require("./gptImage");
const { MAX_USER_MESSAGE_CHARS } = require("./imageChatAgent");
const { imageJobImagePath } = require("./imageChatTurns");
const { IMAGE_PURPOSES } = require("./imagePrompt");
const { IMAGE_TEXT_LANGUAGES, NO_TEXT } = require("./imageTextLanguage");

const CHAT_PAGE_SIZE = 30;
const MESSAGE_PAGE_SIZE = 50;
const MAX_TITLE_CHARS = 40;
const MAX_STYLE_NAME_CHARS = 100;
const MAX_STYLE_PROMPT_CHARS = 4000;
const MAX_STYLE_TAGS = 20;
const MAX_STYLE_TAG_CHARS = 40;
const MAX_QUALITY_CHARS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_LANGUAGES = Object.freeze([NO_TEXT, ...Object.keys(IMAGE_TEXT_LANGUAGES)]);

class ImageChatRequestError extends Error {
  constructor(message, code = "bad_request", status = 400) {
    super(message);
    this.name = "ImageChatRequestError";
    this.code = code;
    this.status = status;
  }
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

const requireUuid = (value, label) => {
  if (!isUuid(value)) throw new ImageChatRequestError(`${label}格式錯誤`);
  return value.toLowerCase();
};

const optionalUuid = (value, label) =>
  value === undefined || value === null ? null : requireUuid(value, label);

const boundedString = (value, label, max, { allowEmpty = true } = {}) => {
  if (typeof value !== "string") throw new ImageChatRequestError(`${label}格式錯誤`);
  const text = value.trim();
  if (!allowEmpty && !text) throw new ImageChatRequestError(`${label}不可空白`);
  if (text.length > max) throw new ImageChatRequestError(`${label}不可超過 ${max} 字`);
  return text;
};

/** Creation settings stored on the chat and snapshotted on each user message. */
const validateSettings = (value) => {
  if (!isPlainObject(value)) throw new ImageChatRequestError("缺少生圖設定");
  const { aspectRatio, quality, imageLanguage, purpose } = value;
  if (!ASPECT_RATIOS.includes(aspectRatio)) throw new ImageChatRequestError("不支援的圖片比例");
  if (!IMAGE_LANGUAGES.includes(imageLanguage)) throw new ImageChatRequestError("不支援的圖片文字語言");
  if (!IMAGE_PURPOSES.includes(purpose)) throw new ImageChatRequestError("不支援的畫面用途");
  return {
    aspectRatio,
    quality: quality === undefined || quality === null
      ? null
      : boundedString(quality, "圖片品質", MAX_QUALITY_CHARS, { allowEmpty: false }),
    imageLanguage,
    purpose,
  };
};

const validateStyle = (value) => {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) throw new ImageChatRequestError("風格格式錯誤");
  const tags = value.tags ?? [];
  if (!Array.isArray(tags) || tags.length > MAX_STYLE_TAGS) {
    throw new ImageChatRequestError("風格標籤格式錯誤");
  }
  return {
    id: optionalUuid(value.id, "風格 ID "),
    name: boundedString(value.name ?? "", "風格名稱", MAX_STYLE_NAME_CHARS),
    prompt: boundedString(value.prompt, "風格描述", MAX_STYLE_PROMPT_CHARS, { allowEmpty: false }),
    tags: tags.map((tag) => boundedString(tag, "風格標籤", MAX_STYLE_TAG_CHARS, { allowEmpty: false })),
  };
};

const validateTurnRequest = (body) => {
  if (!isPlainObject(body)) throw new ImageChatRequestError("請求格式錯誤");
  if (Object.prototype.hasOwnProperty.call(body, "model")) {
    throw new ImageChatRequestError("模型由租戶政策決定");
  }
  return {
    turnId: requireUuid(body.clientMessageId, "訊息 ID "),
    content: boundedString(body.content, "訊息", MAX_USER_MESSAGE_CHARS, { allowEmpty: false }),
    settings: validateSettings(body.settings),
    style: validateStyle(body.style),
    attachmentUploadId: optionalUuid(body.attachmentUploadId, "附圖 ID "),
    sourceJobId: optionalUuid(body.sourceJobId, "圖片版本 ID "),
  };
};

const validateStateRequest = (body) => {
  if (!isPlainObject(body)) throw new ImageChatRequestError("請求格式錯誤");
  if (!Number.isInteger(body.stateVersion) || body.stateVersion < 1) {
    throw new ImageChatRequestError("缺少狀態版本");
  }
  return {
    stateVersion: body.stateVersion,
    draft: boundedString(body.draft, "草稿", MAX_USER_MESSAGE_CHARS),
    settings: validateSettings(body.settings),
    selectedJobId: optionalUuid(body.selectedJobId, "圖片版本 ID "),
  };
};

const toChat = (row) => ({
  id: row.id,
  title: row.title,
  draft: row.draft,
  settings: row.settings,
  selectedJobId: row.selected_job_id,
  stateVersion: row.state_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toChatSummary = (row) => ({
  id: row.id,
  title: row.title,
  updatedAt: row.updated_at,
});

const toMessage = (row) => ({
  id: row.id,
  turnId: row.turn_id,
  seq: Number(row.seq),
  role: row.role,
  content: row.content,
  input: row.input,
  action: row.action,
  imageJobId: row.image_job_id,
  sourceJobId: row.source_job_id,
  imageUrl: row.job_status === "succeeded" ? imageJobImagePath(row.image_job_id) : null,
  status: row.status,
  error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
  createdAt: row.created_at,
});

const CHAT_COLUMNS = `id, title, draft, settings, selected_job_id, state_version, created_at, updated_at`;

const MESSAGE_SELECT = `
  SELECT m.id, m.turn_id, m.seq, m.role, m.content, m.input, m.action,
         m.image_job_id, m.source_job_id, m.status, m.error_code, m.error_message,
         m.created_at, j.status AS job_status
  FROM image_chat_messages m
  LEFT JOIN image_generation_jobs j ON j.id = m.image_job_id`;

const encodeCursor = (row) =>
  Buffer.from(`${row.updated_at_key}|${row.id}`, "utf8").toString("base64url");

const decodeCursor = (cursor) => {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  const [updatedAt, id] = Buffer.from(String(cursor), "base64url").toString("utf8").split("|");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt)) || !isUuid(id)) {
    throw new ImageChatRequestError("分頁游標格式錯誤");
  }
  return { updatedAt, id };
};

const listChats = async ({ tenantId, userId, cursor }) => {
  const after = decodeCursor(cursor);
  const result = await query(
    `SELECT id, title, updated_at, updated_at::text AS updated_at_key
     FROM image_chats
     WHERE tenant_id = $1 AND user_id = $2
       AND ($3::timestamptz IS NULL OR (updated_at, id) < ($3::timestamptz, $4::uuid))
     ORDER BY updated_at DESC, id DESC
     LIMIT $5`,
    [tenantId, userId, after?.updatedAt ?? null, after?.id ?? null, CHAT_PAGE_SIZE + 1]
  );
  const rows = result.rows.slice(0, CHAT_PAGE_SIZE);
  return {
    items: rows.map(toChatSummary),
    nextCursor: result.rows.length > CHAT_PAGE_SIZE ? encodeCursor(rows[rows.length - 1]) : null,
  };
};

const createChat = async ({ tenantId, userId, settings }) => {
  const result = await query(
    `INSERT INTO image_chats (tenant_id, user_id, settings)
     VALUES ($1, $2, $3)
     RETURNING ${CHAT_COLUMNS}`,
    [tenantId, userId, settings]
  );
  return toChat(result.rows[0]);
};

const getChatRow = async ({ tenantId, userId, chatId }) => {
  const result = await query(
    `SELECT ${CHAT_COLUMNS}
     FROM image_chats
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [chatId, tenantId, userId]
  );
  return result.rows[0] || null;
};

const requireChat = async (owner) => {
  const row = await getChatRow(owner);
  if (!row) throw new ImageChatRequestError("找不到對話", "not_found", 404);
  return toChat(row);
};

/** Newest page of messages before `before` (a seq), returned oldest first. */
const listMessages = async ({ chatId, before = null, limit = MESSAGE_PAGE_SIZE }) => {
  const result = await query(
    `${MESSAGE_SELECT}
     WHERE m.chat_id = $1 AND ($2::bigint IS NULL OR m.seq < $2::bigint)
     ORDER BY m.seq DESC
     LIMIT $3`,
    [chatId, before, limit + 1]
  );
  const rows = result.rows.slice(0, limit).reverse();
  return {
    items: rows.map(toMessage),
    nextBefore: result.rows.length > limit ? Number(rows[0].seq) : null,
  };
};

const parseBefore = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const before = Number(value);
  if (!Number.isSafeInteger(before) || before < 1) {
    throw new ImageChatRequestError("分頁參數格式錯誤");
  }
  return before;
};

const getTurnMessages = async ({ chatId, turnId }) => {
  const result = await query(`${MESSAGE_SELECT} WHERE m.chat_id = $1 AND m.turn_id = $2`, [
    chatId,
    turnId,
  ]);
  const messages = result.rows.map(toMessage);
  return {
    userMessage: messages.find((message) => message.role === "user") || null,
    assistantMessage: messages.find((message) => message.role === "assistant") || null,
  };
};

const getMessage = async (messageId) => {
  const result = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [messageId]);
  return result.rows[0] ? toMessage(result.rows[0]) : null;
};

/** Earlier messages, oldest first, that the agent may use as context. */
const listContextMessages = async ({ chatId, limit }) => {
  const result = await query(
    `SELECT role, content, input, action, status
     FROM image_chat_messages
     WHERE chat_id = $1
     ORDER BY seq DESC
     LIMIT $2`,
    [chatId, limit]
  );
  return result.rows.reverse();
};

const requireOwnedSucceededJob = async ({ tenantId, userId, jobId }) => {
  const result = await query(
    `SELECT id
     FROM image_generation_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'succeeded'`,
    [jobId, tenantId, userId]
  );
  if (!result.rows[0]) {
    throw new ImageChatRequestError("找不到可修改的圖片版本", "source_job_not_found", 404);
  }
};

const saveChatState = async (owner, state) => {
  if (state.selectedJobId) {
    await requireOwnedSucceededJob({ ...owner, jobId: state.selectedJobId });
  }
  const result = await query(
    `UPDATE image_chats
     SET draft = $4, settings = $5, selected_job_id = $6, state_version = state_version + 1
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND state_version = $7
     RETURNING ${CHAT_COLUMNS}`,
    [
      owner.chatId,
      owner.tenantId,
      owner.userId,
      state.draft,
      state.settings,
      state.selectedJobId,
      state.stateVersion,
    ]
  );
  if (result.rows[0]) return toChat(result.rows[0]);
  const current = await requireChat(owner);
  const conflict = new ImageChatRequestError("對話狀態已在其他視窗更新", "state_conflict", 409);
  conflict.chat = current;
  throw conflict;
};

const deleteChat = async (owner) => {
  const result = await query(
    `DELETE FROM image_chats c
     WHERE c.id = $1 AND c.tenant_id = $2 AND c.user_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM image_chat_messages m
         WHERE m.chat_id = c.id AND m.status IN ('responding', 'image_pending')
       )
     RETURNING c.id`,
    [owner.chatId, owner.tenantId, owner.userId]
  );
  if (result.rows[0]) return;
  await requireChat(owner);
  throw new ImageChatRequestError("對話仍在回覆或生成圖片，請稍後再刪除", "chat_busy", 409);
};

/**
 * Records the user message and an empty responding reply in one transaction.
 * The one-responding-turn index rejects a second concurrent turn in the chat.
 */
const beginTurn = async (owner, turn) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const chat = await client.query(
      `SELECT id FROM image_chats
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3
       FOR UPDATE`,
      [owner.chatId, owner.tenantId, owner.userId]
    );
    if (!chat.rows[0]) throw new ImageChatRequestError("找不到對話", "not_found", 404);

    const userInput = {
      settings: turn.settings,
      style: turn.style,
      attachmentUploadId: turn.attachmentUploadId,
      sourceJobId: turn.sourceJobId,
    };
    await client.query(
      `INSERT INTO image_chat_messages (chat_id, turn_id, role, content, input, status)
       VALUES ($1, $2, 'user', $3, $4, 'completed')`,
      [owner.chatId, turn.turnId, turn.content, userInput]
    );
    await client.query(
      `INSERT INTO image_chat_messages (chat_id, turn_id, role, status)
       VALUES ($1, $2, 'assistant', 'responding')`,
      [owner.chatId, turn.turnId]
    );
    await client.query(
      `UPDATE image_chats
       SET title = CASE WHEN title = '' THEN $2 ELSE title END, updated_at = now()
       WHERE id = $1`,
      [owner.chatId, turn.content.slice(0, MAX_TITLE_CHARS)]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err?.code === "23505") {
      throw new ImageChatRequestError("這個對話正在回覆中，請稍候", "turn_in_progress", 409);
    }
    throw err;
  } finally {
    client.release();
  }
  return getTurnMessages({ chatId: owner.chatId, turnId: turn.turnId });
};

const completeReply = (messageId, content) =>
  query(
    `UPDATE image_chat_messages
     SET status = 'completed', content = $2, updated_at = now()
     WHERE id = $1 AND status = 'responding'`,
    [messageId, content]
  );

const endReply = (messageId, { status, content, code, message }) =>
  query(
    `UPDATE image_chat_messages
     SET status = $2, content = $3, error_code = $4, error_message = $5, updated_at = now()
     WHERE id = $1 AND status = 'responding'`,
    [messageId, status, content, code, message]
  );

/**
 * Runs inside `createImageJob`'s transaction, so the job exists only if the
 * reply was still responding and now points at it.
 */
const attachImageJob = async (client, { messageId, action, job, sourceJobId, content, prompt }) => {
  const result = await client.query(
    `UPDATE image_chat_messages
     SET status = 'image_pending', action = $2, image_job_id = $3, source_job_id = $4,
         content = $5, input = $6, updated_at = now()
     WHERE id = $1 AND status = 'responding'
     RETURNING id`,
    [messageId, action, job.id, sourceJobId, content, { prompt }]
  );
  if (!result.rows[0]) {
    throw new ImageChatRequestError("回覆已停止，未建立圖片工作", "turn_stopped", 409);
  }
};

const stopTurn = async (owner, turnId) => {
  await requireChat(owner);
  const result = await query(
    `UPDATE image_chat_messages
     SET status = 'interrupted', error_code = 'stopped', error_message = '已停止回覆',
         updated_at = now()
     WHERE chat_id = $1 AND turn_id = $2 AND role = 'assistant' AND status = 'responding'
     RETURNING id`,
    [owner.chatId, turnId]
  );
  return Boolean(result.rows[0]);
};

module.exports = {
  ImageChatRequestError,
  attachImageJob,
  beginTurn,
  completeReply,
  createChat,
  deleteChat,
  endReply,
  getMessage,
  getTurnMessages,
  listChats,
  listContextMessages,
  listMessages,
  parseBefore,
  requireChat,
  requireOwnedSucceededJob,
  requireUuid,
  saveChatState,
  stopTurn,
  validateSettings,
  validateStateRequest,
  validateTurnRequest,
};
