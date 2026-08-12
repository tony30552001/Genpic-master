import { useState, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import {
  Image as ImageIcon,
  Edit2,
  Trash2,
  Users,
  FileText,
  Clock,
  Layers,
  Loader2,
  Download,
  Wand2,
  Check,
  X,
  Palette,
  ChevronDown,
  Sparkles,
  FileDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  SlidersHorizontal,
  BookOpen,
  Presentation,
  List,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { optimizeScene } from "@/services/aiService";
import {
  extractPptxBullets,
  getPptxCharts,
  getPptxScenes,
  getPptxTables,
  sanitizePptxFilename,
} from "@/utils/pptxExport";
import ImageGeneratingState from "./ImageGeneratingState";

const PPTX_CHART_TYPES = {
  bar: "bar",
  line: "line",
  pie: "pie",
  doughnut: "doughnut",
};

const addPptxTable = (slide, table, bounds, colors) => {
  const titleHeight = table.title ? 0.28 : 0;
  const columnWidth = bounds.w / table.headers.length;
  const cellBorder = { color: "CBD5E1", pt: 0.5 };
  const tableRows = [
    table.headers.map((text) => ({
      text,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: colors.accent },
        align: "center",
        valign: "mid",
        border: cellBorder,
      },
    })),
    ...table.rows.map((row) =>
      row.map((text) => ({
        text,
        options: {
          color: colors.body,
          valign: "mid",
          border: cellBorder,
        },
      }))
    ),
  ];

  if (table.title) {
    slide.addText(table.title, {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: titleHeight,
      fontSize: 12,
      bold: true,
      color: colors.title,
      margin: 0,
    });
  }

  slide.addTable(tableRows, {
    x: bounds.x,
    y: bounds.y + titleHeight,
    w: bounds.w,
    h: Math.max(0.6, bounds.h - titleHeight),
    colW: Array.from({ length: table.headers.length }, () => columnWidth),
    rowH: 0.31,
    fontSize: 8,
    margin: 0.05,
    autoPage: false,
    valign: "mid",
  });
};

const addPptxChart = (slide, chart, bounds, colors) => {
  const chartType = PPTX_CHART_TYPES[chart.type] || PPTX_CHART_TYPES.bar;
  const isCircular = chartType === "pie" || chartType === "doughnut";

  slide.addChart(
    chartType,
    chart.series.map((series) => ({
      name: series.name,
      labels: chart.labels,
      values: series.values,
    })),
    {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      showTitle: Boolean(chart.title),
      title: chart.title,
      titleColor: colors.title,
      titleFontSize: 12,
      showLegend: chart.series.length > 1,
      legendPos: "b",
      legendFontSize: 8,
      chartColors: [colors.accent, "0EA5E9", "F59E0B", "10B981"],
      showValue: isCircular,
      showPercent: isCircular,
      catAxisLabelColor: colors.body,
      catAxisLabelFontSize: 8,
      valAxisLabelColor: colors.body,
      valAxisLabelFontSize: 8,
    }
  );
};


/* ────────────────────────────────────────────
 *  圖片放大 Lightbox
 * ──────────────────────────────────────────── */
function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const overlayRef = useRef(null);

  // ESC / 滾輪縮放
  useEffect(() => {
    const keyHandler = (e) => {
      if (e.key === "Escape") onClose();
    };
    const wheelHandler = (e) => {
      e.preventDefault();
      setScale((s) => Math.max(0.5, Math.min(5, s + (e.deltaY > 0 ? -0.15 : 0.15))));
    };
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("wheel", wheelHandler, { passive: false });
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("wheel", wheelHandler);
    };
  }, [onClose]);

  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newPos = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    };
    positionRef.current = newPos;
    setPosition(newPos);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
    >
      {/* 控制列 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 text-xs shadow-lg bg-black/60 text-white hover:bg-black/80 border-white/20"
          onClick={() => setScale((s) => Math.min(5, s + 0.5))}
        >
          <ZoomIn className="h-3.5 w-3.5 mr-1" /> 放大
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 text-xs shadow-lg bg-black/60 text-white hover:bg-black/80 border-white/20"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.5))}
        >
          <ZoomOut className="h-3.5 w-3.5 mr-1" /> 縮小
        </Button>
        <span className="text-white/70 text-xs px-2">{Math.round(scale * 100)}%</span>
        {scale !== 1 && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs shadow-lg bg-black/60 text-white hover:bg-black/80 border-white/20"
            onClick={resetView}
          >
            重置
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-lg bg-black/60 text-white hover:bg-black/80 border-white/20"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 圖片 */}
      <img
        src={src}
        alt={alt}
        className={`max-w-[90vw] max-h-[90vh] object-contain select-none transition-transform duration-150 ${scale > 1 ? "cursor-grab" : ""
          } ${isDragging ? "cursor-grabbing" : ""}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        }}
        onMouseDown={handleMouseDown}
        draggable={false}
      />

      {/* 提示 */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
        滾輪縮放 · 拖曳移動 · ESC 關閉
      </p>
    </div>
  );
}


/* ────────────────────────────────────────────
 *  場景詳情 Popup Modal
 * ──────────────────────────────────────────── */
function SceneModal({
  scene,
  index,
  isGenerating,
  generatingIndex,
  onClose,
  onUpdate,
  onGenerate,
  styleContext,
  styleName,
  onOpenStylePicker,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...scene });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationNotes, setOptimizationNotes] = useState(null);
  const [showSourceText, setShowSourceText] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const overlayRef = useRef(null);
  const isThisGenerating = generatingIndex === index;

  // ESC 關閉
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 點遮罩關閉
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const saveEditing = () => {
    onUpdate(index, editForm);
    setIsEditing(false);
  };

  const handleOpenStylePicker = () => {
    if (isEditing) saveEditing();
    onOpenStylePicker?.();
  };

  // AI 優化場景
  const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptimizationNotes(null);
    try {
      const result = await optimizeScene({
        scene_title: scene.scene_title,
        scene_description: scene.scene_description,
        visual_prompt: scene.visual_prompt,
        mood: scene.mood,
        key_elements: scene.key_elements,
        styleContext: styleContext || "",
      });

      // 更新場景資料
      const updates = {
        scene_title: result.scene_title || scene.scene_title,
        scene_description: result.scene_description || scene.scene_description,
        visual_prompt: result.visual_prompt || scene.visual_prompt,
      };
      onUpdate(index, updates);
      setOptimizationNotes(result.optimization_notes || "已完成優化");
    } catch (err) {
      console.error("Scene optimization failed:", err);
      setOptimizationNotes("優化失敗：" + (err.message || "請稍後重試"));
    } finally {
      setIsOptimizing(false);
    }
  };

  const sceneImage = scene.generatedImage;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-border/50 bg-muted/30">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
            {scene.scene_number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">{scene.scene_title}</h3>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {scene.mood && (
                <p className="text-[11px] text-muted-foreground">{scene.mood}</p>
              )}
              {styleName && onOpenStylePicker && (
                <button
                  type="button"
                  onClick={handleOpenStylePicker}
                  className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="調整文件圖片風格"
                >
                  <Palette className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{styleName}</span>
                  <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* AI 優化按鈕 */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleOptimize}
              disabled={isOptimizing || isEditing}
            >
              {isOptimizing ? (
                <><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> 優化中…</>
              ) : (
                <><Sparkles className="h-3 w-3" /> AI 優化</>
              )}
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => {
                if (isEditing) saveEditing();
                else {
                  setEditForm({ ...scene });
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? <><Check className="h-3 w-3" /> 儲存</> : <><Edit2 className="h-3 w-3" /> 編輯</>}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* AI 優化提示 */}
        {optimizationNotes && (
          <div className="shrink-0 px-5 py-2 border-b border-border/30 bg-primary/5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs text-foreground">{optimizationNotes}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs shrink-0"
                onClick={() => setOptimizationNotes(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Modal Body — 可捲動 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">

            {/* 左：預覽圖 */}
            <div className="relative aspect-[4/3] md:aspect-auto bg-muted/20 border-b md:border-b-0 md:border-r border-border/30 flex items-center justify-center overflow-hidden">
              {isThisGenerating ? (
                <ImageGeneratingState compact />
              ) : sceneImage ? (
                <div className="relative w-full h-full group">
                  <img
                    src={sceneImage}
                    alt={`場景 ${scene.scene_number} 生成圖片`}
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain p-2 cursor-zoom-in"
                    onClick={() => setLightboxSrc(sceneImage)}
                  />
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                    <Button
                      size="sm" variant="secondary" className="shadow-lg h-7 text-xs"
                      onClick={() => setLightboxSrc(sceneImage)}
                    >
                      <ZoomIn className="h-3 w-3 mr-1" /> 放大
                    </Button>
                    <Button
                      size="sm" variant="secondary" className="shadow-lg h-7 text-xs"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = sceneImage;
                        const defaultName = `scene-${scene.scene_number}-${Date.now()}.png`;
                        link.download = scene.generatedFilename ? `${scene.generatedFilename}.png` : defaultName;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" /> 下載
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/30 p-8">
                  <ImageIcon className="w-12 h-12" />
                  <p className="text-xs">尚未生成圖片</p>
                </div>
              )}
            </div>

            {/* 右：場景內容 */}
            <div className="p-5 space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">場景標題</label>
                    <Input
                      value={editForm.scene_title || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, scene_title: e.target.value }))}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">場景描述</label>
                    <Textarea
                      value={editForm.scene_description || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, scene_description: e.target.value }))}
                      className="mt-1 text-sm"
                      rows={5}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">圖片提示詞</label>
                      <span className="text-[10px] text-muted-foreground">會自動沿用文件圖片風格</span>
                    </div>
                    <Textarea
                      value={editForm.visual_prompt || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, visual_prompt: e.target.value }))}
                      className="mt-1 font-mono text-xs"
                      rows={5}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">關鍵元素（逗號分隔）</label>
                    <Input
                      value={(editForm.key_elements || []).join(", ")}
                      onChange={(e) => setEditForm((f) => ({
                        ...f,
                        key_elements: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      }))}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-8 text-xs" onClick={saveEditing}>
                      <Check className="h-3 w-3 mr-1" /> 儲存變更
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsEditing(false)}>
                      <X className="h-3 w-3 mr-1" /> 取消
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">場景描述</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {scene.scene_description}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-muted-foreground">圖片提示詞</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                        onClick={() => {
                          setEditForm({ ...scene });
                          setIsEditing(true);
                        }}
                      >
                        <Edit2 className="mr-1 h-3 w-3" /> 編輯提示詞
                      </Button>
                    </div>
                    <p className="rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {scene.visual_prompt}
                    </p>
                  </div>
                  {scene.key_elements?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">關鍵元素</p>
                      <div className="flex flex-wrap gap-1.5">
                        {scene.key_elements.map((el, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {el}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {scene.mood && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">氛圍</p>
                      <p className="text-sm text-foreground">{scene.mood}</p>
                    </div>
                  )}

                  {/* 原始文字連結 */}
                  {scene.source_text && (
                    <div>
                      <button
                        onClick={() => setShowSourceText((v) => !v)}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>對照原文</span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showSourceText ? "rotate-180" : ""}`} />
                      </button>
                      {showSourceText && (
                        <div className="mt-2 p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/40 dark:border-amber-800/30 animate-in slide-in-from-top-2 duration-200">
                          <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed whitespace-pre-wrap">
                            {scene.source_text}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 講者備注（簡報模式） */}
                  {scene.speaker_notes && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Mic className="h-3 w-3" /> 講者備注
                      </p>
                      <div className="p-3 rounded-lg bg-info/10 border border-info/20">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {scene.speaker_notes}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50 bg-muted/20">
          <Button
            variant={sceneImage ? "outline" : "default"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => onGenerate(index)}
            disabled={isGenerating}
          >
            {isThisGenerating ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin motion-reduce:animate-none" /> 生成中…</>
            ) : sceneImage ? (
              <><Wand2 className="h-3 w-3 mr-1" /> 重新生成</>
            ) : (
              <><Wand2 className="h-3 w-3 mr-1" /> 生成此場景</>
            )}
          </Button>
        </div>
      </div>

      {/* 圖片放大 Lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={`Scene ${scene.scene_number}`}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}


/* ────────────────────────────────────────────
 *  DocumentScenes 主元件
 * ──────────────────────────────────────────── */
export default function DocumentScenes({
  documentResult,
  onUpdateScene,
  onRemoveScene,
  onGenerateScene,
  onClear,
  isGenerating = false,
  // 風格相關 props
  savedStyles = [],
  documentStyle = null,
  isDocumentStyleOverride = false,
  onApplyStyle,
  onClearStyle,
}) {
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [modalScene, setModalScene] = useState(null); // { scene, index }
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const stylePanelRef = useRef(null);

  if (!documentResult || !documentResult.scenes) return null;

  const { title, summary, scenes, characters, total_scenes, estimated_generation_time } = documentResult;
  const stylePrompt = documentStyle?.prompt || "";
  const styleName = documentStyle?.name || "AI 文件建議風格";
  const styleDescription = documentStyle?.description || "";
  const hasDocumentStyle = Boolean(stylePrompt);

  const handleGenerateScene = async (index) => {
    setGeneratingIndex(index);
    try {
      await onGenerateScene(index);
    } finally {
      setGeneratingIndex(null);
    }
  };

  const generatedCount = scenes.filter((s) => s.generatedImage).length;

  const fetchImageAsBase64 = async (url) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  };

  /**
   * 使用 Canvas 將中文文字渲染為高解析圖片
   * 利用瀏覽器內建 CJK 字型，無需額外下載字型檔
   */
  const renderTextToCanvas = (text, { fontSize = 14, bold = false, color = "#282828", maxWidthMm = 260 } = {}) => {
    const SCALE = 3; // 3x 高解析度
    const PX_PER_MM = 96 / 25.4; // 96 DPI
    const maxWidthPx = maxWidthMm * PX_PER_MM * SCALE;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontWeight = bold ? "bold" : "normal";
    const fontStr = `${fontWeight} ${fontSize * SCALE}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif`;

    ctx.font = fontStr;

    // 逐字元換行（適用 CJK 文字）
    const lines = [];
    let currentLine = "";
    for (const char of text) {
      if (char === "\n") { lines.push(currentLine); currentLine = ""; continue; }
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidthPx && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * SCALE * 1.5;
    canvas.width = maxWidthPx;
    canvas.height = Math.max(lines.length * lineHeight + 4 * SCALE, lineHeight);

    // canvas resize 後需重設 font
    ctx.font = fontStr;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeight));

    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthMm: canvas.width / SCALE / PX_PER_MM,
      heightMm: canvas.height / SCALE / PX_PER_MM,
    };
  };

  /**
   * 將所有已生成的場景圖片匯出為 PDF（支援中文）
   * - 使用 source_text（原始文字）作為摘要
   * - 標題不截斷
   */
  const exportToPdf = async () => {
    const generatedScenes = scenes.filter((s) => s.generatedImage);
    if (generatedScenes.length === 0) return;

    setIsExportingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - 20; // 左右各 10mm 留白

      for (let i = 0; i < generatedScenes.length; i++) {
        const scene = generatedScenes[i];
        if (i > 0) pdf.addPage();

        let cursorY = 8; // 起始 Y 座標 (mm)

        // 標題（不截斷）
        const titleImg = renderTextToCanvas(
          `#${scene.scene_number}  ${scene.scene_title || ""}`,
          { fontSize: 14, bold: true, maxWidthMm: contentWidth }
        );
        pdf.addImage(titleImg.dataUrl, "PNG", 10, cursorY, titleImg.widthMm, titleImg.heightMm);
        cursorY += titleImg.heightMm + 1;

        // 摘要：優先使用 source_text（原始文字），其次使用完整 scene_description
        const summaryText = scene.source_text || scene.scene_description || "";
        if (summaryText) {
          const descImg = renderTextToCanvas(summaryText, {
            fontSize: 9,
            color: "#555555",
            maxWidthMm: contentWidth,
          });
          // 限制摘要高度，避免太長的文字佔過多空間
          const maxDescHeight = 30; // mm
          const descHeight = Math.min(descImg.heightMm, maxDescHeight);
          pdf.addImage(descImg.dataUrl, "PNG", 10, cursorY, descImg.widthMm, descHeight);
          cursorY += descHeight + 3;
        }

        // 加入場景圖片
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = scene.generatedImage;
          });

          const maxW = contentWidth;
          const maxH = pageHeight - cursorY - 5;
          const ratio = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          const x = (pageWidth - w) / 2;
          pdf.addImage(img, "PNG", x, cursorY, w, h);
        } catch {
          // 圖片載入失敗時的 fallback（用 Canvas 渲染錯誤訊息）
          const errImg = renderTextToCanvas("[圖片載入失敗]", {
            fontSize: 12, color: "#c83232",
          });
          pdf.addImage(errImg.dataUrl, "PNG", pageWidth / 2 - errImg.widthMm / 2, pageHeight / 2, errImg.widthMm, errImg.heightMm);
        }
      }

      pdf.save(`${title || "document"}-scenes-${Date.now()}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF 匯出失敗，請稍後再試。");
    } finally {
      setIsExportingPdf(false);
    }
  };

  /**
   * 使用 pptxgenjs 將場景匯出為可編輯的 PowerPoint 簡報
   * - 每個分析後的場景對應一張投影片
   * - 有 bullet_points 時顯示項目符號；否則 fallback 到 scene_description
   * - 結構化表格與圖表以原生 PowerPoint 元件匯出
   * - 已生成的圖片以 base64 嵌入（避免 SAS token 過期）
   * - speaker_notes 寫入投影片備注區
   */
  const exportToPptx = async () => {
    const exportScenes = getPptxScenes(scenes);
    if (exportScenes.length === 0) return;

    setIsExportingPptx(true);
    try {
      const module = await import("pptxgenjs");
      const PptxGenJS = module.default || module;
      const pptx = new PptxGenJS();

      pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 inches
      pptx.title = title || "Presentation";
      pptx.subject = summary || "";
      pptx.author = "Pixora 智繪";

      const C_TITLE = "1E293B";
      const C_BODY = "475569";
      const C_ACCENT = "6366F1";

      // Fetch all images in parallel to reduce total export time
      const imageBase64List = await Promise.all(
        exportScenes.map((scene) =>
          scene.generatedImage ? fetchImageAsBase64(scene.generatedImage) : Promise.resolve(null)
        )
      );
      const failedImages = imageBase64List.filter(
        (base64, index) => exportScenes[index].generatedImage && base64 === null
      ).length;

      for (let i = 0; i < exportScenes.length; i++) {
        const scene = exportScenes[i];
        const imageBase64 = imageBase64List[i];
        const slide = pptx.addSlide();

        // Scene number badge (small circle top-left)
        slide.addText(`${scene.scene_number}`, {
          x: 0.2, y: 0.15, w: 0.38, h: 0.38,
          fontSize: 10, bold: true, color: "FFFFFF",
          fill: { color: C_ACCENT },
          align: "center", valign: "middle",
          rectRadius: 0.05,
        });

        const tables = getPptxTables(scene);
        const charts = getPptxCharts(scene);
        const hasNativeVisual = tables.length > 0 || charts.length > 0;
        const isContentOnlyLayout =
          !hasNativeVisual &&
          !imageBase64 &&
          (scene.layout_type === "title_content" || scene.layout_type === "closing");
        const isClosingLayout = scene.layout_type === "closing";

        // Slide title
        slide.addText(scene.scene_title || "", {
          x: isClosingLayout ? 0.6 : 0.68,
          y: 0.1,
          w: isClosingLayout ? 8.7 : 5.7,
          h: 0.6,
          fontSize: 20, bold: true, color: C_TITLE,
          align: isClosingLayout ? "center" : "left",
          valign: "middle",
        });

        // Bullet points (or scene_description fallback)
        const bullets = extractPptxBullets(scene);

        if (bullets.length > 0) {
          slide.addText(
            bullets.map((text) => ({
              text,
              options: { bullet: { type: "bullet" }, paraSpaceAfter: 6, color: C_BODY },
            })),
            {
              x: isContentOnlyLayout ? 0.6 : 0.3,
              y: 0.85,
              w: isContentOnlyLayout ? 8.8 : 5.5,
              h: 4.35,
              fontSize: 13,
              valign: "top",
              lineSpacingMultiple: 1.4,
              wrap: true,
            }
          );
        }

        if (hasNativeVisual) {
          const visualBounds = { x: 6.0, y: 0.8, w: 3.75, h: 4.45 };

          if (tables.length > 0 && charts.length > 0) {
            addPptxTable(
              slide,
              tables[0],
              { ...visualBounds, h: 2.1 },
              { title: C_TITLE, body: C_BODY, accent: C_ACCENT }
            );
            addPptxChart(
              slide,
              charts[0],
              { ...visualBounds, y: 3.08, h: 2.17 },
              { title: C_TITLE, body: C_BODY, accent: C_ACCENT }
            );
          } else if (tables.length > 0) {
            addPptxTable(
              slide,
              tables[0],
              visualBounds,
              { title: C_TITLE, body: C_BODY, accent: C_ACCENT }
            );
          } else {
            addPptxChart(
              slide,
              charts[0],
              visualBounds,
              { title: C_TITLE, body: C_BODY, accent: C_ACCENT }
            );
          }
        } else if (imageBase64) {
          // AI-generated image on the right
          slide.addImage({ data: imageBase64, x: 6.0, y: 0.8, w: 3.75, h: 4.45 });
        } else if (!isContentOnlyLayout) {
          slide.addText("尚未生成配圖\n可在 Pixora 中生成或自行替換", {
            x: 6.0, y: 0.8, w: 3.75, h: 4.45,
            fontSize: 13, color: "64748B",
            align: "center", valign: "mid",
            margin: 0.2,
            fill: { color: "F8FAFC", transparency: 4 },
            line: { color: "CBD5E1", pt: 1 },
          });
        }

        // Speaker notes
        if (scene.speaker_notes) {
          slide.addNotes(scene.speaker_notes);
        }
      }

      const safeTitle = sanitizePptxFilename(title);
      await pptx.writeFile({ fileName: `${safeTitle}-${Date.now()}.pptx` });

      if (failedImages > 0) {
        alert(`PPTX 已匯出，但 ${failedImages} 張配圖尚未嵌入。投影片文字內容完整，可稍後補上圖片。`);
      }
    } catch (err) {
      console.error("PPTX export failed:", err);
      alert("PPTX 匯出失敗，請稍後再試。");
    } finally {
      setIsExportingPptx(false);
    }
  };

  // 打開 modal 時使用最新的 scene 資料
  const openModal = (index) => {
    setModalScene({ scene: scenes[index], index });
  };

  const handleModalUpdate = (index, data) => {
    onUpdateScene(index, data);
    // 更新 modal 中顯示的 scene
    setModalScene({ scene: { ...scenes[index], ...data }, index });
  };

  return (
    <div className="flex min-h-full flex-col -mx-4 lg:-mx-8">

      {/* ═══════ 文件資訊摘要 ═══════ */}
      <div className="shrink-0 px-4 lg:px-8 pb-3">
        <Card className="bg-primary/5 border-primary/20 dark:bg-primary/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-4 flex-wrap lg:flex-nowrap">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-foreground flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  {title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{summary}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Layers className="h-3 w-3" /> {total_scenes} 場景
                </Badge>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" /> ~{Math.ceil(estimated_generation_time / 60)} 分鐘
                </Badge>
                {generatedCount > 0 && (
                  <Badge variant="default" className="gap-1 text-xs bg-green-600">
                    <Check className="h-3 w-3" /> {generatedCount}/{scenes.length} 已生成
                  </Badge>
                )}
                {characters?.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Users className="h-3 w-3" /> {characters.length} 角色
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
                {generatedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToPdf}
                    disabled={isGenerating || isExportingPdf || isExportingPptx}
                    className="text-xs h-8 gap-1"
                  >
                    {isExportingPdf ? (
                      <><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> 匯出中…</>
                    ) : (
                      <><FileDown className="h-3 w-3" /> 匯出 PDF</>
                    )}
                  </Button>
                )}
                {scenes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToPptx}
                    disabled={isGenerating || isExportingPdf || isExportingPptx}
                    className="text-xs h-8 gap-1"
                  >
                    {isExportingPptx ? (
                      <><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> 匯出中…</>
                    ) : (
                      <><Presentation className="h-3 w-3" /> 匯出 PPTX</>
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onClear} disabled={isGenerating} className="text-xs h-8">
                  清除分析
                </Button>
              </div>
            </div>

            {characters?.length > 0 && (
              <div className="mt-3 pt-2 border-t border-primary/10 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-primary">角色：</span>
                {characters.map((char, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs bg-background/60">
                    {char.name} {char.role && `(${char.role})`}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════ 風格選擇面板 ═══════ */}
        <section ref={stylePanelRef} className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <button
            type="button"
            onClick={() => setShowStylePicker((v) => !v)}
            aria-expanded={showStylePicker}
            aria-controls="document-style-picker"
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">文件圖片風格</span>
                {hasDocumentStyle && (
                  <Badge variant="default" className="h-4 bg-primary/90 px-1.5 py-0 text-[10px]">
                    {isDocumentStyleOverride ? "已套用風格庫" : "AI 建議"}
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {hasDocumentStyle ? styleName : "尚未取得文件風格建議"}
              </span>
            </span>
            <span className="hidden items-center gap-1.5 text-xs font-medium text-primary sm:flex">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {showStylePicker ? "收起調整" : "調整風格"}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${showStylePicker ? "rotate-180" : ""
                }`}
              aria-hidden="true"
            />
          </button>

          {!showStylePicker && hasDocumentStyle && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground">
                  {isDocumentStyleOverride ? `風格庫：${styleName}` : `AI 建議：${styleName}`}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {styleDescription || stylePrompt}
                </p>
              </div>
              {isDocumentStyleOverride && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-primary hover:text-primary"
                  onClick={onClearStyle}
                >
                  恢復 AI 建議
                </Button>
              )}
            </div>
          )}

          {showStylePicker && (
            <div id="document-style-picker" className="mt-2 overflow-hidden rounded-xl border border-border bg-background/80 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2 duration-200">
              {hasDocumentStyle && (
                <div className="border-b border-border/50 bg-primary/5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {isDocumentStyleOverride ? "目前套用的風格庫樣式" : "AI 根據文件內容推薦"}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{styleName}</p>
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                          {styleDescription || stylePrompt}
                        </p>
                        {Array.isArray(documentStyle?.tags) && documentStyle.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {documentStyle.tags.slice(0, 5).map((tag) => (
                              <Badge key={tag} variant="outline" className="border-primary/15 px-1.5 py-0 text-[10px] text-primary/80">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {isDocumentStyleOverride && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2.5 text-xs text-primary"
                        onClick={onClearStyle}
                      >
                        <X className="mr-1 h-3 w-3" aria-hidden="true" />
                        恢復 AI 建議
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="p-3">
                <p className="mb-3 text-[11px] text-muted-foreground">
                  AI 已根據文件內容自動選擇風格；點選下方風格庫樣式即可取代。
                </p>
                {savedStyles.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground">
                    <Palette className="mx-auto mb-2 h-8 w-8 opacity-30" aria-hidden="true" />
                    <p className="text-xs">尚無收藏的風格</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      請在「一般創作」或「風格庫」中分析並收藏風格
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {savedStyles.map((style) => {
                      const isActive = isDocumentStyleOverride && documentStyle?.id === style.id;
                      return (
                        <button
                          type="button"
                          key={style.id}
                          onClick={() => {
                            onApplyStyle?.(style);
                            setShowStylePicker(false);
                          }}
                          aria-pressed={isActive}
                          aria-label={`套用風格 ${style.name}`}
                          className={`group/style relative flex flex-col overflow-hidden rounded-lg border text-left transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive
                            ? "border-primary ring-2 ring-primary/20 shadow-md"
                            : "border-border/60 hover:border-primary/40 hover:shadow-md"
                            }`}
                        >
                          <div className="aspect-[4/3] overflow-hidden bg-muted/30">
                            {style.previewUrl ? (
                              <img
                                src={style.previewUrl}
                                alt={style.name}
                                width={320}
                                height={240}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover transition-transform duration-300 group-hover/style:scale-[1.02] motion-reduce:transform-none"
                                onError={(e) => { e.target.style.display = "none"; }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Palette className="h-6 w-6 text-muted-foreground/20" aria-hidden="true" />
                              </div>
                            )}
                            {isActive && (
                              <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                                <Check className="h-3 w-3 text-white" aria-hidden="true" />
                              </div>
                            )}
                          </div>
                          <div className="p-1.5">
                            <p className={`truncate text-[11px] font-medium ${isActive ? "text-primary" : "text-foreground"
                              }`}>
                              {style.name}
                            </p>
                            {Array.isArray(style.tags) && style.tags.length > 0 && (
                              <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                                {style.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ")}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ═══════ 場景看板 — 圖片優先網格 ═══════ */}
      <div className="px-4 pb-8 pt-4 lg:px-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              分鏡預覽
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              點擊圖片查看大圖，或直接編輯提示詞後重新生成。
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 gap-1 text-xs">
            <Layers className="h-3 w-3" /> {scenes.length} 個分鏡
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {scenes.map((scene, index) => {
            const isThisGenerating = generatingIndex === index;
            const sceneImage = scene.generatedImage;

            return (
              <div
                key={index}
                className="min-w-0"
              >
                <Card
                  className="group flex h-full flex-col overflow-hidden border-border/60 transition-shadow hover:shadow-lg"
                >
                  {/* 卡片標題 */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2.5">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {scene.scene_number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{scene.scene_title}</p>
                      {scene.mood && (
                        <p className="text-[10px] text-muted-foreground truncate">{scene.mood}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon"
                        className="h-10 w-10 text-destructive hover:text-destructive sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); onRemoveScene(index); }}
                        title="刪除場景"
                        aria-label={`刪除場景 ${scene.scene_number}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 預覽圖 */}
                  <button
                    type="button"
                    className="group/preview relative block aspect-video w-full shrink-0 overflow-hidden border-b border-border/30 bg-muted/20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => openModal(index)}
                    disabled={isThisGenerating}
                    aria-label={`查看場景 ${scene.scene_number}：${scene.scene_title}`}
                  >
                    {isThisGenerating ? (
                      <ImageGeneratingState compact />
                    ) : sceneImage ? (
                      <div className="relative w-full h-full group/img">
                        <img
                          src={sceneImage}
                          alt={`場景 ${scene.scene_number} 生成圖片`}
                          width={640}
                          height={360}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100">
                          <Maximize2 className="h-3 w-3" aria-hidden="true" /> 查看大圖與內容
                        </span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
                        <ImageIcon className="w-8 h-8" />
                        <p className="text-[11px]">尚未生成圖片，點擊查看設定</p>
                      </div>
                    )}
                  </button>

                  {/* 場景摘要 */}
                  <CardContent className="min-h-0 flex-1 space-y-3 p-3.5">
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">場景描述</p>
                      <p className="line-clamp-2 text-xs leading-relaxed text-foreground">{scene.scene_description}</p>
                    </div>

                    <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-primary/80">
                      <Palette className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {isDocumentStyleOverride ? "風格庫" : "AI 風格"} · {styleName}
                      </span>
                    </div>

                    {/* 重點項目（簡報模式） */}
                    {Array.isArray(scene.bullet_points) && scene.bullet_points.length > 0 && (
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <List className="h-3 w-3" /> 重點項目
                        </p>
                        <ul className="space-y-0.5">
                          {scene.bullet_points.slice(0, 2).map((point, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[10px] text-foreground">
                              <span className="text-primary shrink-0 mt-0.5">•</span>
                              <span className="line-clamp-1">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(getPptxTables(scene).length > 0 || getPptxCharts(scene).length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {getPptxTables(scene).length > 0 && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            原生表格
                          </Badge>
                        )}
                        {getPptxCharts(scene).length > 0 && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            原生圖表
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="rounded-xl border border-border/60 bg-muted/40 p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">圖片提示詞</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px] text-primary hover:text-primary"
                          onClick={() => openModal(index)}
                        >
                          <Edit2 className="mr-1 h-3 w-3" /> 編輯
                        </Button>
                      </div>
                      <p className="line-clamp-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                        {scene.visual_prompt}
                      </p>
                    </div>

                    {/* 有原始文字時的指示 */}
                    {scene.source_text && (
                      <div className="mt-2 flex items-center gap-1">
                        <BookOpen className="h-3 w-3 text-amber-600/60" />
                        <span className="text-[10px] text-amber-600/60">附有原始文字對照</span>
                      </div>
                    )}
                  </CardContent>

                  {/* 快速操作 */}
                  <div className="grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-border/30 p-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 px-3 text-xs"
                      onClick={() => openModal(index)}
                    >
                      <Edit2 className="h-3 w-3" /> 編輯分鏡
                    </Button>
                    <Button
                      variant={sceneImage ? "outline" : "default"}
                      size="sm"
                      className="h-9 text-xs"
                      onClick={(e) => { e.stopPropagation(); handleGenerateScene(index); }}
                      disabled={isGenerating}
                    >
                      {isThisGenerating ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin motion-reduce:animate-none" /> 生成中…</>
                      ) : sceneImage ? (
                        <><Wand2 className="h-3 w-3 mr-1" /> 重新生成</>
                      ) : (
                        <><Wand2 className="h-3 w-3 mr-1" /> 生成此場景</>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════ Popup Modal ═══════ */}
      {modalScene && (
        <SceneModal
          scene={scenes[modalScene.index] || modalScene.scene}
          index={modalScene.index}
          isGenerating={isGenerating}
          generatingIndex={generatingIndex}
          onClose={() => setModalScene(null)}
          onUpdate={handleModalUpdate}
          onGenerate={handleGenerateScene}
          styleContext={stylePrompt}
          styleName={styleName}
          onOpenStylePicker={() => {
            setModalScene(null);
            setShowStylePicker(true);
            window.requestAnimationFrame(() => {
              stylePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
          }}
        />
      )}
    </div>
  );
}
