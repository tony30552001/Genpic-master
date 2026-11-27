import React, { useState } from "react";
import { PlugZap } from "@/components/icons/lucideContent";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { DEFAULT_SPEECH_VOICES } from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";

const fieldClass = "grid content-start gap-1.5 text-sm font-medium";

/** Dialog body for creating or editing the tenant Azure AI Speech connection; mounted fresh per opening. */
export default function SpeechModelForm({ settings, onSubmit, onTestDraft, onCancel }) {
  const voices = settings?.speechVoices?.length ? settings.speechVoices : DEFAULT_SPEECH_VOICES;
  const isEditing = Boolean(settings?.speechRegion || settings?.speechEndpoint || settings?.hasSpeechKey);
  const [form, setForm] = useState(() => ({
    speechRegion: settings?.speechRegion || "",
    speechEndpoint: settings?.speechEndpoint || "",
    speechApiKey: "",
    speechDefaultVoice: settings?.speechDefaultVoice || voices[0].id,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState(null);

  const title = isEditing ? "編輯語音模型" : "新增語音模型";
  const hasKey = Boolean(form.speechApiKey.trim() || settings?.hasSpeechKey);
  const hasLocation = Boolean(form.speechRegion.trim() || form.speechEndpoint.trim());
  const canTest = hasKey && hasLocation;

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setTestResult(null);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasLocation) {
      setError("請填寫 Azure 區域或自訂端點。");
      return;
    }
    if (!hasKey) {
      setError("請填寫 Azure Speech API 金鑰。");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onSubmit(form, isEditing);
    } catch (submitError) {
      setError(submitError.message || "語音模型儲存失敗");
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTestDraft({
        speechRegion: form.speechRegion.trim() || null,
        speechEndpoint: form.speechEndpoint.trim() || null,
        voice: form.speechDefaultVoice,
        ...(form.speechApiKey.trim() ? { speechApiKey: form.speechApiKey.trim() } : {}),
      });
      setTestResult({
        ok: true,
        text: `連線成功（${result.voice}，${result.durationSeconds} 秒，${result.cueCount} 句時間軸）`,
      });
    } catch (testError) {
      setTestResult({ ok: false, text: testError.message || "語音連線測試失敗" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={title} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Azure AI Speech 語音合成，用於影片分鏡中文旁白與字幕對齊。金鑰加密存放，儲存後不會再顯示。</DialogDescription>
      </DialogHeader>
      <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>
          Azure 區域（Region）
          <Input
            className="font-mono"
            placeholder="例如：eastasia"
            maxLength={64}
            value={form.speechRegion}
            onChange={(event) => updateField("speechRegion", event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          預設旁白語音
          <SelectField
            aria-label="預設旁白語音"
            className="h-9 min-w-0 text-sm"
            value={form.speechDefaultVoice}
            onValueChange={(value) => updateField("speechDefaultVoice", value)}
            options={voices.map((voice) => ({ value: voice.id, label: voice.label }))}
          />
        </label>
        <label className={cn(fieldClass, "sm:col-span-2")}>
          {settings?.hasSpeechKey ? "替換 API 金鑰" : "API 金鑰"}
          <Input
            required={!settings?.hasSpeechKey}
            type="password"
            autoComplete="new-password"
            maxLength={256}
            placeholder={settings?.hasSpeechKey ? "已設定金鑰；留空則保留原金鑰" : "請輸入 Azure Speech 金鑰"}
            value={form.speechApiKey}
            onChange={(event) => updateField("speechApiKey", event.target.value)}
          />
        </label>
        <label className={cn(fieldClass, "sm:col-span-2")}>
          自訂端點（選填）
          <Input
            type="url"
            className="font-mono"
            placeholder="留空則依區域自動連線"
            maxLength={512}
            value={form.speechEndpoint}
            onChange={(event) => updateField("speechEndpoint", event.target.value)}
          />
        </label>
      </fieldset>
      {testResult && (
        <p role={testResult.ok ? "status" : "alert"} className={cn("text-sm tabular-nums", testResult.ok ? "text-success" : "text-destructive")}>
          {testResult.text}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={isTesting || !canTest}
          onClick={handleTest}
          title={canTest ? undefined : "填寫區域或端點與 API 金鑰後即可測試連線"}
        >
          {isTesting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
          測試連線
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? "儲存中…" : "儲存語音模型"}</Button>
        </div>
      </DialogFooter>
    </form>
  );
}
