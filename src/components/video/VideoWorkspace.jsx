import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronDown, Download, Plus, RotateCcw, X } from "@/components/icons/lucideControls";
import { Clapperboard, FileText, ImagePlay, ImagePlus } from "@/components/icons/lucideContent";
import { AlertCircle, Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import useVideoGeneration from "@/hooks/useVideoGeneration";
import useVideoStoryboard from "@/hooks/useVideoStoryboard";
import { downloadVideo } from "@/services/aiService";
import { uploadFile } from "@/services/storageService";
import { readFileAsDataUrl } from "@/lib/imageFile";
import { durationChoices, segmentRange, storyboardSeconds } from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";
import SegmentedPlayer from "./SegmentedPlayer";
import StoryboardBoard from "./storyboard/StoryboardBoard";
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

const SUGGESTIONS = ["晨光穿過森林的慢鏡頭", "珍珠奶茶在夜市燈光下緩慢旋轉", "以城市為背景的品牌開場"];

const imageSource = (source) => {
  if (!source) return null;
  return {
    sourceImageJobId: source.sourceImageJobId || null,
    sourceUploadId: source.sourceUploadId || null,
    previewUrl: source.previewUrl || "",
    name: source.name || "目前圖片",
  };
};

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
            <img src={attachment.previewUrl} alt="" className="size-8 rounded-md object-cover" />
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

function VideoTurn({ turn, isActive, onOpen, onRegenerate, onStop, onContinue, onEditStoryboard }) {
  const busy = !["succeeded", "failed"].includes(turn.status);
  const segmentCount = turn.segments?.length || 0;
  const videoUrls = turn.videoUrls || [];
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
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => onStop(turn.clientId)}
            >
              停止等待
            </button>
            </div>
          </div>
        </div>
      )}

      {turn.status === "failed" && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {turn.error}
        </p>
      )}

      {turn.status === "succeeded" && videoUrls.length > 0 && (
        <button
          type="button"
          className="group relative block w-full overflow-hidden rounded-xl bg-black text-left animate-in fade-in duration-(--motion-enter) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpen({ videoUrls })}
          aria-label={videoUrls.length > 1 ? `依序播放 ${videoUrls.length} 段影片` : "播放生成影片"}
        >
          <video src={videoUrls[0]} muted playsInline preload="metadata" className="aspect-video w-full object-contain" />
          {videoUrls.length > 1 && (
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {videoUrls.length} 段
            </span>
          )}
        </button>
      )}
      {turn.status === "succeeded" && videoUrls.length > 1 && (
        <p className="px-1 text-[11px] text-muted-foreground">分 {videoUrls.length} 段依序播放，不會保存到素材中心。</p>
      )}

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
            download={`pixora-video-${turn.segments[0].jobId}.mp4`}
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

function SourceChip({ source, label, onRemove, removeLabel }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 p-2">
      <img src={source.previewUrl} alt="" className="size-10 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{source.name}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onRemove} aria-label={removeLabel}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function VideoWorkspace({
  models = [],
  settings,
  historyItems = [],
  initialSource = null,
  onSaveHistory,
}) {
  const [brief, setBrief] = useState("");
  const [modelKey, setModelKey] = useState(models[0]?.modelKey || "");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [resolution, setResolution] = useState(() => initialResolution(models[0]));
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [source, setSource] = useState(() => imageSource(initialSource));
  const [endSource, setEndSource] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [playerVideo, setPlayerVideo] = useState(null);
  const [boardVisible, setBoardVisible] = useState(false);
  const fileRef = useRef(null);
  const endFileRef = useRef(null);
  const briefRef = useRef(null);
  const threadEndRef = useRef(null);
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const videos = useVideoGeneration({ onSaved: onSaveHistory });

  const model = models.find((item) => item.modelKey === modelKey) || models[0] || null;
  const storyboard = useVideoStoryboard({ modelKey: model?.modelKey || "", hasStartFrame: Boolean(source) });
  const { board, pending } = storyboard;
  const unlimited = settings?.remainingQuota === null;
  const remainingQuota = Number(settings?.remainingQuota ?? 0);
  const hasQuota = unlimited || remainingQuota > 0;
  const drafting = pending === "draft" || pending === "script";
  const revising = Boolean(board) && boardVisible;
  const canSend = Boolean(brief.trim() && model && !isUploading && !pending);
  const recentVideos = useMemo(() => historyItems.filter((item) => item.videoJobId), [historyItems]);

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

  const attachment = source ? { previewUrl: source.previewUrl, name: source.name } : null;

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
      const blob = await downloadVideo({ jobId: item.videoJobId });
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
    || [...videos.turns].reverse().find((turn) => turn.videoUrls)
    || null;
  const showBoard = boardVisible && Boolean(board || drafting);
  const durationOptions = durationChoices(model).map((value) => ({ value: String(value), label: `${value} 秒` }));

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
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2 custom-scrollbar">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {thread.length === 0 && (
              <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center">
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Clapperboard className="size-7" aria-hidden="true" />
                </span>
                <h2 className="text-base font-semibold">先擬分鏡，再生成影片</h2>
                <p className="mt-1 max-w-md text-balance text-sm text-muted-foreground">
                  描述想要的畫面，AI 會拆成可檢查的分鏡；簡單的單一鏡頭也可以直接生成。
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground press-feedback hover:text-foreground"
                      onClick={() => setBrief(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {thread.map((item) => {
              if (item.type === "turn") {
                return (
                  <VideoTurn
                    key={item.key}
                    turn={item.turn}
                    isActive={item.turn.clientId === videos.activeTurnId}
                    onOpen={setPlayerVideo}
                    onRegenerate={regenerate}
                    onStop={videos.stopWaiting}
                    onContinue={(turn) => void continueFromVideo(turn)}
                    onEditStoryboard={editFromTurn}
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
              <p className="storyboard-enter flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                {drafting ? "AI 正在擬分鏡…" : "AI 正在修改分鏡…"}
              </p>
            )}
            <div ref={threadEndRef} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-card p-2 shadow-sm">
          {source && (
            <SourceChip
              source={source}
              label="作為首影格"
              removeLabel="移除首影格"
              onRemove={() => {
                setSource(null);
                setEndSource(null);
              }}
            />
          )}
          {source && endSource && (
            <SourceChip source={endSource} label="作為尾影格" removeLabel="移除尾影格" onRemove={() => setEndSource(null)} />
          )}
          <Textarea
            ref={briefRef}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !revising) return;
              event.preventDefault();
              sendRevision();
            }}
            placeholder={revising ? "告訴 AI 要怎麼改分鏡，例如：第 2 幕改成特寫…" : "描述主體、場景與想要的鏡頭，或貼上整段腳本…"}
            maxLength={revising ? 4000 : 50000}
            className="min-h-20 resize-none border-0 bg-transparent px-3 text-[15px] shadow-none focus-visible:ring-0"
            aria-label={revising ? "修改分鏡的指令" : "影片描述"}
          />
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 pt-2">
            <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => fileRef.current?.click()} disabled={isUploading} aria-label="上傳首影格">
              {isUploading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            </Button>
            {source && !endSource && (
              <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={() => endFileRef.current?.click()} disabled={isUploading}>
                尾影格
              </Button>
            )}
            <SelectField
              aria-label="影片模型"
              value={model?.modelKey || ""}
              onValueChange={changeModel}
              options={models.map((item) => ({ value: item.modelKey, label: item.label }))}
              className="h-9 min-w-32 flex-1 text-xs sm:flex-none"
            />
            {!revising && (
              <SelectField
                aria-label="影片秒數"
                value={String(durationSeconds)}
                onValueChange={(value) => setDurationSeconds(Number(value))}
                options={durationOptions}
                className="h-9 w-20 text-xs"
              />
            )}
            {!source && (
              <SelectField
                aria-label="影片比例"
                value={aspectRatio}
                onValueChange={setAspectRatio}
                options={(model?.capabilities?.aspectRatios || ["16:9"]).map((value) => ({ value, label: value }))}
                className="h-9 w-20 text-xs"
              />
            )}
            {model?.family === "minimax-h3-max" && (
              <SelectField
                aria-label="影片畫質"
                value={resolution}
                onValueChange={setResolution}
                options={(model.capabilities?.resolutions || [])
                  .slice(0, (model.capabilities?.resolutions || []).indexOf(model.maxResolution) + 1)
                  .map((value) => ({ value, label: value }))}
                className="h-9 w-24 text-xs"
              />
            )}
            {model?.capabilities?.supportsAudioToggle && model.allowAudio && (
              <label className="flex h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground">
                含音訊
                <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} className="accent-primary" />
              </label>
            )}
          </div>
          <div className="flex items-center gap-2 px-2 pb-0.5 pt-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {unlimited ? "不限額" : `今日剩餘 ${remainingQuota} 次`}
            </span>
            {revising ? (
              <Button type="button" size="sm" className="h-9 rounded-xl" disabled={!canSend} onClick={sendRevision}>
                送出
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" disabled={!canSend || !hasQuota} onClick={directGenerate}>
                  直接生成
                </Button>
                <div className="flex">
                  <Button type="button" size="sm" className="h-9 gap-1.5 rounded-l-xl rounded-r-none" disabled={!canSend} onClick={() => startDraft("draft")}>
                    <Clapperboard className="size-4" aria-hidden="true" />生成分鏡
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" className="h-9 rounded-l-none rounded-r-xl border-l border-primary-foreground/20 px-2" disabled={!canSend} aria-label="更多分鏡方式">
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => startDraft("script")}>
                        <FileText className="size-4" aria-hidden="true" />依腳本整理分鏡
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
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
      </section>

      <section className="relative hidden min-h-0 overflow-hidden rounded-2xl border border-border bg-card bg-dot-grid bg-size-[20px_20px] lg:flex" aria-label="影片畫布">
        {showBoard && !isMobile ? (
          <StoryboardBoard {...boardProps} onClose={() => setBoardVisible(false)} />
        ) : activeTurn?.videoUrls ? (
          <div className="flex min-h-0 w-full flex-col animate-in fade-in duration-(--motion-enter) ease-emphasized">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur-md">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{turnTitle(activeTurn)}</p>
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
              {activeTurn.videoUrls.length === 1 && (
                <a href={activeTurn.videoUrls[0]} download className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="下載影片">
                  <Download className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
            <SegmentedPlayer key={activeTurn.clientId} urls={activeTurn.videoUrls} className="min-h-0 flex-1" />
          </div>
        ) : videos.turns.length ? (
          <div className="m-auto flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm">{statusLabel(videos.turns[videos.turns.length - 1])}</p>
          </div>
        ) : (
          <div className="m-auto flex max-w-sm flex-col items-center gap-4 px-8 text-center">
            <ImagePlay className="size-10 text-muted-foreground/50" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">分鏡與影片會出現在這裡</p>
              <p className="mt-1 text-xs text-muted-foreground">確認分鏡後送出，完成即可播放、下載或保存到素材中心。</p>
            </div>
            {recentVideos.length > 0 && (
              <div className="mt-2 flex w-full flex-col gap-2">
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
        )}
      </section>

      <AnimatePresence>
        {showBoard && isMobile && <StoryboardSheet {...boardProps} onClose={() => setBoardVisible(false)} />}
      </AnimatePresence>
      <VideoPlayer video={playerVideo} onClose={closePlayer} />
    </div>
  );
}
