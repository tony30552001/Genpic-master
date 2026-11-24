const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { query } = require("../_shared/db");
const { LlmConfigurationError, resolveRoleModel } = require("../_shared/llmModels");
const { generateJson } = require("../_shared/llmRuntime");
const { VideoModelError } = require("../_shared/videoModelFamilies");
const { listPublicVideoModels } = require("../_shared/videoModels");
const { ensureVideoSettings } = require("../_shared/videoPolicy");
const {
  ANGLES,
  CAMERAS,
  MAX_SCRIPT_SOURCE,
  MAX_SHOTS,
  PROMPT_LIMIT,
  SHOT_SIZES,
  assertQuotedTextPreserved,
  assertRevisionScope,
  assertScriptFidelity,
  assertStoryboardDuration,
  compileStoryboard,
  durationRange,
  normalizeStoryboard,
  storyboardDuration,
  storyboardWarnings,
} = require("../_shared/videoStoryboard");

const SCHEMA = `Storyboard JSON:
{"title":"<=30 chars","global":{"style":"","lighting":"","constraints":["<=8 items"],"negative":"English negative prompt"},
"shots":[{"id":"s1","title":"<=30 chars or null","script":null,"scriptOriginal":null,"duration":3,
"shotSize":"${Object.keys(SHOT_SIZES).join("|")}",
"angle":"${Object.keys(ANGLES).join("|")}",
"camera":"${Object.keys(CAMERAS).join("|")}",
"action":"one main action","environment":"setting details"}]}
Rules:
- At most ${MAX_SHOTS} shots. Durations are integers of 1-15 seconds.
- A structured shot has script=null and sets shotSize, angle, camera, action and environment.
- A script shot sets script and leaves shotSize, angle, camera, action and environment null.
- Keep each shot to one main action that fits its duration. Describe motion, not a still image.
- A static camera must not push in or pull out.
- Write title, action, environment, style, lighting and constraints in the user's language.
- Keep every text the user put in quotes (「」『』"" “”) verbatim.
- Never ask the video model to render written text, signs or logos unless the user quoted that text.
- Keep the converted prompt of every shot under ${PROMPT_LIMIT} characters.`;

const DRAFT_SYSTEM = `You are a film storyboard artist for short AI-generated videos.
${SCHEMA}
Return JSON: {"storyboard":{...},"explanation":"short note in Traditional Chinese","questions":["<=2 questions in Traditional Chinese"]}.
Plan structured shots whose durations add up exactly to durationSeconds.
If shotCount is given, return exactly that many shots and no questions; otherwise choose 2-${MAX_SHOTS} shots.
Ask a question only when a missing answer would seriously change the result; otherwise return [] and state your assumptions in explanation.
When hasStartFrame is true, describe only motion, camera and changes over time, not what the first frame already shows.`;

const REVISE_SYSTEM = `You revise an existing video storyboard.
${SCHEMA}
Return JSON: {"storyboard":{...},"changedShotIds":["ids of added, modified or removed shots"],"explanation":"short note in Traditional Chinese"}.
Change only what the instruction asks. Every other shot must stay byte-for-byte identical, including its id.
If shotId is given, change only that shot and keep the global settings unchanged.
For a script shot, change only the sentences the instruction names and keep the rest of the script verbatim.
New shots need new unique ids. Durations may change, but their sum must stay between minSeconds and maxSeconds.`;

const SCRIPT_SYSTEM = `You split a user's written video script into a storyboard. You never rewrite the script.
${SCHEMA}
Return JSON: {"storyboard":{...},"explanation":"short note in Traditional Chinese","shotNotes":[{"shotId":"s1","notes":["<=3 suggestions in Traditional Chinese"]}]}.
- Split scenes on headings such as 場景 1, 第 1 幕, Scene 1, numbered titles, timecodes, or blank lines. One scene is one script shot.
- script is the scene text copied exactly from the source, without its heading. Keep the original heading as title; add a short title only when missing.
- duration comes from the scene text (for example 5 秒 or 5-second); otherwise use 5.
- Only if a scene exceeds ${PROMPT_LIMIT} characters, move repeated consistency notes to global.constraints and prohibitions to global.negative, then condense: put the condensed text in script and the exact source text in scriptOriginal. Keep quoted text and @ references.
- If the script asks for no music or no sound, say in explanation that native audio should be turned off.
- shotNotes warn about too many actions for the duration, text the model would misspell, or unusable reference images.`;

const requireString = (value, label, maxLength) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new VideoModelError(`${label}必須是 1 至 ${maxLength} 字的文字`);
  }
  return value.trim();
};

const agentFailure = (message) => new VideoModelError(message, "storyboard_agent_failed", 502);

const loadAllowedModel = async (identity, modelKey) => {
  const [userResult, settings, models] = await Promise.all([
    query(
      "SELECT video_enabled FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
      [identity.userId, identity.tenantId]
    ),
    ensureVideoSettings(identity.tenantId),
    listPublicVideoModels(identity.tenantId),
  ]);
  if (!userResult.rows[0]?.video_enabled) {
    throw new VideoModelError("此帳號尚未開放影片創作，請聯絡管理員", "video_disabled", 403);
  }
  const model = models.find((item) => item.modelKey === modelKey);
  if (!model || !settings.allowedModels.includes(modelKey)) {
    throw new VideoModelError("此影片模型尚未開放給使用者", "video_model_not_allowed", 403);
  }
  return model;
};

const agentStoryboard = (raw) => {
  try {
    return normalizeStoryboard(raw);
  } catch (caught) {
    if (caught instanceof VideoModelError) {
      throw agentFailure(`AI 產生的分鏡不符合規則：${caught.message}，請重試`);
    }
    throw caught;
  }
};

const agentText = (value) => (typeof value === "string" ? value.trim().slice(0, 2000) : "");

const respondStoryboard = ({ storyboard, model, hasStartFrame, extra }) => {
  const compiled = compileStoryboard(model.family, storyboard);
  return {
    storyboard,
    durationSeconds: storyboardDuration(storyboard),
    warnings: storyboardWarnings(storyboard, { hasStartFrame }),
    compiled: {
      sendMode: compiled.sendMode,
      prompt: compiled.prompt,
      multiPrompt: compiled.multiPrompt,
      negativePrompt: compiled.negativePrompt,
    },
    ...extra,
  };
};

const runAgent = async ({ identity, systemMessage, input, maxOutputTokens }) => {
  const llm = await resolveRoleModel(identity.tenantId, "prompt_optimization");
  const data = await generateJson({
    llm,
    systemMessage,
    userMessage: JSON.stringify(input),
    maxOutputTokens,
  });
  if (!data || typeof data !== "object") throw agentFailure("分析模型沒有回傳分鏡，請重試");
  return data;
};

const draft = async ({ identity, body, model }) => {
  const brief = requireString(body.brief, "影片概述", 20_000);
  const durationSeconds = Number(body.durationSeconds);
  const { min, max } = durationRange(model);
  if (!Number.isInteger(durationSeconds) || durationSeconds < min || durationSeconds > max) {
    throw new VideoModelError(`影片秒數必須介於 ${min} 與 ${max} 秒`);
  }
  const shotCount = body.shotCount === undefined || body.shotCount === null ? null : Number(body.shotCount);
  if (shotCount !== null && (!Number.isInteger(shotCount) || shotCount < 1 || shotCount > MAX_SHOTS)) {
    throw new VideoModelError(`幕數必須介於 1 與 ${MAX_SHOTS}`);
  }
  const hasStartFrame = Boolean(body.hasStartFrame);
  const data = await runAgent({
    identity,
    systemMessage: DRAFT_SYSTEM,
    input: { brief, durationSeconds, shotCount, hasStartFrame },
    maxOutputTokens: 6000,
  });
  const storyboard = agentStoryboard(data.storyboard);
  if (shotCount !== null && storyboard.shots.length !== shotCount) {
    throw agentFailure(`AI 產生了 ${storyboard.shots.length} 幕，應為 ${shotCount} 幕，請重試`);
  }
  if (storyboardDuration(storyboard) !== durationSeconds) {
    throw agentFailure("AI 分配的秒數加總不等於影片長度，請重試");
  }
  assertQuotedTextPreserved(brief, storyboard);
  const questions = shotCount === 1 || !Array.isArray(data.questions)
    ? []
    : data.questions.filter((item) => typeof item === "string" && item.trim()).slice(0, 2).map(agentText);
  return respondStoryboard({
    storyboard,
    model,
    hasStartFrame,
    extra: { explanation: agentText(data.explanation), questions },
  });
};

const revise = async ({ identity, body, model }) => {
  const before = normalizeStoryboard(body.storyboard);
  const instruction = requireString(body.instruction, "修改指令", 4000);
  const shotId = body.shotId === undefined || body.shotId === null ? null : String(body.shotId);
  if (shotId && !before.shots.some((shot) => shot.id === shotId)) {
    throw new VideoModelError("找不到要修改的幕");
  }
  const { min, max } = durationRange(model);
  const data = await runAgent({
    identity,
    systemMessage: REVISE_SYSTEM,
    input: { storyboard: before, instruction, shotId, minSeconds: min, maxSeconds: max },
    maxOutputTokens: 8000,
  });
  const after = agentStoryboard(data.storyboard);
  const changedShotIds = assertRevisionScope({
    before,
    after,
    declaredChangedIds: data.changedShotIds,
    shotId,
  });
  assertStoryboardDuration(after, model, 502);
  assertQuotedTextPreserved(instruction, after);
  return respondStoryboard({
    storyboard: after,
    model,
    hasStartFrame: Boolean(body.hasStartFrame),
    extra: { changedShotIds, explanation: agentText(data.explanation) },
  });
};

const fromScript = async ({ identity, body, model }) => {
  const script = requireString(body.script, "腳本", MAX_SCRIPT_SOURCE);
  const data = await runAgent({
    identity,
    systemMessage: SCRIPT_SYSTEM,
    input: { script },
    maxOutputTokens: 16000,
  });
  const storyboard = agentStoryboard(data.storyboard);
  assertScriptFidelity(script, storyboard);
  const total = storyboardDuration(storyboard);
  const { max } = durationRange(model);
  if (total > max) {
    throw new VideoModelError(
      `腳本加總 ${total} 秒，超過單支影片上限 ${max} 秒。長片拆段會在後續版本提供，請先刪減場景或縮短秒數`
    );
  }
  assertStoryboardDuration(storyboard, model);
  const ids = new Set(storyboard.shots.map((shot) => shot.id));
  const shotNotes = Object.fromEntries(
    (Array.isArray(data.shotNotes) ? data.shotNotes : [])
      .filter((entry) => ids.has(entry?.shotId) && Array.isArray(entry.notes))
      .map((entry) => [
        entry.shotId,
        entry.notes.filter((note) => typeof note === "string" && note.trim()).slice(0, 3).map(agentText),
      ])
  );
  return respondStoryboard({
    storyboard,
    model,
    hasStartFrame: Boolean(body.hasStartFrame),
    extra: { explanation: agentText(data.explanation), shotNotes },
  });
};

const inspect = async ({ body, model }) => {
  const storyboard = normalizeStoryboard(body.storyboard);
  assertStoryboardDuration(storyboard, model);
  return respondStoryboard({ storyboard, model, hasStartFrame: Boolean(body.hasStartFrame) });
};

const ACTIONS = { draft, revise, fromScript, inspect };

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options(req);
    return;
  }
  const auth = await requireAuth(context, req);
  if (!auth) return;
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!Object.hasOwn(ACTIONS, body.action || "")) {
    context.res = error("不支援的分鏡動作", "bad_request", 400, req);
    return;
  }
  try {
    const identity = await resolveIdentity(auth.user);
    if (!identity.userId || !identity.tenantId) {
      context.res = error("無法辨識使用者", "unauthorized", 401, req);
      return;
    }
    const model = await loadAllowedModel(identity, requireString(body.modelKey, "影片模型", 128));
    context.res = ok(await ACTIONS[body.action]({ identity, body, model }), 200, req);
  } catch (caught) {
    if (caught instanceof VideoModelError || caught instanceof LlmConfigurationError) {
      context.res = error(caught.message, caught.code, caught.status, req);
      return;
    }
    context.log?.error?.("[video-storyboard] Agent failed:", { name: caught?.name, code: caught?.code });
    context.res = error("分鏡 AI 暫時無法回應，請稍後重試", "storyboard_agent_failed", 502, req);
  }
};
