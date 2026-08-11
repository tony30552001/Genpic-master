import React, { useState } from "react";
import {
  ArrowRightLeft,
  Bookmark,
  CheckSquare,
  Clock3,
  FileText,
  Image as ImageIcon,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import HistoryCard from "./HistoryCard";
import ComparisonView from "./ComparisonView";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatHistoryDate = (item) => {
  const value = item.createdAt;
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

function HistoryPreview({ item, className }) {
  const [imgError, setImgError] = useState(false);

  if (item.imageUrl && !imgError) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        width={160}
        height={96}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        className={`shrink-0 rounded-lg border border-border object-cover ${className}`}
      />
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/50 ${className}`}>
      <ImageIcon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function HistoryListRow({
  item,
  style,
  onLoad,
  onDelete,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}) {
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
          onChange={() => onToggleSelect(item.id)}
          aria-label="選取此生成紀錄"
          className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-ring"
        />
      )}
      <HistoryPreview item={item} className="h-20 w-28" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">
          {item.userScript || "無內容"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {formatHistoryDate(item)}
          </span>
          {style ? (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              {style.name}
            </span>
          ) : (
            <span>無特定風格</span>
          )}
        </div>
      </div>
      {!isSelectionMode && (
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
          <button
            type="button"
            onClick={() => onLoad(item)}
            className="flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="載入此生成紀錄設定"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">載入設定</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="刪除此生成紀錄"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}

function HistoryTable({
  items,
  styleMap,
  onLoad,
  onDelete,
  isSelectionMode,
  selectedIds,
  onToggleSelect,
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {isSelectionMode && <th scope="col" className="w-12 px-4 py-3 font-medium">選取</th>}
            <th scope="col" className="px-4 py-3 font-medium">預覽</th>
            <th scope="col" className="px-4 py-3 font-medium">生成內容</th>
            <th scope="col" className="px-4 py-3 font-medium">風格</th>
            <th scope="col" className="px-4 py-3 font-medium">建立時間</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const style = item.styleId ? styleMap[item.styleId] : null;
            return (
              <tr
                key={item.id}
                className={`align-middle transition-colors ${
                  selectedIds.has(item.id) ? "bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                {isSelectionMode && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label="選取此生成紀錄"
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <HistoryPreview item={item} className="h-14 w-20" />
                </td>
                <td className="max-w-[360px] px-4 py-3">
                  <p className="line-clamp-3 text-xs leading-relaxed text-foreground">
                    {item.userScript || "無內容"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {style ? (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {style.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">無特定風格</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatHistoryDate(item)}
                </td>
                <td className="px-4 py-3">
                  {!isSelectionMode && (
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onLoad(item)}
                        className="flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        aria-label="載入此生成紀錄設定"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        載入
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        aria-label="刪除此生成紀錄"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
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

export default function HistoryPanel({
  historyItems,
  viewMode = "grid",
  savedStyles,
  searchQuery,
  onSearchChange,
  onLoad,
  onDelete,
  onGoCreate,
  onDeleteItems, // 新增：批次刪除 callback
  hideSearch = false,
}) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const styleMap = (savedStyles || []).reduce((acc, style) => {
    acc[style.id] = style;
    return acc;
  }, {});

  const filtered = historyItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    const dateStr = item.createdAt?.seconds
      ? new Intl.DateTimeFormat("zh-TW").format(new Date(item.createdAt.seconds * 1000))
      : "";
    const scriptText = (item.userScript || "").toLowerCase();
    const style = item.styleId ? styleMap[item.styleId] : null;
    const styleName = style?.name?.toLowerCase() || "";
    const styleTags = style?.tags || [];
    const tagMatch = styleTags.some((tag) => tag.toLowerCase().includes(q));
    return (
      !q ||
      scriptText.includes(q) ||
      dateStr.includes(q) ||
      styleName.includes(q) ||
      tagMatch
    );
  });

  // --- 批次操作邏輯 ---
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
    setShowComparison(false);
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
      setSelectedIds(new Set(filtered.map((item) => item.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setShowBatchConfirm(true);
  };

  const handleConfirmSingleDelete = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await onDelete(pendingDeleteId);
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const handleConfirmBatchDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteItems(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setShowBatchConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCompare = () => {
    if (selectedIds.size !== 2) {
      alert("請選擇 2 筆紀錄進行比對");
      return;
    }
    setShowComparison(true);
  };

  // 取得選取的 items 供比對使用
  const selectedItems = filtered.filter(item => selectedIds.has(item.id));

  return (
    <div className="space-y-5">
      {!hideSearch && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-2.5 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              placeholder="搜尋文字、日期或風格…"
              aria-label="搜尋生成紀錄"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-input bg-background py-2 pl-10 pr-10 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="清除搜尋"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 批次操作列 */}
      {isSelectionMode && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={selectAll}
                aria-label="選取全部生成紀錄"
                className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
              />
              <span className="text-sm font-medium text-foreground">
                已選取 {selectedIds.size} 筆紀錄
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
            <button
              type="button"
              onClick={handleCompare}
              disabled={selectedIds.size !== 2}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              title="請選擇 2 筆紀錄進行比對"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              比對 (2)
            </button>
          </div>
        </div>
      )}

      {/* 比對與結果顯示區塊 */}
      {showComparison && selectedItems.length === 2 && (
        <ComparisonView
          item1={selectedItems[0]}
          item2={selectedItems[1]}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* 結果計數與操作按鈕 */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground">
          {searchQuery ? (
            <span>找到 <strong className="text-foreground">{filtered.length}</strong> 筆紀錄</span>
          ) : (
            <span>共 {historyItems.length} 筆紀錄</span>
          )}
        </div>

        {!isSelectionMode && historyItems.length > 0 && (
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
            <Bookmark className="w-7 h-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery ? "找不到符合的紀錄" : "尚無生成紀錄"}
            </p>
          </div>
          {!searchQuery && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={onGoCreate}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Wand2 className="w-3 h-3" aria-hidden="true" /> 前往製作區
              </button>
            </div>
          )}
        </div>
      ) : viewMode === "table" ? (
        <HistoryTable
          items={filtered}
          styleMap={styleMap}
          onLoad={onLoad}
          onDelete={(id) => setPendingDeleteId(id)}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filtered.map((item) => (
            <HistoryListRow
              key={item.id}
              item={item}
              style={item.styleId ? styleMap[item.styleId] : null}
              onLoad={onLoad}
              onDelete={(id) => setPendingDeleteId(id)}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[1920px]:grid-cols-7 pb-10">
          {filtered.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              style={item.styleId ? styleMap[item.styleId] : null}
              onLoad={onLoad}
              onDelete={(id) => setPendingDeleteId(id)}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* 單筆刪除確認 */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除紀錄</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原，刪除後將無法找回此生成紀錄。確定要刪除嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSingleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "刪除中…" : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批次刪除確認 */}
      <AlertDialog open={showBatchConfirm} onOpenChange={(open) => { if (!open && !isDeleting) setShowBatchConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認批次刪除</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除選取的 <strong>{selectedIds.size}</strong> 筆紀錄，此操作無法復原。確定要繼續嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBatchDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "刪除中…" : `刪除 ${selectedIds.size} 筆`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
