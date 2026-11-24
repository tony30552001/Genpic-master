import { createShot, MAX_SHOTS } from "@/lib/videoStoryboard";

const CONDENSE_INSTRUCTION =
  "把這一幕的腳本濃縮到 2500 字以內，保留引號內文字、@ 引用與主要動作，原文放在 scriptOriginal";
const REWRITE_INSTRUCTION =
  "重寫這一幕：動作更具體、只有一個主要動作且符合秒數，運鏡與動作描述一致";

/** Edits and agent requests shared by the desktop board and the phone sheet. */
export const storyboardActions = (storyboard) => {
  const shots = storyboard.board?.storyboard.shots || [];
  return {
    updateShot: (shotId, patch) =>
      storyboard.edit(
        (current) => ({
          ...current,
          shots: current.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
        }),
        shotId
      ),
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
    rewriteShot: (shotId, mode) => {
      const index = shots.findIndex((shot) => shot.id === shotId);
      return storyboard.revise({
        shotId,
        instruction: mode === "condense" ? CONDENSE_INSTRUCTION : REWRITE_INSTRUCTION,
        label: mode === "condense" ? `請 AI 濃縮第 ${index + 1} 幕` : `請 AI 重寫第 ${index + 1} 幕`,
      });
    },
    fixWarning: (warning) => {
      const index = shots.findIndex((shot) => shot.id === warning.shotId);
      return storyboard.revise({
        shotId: warning.shotId,
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

export const compiledPreview = (compiled) => {
  if (!compiled) return "";
  const body = compiled.multiPrompt
    ? compiled.multiPrompt.map((item, index) => `第 ${index + 1} 幕（${item.duration} 秒）\n${item.prompt}`).join("\n\n")
    : compiled.prompt;
  return compiled.negativePrompt ? `${body}\n\nNegative: ${compiled.negativePrompt}` : body;
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

export const estimateLabel = (model) =>
  model?.family === "kling-v3-pro" ? "預估 3–5 分鐘" : "預估約 1 分鐘";
