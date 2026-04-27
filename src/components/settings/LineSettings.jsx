/**
 * LineSettings.jsx
 *
 * LINE Official Account binding settings UI.
 * Allows users to:
 * - Enter and verify their Channel Access Token
 * - Configure a default target (group/user)
 * - Enable/disable or remove the binding
 */

import React, { useState } from "react";
import {
    CheckCircle,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Eye,
    EyeOff,
    HelpCircle,
    Info,
    Loader2,
    MessageSquare,
    ShieldCheck,
    Trash2,
    XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Small reusable field component ───────────────────────────────────────
function Field({ id, label, hint, children }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

const LINE_BRAND_COLOR = "#06C755";

// ─── Main component ────────────────────────────────────────────────────────
export default function LineSettings({ useLineConfigHook }) {
    const {
        config,
        isBound,
        isLoading,
        isSaving,
        saveConfig,
        deleteConfig,
        verifyToken,
    } = useLineConfigHook;

    const [showForm, setShowForm] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [form, setForm] = useState({
        channelAccessToken: "",
        channelSecret: "",
        channelName: "",
        targetId: "",
        targetType: "group",
    });
    const [verifyState, setVerifyState] = useState(null); // null | "verifying" | { valid, channelName, message }
    const [toast, setToast] = useState(null);
    const [showIdHelp, setShowIdHelp] = useState(false);

    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleVerify = async () => {
        if (!form.channelAccessToken.trim() || form.channelAccessToken === "********") return;
        setVerifyState("verifying");
        try {
            const result = await verifyToken(form.channelAccessToken.trim());
            setVerifyState(result);
            if (result.valid && result.channelName) {
                setForm((prev) => ({ ...prev, channelName: result.channelName }));
            }
        } catch {
            setVerifyState({ valid: false, message: "驗證請求失敗" });
        }
    };

    const handleSave = async () => {
        try {
            await saveConfig({
                channelAccessToken: form.channelAccessToken.trim(),
                channelSecret: form.channelSecret.trim() || undefined,
                channelName: form.channelName.trim() || undefined,
                targetId: form.targetId.trim() || undefined,
                targetType: form.targetType,
            });
            setShowForm(false);
            showToast("LINE 官方帳號設定已儲存！");
        } catch (err) {
            showToast(err.message || "儲存失敗", "error");
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("確定要解除 LINE 官方帳號綁定嗎？")) return;
        try {
            await deleteConfig();
            setForm({ channelAccessToken: "", channelSecret: "", channelName: "", targetId: "", targetType: "group" });
            setVerifyState(null);
            setShowForm(false);
            showToast("已解除 LINE 官方帳號綁定");
        } catch (err) {
            showToast(err.message || "解除失敗", "error");
        }
    };

    return (
        <Card className="border-border/60">
            <CardContent className="p-5 space-y-4">
                {/* ── Section Header ──────────────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${LINE_BRAND_COLOR}1A` }}>
                            <MessageSquare className="w-4 h-4" style={{ color: LINE_BRAND_COLOR }} aria-hidden="true" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">LINE 官方帳號</h3>
                            <p className="text-xs text-muted-foreground">
                                綁定後可直接以官方帳號名義推送圖片
                            </p>
                        </div>
                    </div>
                    {isBound && (
                        <Badge style={{ backgroundColor: `${LINE_BRAND_COLOR}1A`, borderColor: `${LINE_BRAND_COLOR}33`, color: LINE_BRAND_COLOR }}>
                            已綁定
                        </Badge>
                    )}
                </div>

                {/* ── Bound: current config summary ──────────────────────── */}
                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> 載入中…
                    </div>
                )}

                {!isLoading && isBound && !showForm && (
                    <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: `${LINE_BRAND_COLOR}0D`, border: `1px solid ${LINE_BRAND_COLOR}33` }}>
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: LINE_BRAND_COLOR }} aria-hidden="true" />
                            <div className="text-sm space-y-0.5 min-w-0">
                                <p className="font-medium text-foreground">
                                    {config.channelName || "LINE 官方帳號"}
                                </p>
                                {config.targetId && (
                                    <p className="text-xs text-muted-foreground truncate">
                                        目標：{config.targetId} ({config.targetType})
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    if (config) {
                                        setForm({
                                            channelAccessToken: "********",
                                            channelSecret: config.channelSecret ? "********" : "",
                                            channelName: config.channelName || "",
                                            targetId: config.targetId || "",
                                            targetType: config.targetType || "group",
                                        });
                                    }
                                    setShowForm(true);
                                }}
                                className="flex-1"
                            >
                                修改設定
                            </Button>
                             <Button
                                 size="sm"
                                 variant="ghost"
                                 className="text-destructive hover:text-destructive"
                                 disabled={isSaving}
                                 onClick={handleDelete}
                                 aria-label="解除 LINE 官方帳號綁定"
                             >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                             </Button>
                        </div>
                    </div>
                )}

                {/* ── Form: add or edit ───────────────────────────────────── */}
                {(!isBound || showForm) && !isLoading && (
                    <div className="space-y-4">
                        {/* Token input */}
                        <Field
                            id="line-channel-access-token"
                            label="Channel Access Token"
                            hint="在 LINE Developers Console → Messaging API → Channel access token 取得"
                        >
                            <div className="relative">
                                <input
                                    id="line-channel-access-token"
                                    name="line-channel-access-token"
                                    type={showToken ? "text" : "password"}
                                    value={form.channelAccessToken}
                                    onChange={(e) => {
                                        setForm((p) => ({ ...p, channelAccessToken: e.target.value }));
                                        setVerifyState(null);
                                    }}
                                    placeholder="貼上 Channel Access Token…"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <button
                                    type="button"
                                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => setShowToken((p) => !p)}
                                    aria-label={showToken ? "隱藏 Channel Access Token" : "顯示 Channel Access Token"}
                                >
                                    {showToken ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                                </button>
                            </div>
                            {/* Verify feedback */}
                            {verifyState === "verifying" && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                    <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> 驗證中…
                                </span>
                            )}
                            {verifyState && verifyState !== "verifying" && (
                                <span
                                    className={`flex items-center gap-1 text-xs mt-1 ${verifyState.valid ? "text-success" : "text-destructive"
                                        }`}
                                >
                                    {verifyState.valid ? (
                                        <CheckCircle className="w-3 h-3" aria-hidden="true" />
                                    ) : (
                                        <XCircle className="w-3 h-3" aria-hidden="true" />
                                    )}
                                    {verifyState.valid
                                        ? `驗證成功：${verifyState.channelName}`
                                        : `驗證失敗：${verifyState.message}`}
                                </span>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                className="mt-2"
                                disabled={!form.channelAccessToken.trim() || form.channelAccessToken === "********" || verifyState === "verifying"}
                                onClick={handleVerify}
                            >
                                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                                驗證 Token
                            </Button>
                        </Field>

                        {/* Channel Secret (optional) */}
                        <Field
                            id="line-channel-secret"
                            label="Channel Secret（可選）"
                            hint="用於 Webhook 簽名驗證，非必填"
                        >
                            <input
                                id="line-channel-secret"
                                name="line-channel-secret"
                                type="password"
                                value={form.channelSecret}
                                onChange={(e) => setForm((p) => ({ ...p, channelSecret: e.target.value }))}
                                placeholder="Channel Secret（選填）"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </Field>

                        {/* Default Target ID */}
                        <Field
                            id="line-target-id"
                            label="預設目標 ID"
                            hint="群組 ID 或使用者 ID，留空則每次發送時使用 LIFF 選擇"
                        >
                            <div className="flex gap-2">
                                <input
                                    id="line-target-id"
                                    name="line-target-id"
                                    type="text"
                                    value={form.targetId}
                                    onChange={(e) => setForm((p) => ({ ...p, targetId: e.target.value }))}
                                    placeholder="C… (群組) 或 U… (使用者)"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <select
                                    aria-label="目標類型"
                                    value={form.targetType}
                                    onChange={(e) => setForm((p) => ({ ...p, targetType: e.target.value }))}
                                    className="px-2 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="group">群組</option>
                                    <option value="user">使用者</option>
                                </select>
                            </div>

                            {/* 操作指引 */}
                            <button
                                type="button"
                                onClick={() => setShowIdHelp((p) => !p)}
                                className="flex items-center gap-1 rounded-md text-xs text-primary hover:underline mt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-expanded={showIdHelp}
                            >
                                <HelpCircle className="w-3 h-3" aria-hidden="true" />
                                {showIdHelp ? "收起說明" : "如何取得 ID？"}
                                {showIdHelp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            {showIdHelp && (
                                <div className="mt-2 p-3 bg-muted/50 border border-border/30 rounded-lg text-xs text-muted-foreground space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="font-medium text-foreground">取得群組 ID (Group ID)</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-1">
                                        <li>將你的 LINE 官方帳號（Bot）加入目標群組</li>
                                        <li>在群組中傳送任意訊息</li>
                                        <li>透過 Webhook 接收到的事件中，<code className="px-1 py-0.5 bg-muted rounded text-[11px]">source.groupId</code> 即為群組 ID（以 <strong>C</strong> 開頭）</li>
                                    </ol>
                                    <p className="font-medium text-foreground pt-1">取得使用者 ID (User ID)</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-1">
                                        <li>使用者加入你的官方帳號為好友</li>
                                        <li>使用者傳送任意訊息給官方帳號</li>
                                        <li>透過 Webhook 接收到的事件中，<code className="px-1 py-0.5 bg-muted rounded text-[11px]">source.userId</code> 即為使用者 ID（以 <strong>U</strong> 開頭）</li>
                                    </ol>
                                    <p className="pt-1">
                                        提示：可在{" "}
                                        <a
                                            href="https://developers.line.biz/console/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                        >
                                            LINE Developers Console
                                        </a>
                                        {" "}的 Messaging API 設定中啟用 Webhook 並查看相關資訊。
                                    </p>
                                </div>
                            )}
                        </Field>

                        {/* Info box */}
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/50 rounded-lg border border-border/30">
                            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                            <p className="text-xs text-muted-foreground">
                                Token 將以 AES-256-GCM 加密後存入資料庫，系統不會以明文保存。
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button
                                className="flex-1"
                                disabled={!form.channelAccessToken.trim() || isSaving}
                                onClick={handleSave}
                                style={{ backgroundColor: LINE_BRAND_COLOR, borderColor: LINE_BRAND_COLOR, color: "#fff" }}
                            >
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                                )}
                                {isSaving ? "儲存中…" : "儲存設定"}
                            </Button>
                            {isBound && showForm && (
                                <Button
                                    variant="outline"
                                    onClick={() => setShowForm(false)}
                                >
                                    取消
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Toast ──────────────────────────────────────────────── */}
                {toast && (
                    <div
                        role="status"
                        aria-live="polite"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${toast.type === "error"
                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                            : "bg-success/10 text-success border border-success/20"
                            }`}
                    >
                        {toast.type === "error" ? (
                            <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        )}
                        {toast.message}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
