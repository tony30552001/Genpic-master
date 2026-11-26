import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPost, apiPut } from "./apiClient";

const sessionUrl = (sessionId) => `${API_BASE_URL}/video-sessions/${encodeURIComponent(sessionId)}`;

/** Returns `{ items: [{ id, title, updatedAt }], nextCursor }`, newest first. */
export const listVideoSessions = ({ cursor, signal } = {}) =>
  apiGet(`${API_BASE_URL}/video-sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });

export const getVideoSession = ({ sessionId, signal }) => apiGet(sessionUrl(sessionId), { signal });

export const createVideoSession = ({ title, state }) =>
  apiPost(`${API_BASE_URL}/video-sessions`, { title, state });

/** Rejects with code `state_conflict` when another window saved first. */
export const saveVideoSession = ({ sessionId, stateVersion, title, state }) =>
  apiPut(sessionUrl(sessionId), { stateVersion, title, state });

export const deleteVideoSession = ({ sessionId }) => apiDelete(sessionUrl(sessionId));
