import React, { useState } from "react";
import { FileText, Loader2, Save, Tag, X } from "lucide-react";

/**
 * SaveTemplateDialog — 儲存範本的內嵌表單
 * 讓使用者輸入名稱、描述和標籤以將當前設定存為範本
 */
export default function SaveTemplateDialog({
    userScript,
    stylePrompt,
    styleId,
    onSave,
    onClose,
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [tags, setTags] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async () => {
        if (!name.trim()) {
            setError("請輸入範本名稱");
            return;
        }
        setError("");
        setIsSaving(true);
        try {
            await onSave({
                name: name.trim(),
                description: description.trim() || null,
                userScript: userScript || null,
                stylePrompt: stylePrompt || null,
                styleId: styleId || null,
                tags: tags
                    .split(/[,，]/)
                    .map((t) => t.trim())
                    .filter(Boolean),
            });
            onClose();
        } catch (err) {
            setError(err.message || "儲存失敗");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-white shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm font-bold">儲存為範本</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Form */}
            <div className="px-4 py-3 space-y-3">
                {/* 快照預覽 */}
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        範本內容預覽
                    </p>
                    <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">
                        {userScript || "(無內容文字)"}
                    </p>
                    {stylePrompt && (
                        <p className="text-[11px] text-violet-500 mt-1">
                            🎨 含風格設定
                        </p>
                    )}
                </div>

                {/* 名稱 */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">
                        範本名稱 <span className="text-red-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例：公司季報風格 / 產品介紹範本"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        autoFocus
                    />
                </div>

                {/* 描述 */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">
                        描述（選填）
                    </label>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="簡短描述此範本的用途"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                </div>

                {/* 標籤 */}
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        標籤（選填，以逗號分隔）
                    </label>
                    <input
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="例：行銷, 季報, 藍色風格"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                </div>

                {/* 錯誤訊息 */}
                {error && (
                    <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">
                        {error}
                    </p>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-blue-100 bg-white/60">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            儲存中...
                        </>
                    ) : (
                        <>
                            <Save className="w-3.5 h-3.5" />
                            儲存範本
                        </>
                    )}
                </button>
                <button
                    onClick={onClose}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all"
                >
                    <X className="w-3.5 h-3.5" />
                    取消
                </button>
            </div>
        </div>
    );
}
