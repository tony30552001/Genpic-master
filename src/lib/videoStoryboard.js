// Display labels for the enum keys validated by api/_shared/videoStoryboard.js.
export const SHOT_SIZE_LABELS = Object.freeze({
  "extreme-wide": "大遠景",
  wide: "遠景",
  medium: "中景",
  "close-up": "特寫",
  "extreme-close-up": "大特寫",
});

export const ANGLE_LABELS = Object.freeze({
  "eye-level": "平視",
  high: "俯角",
  low: "仰角",
  overhead: "正俯拍",
  dutch: "斜角",
});

export const CAMERA_LABELS = Object.freeze({
  static: "固定",
  "slow-push-in": "緩推",
  "pull-out": "拉遠",
  "pan-left": "左搖",
  "pan-right": "右搖",
  "tilt-up": "上仰",
  "tilt-down": "下俯",
  orbit: "環繞",
  tracking: "跟拍",
  handheld: "手持",
});

// Mirrors api/_shared/videoStoryboard.js.
export const MAX_SHOTS = 30;
export const MAX_SHOT_SECONDS = 15;
export const MAX_PROJECT_SECONDS = 120;
export const PROMPT_LIMIT = 2500;
export const MAX_SCRIPT_SOURCE = 50000;
export const MAX_SHOT_REFERENCES = 10;
// Mirrors api/_shared/scriptDocument.js.
export const MAX_SCRIPT_DOCUMENT_IMAGES = 40;
const LONG_DURATIONS = [20, 30, 45, 60, 90, 120];

/** Seconds one model request (one segment) can cover. */
export const segmentRange = (model) => ({
  min: model?.capabilities?.minDuration || 1,
  max: Math.min(model?.capabilities?.maxDuration ?? Infinity, model?.maxDurationSeconds || 5),
});

/** Every second up to one segment, then longer multi-segment lengths. */
export const durationChoices = (model) => {
  const { min, max } = segmentRange(model);
  const single = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
  return [...single, ...LONG_DURATIONS.filter((value) => value > max)];
};

export const toOptions = (labels) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export const storyboardSeconds = (storyboard) =>
  storyboard ? storyboard.shots.reduce((total, shot) => total + shot.duration, 0) : 0;

export const isScriptShot = (shot) => Boolean(shot.script);

export const shotSummary = (shot) =>
  isScriptShot(shot)
    ? "腳本幕"
    : `${SHOT_SIZE_LABELS[shot.shotSize]} · ${ANGLE_LABELS[shot.angle]} · ${CAMERA_LABELS[shot.camera]}`;

const newShotId = (shots) => {
  const used = new Set(shots.map((shot) => shot.id));
  let index = shots.length + 1;
  while (used.has(`s${index}`)) index += 1;
  return `s${index}`;
};

export const createShot = (shots) => ({
  id: newShotId(shots),
  title: null,
  script: null,
  scriptOriginal: null,
  references: [],
  startFrameUploadId: null,
  duration: 3,
  shotSize: "medium",
  angle: "eye-level",
  camera: "static",
  action: "",
  environment: "",
  characterIds: [],
  cut: false,
});

// Mirrors api/_shared/videoStoryboard.js: only a shot that starts a fresh segment has its own start frame.
export const canHaveStartFrame = (shot, index) => index === 0 || shot.cut;

export const SCRIPT_DOCUMENT_EXTENSIONS = Object.freeze(["docx", "txt", "md"]);
export const SCRIPT_DOCUMENT_ACCEPT = SCRIPT_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");
export const SOURCE_DOCUMENT_EXTENSIONS = Object.freeze(["docx", "txt", "md", "pdf"]);
export const SOURCE_DOCUMENT_ACCEPT = SOURCE_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export const SEND_MODE_LABELS = Object.freeze({
  single: "單一提示詞",
  multi: "原生多鏡頭",
  merged: "合併成一段帶時間碼的提示詞",
});

// Mirrors api/_shared/videoStoryboard.js: a Kling element is a frontal image plus 1-3 references.
export const MAX_CHARACTERS = 3;
export const MIN_CHARACTER_IMAGES = 2;
export const MAX_CHARACTER_IMAGES = 4;
export const MAX_CHARACTER_IMAGE_BYTES = 10 * 1024 * 1024;

export const newCharacterId = (characters) => {
  const used = new Set(characters.map((character) => character.id));
  let index = characters.length + 1;
  while (used.has(`c${index}`)) index += 1;
  return `c${index}`;
};

const IMAGE_LABEL_REFERENCES = /@(Image[1-9]\d?)(?!\d)/gi;

/** `@ImageN` labels the script shots reference, normalized to `ImageN`. */
export const scriptImageLabels = (storyboard) => {
  const labels = new Set();
  for (const shot of storyboard.shots) {
    for (const match of (shot.script || "").matchAll(IMAGE_LABEL_REFERENCES)) {
      labels.add(`Image${match[1].slice(5)}`);
    }
  }
  return [...labels].sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
};

const segmentNumbers = (segments) => segments.map((segment) => segment.index + 1).join("、");

/** How the segment requests use character references, or null when there are none. */
export const characterModeLabel = (segments, family) => {
  if (!segments) return null;
  const withElements = segments.filter((segment) => segment.compiled.characterMode === "elements");
  const asText = segments.filter((segment) => segment.compiled.characterMode === "text");
  if (!withElements.length && !asText.length) return null;
  if (!asText.length) {
    const ids = new Set(
      withElements.flatMap((segment) => segment.compiled.elements.map((element) => element.characterId))
    );
    return `以 ${ids.size} 個角色參考圖送出`;
  }
  if (family?.startsWith("minimax")) return "MiniMax 不使用角色參考圖，角色以文字描述送出";
  if (!withElements.length) return "沒有首影格，不使用角色參考圖，角色以文字描述送出";
  return `第 ${segmentNumbers(asText)} 段沒有首影格，角色以文字描述送出；其餘段使用角色參考圖`;
};

/** How one segment starts, for segment headers and the request preview. */
export const segmentStartLabel = (segment) => {
  if (segment.chained) return "接續上一段最後一格";
  if (segment.index === 0) return segment.mode === "i2v" ? "從首影格開始" : "從文字開始";
  return segment.mode === "i2v" ? "場景轉換，從首影格開始" : "場景轉換，從文字開始";
};

/** Footer summary of how the storyboard is sent. */
export const sendModeLabel = (segments) => {
  if (!segments) return "檢查中…";
  if (segments.length === 1) return SEND_MODE_LABELS[segments[0].compiled.sendMode];
  return `分 ${segments.length} 段生成，依序播放`;
};

/** Segments keyed by their first shot id; empty for a single segment. */
export const segmentStarts = (segments) =>
  new Map(segments && segments.length > 1 ? segments.map((segment) => [segment.shotIds[0], segment]) : []);
