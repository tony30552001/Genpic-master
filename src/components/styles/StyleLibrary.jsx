import React, { useMemo, useState } from "react";
import {
  Bookmark,
  CheckSquare,
  Copy,
  Download,
  Eye,
  Filter,
  Pencil,
  Search,
  Share2,
  Trash2,
  X,
  ZoomIn,
} from "@/components/icons/lucideControls";
import {
  AlertCircle,
  Loader2,
  Lock,
} from "@/components/icons/lucideStatus";
import {
  Clock3,
  Image as ImageIcon,
  Sparkles,
  Users,
} from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StyleCard from "./StyleCard";
import ImageLightbox from "../common/ImageLightbox";

const SCOPE_OPTIONS = [
  { value: "mine", label: "我的風格", description: "私人與已共享的個人風格" },
  { value: "shared", label: "共享風格", description: "公司內已共享的團隊風格" },
];

const SORT_OPTIONS = [
  { value: "updated", label: "最近更新" },
  { value: "newest", label: "最新共享" },
  { value: "popular", label: "熱門" },
  { value: "curated", label: "精選優先" },
];

const formatStyleDate = (style) => {
  const value = style.publishedAt || style.updatedAt || style.createdAt;
  if (!value) return "—";
  const seconds = typeof value === "object" && typeof value.seconds === "number"
    ? value.seconds
    : typeof value === "number"
      ? value > 1e12
        ? value / 1000
        : value
      : Date.parse(value) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(seconds * 1000));
};

function StylePreview({ style, className, onPreview }) {
  const [imgError, setImgError] = useState(false);

  if (style.previewUrl && !imgError) {
    const image = (
      <img
        src={style.previewUrl}
        alt={style.name}
        width={160}
        height={112}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        className="h-full w-full rounded-lg border border-border object-cover"
      />
    );

    if (onPreview) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview(style);
          }}
          className={`group/preview relative shrink-0 overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
          aria-label={`放大查看風格圖片 ${style.name}`}
        >
          {image}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity duration-200 group-hover/preview:bg-black/35 group-hover/preview:opacity-100 group-focus-visible/preview:bg-black/35 group-focus-visible/preview:opacity-100 motion-reduce:transition-none">
            <ZoomIn className="icon-md drop-shadow" aria-hidden="true" />
          </span>
        </button>
      );
    }

    return (
      <span className={`relative block shrink-0 overflow-hidden rounded-lg ${className}`}>
        {image}
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/50 ${className}`}>
      <ImageIcon className="icon-md" aria-hidden="true" />
    </span>
  );
}

function StyleStatusBadges({ style }) {
  const isShared = style.visibility === "shared";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={`gap-1 text-[10px] ${isShared ? "text-primary" : "text-muted-foreground"}`}>
        {isShared ? <Users className="icon-xs" aria-hidden="true" /> : <Lock className="icon-xs" aria-hidden="true" />}
        {isShared ? "已共享" : "私人"}
      </Badge>
      {style.isCurated && (
        <Badge className="gap-1 bg-primary text-[10px] text-primary-foreground">
          <Sparkles className="icon-xs" aria-hidden="true" />
          精選
        </Badge>
      )}
    </div>
  );
}

function StyleTags({ style, selectedTags, onToggleTag, isSelectionMode }) {
  if (!style.tags || style.tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {style.tags.slice(0, 4).map((tag, index) => {
        const isActive = selectedTags?.includes(tag);
        return (
          <Button
            type="button"
            key={`${tag}-${index}`}
            variant={isActive ? "default" : "outline"}
            size="xs"
            disabled={isSelectionMode}
            aria-pressed={isActive}
            onClick={(event) => {
              event.stopPropagation();
              onToggleTag?.(tag);
            }}
            className="rounded-full"
          >
            #{tag}
          </Button>
        );
      })}
      {style.tags.length > 4 && (
        <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
          +{style.tags.length - 4}
        </span>
      )}
    </div>
  );
}

function StyleActionButtons({
  style,
  canManage,
  onApply,
  onDelete,
  onPublish,
  onUnpublish,
  onCopy,
  onEdit,
  compact = false,
}) {
  const canCopy = Boolean(onCopy);
  const canPublish = Boolean(onPublish);
  const canUnpublish = Boolean(onUnpublish);
  const canEdit = Boolean(onEdit);

  return (
    <div className={`flex items-center gap-1.5 ${compact ? "justify-end" : "flex-wrap"}`}>
      <Button
        type="button"
        size="sm"
        onClick={() => onApply(style)}
        className="min-h-10 gap-1.5"
        aria-label={`套用風格 ${style.name}`}
      >
        <Download className="icon-sm" aria-hidden="true" />
        <span className={compact ? "hidden xl:inline" : ""}>套用</span>
      </Button>
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onEdit(style)}
          className="min-h-10 gap-1.5"
          aria-label={`編輯風格 ${style.name}`}
        >
          <Pencil className="icon-sm" aria-hidden="true" />
          <span className={compact ? "hidden xl:inline" : ""}>編輯</span>
        </Button>
      )}
      {canCopy ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy(style.id)}
          className="min-h-10 gap-1.5"
          aria-label={`複製風格 ${style.name}`}
        >
          <Copy className="icon-sm" aria-hidden="true" />
          <span className={compact ? "hidden xl:inline" : ""}>複製</span>
        </Button>
      ) : canPublish ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPublish(style.id)}
          className="min-h-10 gap-1.5"
          aria-label={`共享風格 ${style.name}`}
        >
          <Share2 className="icon-sm" aria-hidden="true" />
          <span className={compact ? "hidden xl:inline" : ""}>共享</span>
        </Button>
      ) : canUnpublish ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onUnpublish(style.id)}
          className="min-h-10 gap-1.5"
          aria-label={`取消共享風格 ${style.name}`}
        >
          <Lock className="icon-sm" aria-hidden="true" />
          <span className={compact ? "hidden xl:inline" : ""}>取消共享</span>
        </Button>
      ) : null}
      {canManage && onDelete && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onDelete(style.id)}
          className="min-h-10 gap-1.5"
          aria-label={`刪除風格 ${style.name}`}
        >
          <Trash2 className="icon-sm" aria-hidden="true" />
          <span className={compact ? "hidden xl:inline" : ""}>刪除</span>
        </Button>
      )}
    </div>
  );
}

function StyleListRow({
  style,
  canManage,
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
  const isShared = style.visibility === "shared";
  const authorText = style.authorName || style.authorEmail || "未知共享人";

  return (
    <article
      className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card p-3 transition-[border-color,box-shadow] duration-200 ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "border-border hover:border-primary/30 hover:shadow-sm"
      }`}
    >
      {isSelectionMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(style.id)}
          aria-label={`選取風格 ${style.name}`}
          className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-ring"
        />
      )}
      <StylePreview
        style={style}
        className="h-20 w-28"
        onPreview={isSelectionMode ? undefined : onPreview}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{style.name}</h3>
          <StyleStatusBadges style={style} />
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {style.description || "尚無描述"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StyleTags
            style={style}
            selectedTags={selectedTags}
            onToggleTag={onToggleTag}
            isSelectionMode={isSelectionMode}
          />
          {isShared && <span className="text-[11px] text-muted-foreground">共享人：{authorText}</span>}
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="icon-xs" aria-hidden="true" />
            {formatStyleDate(style)}
          </span>
          {(style.usageCount > 0 || style.copyCount > 0) && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="icon-xs" aria-hidden="true" />
              {style.usageCount || 0}
              <Copy className="ml-1 icon-xs" aria-hidden="true" />
              {style.copyCount || 0}
            </span>
          )}
        </div>
      </div>
      {!isSelectionMode && (
        <div className="flex w-full justify-end sm:w-auto">
          <StyleActionButtons
            style={style}
            canManage={canManage}
            onApply={onApply}
            onDelete={onDelete}
            onPublish={onPublish}
            onUnpublish={onUnpublish}
            onCopy={onCopy}
            onEdit={onEdit}
            compact
          />
        </div>
      )}
    </article>
  );
}

function StyleTable({
  styles,
  getActions,
  selectedTags,
  onToggleTag,
  isSelectionMode,
  selectedIds,
  onToggleSelect,
  onPreview,
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1020px] text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {isSelectionMode && <th scope="col" className="w-12 px-4 py-3 font-medium">選取</th>}
            <th scope="col" className="px-4 py-3 font-medium">風格</th>
            <th scope="col" className="px-4 py-3 font-medium">狀態</th>
            <th scope="col" className="px-4 py-3 font-medium">標籤</th>
            <th scope="col" className="px-4 py-3 font-medium">使用情況</th>
            <th scope="col" className="px-4 py-3 font-medium">更新時間</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {styles.map((style) => {
            const actions = getActions(style);
            return (
              <tr
                key={style.id}
                className={`align-middle transition-colors ${
                  selectedIds.has(style.id) ? "bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                {isSelectionMode && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(style.id)}
                      onChange={() => onToggleSelect(style.id)}
                      aria-label={`選取風格 ${style.name}`}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <StylePreview
                      style={style}
                      className="h-12 w-16"
                      onPreview={isSelectionMode ? undefined : onPreview}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{style.name}</p>
                      <p className="mt-1 line-clamp-2 max-w-[280px] text-xs text-muted-foreground">
                        {style.description || "尚無描述"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StyleStatusBadges style={style} />
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <StyleTags
                    style={style}
                    selectedTags={selectedTags}
                    onToggleTag={onToggleTag}
                    isSelectionMode={isSelectionMode}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="icon-xs" aria-hidden="true" />
                    {style.usageCount || 0}
                    <Copy className="ml-1 icon-xs" aria-hidden="true" />
                    {style.copyCount || 0}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatStyleDate(style)}
                </td>
                <td className="px-4 py-3">
                  {!isSelectionMode && (
                    <StyleActionButtons {...actions} compact />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StyleLibrary({
  savedStyles,
  viewMode = "grid",
  isLoading,
  isSearching,
  error,
  searchQuery,
  onSearchChange,
  scope,
  onScopeChange,
  sort,
  onSortChange,
  onApplyStyle,
  onDeleteStyle,
  onDeleteStyles,
  onPublishStyle,
  onUnpublishStyle,
  onCopyStyle,
  onGoCreate,
  onEditStyle,
  hideSearch = false,
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewStyle, setPreviewStyle] = useState(null);

  const allTags = useMemo(() => {
    const tagCount = {};
    savedStyles.forEach((style) => {
      (style.tags || []).forEach((tag) => {
        const t = tag.trim();
        if (t) tagCount[t] = (tagCount[t] || 0) + 1;
      });
    });
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [savedStyles]);

  const filtered = useMemo(() => {
    if (selectedTags.length === 0) return savedStyles;
    return savedStyles.filter((style) =>
      selectedTags.every((filterTag) =>
        style.tags?.some((tag) => tag.toLowerCase() === filterTag.toLowerCase())
      )
    );
  }, [savedStyles, selectedTags]);

  const visibleTags = showAllTags ? allTags : allTags.slice(0, 12);
  const hasMoreTags = allTags.length > 12;
  const hasActiveFilters = selectedTags.length > 0 || searchQuery;
  const isMineScope = scope === "mine";

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    onSearchChange("");
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((value) => !value);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((style) => style.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`確定要刪除選取的 ${selectedIds.size} 個風格嗎？`)) {
      await onDeleteStyles(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const emptyTitle = hasActiveFilters
    ? "找不到符合的風格"
    : isMineScope
      ? "尚未收藏任何風格"
      : "團隊尚未共享風格";
  const emptyDescription = hasActiveFilters
        ? "嘗試調整搜尋或標籤分類。"
    : isMineScope
      ? "分析圖片風格後即可儲存到此處。"
      : "共享你的第一個風格，讓團隊成員可以一起套用。";

  const getStyleActions = (style) => {
    const canManage = isMineScope;
    return {
      style,
      canManage,
      onApply: onApplyStyle,
      onDelete: canManage ? onDeleteStyle : undefined,
      onEdit: canManage ? onEditStyle : undefined,
      onPublish: canManage && style.visibility !== "shared" ? onPublishStyle : undefined,
      onUnpublish: canManage && style.visibility === "shared" ? onUnpublishStyle : undefined,
      onCopy: !canManage ? onCopyStyle : undefined,
    };
  };

  return (
    <div className="space-y-5">
      {/* ── Control Panel ── */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">風格庫</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                管理個人與共享風格，使用標籤快速篩選。
              </p>
            </div>

            {/* Scope segmented control — shadcn Tabs as segmented control */}
            <Tabs
              value={scope}
              onValueChange={(value) => {
                onScopeChange(value);
                setSelectedIds(new Set());
                setIsSelectionMode(false);
              }}
            >
              <TabsList aria-label="風格庫範圍">
                {SCOPE_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} title={option.description}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="space-y-4 px-4 py-4 sm:px-5">
          {/* Search + Sort row */}
          <div className={hideSearch ? "flex justify-end" : "grid gap-3 sm:grid-cols-[1fr_auto]"}>
            {!hideSearch && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 icon-sm text-muted-foreground" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="搜尋風格名稱、描述、作者或標籤…"
                  aria-label="搜尋風格"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-10 pr-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 icon-sm animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                )}
                {searchQuery && !isSearching && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onSearchChange("")}
                    aria-label="清除搜尋"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <X className="icon-sm" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Label htmlFor="style-sort" className="shrink-0 text-sm text-muted-foreground">
                排序
              </Label>
              <Select value={sort} onValueChange={onSortChange}>
                <SelectTrigger id="style-sort" className="w-[130px]" aria-label="風格排序">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tag filter */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Filter className="icon-sm text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium text-muted-foreground">標籤分類</span>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={clearFilters}
                  className="ml-auto text-primary hover:text-primary/80"
                >
                  清除篩選
                </Button>
              )}
            </div>
            {allTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant={selectedTags.length === 0 ? "default" : "outline"}
                  size="xs"
                  onClick={() => setSelectedTags([])}
                  aria-pressed={selectedTags.length === 0}
                  className="rounded-full"
                >
                  全部標籤
                </Button>
                {visibleTags.map(({ tag, count }) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Button
                      type="button"
                      key={tag}
                      variant={active ? "default" : "outline"}
                      size="xs"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={active}
                      className="rounded-full gap-1"
                    >
                      <span>#{tag}</span>
                      <span className={active ? "text-primary-foreground/70" : "text-muted-foreground"}>
                        {count}
                      </span>
                    </Button>
                  );
                })}
                {hasMoreTags && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowAllTags((v) => !v)}
                    className="rounded-full"
                  >
                    {showAllTags ? "收合" : `+${allTags.length - 12} 更多`}
                  </Button>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                尚無標籤；儲存風格時加入標籤後，這裡會自動形成分類。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Error Alert ── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="icon-sm" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Batch Selection Banner ── */}
      {isSelectionMode && (
        <Alert className="border-primary/20 bg-primary/5 text-foreground animate-in fade-in slide-in-from-top-2">
          <CheckSquare className="icon-sm text-primary" aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={selectAll}
                aria-label="選取全部風格"
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              已選取 {selectedIds.size} 個風格
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsSelectionMode(false)}>
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="gap-1.5"
              >
                <Trash2 className="icon-sm" aria-hidden="true" />
                刪除選取項目
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Result count + batch toggle ── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          {hasActiveFilters ? (
            <>找到 <strong className="text-foreground">{filtered.length}</strong> 個風格</>
          ) : (
            <>共 {savedStyles.length} 個風格</>
          )}
        </p>
        {isMineScope && !isSelectionMode && savedStyles.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSelectionMode}
            className="gap-1.5 text-muted-foreground hover:text-primary"
          >
            <CheckSquare className="icon-sm" aria-hidden="true" />
            批次管理
          </Button>
        )}
      </div>

      {/* ── Card Grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-20 text-muted-foreground">
          <Loader2 className="mr-2 icon-md animate-spin motion-reduce:animate-none" aria-hidden="true" />
          載入風格中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <ProductGlyph kind="settings" className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">{emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">{emptyDescription}</p>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              清除所有篩選
            </Button>
          ) : isMineScope && onGoCreate ? (
            <Button type="button" size="sm" onClick={onGoCreate}>
              前往建立風格
            </Button>
          ) : null}
        </div>
      ) : viewMode === "table" ? (
        <StyleTable
          styles={filtered}
          getActions={getStyleActions}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onPreview={(style) => setPreviewStyle(style)}
        />
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filtered.map((style) => {
            const actions = getStyleActions(style);
            return (
              <StyleListRow
                key={style.id}
                {...actions}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(style.id)}
                onToggleSelect={toggleSelect}
                onPreview={() => setPreviewStyle(style)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[1920px]:grid-cols-7">
          {filtered.map((style) => {
            const actions = getStyleActions(style);
            return (
              <StyleCard
                key={style.id}
                {...actions}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(style.id)}
                onToggleSelect={toggleSelect}
                onPreview={() => setPreviewStyle(style)}
              />
            );
          })}
        </div>
      )}

      {previewStyle?.previewUrl && (
        <ImageLightbox
          src={previewStyle.previewUrl}
          alt={previewStyle.name}
          onClose={() => setPreviewStyle(null)}
        />
      )}
    </div>
  );
}
