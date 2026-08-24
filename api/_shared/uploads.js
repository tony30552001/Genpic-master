const { query, getPool } = require("./db");

const createPendingUpload = async ({
  tenantId,
  userId,
  purpose,
  originalFileName,
  contentType,
  sizeBytes,
  expiresAt,
}) => {
  const result = await query(
    `WITH candidate AS (
       SELECT gen_random_uuid() AS id
     )
     INSERT INTO uploads (
       id, tenant_id, user_id, purpose, original_file_name,
       content_type, size_bytes, blob_name, status, expires_at
     )
     SELECT
       id, $1, $2, $3, $4, $5, $6,
       'staging/' || id::text, 'pending', $7
     FROM candidate
     RETURNING *`,
    [tenantId, userId, purpose, originalFileName, contentType, sizeBytes, expiresAt]
  );
  return result.rows[0];
};

const getOwnedUpload = async ({ uploadId, tenantId, userId, purpose, status }) => {
  const predicates = ["id = $1", "tenant_id = $2", "user_id = $3"];
  const params = [uploadId, tenantId, userId];

  if (purpose) {
    params.push(purpose);
    predicates.push(`purpose = $${params.length}`);
  }
  if (status) {
    params.push(status);
    predicates.push(`status = $${params.length}`);
  }

  const result = await query(
    `SELECT *
     FROM uploads
     WHERE ${predicates.join(" AND ")}
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
};

const markUploadReady = async ({ uploadId, tenantId, userId, readyBlobName }) => {
  const result = await query(
    `UPDATE uploads
     SET status = 'ready',
         blob_name = $4,
         ready_at = now(),
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
       AND user_id = $3
       AND status = 'pending'
     RETURNING *`,
    [uploadId, tenantId, userId, readyBlobName]
  );
  return result.rows[0] || null;
};

const claimExpiredUploads = async ({ limit }) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM uploads
         WHERE status = 'pending'
           AND expires_at <= now()
           AND (
             cleanup_claimed_at IS NULL
             OR cleanup_claimed_at < now() - interval '15 minutes'
           )
         ORDER BY expires_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE uploads
       SET cleanup_claimed_at = now(),
           cleanup_attempts = uploads.cleanup_attempts + 1,
           updated_at = now()
       FROM candidate
       WHERE uploads.id = candidate.id
       RETURNING uploads.*`,
      [limit]
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const markUploadExpired = async ({ uploadId }) => {
  const result = await query(
    `UPDATE uploads
     SET status = 'expired',
         cleanup_claimed_at = NULL,
         last_cleanup_error = NULL,
         updated_at = now()
     WHERE id = $1
       AND status = 'pending'
     RETURNING *`,
    [uploadId]
  );
  return result.rows[0] || null;
};

const releaseUploadCleanupClaim = async ({ uploadId, errorCode }) => {
  const result = await query(
    `UPDATE uploads
     SET cleanup_claimed_at = NULL,
         last_cleanup_error = $2,
         updated_at = now()
     WHERE id = $1
       AND status = 'pending'
     RETURNING *`,
    [uploadId, errorCode]
  );
  return result.rows[0] || null;
};

module.exports = {
  claimExpiredUploads,
  createPendingUpload,
  getOwnedUpload,
  markUploadExpired,
  markUploadReady,
  releaseUploadCleanupClaim,
};
