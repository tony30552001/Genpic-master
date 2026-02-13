import { useState, useEffect, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * 文件場景列表元件（Trello 風格水平看板佈局 + 展開/收合）
 * 場景卡片水平排列，可左右捲動，可展開查看完整內容
 */
export default function DocumentScenes({
  documentResult,
  onUpdateScene,
  onRemoveScene,
  onGenerateScene,
  onGenerateAll,
  onClear,
  isGenerating = false,
}) {
  const [editingScene, setEditingScene] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 檢查捲動狀態
  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

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
  }, [documentResult?.scenes?.length]);

  if (!documentResult || !documentResult.scenes) return null;

  const { title, summary, scenes, characters, total_scenes, estimated_generation_time } = documentResult;

  const scrollBy = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 320;
    el.scrollBy({ left: direction * cardWidth, behavior: "smooth" });
  };

  // 展開/收合
  const toggleExpand = (index) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (allExpanded) {
      setExpandedCards(new Set());
      setAllExpanded(false);
    } else {
      setExpandedCards(new Set(scenes.map((_, i) => i)));
      setAllExpanded(true);
    }
  };

  const startEditing = (scene, index) => {
    setEditingScene(index);
    setEditForm({ ...scene });
    // 展開該卡片以便編輯
    setExpandedCards((prev) => new Set(prev).add(index));
  };

  const saveEditing = (index) => {
    onUpdateScene(index, editForm);
    setEditingScene(null);
    setEditForm({});
  };

  const cancelEditing = () => {
    setEditingScene(null);
    setEditForm({});
  };

  const handleGenerateScene = async (index) => {
    setGeneratingIndex(index);
    try {
      await onGenerateScene(index);
    } finally {
      setGeneratingIndex(null);
    }
  };

  const handleGenerateAll = async () => {
    await onGenerateAll();
  };

  const generatedCount = scenes.filter((s) => s.generatedImage).length;

  return (
    <div className="flex flex-col h-full min-h-0 -mx-4 lg:-mx-8">

      {/* ═══════ 文件資訊摘要 — 緊湊的頂部列 ═══════ */}
      <div className="shrink-0 px-4 lg:px-8 pb-3">
        <Card className="bg-gradient-to-br from-primary/5 via-blue-50 to-sky-50 border-primary/20 dark:from-primary/10 dark:via-blue-950/20 dark:to-cyan-950/20">
          <CardContent className="p-4">
            {/* 標題列 + 統計 + 操作按鈕 — 一行搞定 */}
            <div className="flex items-start gap-4 flex-wrap lg:flex-nowrap">
              {/* 標題與摘要 */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-foreground flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  {title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{summary}</p>
              </div>

              {/* 統計 Badge */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Layers className="h-3 w-3" />
                  {total_scenes} 場景
                </Badge>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  ~{Math.ceil(estimated_generation_time / 60)} 分鐘
                </Badge>
                {generatedCount > 0 && (
                  <Badge variant="default" className="gap-1 text-xs bg-green-600">
                    <Check className="h-3 w-3" />
                    {generatedCount}/{scenes.length} 已生成
                  </Badge>
                )}
                {characters?.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    {characters.length} 角色
                  </Badge>
                )}
              </div>

              {/* 操作按鈕 */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllExpanded}
                  className="text-xs h-8 gap-1"
                >
                  {allExpanded ? (
                    <><Minimize2 className="h-3 w-3" /> 全部收合</>
                  ) : (
                    <><Maximize2 className="h-3 w-3" /> 全部展開</>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={onClear} disabled={isGenerating} className="text-xs h-8">
                  清除分析
                </Button>
              </div>
            </div>

            {/* 角色一覽 */}
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

      {/* ═══════ 場景看板 — Trello 風格水平捲動 ═══════ */}
      <div className="flex-1 min-h-0 relative">
        {/* 左右捲動按鈕 */}
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

        {/* 水平捲動容器 */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto overflow-y-hidden h-full px-4 lg:px-8 pb-4 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          {scenes.map((scene, index) => {
            const isEditing = editingScene === index;
            const isThisGenerating = generatingIndex === index;
            const sceneImage = scene.generatedImage;
            const isExpanded = expandedCards.has(index);

            return (
              <div
                key={index}
                className={`snap-start shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isExpanded ? "w-[420px] sm:w-[480px] md:w-[540px]" : "w-[300px] sm:w-[320px] md:w-[340px]"
                  }`}
              >
                <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-lg border-border/60 group">
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
                    {/* 操作按鈕 */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className={`h-7 w-7 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={() => toggleExpand(index)}
                        title={isExpanded ? "收合" : "展開"}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={`h-7 w-7 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={() => startEditing(scene, index)}
                        title="編輯場景"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={`h-7 w-7 text-destructive hover:text-destructive transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={() => onRemoveScene(index)}
                        title="刪除場景"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 預覽圖區域 */}
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
                      <div className="relative w-full h-full group/img">
                        <img
                          src={sceneImage}
                          alt={`Scene ${scene.scene_number}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
                          <Button
                            size="sm" variant="secondary" className="shadow-lg h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
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
                          <Button
                            size="sm" variant="secondary" className="shadow-lg h-7 text-xs"
                            onClick={() => handleGenerateScene(index)}
                            disabled={isGenerating}
                          >
                            <Wand2 className="h-3 w-3 mr-1" /> 重新生成
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
                        <ImageIcon className="w-8 h-8" />
                        <p className="text-[10px]">尚未生成圖片</p>
                      </div>
                    )}
                  </div>

                  {/* 場景內容 — 可展開/收合 */}
                  <CardContent
                    className={`flex-1 p-3 overflow-y-auto min-h-0 transition-all duration-300 ease-in-out ${isExpanded ? "" : "max-h-[160px]"
                      }`}
                  >
                    {isEditing ? (
                      /* 編輯模式 */
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">場景標題</label>
                          <Input
                            value={editForm.scene_title || ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, scene_title: e.target.value }))}
                            className="mt-0.5 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">場景描述</label>
                          <Textarea
                            value={editForm.scene_description || ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, scene_description: e.target.value }))}
                            className="mt-0.5 text-xs"
                            rows={isExpanded ? 5 : 3}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-muted-foreground">英文 Prompt</label>
                          <Textarea
                            value={editForm.visual_prompt || ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, visual_prompt: e.target.value }))}
                            className="mt-0.5 font-mono text-[10px]"
                            rows={isExpanded ? 5 : 3}
                          />
                        </div>
                        {isExpanded && editForm.key_elements && (
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground">關鍵元素（逗號分隔）</label>
                            <Input
                              value={(editForm.key_elements || []).join(", ")}
                              onChange={(e) => setEditForm((prev) => ({
                                ...prev,
                                key_elements: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              }))}
                              className="mt-0.5 h-8 text-xs"
                            />
                          </div>
                        )}
                        <div className="flex gap-1.5 pt-1">
                          <Button size="sm" className="h-7 text-xs" onClick={() => saveEditing(index)}>
                            <Check className="h-3 w-3 mr-1" /> 儲存
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelEditing}>
                            <X className="h-3 w-3 mr-1" /> 取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* 顯示模式 */
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-0.5">場景描述</p>
                          <p className={`text-xs text-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                            {scene.scene_description}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-0.5">英文 Prompt</p>
                          <p className={`text-[10px] text-muted-foreground bg-muted/60 p-2 rounded font-mono leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                            {scene.visual_prompt}
                          </p>
                        </div>
                        {scene.key_elements?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">關鍵元素</p>
                            <div className="flex flex-wrap gap-1">
                              {scene.key_elements.map((el, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {el}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {isExpanded && scene.mood && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">氛圍</p>
                            <p className="text-xs text-foreground">{scene.mood}</p>
                          </div>
                        )}
                        {/* 展開/收合按鈕 */}
                        <button
                          onClick={() => toggleExpand(index)}
                          className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-0.5 pt-1 transition-colors"
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-3 w-3" /> 收合內容</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> 展開完整內容</>
                          )}
                        </button>
                      </div>
                    )}
                  </CardContent>

                  {/* 卡片底部 — 生成按鈕 */}
                  <div className="shrink-0 p-2 border-t border-border/30">
                    <Button
                      variant={sceneImage ? "outline" : "default"}
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => handleGenerateScene(index)}
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
    </div>
  );
}
