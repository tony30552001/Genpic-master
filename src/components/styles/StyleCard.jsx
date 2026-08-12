import React, { useState } from "react";
import {
  Copy,
  Download,
  Eye,
  Image as ImageIcon,
  Lock,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
  Users,
  ZoomIn,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const formatTimestamp = (value) => {
  if (!value?.seconds) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
  }).format(new Date(value.seconds * 1000));
};

export default function StyleCard({
  style,
  onApply,
  onDelete,
  onPublish,
  onUnpublish,
  onCopy,
  onEdit,
  selectedTags,
  onToggleTag,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onPreview,
}) {
  const [imgError, setImgError] = useState(false);
  const hasPreview = style.previewUrl && !imgError;
  const isShared = style.visibility === "shared";
  // Prefer display name; fall back to email only if name looks like an email itself
  const isEmailLike = (s) => typeof s === "string" && s.includes("@");
  const authorText =
    (style.authorName && !isEmailLike(style.authorName))
      ? style.authorName
      : style.authorEmail || style.authorName || "未知共享人";
  const primaryTag = style.tags?.[0];
  const dateText = formatTimestamp(style.publishedAt || style.updatedAt || style.createdAt);
  const canCopy = Boolean(onCopy);
  const canPublish = Boolean(onPublish);
  const canUnpublish = Boolean(onUnpublish);
  const canEdit = Boolean(onEdit);
  const hasShareAction = canCopy || canPublish || canUnpublish;
  const secondaryActionCount = [canEdit, hasShareAction, Boolean(onDelete)].filter(Boolean).length;
  const secondaryActionColumns =
    secondaryActionCount === 1
      ? "grid-cols-1"
      : secondaryActionCount === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  const handleSelectionClick = () => {
    if (isSelectionMode) {
      onToggleSelect(style.id);
    }
  };

  const handleSelectionKeyDown = (e) => {
    if (!isSelectionMode) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleSelect(style.id);
    }
  };

  return (
    <Card
      tabIndex={isSelectionMode ? 0 : undefined}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      aria-label={isSelectionMode ? `選取風格 ${style.name}` : undefined}
      onClick={handleSelectionClick}
      onKeyDown={handleSelectionKeyDown}
      className={`group relative flex flex-col overflow-hidden transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected
        ? "border-primary ring-2 ring-primary/20 shadow-md"
        : "hover:border-primary/30 hover:shadow-lg"
        } ${isSelectionMode ? "cursor-pointer" : ""}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {hasPreview ? (
          onPreview && !isSelectionMode ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPreview(style);
              }}
              className="group/preview relative block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-label={`放大查看風格圖片 ${style.name}`}
            >
              <img
                src={style.previewUrl}
                alt={style.name}
                width={480}
                height={270}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover/preview:scale-[1.02] motion-reduce:transform-none"
                onError={() => setImgError(true)}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-200 group-hover/preview:bg-black/35 group-hover/preview:opacity-100 group-focus-visible/preview:bg-black/35 group-focus-visible/preview:opacity-100 motion-reduce:transition-none">
                <ZoomIn className="h-6 w-6 drop-shadow" aria-hidden="true" />
              </span>
            </button>
          ) : (
            <img
              src={style.previewUrl}
              alt={style.name}
              width={480}
              height={270}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none"
              onError={() => setImgError(true)}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2 h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
              <span className="text-xs text-muted-foreground/60">無預覽</span>
            </div>
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {primaryTag && (
            <Badge variant="secondary" className="bg-background/90 text-xs shadow-sm backdrop-blur">
              #{primaryTag}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`border-background/60 bg-background/90 text-xs shadow-sm backdrop-blur ${isShared ? "text-primary" : "text-muted-foreground"
              }`}
          >
            {isShared ? (
              <Users className="mr-1 h-3 w-3" aria-hidden="true" />
            ) : (
              <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
            )}
            {isShared ? "已共享" : "私人"}
          </Badge>
          {style.isCurated && (
            <Badge className="bg-primary text-xs text-primary-foreground shadow-sm">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              精選
            </Badge>
          )}
        </div>

        {isSelectionMode && (
          <div
            className={`absolute inset-0 flex items-start justify-end p-2 transition-colors ${isSelected ? "bg-primary/20" : "bg-black/0 hover:bg-black/5"
              }`}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${isSelected
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-card/90"
                }`}
            >
              {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary-foreground" />}
            </div>
          </div>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="space-y-1.5">
          <h4 className="line-clamp-1 text-sm font-semibold leading-snug text-foreground">
            {style.name}
          </h4>
          {style.description && (
            <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
              {style.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {isShared && (
            <span className="min-w-0 truncate">
              共享人：{authorText}
            </span>
          )}
          {dateText && <span>{dateText}</span>}
          {(style.usageCount > 0 || style.copyCount > 0) && (
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden="true" />
              {style.usageCount || 0}
              <Copy className="ml-1 h-3 w-3" aria-hidden="true" />
              {style.copyCount || 0}
            </span>
          )}
        </div>

        {style.tags && style.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1">
            {style.tags.slice(0, 4).map((tag, i) => {
              const isActive = selectedTags?.includes(tag);
              return (
                <Button
                  type="button"
                  key={`${tag}-${i}`}
                  variant={isActive ? "default" : "outline"}
                  size="xs"
                  disabled={isSelectionMode}
                  aria-pressed={isActive}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTag?.(tag);
                  }}
                  className="rounded-full"
                >
                  #{tag}
                </Button>
              );
            })}
            {style.tags.length > 4 && (
              <span className="px-1 py-0.5 text-xs text-muted-foreground/70">
                +{style.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </CardContent>

      {!isSelectionMode && (
        <CardFooter className="flex flex-col gap-2 px-3 pb-3 pt-0">
          <Separator className="mb-1" />
          <Button
            type="button"
            size="sm"
            onClick={() => onApply(style)}
            className="min-h-10 w-full gap-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            套用風格
          </Button>
          {(canCopy || canPublish || canUnpublish || canEdit || onDelete) && (
            <div className={`grid w-full ${secondaryActionColumns} gap-1.5`}>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(style)}
                  className="min-w-0 min-h-10 gap-1 px-1.5 text-[11px]"
                  title={`編輯風格 ${style.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="min-w-0 truncate">編輯</span>
                </Button>
              )}
              {canCopy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onCopy(style.id)}
                  className="min-w-0 min-h-10 gap-1 px-1.5 text-[11px]"
                  title={`複製風格 ${style.name}`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="min-w-0 truncate">複製</span>
                </Button>
              ) : canPublish ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPublish(style.id)}
                  className="min-w-0 min-h-10 gap-1 px-1.5 text-[11px]"
                  title={`共享風格 ${style.name}`}
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="min-w-0 truncate">共享</span>
                </Button>
              ) : canUnpublish ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onUnpublish(style.id)}
                  className="min-w-0 min-h-10 gap-1 px-1.5 text-[11px]"
                  title={`取消共享風格 ${style.name}`}
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="min-w-0 truncate">取消共享</span>
                </Button>
              ) : null}
              {onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={(e) => onDelete(style.id, e)}
                  className="min-w-0 min-h-10 gap-1 px-1.5 text-[11px]"
                  title={`刪除風格 ${style.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="min-w-0 truncate">刪除</span>
                </Button>
              )}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
