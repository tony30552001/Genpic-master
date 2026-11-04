import { useEffect, useState } from "react";
import { AlertCircle } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import * as chatApi from "@/services/imageChatService";

const MEMORY_MAX_CHARS = 4000;

const PLACEHOLDER = `- 圖中不要出現人臉
- 一律使用品牌色 #0F766E
- 標題用粗體無襯線字型`;

/**
 * The user's preference memory: a markdown list every chat follows. The
 * editor mounts each time the dialog opens, so lines the assistant added while
 * chatting ("記住以後…") are always current.
 */
export default function ChatMemoryDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>偏好記憶</DialogTitle>
          <DialogDescription>
            每一行是一項偏好或要遵守的規定，所有對話都會遵守。你也可以直接在對話中說「記住以後都…」，助理會自動加入。
          </DialogDescription>
        </DialogHeader>
        <MemoryEditor onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function MemoryEditor({ onClose }) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    chatApi
      .getMemory({ signal: controller.signal })
      .then((memory) => {
        if (controller.signal.aborted) return;
        setContent(memory.content);
        setIsLoaded(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message || "無法載入偏好記憶");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      await chatApi.saveMemory({ content });
      onClose();
    } catch (err) {
      setError(err.message || "偏好記憶儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <Spinner aria-hidden="true" />
          載入中…
        </div>
      ) : isLoaded ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={MEMORY_MAX_CHARS}
            rows={10}
            placeholder={PLACEHOLDER}
            aria-label="偏好記憶內容"
            className="font-mono"
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {content.length} / {MEMORY_MAX_CHARS}
          </p>
        </div>
      ) : null}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          取消
        </Button>
        <Button onClick={() => void save()} disabled={!isLoaded || isSaving}>
          {isSaving ? "儲存中…" : "儲存"}
        </Button>
      </DialogFooter>
    </>
  );
}