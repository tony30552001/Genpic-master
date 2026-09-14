const { ok, error } = require("../_shared/http");
const {
  IMAGE_API_TYPES,
  IMAGE_QUALITIES,
  ImageModelError,
} = require("../_shared/imageModelConfig");
const {
  createImageModel,
  deleteImageModel,
  listImageModels,
  updateImageModel,
} = require("../_shared/imageModels");
const { createImageJob } = require("../_shared/imageJobs");

const catalogPayload = async (tenantId) => ({
  models: await listImageModels(tenantId),
  apiTypes: IMAGE_API_TYPES,
  qualities: IMAGE_QUALITIES,
});

const modelInput = (body = {}) => ({
  modelKey: body.modelKey,
  label: body.label,
  apiType: body.apiType,
  deploymentName: body.deploymentName,
  endpoint: body.endpoint,
  apiKey: body.apiKey,
  supportedQualities: body.supportedQualities,
  defaultQuality: body.defaultQuality,
});

const handleImageModels = async (context, req, identity, method, targetId) => {
  try {
    if (method === "GET") {
      context.res = ok(await catalogPayload(identity.tenantId), 200, req);
      return;
    }
    if (method === "POST") {
      await createImageModel({
        ...modelInput(req.body),
        tenantId: identity.tenantId,
        createdBy: identity.userId,
      });
    } else {
      if (!targetId) throw new ImageModelError("缺少圖片模型識別碼");
      if (method === "PUT") {
        if (req.body?.modelKey !== undefined && req.body.modelKey !== targetId) {
          throw new ImageModelError("模型識別碼不可變更");
        }
        await updateImageModel({
          ...modelInput(req.body),
          modelKey: targetId,
          tenantId: identity.tenantId,
          updatedBy: identity.userId,
        });
      } else {
        await deleteImageModel({ tenantId: identity.tenantId, modelKey: targetId });
      }
    }
    context.res = ok(await catalogPayload(identity.tenantId), method === "POST" ? 201 : 200, req);
  } catch (err) {
    if (!(err instanceof ImageModelError)) throw err;
    context.res = error(err.message, err.code, err.status, req);
  }
};

const handleImageModelTest = async (context, req, identity) => {
  try {
    const modelKey = req.body?.modelKey;
    if (typeof modelKey !== "string" || !modelKey.trim()) {
      throw new ImageModelError("請選擇已儲存的圖片模型");
    }
    const job = await createImageJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      model: modelKey.trim(),
      prompt: "A simple blue circle on a plain white background. No text.",
      aspectRatio: "1:1",
      quality: "low",
    });
    context.res = ok({ jobId: job.id, status: job.status, model: job.model }, 202, req);
  } catch (err) {
    if (!(err instanceof ImageModelError)) throw err;
    context.res = error(err.message, err.code, err.status, req);
  }
};

module.exports = { handleImageModels, handleImageModelTest };
