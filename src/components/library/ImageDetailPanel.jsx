import React, { useEffect, useRef, useState } from "react";
import * as M from "motion/react-m";
import { ArrowRight, Save, Trash2, X } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { FileText, Image as ImageIcon, Palette } from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";

const FORM_COPY = {
  style: { title: "存成風格", nameLabel: "風格名稱", submit: "儲存風格", done: "已存成風格，可在「風格」分頁找到。" },
  template: { title: "存成範本", nameLabel: "範本名稱", submit: "儲存範本", done: "已存成範本，可在「範本」分頁找到。" },
};

const defaultName = (item) => (item.userScript || "").trim().slice(0, 20);

const parseTags = (value) =>
  value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatDateTime = (item) => {
  const seconds = item.createdAt?.seconds;
  if (!seconds) return "剛剛";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(seconds * 1000)
  );
};

function SaveAsForm({ kind, item, onSubmit, onCancel }) {
  const copy = FORM_COPY[kind];
  const [name, setName] = useState(() => defaultName(item));
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(`請輸入${copy.nameLabel}`);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onSubmit({ name: name.trim(), tags: parseTags(tags) });
    } catch (err) {
      setError(err.message || "儲存失敗");
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none"
    >
      <p className="text-sm font-medium">{copy.title}</p>
      <div className="space-y-1">
        <label htmlFor={`save-as-${kind}-name`} className="text-xs text-muted-foreground">
          {copy.nameLabel}
        </label>
        <Input
          id={`save-as-${kind}-name`}
          name="name"
          autoComplete="off"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`save-as-${kind}-tags`} className="text-xs text-muted-foreground">
          標籤（選填，以逗號分隔）
        </label>
        <Input
          id={`save-as-${kind}-tags`}
          name="tags"
          autoComplete="off"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      {error && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving} className="flex-1 gap-1.5">
          {isSaving ? (
            <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Save className="icon-sm" aria-hidden="true" />
          )}
          {isSaving ? "儲存中…" : copy.submit}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
          取消
        </Button>
      </div>
    </form>
  );
}

export default function ImageDetailPanel({
  item,
  style,
  onClose,
  onEdit,
  onDelete,
  onCreateStyle,
  onCreateTemplate,
}) {
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState("");
  const [imgError, setImgError] = useState(false);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const canSaveStyle = Boolean(item.stylePrompt?.trim());
  const slideFrom = isMobile ? { y: "100%" } : { x: "100%" };

  const submitStyle = async ({ name, tags }) => {
    await onCreateStyle({
      name,
      tags,
      prompt: item.stylePrompt,
      description: "",
      previewUrl: item.imageUrl,
    });
    setForm(null);
    setNotice(FORM_COPY.style.done);
  };

  const submitTemplate = async ({ name, tags }) => {
    await onCreateTemplate({
      name,
      description: null,
      userScript: item.userScript || null,
      stylePrompt: item.stylePrompt || null,
      styleId: item.styleId || null,
      tags,
      previewUrl: item.imageUrl,
    });
    setForm(null);
    setNotice(FORM_COPY.template.done);
  };

  return (
    <M.div
      className="fixed inset-0 z-50 overscroll-contain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-label="圖片詳情"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40 lg:bg-black/20"
        onClick={onClose}
        aria-label="關閉圖片詳情"
        tabIndex={-1}
      />
      <M.aside
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-y-0 lg:border-r-0"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        initial={slideFrom}
        animate={{ x: 0, y: 0 }}
        exit={{ ...slideFrom, transition: OVERLAY_EXIT }}
        transition={OVERLAY_ENTER}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">圖片詳情</h2>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="關閉圖片詳情"
          >
            <X className="icon-sm" aria-hidden="true" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar">
          <div className="overflow-hidden rounded-xl bg-muted">
            {item.imageUrl && !imgError ? (
              <img
                src={item.imageUrl}
                alt={item.userScript || "生成圖片"}
                onError={() => setImgError(true)}
                className="mx-auto block max-h-[46dvh] w-full object-contain lg:max-h-[50dvh]"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-muted-foreground/40">
                <ImageIcon className="icon-display" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.userScript || "無內容"}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatDateTime(item)}</span>
              {item.model && <span>{item.model}</span>}
              {style && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                  {style.name}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Button type="button" className="w-full gap-1.5" onClick={() => onEdit(item)}>
              以此為基礎繼續編輯
              <ArrowRight className="icon-sm" aria-hidden="true" />
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={!canSaveStyle}
                onClick={() => { setNotice(""); setForm("style"); }}
              >
                <Palette className="icon-sm" aria-hidden="true" />
                存成風格
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => { setNotice(""); setForm("template"); }}
              >
                <FileText className="icon-sm" aria-hidden="true" />
                存成範本
              </Button>
            </div>
            {!canSaveStyle && (
              <p className="text-xs text-muted-foreground">這張圖片沒有風格設定，無法存成風格。</p>
            )}
          </div>

          {form === "style" && (
            <SaveAsForm key="style" kind="style" item={item} onSubmit={submitStyle} onCancel={() => setForm(null)} />
          )}
          {form === "template" && (
            <SaveAsForm key="template" kind="template" item={item} onSubmit={submitTemplate} onCancel={() => setForm(null)} />
          )}
          <p aria-live="polite" className={notice ? "rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground" : "sr-only"}>
            {notice}
          </p>
        </div>

        <div className="border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="icon-sm" aria-hidden="true" />
            刪除這張圖片
          </Button>
        </div>
      </M.aside>
    </M.div>
  );
}
