import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPost, apiPut } from "./apiClient";

const ADMIN_API_BASE = `${API_BASE_URL}/management`;

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

export const getCurrentUserProfile = async () =>
  apiGet(`${API_BASE_URL}/me`);

export const getAdminModelSettings = async () =>
  apiGet(`${ADMIN_API_BASE}/settings`);

export const listAdminUsers = async ({ page = 1, pageSize = 10 } = {}) =>
  apiGet(`${ADMIN_API_BASE}/users${buildQueryString({ page, pageSize })}`);

export const listAdminUserOptions = async () =>
  apiGet(`${ADMIN_API_BASE}/user-options`);

const normalizeListParams = (params) =>
  typeof params === "string" ? { userId: params } : params || {};

export const listAdminHistory = async (params = {}) => {
  const { userId, page = 1, pageSize = 10 } = normalizeListParams(params);
  return apiGet(
    `${ADMIN_API_BASE}/history${buildQueryString({ userId, page, pageSize })}`
  );
};

export const getAdminHistoryImage = async (historyId) =>
  apiGet(`${ADMIN_API_BASE}/history-images/${historyId}`);

export const getAdminStylePreview = async (styleId) =>
  apiGet(`${ADMIN_API_BASE}/style-previews/${styleId}`);

export const listAdminStyles = async (params = {}) => {
  const { userId, page = 1, pageSize = 10 } = normalizeListParams(params);
  return apiGet(
    `${ADMIN_API_BASE}/styles${buildQueryString({ userId, page, pageSize })}`
  );
};

export const updateAdminUserRole = async (userId, role) =>
  apiPut(`${ADMIN_API_BASE}/users/${userId}`, { role });

export const updateAdminUserStatus = async (userId, isActive) =>
  apiPut(`${ADMIN_API_BASE}/users/${userId}`, { isActive });

export const updateAdminModelSettings = async (settings) =>
  apiPut(`${ADMIN_API_BASE}/settings`, settings);

export const deleteAdminStyle = async (styleId) =>
  apiDelete(`${ADMIN_API_BASE}/styles/${styleId}`);

export const listAdminLlmModels = async () =>
  apiGet(`${ADMIN_API_BASE}/llm-models`);

export const createAdminLlmModel = async (model) =>
  apiPost(`${ADMIN_API_BASE}/llm-models`, model);

export const updateAdminLlmModel = async (modelId, model) =>
  apiPut(`${ADMIN_API_BASE}/llm-models/${modelId}`, model);

export const deleteAdminLlmModel = async (modelId) =>
  apiDelete(`${ADMIN_API_BASE}/llm-models/${modelId}`);

export const assignAdminLlmRole = async (role, assignment) =>
  apiPut(`${ADMIN_API_BASE}/llm-roles/${role}`, assignment);

export const testAdminLlmModel = async (payload) =>
  apiPost(`${ADMIN_API_BASE}/llm-model-tests`, payload);
