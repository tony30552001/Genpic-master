import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";

const fieldClass = "grid content-start gap-1.5 text-sm font-medium";

const initialForm = (model, families) => model ? {
  modelKey: model.modelKey,
  label: model.label,
  family: model.family,
  endpoint: model.endpoint,
  deploymentName: model.deploymentName,
  maxDurationSeconds: String(model.maxDurationSeconds),
  maxResolution: model.maxResolution || "1080P",
  allowAudio: Boolean(model.allowAudio),
  pricePerSecondUsd: String(model.pricePerSecondUsd ?? ""),
  apiKey: "",
} : {
  modelKey: "",
  label: "",
  family: families[0]?.id || "",
  endpoint: "",
  deploymentName: "",
  maxDurationSeconds: "5",
  maxResolution: "768P",
  allowAudio: false,
  pricePerSecondUsd: "",
  apiKey: "",
};

export default function VideoModelForm({ model, catalog, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initialForm(model, catalog.families));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const family = useMemo(
    () => catalog.families.find((item) => item.id === form.family) || catalog.families[0],
    [catalog.families, form.family]
  );
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await onSubmit({
        ...form,
        maxDurationSeconds: Number(form.maxDurationSeconds),
        pricePerSecondUsd: form.pricePerSecondUsd === "" ? null : Number(form.pricePerSecondUsd),
        maxResolution: family?.supportsAudioToggle ? null : form.maxResolution,
      });
    } catch (caught) {
      setError(caught.message || "影片模型儲存失敗");
      setForm((current) => ({ ...current, apiKey: "" }));
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" aria-label={model ? "編輯影片模型" : "新增影片模型"}>
      <DialogHeader>
        <DialogTitle>{model ? "編輯影片模型" : "新增影片模型"}</DialogTitle>
        <DialogDescription>
          Microsoft Foundry fal 影片部署。資料會送至 fal；金鑰加密保存且不會回傳。
        </DialogDescription>
      </DialogHeader>
      <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>模型識別碼
          <Input required pattern="[a-z0-9][a-z0-9._\-]*" maxLength={128} readOnly={Boolean(model)} value={form.modelKey} onChange={(event) => update("modelKey", event.target.value)} className="font-mono" />
        </label>
        <label className={fieldClass}>顯示名稱
          <Input required maxLength={128} value={form.label} onChange={(event) => update("label", event.target.value)} />
        </label>
        <label className={fieldClass}>模型家族
          <SelectField required disabled={Boolean(model)} value={form.family} onValueChange={(value) => update("family", value)} options={catalog.families.map((item) => ({ value: item.id, label: item.label }))} />
        </label>
        <label className={fieldClass}>部署名稱
          <Input required maxLength={128} readOnly={Boolean(model)} value={form.deploymentName} onChange={(event) => update("deploymentName", event.target.value)} className="font-mono" />
        </label>
        <label className={`${fieldClass} sm:col-span-2`}>Foundry 端點
          <Input required type="url" value={form.endpoint} onChange={(event) => update("endpoint", event.target.value)} placeholder="https://resource.services.ai.azure.com/providers/falai/v1" className="font-mono" />
        </label>
        <label className={`${fieldClass} sm:col-span-2`}>{model ? "替換 API 金鑰" : "API 金鑰"}
          <Input required={!model} type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder={model ? "留空則保留原金鑰" : undefined} />
        </label>
        <label className={fieldClass}>每支最長秒數
          <Input required type="number" min={family?.minDuration || 1} max={family?.maxDuration || 15} value={form.maxDurationSeconds} onChange={(event) => update("maxDurationSeconds", event.target.value)} />
        </label>
        <label className={fieldClass}>每秒單價（美元）
          <Input type="number" min="0" max="999999.999999" step="0.000001" value={form.pricePerSecondUsd} onChange={(event) => update("pricePerSecondUsd", event.target.value)} placeholder="留空表示未定價" />
        </label>
        {!family?.supportsAudioToggle && (
          <label className={fieldClass}>最高解析度
            <SelectField required value={form.maxResolution} onValueChange={(value) => update("maxResolution", value)} options={(family?.resolutions || []).map((value) => ({ value, label: value }))} />
          </label>
        )}
        {family?.supportsAudioToggle && (
          <label className="flex min-h-10 items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={form.allowAudio} onChange={(event) => update("allowAudio", event.target.checked)} className="size-4 accent-primary" />
            開放音訊生成
          </label>
        )}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? "儲存中…" : "儲存影片模型"}</Button>
      </DialogFooter>
    </form>
  );
}
