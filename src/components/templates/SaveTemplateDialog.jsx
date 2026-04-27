import React, { useState } from "react";
import { FileText, Loader2, Palette, Save, Tag, X } from "lucide-react";

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
        <div className="rounded-xl border border-border bg-secondary shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary text-white">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" aria-hidden="true" />
                    <span className="text-sm font-bold">儲存為範本</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label="關閉範本儲存表單"
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>

            {/* Form */}
            <div className="px-4 py-3 space-y-3">
                {/* 快照預覽 */}
                <div className="bg-muted/50 border border-border/60 rounded-lg px-3 py-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        範本內容預覽
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                        {userScript || "(無內容文字)"}
                    </p>
                    {stylePrompt && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                            <Palette className="h-3 w-3" aria-hidden="true" />
                            含風格設定
                        </p>
                    )}
                </div>

                {/* 名稱 */}
                <div className="space-y-1">
                    <label htmlFor="template-name" className="text-xs font-medium text-foreground">
                        範本名稱 <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="template-name"
                        name="template-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例：公司季報風格 / 產品介紹範本"
                        autoComplete="off"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                {/* 描述 */}
                <div className="space-y-1">
                    <label htmlFor="template-description" className="text-xs font-medium text-foreground">
                        描述（選填）
                    </label>
                    <input
                        id="template-description"
                        name="template-description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="簡短描述此範本的用途"
                        autoComplete="off"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                {/* 標籤 */}
                <div className="space-y-1">
                    <label htmlFor="template-tags" className="text-xs font-medium text-foreground flex items-center gap-1">
                        <Tag className="w-3 h-3" aria-hidden="true" />
                        標籤（選填，以逗號分隔）
                    </label>
                    <input
                        id="template-tags"
                        name="template-tags"
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="例：行銷, 季報, 藍色風格"
                        autoComplete="off"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                {/* 錯誤訊息 */}
                {error && (
                    <p className="text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-lg" role="alert">
                        {error}
                    </p>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-background/60">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] motion-reduce:transform-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            儲存中…
                        </>
                    ) : (
                        <>
                            <Save className="w-3.5 h-3.5" aria-hidden="true" />
                            儲存範本
                        </>
                    )}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    取消
                </button>
            </div>
        </div>
    );
}
