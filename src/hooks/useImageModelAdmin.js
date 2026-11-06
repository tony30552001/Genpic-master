import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAdminImageModel,
  deleteAdminImageModel,
  getAdminModelSettings,
  listAdminImageModels,
  testAdminImageModel,
  updateAdminImageModel,
  updateAdminModelSettings,
} from "../services/adminService";
import { waitForImageJob } from "../services/aiService";

export const IMAGE_ROLES = [
  { field: "defaultModel", label: "圖片生成", description: "從文字產生新圖片" },
  { field: "defaultEditModel", label: "圖片編輯", description: "修改、精確編輯、以圖轉圖" },
];

const isPolicyComplete = (policy, models) => {
  const registered = (key) => models.some((model) => model.modelKey === key);
  return policy.allowedModels.length > 0
    && policy.allowedModels.every(registered)
    && policy.allowedModels.includes(policy.defaultModel)
    && policy.allowedModels.includes(policy.defaultEditModel);
};

/**
 * Image model catalog plus tenant policy. Policy edits save immediately once the
 * policy is complete; an incomplete draft stays local until the admin fills the gap.
 */
export default function useImageModelAdmin({ notify, refreshProfile }) {
  const [catalog, setCatalog] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [testingKey, setTestingKey] = useState("");
  const testController = useRef(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [catalogData, settings] = await Promise.all([listAdminImageModels(), getAdminModelSettings()]);
      setCatalog(catalogData);
      setPolicy(settings.modelPolicy);
    } catch (error) {
      setLoadError(error.message || "圖片模型設定載入失敗，請重試。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => () => testController.current?.abort(), []);

  const reloadProfile = async (savedMessage) => {
    try {
      await refreshProfile();
    } catch (error) {
      notify({ tone: "error", text: `${savedMessage}，但使用者資料重新載入失敗：${error.message}。請重新整理頁面。` });
      return false;
    }
    return true;
  };

  const commitPolicy = async (next, row) => {
    const previous = policy;
    setPolicy(next);
    if (!isPolicyComplete(next, catalog.models)) return;
    setIsSavingPolicy(true);
    try {
      const result = await updateAdminModelSettings({
        allowedModels: next.allowedModels,
        defaultModel: next.defaultModel,
        defaultEditModel: next.defaultEditModel,
      });
      setPolicy(result.modelPolicy);
      if (await reloadProfile("模型政策已儲存")) {
        notify({ tone: "success", text: "模型政策已儲存，下一次生成將套用新設定。", row });
      }
    } catch (error) {
      setPolicy(previous);
      notify({ tone: "error", text: error.message || "模型政策儲存失敗" });
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const assignImageRole = (field, modelKey) => commitPolicy({
    ...policy,
    allowedModels: policy.allowedModels.includes(modelKey) ? policy.allowedModels : [...policy.allowedModels, modelKey],
    [field]: modelKey,
  }, field);

  const toggleAllowed = (modelKey) => {
    const allowedModels = policy.allowedModels.includes(modelKey)
      ? policy.allowedModels.filter((key) => key !== modelKey)
      : [...policy.allowedModels, modelKey];
    return commitPolicy({
      ...policy,
      allowedModels,
      defaultModel: allowedModels.includes(policy.defaultModel) ? policy.defaultModel : null,
      defaultEditModel: allowedModels.includes(policy.defaultEditModel) ? policy.defaultEditModel : null,
    }, `allowed:${modelKey}`);
  };

  /** Throws so the form can keep its input and show the error in place. */
  const saveModel = async (form, editingKey) => {
    const payload = {
      ...form,
      modelKey: form.modelKey.trim(),
      label: form.label.trim(),
      deploymentName: form.deploymentName.trim(),
      endpoint: form.endpoint.trim(),
    };
    const data = editingKey
      ? await updateAdminImageModel(editingKey, payload)
      : await createAdminImageModel(payload);
    setCatalog(data);
    const message = editingKey ? "圖片模型已更新" : "圖片模型已新增";
    if (await reloadProfile(message)) {
      notify({ tone: "success", text: editingKey ? `${message}。` : `${message}；可從左側指派或開放此模型。` });
    }
  };

  const deleteModel = async (model) => {
    try {
      setCatalog(await deleteAdminImageModel(model.modelKey));
      if (await reloadProfile(`已刪除「${model.label}」`)) {
        notify({ tone: "success", text: `已刪除「${model.label}」。` });
      }
    } catch (error) {
      notify({ tone: "error", text: error.message || "刪除失敗，請確認政策引用與在途工作後重試。" });
    }
  };

  const runTest = async (model) => {
    const controller = new AbortController();
    testController.current = controller;
    setTestingKey(model.modelKey);
    notify({ tone: "info", text: `正在提交「${model.label}」的付費生成測試…` });
    try {
      const queued = await testAdminImageModel({ modelKey: model.modelKey }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!queued?.jobId) throw new Error("伺服器未回傳測試工作識別碼");
      notify({ tone: "info", text: `測試已排入佇列（${queued.jobId}），正在等待生成結果…` });
      await waitForImageJob({ jobId: queued.jobId, signal: controller.signal });
      if (!controller.signal.aborted) {
        notify({ tone: "success", text: `「${model.label}」low 品質生成測試成功；尚未驗證其他品質或圖片編輯能力。` });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        notify({ tone: "error", text: `生成測試失敗：${error.message || "請檢查設定後重試"}。重新測試會另行產生費用。` });
      }
    } finally {
      if (!controller.signal.aborted) {
        testController.current = null;
        setTestingKey("");
      }
    }
  };

  const stopTest = () => {
    testController.current?.abort();
    testController.current = null;
    setTestingKey("");
    notify({ tone: "info", text: "已停止等待；遠端工作未取消，仍可能產生費用。" });
  };

  const models = catalog?.models ?? [];
  const missingPolicyKeys = policy
    ? policy.allowedModels.filter((key) => !models.some((model) => model.modelKey === key))
    : [];

  return {
    catalog,
    policy,
    isLoading,
    loadError,
    load,
    isSavingPolicy,
    missingPolicyKeys,
    assignImageRole,
    toggleAllowed,
    saveModel,
    deleteModel,
    testingKey,
    runTest,
    stopTest,
  };
}
