import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, Sparkles, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { optimizePrompt } from "@/services/aiService";

const toTagsText = (tags) => (Array.isArray(tags) ? tags.join(", ") : "");

const isCoarsePointer = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

export default function AssetMetadataSheet({
  asset,
  type,
  error,
  isSaving,
  onClose,
  onSave,
}) {
  const [name, setName] = useState(() => asset?.name || "");
  const [description, setDescription] = useState(() => asset?.description || "");
  const [tags, setTags] = useState(() => toTagsText(asset?.tags));
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState("");
  const [optimizationNote, setOptimizationNote] = useState("");
  const formRef = useRef(null);
  const nameRef = useRef(null);

  const isDirty =
    asset != null &&
    (name.trim() !== (asset.name || "") ||
      description.trim() !== (asset.description || "") ||
      tags !== toTagsText(asset.tags));

  // 未儲存變更的關閉確認；backdrop、Esc、取消鈕共用此路徑
  const requestClose = useCallback(() => {
    if (isSaving || isOptimizing) return;
    if (isDirty && !window.confirm("有未儲存的變更，確定要關閉嗎？")) return;
    onClose();
  }, [isDirty, isOptimizing, isSaving, onClose]);
  const requestCloseRef = useRef(requestClose);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  // body scroll lock + Escape 關閉 + 桌機聚焦名稱欄位
  useEffect(() => {
    if (!asset) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    if (!isCoarsePointer()) {
      nameRef.current?.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [asset]);

  // Focus trap：Tab/Shift+Tab 在表單內循環
  const handleFormKeyDown = (event) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = formRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!asset) return null;

  const title = type === "style" ? "編輯風格" : "編輯範本";

  const handleOptimize = async () => {
    const sourceText = description.trim() || name.trim();
    if (!sourceText) {
      setOptimizationError("請先輸入風格名稱或描述，再使用 AI 優化。");
      return;
    }

    setIsOptimizing(true);
    setOptimizationError("");
    setOptimizationNote("");

    try {
      const result = await optimizePrompt({
        userScript: sourceText,
        styleContext: [
          name.trim() && `風格名稱：${name.trim()}`,
          tags.trim() && `現有標籤：${tags.trim()}`,
        ].filter(Boolean).join("；"),
      });
      const optimizedDescription = result?.optimizedPromptZh?.trim();
      if (!optimizedDescription) {
        throw new Error("AI 未回傳可用的優化描述");
      }

      setDescription(optimizedDescription);
      setOptimizationNote(result.explanation?.trim() || "已完成優化，請確認內容後儲存。");
    } catch (error) {
      setOptimizationError(error.message || "AI 優化失敗，請稍後再試。");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave({
      name: name.trim(),
      description: description.trim(),
      tags: tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/40 p-0 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-metadata-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
        aria-label="關閉編輯視窗"
      />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 motion-reduce:animate-none sm:max-h-[88dvh] sm:max-w-2xl sm:rounded-2xl lg:max-w-3xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8 sm:py-5">
          <div>
            <h2 id="asset-metadata-title" className="text-base font-semibold sm:text-lg">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              更新後會保留目前的篩選與素材中心位置。
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestClose}
            aria-label="關閉編輯視窗"
            className="sm:h-11 sm:w-11"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:space-y-5 sm:px-8 sm:py-7">
          <div className="space-y-1.5">
            <label htmlFor="asset-name" className="text-sm font-medium">
              名稱
            </label>
            <Input
              id="asset-name"
              ref={nameRef}
              name="name"
              autoComplete="off"
              spellCheck={false}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="sm:h-11 sm:text-base"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="asset-description" className="text-sm font-medium">
                描述
              </label>
              {type === "style" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOptimize}
                  disabled={isOptimizing || isSaving}
                  className="min-h-9 gap-1.5 border-primary/30 px-3 text-primary hover:bg-primary/10 sm:min-h-11 sm:px-5 sm:text-sm"
                  aria-label="使用 AI 優化風格描述"
                >
                  {isOptimizing ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isOptimizing ? "優化中…" : "AI 優化"}
                </Button>
              )}
            </div>
            <Textarea
              id="asset-description"
              name="description"
              autoComplete="off"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setOptimizationError("");
              }}
              rows={5}
              className="resize-y sm:min-h-40 sm:text-base"
            />
            {optimizationNote && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground" aria-live="polite">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p>{optimizationNote}</p>
              </div>
            )}
            {optimizationError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {optimizationError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="asset-tags" className="flex items-center gap-1.5 text-sm font-medium">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              標籤
            </label>
            <Input
              id="asset-tags"
              name="tags"
              autoComplete="off"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="以逗號分隔，例如：簡報, 插畫, 品牌"
              className="sm:h-11 sm:text-base"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
          <Button type="button" variant="outline" onClick={requestClose} disabled={isSaving || isOptimizing} className="sm:min-h-11 sm:min-w-24 sm:px-5">
            取消
          </Button>
          <Button
            type="submit"
            disabled={isSaving || isOptimizing || !name.trim()}
            className="gap-2 sm:min-h-11 sm:min-w-32 sm:px-5"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {isSaving ? "儲存中…" : "儲存變更"}
          </Button>
        </div>
      </form>
    </div>
  );
}
