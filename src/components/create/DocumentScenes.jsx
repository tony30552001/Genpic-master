import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...scene });
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

        {/* Modal Body — 可捲動 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">

            {/* 左：預覽圖 */}
            <div className="relative aspect-[4/3] md:aspect-auto bg-muted/20 border-b md:border-b-0 md:border-r border-border/30 flex items-center justify-center">
              {isThisGenerating ? (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    <Wand2 className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-xs">AI 生成中...</p>
                </div>
              ) : sceneImage ? (
                <div className="relative w-full h-full group">
                  <img src={sceneImage} alt={`Scene ${scene.scene_number}`} className="w-full h-full object-contain p-2" />
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                    <Button
                      size="sm" variant="secondary" className="shadow-lg h-7 text-xs"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = sceneImage;
                        link.download = `scene-${scene.scene_number}-${Date.now()}.png`;
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
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 生成中...</>
            ) : sceneImage ? (
              <><Wand2 className="h-3 w-3 mr-1" /> 重新生成</>
            ) : (
              <><Wand2 className="h-3 w-3 mr-1" /> 生成此場景</>
            )}
          </Button>
        </div>
      </div>
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
  onGenerateAll,
  onClear,
  isGenerating = false,
}) {
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [modalScene, setModalScene] = useState(null); // { scene, index }
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
        <Card className="bg-gradient-to-br from-primary/5 via-blue-50 to-sky-50 border-primary/20 dark:from-primary/10 dark:via-blue-950/20 dark:to-cyan-950/20">
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
                  className="flex flex-col h-full overflow-hidden transition-all hover:shadow-lg border-border/60 group cursor-pointer"
                  onClick={() => openModal(index)}
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
                        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onRemoveScene(index); }}
                        title="刪除場景"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 預覽圖 */}
                  <div className="shrink-0 relative aspect-video bg-muted/20 border-b border-border/30 overflow-hidden">
                    {isThisGenerating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/10">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                          <Wand2 className="w-4 h-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <p className="text-xs">AI 生成中...</p>
                      </div>
                    ) : sceneImage ? (
                      <img src={sceneImage} alt={`Scene ${scene.scene_number}`} className="w-full h-full object-cover" />
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

                    <p className="text-[11px] text-muted-foreground mt-2 mb-0.5 font-medium">Prompt</p>
                    <p className="text-[10px] text-muted-foreground bg-muted/60 p-2 rounded font-mono line-clamp-2">
                      {scene.visual_prompt}
                    </p>

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
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 生成中...</>
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
        />
      )}
    </div>
  );
}
