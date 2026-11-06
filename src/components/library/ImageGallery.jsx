import React, { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowRightLeft, Trash2, X } from "@/components/icons/lucideControls";
import { Check } from "@/components/icons/lucideStatus";
import { Image as ImageIcon } from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";
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
import ComparisonView from "@/components/history/ComparisonView";
import ImageDetailPanel from "./ImageDetailPanel";
import { filterHistoryItems, groupByDay } from "./galleryUtils";
import { cn } from "@/lib/utils";

const TILE_MIN = 110;
const TILE_MAX = 260;
const TILE_DEFAULT = 170;

function GalleryTile({ item, isSelected, isSelecting, onOpen, onToggle }) {
  const [imgError, setImgError] = useState(false);
  const caption = (item.userScript || "").trim() || "未命名作品";

  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={() => (isSelecting ? onToggle(item.id) : onOpen(item.id))}
        aria-label={isSelecting ? `選取：${caption}` : `查看：${caption}`}
        aria-pressed={isSelecting ? isSelected : undefined}
        className={cn(
          "group/tile relative block aspect-square w-full overflow-hidden rounded-[10px] bg-muted text-left press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isSelected && "ring-[3px] ring-primary ring-inset"
        )}
      >
        {item.imageUrl && !imgError ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="icon-lg" aria-hidden="true" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 to-transparent px-2.5 pb-2 pt-8 text-xs font-medium text-white opacity-0 transition-opacity duration-(--motion-hover) ease-emphasized group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100 motion-reduce:transition-none">
          <span className="line-clamp-1">{caption}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-label={isSelected ? `取消選取：${caption}` : `選取：${caption}`}
        aria-pressed={isSelected}
        className={cn(
          "absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black/30 text-white transition-opacity duration-(--motion-hover) focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-100",
          isSelected ? "border-primary bg-primary opacity-100" : isSelecting ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
        )}
      >
        {isSelected && <Check className="icon-xs" aria-hidden="true" />}
      </button>
    </li>
  );
}

export default function ImageGallery({
  historyItems,
  savedStyles,
  searchQuery,
  onEdit,
  onDelete,
  onDeleteItems,
  onCreateStyle,
  onCreateTemplate,
  onGoCreate,
}) {
  const [tileSize, setTileSize] = useState(TILE_DEFAULT);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [actionError, setActionError] = useState("");

  const styleMap = useMemo(
    () => Object.fromEntries((savedStyles || []).map((style) => [style.id, style])),
    [savedStyles]
  );
  const filtered = useMemo(
    () => filterHistoryItems(historyItems, searchQuery, styleMap),
    [historyItems, searchQuery, styleMap]
  );
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const activeItem = historyItems.find((item) => item.id === activeId) || null;
  const isSelecting = selectedIds.size > 0;
  const selectedItems = filtered.filter((item) => selectedIds.has(item.id));

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const confirmDelete = async () => {
    const ids = pendingDeleteIds;
    if (!ids?.length) return;
    setIsDeleting(true);
    setActionError("");
    try {
      if (ids.length === 1) await onDelete(ids[0]);
      else await onDeleteItems(ids);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      if (ids.includes(activeId)) setActiveId(null);
    } catch (error) {
      setActionError(error.message || "刪除失敗");
    } finally {
      setIsDeleting(false);
      setPendingDeleteIds(null);
    }
  };

  if (historyItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
        <ImageIcon className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">還沒有生成過的圖片</p>
          <p className="mt-1 text-xs text-muted-foreground/80">完成一次生成後，結果會自動保存在這裡。</p>
        </div>
        <Button type="button" size="sm" onClick={onGoCreate}>
          開始創作
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-24">
      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span>
          {searchQuery.trim() ? (
            <>找到 <strong className="text-foreground">{filtered.length}</strong> 張</>
          ) : (
            <>共 {historyItems.length} 張</>
          )}
        </span>
        <label className="hidden items-center gap-2 sm:flex">
          縮圖大小
          <input
            type="range"
            min={TILE_MIN}
            max={TILE_MAX}
            value={tileSize}
            onChange={(event) => setTileSize(Number(event.target.value))}
            className="w-28 accent-primary"
          />
        </label>
      </div>

      {actionError && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">找不到符合的圖片</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h2 className="flex items-baseline gap-2 pb-2 pt-4 text-sm font-semibold">
              {group.label}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{group.items.length} 張</span>
            </h2>
            <ul
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tileSize}px, 30%), 1fr))` }}
            >
              {group.items.map((item) => (
                <GalleryTile
                  key={item.id}
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  isSelecting={isSelecting}
                  onOpen={setActiveId}
                  onToggle={toggleSelect}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {isSelecting && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
            <div
              role="toolbar"
              aria-label="批次操作"
              className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-foreground py-2 pl-4 pr-2 text-background shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none"
            >
              <span className="mr-1 text-sm tabular-nums">已選 {selectedIds.size} 張</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={selectedIds.size !== 2}
                title="選擇 2 張圖片進行比對"
                onClick={() => setShowComparison(true)}
              >
                <ArrowRightLeft className="icon-sm" aria-hidden="true" />
                比對
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setPendingDeleteIds([...selectedIds])}
              >
                <Trash2 className="icon-sm" aria-hidden="true" />
                刪除
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-background hover:bg-background/15 hover:text-background"
                onClick={clearSelection}
                aria-label="取消選取"
              >
                <X className="icon-sm" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

      <AnimatePresence>
        {showComparison && selectedItems.length === 2 && (
          <ComparisonView
            item1={selectedItems[0]}
            item2={selectedItems[1]}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeItem && (
          <ImageDetailPanel
            key={activeItem.id}
            item={activeItem}
            style={activeItem.styleId ? styleMap[activeItem.styleId] : null}
            onClose={() => setActiveId(null)}
            onEdit={onEdit}
            onDelete={(item) => setPendingDeleteIds([item.id])}
            onCreateStyle={onCreateStyle}
            onCreateTemplate={onCreateTemplate}
          />
        )}
      </AnimatePresence>

      <AlertDialog
        open={Boolean(pendingDeleteIds)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDeleteIds(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除 <strong>{pendingDeleteIds?.length ?? 0}</strong> 張圖片，此操作無法復原。確定要繼續嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "刪除中…" : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
