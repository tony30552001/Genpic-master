import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVideoSessions from "../useVideoSessions";
import {
  createVideoSession,
  getVideoSession,
  listVideoSessions,
  saveVideoSession,
} from "../../services/videoSessionService";

vi.mock("../../services/videoSessionService", () => ({
  createVideoSession: vi.fn(),
  deleteVideoSession: vi.fn(),
  getVideoSession: vi.fn(),
  listVideoSessions: vi.fn(),
  saveVideoSession: vi.fn(),
}));

const snapshot = (text) => ({
  title: text,
  state: { messages: text ? [{ id: "m1", role: "user", text }] : [], turns: [] },
});

const flush = () => act(() => vi.advanceTimersByTimeAsync(1000));

describe("useVideoSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listVideoSessions.mockResolvedValue({ items: [], nextCursor: null });
    createVideoSession.mockResolvedValue({ id: "s1", title: "晨光", stateVersion: 1, updatedAt: "2025-01-01T00:00:00Z" });
    saveVideoSession.mockResolvedValue({ id: "s1", title: "晨光森林", stateVersion: 2, updatedAt: "2025-01-01T00:01:00Z" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("creates the session on the first non-empty snapshot, then saves with its version", async () => {
    const { result } = renderHook(() => useVideoSessions({ enabled: true }));

    act(() => result.current.record(snapshot("")));
    await flush();
    expect(createVideoSession).not.toHaveBeenCalled();

    act(() => result.current.record(snapshot("晨光")));
    await flush();
    expect(createVideoSession).toHaveBeenCalledWith(snapshot("晨光"));
    expect(result.current).toMatchObject({ activeId: "s1", saveStatus: "saved" });

    act(() => result.current.record(snapshot("晨光森林")));
    expect(result.current.saveStatus).toBe("pending");
    await flush();
    expect(saveVideoSession).toHaveBeenCalledWith({ sessionId: "s1", stateVersion: 1, ...snapshot("晨光森林") });
    expect(result.current.items).toEqual([{ id: "s1", title: "晨光森林", updatedAt: "2025-01-01T00:01:00Z" }]);
  });

  it("does not create an empty session when switching away from a blank workspace", async () => {
    getVideoSession.mockResolvedValue({ id: "s2", title: "夜景", stateVersion: 1, updatedAt: "2025-01-01T00:00:00Z", state: {} });
    const { result } = renderHook(() => useVideoSessions({ enabled: true }));

    act(() => result.current.record(snapshot("")));
    await act(() => result.current.open("s2"));

    expect(createVideoSession).not.toHaveBeenCalled();
    expect(result.current.activeId).toBe("s2");
  });

  it("stops saving after a version conflict", async () => {
    saveVideoSession.mockRejectedValue(Object.assign(new Error("conflict"), { code: "state_conflict" }));
    const { result } = renderHook(() => useVideoSessions({ enabled: true }));

    act(() => result.current.record(snapshot("晨光")));
    await flush();
    act(() => result.current.record(snapshot("晨光森林")));
    await flush();
    act(() => result.current.record(snapshot("晨光森林夜晚")));
    await flush();

    expect(saveVideoSession).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.error).toContain("其他視窗");
  });
});
