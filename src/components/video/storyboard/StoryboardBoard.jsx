import React, { useMemo, useState } from "react";
import { Plus, X } from "@/components/icons/lucideControls";
import { Clapperboard } from "@/components/icons/lucideContent";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { characterModeLabel, scriptImageLabels, segmentStarts, sendModeLabel, storyboardSeconds } from "@/lib/videoStoryboard";
import CharacterList from "./CharacterList";
import GlobalCard from "./GlobalCard";
import ShotCard from "./ShotCard";
import SegmentDivider from "./SegmentDivider";
import StoryboardTimeline from "./StoryboardTimeline";
import { DraftingShots, StatusPill } from "./StoryboardParts";
import { shotCountLabel } from "./progressSteps";
import { boardStatus, compiledPreview, estimateLabel, storyboardActions } from "./storyboardActions";

/** Desktop canvas content: the reviewable storyboard with its footer actions. */
export default function StoryboardBoard({
  storyboard,
  model,
  canGenerate,
  generateBlocker,
  onGenerate,
  onClose,
}) {
  const [showCompiled, setShowCompiled] = useState(false);
  const { board, pending, inspection, progress } = storyboard;
  const actions = storyboardActions(storyboard);
  const warnedIds = useMemo(
    () => new Set((board?.warnings || []).map((warning) => warning.shotId)),
    [board?.warnings]
  );

  if (!board) {
    return (
      <div className="flex min-h-0 w-full flex-col animate-in fade-in duration-(--motion-enter) ease-emphasized" aria-busy="true">
        <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <h2 className="text-[15px] font-semibold">分鏡板</h2>
          <StatusPill tone="draft">
            AI 擬稿中{shotCountLabel(progress) && <span className="tabular-nums"> · {shotCountLabel(progress)}</span>}
          </StatusPill>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-dot-grid bg-size-[20px_20px] px-5 py-3 custom-scrollbar">
          <span className="sr-only" role="status">AI 正在擬分鏡</span>
          <DraftingShots progress={progress} />
        </div>
      </div>
    );
  }

  const { shots, global } = board.storyboard;
  const seconds = storyboardSeconds(board.storyboard);
  const status = boardStatus(storyboard);
  const characterMode = characterModeLabel(board.segments, model?.family);
  const startsAt = segmentStarts(board.segments);
  const busy = Boolean(pending);
  const jump = (shotId) => {
    const card = document.getElementById(`storyboard-shot-${shotId}`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    card?.querySelector("textarea")?.focus({ preventScroll: true });
  };

  return (
    <div className="flex min-h-0 w-full flex-col animate-in fade-in duration-(--motion-enter) ease-emphasized">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <h2 className="min-w-0 truncate text-[15px] font-semibold">{board.storyboard.title}</h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shots.length} 幕 · {seconds} 秒</span>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="關閉分鏡板">
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-dot-grid bg-size-[20px_20px] px-5 pb-4 custom-scrollbar">
        {board.reopened && (
          <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
            {board.baseProjectId ? "從影片重新開啟的分鏡；生成時沿用未修改的分段，只重新生成改動的分鏡與接續其後的分段，原影片保留。" : "從影片重新開啟的分鏡；修改後會建立新的影片，原影片保留。"}
          </p>
        )}
        <StoryboardTimeline shots={shots} segments={board.segments} warnedIds={warnedIds} changedIds={board.changedShotIds} onJump={jump} />
        <GlobalCard global={global} onChange={actions.updateGlobal}>
          <CharacterList
            characters={global.characters}
            imageLabels={scriptImageLabels(board.storyboard)}
            actions={actions}
          />
        </GlobalCard>
        {shots.map((shot, index) => (
          <React.Fragment key={shot.id}>
            {startsAt.has(shot.id) && <SegmentDivider segment={startsAt.get(shot.id)} />}
          <ShotCard
            shot={shot}
            index={index}
            warnings={board.warnings.filter((warning) => warning.shotId === shot.id)}
            notes={board.shotNotes?.[shot.id] || []}
            changed={board.changedShotIds.includes(shot.id)}
            flashKey={board.revision}
            busy={busy}
            rewriting={pending === `revise:${shot.id}`}
            canDelete={shots.length > 1}
            characters={global.characters}
            previews={actions.previews}
            startFrameLocked={actions.startFrameLocked}
            onChange={(patch) => actions.updateShot(shot.id, patch)}
            onSetStartFrame={(uploadId) => actions.setStartFrame(shot.id, uploadId)}
            onToggleCharacter={(characterId) => actions.toggleShotCharacter(shot.id, characterId)}
            onRewrite={(mode) => void actions.rewriteShot(shot.id, mode)}
            onFix={(warning) => void actions.fixWarning(warning)}
            onDelete={() => actions.deleteShot(shot.id)}
          />
          </React.Fragment>
        ))}
        {actions.canAddShot && (
          <button
            type="button"
            className="flex h-10.5 shrink-0 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border bg-card/70 text-[13px] text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={actions.addShot}
          >
            <Plus className="size-3.5" aria-hidden="true" />新增分鏡
          </button>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">送出方式</span>
          <span className="min-w-0 truncate">
            {model?.label} · {sendModeLabel(board.segments)}
          </span>
          <button
            type="button"
            className="ml-auto shrink-0 rounded font-semibold text-primary press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={() => setShowCompiled((value) => !value)}
            aria-expanded={showCompiled}
            disabled={!board.segments}
          >
            {showCompiled ? "收起" : "預覽送出內容"}
          </button>
        </div>
        {characterMode && <p className="text-xs text-muted-foreground">{characterMode}</p>}
        {showCompiled && board.segments && (
          <pre className="storyboard-enter max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-muted px-3 py-2.5 font-mono text-[11px] leading-relaxed custom-scrollbar">
            {compiledPreview(board.segments)}
          </pre>
        )}
        {inspection.status === "invalid" && (
          <p role="alert" className="text-xs text-destructive">{inspection.error}</p>
        )}
        <div className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <b className="font-semibold text-foreground">{shots.length} 幕 · {seconds} 秒</b>
            {" · "}{generateBlocker || estimateLabel(model, board.segments?.length)}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-8.5 rounded-xl" onClick={() => void actions.redraft()} disabled={busy}>
            {pending === "revise" && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            請 AI 重擬
          </Button>
          <Button type="button" size="sm" className="h-8.5 gap-1.5 rounded-xl" onClick={onGenerate} disabled={!canGenerate}>
            <Clapperboard aria-hidden="true" />確認並生成影片
          </Button>
        </div>
      </footer>
    </div>
  );
}
