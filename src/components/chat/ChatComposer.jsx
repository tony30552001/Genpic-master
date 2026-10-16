import { useRef, useState } from "react";
import { Plus, Upload, X } from "@/components/icons/lucideControls";
import { Image as ImageIcon, LayoutTemplate, Palette, Wand2 } from "@/components/icons/lucideContent";
import { AlertCircle } from "@/components/icons/lucideStatus";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { analyzeStyle } from "@/services/aiService";
import { uploadFile } from "@/services/storageService";
import { readFileAsDataUrl } from "@/lib/imageFile";
import { cn } from "@/lib/utils";
import ChatPickerDialog from "./ChatPickerDialog";
import ChatSettingsBar from "./ChatSettingsBar";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_STYLE_TAGS = 20;

const toChatStyle = ({ id, name, prompt, tags }) => ({
  ...(id ? { id } : {}),
  name: String(name || "未命名風格").slice(0, 100),
  prompt: String(prompt).slice(0, 4000),
  tags: (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag).trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_STYLE_TAGS),
});

function Chip({ icon, label, onRemove, removeLabel, busy }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pl-2 pr-1 text-xs">
      {busy ? <Spinner className="size-3" aria-hidden="true" /> : icon}
      <span className="min-w-0 truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** Message input with attachment, style and template pickers plus output settings. */
export default function ChatComposer({
  draft,
  onDraftChange,
  onSend,
  sending,
  onStop,
  attachment,
  onAttachmentChange,
  style,
  onStyleChange,
  selectedVersionLabel,
  onClearSelectedVersion,
  settings,
  onSettingsChange,
  quality,
  supportedQualities,
  savedStyles,
  templates,
  configurationError,
  disabled,
  className,
}) {
  const attachmentInputRef = useRef(null);
  const styleInputRef = useRef(null);
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(null);
  const [localError, setLocalError] = useState("");

  const isReplying = Boolean(sending);
  const canSend = Boolean(draft.trim()) && !configurationError && !busy && !disabled;

  const uploadImage = async (file) => {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("圖片過大，請上傳小於 10MB 的圖片。");
    const { uploadId } = await uploadFile(file, "image");
    if (!uploadId) throw new Error("無法完成圖片上傳，請確認已登入");
    return uploadId;
  };

  const runBusy = async (kind, task) => {
    setBusy(kind);
    setLocalError("");
    try {
      await task();
    } catch (err) {
      setLocalError(err.message || "處理圖片失敗，請稍後再試。");
    } finally {
      setBusy(null);
    }
  };

  const handleAttachmentFile = (file) =>
    runBusy("attachment", async () => {
      const uploadId = await uploadImage(file);
      onAttachmentChange({ uploadId, name: file.name, previewUrl: await readFileAsDataUrl(file) });
    });

  const handleStyleFile = (file) =>
    runBusy("style", async () => {
      const result = await analyzeStyle({ referenceUploadId: await uploadImage(file) });
      const tags = Array.isArray(result.suggested_tags) ? result.suggested_tags : [];
      onStyleChange(toChatStyle({ name: result.style_name || tags[0], prompt: result.style_prompt, tags }));
    });

  const handleFileInput = (handler) => (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handler(file);
  };

  const applyTemplate = (template) => {
    onDraftChange(template.userScript || "");
    if (template.stylePrompt) {
      onStyleChange(toChatStyle({ id: template.styleId, name: template.name, prompt: template.stylePrompt, tags: [] }));
    }
  };

  const shownError = configurationError || localError;
  const hasChips = attachment || style || selectedVersionLabel || busy;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <PromptInput onSubmit={({ text }) => { if (canSend) void onSend(text); }}>
        {hasChips && (
          <PromptInputHeader className="justify-start pt-2">
            {busy === "attachment" && <Chip busy label="上傳附圖中…" />}
            {attachment && (
              <Chip
                icon={
                  <img src={attachment.previewUrl} alt="" className="size-4 rounded-sm object-cover" />
                }
                label={attachment.name}
                onRemove={() => onAttachmentChange(null)}
                removeLabel="移除附圖"
              />
            )}
            {busy === "style" && <Chip busy label="分析圖片風格中…" />}
            {style && (
              <Chip
                icon={<Palette className="size-3.5 text-primary" aria-hidden="true" />}
                label={style.name}
                onRemove={() => onStyleChange(null)}
                removeLabel="移除風格"
              />
            )}
            {selectedVersionLabel && (
              <Chip
                icon={<ImageIcon className="size-3.5 text-primary" aria-hidden="true" />}
                label={`以 ${selectedVersionLabel} 為基礎`}
                onRemove={onClearSelectedVersion}
                removeLabel="不以目前版本為基礎"
              />
            )}
          </PromptInputHeader>
        )}
        <PromptInputTextarea
          aria-label="訊息"
          placeholder="描述想要的畫面，或告訴 AI 要怎麼修改…"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={4000}
          disabled={disabled}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PromptInputButton aria-label="加入附圖、風格或範本" disabled={disabled || Boolean(busy)}>
                  <Plus className="size-4" aria-hidden="true" />
                </PromptInputButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => attachmentInputRef.current?.click()}>
                  <Upload className="size-4" aria-hidden="true" />
                  上傳附圖
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPicker("style")}>
                  <Palette className="size-4" aria-hidden="true" />
                  套用已存風格
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => styleInputRef.current?.click()}>
                  <Wand2 className="size-4" aria-hidden="true" />
                  從圖片分析風格
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPicker("template")}>
                  <LayoutTemplate className="size-4" aria-hidden="true" />
                  套用範本
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PromptInputTools>
          <PromptInputSubmit
            status={sending?.phase}
            onStop={sending?.chatId ? onStop : undefined}
            disabled={isReplying ? !sending?.chatId : !canSend}
          />
        </PromptInputFooter>
      </PromptInput>

      <ChatSettingsBar
        settings={settings}
        quality={quality}
        supportedQualities={supportedQualities}
        onChange={onSettingsChange}
        disabled={disabled}
      />

      {shownError && (
        <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {shownError}
        </p>
      )}

      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="選擇附圖"
        onChange={handleFileInput(handleAttachmentFile)}
      />
      <input
        ref={styleInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="選擇風格參考圖"
        onChange={handleFileInput(handleStyleFile)}
      />

      <ChatPickerDialog
        open={picker === "style"}
        onOpenChange={(open) => setPicker(open ? "style" : null)}
        title="套用已存風格"
        description="選擇的風格會套用到接下來的圖片。"
        placeholder="搜尋風格…"
        emptyText="沒有符合的風格"
        items={savedStyles.filter((item) => item.prompt).map((item) => ({
          id: item.id,
          label: item.name,
          description: item.description || item.prompt,
          value: item,
        }))}
        onSelect={(item) => onStyleChange(toChatStyle(item))}
      />
      <ChatPickerDialog
        open={picker === "template"}
        onOpenChange={(open) => setPicker(open ? "template" : null)}
        title="套用範本"
        description="範本內容會填入訊息框，並套用範本的風格。"
        placeholder="搜尋範本…"
        emptyText="沒有符合的範本"
        items={templates.map((item) => ({
          id: item.id,
          label: item.name,
          description: item.userScript,
          value: item,
        }))}
        onSelect={applyTemplate}
      />
    </div>
  );
}
