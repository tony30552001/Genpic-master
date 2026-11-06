import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

const toForm = (model, apiTypes) => model ? {
  modelKey: model.modelKey, label: model.label, apiType: model.apiType,
  deploymentName: model.deploymentName, endpoint: model.endpoint,
  supportedQualities: [...model.supportedQualities], defaultQuality: model.defaultQuality, apiKey: "",
} : {
  modelKey: "", label: "", apiType: apiTypes[0]?.id || "", deploymentName: "", endpoint: "",
  apiKey: "", supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
};

const fieldClass = "grid content-start gap-1.5 text-sm font-medium";

/** Dialog body for creating or editing an image model; mounted fresh for each opening. */
export default function ImageModelForm({ model, catalog, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toForm(model, catalog.apiTypes));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(model);
  const title = isEditing ? "編輯圖片模型" : "新增圖片模型";
  const updateField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const toggleQuality = (quality, checked) => setForm((previous) => {
    const supportedQualities = checked
      ? catalog.qualities.filter((value) => value === quality || previous.supportedQualities.includes(value))
      : previous.supportedQualities.filter((value) => value !== quality);
    return {
      ...previous,
      supportedQualities,
      defaultQuality: supportedQualities.includes(previous.defaultQuality) ? previous.defaultQuality : "",
    };
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.supportedQualities.length || !form.supportedQualities.includes(form.defaultQuality)) {
      setError("請至少選擇一種支援品質，並從中選擇預設品質。");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || "圖片模型儲存失敗，請修正設定後重試。");
      setForm((previous) => ({ ...previous, apiKey: "" }));
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={title} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription id="image-model-identity-help">
          Azure OpenAI Images v1 相容部署。模型識別碼、API 類型及部署名稱建立後不可變更。
        </DialogDescription>
      </DialogHeader>
      <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>模型識別碼
          <Input required pattern="[a-z0-9][a-z0-9._\-]*" title="使用小寫英數字、句點、底線或連字號，以英數字開頭。" maxLength={128}
            readOnly={isEditing} aria-describedby="image-model-identity-help" className="font-mono"
            value={form.modelKey} onChange={(event) => updateField("modelKey", event.target.value)} />
        </label>
        <label className={fieldClass}>顯示名稱
          <Input required pattern=".*\S.*" maxLength={128} value={form.label} onChange={(event) => updateField("label", event.target.value)} />
        </label>
        <label className={fieldClass}>API 類型
          <SelectField required disabled={isEditing} value={form.apiType} onValueChange={(value) => updateField("apiType", value)}
            options={catalog.apiTypes.map((type) => ({ value: type.id, label: type.label }))} />
        </label>
        <label className={fieldClass}>部署名稱
          <Input required pattern=".*\S.*" maxLength={128} readOnly={isEditing} aria-describedby="image-model-identity-help" className="font-mono"
            value={form.deploymentName} onChange={(event) => updateField("deploymentName", event.target.value)} />
        </label>
        <label className={cn(fieldClass, "sm:col-span-2")}>Azure HTTPS 端點
          <Input required type="url" className="font-mono" value={form.endpoint} onChange={(event) => updateField("endpoint", event.target.value)} />
        </label>
        <div className="grid gap-1.5 sm:col-span-2">
          <label className={fieldClass}>{isEditing ? "替換 API 金鑰" : "API 金鑰"}
            <Input required={!isEditing} type="password" autoComplete="new-password" aria-describedby="image-model-key-help"
              placeholder={isEditing ? "留空則保留原金鑰" : undefined}
              value={form.apiKey} onChange={(event) => updateField("apiKey", event.target.value)} />
          </label>
          <p id="image-model-key-help" className="text-xs text-muted-foreground">金鑰加密保存且不會回傳。</p>
        </div>
        <fieldset className="grid gap-1.5 sm:col-span-2" aria-describedby="image-model-quality-help">
          <legend className="mb-1.5 text-sm font-medium">支援品質</legend>
          <div className="flex flex-wrap gap-x-4">
            {catalog.qualities.map((quality) => (
              <label key={quality} className="flex min-h-9 items-center gap-2 font-mono text-sm">
                <input type="checkbox" checked={form.supportedQualities.includes(quality)}
                  className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => toggleQuality(quality, event.target.checked)} />
                {quality}
              </label>
            ))}
          </div>
          <p id="image-model-quality-help" className={cn("text-xs", form.supportedQualities.length ? "text-muted-foreground" : "text-destructive")}>
            至少選擇一種，並依實際部署能力設定；較高品質可能增加費用。
          </p>
        </fieldset>
        <label className={fieldClass}>預設品質
          <SelectField required value={form.defaultQuality} onValueChange={(value) => updateField("defaultQuality", value)}
            placeholder="請選擇支援的品質" options={form.supportedQualities.map((quality) => ({ value: quality, label: quality }))} />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? "儲存中…" : "儲存圖片模型"}</Button>
      </DialogFooter>
    </form>
  );
}
