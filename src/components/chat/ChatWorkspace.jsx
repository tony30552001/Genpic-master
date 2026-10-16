import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus, Trash2, X } from "@/components/icons/lucideControls";
import { AlertCircle } from "@/components/icons/lucideStatus";
import { Image as ImageIcon } from "@/components/icons/lucideContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import ImagePreview from "@/components/create/ImagePreview";
import MobileResultView from "@/components/create/MobileResultView";
import { getImageQualityError } from "@/lib/imageModel";
import { apiGetBlob } from "@/services/apiClient";
import { getGenerationStatus } from "@/utils/generationProgress";
import ChatComposer from "./ChatComposer";
import ChatHistory from "./ChatHistory";
import ChatThread from "./ChatThread";

const SAVE_STATUS_LABELS = {
  pending: "尚未儲存",
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
};

function useElapsedSeconds(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

/**
 * Chat-to-image workspace: the conversation and composer on the left, the
 * selected image version on the right (a full-screen view on phones).
 */
export default function ChatWorkspace({
  chat,
  savedStyles,
  templates,
  imageModelConfig,
  modelSetupError,
  user,
  isMobileLayout,
}) {
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const { settings, selectedVersion, pendingImage } = chat;

  const quality = settings.quality ?? imageModelConfig?.defaultQuality ?? null;
  const configurationError =
    modelSetupError || (settings.quality ? getImageQualityError(imageModelConfig, settings.quality) : "");

  const pendingStartedAt = pendingImage ? Date.parse(pendingImage.createdAt) || null : null;
  const elapsedSeconds = useElapsedSeconds(pendingStartedAt);
  const isRefining = pendingImage?.action === "refine" && Boolean(selectedVersion);
  const generatedImage = selectedVersion?.imageUrl || null;

  const handleSelectVersion = (jobId) => {
    chat.selectVersion(jobId);
    if (isMobileLayout) setShowMobilePreview(true);
  };

  const handleDownload = async () => {
    if (!selectedVersion) return;
    setDownloadError("");
    try {
      const blob = await apiGetBlob(selectedVersion.imageUrl);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `chat-image-${chat.getVersionLabel(selectedVersion)}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (err) {
      setDownloadError(err.message || "下載圖片失敗，請稍後再試。");
    }
  };

  const errorMessage = chat.error || downloadError;
  const clearError = () => {
    chat.clearError();
    setDownloadError("");
  };

  const preview = (
    <ImagePreview
      generatedImage={generatedImage}
      isGenerating={Boolean(pendingImage)}
      isRefining={isRefining}
      aspectRatio={settings.aspectRatio}
      generationStatus={getGenerationStatus({ elapsedSeconds })}
      promptSummary={pendingImage?.content || ""}
      onDownload={handleDownload}
      user={user}
      versionRows={chat.versionRows}
      activeVersionId={chat.selectedJobId}
      onSelectVersion={chat.selectVersion}
      getVersionLabel={chat.getVersionLabel}
      getVersion={chat.getVersion}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/25 px-4 py-3 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-6">
        <section
          aria-label="對話創作"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-3"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{chat.chat?.title || "新對話"}</h2>
              {chat.chat && (
                <p
                  className={
                    chat.saveStatus === "error" ? "text-[11px] text-destructive" : "text-[11px] text-muted-foreground"
                  }
                  aria-live="polite"
                >
                  {SAVE_STATUS_LABELS[chat.saveStatus]}
                </p>
              )}
            </div>
            <ChatHistory
              chats={chat.chats}
              activeChatId={chat.chat?.id || null}
              hasMore={chat.hasMoreChats}
              isLoading={chat.isLoadingChats}
              onOpen={chat.openChat}
              onLoadMore={chat.loadMoreChats}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              aria-label="新對話"
              onClick={() => void chat.startNewChat()}
              disabled={!chat.chat || Boolean(chat.sending)}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden whitespace-nowrap sm:inline">新對話</span>
            </Button>
            {isMobileLayout && (generatedImage || pendingImage) && (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="查看圖片"
                onClick={() => setShowMobilePreview(true)}
              >
                <ImageIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
            {chat.chat && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="刪除對話" disabled={Boolean(chat.sending)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>刪除這段對話？</AlertDialogTitle>
                    <AlertDialogDescription>
                      對話內容會永久刪除；已產生的圖片仍保留在素材中心的歷史紀錄。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void chat.removeChat(chat.chat.id)}>刪除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </header>

          {errorMessage && (
            <div
              role="alert"
              className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{errorMessage}</span>
              <button
                type="button"
                onClick={clearError}
                aria-label="關閉錯誤訊息"
                className="flex size-6 shrink-0 items-center justify-center rounded text-destructive/80 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <ChatThread
            className="flex-1"
            messages={chat.messages}
            hasOlderMessages={chat.hasOlderMessages}
            onLoadOlder={chat.loadOlderMessages}
            isLoading={chat.isLoadingChat}
            selectedJobId={chat.selectedJobId}
            onSelectVersion={handleSelectVersion}
            getVersion={chat.getVersion}
            getVersionLabel={chat.getVersionLabel}
          />

          <ChatComposer
            className="shrink-0 border-t border-border p-3"
            draft={chat.draft}
            onDraftChange={chat.setDraft}
            onSend={chat.send}
            sending={chat.sending}
            onStop={chat.stopReply}
            attachment={chat.attachment}
            onAttachmentChange={chat.setAttachment}
            style={chat.style}
            onStyleChange={chat.setStyle}
            selectedVersionLabel={selectedVersion ? chat.getVersionLabel(selectedVersion) : ""}
            onClearSelectedVersion={() => chat.selectVersion(null)}
            settings={settings}
            onSettingsChange={chat.updateSettings}
            quality={quality}
            supportedQualities={imageModelConfig?.supportedQualities || []}
            savedStyles={savedStyles}
            templates={templates}
            configurationError={configurationError}
            disabled={chat.isLoadingChat}
          />
        </section>

        {!isMobileLayout && (
          <section
            aria-label="圖片預覽"
            className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40 lg:col-span-2"
          >
            <div className="relative z-10 max-h-full w-full max-w-2xl overflow-y-auto p-6">{preview}</div>
          </section>
        )}
      </div>

      <AnimatePresence>
        {isMobileLayout && showMobilePreview && (generatedImage || pendingImage) && (
          <MobileResultView key="chat-mobile-result" onClose={() => setShowMobilePreview(false)}>
            <div className="p-3">{preview}</div>
          </MobileResultView>
        )}
      </AnimatePresence>
    </div>
  );
}
