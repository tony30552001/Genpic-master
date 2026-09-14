import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  createAdminImageModel,
  deleteAdminImageModel,
  listAdminImageModels,
  testAdminImageModel,
  updateAdminImageModel,
} from "../../services/adminService";
import { waitForImageJob } from "../../services/aiService";

const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const emptyForm = () => ({
  modelKey: "", label: "", apiType: "", deploymentName: "", endpoint: "",
  apiKey: "", supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
});

export default function ImageModelSettings({ onCatalogChange }) {
  const [catalog, setCatalog] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testingKey, setTestingKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const testController = useRef(null);

  useEffect(() => {
    let ignore = false;
    void listAdminImageModels().then((data) => {
      if (!ignore) setCatalog(data);
    }).catch((error) => {
      if (!ignore) setErrorMessage(error.message || "圖片模型目錄載入失敗，請重試。");
    }).finally(() => {
      if (!ignore) setIsLoading(false);
    });
    return () => { ignore = true; };
  }, [loadAttempt]);

  useEffect(() => () => testController.current?.abort(), []);

  const openForm = (model) => {
    setEditingKey(model?.modelKey ?? null);
    setForm(model ? {
      modelKey: model.modelKey, label: model.label, apiType: model.apiType,
      deploymentName: model.deploymentName, endpoint: model.endpoint,
      supportedQualities: [...model.supportedQualities],
      defaultQuality: model.defaultQuality, apiKey: "",
    } : { ...emptyForm(), apiType: catalog.apiTypes[0]?.id || "" });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const updateField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const refreshMetadata = async () => {
    try {
      await onCatalogChange();
    } catch (error) {
      setErrorMessage(`目錄已儲存，但政策或使用者資料重新載入失敗：${error.message}。請重新整理頁面以取得最新設定。`);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.supportedQualities.length || !form.supportedQualities.includes(form.defaultQuality)) {
      setErrorMessage("請至少選擇一種支援品質，並從中選擇預設品質。");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        ...form,
        modelKey: form.modelKey.trim(), label: form.label.trim(),
        deploymentName: form.deploymentName.trim(), endpoint: form.endpoint.trim(),
      };
      const data = editingKey
        ? await updateAdminImageModel(editingKey, payload)
        : await createAdminImageModel(payload);
      setCatalog(data);
      setForm(null);
      setSuccessMessage(editingKey ? "圖片模型已更新。" : "圖片模型已新增；開放清單與預設模型未變更。");
      await refreshMetadata();
    } catch (error) {
      setErrorMessage(error.message || "圖片模型儲存失敗，請修正設定後重試。");
      setForm((previous) => ({ ...previous, apiKey: "" }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (model) => {
    if (!window.confirm(`確定刪除「${model.label}」？請先移除政策引用，並等待在途工作完成。`)) return;
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      setCatalog(await deleteAdminImageModel(model.modelKey));
      setSuccessMessage(`已刪除「${model.label}」。`);
      await refreshMetadata();
    } catch (error) {
      setErrorMessage(error.message || "刪除失敗，請確認政策引用與在途工作後重試。");
    } finally {
      setIsSaving(false);
    }
  };

  const stopWaiting = () => {
    testController.current?.abort();
    testController.current = null;
    setTestingKey("");
    setSuccessMessage("已停止等待；遠端工作未取消，仍可能產生費用。");
  };

  const runTest = async (model) => {
    if (!window.confirm(`以 low 品質測試「${model.label}」會產生 Azure 費用。確定送出生成測試？`)) return;
    const controller = new AbortController();
    testController.current = controller;
    setTestingKey(model.modelKey);
    setErrorMessage("");
    setSuccessMessage("正在提交付費生成測試…");
    try {
      const queued = await testAdminImageModel({ modelKey: model.modelKey }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!queued?.jobId) throw new Error("伺服器未回傳測試工作識別碼");
      setSuccessMessage(`測試已排入佇列（${queued.jobId}），正在等待生成結果…`);
      await waitForImageJob({ jobId: queued.jobId, signal: controller.signal });
      if (!controller.signal.aborted) {
        setSuccessMessage(`「${model.label}」low 品質生成測試成功；尚未驗證其他品質或圖片編輯能力。`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSuccessMessage("");
        setErrorMessage(`生成測試失敗：${error.message || "請檢查設定後重試"}。重新測試會另行產生費用。`);
      }
    } finally {
      if (!controller.signal.aborted) {
        testController.current = null;
        setTestingKey("");
      }
    }
  };

  const busy = isSaving || Boolean(testingKey);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">圖片模型目錄</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">登錄相容的 Azure OpenAI Images v1 部署，再於下方政策中明確開放及選擇預設模型。新增目錄項目不會變更政策。</p>
        {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
        {successMessage && <p role="status" className="text-sm text-primary">{successMessage}</p>}
        {isLoading ? <p role="status">載入圖片模型目錄…</p> : !catalog ? (
          <Button variant="outline" onClick={() => {
            setIsLoading(true);
            setErrorMessage("");
            setLoadAttempt((previous) => previous + 1);
          }}>重新載入圖片模型目錄</Button>
        ) : (
          <>
            {catalog.models.length === 0 && <p role="status">尚未設定圖片模型，請先新增模型連線。</p>}
            <Button type="button" onClick={() => openForm()} disabled={busy || Boolean(form)}>新增圖片模型</Button>
            {form && (
              <form onSubmit={handleSubmit} aria-label={editingKey ? "編輯圖片模型" : "新增圖片模型"} className="space-y-4 rounded-xl border border-border p-4">
                <fieldset disabled={isSaving} className="space-y-4">
                  <legend className="mb-3 font-semibold">{editingKey ? "編輯圖片模型" : "新增圖片模型"}</legend>
                  <p id="image-model-identity-help" className="text-sm text-muted-foreground">模型識別碼、API 類型及部署名稱建立後不可變更；改用其他部署請新增項目。</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">模型識別碼
                      <input required pattern="[a-z0-9][a-z0-9._\-]*" title="使用小寫英數字、句點、底線或連字號，以英數字開頭。" maxLength={128} readOnly={Boolean(editingKey)} aria-describedby="image-model-identity-help" className={inputClass} value={form.modelKey} onChange={(event) => updateField("modelKey", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">顯示名稱
                      <input required pattern=".*\S.*" maxLength={128} className={inputClass} value={form.label} onChange={(event) => updateField("label", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">API 類型
                      <select required disabled={Boolean(editingKey)} className={inputClass} value={form.apiType} onChange={(event) => updateField("apiType", event.target.value)}>
                        {catalog.apiTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">部署名稱
                      <input required pattern=".*\S.*" maxLength={128} readOnly={Boolean(editingKey)} aria-describedby="image-model-identity-help" className={inputClass} value={form.deploymentName} onChange={(event) => updateField("deploymentName", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">Azure HTTPS 端點
                      <input required type="url" className={inputClass} value={form.endpoint} onChange={(event) => updateField("endpoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">{editingKey ? "替換 API 金鑰" : "API 金鑰"}
                      <input required={!editingKey} type="password" autoComplete="new-password" aria-describedby="image-model-key-help" className={inputClass} value={form.apiKey} onChange={(event) => updateField("apiKey", event.target.value)} />
                    </label>
                  </div>
                  <p id="image-model-key-help" className="text-sm text-muted-foreground">金鑰加密保存且不會回傳。編輯時留空會保留原金鑰。</p>
                  <fieldset aria-describedby="image-model-quality-help">
                    <legend className="mb-2 text-sm font-semibold">支援品質</legend>
                    <div className="flex flex-wrap gap-4">
                      {catalog.qualities.map((quality) => (
                        <label key={quality} className="flex min-h-10 items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.supportedQualities.includes(quality)}
                            className="accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(event) => {
                              const selected = event.target.checked
                                ? catalog.qualities.filter((value) => value === quality || form.supportedQualities.includes(value))
                                : form.supportedQualities.filter((value) => value !== quality);
                              setForm((previous) => ({ ...previous, supportedQualities: selected, defaultQuality: selected.includes(previous.defaultQuality) ? previous.defaultQuality : "" }));
                            }} />
                          {quality}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p id="image-model-quality-help" className={cn("text-sm", form.supportedQualities.length ? "text-muted-foreground" : "text-destructive")}>至少選擇一種，並依實際部署能力設定；較高品質可能增加費用。</p>
                  <label className="block space-y-1 text-sm">預設品質
                    <select required className={inputClass} value={form.defaultQuality} onChange={(event) => updateField("defaultQuality", event.target.value)}>
                      <option value="">請選擇支援的品質</option>
                      {form.supportedQualities.map((quality) => <option key={quality} value={quality}>{quality}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">{isSaving ? "儲存中…" : "儲存圖片模型"}</Button>
                    <Button type="button" variant="outline" onClick={() => { setForm(null); setEditingKey(null); }}>取消編輯</Button>
                  </div>
                </fieldset>
              </form>
            )}
            <ul className="space-y-3">
              {catalog.models.map((model) => (
                <li key={model.modelKey} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                    <h3 className="font-semibold">{model.label}</h3>
                    <p className="text-sm text-muted-foreground">{model.modelKey} · {model.deploymentName}</p>
                    <p className="text-sm">{catalog.apiTypes.find((type) => type.id === model.apiType)?.label || model.apiType}</p>
                    <p className="text-sm text-muted-foreground">{model.endpoint}</p>
                    <p className="text-sm">支援品質：{model.supportedQualities.join("、")}；預設：{model.defaultQuality}</p>
                    <p className="text-sm">{model.hasApiKey ? "API 金鑰已設定" : "尚未設定 API 金鑰"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={busy || Boolean(form)} aria-label={`編輯 ${model.label}`} onClick={() => openForm(model)}>編輯</Button>
                    <Button type="button" variant="destructive" disabled={busy || Boolean(form)} aria-label={`刪除 ${model.label}`} onClick={() => handleDelete(model)}>刪除</Button>
                    <Button type="button" variant="outline" disabled={busy || Boolean(form) || !model.supportedQualities.includes("low")} aria-label={`付費生成測試 ${model.label}`} onClick={() => runTest(model)}>付費生成測試</Button>
                  </div>
                  {!model.supportedQualities.includes("low") && <p className="text-sm text-muted-foreground">此模型未設定支援 low 品質，無法執行低品質測試。</p>}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">生成測試僅使用已儲存設定及 low 品質，會產生 Azure 費用；儲存或切換設定不會自動測試。</p>
            {testingKey && <Button type="button" variant="outline" onClick={stopWaiting}>停止等待測試</Button>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
