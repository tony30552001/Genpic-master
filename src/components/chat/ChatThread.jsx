import { AlertCircle } from "@/components/icons/lucideStatus";
import { Brain, Globe, Image as ImageIcon, MessageSquare, Palette } from "@/components/icons/lucideContent";
import { ChevronDown } from "@/components/icons/lucideControls";
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
    <div className="flex w-44 flex-col gap-1.5">
      {isPending && (
        <div
          className="flex aspect-video items-center justify-center gap-2 rounded-xl bg-muted text-xs text-muted-foreground"
          role="status"
        >
          <Spinner aria-hidden="true" />
          生成中…
        </div>
      )}
      {image.status === "failed" && (
        <p className="flex items-start gap-1.5 rounded-xl border border-destructive/40 p-2 text-xs text-destructive" role="alert">
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
            "group/thumb relative overflow-hidden rounded-xl bg-muted press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            selectedJobId === version.id && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
          )}
        >
          <img src={version.imageUrl} alt="" className="h-auto w-full object-contain" loading="lazy" />
          <span className="absolute left-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm">
            {getVersionLabel(version)}
          </span>
        </button>
      )}
      <span className="text-xs text-muted-foreground">
        {actionLabel(image, getVersion, getVersionLabel)}
      </span>
    </div>
  );
}

function sourceLabel(source) {
  if (source.title) return source.title;
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function searchLabel(search) {
  if (search.status === "searching") return search.query ? `正在搜尋網路：${search.query}` : "正在搜尋網路…";
  if (search.status === "failed") return search.query ? `搜尋網路失敗：${search.query}` : "搜尋網路失敗";
  return search.query ? `已搜尋網路：${search.query}` : "已搜尋網路";
}

function WebSearch({ search }) {
  const label = searchLabel(search);
  const icon =
    search.status === "searching" ? (
      <Spinner className="size-3.5 shrink-0" aria-hidden="true" />
    ) : search.status === "failed" ? (
      <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
    ) : (
      <Globe className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
    );

  if (search.status !== "completed" || search.sources.length === 0) {
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        role={search.status === "searching" ? "status" : undefined}
      >
        {icon}
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <details className="group/search text-xs text-muted-foreground">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="truncate">{label}</span>
        <span className="shrink-0">・{search.sources.length} 個來源</span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-150 group-open/search:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 border-l border-border pl-3">
        {search.sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sourceLabel(source)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AssistantMessage({ message, selectedJobId, onSelectVersion, getVersion, getVersionLabel }) {
  const isResponding = message.status === "responding";
  const searches = message.input?.searches ?? [];
  const memoryNotes = message.input?.memoryNotes ?? [];
  const hasPendingImage = message.images.some((image) => image.status === "queued" || image.status === "processing");
  const isSearching = searches.some((search) => search.status === "searching");

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        {searches.length > 0 && (
          <div className="flex flex-col gap-1">
            {searches.map((search) => (
              <WebSearch key={search.id} search={search} />
            ))}
          </div>
        )}

        {message.content ? (
          <MessageResponse isAnimating={isResponding}>{message.content}</MessageResponse>
        ) : isResponding && !isSearching ? (
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2.5">
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
          <ConversationEmptyState>
            <MessageSquare className="size-10 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-xl font-medium lg:text-sm">用對話開始創作</h3>
              <p className="hidden text-sm text-muted-foreground lg:block">
                描述想要的畫面，AI 會和你確認細節並產生圖片；之後直接說「標題改大一點」就能繼續修改。
              </p>
            </div>
          </ConversationEmptyState>
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
