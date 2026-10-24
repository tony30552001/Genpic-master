/**
 * Server-side completion of chat turns.
 *
 * A chat turn that queued images stays `image_pending` until every one of its
 * jobs ends. The image-job worker settles those turns here, so results land in
 * history even when no browser is watching, and exactly once: the message row
 * is locked and moved out of `image_pending` in the same transaction that
 * writes the history rows, and history has a unique chat-job key. A turn is
 * completed when at least one image succeeded; each image keeps its own status.
 */

const { getPool, query } = require("./db");
const { CHAT_HISTORY_SOURCE } = require("./historySource");

/** A model call is capped well below this, so an older responding turn lost its process. */
const RESPONDING_TIMEOUT_MINUTES = 2;
const SETTLE_BATCH_SIZE = 20;
const TERMINAL_JOB_STATUSES = ["succeeded", "failed"];

/** Same-origin API path the browser can load with its session cookie. */
const imageJobImagePath = (jobId) => `/api/image-jobs/${jobId}/image`;

const interruptStaleTurns = () =>
  query(
    `UPDATE image_chat_messages
     SET status = 'interrupted',
         error_code = 'turn_timeout',
         error_message = '回覆逾時中斷，請重新送出',
         updated_at = now()
     WHERE status = 'responding'
       AND updated_at < now() - make_interval(mins => $1)`,
    [RESPONDING_TIMEOUT_MINUTES]
  );

const settleTurn = async (messageId) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT m.id, u.input AS request, c.tenant_id, c.user_id
       FROM image_chat_messages m
       JOIN image_chats c ON c.id = m.chat_id
       LEFT JOIN image_chat_messages u
         ON u.chat_id = m.chat_id AND u.turn_id = m.turn_id AND u.role = 'user'
       WHERE m.id = $1 AND m.status = 'image_pending'
       FOR UPDATE OF m SKIP LOCKED`,
      [messageId]
    );
    const turn = locked.rows[0];
    if (!turn) {
      await client.query("ROLLBACK");
      return;
    }
    const images = (
      await client.query(
        `SELECT i.job_id, i.prompt AS script, j.status, j.model, j.prompt,
                j.error_code, j.error_message
         FROM image_chat_images i
         JOIN image_generation_jobs j ON j.id = i.job_id
         WHERE i.message_id = $1
         ORDER BY i.position`,
        [messageId]
      )
    ).rows;
    if (images.some((image) => !TERMINAL_JOB_STATUSES.includes(image.status))) {
      await client.query("ROLLBACK");
      return;
    }

    const style = turn.request?.style || null;
    const succeeded = images.filter((image) => image.status === "succeeded");
    for (const image of succeeded) {
      await client.query(
        `INSERT INTO history
           (tenant_id, user_id, prompt, image_url, user_script, style_prompt,
            model, style_id, source, image_job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 (SELECT id FROM styles WHERE id = $8::uuid AND tenant_id = $1),
                 $9, $10)
         ON CONFLICT (image_job_id) WHERE source = 'chat' DO NOTHING`,
        [
          turn.tenant_id,
          turn.user_id,
          image.prompt,
          imageJobImagePath(image.job_id),
          image.script || null,
          style?.prompt || null,
          image.model,
          style?.id || null,
          CHAT_HISTORY_SOURCE,
          image.job_id,
        ]
      );
    }
    if (succeeded.length > 0) {
      await client.query(
        `UPDATE image_chat_messages
         SET status = 'completed', updated_at = now()
         WHERE id = $1`,
        [turn.id]
      );
    } else {
      const [failure] = images;
      await client.query(
        `UPDATE image_chat_messages
         SET status = 'failed', error_code = $2, error_message = $3, updated_at = now()
         WHERE id = $1`,
        [
          turn.id,
          failure.error_code || "generation_failed",
          failure.error_message || "圖片生成失敗，請稍後重試",
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/** Settles turns whose image jobs all finished and interrupts abandoned replies. */
const settleImageChatTurns = async () => {
  await interruptStaleTurns();
  const ready = await query(
    `SELECT m.id
     FROM image_chat_messages m
     WHERE m.status = 'image_pending'
       AND NOT EXISTS (
         SELECT 1
         FROM image_chat_images i
         JOIN image_generation_jobs j ON j.id = i.job_id
         WHERE i.message_id = m.id AND j.status <> ALL($2::text[])
       )
     ORDER BY m.updated_at
     LIMIT $1`,
    [SETTLE_BATCH_SIZE, TERMINAL_JOB_STATUSES]
  );
  for (const row of ready.rows) {
    try {
      await settleTurn(row.id);
    } catch (error) {
      // One unsettleable turn must not block the rest of the batch; it is retried next cycle.
      console.error("[image-chats] Turn settlement failed:", {
        messageId: row.id,
        code: error?.code,
      });
    }
  }
};

module.exports = {
  RESPONDING_TIMEOUT_MINUTES,
  imageJobImagePath,
  settleImageChatTurns,
};
