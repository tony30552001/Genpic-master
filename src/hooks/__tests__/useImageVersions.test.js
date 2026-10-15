import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import useImageVersions, { buildVersionRows } from "../useImageVersions";

describe("useImageVersions", () => {
  it("starts a chain with a root version", () => {
    const { result } = renderHook(() => useImageVersions());
    let root;
    act(() => { root = result.current.startChain({ jobId: "job-1", imageUrl: "a.png", instruction: "城市" }); });
    expect(result.current.versions).toEqual([expect.objectContaining({
      id: root.id, jobId: "job-1", imageUrl: "a.png", instruction: "城市", parentId: null, upload: null, fromHistory: false,
    })]);
    expect(result.current.activeVersionId).toBe(root.id);
    expect(result.current.getVersionLabel(root)).toBe("v1");
  });

  it("adds refinements as children of their parent and selects them", () => {
    const { result } = renderHook(() => useImageVersions());
    let root;
    let child;
    act(() => { root = result.current.startChain({ imageUrl: "a.png" }); });
    act(() => { child = result.current.addVersion({ jobId: "job-2", imageUrl: "b.png", instruction: "改黃色", parentId: root.id }); });
    expect(result.current.activeVersion).toMatchObject({ id: child.id, parentId: root.id, instruction: "改黃色" });
    expect(result.current.getVersionLabel(child)).toBe("v2");
    act(() => { result.current.selectVersion(root.id); });
    expect(result.current.activeVersion.id).toBe(root.id);
  });

  it("caches a version's upload", () => {
    const { result } = renderHook(() => useImageVersions());
    let root;
    act(() => { root = result.current.startChain({ imageUrl: "a.png" }); });
    act(() => { result.current.setVersionUpload(root.id, { uploadId: "upload-1", aspectRatio: "3:2" }); });
    expect(result.current.activeVersion.upload).toEqual({ uploadId: "upload-1", aspectRatio: "3:2" });
  });

  it("replaces the chain when a new one starts", () => {
    const { result } = renderHook(() => useImageVersions());
    act(() => { result.current.startChain({ imageUrl: "a.png" }); });
    act(() => { result.current.startChain({ imageUrl: "h.jpg", fromHistory: true }); });
    expect(result.current.versions).toHaveLength(1);
    expect(result.current.activeVersion).toMatchObject({ imageUrl: "h.jpg", fromHistory: true });
  });
});

describe("buildVersionRows", () => {
  it("keeps the main line in one row and puts later siblings on branch rows", () => {
    const versions = [
      { id: "v1", parentId: null },
      { id: "v2", parentId: "v1" },
      { id: "v3", parentId: "v2" },
      { id: "v4", parentId: "v1" },
      { id: "v5", parentId: "v4" },
    ];
    expect(buildVersionRows(versions).map((row) => ({ fromId: row.fromId, ids: row.items.map((v) => v.id) }))).toEqual([
      { fromId: null, ids: ["v1", "v2", "v3"] },
      { fromId: "v1", ids: ["v4", "v5"] },
    ]);
  });
});
