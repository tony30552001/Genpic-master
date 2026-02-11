import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(() => Promise.resolve([{ id: "1" }])),
  apiPost: vi.fn(() => Promise.resolve({ id: "1" })),
  apiDelete: vi.fn(() => Promise.resolve(null)),
}));

import {
  listHistory,
  listStyles,
  addStyle,
  deleteStyle,
  addHistoryItem,
  deleteHistoryItem,
} from "../storageService";
import { apiGet, apiPost, apiDelete } from "../apiClient";

describe("storageService", () => {
  it("listHistory calls apiGet", async () => {
    const result = await listHistory();
    expect(apiGet).toHaveBeenCalled();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("listStyles calls apiGet", async () => {
    const result = await listStyles();
    expect(apiGet).toHaveBeenCalled();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("addStyle posts data", async () => {
    await addStyle({ name: "style" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("deleteStyle calls delete", async () => {
    await deleteStyle("style-id");
    expect(apiDelete).toHaveBeenCalled();
  });

  it("addHistoryItem posts data", async () => {
    await addHistoryItem({ imageUrl: "url" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("deleteHistoryItem calls delete", async () => {
    await deleteHistoryItem("item-id");
    expect(apiDelete).toHaveBeenCalled();
  });
});
