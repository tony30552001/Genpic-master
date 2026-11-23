import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Plus,
  RotateCcw,
  X,
} from "@/components/icons/lucideControls";
import {
  Clapperboard,
  ImagePlus,
  ImagePlay,
  Sparkles,
} from "@/components/icons/lucideContent";
import { AlertCircle, Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import useVideoGeneration from "@/hooks/useVideoGeneration";
import { downloadVideo } from "@/services/aiService";
import { uploadFile } from "@/services/storageService";
import { readFileAsDataUrl } from "@/lib/imageFile";
import { cn } from "@/lib/utils";

const RATE_USD = {
  "480P": 0.05,
  "768P": 0.08,
  "1080P": 0.16,
};

const STATUS_LABELS = {
  optimizing: "AI 正在優化描述",
  queued: "排隊中",
  submitting: "送出中",
  polling: "生成中",
  storing: "轉存成品中",
  succeeded: "生成完成",
  failed: "生成失敗",
};

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

const statusLabel = (turn) => STATUS_LABELS[turn.phase] || STATUS_LABELS[turn.status] || "準備中";

function VideoTurn({ turn, onOpen, onRegenerate, onStop, onContinue, isActive }) {
  const busy = !["succeeded", "failed"].includes(turn.status);
  return (
    <article
      className={cn(
        "space-y-3 rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none",
        isActive && "ring-1 ring-primary/35"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          你
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.prompt}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1">{turn.options?.durationSeconds} 秒</span>
            {turn.options?.resolution && (
              <span className="rounded-full bg-muted px-2 py-1">{turn.options.resolution}</span>
            )}
            {turn.options?.aspectRatio && (
              <span className="rounded-full bg-muted px-2 py-1">{turn.options.aspectRatio}</span>
            )}
            {turn.options?.generateAudio && (
              <span className="rounded-full bg-muted px-2 py-1">含音訊</span>
            )}
          </div>
        </div>
      </div>

      {turn.explanation && (
        <div className="flex gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">AI 優化</p>
            <p className="mt-0.5 leading-relaxed">{turn.explanation}</p>
          </div>
        </div>
      )}

      {busy && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3" role="status">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              {statusLabel(turn)}
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => onStop(turn.clientId)}
            >
              停止等待
            </button>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          </div>
        </div>
      )}

      {turn.status === "failed" && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {turn.error}
        </p>
      )}

      {turn.status === "succeeded" && turn.videoUrl && (
        <button
          type="button"
          className="group block w-full overflow-hidden rounded-xl bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpen(turn)}
          aria-label="播放生成影片"
        >
          <video
            src={turn.videoUrl}
            muted
            playsInline
            preload="metadata"
            className="aspect-video w-full object-contain"
          />
        </button>
      )}

      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onRegenerate(turn)}>
          <RotateCcw className="size-3.5" aria-hidden="true" />重新生成
        </Button>
        {turn.videoUrl && (
          <>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onContinue(turn)}>
              <ImagePlus className="size-3.5" aria-hidden="true" />接著生成
            </Button>
            <a
              href={turn.videoUrl}
              download={`pixora-video-${turn.jobId || turn.clientId}.mp4`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="size-3.5" aria-hidden="true" />下載
            </a>
          </>
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
      <video
        src={video.videoUrl}
        controls
        playsInline
        autoPlay
        className="mx-auto my-auto max-h-[calc(100dvh-5rem)] w-full max-w-5xl object-contain"
      />
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
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(models[0]?.modelKey || "");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [resolution, setResolution] = useState(() => initialResolution(models[0]));
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [optimize, setOptimize] = useState(true);
  const [source, setSource] = useState(() => imageSource(initialSource));
  const [endSource, setEndSource] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [playerVideo, setPlayerVideo] = useState(null);
  const fileRef = useRef(null);
  const endFileRef = useRef(null);
  const threadEndRef = useRef(null);
  const videos = useVideoGeneration({ onSaved: onSaveHistory });

  const model = models.find((item) => item.modelKey === modelKey) || models[0] || null;
  const remainingQuota = Number(settings?.remainingQuota ?? 0);
  const canSubmit = Boolean(prompt.trim() && model && remainingQuota > 0 && !isUploading);
  const recentVideos = useMemo(
    () => historyItems.filter((item) => item.videoJobId),
    [historyItems]
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [videos.turns.length]);

  const submit = async ({ promptOverride, sourceOverride } = {}) => {
    if (!model || remainingQuota <= 0) return;
    const nextPrompt = promptOverride ?? prompt;
    if (!nextPrompt.trim()) return;
    const nextSource = sourceOverride === undefined ? source : sourceOverride;
    setSubmitError("");
    try {
      await videos.submit({
        prompt: nextPrompt.trim(),
        optimize,
        modelKey: model.modelKey,
        mode: nextSource ? "i2v" : "t2v",
        durationSeconds,
        resolution: model.family === "minimax-h3-max" ? resolution : undefined,
        aspectRatio: nextSource ? undefined : aspectRatio,
        generateAudio,
        sourceUploadId: nextSource?.sourceUploadId,
        sourceImageJobId: nextSource?.sourceImageJobId,
        endSourceUploadId: nextSource ? endSource?.sourceUploadId : undefined,
        endSourceImageJobId: nextSource ? endSource?.sourceImageJobId : undefined,
      });
      setPrompt("");
    } catch (error) {
      if (error?.name !== "AbortError") setSubmitError(error.message || "影片送出失敗");
    }
  };

  const changeModel = (nextKey) => {
    const next = models.find((item) => item.modelKey === nextKey);
    setModelKey(nextKey);
    if (!next) return;
    setDurationSeconds((value) => Math.max(
      next.capabilities?.minDuration || 1,
      Math.min(value, next.maxDurationSeconds || 5)
    ));
    setResolution(initialResolution(next));
    if (!next.capabilities?.aspectRatios?.includes(aspectRatio)) {
      setAspectRatio(next.capabilities?.aspectRatios?.[0] || "16:9");
    }
    if (!next.capabilities?.supportsAudioToggle || !next.allowAudio) setGenerateAudio(false);
  };

  const handleFile = async (file, asEndFrame = false) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitError("首影格圖片必須小於 10MB");
      return;
    }
    setIsUploading(true);
    setSubmitError("");
    try {
      const { uploadId } = await uploadFile(file, "image");
      if (!uploadId) throw new Error("首影格上傳失敗");
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
      setSubmitError(error.message || "首影格上傳失敗");
    } finally {
      setIsUploading(false);
    }
  };

  const regenerate = (turn) => {
    setPrompt(turn.prompt);
    void submit({ promptOverride: turn.prompt });
  };

  const openHistory = async (item) => {
    setSubmitError("");
    try {
      const blob = await downloadVideo({ jobId: item.videoJobId });
      setPlayerVideo({
        videoUrl: URL.createObjectURL(blob),
        cleanup: true,
      });
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
    video.src = turn.videoUrl;
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
      const file = new File([blob], `video-frame-${turn.jobId}.jpg`, { type: "image/jpeg" });
      const uploaded = await uploadFile(file, "image");
      setSource({
        sourceUploadId: uploaded.uploadId,
        sourceImageJobId: null,
        previewUrl: await readFileAsDataUrl(file),
        name: "上一支影片最後一格",
      });
      setEndSource(null);
      setPrompt(`延續前一個鏡頭：${turn.prompt}`);
    } catch (error) {
      setSubmitError(error.message || "無法接續這支影片");
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  };

  const closePlayer = () => {
    if (playerVideo?.cleanup) URL.revokeObjectURL(playerVideo.videoUrl);
    setPlayerVideo(null);
  };

  const activeTurn = videos.turns.find((turn) => turn.jobId === videos.activeJobId)
    || [...videos.turns].reverse().find((turn) => turn.videoUrl)
    || null;
  const estimatedUsd = model
    ? durationSeconds * (RATE_USD[resolution] || RATE_USD["1080P"])
    : 0;

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(460px,46%)_minmax(0,1fr)] lg:gap-5">
      <section className="flex min-h-0 flex-col overflow-hidden lg:pr-1" aria-label="影片工作串流">
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2 custom-scrollbar">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {videos.turns.length === 0 && (
              <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center">
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Clapperboard className="size-7" aria-hidden="true" />
                </span>
                <h2 className="text-base font-semibold">把一段描述變成影片</h2>
                <p className="mt-1 max-w-md text-balance text-sm text-muted-foreground">
                  可直接文字生成，或加入首影格讓角色、構圖與畫面文字更穩定。
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {["晨光穿過森林的慢鏡頭", "珍珠奶茶在夜市燈光下緩慢旋轉", "以城市為背景的品牌開場"].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground press-feedback hover:text-foreground"
                      onClick={() => setPrompt(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {videos.turns.map((turn) => (
              <VideoTurn
                key={turn.clientId}
                turn={turn}
                isActive={turn.jobId === videos.activeJobId}
                onOpen={setPlayerVideo}
                onRegenerate={regenerate}
                onStop={videos.stopWaiting}
                onContinue={(turn) => void continueFromVideo(turn)}
              />
            ))}
            <div ref={threadEndRef} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-card p-2 shadow-sm">
          {source && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 p-2">
              <img src={source.previewUrl} alt="" className="size-10 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{source.name}</p>
                <p className="text-[11px] text-muted-foreground">作為首影格</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => {
                setSource(null);
                setEndSource(null);
              }} aria-label="移除首影格">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          {source && endSource && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/50 p-2">
              <img src={endSource.previewUrl} alt="" className="size-10 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{endSource.name}</p>
                <p className="text-[11px] text-muted-foreground">作為尾影格</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setEndSource(null)} aria-label="移除尾影格">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="描述主體、場景、運鏡、光線與要保留的動作…"
            maxLength={4000}
            className="min-h-24 resize-none border-0 bg-transparent px-3 text-[15px] shadow-none focus-visible:ring-0"
            aria-label="影片描述"
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
              className="h-9 min-w-36 flex-1 text-xs sm:flex-none"
            />
            <SelectField
              aria-label="影片秒數"
              value={String(durationSeconds)}
              onValueChange={(value) => setDurationSeconds(Number(value))}
              options={Array.from(
                { length: Math.max(0, (model?.maxDurationSeconds || 5) - (model?.capabilities?.minDuration || 1) + 1) },
                (_, index) => String(index + (model?.capabilities?.minDuration || 1))
              ).map((value) => ({ value, label: `${value} 秒` }))}
              className="h-9 w-20 text-xs"
            />
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
            <label className="ml-auto flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              AI 優化
              <input type="checkbox" checked={optimize} onChange={(event) => setOptimize(event.target.checked)} className="accent-primary" />
            </label>
            {model?.capabilities?.supportsAudioToggle && model.allowAudio && (
              <label className="flex h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground">
                含音訊
                <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} className="accent-primary" />
              </label>
            )}
            <Button type="button" size="sm" className="h-9 gap-1.5 rounded-xl" disabled={!canSubmit} onClick={() => void submit()}>
              <Clapperboard className="size-4" aria-hidden="true" />生成影片
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
            <span>
              {model?.family === "kling-v3-pro" ? "預估 3–5 分鐘" : "預估約 30 秒"} · 約 ${estimatedUsd.toFixed(2)}
            </span>
            <span>今日剩餘 {remainingQuota} 次</span>
          </div>
        </div>
        {submitError && <p role="alert" className="mx-auto mt-2 max-w-2xl text-xs text-destructive">{submitError}</p>}
        <p className="mx-auto mt-2 max-w-2xl px-3 text-[11px] leading-relaxed text-muted-foreground">
          影片中的文字請直接寫進提示詞，或使用已包含文字的首影格；背景小字可能失真。資料會送至 fal 公開預覽服務。
        </p>
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
        {activeTurn?.videoUrl ? (
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur-md">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{activeTurn.prompt}</p>
              <a href={activeTurn.videoUrl} download className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="下載影片">
                <Download className="size-4" aria-hidden="true" />
              </a>
            </div>
            <video
              key={activeTurn.videoUrl}
              src={activeTurn.videoUrl}
              controls
              playsInline
              className="min-h-0 w-full flex-1 object-contain"
            />
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
              <p className="text-sm font-medium text-foreground">影片會出現在這裡</p>
              <p className="mt-1 text-xs text-muted-foreground">完成後可直接播放、下載或保存到素材中心。</p>
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

      <VideoPlayer video={playerVideo} onClose={closePlayer} />
    </div>
  );
}
