import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAdminVideoModel,
  deleteAdminVideoModel,
  getAdminModelSettings,
  listAdminVideoModels,
  testAdminVideoModel,
  updateAdminVideoModel,
  updateAdminVideoSettings,
} from "../services/adminService";
import { waitForVideoProject } from "../services/aiService";

export default function useVideoModelAdmin({ notify, refreshProfile }) {
  const [catalog, setCatalog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [testingKey, setTestingKey] = useState("");
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [nextCatalog, allSettings] = await Promise.all([
        listAdminVideoModels(),
        getAdminModelSettings(),
      ]);
      setCatalog(nextCatalog);
      setSettings(allSettings.videoSettings);
    } catch (error) {
      setLoadError(error.message || "影片模型設定載入失敗");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const saveModel = async (form, editingKey) => {
    const payload = {
      ...form,
      modelKey: form.modelKey.trim(),
      label: form.label.trim(),
      deploymentName: form.deploymentName.trim(),
      endpoint: form.endpoint.trim(),
    };
    const next = editingKey
      ? await updateAdminVideoModel(editingKey, payload)
      : await createAdminVideoModel(payload);
    setCatalog(next);
    await refreshProfile();
    notify({ tone: "success", text: editingKey ? "影片模型已更新。" : "影片模型已新增。" });
  };

  const deleteModel = async (model) => {
    try {
      setCatalog(await deleteAdminVideoModel(model.modelKey));
      await refreshProfile();
      notify({ tone: "success", text: `已刪除「${model.label}」。` });
    } catch (error) {
      notify({ tone: "error", text: error.message || "刪除失敗，請確認開放清單與在途工作。" });
    }
  };

  const saveSettings = async (next) => {
    setIsSavingPolicy(true);
    try {
      const saved = await updateAdminVideoSettings(next);
      setSettings(saved);
      await refreshProfile();
      notify({ tone: "success", text: "影片政策已儲存。", row: "video-policy" });
      return saved;
    } catch (error) {
      notify({ tone: "error", text: error.message || "影片政策儲存失敗" });
      throw error;
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const toggleAllowed = (modelKey) => {
    const allowedModels = settings.allowedModels.includes(modelKey)
      ? settings.allowedModels.filter((value) => value !== modelKey)
      : [...settings.allowedModels, modelKey];
    void saveSettings({ ...settings, allowedModels }).catch(() => {});
  };

  const runTest = async (model) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setTestingKey(model.modelKey);
    notify({ tone: "info", text: `正在提交「${model.label}」付費影片測試…` });
    try {
      const admitted = await testAdminVideoModel(
        { modelKey: model.modelKey },
        { signal: controller.signal }
      );
      await waitForVideoProject({ projectId: admitted.projectId, signal: controller.signal });
      notify({ tone: "success", text: `「${model.label}」影片測試成功。` });
    } catch (error) {
      if (error?.name !== "AbortError") {
        notify({ tone: "error", text: `影片測試失敗：${error.message || "請檢查設定"}` });
      }
    } finally {
      if (!controller.signal.aborted) {
        controllerRef.current = null;
        setTestingKey("");
      }
    }
  };

  const stopTest = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setTestingKey("");
    notify({ tone: "info", text: "已停止等待；遠端工作未取消，仍可能產生費用。" });
  };

  return {
    catalog,
    settings,
    isLoading,
    loadError,
    isSavingPolicy,
    load,
    saveModel,
    deleteModel,
    saveSettings,
    toggleAllowed,
    testingKey,
    runTest,
    stopTest,
  };
}
