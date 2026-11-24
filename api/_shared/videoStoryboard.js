const { VideoModelError, getVideoModelFamily } = require("./videoModelFamilies");

const MAX_SHOTS = 6;
const MAX_SHOT_SECONDS = 15;
const PROMPT_LIMIT = 2500;
const MAX_SCRIPT_SOURCE = 50_000;

const SHOT_SIZES = Object.freeze({
  "extreme-wide": "Extreme wide shot",
  wide: "Wide shot",
  medium: "Medium shot",
  "close-up": "Close-up",
  "extreme-close-up": "Extreme close-up",
});
const ANGLES = Object.freeze({
  "eye-level": "eye level",
  high: "high angle",
  low: "low angle",
  overhead: "overhead",
  dutch: "Dutch angle",
});
const CAMERAS = Object.freeze({
  static: "static camera",
  "slow-push-in": "slow push-in",
  "pull-out": "pull-out",
  "pan-left": "pan left",
  "pan-right": "pan right",
  "tilt-up": "tilt up",
  "tilt-down": "tilt down",
  orbit: "orbit",
  tracking: "tracking shot",
  handheld: "handheld",
});
const STRUCTURED_FIELDS = ["shotSize", "angle", "camera", "action", "environment"];
const SHOT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_LABEL = /^Image([1-9]\d?)$/i;
// A Kling element is a frontal image plus 1-3 reference images.
const MAX_CHARACTERS = 3;
const MIN_CHARACTER_IMAGES = 2;
const MAX_CHARACTER_IMAGES = 4;
const QUOTED_TEXT = /[「『"“]([^」』"”]+)[」』"”]/g;
const IMAGE_REFERENCES = /@(?:Image\d+|參考圖片?\d*)/gi;
const IMAGE_LABEL_REFERENCES = /@(Image[1-9]\d?)(?!\d)/gi;
const ACTION_SPLIT = /[，,；;]|然後|接著/;
const ZOOM_WORDS = /推近|拉近|推進|拉遠|zoom|push[- ]?in|pull[- ]?out/i;
const MOTION_WORDS =
  /[走跑推拉轉移飛落升降開關倒拿握揮跳流飄搖擺滑舉放穿打吹灑浮游衝追爬坐站躺抬倒喝吃切寫翻掀踏奔閃滴噴燃旋滾晃抖眨點按搬遞撥]|看向|望向|回頭|低頭|抬頭|微笑|靠近|離開|出現|消失|變成|逐漸|慢慢|正在|move|walk|run|turn|rise|fall|fly|open|close|pour|smile|look|wave|jump|spin|drift|flow/i;

const fail = (message, status = 400, code = "invalid_storyboard") => {
  throw new VideoModelError(message, code, status);
};

const optionalText = (value, label, maxLength) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") fail(`${label}必須是文字`);
  const text = value.trim();
  if (text.length > maxLength) fail(`${label}不可超過 ${maxLength} 字`);
  return text;
};

const requiredText = (value, label, maxLength) => {
  const text = optionalText(value, label, maxLength);
  if (!text) fail(`${label}不可空白`);
  return text;
};

const requiredEnum = (value, values, label) => {
  if (!Object.hasOwn(values, value)) fail(`${label}不是可用的選項`);
  return value;
};

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const normalizeImageLabel = (value, label) => {
  if (!hasValue(value)) return null;
  const match = typeof value === "string" ? value.trim().match(IMAGE_LABEL) : null;
  if (!match) fail(`${label}的腳本圖片代號必須是 Image1 這類格式`);
  return `Image${match[1]}`;
};

const normalizeCharacter = (raw, index) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`第 ${index + 1} 個角色格式無效`);
  const label = `第 ${index + 1} 個角色`;
  if (typeof raw.id !== "string" || !SHOT_ID.test(raw.id)) fail(`${label}的識別碼無效`);
  if (
    !Array.isArray(raw.uploadIds) ||
    raw.uploadIds.length < MIN_CHARACTER_IMAGES ||
    raw.uploadIds.length > MAX_CHARACTER_IMAGES
  ) {
    fail(`${label}需要 1 張正面圖加 1 至 ${MAX_CHARACTER_IMAGES - 1} 張參考圖`);
  }
  const uploadIds = raw.uploadIds.map((uploadId) => {
    if (typeof uploadId !== "string" || !UPLOAD_ID.test(uploadId)) fail(`${label}的圖片識別碼無效`);
    return uploadId.toLowerCase();
  });
  if (new Set(uploadIds).size !== uploadIds.length) fail(`${label}有重複的圖片`);
  return {
    id: raw.id,
    name: requiredText(raw.name, `${label}的名稱`, 30),
    description: optionalText(raw.description, `${label}的描述`, 300),
    uploadIds,
    imageLabel: normalizeImageLabel(raw.imageLabel, label),
  };
};

const normalizeCharacters = (raw) => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail("角色必須是清單");
  if (raw.length > MAX_CHARACTERS) fail(`角色與產品最多 ${MAX_CHARACTERS} 個`);
  const characters = raw.map(normalizeCharacter);
  if (new Set(characters.map((item) => item.id)).size !== characters.length) fail("角色識別碼重複");
  if (new Set(characters.map((item) => item.name)).size !== characters.length) fail("角色名稱重複");
  const labels = characters.map((item) => item.imageLabel).filter(Boolean);
  if (new Set(labels).size !== labels.length) fail("同一個腳本圖片代號只能對應一個角色");
  return characters;
};

const normalizeCharacterIds = (raw, characterIds, label) => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`${label}的角色必須是清單`);
  if (raw.some((id) => !characterIds.has(id))) fail(`${label}引用了不存在的角色`);
  if (new Set(raw).size !== raw.length) fail(`${label}的角色重複`);
  return [...raw];
};

const normalizeShot = (raw, index, characterIds) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`第 ${index + 1} 幕格式無效`);
  const label = `第 ${index + 1} 幕`;
  if (typeof raw.id !== "string" || !SHOT_ID.test(raw.id)) fail(`${label}的識別碼無效`);
  const duration = Number(raw.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_SHOT_SECONDS) {
    fail(`${label}的秒數必須是 1 至 ${MAX_SHOT_SECONDS} 的整數`);
  }
  const shot = {
    id: raw.id,
    title: optionalText(raw.title, `${label}的標題`, 30) || null,
    script: null,
    scriptOriginal: null,
    duration,
    shotSize: null,
    angle: null,
    camera: null,
    action: null,
    environment: null,
    characterIds: normalizeCharacterIds(raw.characterIds, characterIds, label),
  };
  const script = optionalText(raw.script, `${label}的腳本`, PROMPT_LIMIT);
  if (script) {
    if (STRUCTURED_FIELDS.some((field) => hasValue(raw[field]))) {
      fail(`${label}不能同時有腳本與景別、角度、運鏡、動作或環境`);
    }
    shot.script = script;
    shot.scriptOriginal =
      optionalText(raw.scriptOriginal, `${label}的腳本原文`, MAX_SCRIPT_SOURCE) || null;
    return shot;
  }
  if (hasValue(raw.scriptOriginal)) fail(`${label}只有腳本幕可以保留原文`);
  shot.shotSize = requiredEnum(raw.shotSize, SHOT_SIZES, `${label}的景別`);
  shot.angle = requiredEnum(raw.angle, ANGLES, `${label}的角度`);
  shot.camera = requiredEnum(raw.camera, CAMERAS, `${label}的運鏡`);
  shot.action = requiredText(raw.action, `${label}的動作`, 1000);
  shot.environment = optionalText(raw.environment, `${label}的環境`, 500);
  return shot;
};

const normalizeStoryboard = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("分鏡格式無效");
  const global = raw.global;
  if (!global || typeof global !== "object" || Array.isArray(global)) fail("缺少全片設定");
  if (global.constraints !== undefined && !Array.isArray(global.constraints)) {
    fail("限制條件必須是清單");
  }
  const constraints = (global.constraints || []).map((item, index) =>
    requiredText(item, `第 ${index + 1} 條限制條件`, 200)
  );
  if (constraints.length > 8) fail("限制條件最多 8 條");
  if (!Array.isArray(raw.shots) || raw.shots.length < 1 || raw.shots.length > MAX_SHOTS) {
    fail(`分鏡必須有 1 至 ${MAX_SHOTS} 幕`);
  }
  const characters = normalizeCharacters(global.characters);
  const characterIds = new Set(characters.map((item) => item.id));
  const shots = raw.shots.map((item, index) => normalizeShot(item, index, characterIds));
  if (new Set(shots.map((shot) => shot.id)).size !== shots.length) fail("分鏡的幕識別碼重複");
  return {
    title: requiredText(raw.title, "分鏡標題", 30),
    global: {
      style: optionalText(global.style, "風格", 300),
      lighting: optionalText(global.lighting, "光線", 300),
      constraints,
      negative: optionalText(global.negative, "負面提示", PROMPT_LIMIT),
      characters,
    },
    shots,
  };
};

const storyboardDuration = (storyboard) =>
  storyboard.shots.reduce((total, shot) => total + shot.duration, 0);

const durationRange = (model) => {
  const family = getVideoModelFamily(model.family);
  return {
    min: family.minDuration,
    max: Math.min(family.maxDuration, model.maxDurationSeconds),
  };
};

const assertStoryboardDuration = (storyboard, model, status = 400) => {
  const total = storyboardDuration(storyboard);
  const { min, max } = durationRange(model);
  if (total < min || total > max) {
    fail(`分鏡總長 ${total} 秒，此模型必須介於 ${min} 與 ${max} 秒`, status);
  }
  return total;
};

const sentence = (value) => value.trim().replace(/[。.．\s]+$/u, "");

const joinSentences = (parts) => {
  const filled = parts.map((part) => (part ? sentence(part) : "")).filter(Boolean);
  return filled.length ? `${filled.join(". ")}.` : "";
};

const keepClause = (constraints) =>
  constraints.length ? `Keep: ${constraints.map(sentence).join("; ")}.` : "";

const cameraLine = (shot) =>
  `${SHOT_SIZES[shot.shotSize]}, ${ANGLES[shot.angle]}, ${CAMERAS[shot.camera]}`;

const labelCharacter = (storyboard, label) =>
  storyboard.global.characters.find(
    (item) => item.imageLabel && item.imageLabel.toLowerCase() === label.toLowerCase()
  ) || null;

const scriptLabels = (shot) =>
  shot.script ? [...shot.script.matchAll(IMAGE_LABEL_REFERENCES)].map((match) => match[1]) : [];

// Characters a shot tags or a script binds through @ImageN, in catalog order.
const usedCharacters = (storyboard) => {
  const used = new Set(
    storyboard.shots.flatMap((shot) => [
      ...shot.characterIds,
      ...scriptLabels(shot).map((label) => labelCharacter(storyboard, label)?.id).filter(Boolean),
    ])
  );
  return storyboard.global.characters.filter((item) => used.has(item.id));
};

const characterModeFor = (family, storyboard, mode) => {
  if (!storyboard.global.characters.length) return "none";
  return family.elements && mode === "i2v" ? "elements" : "text";
};

const createCast = (storyboard, characterMode) => {
  const used = usedCharacters(storyboard);
  const elementOf = (character) => `@Element${used.indexOf(character) + 1}`;
  const byId = new Map(storyboard.global.characters.map((item) => [item.id, item]));
  return {
    elements:
      characterMode === "elements"
        ? used.map((item) => ({ characterId: item.id, name: item.name, uploadIds: item.uploadIds }))
        : [],
    line: (shot) => {
      if (!shot.characterIds.length) return "";
      const names = shot.characterIds.map((id) => {
        const character = byId.get(id);
        if (characterMode === "elements") return `${elementOf(character)} (${character.name})`;
        return character.description ? `${character.name}（${character.description}）` : character.name;
      });
      return `Characters: ${names.join(", ")}`;
    },
    script: (text) =>
      text.replace(IMAGE_LABEL_REFERENCES, (match, label) => {
        const character = labelCharacter(storyboard, label);
        if (!character) return match;
        return characterMode === "elements" ? elementOf(character) : character.name;
      }),
  };
};

const compileKlingShot = (storyboard, shot, cast) => {
  const { global } = storyboard;
  if (shot.script) {
    return [joinSentences([cast.line(shot)]), cast.script(shot.script), keepClause(global.constraints)]
      .filter(Boolean)
      .join(" ");
  }
  return [
    joinSentences([global.style, global.lighting, cameraLine(shot), cast.line(shot), shot.action, shot.environment]),
    keepClause(global.constraints),
  ].filter(Boolean).join(" ");
};

const timecode = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const compileMinimax = (storyboard, cast) => {
  const { global } = storyboard;
  const header = [
    global.style && `Overall style: ${sentence(global.style)}.`,
    global.lighting && `Lighting: ${sentence(global.lighting)}.`,
    global.constraints.length && `Consistency: ${global.constraints.map(sentence).join("; ")}.`,
    global.negative && `Avoid: ${sentence(global.negative)}.`,
  ].filter(Boolean).join(" ");
  let start = 0;
  const lines = storyboard.shots.map((shot) => {
    const range = `[${timecode(start)}–${timecode(start + shot.duration)}]`;
    start += shot.duration;
    const body = shot.script
      ? [joinSentences([cast.line(shot)]), cast.script(shot.script)].filter(Boolean).join(" ")
      : joinSentences([cameraLine(shot), cast.line(shot), shot.action, shot.environment]);
    return `${range} ${body}`;
  });
  return [header, ...lines].filter(Boolean).join("\n");
};

const assertPromptLength = (text, label) => {
  if (text.length > PROMPT_LIMIT) {
    fail(`${label}轉換後有 ${text.length} 字，超過 ${PROMPT_LIMIT} 字上限，請精簡內容`);
  }
};

/**
 * Deterministically turns a storyboard into provider parameters. `mode` is
 * "t2v" or "i2v": Kling only accepts reference elements with a start frame,
 * so characters fall back to text descriptions otherwise.
 */
const compileStoryboard = (familyId, storyboard, { mode }) => {
  const family = getVideoModelFamily(familyId);
  const characterMode = characterModeFor(family, storyboard, mode);
  const cast = createCast(storyboard, characterMode);
  const characters = { characterMode, elements: cast.elements };
  if (!family.multiShot) {
    const prompt = compileMinimax(storyboard, cast);
    assertPromptLength(prompt, "送出內容");
    return { sendMode: "merged", prompt, multiPrompt: null, negativePrompt: null, storedPrompt: prompt, ...characters };
  }
  const negativePrompt = storyboard.global.negative || null;
  if (storyboard.shots.length === 1) {
    const prompt = compileKlingShot(storyboard, storyboard.shots[0], cast);
    assertPromptLength(prompt, "送出內容");
    return { sendMode: "single", prompt, multiPrompt: null, negativePrompt, storedPrompt: prompt, ...characters };
  }
  const multiPrompt = storyboard.shots.map((shot, index) => {
    const prompt = compileKlingShot(storyboard, shot, cast);
    assertPromptLength(prompt, `第 ${index + 1} 幕`);
    return { prompt, duration: String(shot.duration) };
  });
  return {
    sendMode: "multi",
    prompt: null,
    multiPrompt,
    negativePrompt,
    storedPrompt: JSON.stringify(multiPrompt),
    ...characters,
  };
};

const storyboardWarnings = (storyboard, { hasStartFrame = false } = {}) =>
  storyboard.shots.flatMap((shot) => {
    const warnings = [];
    const add = (code, message) => warnings.push({ shotId: shot.id, code, message });
    if (shot.script) {
      const unbound = [...shot.script.matchAll(IMAGE_REFERENCES)]
        .map((match) => match[0])
        .filter((reference) => {
          const label = reference.match(/^@(Image[1-9]\d?)$/i)?.[1];
          return !label || !labelCharacter(storyboard, label);
        });
      if (!hasStartFrame && unbound.length) {
        add(
          "unseen_reference",
          `腳本引用了 ${unbound[0]}，但這次沒有首影格，也沒有設為角色參考，模型看不到這張圖`
        );
      }
      return warnings;
    }
    const actions = shot.action.split(ACTION_SPLIT).filter((part) => part.trim());
    if (shot.duration <= 2 && actions.length > 1) {
      add("too_many_actions", `${shot.duration} 秒內安排了 ${actions.length} 個動作，建議拆成多幕或延長秒數`);
    }
    if (shot.camera === "static" && ZOOM_WORDS.test(shot.action)) {
      add("camera_conflict", "固定鏡頭和動作裡的推近、拉遠互相衝突");
    }
    if (!MOTION_WORDS.test(shot.action)) {
      add("static_action", "動作沒有描述變化，模型可能只產生靜止畫面");
    }
    return warnings;
  });

const quotedTexts = (text) => [...String(text || "").matchAll(QUOTED_TEXT)].map((match) => match[1]);

const storyboardText = (storyboard) =>
  [
    storyboard.title,
    storyboard.global.style,
    storyboard.global.lighting,
    storyboard.global.negative,
    ...storyboard.global.constraints,
    ...storyboard.shots.flatMap((shot) => [
      shot.title,
      shot.script,
      shot.scriptOriginal,
      shot.action,
      shot.environment,
    ]),
  ].filter(Boolean).join("\n");

const assertQuotedTextPreserved = (source, storyboard) => {
  const text = storyboardText(storyboard);
  const missing = quotedTexts(source).filter((quoted) => !text.includes(quoted));
  if (missing.length) fail(`AI 沒有保留指定文字「${missing[0]}」，請重試`, 502, "storyboard_agent_failed");
};

const shotsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const changedShotIdsBetween = (before, after) => {
  const previous = new Map(before.shots.map((shot) => [shot.id, shot]));
  return after.shots
    .filter((shot) => !previous.has(shot.id) || !shotsEqual(previous.get(shot.id), shot))
    .map((shot) => shot.id);
};

const assertRevisionScope = ({ before, after, declaredChangedIds, shotId }) => {
  const declared = new Set(Array.isArray(declaredChangedIds) ? declaredChangedIds : []);
  const afterIds = new Set(after.shots.map((shot) => shot.id));
  const removed = before.shots.filter((shot) => !afterIds.has(shot.id)).map((shot) => shot.id);
  const changed = changedShotIdsBetween(before, after);
  const undeclared = [...changed, ...removed].filter((id) => !declared.has(id));
  if (undeclared.length) fail("AI 修改了沒有標示的幕，請重試", 502, "storyboard_agent_failed");
  if (shotId) {
    const outside = [...changed, ...removed].filter((id) => id !== shotId);
    if (
      outside.length ||
      removed.length ||
      after.shots.length !== before.shots.length ||
      !shotsEqual(before.global, after.global)
    ) {
      fail("AI 修改了指定幕以外的內容，請重試", 502, "storyboard_agent_failed");
    }
  }
  return changed;
};

const collapseWhitespace = (text) => text.replace(/\s+/g, " ").trim();

const assertScriptFidelity = (source, storyboard) => {
  const normalizedSource = collapseWhitespace(source);
  let cursor = 0;
  storyboard.shots.forEach((shot, index) => {
    if (!shot.script) fail(`依腳本整理的第 ${index + 1} 幕缺少腳本原文`, 502, "storyboard_agent_failed");
    const original = collapseWhitespace(shot.scriptOriginal || shot.script);
    const found = normalizedSource.indexOf(original, cursor);
    if (found < 0) {
      fail(`第 ${index + 1} 幕的腳本和原文不一致，AI 不可改寫原文，請重試`, 502, "storyboard_agent_failed");
    }
    cursor = found + original.length;
    if (shot.scriptOriginal) {
      const kept = [...quotedTexts(shot.scriptOriginal), ...(shot.scriptOriginal.match(/@\S+/g) || [])];
      if (kept.some((text) => !shot.script.includes(text))) {
        fail(`第 ${index + 1} 幕濃縮時遺漏了引號文字或 @ 引用，請重試`, 502, "storyboard_agent_failed");
      }
    }
  });
};

module.exports = {
  ANGLES,
  CAMERAS,
  MAX_CHARACTERS,
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
  normalizeCharacters,
  normalizeStoryboard,
  quotedTexts,
  storyboardDuration,
  storyboardWarnings,
};
