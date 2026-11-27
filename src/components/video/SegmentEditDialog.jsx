import React, { useState } from "react";
import { Sparkles } from "@/components/icons/lucideContent";
import { AlertCircle, Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ShotCard from "./storyboard/ShotCard";
import { storyboardActions } from "./storyboard/storyboardActions";
import { regeneratedSegments } from "./segmentEdit";

const segmentList = (indexes) => `第 ${indexes.map((index) => index + 1).join("、")} 段`;

/**
 * Edits the shots of one generated segment, optionally with an AI polish that
 * may only change those shots, then regenerates it in place. Segments that do
 * not change are reused; chained segments after it regenerate for continuity.
 */
export default function SegmentEditDialog({
  turn,
  segment,
  storyboard,
  canGenerate,
  generateBlocker,
  remainingQuota = null,
  onSubmit,
  onClose,
}) {
  const [instruction, setInstruction] = useState("");
  const [polishFrom, setPolishFrom] = useState(null);
  const { board, pending, inspection, messages } = storyboard;
  const actions = storyboardActions(storyboard);
  const shotIds = segment.shotIds;
  const polishKind = `revise:${shotIds.join(",")}`;
  const busy = Boolean(pending);
  const url = turn.segmentUrls?.[segment.jobId];
  const label = `第 ${segment.index + 1} 段`;

  const regenerated = board?.segments
    ? regeneratedSegments({ plan: board.segments, storyboard: board.storyboard, previous: turn })
    : null;
  const polishError = polishFrom === null
    ? ""
    : messages.slice(polishFrom).findLast((message) => message.kind === "error")?.text || "";

  if (!board) return null;
  const shots = board.storyboard.shots
    .map((shot, index) => ({ shot, index }))
    .filter(({ shot }) => shotIds.includes(shot.id));
  const overQuota = remainingQuota !== null && regenerated && regenerated.length > remainingQuota;
  const blocker = generateBlocker
    || (inspection.status === "invalid" && inspection.error)
    || (regenerated?.length === 0 && "尚未修改這一段")
    || (overQuota && `需要 ${regenerated.length} 段，今日額度只剩 ${remainingQuota} 段`)
    || "";
  const reusedCount = regenerated ? board.segments.length - regenerated.length : 0;
  const others = (regenerated || []).filter((index) => index !== segment.index);
  const otherReasons = [
    others.some((index) => turn.segments[index]?.status === "succeeded") && "接續畫面的分段",
    others.some((index) => turn.segments[index]?.status !== "succeeded") && "未完成的分段",
  ].filter(Boolean);

  const polish = (event) => {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || busy) return;
    setInstruction("");
    setPolishFrom(messages.length);
    void storyboard.revise({ instruction: text, shotIds, label: `請 AI 潤飾${label}：${text}` });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(92dvh,52rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base">修改{label}</DialogTitle>
          <DialogDescription className="text-xs">
            只重新生成改動的分段，完成後取代原本的片段；其他分段沿用原影片。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-dot-grid bg-size-[20px_20px] px-5 py-4 custom-scrollbar">
          {url ? (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              aria-label={`${label}原影片`}
              className="mx-auto aspect-video max-h-48 w-full rounded-xl bg-black object-contain"
            />
          ) : segment.status === "failed" && (
            <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{segment.error?.message || "生成失敗"}</span>
            </p>
          )}
          {shots.map(({ shot, index }) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              index={index}
              warnings={board.warnings.filter((warning) => warning.shotId === shot.id)}
              notes={board.shotNotes?.[shot.id] || []}
              changed={board.changedShotIds.includes(shot.id)}
              flashKey={board.revision}
              busy={busy}
              rewriting={pending === `revise:${shot.id}`}
              canDelete={false}
              characters={board.storyboard.global.characters}
              previews={actions.previews}
              startFrameLocked={actions.startFrameLocked}
              onChange={(patch) => actions.updateShot(shot.id, patch)}
              onSetStartFrame={(uploadId) => actions.setStartFrame(shot.id, uploadId)}
              onToggleCharacter={(characterId) => actions.toggleShotCharacter(shot.id, characterId)}
              onRewrite={(mode) => void actions.rewriteShot(shot.id, mode)}
              onFix={(warning) => void actions.fixWarning(warning)}
              onDelete={() => {}}
            />
          ))}
        </div>

        <footer className="flex shrink-0 flex-col gap-2.5 border-t border-border px-5 py-3">
          <form className="flex items-end gap-2" onSubmit={polish}>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) polish(event);
              }}
              placeholder="告訴 AI 怎麼潤飾這一段，例如：動作放慢、改成特寫"
              maxLength={4000}
              rows={1}
              disabled={busy}
              aria-label={`AI 潤飾${label}的指示`}
              className="min-h-9 resize-none py-2 text-sm field-sizing-content max-h-28"
            />
            <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 press-feedback" disabled={busy || !instruction.trim()}>
              {pending === polishKind
                ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Sparkles aria-hidden="true" />}
              AI 潤飾
            </Button>
          </form>
          {polishError && <p role="alert" className="text-xs text-destructive">{polishError}</p>}
          <div className="flex items-center gap-2.5">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground" role="status">
              {blocker ? (
                <span className={inspection.status === "invalid" || overQuota ? "text-destructive" : undefined}>{blocker}</span>
              ) : regenerated ? (
                <>
                  將重新生成{segmentList(regenerated)}
                  {otherReasons.length > 0 && `（${otherReasons.join("與")}一併重生）`}
                  {reusedCount > 0 && `，沿用其餘 ${reusedCount} 段`}
                </>
              ) : "檢查分鏡中…"}
            </p>
            <Button type="button" variant="ghost" size="sm" className="h-8.5 rounded-xl" onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8.5 rounded-xl press-feedback"
              onClick={onSubmit}
              disabled={!canGenerate || Boolean(blocker) || !regenerated}
            >
              {regenerated && regenerated.length > 1 ? `重新生成 ${regenerated.length} 段` : "重新生成此段"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
