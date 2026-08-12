const toText = (value) => (value == null ? "" : String(value).trim());

export const extractPptxBullets = (scene = {}) => {
  const bullets = Array.isArray(scene.bullet_points)
    ? scene.bullet_points.map(toText).filter(Boolean)
    : [];

  if (bullets.length > 0) return bullets;

  const description = toText(scene.scene_description);
  return description ? [description] : [];
};

export const getPptxScenes = (scenes) =>
  Array.isArray(scenes)
    ? scenes.filter((scene) => scene && typeof scene === "object")
    : [];

export const sanitizePptxFilename = (title) =>
  toText(title).replace(/[^\w\u4e00-\u9fff\s-]/g, "").trim() || "presentation";
