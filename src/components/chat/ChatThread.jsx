import { AlertCircle } from "@/components/icons/lucideStatus";
import { Brain, Image as ImageIcon, Palette } from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { Spinner } from "@/components/ui/spinner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

function UserMessage({ message }) {
  const { style, attachmentUploadId } = message.input || {};
  return (
    <Message from="user">
      <MessageContent className="whitespace-pre-wrap break-words">{message.content}</MessageContent>
      {(style || attachmentUploadId) && (
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 text-[11px] text-muted-foreground">
          {style && (
            <span className="inline-flex items-center gap-1">
              <Palette className="size-3" aria-hidden="true" />
              {style.name}
            </span>
          )}
          {attachmentUploadId && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-3" aria-hidden="true" />
              附圖
            </span>
          )}
        </div>
      )}
    </Message>
  );
}

function actionLabel(image, getVersion, getVersionLabel) {
  if (image.action === "generate") return "產生新圖";
  const source = getVersion(image.sourceJobId);
  return source ? `修改 ${getVersionLabel(source)}` : "修改圖片";
}

function ImageTile({ image, selectedJobId, onSelectVersion, getVersion, getVersionLabel }) {
  const version = image.status === "succeeded" ? getVersion(image.jobId) : null;
  const isPending = image.status === "queued" || image.status === "processing";

  return (
    <div className="flex w-40 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {actionLabel(image, getVersion, getVersionLabel)}
      </span>
      {isPending && (
        <div
          className="flex aspect-square items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background text-xs"
          role="status"
        >
          <Spinner aria-hidden="true" />
          生成中…
        </div>
      )}
      {image.status === "failed" && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 p-2 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {image.error?.message || "圖片生成失敗"}
        </p>
      )}
      {version && (
        <button
          type="button"
          onClick={() => onSelectVersion(version.id)}
          aria-label={`檢視 ${getVersionLabel(version)}`}
          aria-pressed={selectedJobId === version.id}
          className={cn(
            "group/thumb relative overflow-hidden rounded-md border border-border bg-background press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            selectedJobId === version.id && "ring-2 ring-primary ring-offset-2"
          )}
        >
          <img src={version.imageUrl} alt="" className="h-auto w-full object-contain" loading="lazy" />
          <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm">
            {getVersionLabel(version)}
          </span>
        </button>
      )}
    </div>
  );
}

function AssistantMessage({ message, selectedJobId, onSelectVersion, getVersion, getVersionLabel }) {
  const isResponding = message.status === "responding";
  const memoryNotes = message.input?.memoryNotes ?? [];
  const hasPendingImage = message.images.some((image) => image.status === "queued" || image.status === "processing");

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        {message.content ? (
          <MessageResponse isAnimating={isResponding}>{message.content}</MessageResponse>
        ) : isResponding ? (
          <Shimmer>思考中…</Shimmer>
        ) : null}

        {memoryNotes.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <Brain className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-muted-foreground">已記住</span>
              {memoryNotes.map((note) => (
                <span key={note} className="break-words">{note}</span>
              ))}
            </div>
          </div>
        )}

        {message.images.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ProductGlyph kind="create" className="size-4 text-primary" aria-hidden="true" />
              <span>{message.images.length > 1 ? `${message.images.length} 張圖片` : "圖片"}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {message.images.map((image) => (
                <ImageTile
                  key={image.jobId}
                  image={image}
                  selectedJobId={selectedJobId}
                  onSelectVersion={onSelectVersion}
                  getVersion={getVersion}
                  getVersionLabel={getVersionLabel}
                />
              ))}
            </div>
            {hasPendingImage && (
              <span className="text-xs text-muted-foreground">停止回覆不會取消已開始生成的圖片。</span>
            )}
          </div>
        )}

        {message.status === "interrupted" && !message.error && (
          <span className="text-xs text-muted-foreground">已停止回覆</span>
        )}
        {message.error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {message.error.message}
          </p>
        )}
      </MessageContent>
    </Message>
  );
}

/** Scrollable chat log; image results appear as thumbnails that select a version. */
export default function ChatThread({
  messages,
  hasOlderMessages,
  onLoadOlder,
  isLoading,
  selectedJobId,
  onSelectVersion,
  getVersion,
  getVersionLabel,
  className,
}) {
  if (isLoading) {
    return (
      <div className={cn("flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground", className)} role="status">
        <Spinner aria-hidden="true" />
        載入對話中…
      </div>
    );
  }

  return (
    <Conversation className={cn("min-h-0", className)} aria-label="對話內容">
      <ConversationContent className="gap-6">
        {messages.length === 0 ? (
          <ConversationEmptyState
            icon={<ProductGlyph kind="chat" className="size-10" aria-hidden="true" />}
            title="用對話開始創作"
            description="描述想要的畫面，AI 會和你確認細節並產生圖片；之後直接說「標題改大一點」就能繼續修改。"
          />
        ) : (
          <>
            {hasOlderMessages && (
              <button
                type="button"
                onClick={onLoadOlder}
                className="mx-auto rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                載入較早訊息
              </button>
            )}
            {messages.map((message) =>
              message.role === "user" ? (
                <UserMessage key={`${message.turnId}-user`} message={message} />
              ) : (
                <AssistantMessage
                  key={`${message.turnId}-assistant`}
                  message={message}
                  selectedJobId={selectedJobId}
                  onSelectVersion={onSelectVersion}
                  getVersion={getVersion}
                  getVersionLabel={getVersionLabel}
                />
              )
            )}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
