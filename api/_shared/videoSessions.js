/**
 * Video creation sessions. The browser owns the session state (storyboard
 * conversation, board, settings and video turns) and saves it as one opaque
 * snapshot; the server stores it per owner and rejects stale writes through
 * `state_version`.
 */

const { query } = require("./db");

const PAGE_SIZE = 30;
const MAX_TITLE_CHARS = 40;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class VideoSessionError extends Error {
  constructor(message, code = "bad_request", status = 400) {
    super(message);
    this.name = "VideoSessionError";
    this.code = code;
    this.status = status;
  }
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

const requireSessionId = (value) => {
  if (!isUuid(value)) throw new VideoSessionError("創作紀錄 ID 格式錯誤");
  return value.toLowerCase();
};

const validateSnapshot = (body) => {
  if (!isPlainObject(body)) throw new VideoSessionError("請求格式錯誤");
  if (typeof body.title !== "string") throw new VideoSessionError("標題格式錯誤");
  const title = body.title.trim();
  if (title.length > MAX_TITLE_CHARS) {
    throw new VideoSessionError(`標題不可超過 ${MAX_TITLE_CHARS} 字`);
  }
  if (!isPlainObject(body.state)) throw new VideoSessionError("缺少創作內容");
  if (Buffer.byteLength(JSON.stringify(body.state), "utf8") > MAX_STATE_BYTES) {
    throw new VideoSessionError("創作內容過大，請開新的創作", "state_too_large", 413);
  }
  return { title, state: body.state };
};

const validateUpdate = (body) => {
  const snapshot = validateSnapshot(body);
  if (!Number.isInteger(body.stateVersion) || body.stateVersion < 1) {
    throw new VideoSessionError("缺少狀態版本");
  }
  return { ...snapshot, stateVersion: body.stateVersion };
};

const COLUMNS = "id, title, state, state_version, created_at, updated_at";

const toSession = (row) => ({
  id: row.id,
  title: row.title,
  state: row.state,
  stateVersion: row.state_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSummary = (row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at });

const encodeCursor = (row) =>
  Buffer.from(`${row.updated_at_key}|${row.id}`, "utf8").toString("base64url");

const decodeCursor = (cursor) => {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  const [updatedAt, id] = Buffer.from(String(cursor), "base64url").toString("utf8").split("|");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt)) || !isUuid(id)) {
    throw new VideoSessionError("分頁游標格式錯誤");
  }
  return { updatedAt, id };
};

const listSessions = async ({ tenantId, userId, cursor }) => {
  const after = decodeCursor(cursor);
  const result = await query(
    `SELECT id, title, updated_at, updated_at::text AS updated_at_key
     FROM video_sessions
     WHERE tenant_id = $1 AND user_id = $2
       AND ($3::timestamptz IS NULL OR (updated_at, id) < ($3::timestamptz, $4::uuid))
     ORDER BY updated_at DESC, id DESC
     LIMIT $5`,
    [tenantId, userId, after?.updatedAt ?? null, after?.id ?? null, PAGE_SIZE + 1]
  );
  const rows = result.rows.slice(0, PAGE_SIZE);
  return {
    items: rows.map(toSummary),
    nextCursor: result.rows.length > PAGE_SIZE ? encodeCursor(rows[rows.length - 1]) : null,
  };
};

const createSession = async ({ tenantId, userId, title, state }) => {
  const result = await query(
    `INSERT INTO video_sessions (tenant_id, user_id, title, state)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [tenantId, userId, title, state]
  );
  return toSession(result.rows[0]);
};

const getSession = async ({ tenantId, userId, sessionId }) => {
  const result = await query(
    `SELECT ${COLUMNS}
     FROM video_sessions
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [sessionId, tenantId, userId]
  );
  if (!result.rows[0]) throw new VideoSessionError("找不到創作紀錄", "not_found", 404);
  return toSession(result.rows[0]);
};

const saveSession = async ({ tenantId, userId, sessionId }, { title, state, stateVersion }) => {
  const result = await query(
    `UPDATE video_sessions
     SET title = $4, state = $5, state_version = state_version + 1, updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND state_version = $6
     RETURNING ${COLUMNS}`,
    [sessionId, tenantId, userId, title, state, stateVersion]
  );
  if (result.rows[0]) return toSession(result.rows[0]);
  await getSession({ tenantId, userId, sessionId });
  throw new VideoSessionError("這段創作已在其他視窗更新", "state_conflict", 409);
};

const deleteSession = async ({ tenantId, userId, sessionId }) => {
  const result = await query(
    `DELETE FROM video_sessions
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     RETURNING id`,
    [sessionId, tenantId, userId]
  );
  if (!result.rows[0]) throw new VideoSessionError("找不到創作紀錄", "not_found", 404);
};

module.exports = {
  MAX_STATE_BYTES,
  VideoSessionError,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  requireSessionId,
  saveSession,
  validateSnapshot,
  validateUpdate,
};
