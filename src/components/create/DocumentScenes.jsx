import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * 文件場景列表元件（水平卡片佈局）
 * 每張卡片左側：場景資訊，右側：嵌入式預覽圖
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
  const [expandedScenes, setExpandedScenes] = useState(new Set([0]));
  const [editingScene, setEditingScene] = useState(null);
  const [editForm, setEditForm] = useState({});
  // 每個場景獨立的生成狀態和圖片
  // 每個場景獨立的生成狀態
  const [generatingIndex, setGeneratingIndex] = useState(null);

  if (!documentResult || !documentResult.scenes) return null;

  const { title, summary, scenes, characters, total_scenes, estimated_generation_time } = documentResult;

  const toggleScene = (index) => {
    setExpandedScenes((prev) => {
      const newSet = new Set(prev);
      newSet.has(index) ? newSet.delete(index) : newSet.add(index);
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedScenes(new Set(scenes.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedScenes(new Set());
  };

  const startEditing = (scene, index) => {
    setEditingScene(index);
    setEditForm({ ...scene });
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
      // Note: the parent will update generatedImage, we need a callback approach
      // For now we'll track it separately
    } finally {
      setGeneratingIndex(null);
    }
  };

  const handleGenerateAll = async () => {
    await onGenerateAll();
  };

  return (
    <div className="space-y-5">

      {/* ═══════ 文件資訊摘要 — 排版優化 ═══════ */}
      <Card className="bg-gradient-to-br from-primary/5 via-blue-50 to-sky-50 border-primary/20 dark:from-primary/10 dark:via-blue-950/20 dark:to-cyan-950/20">
        <CardContent className="p-5 space-y-4">
          {/* 第一行：標題 + 摘要 */}
          <div>
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{summary}</p>
          </div>

          {/* 第二行：統計 Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Layers className="h-3 w-3" />
              {total_scenes} 個場景
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              預估 {Math.ceil(estimated_generation_time / 60)} 分鐘
            </Badge>
            {characters?.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {characters.length} 個角色
              </Badge>
            )}
          </div>

          {/* 角色一覽 */}
          {characters?.length > 0 && (
            <div className="pt-2 border-t border-primary/10">
              <p className="text-xs font-medium text-primary mb-2">角色設定</p>
              <div className="flex flex-wrap gap-1.5">
                {characters.map((char, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs bg-background/60">
                    {char.name} {char.role && `(${char.role})`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 第三行：動作按鈕 — 獨立一行，不再和標題擠在一起 */}
          <div className="flex items-center gap-2 pt-1">

            <Button variant="outline" size="sm" onClick={onClear} disabled={isGenerating}>
              清除分析
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs text-muted-foreground">
              全部展開
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs text-muted-foreground">
              全部收合
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ 場景卡片列表 — 水平佈局 ═══════ */}
      <div className="space-y-3">
        {scenes.map((scene, index) => {
          const isExpanded = expandedScenes.has(index);
          const isEditing = editingScene === index;
          const isThisGenerating = generatingIndex === index;
          const sceneImage = scene.generatedImage;

          return (
            <Card
              key={index}
              className="overflow-hidden transition-shadow hover:shadow-md border-border/60"
            >
              {/* 場景標題列 */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleScene(index)}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                  {scene.scene_number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{scene.scene_title}</p>
                  {scene.mood && (
                    <p className="text-xs text-muted-foreground">{scene.mood}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); handleGenerateScene(index); }}
                    disabled={isGenerating}
                    title="生成此場景圖片"
                  >
                    {isThisGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </Button>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* 展開的場景內容 — 水平佈局 */}
              {isExpanded && (
                <CardContent className="px-4 pb-4 pt-0 border-t border-border/40">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">

                    {/* 左側：場景資訊 (2/3) */}
                    <div className="lg:col-span-2 space-y-3">
                      {isEditing ? (
                        /* 編輯模式 */
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">場景標題</label>
                            <Input
                              value={editForm.scene_title || ""}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, scene_title: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">場景描述</label>
                            <Textarea
                              value={editForm.scene_description || ""}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, scene_description: e.target.value }))}
                              className="mt-1" rows={3}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">英文 Prompt</label>
                            <Textarea
                              value={editForm.visual_prompt || ""}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, visual_prompt: e.target.value }))}
                              className="mt-1 font-mono text-xs" rows={3}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEditing(index)}>
                              <Check className="h-3 w-3 mr-1" /> 儲存
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditing}>
                              <X className="h-3 w-3 mr-1" /> 取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* 顯示模式 */
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">場景描述</p>
                            <p className="text-sm text-foreground leading-relaxed">{scene.scene_description}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">英文 Prompt</p>
                            <p className="text-xs text-muted-foreground bg-muted/80 p-2.5 rounded-md font-mono leading-relaxed">
                              {scene.visual_prompt}
                            </p>
                          </div>
                          {scene.key_elements?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">關鍵元素</p>
                              <div className="flex flex-wrap gap-1">
                                {scene.key_elements.map((el, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {el}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => startEditing(scene, index)}>
                              <Edit2 className="h-3 w-3 mr-1" /> 編輯
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              onClick={() => onRemoveScene(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> 刪除
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 右側：預覽圖 (1/3) — 嵌在卡片中 */}
                    <div className="lg:col-span-1 flex flex-col">
                      <div className="flex-1 rounded-xl bg-muted/30 border border-border/40 overflow-hidden flex items-center justify-center min-h-[180px] relative group">
                        {isThisGenerating ? (
                          /* 生成中狀態 */
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                              <Wand2 className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-xs">AI 圖片生成中...</p>
                          </div>
                        ) : sceneImage ? (
                          /* 有圖片 */
                          <>
                            <img
                              src={sceneImage}
                              alt={`Scene ${scene.scene_number}`}
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="shadow-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const link = document.createElement('a');
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
                          </>
                        ) : (
                          /* 空白佔位 */
                          <div className="flex flex-col items-center gap-2 text-muted-foreground/50 p-4 text-center">
                            <ImageIcon className="w-8 h-8" />
                            <p className="text-xs">點擊右上生成圖片按鈕</p>
                          </div>
                        )}
                      </div>

                      {/* 場景獨立的生成按鈕 */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => handleGenerateScene(index)}
                        disabled={isGenerating}
                      >
                        {isThisGenerating ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> 生成中...</>
                        ) : (
                          <><Wand2 className="h-3.5 w-3.5 mr-1.5" /> 生成此場景</>
                        )}
                      </Button>
                    </div>

                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
