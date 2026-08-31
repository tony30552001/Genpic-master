import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ICON_SIZE_CLASS,
  ICON_STROKE_WIDTH,
  PRODUCT_GLYPH_KINDS,
} from "../iconPolicy";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const ALLOWED_LUCIDE_FILES = new Set([
  path.join(SOURCE_ROOT, "components", "icons", "lucideControls.js"),
  path.join(SOURCE_ROOT, "components", "icons", "lucideContent.js"),
  path.join(SOURCE_ROOT, "components", "icons", "lucideStatus.js"),
]);

const listSourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });

describe("icon policy", () => {
  it("keeps the visual scale and product glyph vocabulary finite", () => {
    expect(ICON_STROKE_WIDTH).toBe(1.75);
    expect(Object.keys(ICON_SIZE_CLASS)).toEqual(["xs", "sm", "md", "lg", "display"]);
    expect(PRODUCT_GLYPH_KINDS).toEqual([
      "create",
      "document",
      "transform",
      "library",
      "deck",
      "settings",
    ]);
  });

  it("allows direct Lucide imports only inside the registries", () => {
    const violations = listSourceFiles(SOURCE_ROOT)
      .filter((filePath) => !ALLOWED_LUCIDE_FILES.has(filePath))
      .filter((filePath) => /from\s+["']lucide-react["']/.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(SOURCE_ROOT, filePath));

    expect(violations).toEqual([]);
  });
});
