import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Loader2, PlugZap, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  assignAdminLlmRole,
  createAdminLlmModel,
  deleteAdminLlmModel,
  listAdminLlmModels,
  testAdminLlmModel,
  updateAdminLlmModel,
} from "../../services/adminService";

const EMPTY_FORM = {
  label: "",
  provider: "azure-openai",
  modelName: "",
  endpoint: "",
  apiKey: "",
};

const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function LlmModelSettings() {
  const [settings, setSettings] = useState({
    models: [],
    assignments: [],
    roles: [],
    providers: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRole, setPendingRole] = useState("");
  const [testingKey, setTestingKey] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await listAdminLlmModels();
      setSettings({
        models: data?.models || [],
        assignments: data?.assignments || [],
        roles: data?.roles || [],
        providers: data?.providers || [],
      });
    } catch (error) {
      setErrorMessage(error.message || "分析模型設定載入失敗");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const providerLabel = useCallback(
    (providerId) =>
      settings.providers.find((provider) => provider.id === providerId)?.label ||
      providerId,
    [settings.providers]
  );

  const selectedProvider = useMemo(
    () => settings.providers.find((provider) => provider.id === form.provider),
    [settings.providers, form.provider]
  );

  const assignmentByRole = useMemo(() => {
    const map = {};
    settings.assignments.forEach((assignment) => {
      map[assignment.role] = assignment;
    });
    return map;
  }, [settings.assignments]);

  const applySettings = (data) => {
    setSettings((previous) => ({
      models: data?.models || previous.models,
      assignments: data?.assignments || previous.assignments,
      roles: data?.roles || previous.roles,
      providers: data?.providers || previous.providers,
    }));
  };

  const openCreateForm = () => {
    setForm({ ...EMPTY_FORM, provider: settings.providers[0]?.id || "azure-openai" });
    setEditingId(null);
    setIsFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const openEditForm = (model) => {
    setForm({
      label: model.label,
      provider: model.provider,
      modelName: model.modelName,
      endpoint: model.endpoint || "",
      apiKey: "",
    });
    setEditingId(model.id);
    setIsFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const payload = {
        label: form.label,
        provider: form.provider,
        modelName: form.modelName,
        endpoint: selectedProvider?.requiresEndpoint ? form.endpoint : "",
      };
      if (form.apiKey) payload.apiKey = form.apiKey;

      const data = editingId
        ? await updateAdminLlmModel(editingId, payload)
        : await createAdminLlmModel({ ...payload, apiKey: form.apiKey });
      applySettings(data);
      setSuccessMessage(editingId ? "模型已更新" : "模型已新增");
      closeForm();
    } catch (error) {
      setErrorMessage(error.message || "模型儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (model) => {
    setDeletingId(model.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const data = await deleteAdminLlmModel(model.id);
      applySettings(data);
      setSuccessMessage(`已刪除「${model.label}」`);
    } catch (error) {
      setErrorMessage(error.message || "模型刪除失敗");
    } finally {
      setDeletingId("");
    }
  };

  const runTest = async (key, payload) => {
    setTestingKey(key);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await testAdminLlmModel(payload);
      if (result?.success) {
        setSuccessMessage(`連線成功，耗時 ${result.latencyMs} ms`);
      } else {
        setErrorMessage(result?.message || "連線測試失敗");
      }
    } catch (error) {
      setErrorMessage(error.message || "連線測試失敗");
    } finally {
      setTestingKey("");
    }
  };

  const handleAssignmentChange = async (role, field, value) => {
    const current = assignmentByRole[role.id] || {};
    const next = {
      modelId: current.modelId || "",
      fallbackModelId: current.fallbackModelId || null,
      [field]: value || null,
    };
    if (!next.modelId) {
      setErrorMessage("請先選擇主要模型");
      return;
    }

    setPendingRole(role.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const data = await assignAdminLlmRole(role.id, next);
      applySettings(data);
      setSuccessMessage(`已更新「${role.label}」的模型指派`);
    } catch (error) {
      setErrorMessage(error.message || "模型指派失敗");
    } finally {
      setPendingRole("");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          載入分析模型設定…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {successMessage}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
            分析模型
            <Badge variant="secondary">{settings.models.length}</Badge>
          </CardTitle>
          <Button type="button" onClick={openCreateForm} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            新增模型
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            分析模型的端點與金鑰會加密存放於資料庫，不再由 App Service 環境變數提供。金鑰儲存後不會再顯示。
          </p>

          {isFormOpen && (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="llm-label" className="text-sm font-semibold">名稱</label>
                  <input
                    id="llm-label"
                    className={inputClass}
                    value={form.label}
                    onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="llm-provider" className="text-sm font-semibold">供應商</label>
                  <select
                    id="llm-provider"
                    className={inputClass}
                    value={form.provider}
                    onChange={(event) => setForm((previous) => ({ ...previous, provider: event.target.value }))}
                  >
                    {settings.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="llm-model-name" className="text-sm font-semibold">模型／部署名稱</label>
                  <input
                    id="llm-model-name"
                    className={inputClass}
                    value={form.modelName}
                    onChange={(event) => setForm((previous) => ({ ...previous, modelName: event.target.value }))}
                    required
                  />
                </div>
                {selectedProvider?.requiresEndpoint && (
                  <div className="space-y-2">
                    <label htmlFor="llm-endpoint" className="text-sm font-semibold">端點</label>
                    <input
                      id="llm-endpoint"
                      type="url"
                      className={inputClass}
                      placeholder={selectedProvider.endpointHint}
                      value={form.endpoint}
                      onChange={(event) => setForm((previous) => ({ ...previous, endpoint: event.target.value }))}
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="llm-api-key" className="text-sm font-semibold">API 金鑰</label>
                  <input
                    id="llm-api-key"
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    placeholder={editingId ? "留空則不變更" : ""}
                    value={form.apiKey}
                    onChange={(event) => setForm((previous) => ({ ...previous, apiKey: event.target.value }))}
                    required={!editingId}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {editingId ? "更新模型" : "新增模型"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={testingKey === "draft" || !form.apiKey}
                  onClick={() =>
                    runTest("draft", {
                      provider: form.provider,
                      modelName: form.modelName,
                      endpoint: form.endpoint,
                      apiKey: form.apiKey,
                    })
                  }
                >
                  {testingKey === "draft" ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <PlugZap className="h-4 w-4" aria-hidden="true" />
                  )}
                  測試連線
                </Button>
                <Button type="button" variant="ghost" className="gap-2" onClick={closeForm}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  取消
                </Button>
              </div>
            </form>
          )}

          {settings.models.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              尚未建立任何分析模型，請點右上角「新增模型」開始設定。
            </p>
          ) : (
            <ul className="space-y-3">
              {settings.models.map((model) => (
                <li
                  key={model.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold">{model.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[providerLabel(model.provider), model.modelName, model.endpoint]
                        .filter(Boolean)
                        .join(" ・ ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={testingKey === model.id}
                      onClick={() => runTest(model.id, { modelId: model.id })}
                    >
                      {testingKey === model.id ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <PlugZap className="h-4 w-4" aria-hidden="true" />
                      )}
                      測試
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditForm(model)}>
                      編輯
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive"
                      disabled={deletingId === model.id}
                      onClick={() => handleDelete(model)}
                    >
                      {deletingId === model.id ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      刪除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">用途指派</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            每個用途都必須指派主要模型，否則相關功能會回報尚未設定。備援模型會在主要模型忙碌或失敗時接手。
          </p>
          {settings.roles.map((role) => {
            const assignment = assignmentByRole[role.id] || {};
            const candidates = settings.models.filter(
              (model) => model.provider === role.provider
            );
            const isPending = pendingRole === role.id;
            return (
              <div
                key={role.id}
                className={cn(
                  "grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3 sm:items-center",
                  isPending && "opacity-60"
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{role.label}</p>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                  <p className="text-xs text-muted-foreground">{providerLabel(role.provider)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold">主要模型</p>
                  {candidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      尚未建立 {providerLabel(role.provider)} 模型，請先於上方新增。
                    </p>
                  ) : (
                    <select
                      id={`llm-role-${role.id}-primary`}
                      aria-label={`${role.label}主要模型`}
                      className={inputClass}
                      value={assignment.modelId || ""}
                      disabled={isPending}
                      onChange={(event) => handleAssignmentChange(role, "modelId", event.target.value)}
                    >
                      <option value="">未指派</option>
                      {candidates.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold">備援模型</p>
                  {!assignment.modelId ? (
                    <p className="text-xs text-muted-foreground">請先指派主要模型。</p>
                  ) : candidates.length < 2 ? (
                    <p className="text-xs text-muted-foreground">
                      沒有其他 {providerLabel(role.provider)} 模型可作為備援。
                    </p>
                  ) : (
                    <select
                      id={`llm-role-${role.id}-fallback`}
                      aria-label={`${role.label}備援模型`}
                      className={inputClass}
                      value={assignment.fallbackModelId || ""}
                      disabled={isPending}
                      onChange={(event) => handleAssignmentChange(role, "fallbackModelId", event.target.value)}
                    >
                      <option value="">不設定</option>
                      {candidates
                        .filter((model) => model.id !== assignment.modelId)
                        .map((model) => (
                          <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
