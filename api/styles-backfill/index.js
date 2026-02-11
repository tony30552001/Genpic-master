const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { embedText } = require("../_shared/gemini");
const { toVectorString } = require("../_shared/vector");

const buildEmbeddingText = (row) => {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return [row.prompt, row.description, tags.length > 0 ? tags.join(",") : null]
    .filter(Boolean)
    .join("\n");
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  const requestedLimit = Number(req.body?.limit || 25);
  const limit = Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 25, 100);
  const dryRun = Boolean(req.body?.dryRun);

  try {
    const pending = await query(
      "SELECT id, prompt, description, tags FROM styles WHERE tenant_id = $1 AND embedding IS NULL ORDER BY created_at ASC LIMIT $2",
      [identity.tenantId, limit]
    );

    const modelName = process.env.EMBEDDING_MODEL || "text-embedding-004";
    let updated = 0;
    const failed = [];

    for (const row of pending.rows) {
      const text = buildEmbeddingText(row);
      if (!text) {
        failed.push({ id: row.id, reason: "empty_source" });
        continue;
      }

      try {
        const values = await embedText(modelName, text);
        if (!Array.isArray(values)) {
          failed.push({ id: row.id, reason: "embedding_failed" });
          continue;
        }

        const vectorString = toVectorString(values);
        if (!dryRun) {
          await query(
            "UPDATE styles SET embedding = $2::vector WHERE id = $1 AND tenant_id = $3",
            [row.id, vectorString, identity.tenantId]
          );
        }
        updated += 1;
      } catch (err) {
        failed.push({ id: row.id, reason: "embedding_failed" });
      }
    }

    const remainingResult = await query(
      "SELECT COUNT(*) AS remaining FROM styles WHERE tenant_id = $1 AND embedding IS NULL",
      [identity.tenantId]
    );
    const remaining = Number(remainingResult.rows[0]?.remaining || 0);

    context.res = ok({
      processed: pending.rows.length,
      updated,
      failed,
      remaining,
      dryRun,
    });
  } catch (err) {
    context.res = error("回補失敗", "backfill_failed", 502);
  }
};
