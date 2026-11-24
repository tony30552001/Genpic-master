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

export const MAX_SHOTS = 6;
export const MAX_SHOT_SECONDS = 15;

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
  duration: 3,
  shotSize: "medium",
  angle: "eye-level",
  camera: "static",
  action: "",
  environment: "",
  characterIds: [],
});

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

/** How the compiled request uses character references, or null when there are none. */
export const characterModeLabel = (compiled, family) => {
  if (!compiled || compiled.characterMode === "none") return null;
  if (compiled.characterMode === "elements") return `以 ${compiled.elements.length} 個角色參考圖送出`;
  if (family?.startsWith("minimax")) return "MiniMax 不使用角色參考圖，角色以文字描述送出";
  return "沒有首影格，不使用角色參考圖，角色以文字描述送出";
};
