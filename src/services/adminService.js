import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPut } from "./apiClient";

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

export const listAdminUsers = async () =>
  apiGet(`${ADMIN_API_BASE}/users`);

export const listAdminHistory = async (userId) =>
  apiGet(`${ADMIN_API_BASE}/history${buildQueryString({ userId })}`);

export const listAdminStyles = async (userId) =>
  apiGet(`${ADMIN_API_BASE}/styles${buildQueryString({ userId })}`);

export const updateAdminUserRole = async (userId, role) =>
  apiPut(`${ADMIN_API_BASE}/users/${userId}`, { role });

export const updateAdminModelSettings = async (settings) =>
  apiPut(`${ADMIN_API_BASE}/settings`, settings);

export const deleteAdminStyle = async (styleId) =>
  apiDelete(`${ADMIN_API_BASE}/styles/${styleId}`);
