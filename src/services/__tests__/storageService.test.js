import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(() => Promise.resolve([{ id: "1" }])),
  apiPost: vi.fn(() => Promise.resolve({ id: "1" })),
  apiPut: vi.fn(() => Promise.resolve({ id: "1" })),
  apiDelete: vi.fn(() => Promise.resolve(null)),
}));

import {
  listHistory,
  listStyles,
  addStyle,
  updateStyle,
  deleteStyle,
  publishStyle,
  unpublishStyle,
  copyStyle,
  markStyleUsed,
  addHistoryItem,
  deleteHistoryItem,
} from "../storageService";
import { apiGet, apiPost, apiPut, apiDelete } from "../apiClient";
import { API_BASE_URL } from "../../config";

describe("storageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listHistory calls apiGet", async () => {
    const result = await listHistory();
    expect(apiGet).toHaveBeenCalled();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("listStyles calls apiGet", async () => {
    const result = await listStyles();
    expect(apiGet).toHaveBeenCalledWith(`${API_BASE_URL}/styles`);
    expect(result).toEqual([{ id: "1" }]);
  });

  it("listStyles serializes query params", async () => {
    const result = await listStyles({
      scope: "shared",
      category: "poster",
      tags: ["科技", "簡報"],
      sort: "popular",
      q: "brand",
    });
    expect(apiGet).toHaveBeenCalledWith(
      `${API_BASE_URL}/styles?scope=shared&category=poster&tags=%E7%A7%91%E6%8A%80%2C%E7%B0%A1%E5%A0%B1&sort=popular&q=brand`
    );
    expect(result).toEqual([{ id: "1" }]);
  });

  it("addStyle posts data", async () => {
    await addStyle({ name: "style" });
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles`, { name: "style" });
  });

  it("updateStyle puts data", async () => {
    await updateStyle("style-id", { name: "style" });
    expect(apiPut).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id`, { name: "style" });
  });

  it("deleteStyle calls delete", async () => {
    await deleteStyle("style-id");
    expect(apiDelete).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id`);
  });

  it("style sharing helpers post to action routes", async () => {
    await publishStyle("style-id");
    await unpublishStyle("style-id");
    await copyStyle("style-id");
    await markStyleUsed("style-id");

    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/publish`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/unpublish`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/copy`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/use`);
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
