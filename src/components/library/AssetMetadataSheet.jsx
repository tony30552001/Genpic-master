import React, { useEffect, useRef, useState } from "react";
import { Loader2, Save, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const formRef = useRef(null);
  const nameRef = useRef(null);

  const isDirty =
    asset != null &&
    (name.trim() !== (asset.name || "") ||
      description.trim() !== (asset.description || "") ||
      tags !== toTagsText(asset.tags));

  // 未儲存變更的關閉確認；backdrop、Esc、取消鈕共用此路徑
  const requestClose = () => {
    if (isSaving) return;
    if (isDirty && !window.confirm("有未儲存的變更，確定要關閉嗎？")) return;
    onClose();
  };

  // body scroll lock + Escape 關閉 + 桌機聚焦名稱欄位
  useEffect(() => {
    if (!asset) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
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
  });

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
        className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 motion-reduce:animate-none sm:rounded-2xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="asset-metadata-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              更新後會保留目前的篩選與素材中心位置。
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestClose}
            aria-label="關閉編輯視窗"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5">
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
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="asset-description" className="text-sm font-medium">
              描述
            </label>
            <Textarea
              id="asset-description"
              name="description"
              autoComplete="off"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="resize-y"
            />
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
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={requestClose} disabled={isSaving}>
            取消
          </Button>
          <Button type="submit" disabled={isSaving || !name.trim()} className="gap-2">
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
