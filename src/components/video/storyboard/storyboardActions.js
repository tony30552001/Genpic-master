import {
  canHaveStartFrame,
  createShot,
  MAX_CHARACTERS,
  MAX_SHOTS,
  newCharacterId,
  segmentStartLabel,
} from "@/lib/videoStoryboard";

const CONDENSE_INSTRUCTION =
  "把這一幕的腳本濃縮到 2500 字以內，保留引號內文字、@ 引用與主要動作，原文放在 scriptOriginal";
const REWRITE_INSTRUCTION =
  "重寫這一幕：動作更具體、只有一個主要動作且符合秒數，運鏡與動作描述一致";

/** Edits and agent requests shared by the desktop board and the phone sheet. */
export const storyboardActions = (storyboard) => {
  const shots = storyboard.board?.storyboard.shots || [];
  const characters = storyboard.board?.storyboard.global.characters || [];
  const editCharacters = (update) =>
    storyboard.edit((current) => ({
      ...current,
      global: { ...current.global, characters: update(current.global.characters) },
    }));
  // A shot that no longer starts a segment drops its start frame.
  const updateShot = (shotId, patch) =>
    storyboard.edit(
      (current) => ({
        ...current,
        shots: current.shots.map((shot, index) => {
          if (shot.id !== shotId) return shot;
          const next = { ...shot, ...patch };
          return canHaveStartFrame(next, index) ? next : { ...next, startFrameUploadId: null };
        }),
      }),
      shotId
    );
  return {
    updateShot,
    setStartFrame: (shotId, uploadId) => updateShot(shotId, { startFrameUploadId: uploadId }),
    deleteShot: (shotId) =>
      storyboard.edit((current) => ({
        ...current,
        shots: current.shots.filter((shot) => shot.id !== shotId),
      })),
    addShot: () =>
      storyboard.edit((current) => ({ ...current, shots: [...current.shots, createShot(current.shots)] })),
    canAddShot: shots.length < MAX_SHOTS,
    updateGlobal: (patch) =>
      storyboard.edit((current) => ({ ...current, global: { ...current.global, ...patch } })),
    toggleShotCharacter: (shotId, characterId) =>
      storyboard.edit(
        (current) => ({
          ...current,
          shots: current.shots.map((shot) => {
            if (shot.id !== shotId) return shot;
            const ids = shot.characterIds.includes(characterId)
              ? shot.characterIds.filter((id) => id !== characterId)
              : [...shot.characterIds, characterId];
            // Keep catalog order so element numbering matches the global card.
            const order = current.global.characters.map((character) => character.id);
            return { ...shot, characterIds: order.filter((id) => ids.includes(id)) };
          }),
        }),
        shotId
      ),
    addCharacter: (character) =>
      editCharacters((current) => [...current, { ...character, id: newCharacterId(current) }]),
    updateCharacter: (characterId, patch) =>
      editCharacters((current) =>
        current.map((character) => (character.id === characterId ? { ...character, ...patch } : character))
      ),
    removeCharacter: (characterId) =>
      storyboard.edit((current) => ({
        ...current,
        global: {
          ...current.global,
          characters: current.global.characters.filter((character) => character.id !== characterId),
        },
        shots: current.shots.map((shot) => ({
          ...shot,
          characterIds: shot.characterIds.filter((id) => id !== characterId),
        })),
      })),
    canAddCharacter: characters.length < MAX_CHARACTERS,
    uploadImage: storyboard.uploadImage,
    previews: storyboard.previews,
    startFrameLocked: storyboard.hasStartFrame,
    rewriteShot: (shotId, mode) => {
      const index = shots.findIndex((shot) => shot.id === shotId);
      return storyboard.revise({
        shotIds: [shotId],
        instruction: mode === "condense" ? CONDENSE_INSTRUCTION : REWRITE_INSTRUCTION,
        label: mode === "condense" ? `請 AI 濃縮第 ${index + 1} 幕` : `請 AI 重寫第 ${index + 1} 幕`,
      });
    },
    fixWarning: (warning) => {
      const index = shots.findIndex((shot) => shot.id === warning.shotId);
      return storyboard.revise({
        shotIds: [warning.shotId],
        instruction: `修正這個問題：${warning.message}`,
        label: `請 AI 修正第 ${index + 1} 幕：${warning.message}`,
      });
    },
    redraft: () =>
      storyboard.revise({
        instruction: "重新擬一版分鏡，保留全片設定、總秒數與使用者引號內的文字",
        label: "請 AI 重擬分鏡",
      }),
  };
};

const compiledBody = (compiled) => {
  const body = compiled.multiPrompt
    ? compiled.multiPrompt.map((item, index) => `第 ${index + 1} 幕（${item.duration} 秒）\n${item.prompt}`).join("\n\n")
    : compiled.prompt;
  const elements = compiled.elements.map((element, index) => `@Element${index + 1} = ${element.name}`);
  const withElements = compiled.characterMode === "elements" ? `${elements.join("\n")}\n\n${body}` : body;
  return compiled.negativePrompt ? `${withElements}\n\nNegative: ${compiled.negativePrompt}` : withElements;
};

/** The request each segment sends; segments after the first get a header. */
export const compiledPreview = (segments) => {
  if (!segments) return "";
  if (segments.length === 1) return compiledBody(segments[0].compiled);
  return segments
    .map((segment) =>
      `── 第 ${segment.index + 1} 段 · ${segment.durationSeconds} 秒 · ${segmentStartLabel(segment)} ──\n${compiledBody(segment.compiled)}`
    )
    .join("\n\n");
};

export const boardStatus = (storyboard) => {
  if (storyboard.pending) return { label: "AI 修改中", tone: "run" };
  if (storyboard.inspection.status === "invalid") return { label: "需要修正", tone: "warn" };
  return { label: "待確認", tone: "draft" };
};

export const STATUS_TONES = {
  draft: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  warn: "bg-destructive/10 text-destructive",
  run: "bg-primary/12 text-primary",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

// Segments render one after another, so a longer storyboard takes longer.
export const estimateLabel = (model, segmentCount = 1) =>
  model?.family === "kling-v3-pro"
    ? `預估 ${3 * segmentCount}–${5 * segmentCount} 分鐘`
    : segmentCount > 1 ? `預估約 ${segmentCount} 分鐘` : "預估約 1 分鐘";
