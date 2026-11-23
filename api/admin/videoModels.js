const { ok, error } = require("../_shared/http");
const {
  VideoModelError,
  listVideoFamilies,
} = require("../_shared/videoModelFamilies");
const {
  createVideoModel,
  deleteVideoModel,
  listVideoModels,
  resolveVideoModel,
  updateVideoModel,
} = require("../_shared/videoModels");
const { createVideoJob } = require("../_shared/videoJobs");

const catalogPayload = async (tenantId) => ({
  models: await listVideoModels(tenantId),
  families: listVideoFamilies(),
});

const modelInput = (body = {}) => ({
  modelKey: body.modelKey,
  label: body.label,
  family: body.family,
  deploymentName: body.deploymentName,
  endpoint: body.endpoint,
  apiKey: body.apiKey,
  maxDurationSeconds: body.maxDurationSeconds,
  maxResolution: body.maxResolution,
  allowAudio: body.allowAudio,
});

const handleVideoModels = async (context, req, identity, method, targetId) => {
  try {
    if (method === "GET") {
      context.res = ok(await catalogPayload(identity.tenantId), 200, req);
      return;
    }
    if (method === "POST") {
      await createVideoModel({
        ...modelInput(req.body),
        tenantId: identity.tenantId,
        createdBy: identity.userId,
      });
    } else {
      if (!targetId) throw new VideoModelError("缺少影片模型識別碼");
      if (method === "PUT") {
        if (req.body?.modelKey !== undefined && req.body.modelKey !== targetId) {
          throw new VideoModelError("模型識別碼不可變更");
        }
        await updateVideoModel({
          ...modelInput(req.body),
          modelKey: targetId,
          tenantId: identity.tenantId,
          updatedBy: identity.userId,
        });
      } else {
        await deleteVideoModel({ tenantId: identity.tenantId, modelKey: targetId });
      }
    }
    context.res = ok(await catalogPayload(identity.tenantId), method === "POST" ? 201 : 200, req);
  } catch (caught) {
    if (!(caught instanceof VideoModelError)) throw caught;
    context.res = error(caught.message, caught.code, caught.status, req);
  }
};

const handleVideoModelTest = async (context, req, identity) => {
  try {
    const modelKey = typeof req.body?.modelKey === "string" ? req.body.modelKey.trim() : "";
    if (!modelKey) throw new VideoModelError("請選擇已儲存的影片模型");
    const model = await resolveVideoModel({
      tenantId: identity.tenantId,
      modelKey,
    });
    const family = require("../_shared/videoModelFamilies").getVideoModelFamily(model.family);
    const job = await createVideoJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      modelKey,
      prompt: "A blue circle gently rotates on a clean white background. No text.",
      mode: "t2v",
      durationSeconds: family.minDuration,
      resolution: model.family === "minimax-h3-max" ? "480P" : undefined,
      aspectRatio: "1:1",
      generateAudio: false,
      skipAdmission: true,
    });
    context.res = ok({ jobId: job.id, status: job.status, modelKey }, 202, req);
  } catch (caught) {
    if (!(caught instanceof VideoModelError)) throw caught;
    context.res = error(caught.message, caught.code, caught.status, req);
  }
};

module.exports = {
  handleVideoModelTest,
  handleVideoModels,
};
