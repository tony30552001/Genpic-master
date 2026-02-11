import { useState } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  Image as ImageIcon, 
  Edit2, 
  Trash2, 
  Plus,
  Users,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * 文件場景列表元件
 * 顯示分析後的分鏡腳本，支援編輯與批次生成
 * @param {Object} props
 * @param {Object} props.documentResult - 分析結果
 * @param {Function} props.onUpdateScene - 更新場景的回調
 * @param {Function} props.onRemoveScene - 刪除場景的回調
 * @param {Function} props.onGenerateScene - 生成單個場景圖片的回調
 * @param {Function} props.onGenerateAll - 批次生成所有場景的回調
 * @param {Function} props.onClear - 清除分析結果的回調
 * @param {boolean} props.isGenerating - 是否正在生成圖片
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

  if (!documentResult || !documentResult.scenes) {
    return null;
  }

  const { title, summary, scenes, characters, total_scenes, estimated_generation_time } = documentResult;

  const toggleScene = (index) => {
    setExpandedScenes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
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

  return (
    <div className="space-y-4">
      {/* 文件資訊摘要 */}
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {title}
              </h3>
              <p className="text-sm text-indigo-700 mt-1">{summary}</p>
              
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="secondary" className="bg-white/70">
                  {total_scenes} 個場景
                </Badge>
                <Badge variant="secondary" className="bg-white/70">
                  預估生成時間: {Math.ceil(estimated_generation_time / 60)} 分鐘
                </Badge>
                {characters?.length > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {characters.length} 個角色
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                disabled={isGenerating}
              >
                清除
              </Button>
              <Button
                size="sm"
                onClick={onGenerateAll}
                disabled={isGenerating}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                {isGenerating ? "生成中..." : "批次生成所有圖片"}
              </Button>
            </div>
          </div>

          {/* 角色一覽 */}
          {characters?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-indigo-200/50">
              <p className="text-xs font-medium text-indigo-600 mb-2">角色設定：</p>
              <div className="flex flex-wrap gap-2">
                {characters.map((char, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs bg-white/50">
                    {char.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 場景列表 */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-3 pr-4">
          {scenes.map((scene, index) => (
            <Card key={index} className="overflow-hidden">
              {/* 場景標題列 */}
              <CardHeader 
                className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleScene(index)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">
                      {scene.scene_number}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">
                        {scene.scene_title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {scene.mood}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateScene(index);
                      }}
                      disabled={isGenerating}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    {expandedScenes.has(index) ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* 場景詳細內容 */}
              {expandedScenes.has(index) && (
                <CardContent className="p-3 pt-0 border-t">
                  {editingScene === index ? (
                    // 編輯模式
                    <div className="space-y-3 py-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700">場景標題</label>
                        <Input
                          value={editForm.scene_title || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, scene_title: e.target.value }))
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">場景描述</label>
                        <Textarea
                          value={editForm.scene_description || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, scene_description: e.target.value }))
                          }
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">英文 Prompt</label>
                        <Textarea
                          value={editForm.visual_prompt || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, visual_prompt: e.target.value }))
                          }
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEditing(index)}>
                          儲存
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditing}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // 顯示模式
                    <div className="space-y-3 py-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">場景描述</p>
                        <p className="text-sm text-gray-700">{scene.scene_description}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">英文 Prompt</p>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded font-mono text-xs">
                          {scene.visual_prompt}
                        </p>
                      </div>

                      {scene.key_elements?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">關鍵元素</p>
                          <div className="flex flex-wrap gap-1">
                            {scene.key_elements.map((element, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {element}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(scene, index)}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          編輯
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRemoveScene(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          刪除
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
