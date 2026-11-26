import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronDown, Download, Play, RotateCcw, SquarePen, Trash2, X } from "@/components/icons/lucideControls";
import { BookOpen, Clapperboard, FileText, FileUp, History, ImagePlus, Layers, Sparkles } from "@/components/icons/lucideContent";
import { AlertCircle, Check, Loader2 } from "@/components/icons/lucideStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import useVideoGeneration from "@/hooks/useVideoGeneration";
import useVideoStoryboard from "@/hooks/useVideoStoryboard";
import { downloadVideo } from "@/services/aiService";
import { imageJobImageUrl } from "@/services/imageChatService";
import { uploadFile } from "@/services/storageService";
import { readFileAsDataUrl } from "@/lib/imageFile";
import { SCRIPT_DOCUMENT_ACCEPT, durationChoices, segmentRange, storyboardSeconds } from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";
import ChatHistory from "@/components/chat/ChatHistory";
import Reasoning from "@/components/chat/Reasoning";
import ScriptTemplateDialog from "./ScriptTemplateDialog";
import SegmentedPlayer from "./SegmentedPlayer";
import StoryboardBoard from "./storyboard/StoryboardBoard";
import StoryboardProgress from "./storyboard/StoryboardProgress";
import StoryboardSheet from "./storyboard/StoryboardSheet";
import StoryboardSummaryCard from "./storyboard/StoryboardSummaryCard";

const STATUS_LABELS = {
  drafting: "AI 正在整理鏡頭",
  queued: "排隊中",
  submitting: "送出中",
  polling: "生成中",
  storing: "轉存成品中",
  succeeded: "生成完成",
  failed: "生成失敗",
};

const SAVE_STATUS_LABELS = {
  pending: "尚未儲存",
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
};

const ICON_BUTTON_CLASS = "size-9 rounded-full text-muted-foreground hover:text-foreground";

const CHIP_CLASS =
  "inline-flex h-8 items-center rounded-[10px] border border-border px-2 text-xs whitespace-nowrap press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted";

function SettingRow({ label, children }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const imageSource = (source) => {
  if (!source) return null;
  return {
    sourceImageJobId: source.sourceImageJobId || null,
    sourceUploadId: source.sourceUploadId || null,
    previewUrl: source.previewUrl || "",
    name: source.name || "目前圖片",
  };
};

// Saved sessions keep image previews small: generated images reload from their
// job, uploaded data URLs are dropped and render as a placeholder.
const savedPreviewUrl = (item) => {
  if (item.sourceImageJobId) return imageJobImageUrl(item.sourceImageJobId);
  return /^https?:/.test(item.previewUrl || "") ? item.previewUrl : "";
};

const savedSource = (source) => source && { ...source, previewUrl: savedPreviewUrl(source) };

const sessionSnapshot = ({ messages, board, pendingJob, turns, settings, brief }) => {
  const firstUser = messages.find((message) => message.role === "user");
  const title = board?.storyboard?.title
    || turns[0]?.storyboard?.title
    || turns[0]?.brief
    || firstUser?.text
    || "";
  return {
    title: title.trim().slice(0, 40),
    state: {
      messages: messages.map((message) => (
        message.attachment ? { ...message, attachment: savedSource(message.attachment) } : message
      )),
      board: board && {
        storyboard: board.storyboard,
        shotNotes: board.shotNotes,
        changedShotIds: board.changedShotIds,
        reopened: board.reopened,
      },
      pendingAgent: pendingJob,
      turns: turns.map(({ videoUrls: _videoUrls, segmentUrls: _segmentUrls, ...turn }) => turn),
      settings: { ...settings, source: savedSource(settings.source), endSource: savedSource(settings.endSource) },
      brief,
    },
  };
};

function FramePreview({ previewUrl, className }) {
  if (previewUrl) return <img src={previewUrl} alt="" className={className} />;
  return (
    <span className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
      <ImagePlus className="size-4" aria-hidden="true" />
    </span>
  );
}

const initialResolution = (model) => {
  const supported = model?.capabilities?.resolutions || [];
  const maxIndex = supported.indexOf(model?.maxResolution);
  const allowed = maxIndex >= 0 ? supported.slice(0, maxIndex + 1) : supported;
  return allowed.includes("768P") ? "768P" : allowed[0] || "";
};

const statusLabel = (turn) => {
  const segments = turn.segments || [];
  const current = segments.find((segment) => segment.status !== "succeeded");
  const label = STATUS_LABELS[current?.phase] || STATUS_LABELS[current?.status] || STATUS_LABELS[turn.status] || "準備中";
  return segments.length > 1 && current ? `第 ${current.index + 1}/${segments.length} 段 · ${label}` : label;
};

const retryLabel = (segments) => {
  const failed = segments.filter((segment) => segment.status === "failed");
  if (segments.length === 1) return "重試";
  return failed.length === 1 ? `重試第 ${failed[0].index + 1} 段` : `重試失敗的 ${failed.length} 段`;
};

const SEGMENT_TONES = {
  succeeded: "bg-primary",
  processing: "bg-primary/45",
  failed: "bg-destructive",
  queued: "bg-foreground/15",
};

function SegmentProgress({ segments }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {segments.map((segment) => (
        <span
          key={segment.index}
          style={{ flexGrow: segment.durationSeconds }}
          className={cn(
            "h-1 basis-0 rounded-full transition-colors duration-(--motion-enter) ease-emphasized",
            SEGMENT_TONES[segment.status] || SEGMENT_TONES.queued
          )}
        />
      ))}
    </div>
  );
}

const turnTitle = (turn) => turn.storyboard?.title || turn.brief;

// Downloaded segments from the first one on, so playback order and the
// "第 N 段" labels stay correct while later segments still run.
const readySegmentUrls = (turn) => {
  const ready = [];
  for (const segment of turn.segments || []) {
    const url = segment.status === "succeeded" && turn.segmentUrls?.[segment.jobId];
    if (!url) break;
    ready.push(url);
  }
  return ready;
};

const playableUrls = (turn) => turn.videoUrls || readySegmentUrls(turn);

const summaryOf = (storyboard) => ({
  title: storyboard.title,
  seconds: storyboardSeconds(storyboard),
  shots: storyboard.shots.map((shot) => ({ id: shot.id, warned: false })),
});

function ElapsedTime() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

function UserBubble({ text, attachment }) {
  return (
    <div className="storyboard-enter flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed">
        {attachment && (
          <span className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <FramePreview previewUrl={attachment.previewUrl} className="size-8 shrink-0 rounded-md object-cover" />
            <span className="truncate">{attachment.name}</span>
          </span>
        )}
        <p className="line-clamp-6 whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function AgentMessage({ message, isLatest, onOpen, onQuestion }) {
  if (message.kind === "error") {
    return (
      <p className="storyboard-enter flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {message.text}
      </p>
    );
  }
  const changed = message.changedShotIds.length
    ? `已修改 ${message.changedShotIds.length} 幕 · 點擊查看`
    : isLatest ? "點擊查看與編輯" : "點擊開啟這個版本";
  return (
    <div className="storyboard-enter flex flex-col gap-2">
      {message.reasoning && <Reasoning text={message.reasoning} isThinking={false} />}
      {message.text && <p className="text-sm leading-relaxed text-foreground">{message.text}</p>}
      <StoryboardSummaryCard summary={message.summary} subtitle={changed} onOpen={() => onOpen(message, isLatest)} />
      {isLatest && message.questions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.questions.map((question) => (
            <button
              key={question}
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onQuestion(question)}
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MergeBar({ turn, onMerge }) {
  const merging = turn.mergeStatus === "merging";
  if (turn.mergeStatus === "merged") {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground animate-in fade-in duration-(--motion-enter) ease-emphasized" role="status">
        <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        已合併成一支影片並保存到素材中心
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl bg-muted/50 py-2 pl-3 pr-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">
          {merging
            ? `正在把 ${turn.segments.length} 段接成一支影片，約需一到兩分鐘…`
            : `目前分 ${turn.segments.length} 段依序播放；合併後才能下載並保存到素材中心。`}
        </p>
        <Button
          type="button"
          size="sm"
          className="press-feedback shrink-0 gap-1.5 text-xs"
          onClick={() => onMerge(turn)}
          disabled={merging}
          aria-busy={merging}
        >
          {merging ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Layers className="size-3.5" aria-hidden="true" />
          )}
          {merging ? "合併中" : turn.mergeStatus === "failed" ? "重新合併" : "合併成一支影片"}
        </Button>
      </div>
      {turn.mergeStatus === "failed" && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {turn.mergeError}
        </p>
      )}
    </div>
  );
}

function VideoTurn({ turn, isActive, onOpen, onRegenerate, onRetry, onStop, onContinue, onEditStoryboard, onMerge }) {
  const busy = !["succeeded", "failed"].includes(turn.status);
  const segmentCount = turn.segments?.length || 0;
  const retryable = turn.status === "failed" && turn.projectId && turn.segments?.some((segment) => segment.status === "failed");
  const videoUrls = turn.videoUrls || [];
  const playable = playableUrls(turn);
  const partial = !turn.videoUrls && playable.length > 0;
  return (
    <article
      className={cn(
        "storyboard-enter space-y-3 rounded-2xl border border-border bg-card p-3",
        isActive && "ring-1 ring-primary/35"
      )}
    >
      {turn.storyboard ? (
        <StoryboardSummaryCard
          summary={summaryOf(turn.storyboard)}
          subtitle={turn.brief ? "直接生成" : "已確認的分鏡"}
          onOpen={() => onEditStoryboard(turn)}
          className="border-0 bg-muted/50"
        />
      ) : (
        <p className="line-clamp-3 whitespace-pre-wrap px-1 text-sm leading-relaxed">{turn.brief}</p>
      )}

      {busy && (
        <div
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted/50 shadow-inner ring-1 ring-border/20"
          role="status"
          aria-busy="true"
          aria-live="polite"
          data-video-generation-placeholder
        >
          <div className="image-generation-dots pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="image-generation-glow pointer-events-none absolute -inset-[18%]" aria-hidden="true" />
          <div
            className="image-generation-glow image-generation-glow-secondary pointer-events-none absolute -inset-[18%]"
            aria-hidden="true"
          />
          {partial && (
            <video
              key={playable.at(-1)}
              src={playable.at(-1)}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 size-full bg-black object-contain animate-in fade-in duration-(--motion-enter) ease-emphasized"
              aria-hidden="true"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-background/90 via-background/65 to-transparent px-3 pb-2.5 pt-10">
            {segmentCount > 1 && <SegmentProgress segments={turn.segments} />}
            <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
              <span
                className="image-generation-status-dot size-1.5 shrink-0 rounded-full bg-foreground/70"
                aria-hidden="true"
              />
              <span className="truncate">{statusLabel(turn)}</span>
              <ElapsedTime />
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {partial && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpen({ videoUrls: playable })}
                >
                  <Play className="size-3" aria-hidden="true" />預覽 {playable.length} 段
                </button>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => onStop(turn.clientId)}
              >
                停止等待
              </button>
            </span>
            </div>
          </div>
        </div>
      )}

      {turn.status === "failed" && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{turn.error}</p>
          {retryable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="-my-1 h-7 shrink-0 gap-1.5 whitespace-nowrap border-destructive/30 bg-card text-xs text-foreground press-feedback"
              onClick={() => onRetry(turn)}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />{retryLabel(turn.segments)}
            </Button>
          )}
        </div>
      )}

      {!busy && playable.length > 0 && (
        <button
          type="button"
          className="group relative block w-full overflow-hidden rounded-xl bg-black text-left animate-in fade-in duration-(--motion-enter) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpen({ videoUrls: playable })}
          aria-label={playable.length > 1 ? `依序播放 ${playable.length} 段影片` : "播放生成影片"}
        >
          <video src={playable[0]} muted playsInline preload="metadata" className="aspect-video w-full object-contain" />
          {(playable.length > 1 || partial) && (
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {partial ? `已完成 ${playable.length}/${segmentCount} 段` : `${playable.length} 段`}
            </span>
          )}
        </button>
      )}
      {turn.status === "succeeded" && segmentCount > 1 && <MergeBar turn={turn} onMerge={onMerge} />}

      <div className="flex flex-wrap items-center justify-end gap-1">
        {turn.storyboard && (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onEditStoryboard(turn)}>
            <Clapperboard className="size-3.5" aria-hidden="true" />修改分鏡
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onRegenerate(turn)} disabled={busy}>
          <RotateCcw className="size-3.5" aria-hidden="true" />重新生成
        </Button>
        {videoUrls.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onContinue(turn)}>
            <ImagePlus className="size-3.5" aria-hidden="true" />接著生成
          </Button>
        )}
        {videoUrls.length === 1 && (
          <a
            href={videoUrls[0]}
            download={`pixora-video-${turn.projectId}.mp4`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5" aria-hidden="true" />下載
          </a>
        )}
      </div>
    </article>
  );
}

function VideoPlayer({ video, onClose }) {
  if (!video) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label="影片播放">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white" aria-label="關閉影片">
          <X aria-hidden="true" />
        </Button>
      </div>
      <SegmentedPlayer
        key={video.videoUrls[0]}
        urls={video.videoUrls}
        autoPlay
        dark
        className="mx-auto my-auto max-h-[calc(100dvh-5rem)] w-full max-w-5xl"
      />
    </div>
  );
}

/**
 * Video creation workspace. `sessions` (useVideoSessions) persists every change
 * as a snapshot; the parent remounts this component with a new key when another
 * creation is opened, and it hydrates from `sessions.getInitialState()`.
 */
export default function VideoWorkspace({
  models = [],
  settings,
  historyItems = [],
  initialSource = null,
  onSaveHistory,
  sessions,
}) {
  const [restored] = useState(() => sessions.getInitialState());
  const restoredModel = models.find((item) => item.modelKey === restored?.settings.modelKey) || null;
  const [brief, setBrief] = useState(() => restored?.brief || "");
  const [modelKey, setModelKey] = useState(() => (restoredModel || models[0])?.modelKey || "");
  const [durationSeconds, setDurationSeconds] = useState(() => restored?.settings.durationSeconds ?? 5);
  const [resolution, setResolution] = useState(() =>
    restoredModel ? restored.settings.resolution : initialResolution(models[0])
  );
  const [aspectRatio, setAspectRatio] = useState(() => restored?.settings.aspectRatio || "16:9");
  const [generateAudio, setGenerateAudio] = useState(() => Boolean(restored?.settings.generateAudio));
  const [source, setSource] = useState(() => (restored ? restored.settings.source : imageSource(initialSource)));
  const [endSource, setEndSource] = useState(() => restored?.settings.endSource || null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [playerVideo, setPlayerVideo] = useState(null);
  const [boardVisible, setBoardVisible] = useState(() => Boolean(restored?.board || restored?.pendingAgent));
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef(null);
  const endFileRef = useRef(null);
  const scriptFileRef = useRef(null);
  const briefRef = useRef(null);
  const threadEndRef = useRef(null);
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const videos = useVideoGeneration({ onSaved: onSaveHistory, initialTurns: restored?.turns });

  const model = models.find((item) => item.modelKey === modelKey) || models[0] || null;
  const storyboard = useVideoStoryboard({
    modelKey: model?.modelKey || "",
    hasStartFrame: Boolean(source),
    initial: restored,
  });
  const { board, pending } = storyboard;
  const unlimited = settings?.remainingQuota === null;
  const remainingQuota = Number(settings?.remainingQuota ?? 0);
  const hasQuota = unlimited || remainingQuota > 0;
  const drafting = pending === "draft" || pending === "script";
  const revising = Boolean(board) && boardVisible;
  const canStart = Boolean(model && !isUploading && !pending);
  const canSend = Boolean(brief.trim() && canStart);
  const recentVideos = useMemo(() => historyItems.filter((item) => item.videoProjectId), [historyItems]);

  const thread = useMemo(
    () => [
      ...storyboard.messages.map((message) => ({ type: "message", key: message.id, createdAt: message.createdAt, message })),
      ...videos.turns.map((turn) => ({ type: "turn", key: turn.clientId, createdAt: turn.createdAt, turn })),
    ].sort((a, b) => a.createdAt - b.createdAt),
    [storyboard.messages, videos.turns]
  );
  const latestStoryboardId = [...storyboard.messages].reverse().find((message) => message.kind === "storyboard")?.id;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length]);

  const { record } = sessions;
  useEffect(() => {
    record(sessionSnapshot({
      messages: storyboard.messages,
      board,
      pendingJob: storyboard.pendingJob,
      turns: videos.turns,
      settings: { modelKey, durationSeconds, resolution, aspectRatio, generateAudio, source, endSource },
      brief,
    }));
  }, [
    aspectRatio, board, brief, durationSeconds, endSource, generateAudio, modelKey, record, resolution, source,
    storyboard.messages, storyboard.pendingJob, videos.turns,
  ]);

  // Deleting or leaving mid-run would drop a video that is not in history yet.
  const isBusy = Boolean(pending) || videos.turns.some((turn) =>
    !["succeeded", "failed"].includes(turn.status) || turn.mergeStatus === "merging"
  );
  const recentSessions = sessions.items.filter((item) => item.id !== sessions.activeId).slice(0, 3);

  const generateBlocker = !hasQuota
    ? "今日額度已用完"
    : isUploading
      ? "影格上傳中…"
      : storyboard.inspection.status === "loading"
        ? "檢查分鏡中…"
        : "";
  const canGenerate = Boolean(
    board?.segments && model && hasQuota && !isUploading && !pending && storyboard.inspection.status === "ready"
  );

  const mediaOptions = (nextSource = source) => ({
    mode: nextSource ? "i2v" : "t2v",
    resolution: model.family === "minimax-h3-max" ? resolution : undefined,
    aspectRatio,
    generateAudio,
    sourceUploadId: nextSource?.sourceUploadId,
    sourceImageJobId: nextSource?.sourceImageJobId,
    endSourceUploadId: nextSource ? endSource?.sourceUploadId : undefined,
    endSourceImageJobId: nextSource ? endSource?.sourceImageJobId : undefined,
  });

  const runVideo = async (request) => {
    setSubmitError("");
    try {
      await videos.submit(request);
    } catch (error) {
      if (error?.name !== "AbortError") setSubmitError(error.message || "影片送出失敗");
    }
  };

  const retryTurn = (turn) => {
    setSubmitError("");
    void videos.retryFailed(turn);
  };

  const attachment = source
    ? { previewUrl: source.previewUrl, name: source.name, sourceImageJobId: source.sourceImageJobId }
    : null;

  const directGenerate = () => {
    if (!canSend || !hasQuota) return;
    const text = brief.trim();
    setBrief("");
    void runVideo({ brief: text, durationSeconds, shotCount: Math.ceil(durationSeconds / segmentRange(model).max), modelKey: model.modelKey, ...mediaOptions() });
  };

  const startDraft = (kind) => {
    if (!canSend) return;
    const text = brief.trim();
    setBrief("");
    setBoardVisible(true);
    if (kind === "script") void storyboard.fromScript({ script: text, attachment });
    else void storyboard.draft({ brief: text, durationSeconds, attachment });
  };

  const importScript = (file) => {
    if (!file || !canStart) return;
    setBoardVisible(true);
    void storyboard.importScript({ file, attachment });
  };

  const sendRevision = () => {
    if (!canSend) return;
    const text = brief.trim();
    setBrief("");
    setBoardVisible(true);
    void storyboard.revise({ instruction: text });
  };

  const confirmGenerate = () => {
    if (!canGenerate) return;
    const confirmed = board.storyboard;
    storyboard.close();
    setBoardVisible(false);
    void runVideo({ storyboard: confirmed, modelKey: model.modelKey, ...mediaOptions() });
  };

  const openMessage = (message, isLatest) => {
    if (!(isLatest && board)) storyboard.open(message.storyboard, { reopened: false });
    setBoardVisible(true);
  };

  const editFromTurn = (turn) => {
    storyboard.open(turn.storyboard);
    setBoardVisible(true);
  };

  const askAbout = (question) => {
    setBrief(`關於「${question}」：`);
    briefRef.current?.focus();
  };

  const changeModel = (nextKey) => {
    const next = models.find((item) => item.modelKey === nextKey);
    setModelKey(nextKey);
    if (!next) return;
    const choices = durationChoices(next);
    setDurationSeconds((value) => choices.includes(value) ? value : choices.findLast((choice) => choice <= value) ?? choices[0]);
    setResolution(initialResolution(next));
    if (!next.capabilities?.aspectRatios?.includes(aspectRatio)) {
      setAspectRatio(next.capabilities?.aspectRatios?.[0] || "16:9");
    }
    if (!next.capabilities?.supportsAudioToggle || !next.allowAudio) setGenerateAudio(false);
  };

  const handleFile = async (file, asEndFrame = false) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitError("影格圖片必須小於 10MB");
      return;
    }
    setIsUploading(true);
    setSubmitError("");
    try {
      const { uploadId } = await uploadFile(file, "image");
      if (!uploadId) throw new Error("影格上傳失敗");
      const nextSource = {
        sourceUploadId: uploadId,
        sourceImageJobId: null,
        previewUrl: await readFileAsDataUrl(file),
        name: file.name,
      };
      if (asEndFrame) setEndSource(nextSource);
      else {
        setSource(nextSource);
        setEndSource(null);
      }
    } catch (error) {
      setSubmitError(error.message || "影格上傳失敗");
    } finally {
      setIsUploading(false);
    }
  };

  const regenerate = (turn) => {
    if (!hasQuota) return;
    if (turn.storyboard) void runVideo({ storyboard: turn.storyboard, modelKey: turn.modelKey, ...turn.options });
    else void runVideo({ brief: turn.brief, durationSeconds: turn.durationSeconds, shotCount: turn.shotCount, modelKey: turn.modelKey, ...turn.options });
  };

  const openHistory = async (item) => {
    setSubmitError("");
    try {
      const blob = await downloadVideo({ projectId: item.videoProjectId });
      setPlayerVideo({ videoUrls: [URL.createObjectURL(blob)], cleanup: true });
    } catch (error) {
      setSubmitError(error.message || "影片載入失敗");
    }
  };

  const continueFromVideo = async (turn) => {
    setSubmitError("");
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    const loaded = new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("無法讀取影片最後一格"));
    });
    video.src = turn.videoUrls[turn.videoUrls.length - 1];
    try {
      await loaded;
      const seeked = new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = () => reject(new Error("無法擷取影片最後一格"));
      });
      video.currentTime = Math.max(0, video.duration - 0.05);
      await seeked;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("無法建立首影格")), "image/jpeg", 0.9)
      );
      const file = new File([blob], `video-frame-${turn.clientId}.jpg`, { type: "image/jpeg" });
      const uploaded = await uploadFile(file, "image");
      setSource({
        sourceUploadId: uploaded.uploadId,
        sourceImageJobId: null,
        previewUrl: await readFileAsDataUrl(file),
        name: "上一支影片最後一格",
      });
      setEndSource(null);
      setBrief(`延續前一個鏡頭：${turnTitle(turn)}`);
    } catch (error) {
      setSubmitError(error.message || "無法接續這支影片");
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  };

  const closePlayer = () => {
    if (playerVideo?.cleanup) playerVideo.videoUrls.forEach((url) => URL.revokeObjectURL(url));
    setPlayerVideo(null);
  };

  const activeTurn = videos.turns.find((turn) => turn.clientId === videos.activeTurnId)
    || [...videos.turns].reverse().find((turn) => playableUrls(turn).length > 0)
    || null;
  const activeUrls = activeTurn ? playableUrls(activeTurn) : [];
  const showBoard = boardVisible && Boolean(board || drafting);
  const durationOptions = durationChoices(model).map((value) => ({ value: String(value), label: `${value} 秒` }));
  const settingsLabel = [
    !revising && `${durationSeconds} 秒`,
    !source && aspectRatio,
    model?.family === "minimax-h3-max" && resolution,
    generateAudio && "含音訊",
  ].filter(Boolean).join(" · ") || "設定";

  const boardProps = {
    storyboard,
    model,
    canGenerate,
    generateBlocker,
    onGenerate: confirmGenerate,
  };

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-5">
      <section className="flex min-h-0 flex-col overflow-hidden" aria-label="影片工作串流">
        <header className="flex shrink-0 items-center gap-0.5 py-1 pl-1 pr-0">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{sessions.title || "新的影片創作"}</h2>
            {(sessions.activeId || sessions.saveStatus !== "saved") && (
              <p
                className={cn("text-[11px]", sessions.saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}
                aria-live="polite"
              >
                {SAVE_STATUS_LABELS[sessions.saveStatus]}
              </p>
            )}
          </div>
          <ChatHistory
            chats={sessions.items}
            activeChatId={sessions.activeId}
            hasMore={sessions.hasMore}
            isLoading={sessions.isLoading}
            onOpen={(id) => void sessions.open(id)}
            onLoadMore={sessions.loadMore}
            triggerClassName={ICON_BUTTON_CLASS}
            label="創作紀錄"
            heading="最近的影片創作"
            emptyText="還沒有創作紀錄"
            untitled="未命名創作"
          />
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON_CLASS}
            aria-label="新的影片創作"
            onClick={sessions.startNew}
            disabled={(!sessions.activeId && thread.length === 0) || isBusy}
          >
            <SquarePen className="size-4" aria-hidden="true" />
          </Button>
          {sessions.activeId && (
            <Button
              variant="ghost"
              size="icon"
              className={ICON_BUTTON_CLASS}
              aria-label="刪除這段創作"
              disabled={isBusy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </header>
        {sessions.error && (
          <p role="alert" className="flex shrink-0 items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {sessions.error}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2 custom-scrollbar">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {thread.map((item) => {
              if (item.type === "turn") {
                return (
                  <VideoTurn
                    key={item.key}
                    turn={item.turn}
                    isActive={item.turn.clientId === videos.activeTurnId}
                    onOpen={setPlayerVideo}
                    onRegenerate={regenerate}
                    onRetry={retryTurn}
                    onStop={videos.stopWaiting}
                    onContinue={(turn) => void continueFromVideo(turn)}
                    onEditStoryboard={editFromTurn}
                    onMerge={videos.merge}
                  />
                );
              }
              const { message } = item;
              if (message.role === "user") return <UserBubble key={item.key} text={message.text} attachment={message.attachment} />;
              return (
                <AgentMessage
                  key={item.key}
                  message={message}
                  isLatest={message.id === latestStoryboardId}
                  onOpen={openMessage}
                  onQuestion={askAbout}
                />
              );
            })}
            {pending && (
              <StoryboardProgress
                progress={storyboard.progress}
                waitingLabel={drafting ? "AI 正在擬分鏡…" : "AI 正在修改分鏡…"}
              />
            )}
            <div ref={threadEndRef} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl rounded-[22px] border border-border bg-card p-3 shadow-sm">
          <div className="flex gap-2.5">
            <div className="relative shrink-0">
              <button
                type="button"
                className={cn(
                  "flex size-14 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                  source ? "ring-1 ring-border" : "border border-dashed border-border"
                )}
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                aria-label={source ? `更換首影格（${source.name}）` : "上傳首影格"}
              >
                {isUploading ? (
                  <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : source ? (
                  <FramePreview previewUrl={source.previewUrl} className="size-full object-cover animate-in fade-in duration-(--motion-enter) ease-emphasized" />
                ) : (
                  <>
                    <ImagePlus className="size-4" aria-hidden="true" />
                    <span className="text-[10px] leading-none">首影格</span>
                  </>
                )}
              </button>
              {source && !isUploading && (
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm after:absolute after:-inset-2 press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setSource(null);
                    setEndSource(null);
                  }}
                  aria-label="移除首影格"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
            <Textarea
              ref={briefRef}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !revising) return;
                event.preventDefault();
                sendRevision();
              }}
              placeholder={revising ? "告訴 AI 怎麼調整，例如「第 2 幕改成夜景」" : "一兩句話概述影片（主題、氣氛、長度）…"}
              maxLength={revising ? 4000 : 50000}
              className="min-h-14 max-h-30 min-w-0 flex-1 resize-none border-0 bg-transparent p-0.5 text-sm shadow-none field-sizing-content focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
              aria-label={revising ? "告訴 AI 要怎麼調整" : "影片概述"}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-2">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={CHIP_CLASS + " min-w-0"} aria-label={`影片模型：${model?.label || "未設定"}`}>
                  <span className="truncate">{model?.label || "未設定模型"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-56 p-1">
                <div role="group" aria-label="影片模型">
                  {models.map((item) => (
                    <button
                      key={item.modelKey}
                      type="button"
                      aria-pressed={item.modelKey === model?.modelKey}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => changeModel(item.modelKey)}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.modelKey === model?.modelKey && <Check className="size-4 text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={CHIP_CLASS + " shrink-0"} aria-label={`影片設定：${settingsLabel}`}>
                  {settingsLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="grid w-64 gap-3 p-3">
                {!revising && (
                  <SettingRow label="秒數">
                    <SelectField aria-label="影片秒數" value={String(durationSeconds)} onValueChange={(value) => setDurationSeconds(Number(value))} options={durationOptions} className="h-8 w-28 text-xs" />
                  </SettingRow>
                )}
                <SettingRow label="比例">
                  {source ? (
                    <span className="text-xs text-muted-foreground">依首影格</span>
                  ) : (
                    <SelectField
                      aria-label="影片比例"
                      value={aspectRatio}
                      onValueChange={setAspectRatio}
                      options={(model?.capabilities?.aspectRatios || ["16:9"]).map((value) => ({ value, label: value }))}
                      className="h-8 w-28 text-xs"
                    />
                  )}
                </SettingRow>
                {model?.family === "minimax-h3-max" && (
                  <SettingRow label="畫質">
                    <SelectField
                      aria-label="影片畫質"
                      value={resolution}
                      onValueChange={setResolution}
                      options={(model.capabilities?.resolutions || [])
                        .slice(0, (model.capabilities?.resolutions || []).indexOf(model.maxResolution) + 1)
                        .map((value) => ({ value, label: value }))}
                      className="h-8 w-28 text-xs"
                    />
                  </SettingRow>
                )}
                {model?.capabilities?.supportsAudioToggle && model.allowAudio && (
                  <SettingRow label="含音訊">
                    <input type="checkbox" aria-label="含音訊" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} className="size-4 accent-primary" />
                  </SettingRow>
                )}
                {source && (
                  <SettingRow label="尾影格">
                    {endSource ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FramePreview previewUrl={endSource.previewUrl} className="size-8 rounded-md object-cover" />
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setEndSource(null)} aria-label="移除尾影格">
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </span>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => endFileRef.current?.click()} disabled={isUploading}>
                        上傳尾影格
                      </Button>
                    )}
                  </SettingRow>
                )}
                <p className="border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                  {unlimited ? "不限額" : `今日剩餘 ${remainingQuota} 次`}
                </p>
              </PopoverContent>
            </Popover>
            <div className="ml-auto flex shrink-0 gap-1">
              {revising ? (
                <Button type="button" size="sm" className="h-[34px] rounded-[11px] px-3.5 text-[13px]" disabled={!canSend} onClick={sendRevision}>
                  送出
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" size="sm" className="h-[34px] rounded-[11px] px-2.5 text-[13px]" disabled={!canSend || !hasQuota} onClick={directGenerate}>
                    直接生成
                  </Button>
                  <div className="flex">
                    <Button type="button" size="sm" className="h-[34px] gap-1 rounded-l-[11px] rounded-r-none px-2.5 text-[13px]" disabled={!canSend} onClick={() => startDraft("draft")}>
                      <Sparkles className="size-3.5" aria-hidden="true" />生成分鏡
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" className="h-[34px] w-7 rounded-l-none rounded-r-[11px] border-l border-primary-foreground/20 px-0" disabled={!canStart} aria-label="更多分鏡方式">
                          <ChevronDown className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={!canSend} onSelect={() => startDraft("script")}>
                          <FileText className="size-4" aria-hidden="true" />依腳本整理分鏡
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => scriptFileRef.current?.click()}>
                          <FileUp className="size-4" aria-hidden="true" />匯入腳本文件
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                          <BookOpen className="size-4" aria-hidden="true" />腳本範本與說明
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {submitError && <p role="alert" className="mx-auto mt-2 max-w-2xl text-xs text-destructive">{submitError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file);
          }}
        />
        <input
          ref={endFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file, true);
          }}
        />
        <input
          ref={scriptFileRef}
          type="file"
          accept={SCRIPT_DOCUMENT_ACCEPT}
          className="hidden"
          aria-label="匯入腳本文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            importScript(file);
          }}
        />
      </section>

      <section className="relative hidden min-h-0 overflow-hidden rounded-2xl border border-border bg-card bg-dot-grid bg-size-[20px_20px] lg:flex" aria-label="影片畫布">
        {showBoard && !isMobile ? (
          <StoryboardBoard {...boardProps} onClose={() => setBoardVisible(false)} />
        ) : activeUrls.length > 0 ? (
          <div className="flex min-h-0 w-full flex-col animate-in fade-in duration-(--motion-enter) ease-emphasized">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur-md">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{turnTitle(activeTurn)}</p>
              {!activeTurn.videoUrls && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground" role="status">
                  {activeTurn.status !== "failed" && (
                    <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                  )}
                  已完成 {activeUrls.length}/{activeTurn.segments.length} 段
                </span>
              )}
              {board && !boardVisible && (
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setBoardVisible(true)}>
                  查看分鏡
                </Button>
              )}
              {activeTurn.storyboard && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => editFromTurn(activeTurn)}>
                  <Clapperboard className="size-3.5" aria-hidden="true" />修改分鏡
                </Button>
              )}
              {activeTurn.videoUrls?.length === 1 && (
                <a href={activeTurn.videoUrls[0]} download={`pixora-video-${activeTurn.projectId}.mp4`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="下載影片">
                  <Download className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
            <SegmentedPlayer key={activeUrls[0]} urls={activeUrls} className="min-h-0 flex-1" />
          </div>
        ) : videos.turns.at(-1)?.status === "failed" ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-2 px-6 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{statusLabel(videos.turns.at(-1))}</p>
            <p className="text-balance text-[13px] leading-relaxed text-muted-foreground">{videos.turns.at(-1).error}</p>
          </div>
        ) : videos.turns.length ? (
          <div className="m-auto flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm">{statusLabel(videos.turns.at(-1))}</p>
          </div>
        ) : (
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex h-13 shrink-0 items-center border-b border-border bg-card/90 px-4 backdrop-blur-md">
              <h2 className="truncate text-[15px] font-semibold">分鏡板</h2>
            </div>
            <div className="m-auto flex max-w-xs flex-col items-center px-6 text-center">
              <p className="text-sm font-medium text-foreground">分鏡會出現在這裡</p>
              <p className="mt-1 text-balance text-[13px] leading-relaxed text-muted-foreground">按「生成分鏡」讓 AI 把概述拆成一幕一幕，確認後再生成；按「直接生成」則以單一鏡頭生成。</p>
              {recentSessions.length > 0 && (
                <div className="mt-6 flex w-full flex-col gap-2">
                  <p className="text-left text-xs font-medium text-muted-foreground">最近創作</p>
                  {recentSessions.map((item) => (
                    <button key={item.id} type="button" className="flex items-center gap-2 rounded-lg border border-border bg-card/90 p-2 text-left text-xs press-feedback" onClick={() => void sessions.open(item.id)}>
                      <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{item.title || "未命名創作"}</span>
                    </button>
                  ))}
                </div>
              )}
              {recentVideos.length > 0 && (
                <div className="mt-6 flex w-full flex-col gap-2">
                  <p className="text-left text-xs font-medium text-muted-foreground">最近影片</p>
                  {recentVideos.slice(0, 3).map((item) => (
                    <button key={item.id} type="button" className="flex items-center gap-2 rounded-lg border border-border bg-card/90 p-2 text-left text-xs press-feedback" onClick={() => void openHistory(item)}>
                      <Clapperboard className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{item.userScript || "未命名影片"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <AnimatePresence>
        {showBoard && isMobile && <StoryboardSheet {...boardProps} onClose={() => setBoardVisible(false)} />}
      </AnimatePresence>
      <VideoPlayer video={playerVideo} onClose={closePlayer} />
      <ScriptTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      <AlertDialog open={deleteOpen && Boolean(sessions.activeId)} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這段創作？</AlertDialogTitle>
            <AlertDialogDescription>
              分鏡與對話紀錄會永久刪除；已生成的影片仍保留在素材中心。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void sessions.remove(sessions.activeId)}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
