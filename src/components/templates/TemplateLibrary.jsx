import React, { useMemo, useState } from "react";
import {
    CheckSquare,
    Copy,
    FileText,
    Filter,
    Image as ImageIcon,
    Palette,
    Search,
    Trash2,
    X,
} from "lucide-react";

function TemplateCard({
    template,
    onApply,
    onDelete,
    selectedTags,
    onToggleTag,
    isSelectionMode,
    isSelected,
    onToggleSelect,
}) {
    const handleClick = (e) => {
        if (isSelectionMode) {
            e.preventDefault();
            onToggleSelect(template.id);
        } else {
            onApply(template);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e);
        }
    };

    // 預覽摘要：截取 userScript 前 80 字
    const scriptPreview = template.userScript
        ? template.userScript.length > 80
            ? template.userScript.slice(0, 80) + "…"
            : template.userScript
        : null;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={isSelectionMode ? isSelected : undefined}
            aria-label={isSelectionMode ? "選取此範本" : `套用範本 ${template.name}`}
            onKeyDown={handleKeyDown}
            className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected
                ? "border-primary ring-2 ring-primary/20 shadow-md"
                : "border-border hover:border-primary/30 hover:shadow-md"
                }`}
            onClick={handleClick}
        >
            {/* 頂部色帶 */}
            <div className="h-2 bg-primary" />

            {/* 選擇模式 Checkbox */}
            {isSelectionMode && (
                <div className="absolute top-4 right-2 z-10">
                        <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected
                                ? "bg-primary border-primary"
                                : "bg-card/80 border-muted-foreground/40"
                                }`}
                        >
                            {isSelected && <div className="w-2 h-2 bg-primary-foreground rounded-full" />}
                        </div>
                </div>
            )}

            {/* 資訊區 */}
            <div className="flex-1 p-4 flex flex-col gap-2.5">
                {/* Icon + 標題 */}
                <div className="flex items-start gap-2.5">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground text-sm leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                            {template.name}
                        </h4>
                        {template.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                {template.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* 內容預覽 */}
                {scriptPreview && (
                    <div className="bg-muted/50 border border-border/60 rounded-lg px-3 py-2">
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-wrap">
                            {scriptPreview}
                        </p>
                    </div>
                )}

                {/* 風格標示 */}
                {template.stylePrompt && (
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Palette className="h-3 w-3" aria-hidden="true" />
                            含風格設定
                        </span>
                    </div>
                )}

                {/* 標籤 */}
                {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-auto pt-1">
                        {template.tags.slice(0, 4).map((tag, i) => {
                            const isActive = selectedTags?.includes(tag);
                            return (
                                <button
                                    type="button"
                                    key={i}
                                    disabled={isSelectionMode}
                                    aria-pressed={isActive}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleTag?.(tag);
                                    }}
                                    className={`
                    rounded-full px-1.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                    ${isActive
                                            ? "bg-primary/10 text-primary border border-primary/20"
                                            : "bg-muted/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary hover:bg-primary/5"
                                        }
                  `}
                                >
                                    #{tag}
                                </button>
                            );
                        })}
                        {template.tags.length > 4 && (
                            <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                                +{template.tags.length - 4}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* hover 操作按鈕 (僅在非選擇模式下) */}
            {!isSelectionMode && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-[background-color,opacity] duration-200 group-hover:bg-black/5 group-hover:opacity-100 group-focus-visible:bg-black/5 group-focus-visible:opacity-100">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onApply(template);
                        }}
                        className="flex h-10 items-center gap-1 rounded-lg bg-background/95 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <Copy className="w-3 h-3" aria-hidden="true" /> 套用
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(template.id, e);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/95 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`刪除範本 ${template.name}`}
                    >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}

export default function TemplateLibrary({
    templates,
    onApplyTemplate,
    onDeleteTemplate,
    onDeleteTemplates,
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTags, setSelectedTags] = useState([]);
    const [showAllTags, setShowAllTags] = useState(false);

    // 批次操作
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    // 收集所有標籤
    const allTags = useMemo(() => {
        const tagCount = {};
        templates.forEach((tpl) => {
            (tpl.tags || []).forEach((tag) => {
                const t = tag.trim();
                if (t) tagCount[t] = (tagCount[t] || 0) + 1;
            });
        });
        return Object.entries(tagCount)
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) => ({ tag, count }));
    }, [templates]);

    const visibleTags = showAllTags ? allTags : allTags.slice(0, 12);
    const hasMoreTags = allTags.length > 12;

    // 篩選
    const filtered = useMemo(() => {
        return templates.filter((tpl) => {
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                !q ||
                tpl.name.toLowerCase().includes(q) ||
                tpl.description?.toLowerCase().includes(q) ||
                tpl.userScript?.toLowerCase().includes(q) ||
                tpl.tags?.some((tag) => tag.toLowerCase().includes(q));

            const matchesTags =
                selectedTags.length === 0 ||
                selectedTags.every((filterTag) =>
                    tpl.tags?.some((t) => t.toLowerCase() === filterTag.toLowerCase())
                );

            return matchesSearch && matchesTags;
        });
    }, [templates, searchQuery, selectedTags]);

    const toggleTag = (tag) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    const clearFilters = () => {
        setSelectedTags([]);
        setSearchQuery("");
    };

    const hasActiveFilters = selectedTags.length > 0 || searchQuery;

    // --- 批次操作 ---
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const toggleSelect = (id) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const selectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map((t) => t.id)));
        }
    };

    const handleBatchDelete = () => {
        if (selectedIds.size === 0) return;
        if (confirm(`確定要刪除選取的 ${selectedIds.size} 個範本嗎？`)) {
            onDeleteTemplates(Array.from(selectedIds));
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        }
    };

    return (
        <div className="space-y-5">
            {/* 搜尋與篩選 */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
                    <input
                        type="text"
                        placeholder="搜尋範本名稱、描述或內容…"
                        aria-label="搜尋範本"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-10 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label="清除搜尋"
                        >
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    )}
                </div>

                {allTags.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                            <Filter className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                            <span className="text-xs font-medium text-muted-foreground">
                                標籤篩選
                            </span>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="ml-auto rounded-md px-1 text-[11px] text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    清除篩選
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {visibleTags.map(({ tag, count }) => {
                                const isActive = selectedTags.includes(tag);
                                return (
                                    <button
                                        type="button"
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        aria-pressed={isActive}
                                        className={`
                      inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                      ${isActive
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                                                : "bg-background text-foreground border-border hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                                            }
                    `}
                                    >
                                        <span>#{tag}</span>
                                        <span
                                            className={`text-[10px] ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                                                }`}
                                        >
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                            {hasMoreTags && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllTags(!showAllTags)}
                                    className="rounded-md px-2 py-1 text-xs text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {showAllTags ? "收合" : `+${allTags.length - 12} 更多`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 批次操作列 */}
            {isSelectionMode && (
                <div className="flex items-center justify-between bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={
                                    filtered.length > 0 && selectedIds.size === filtered.length
                                }
                                onChange={selectAll}
                                aria-label="選取全部範本"
                                className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                            />
                            <span className="text-sm font-medium text-foreground">
                                已選取 {selectedIds.size} 個範本
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsSelectionMode(false)}
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleBatchDelete}
                            disabled={selectedIds.size === 0}
                            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            刪除選取項目
                        </button>
                    </div>
                </div>
            )}

            {/* 結果計數 */}
            <div className="flex items-center justify-between px-1">
                {hasActiveFilters ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                            找到{" "}
                            <strong className="text-foreground">{filtered.length}</strong>{" "}
                            個範本
                        </span>
                        {selectedTags.length > 0 && (
                            <div className="flex items-center gap-1">
                                <span>·</span>
                                {selectedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-0.5 text-primary bg-primary/10 px-1.5 py-0.5 rounded-md"
                                    >
                                        #{tag}
                                        <button
                                            onClick={() => toggleTag(tag)}
                                            className="ml-0.5 rounded-sm transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            aria-label={`移除標籤 ${tag}`}
                                        >
                                            <X className="w-2.5 h-2.5" aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-xs text-muted-foreground">
                        共 {templates.length} 個範本
                    </div>
                )}

                {!isSelectionMode && templates.length > 0 && (
                    <button
                        type="button"
                        onClick={toggleSelectionMode}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        批次管理
                    </button>
                )}
            </div>

            {/* Grid 顯示 */}
            {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
                        <FileText className="w-7 h-7 text-muted-foreground/40" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {hasActiveFilters ? "找不到符合的範本" : "尚未儲存任何範本"}
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                            {hasActiveFilters
                                ? "嘗試調整搜尋條件或清除篩選"
                                : "在「製作區」完成設定後，使用「存為範本」即可快速重複使用"}
                        </p>
                    </div>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-1 rounded-md px-2 py-1 text-xs text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            清除所有篩選
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((tpl) => (
                        <TemplateCard
                            key={tpl.id}
                            template={tpl}
                            onApply={onApplyTemplate}
                            onDelete={onDeleteTemplate}
                            selectedTags={selectedTags}
                            onToggleTag={toggleTag}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(tpl.id)}
                            onToggleSelect={toggleSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
