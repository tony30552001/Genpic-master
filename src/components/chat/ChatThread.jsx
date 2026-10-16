import { AlertCircle } from "@/components/icons/lucideStatus";
import { Image as ImageIcon, Palette } from "@/components/icons/lucideContent";
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

function ActionLabel({ message, getVersion, getVersionLabel }) {
  if (message.action === "generate") return <span>產生新圖</span>;
  const source = getVersion(message.sourceJobId);
  return <span>{source ? `修改 ${getVersionLabel(source)}` : "修改圖片"}</span>;
}

function AssistantMessage({ message, selectedJobId, onSelectVersion, getVersion, getVersionLabel }) {
  const isResponding = message.status === "responding";
  const version = message.imageJobId ? getVersion(message.imageJobId) : null;

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        {message.content ? (
          <MessageResponse isAnimating={isResponding}>{message.content}</MessageResponse>
        ) : isResponding ? (
          <Shimmer>思考中…</Shimmer>
        ) : null}

        {message.action !== "none" && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ProductGlyph kind="create" className="size-4 text-primary" aria-hidden="true" />
              <ActionLabel message={message} getVersion={getVersion} getVersionLabel={getVersionLabel} />
            </div>
            {message.status === "image_pending" && (
              <div className="flex flex-col gap-1" role="status">
                <span className="flex items-center gap-2 text-sm">
                  <Spinner aria-hidden="true" />
                  圖片生成中…
                </span>
                <span className="text-xs text-muted-foreground">停止回覆不會取消已開始生成的圖片。</span>
              </div>
            )}
            {version && (
              <button
                type="button"
                onClick={() => onSelectVersion(version.id)}
                aria-label={`檢視 ${getVersionLabel(version)}`}
                aria-pressed={selectedJobId === version.id}
                className={cn(
                  "group/thumb relative w-40 overflow-hidden rounded-md border border-border bg-background press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
