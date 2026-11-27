const { query } = require("../_shared/db");
const { ok, error } = require("../_shared/http");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DAY = 86_400_000;

// Dates in the report are inclusive Taiwan calendar dates, not the DB server's local dates.
const midnight = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return NaN;
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return NaN;
  return Date.parse(`${value}T00:00:00+08:00`);
};

const handleVideoUsage = async (context, req, { tenantId }) => {
  const { userId, modelKey, from, to } = req.query || {};
  const start = from == null ? null : midnight(from);
  const end = to == null ? null : midnight(to);
  if ((userId != null && (typeof userId !== "string" || !UUID.test(userId)))
    || (modelKey != null && (typeof modelKey !== "string" || !MODEL_KEY.test(modelKey)))
    || Number.isNaN(start) || Number.isNaN(end) || (start != null && end != null && start > end)) {
    context.res = error("影片用量的使用者、模型或日期範圍無效", "bad_request", 400, req);
    return;
  }

  const params = [tenantId];
  const where = ["w.tenant_id = $1", "w.status = 'succeeded'"];
  if (userId) where.push(`w.user_id = $${params.push(userId)}`);
  if (start != null) where.push(`w.completed_at >= $${params.push(new Date(start).toISOString())}`);
  if (end != null) where.push(`w.completed_at < $${params.push(new Date(end + DAY).toISOString())}`);
  const filter = where.join(" AND ");
  const modelParam = modelKey ? `$${params.push(modelKey)}` : null;

  const [jobs, renders] = await Promise.all([
    query(
      `SELECT w.user_id, u.display_name, u.email, u.video_unlimited, w.model_key,
              w.mode, w.duration_seconds, w.generate_audio, w.used_elements,
              m.price_per_second_usd, COUNT(*) AS job_count,
              SUM(w.duration_seconds) AS generated_seconds,
              SUM(w.duration_seconds) * m.price_per_second_usd AS estimated_cost_usd
       FROM video_generation_jobs w
       JOIN users u ON u.id = w.user_id AND u.tenant_id = w.tenant_id
       LEFT JOIN video_models m ON m.model_key = w.model_key AND m.tenant_id = w.tenant_id
       WHERE ${filter} AND w.reused_from_job_id IS NULL AND w.provider_request_id IS NOT NULL
         ${modelParam ? `AND w.model_key = ${modelParam}` : ""}
       GROUP BY w.user_id, u.display_name, u.email, u.video_unlimited, w.model_key,
                w.mode, w.duration_seconds, w.generate_audio, w.used_elements, m.price_per_second_usd
       ORDER BY u.email, w.model_key, w.mode, w.duration_seconds, w.generate_audio, w.used_elements`,
      params
    ),
    query(
      `SELECT COUNT(*) AS render_count, SUM(w.result_duration_seconds) AS output_seconds,
              COUNT(*) - COUNT(w.result_duration_seconds) AS unknown_duration_count
       FROM video_renders w
       JOIN video_projects p ON p.id = w.project_id AND p.tenant_id = w.tenant_id AND p.user_id = w.user_id
       WHERE ${filter} ${modelParam ? `AND p.model_key = ${modelParam}` : ""}`,
      params
    ),
  ]);

  const rows = jobs.rows.map((job) => ({
    userId: job.user_id, displayName: job.display_name || job.email, email: job.email,
    videoUnlimited: Boolean(job.video_unlimited), modelKey: job.model_key,
    mode: job.mode, durationSeconds: job.duration_seconds, generateAudio: Boolean(job.generate_audio),
    usedElements: job.used_elements == null ? null : Boolean(job.used_elements),
    jobCount: Number(job.job_count), generatedSeconds: Number(job.generated_seconds),
    pricePerSecondUsd: job.price_per_second_usd == null ? null : Number(job.price_per_second_usd),
    estimatedCostUsd: job.estimated_cost_usd == null ? null : Number(job.estimated_cost_usd),
  }));
  let generatedSeconds = 0, unpricedSeconds = 0, pricedMicros = 0;
  for (const row of rows) {
    generatedSeconds += row.generatedSeconds;
    if (row.estimatedCostUsd === null) unpricedSeconds += row.generatedSeconds;
    else pricedMicros += Math.round(row.estimatedCostUsd * 1_000_000);
  }
  const render = renders.rows[0];
  const renderCount = Number(render.render_count);
  context.res = ok({
    rows,
    generatedSeconds,
    unpricedSeconds,
    knownCostUsd: unpricedSeconds > 0 && unpricedSeconds === generatedSeconds ? null : pricedMicros / 1_000_000,
    renderCount,
    knownOutputMinutes: render.output_seconds == null ? (renderCount ? null : 0) : Number(render.output_seconds) / 60,
    unknownDurationCount: Number(render.unknown_duration_count),
    narrationCharacters: null,
  }, 200, req);
};

module.exports = { handleVideoUsage };
