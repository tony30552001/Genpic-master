import { useCallback, useEffect, useState } from "react";
import {
  assignAdminLlmRole,
  createAdminLlmModel,
  deleteAdminLlmModel,
  listAdminLlmModels,
  testAdminLlmModel,
  updateAdminLlmModel,
} from "../services/adminService";

const EMPTY_SETTINGS = { models: [], assignments: [], roles: [] };

/** Text (LLM) model connections and per-role assignments; assignments save immediately. */
export default function useLlmModelAdmin({ notify }) {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pendingRole, setPendingRole] = useState("");
  const [testingId, setTestingId] = useState("");
  const [testResults, setTestResults] = useState({});

  const applySettings = (data) => setSettings({ ...EMPTY_SETTINGS, ...data });

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setSettings({ ...EMPTY_SETTINGS, ...(await listAdminLlmModels()) });
    } catch (error) {
      setLoadError(error.message || "文字模型設定載入失敗，請重試。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const assignRole = async (role, field, value) => {
    const current = settings.assignments.find((assignment) => assignment.role === role.id) || {};
    const next = {
      modelId: current.modelId || null,
      fallbackModelId: current.fallbackModelId || null,
      [field]: value || null,
    };
    if (next.fallbackModelId === next.modelId) next.fallbackModelId = null;
    setPendingRole(role.id);
    try {
      applySettings(await assignAdminLlmRole(role.id, next));
      notify({ tone: "success", text: `已更新「${role.label}」的模型指派。`, row: role.id });
    } catch (error) {
      notify({ tone: "error", text: error.message || "模型指派失敗" });
    } finally {
      setPendingRole("");
    }
  };

  /** Throws so the form can keep its input and show the error in place. */
  const saveModel = async (form, editingId) => {
    const payload = { label: form.label.trim(), modelName: form.modelName.trim(), endpoint: form.endpoint.trim() };
    if (form.apiKey) payload.apiKey = form.apiKey;
    applySettings(editingId ? await updateAdminLlmModel(editingId, payload) : await createAdminLlmModel(payload));
    notify({ tone: "success", text: editingId ? "文字模型已更新。" : "文字模型已新增；可從左側指派給功能。" });
  };

  const deleteModel = async (model) => {
    try {
      applySettings(await deleteAdminLlmModel(model.id));
      notify({ tone: "success", text: `已刪除「${model.label}」。` });
    } catch (error) {
      notify({ tone: "error", text: error.message || "模型刪除失敗" });
    }
  };

  const testModel = async (model) => {
    setTestingId(model.id);
    try {
      const result = await testAdminLlmModel({ modelId: model.id });
      setTestResults((previous) => ({ ...previous, [model.id]: result }));
      if (result?.success) {
        notify({ tone: "success", text: `「${model.label}」連線成功，耗時 ${result.latencyMs} ms。` });
      } else {
        notify({ tone: "error", text: result?.message || "連線測試失敗" });
      }
    } catch (error) {
      setTestResults((previous) => ({ ...previous, [model.id]: { success: false } }));
      notify({ tone: "error", text: error.message || "連線測試失敗" });
    } finally {
      setTestingId("");
    }
  };

  /** Tests unsaved form values; the form shows the result next to its fields. */
  const testDraft = (form) =>
    testAdminLlmModel({ modelName: form.modelName.trim(), endpoint: form.endpoint.trim(), apiKey: form.apiKey });

  return {
    settings,
    isLoading,
    loadError,
    load,
    pendingRole,
    assignRole,
    saveModel,
    deleteModel,
    testingId,
    testResults,
    testModel,
    testDraft,
  };
}
