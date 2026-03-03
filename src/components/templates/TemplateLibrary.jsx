import React, { useMemo, useState } from "react";
import {
    CheckSquare,
    Copy,
    FileText,
    Filter,
    Image as ImageIcon,
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

    // 預覽摘要：截取 userScript 前 80 字
    const scriptPreview = template.userScript
        ? template.userScript.length > 80
            ? template.userScript.slice(0, 80) + "…"
            : template.userScript
        : null;

    return (
        <div
            className={`group relative bg-white border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col ${isSelected
                ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md transform scale-[0.98]"
                : "border-slate-200 hover:shadow-lg hover:border-blue-200"
                }`}
            onClick={handleClick}
        >
            {/* 頂部色帶 */}
            <div className="h-2 bg-primary" />

            {/* 選擇模式 Checkbox */}
            {isSelectionMode && (
                <div className="absolute top-4 right-2 z-10">
                    <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "bg-white/80 border-slate-300"
                            }`}
                    >
                        {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                </div>
            )}

            {/* 資訊區 */}
            <div className="flex-1 p-4 flex flex-col gap-2.5">
                {/* Icon + 標題 */}
                <div className="flex items-start gap-2.5">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-700 text-sm leading-snug line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {template.name}
                        </h4>
                        {template.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                                {template.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* 內容預覽 */}
                {scriptPreview && (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 whitespace-pre-wrap">
                            {scriptPreview}
                        </p>
                    </div>
                )}

                {/* 風格標示 */}
                {template.stylePrompt && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">
                            🎨 含風格設定
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
                                    key={i}
                                    disabled={isSelectionMode}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleTag?.(tag);
                                    }}
                                    className={`
                    text-[10px] px-1.5 py-0.5 rounded-full transition-all
                    ${isActive
                                            ? "bg-blue-100 text-blue-600 border border-blue-200"
                                            : "bg-slate-50 text-slate-500 border border-slate-100 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50"
                                        }
                  `}
                                >
                                    #{tag}
                                </button>
                            );
                        })}
                        {template.tags.length > 4 && (
                            <span className="text-[10px] text-slate-400 px-1 py-0.5">
                                +{template.tags.length - 4}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* hover 操作按鈕 (僅在非選擇模式下) */}
            {!isSelectionMode && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onApply(template);
                        }}
                        className="bg-white/95 backdrop-blur-sm text-slate-700 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-lg flex items-center gap-1"
                    >
                        <Copy className="w-3 h-3" /> 套用
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(template.id, e);
                        }}
                        className="bg-white/95 backdrop-blur-sm text-slate-700 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-all shadow-lg"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
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
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                        type="text"
                        placeholder="搜尋範本名稱、描述或內容..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {allTags.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                            <Filter className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-medium text-slate-500">
                                標籤篩選
                            </span>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="ml-auto text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
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
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`
                      inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all duration-200
                      ${isActive
                                                ? "bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/25"
                                                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                                            }
                    `}
                                    >
                                        <span>#{tag}</span>
                                        <span
                                            className={`text-[10px] ${isActive ? "text-blue-200" : "text-slate-400"
                                                }`}
                                        >
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                            {hasMoreTags && (
                                <button
                                    onClick={() => setShowAllTags(!showAllTags)}
                                    className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 transition-colors"
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
                <div className="flex items-center justify-between bg-blue-50/80 border border-blue-100 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={
                                    filtered.length > 0 && selectedIds.size === filtered.length
                                }
                                onChange={selectAll}
                                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-sm font-medium text-blue-900">
                                已選取 {selectedIds.size} 個範本
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsSelectionMode(false)}
                            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleBatchDelete}
                            disabled={selectedIds.size === 0}
                            className="px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            刪除選取項目
                        </button>
                    </div>
                </div>
            )}

            {/* 結果計數 */}
            <div className="flex items-center justify-between px-1">
                {hasActiveFilters ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>
                            找到{" "}
                            <strong className="text-slate-700">{filtered.length}</strong>{" "}
                            個範本
                        </span>
                        {selectedTags.length > 0 && (
                            <div className="flex items-center gap-1">
                                <span>·</span>
                                {selectedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-0.5 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md"
                                    >
                                        #{tag}
                                        <button
                                            onClick={() => toggleTag(tag)}
                                            className="hover:text-blue-800 ml-0.5"
                                        >
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500">
                        共 {templates.length} 個範本
                    </div>
                )}

                {!isSelectionMode && templates.length > 0 && (
                    <button
                        onClick={toggleSelectionMode}
                        className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                    >
                        <CheckSquare className="w-3.5 h-3.5" />
                        批次管理
                    </button>
                )}
            </div>

            {/* Grid 顯示 */}
            {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                        <FileText className="w-7 h-7 text-slate-300" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">
                            {hasActiveFilters ? "找不到符合的範本" : "尚未儲存任何範本"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {hasActiveFilters
                                ? "嘗試調整搜尋條件或清除篩選"
                                : "在「製作區」完成設定後，使用「存為範本」即可快速重複使用"}
                        </p>
                    </div>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-xs text-blue-500 hover:text-blue-700 mt-1 transition-colors"
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
