import { useState, useEffect, useRef, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
  Palette,
  ChevronDown,
  Sparkles,
  FileDown,
  ZoomIn,
  ZoomOut,
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
import { Skeleton } from "@/components/ui/skeleton";
import { optimizeScene } from "@/services/aiService";


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
      <div className="relative bg-background rounded-2xl shadow-2xl border border-border/60 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-border/50 bg-muted/30">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
            {scene.scene_number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">{scene.scene_title}</h3>
            {scene.mood && (
              <p className="text-[11px] text-muted-foreground">{scene.mood}</p>
            )}
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
                <div className="absolute inset-0 p-4" aria-live="polite">
                  <Skeleton className="h-full w-full rounded-xl" />
                  <p className="absolute inset-x-0 bottom-6 text-center text-xs font-medium text-muted-foreground">
                    圖片生成中…
                  </p>
                </div>
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
                    <label className="text-xs font-medium text-muted-foreground">英文 Prompt</label>
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
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">英文 Prompt</p>
                    <p className="text-xs text-muted-foreground bg-muted/60 p-3 rounded-lg font-mono leading-relaxed whitespace-pre-wrap">
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
  analyzedStyle = "",
  onApplyStyle,
  onClearStyle,
}) {
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [modalScene, setModalScene] = useState(null); // { scene, index }
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      const observer = new ResizeObserver(checkScroll);
      observer.observe(el);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        observer.disconnect();
      };
    }
  }, [documentResult?.scenes?.length, checkScroll]);

  if (!documentResult || !documentResult.scenes) return null;

  const { title, summary, scenes, characters, total_scenes, estimated_generation_time } = documentResult;

  const scrollBy = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  const handleGenerateScene = async (index) => {
    setGeneratingIndex(index);
    try {
      await onGenerateScene(index);
    } finally {
      setGeneratingIndex(null);
    }
  };

  const generatedCount = scenes.filter((s) => s.generatedImage).length;

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
   * - 每個已生成的場景對應一張投影片
   * - 有 bullet_points 時顯示項目符號；否則 fallback 到 scene_description
   * - 圖片以 base64 嵌入（避免 SAS token 過期）
   * - speaker_notes 寫入投影片備注區
   */
  const exportToPptx = async () => {
    const generatedScenes = scenes.filter((s) => s.generatedImage);
    if (generatedScenes.length === 0) return;

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

      // Fetch image as base64 using canvas (avoids SAS token expiry issues)
      const fetchBase64 = async (url) => {
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

      // Fetch all images in parallel to reduce total export time
      const imageBase64List = await Promise.all(
        generatedScenes.map((scene) => fetchBase64(scene.generatedImage))
      );
      const failedImages = imageBase64List.filter((b) => b === null).length;

      for (let i = 0; i < generatedScenes.length; i++) {
        const scene = generatedScenes[i];
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

        // Slide title
        slide.addText(scene.scene_title || "", {
          x: 0.68, y: 0.1, w: 5.7, h: 0.6,
          fontSize: 20, bold: true, color: C_TITLE,
          valign: "middle",
        });

        // Bullet points (or scene_description fallback)
        const bullets = Array.isArray(scene.bullet_points) && scene.bullet_points.length > 0
          ? scene.bullet_points
          : [scene.scene_description || ""].filter(Boolean);

        slide.addText(
          bullets.map((text) => ({
            text,
            options: { bullet: { type: "bullet" }, paraSpaceAfter: 6, color: C_BODY },
          })),
          { x: 0.3, y: 0.85, w: 5.5, h: 4.35, fontSize: 13, valign: "top", lineSpacingMultiple: 1.4, wrap: true }
        );

        // AI-generated image on the right
        if (imageBase64) {
          slide.addImage({ data: imageBase64, x: 6.0, y: 0.8, w: 3.75, h: 4.45 });
        }

        // Speaker notes
        if (scene.speaker_notes) {
          slide.addNotes(scene.speaker_notes);
        }
      }

      const safeTitle = (title || "presentation")
        .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
        .trim() || "presentation";
      await pptx.writeFile({ fileName: `${safeTitle}-${Date.now()}.pptx` });

      if (failedImages > 0) {
        alert(`PPTX 已匯出，但 ${failedImages} 張圖片因網路或權限問題未能嵌入。投影片內容完整，建議手動補充圖片。`);
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
    <div className="flex flex-col h-full min-h-0 -mx-4 lg:-mx-8">

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
              <div className="flex items-center gap-2 shrink-0">
                {generatedCount > 0 && (
                  <>
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
                  </>
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
        <div className="mt-3">
          <button
            onClick={() => setShowStylePicker((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            <Palette className="h-4 w-4" />
            <span>套用風格</span>
            {analyzedStyle && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary/90">
                已套用
              </Badge>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${showStylePicker ? "rotate-180" : ""
                }`}
            />
          </button>

          {/* 目前套用的風格摘要（收合時也顯示） */}
          {!showStylePicker && analyzedStyle && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs text-foreground truncate flex-1">
                {analyzedStyle.length > 80 ? analyzedStyle.slice(0, 80) + "…" : analyzedStyle}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearStyle?.();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* 展開的風格選擇器 */}
          {showStylePicker && (
            <div className="mt-2 rounded-xl border border-border bg-background/80 backdrop-blur-sm shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
              {/* 已套用風格 */}
              {analyzedStyle && (
                <div className="px-4 py-3 bg-primary/5 border-b border-border/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">目前套用的風格</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {analyzedStyle}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => {
                        onClearStyle?.();
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      清除
                    </Button>
                  </div>
                </div>
              )}

              {/* 風格列表 */}
              <div className="p-3">
                {savedStyles.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Palette className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">尚無收藏的風格</p>
                    <p className="text-[10px] mt-1 text-muted-foreground/70">請在「一般創作」或「風格庫」中分析並收藏風格</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {savedStyles.map((style) => {
                      const isActive = analyzedStyle === style.prompt;
                      return (
                        <button
                          type="button"
                          key={style.id}
                          onClick={() => {
                            onApplyStyle?.(style);
                            setShowStylePicker(false);
                          }}
                          aria-pressed={isActive}
                          className={`group/style relative flex flex-col rounded-lg border overflow-hidden text-left transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive
                            ? "border-primary ring-2 ring-primary/20 shadow-md"
                            : "border-border/60 hover:border-primary/40 hover:shadow-md"
                            }`}
                        >
                          {/* 預覽圖 */}
                          <div className="aspect-[4/3] bg-muted/30 overflow-hidden">
                            {style.previewUrl ? (
                              <img
                                src={style.previewUrl}
                                alt={style.name}
                                width={320}
                                height={240}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover group-hover/style:scale-[1.02] transition-transform duration-300 motion-reduce:transform-none"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Palette className="w-6 h-6 text-muted-foreground/20" />
                              </div>
                            )}
                            {isActive && (
                              <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>
                          {/* 名稱 */}
                          <div className="p-1.5">
                            <p className={`text-[11px] font-medium truncate ${isActive ? "text-primary" : "text-foreground"
                              }`}>
                              {style.name}
                            </p>
                            {style.tags?.length > 0 && (
                              <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                                {style.tags.slice(0, 3).map(t => `#${t}`).join(" ")}
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
        </div>
      </div>

      {/* ═══════ 場景看板 — 水平捲動 + 點擊 popup ═══════ */}
      <div className="flex-1 min-h-0 relative">
        {canScrollLeft && (
          <button
            onClick={() => scrollBy(-1)}
            className="absolute left-1 lg:left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-background/90 border border-border shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scrollBy(1)}
            className="absolute right-1 lg:right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-background/90 border border-border shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-foreground" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto overflow-y-hidden h-full px-4 lg:px-8 pb-4 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: "thin" }}
        >
          {scenes.map((scene, index) => {
            const isThisGenerating = generatingIndex === index;
            const sceneImage = scene.generatedImage;

            return (
              <div
                key={index}
                className="snap-start shrink-0 w-[280px] sm:w-[300px] md:w-[320px] flex flex-col"
              >
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`開啟場景 ${scene.scene_number}：${scene.scene_title}`}
                  className="flex flex-col h-full overflow-hidden transition-shadow hover:shadow-lg border-border/60 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => openModal(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openModal(index);
                    }
                  }}
                >
                  {/* 卡片標題 */}
                  <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border/40">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {scene.scene_number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{scene.scene_title}</p>
                      {scene.mood && (
                        <p className="text-[10px] text-muted-foreground truncate">{scene.mood}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className="h-10 w-10 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onRemoveScene(index); }}
                        title="刪除場景"
                        aria-label={`刪除場景 ${scene.scene_number}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 預覽圖 */}
                  <div className="shrink-0 relative aspect-video bg-muted/20 border-b border-border/30 overflow-hidden w-full">
                    {isThisGenerating ? (
                      <div className="absolute inset-0 p-3" aria-live="polite">
                        <Skeleton className="h-full w-full rounded-lg" />
                        <p className="absolute inset-x-0 bottom-4 text-center text-[10px] font-medium text-muted-foreground">
                          圖片生成中…
                        </p>
                      </div>
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
                        {/* 卡片上的放大按鈕 */}
                        <button
                          type="button"
                          className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/img:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxSrc(sceneImage);
                          }}
                          title="放大圖片"
                          aria-label={`放大場景 ${scene.scene_number} 圖片`}
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
                        <ImageIcon className="w-8 h-8" />
                        <p className="text-[10px]">尚未生成圖片</p>
                      </div>
                    )}
                  </div>

                  {/* 場景摘要 — 精簡版，點擊才展開 */}
                  <CardContent className="flex-1 p-3 min-h-0">
                    <p className="text-[11px] text-muted-foreground mb-0.5 font-medium">場景描述</p>
                    <p className="text-xs text-foreground leading-relaxed line-clamp-3">{scene.scene_description}</p>

                    {/* 重點項目（簡報模式） */}
                    {Array.isArray(scene.bullet_points) && scene.bullet_points.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] text-muted-foreground mb-0.5 font-medium flex items-center gap-1">
                          <List className="h-3 w-3" /> 重點項目
                        </p>
                        <ul className="space-y-0.5">
                          {scene.bullet_points.slice(0, 3).map((point, i) => (
                            <li key={i} className="text-[10px] text-foreground flex items-start gap-1.5">
                              <span className="text-primary shrink-0 mt-0.5">•</span>
                              <span className="line-clamp-1">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground mt-2 mb-0.5 font-medium">Prompt</p>
                    <p className="text-[10px] text-muted-foreground bg-muted/60 p-2 rounded font-mono line-clamp-2">
                      {scene.visual_prompt}
                    </p>

                    {/* 有原始文字時的指示 */}
                    {scene.source_text && (
                      <div className="flex items-center gap-1 mt-2">
                        <BookOpen className="h-3 w-3 text-amber-600/60" />
                        <span className="text-[10px] text-amber-600/60">附有原始文字對照</span>
                      </div>
                    )}

                    <p className="text-[10px] text-primary font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      點擊查看完整內容 →
                    </p>
                  </CardContent>

                  {/* 生成按鈕 */}
                  <div className="shrink-0 p-2 border-t border-border/30">
                    <Button
                      variant={sceneImage ? "outline" : "default"}
                      size="sm"
                      className="w-full h-8 text-xs"
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
          styleContext={analyzedStyle}
        />
      )}

      {/* ═══════ 卡片圖片 Lightbox ═══════ */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Scene Preview"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
