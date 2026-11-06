import React, { useState } from "react";
import { PlugZap } from "@/components/icons/lucideContent";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldClass = "grid content-start gap-1.5 text-sm font-medium";

/** Dialog body for creating or editing a text (LLM) model; mounted fresh for each opening. */
export default function LlmModelForm({ model, onSubmit, onTestDraft, onCancel }) {
  const [form, setForm] = useState(() => ({
    label: model?.label ?? "", modelName: model?.modelName ?? "", endpoint: model?.endpoint ?? "", apiKey: "",
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState(null);
  const isEditing = Boolean(model);
  const title = isEditing ? "編輯文字模型" : "新增文字模型";
  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setTestResult(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || "文字模型儲存失敗");
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTestDraft(form);
      setTestResult(result?.success
        ? { ok: true, text: `連線成功，耗時 ${result.latencyMs} ms` }
        : { ok: false, text: result?.message || "連線測試失敗" });
    } catch (testError) {
      setTestResult({ ok: false, text: testError.message || "連線測試失敗" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={title} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Azure OpenAI 部署。端點與金鑰加密存放，金鑰儲存後不會再顯示。</DialogDescription>
      </DialogHeader>
      <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>名稱
          <Input required value={form.label} onChange={(event) => updateField("label", event.target.value)} />
        </label>
        <label className={fieldClass}>模型／部署名稱
          <Input required className="font-mono" value={form.modelName} onChange={(event) => updateField("modelName", event.target.value)} />
        </label>
        <label className={cn(fieldClass, "sm:col-span-2")}>Azure OpenAI 端點
          <Input required type="url" className="font-mono" placeholder="https://<resource>.openai.azure.com"
            value={form.endpoint} onChange={(event) => updateField("endpoint", event.target.value)} />
        </label>
        <label className={cn(fieldClass, "sm:col-span-2")}>{isEditing ? "替換 API 金鑰" : "API 金鑰"}
          <Input required={!isEditing} type="password" autoComplete="new-password"
            placeholder={isEditing ? "留空則保留原金鑰" : undefined}
            value={form.apiKey} onChange={(event) => updateField("apiKey", event.target.value)} />
        </label>
      </fieldset>
      {testResult && (
        <p role={testResult.ok ? "status" : "alert"} className={cn("text-sm tabular-nums", testResult.ok ? "text-success" : "text-destructive")}>
          {testResult.text}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" disabled={isTesting || !form.apiKey || !form.endpoint || !form.modelName} onClick={handleTest}
          title={form.apiKey ? undefined : "輸入 API 金鑰後才能測試未儲存的設定"}>
          {isTesting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
          測試連線
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? "儲存中…" : "儲存文字模型"}</Button>
        </div>
      </DialogFooter>
    </form>
  );
}
