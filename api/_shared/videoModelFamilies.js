class VideoModelError extends Error {
  constructor(message, code = "bad_request", status = 400) {
    super(message);
    this.name = "VideoModelError";
    this.code = code;
    this.status = status;
  }
}

const VIDEO_MODEL_FAMILIES = Object.freeze({
  "minimax-h3-max": Object.freeze({
    id: "minimax-h3-max",
    label: "MiniMax H3 Max",
    route: "minimax/h3-max",
    minDuration: 1,
    maxDuration: 15,
    resolutions: ["480P", "768P", "1080P"],
    aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportsAudioToggle: false,
    fixedAudio: true,
    multiShot: false,
    defaultResolution: "768P",
    estimatedSeconds: 30,
  }),
  "kling-v3-pro": Object.freeze({
    id: "kling-v3-pro",
    label: "Kling V3 Pro",
    route: "kling/v3/pro",
    minDuration: 3,
    maxDuration: 15,
    resolutions: ["1080P"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudioToggle: true,
    fixedAudio: false,
    multiShot: true,
    defaultResolution: "1080P",
    estimatedSeconds: 310,
  }),
});

const getVideoModelFamily = (familyId) => {
  const family = VIDEO_MODEL_FAMILIES[familyId];
  if (!family) throw new VideoModelError("不支援的影片模型家族");
  return family;
};

const requireInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new VideoModelError(`${label}必須是整數`);
  return number;
};

const validateVideoOptions = ({ model, durationSeconds, resolution, aspectRatio, generateAudio, mode }) => {
  const family = getVideoModelFamily(model.family);
  const duration = requireInteger(durationSeconds, "影片秒數");
  if (duration < family.minDuration || duration > family.maxDuration || duration > model.maxDurationSeconds) {
    throw new VideoModelError(`影片秒數必須介於 ${family.minDuration} 與 ${Math.min(family.maxDuration, model.maxDurationSeconds)} 秒`);
  }

  let selectedResolution = resolution || family.defaultResolution;
  if (family.supportsAudioToggle) {
    selectedResolution = null;
  } else if (!family.resolutions.includes(selectedResolution)) {
    throw new VideoModelError("不支援的影片解析度");
  } else {
    const maxIndex = family.resolutions.indexOf(model.maxResolution);
    if (maxIndex < 0 || family.resolutions.indexOf(selectedResolution) > maxIndex) {
      throw new VideoModelError("影片解析度超過此模型的管理上限");
    }
  }

  if (!["t2v", "i2v"].includes(mode)) throw new VideoModelError("不支援的影片生成方式");
  const selectedAspectRatio = mode === "i2v" ? null : aspectRatio || "16:9";
  if (mode === "t2v" && !family.aspectRatios.includes(selectedAspectRatio)) {
    throw new VideoModelError("不支援的影片比例");
  }

  const audio = family.supportsAudioToggle ? Boolean(generateAudio) : family.fixedAudio;
  if (audio && !model.allowAudio && family.supportsAudioToggle) {
    throw new VideoModelError("此影片模型未開放音訊生成");
  }

  return {
    durationSeconds: duration,
    resolution: selectedResolution,
    aspectRatio: selectedAspectRatio,
    generateAudio: audio,
  };
};

const buildVideoRequest = ({ model, compiled, options, mode, imageDataUrl, endImageDataUrl }) => {
  const body = {
    model: model.deploymentName,
    enable_safety_checker: true,
  };
  if (compiled.prompt) body.prompt = compiled.prompt;
  if (compiled.multiPrompt) {
    body.multi_prompt = compiled.multiPrompt;
    body.shot_type = "customize";
  }
  if (compiled.negativePrompt) body.negative_prompt = compiled.negativePrompt;
  if (model.family === "minimax-h3-max") {
    body.duration = options.durationSeconds;
    body.resolution = options.resolution;
    body.prompt_expansion_mode = "disabled";
    if (mode === "t2v") body.aspect_ratio = options.aspectRatio;
    else {
      body.image_url = imageDataUrl;
      if (endImageDataUrl) body.end_image_url = endImageDataUrl;
    }
  } else {
    body.duration = String(options.durationSeconds);
    body.generate_audio = options.generateAudio;
    if (mode === "t2v") body.aspect_ratio = options.aspectRatio;
    else {
      body.start_image_url = imageDataUrl;
      if (endImageDataUrl) body.end_image_url = endImageDataUrl;
    }
  }
  return {
    family: getVideoModelFamily(model.family),
    path: `${getVideoModelFamily(model.family).route}/${mode === "t2v" ? "text-to-video" : "image-to-video"}`,
    body,
  };
};

const publicVideoFamily = (familyId) => {
  const family = getVideoModelFamily(familyId);
  return {
    id: family.id,
    label: family.label,
    minDuration: family.minDuration,
    maxDuration: family.maxDuration,
    resolutions: family.resolutions,
    aspectRatios: family.aspectRatios,
    supportsAudioToggle: family.supportsAudioToggle,
    fixedAudio: family.fixedAudio,
    multiShot: family.multiShot,
    estimatedSeconds: family.estimatedSeconds,
  };
};

const listVideoFamilies = () => Object.keys(VIDEO_MODEL_FAMILIES).map(publicVideoFamily);

module.exports = {
  VideoModelError,
  buildVideoRequest,
  getVideoModelFamily,
  listVideoFamilies,
  validateVideoOptions,
};
