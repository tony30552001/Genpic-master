import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPut } from "./apiClient";

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
  apiGet(`${API_BASE_URL}/admin/settings`);

export const listAdminUsers = async () =>
  apiGet(`${API_BASE_URL}/admin/users`);

export const listAdminHistory = async (userId) =>
  apiGet(`${API_BASE_URL}/admin/history${buildQueryString({ userId })}`);

export const listAdminStyles = async (userId) =>
  apiGet(`${API_BASE_URL}/admin/styles${buildQueryString({ userId })}`);

export const updateAdminUserRole = async (userId, role) =>
  apiPut(`${API_BASE_URL}/admin/users/${userId}`, { role });

export const updateAdminModelSettings = async (settings) =>
  apiPut(`${API_BASE_URL}/admin/settings`, settings);

export const deleteAdminStyle = async (styleId) =>
  apiDelete(`${API_BASE_URL}/admin/styles/${styleId}`);
