import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TEMPLATE_PREVIEWS, describeTemplatePreview } from "../templatePreviewManifest";

const PUBLIC_ROOT = path.resolve(__dirname, "../../../../public");

const allEntries = Object.entries(TEMPLATE_PREVIEWS).flatMap(([kind, group]) =>
  Object.entries(group).map(([templateId, paths]) => ({ kind, templateId, paths }))
);

describe("templatePreviewManifest", () => {
  it("只宣告 styles 與 layouts 兩組", () => {
    expect(Object.keys(TEMPLATE_PREVIEWS).sort()).toEqual(["layouts", "styles"]);
  });

  /**
   * 腳本跑到一半中斷、或資產被刪卻沒重新產生 manifest，都會讓選擇器要求不存在的圖。
   * 這條測試就是為了讓那種情況在 CI 就爆掉，而不是在使用者面前變成破圖。
   */
  it("每一個宣告的預覽檔案都實際存在於 public/", () => {
    for (const { paths } of allEntries) {
      for (const publicPath of paths) {
        expect(publicPath.startsWith("/template-previews/")).toBe(true);
        expect(existsSync(path.join(PUBLIC_ROOT, publicPath.slice(1)))).toBe(true);
      }
    }
  });

  it("每個範本的頁面依序排列且不重複", () => {
    for (const { paths } of allEntries) {
      expect(new Set(paths).size).toBe(paths.length);
      expect([...paths].sort()).toEqual(paths);
    }
  });

  it("未產生預覽的範本回傳空陣列而非 undefined", () => {
    expect(describeTemplatePreview("styles", "does-not-exist")).toEqual([]);
    expect(describeTemplatePreview("nope", "does-not-exist")).toEqual([]);
  });
});
