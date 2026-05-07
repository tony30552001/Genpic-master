import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  CheckSquare,
  Filter,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StyleCard from "./StyleCard";

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

export default function StyleLibrary({
  savedStyles,
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
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

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

  return (
    <div className="space-y-7">
      {/* ── Control Panel ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">風格庫</h2>
              <p className="text-sm text-muted-foreground">
                以標籤快速分類與篩選風格，管理個人收藏或套用公司內共享資產。
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

        <CardContent className="pt-5 space-y-5">
          {/* Search + Sort row */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="text"
                placeholder="搜尋風格名稱、描述、作者或標籤…"
                aria-label="搜尋風格"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 pr-10"
              />
              {isSearching && (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
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
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>

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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
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
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Batch Selection Banner ── */}
      {isSelectionMode && (
        <Alert className="border-primary/20 bg-primary/5 text-foreground animate-in fade-in slide-in-from-top-2">
          <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
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
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            批次管理
          </Button>
        )}
      </div>

      {/* ── Card Grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          載入風格中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
            <Bookmark className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
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
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6">
          {filtered.map((style) => {
            const canManage = isMineScope;
            return (
              <StyleCard
                key={style.id}
                style={style}
                onApply={onApplyStyle}
                onDelete={canManage ? onDeleteStyle : undefined}
                onPublish={canManage && style.visibility !== "shared" ? onPublishStyle : undefined}
                onUnpublish={canManage && style.visibility === "shared" ? onUnpublishStyle : undefined}
                onCopy={!canManage ? onCopyStyle : undefined}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(style.id)}
                onToggleSelect={toggleSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
