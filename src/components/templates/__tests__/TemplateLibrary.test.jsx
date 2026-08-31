import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TemplateLibrary from "../TemplateLibrary";

const template = {
  id: "template-1",
  name: "產品介紹範本",
  description: "用於產品特色介紹",
  userScript: "產品特色與使用情境",
  stylePrompt: "clean editorial layout",
  tags: ["產品"],
  createdAt: { seconds: 1_725_000_000 },
  updatedAt: { seconds: 1_725_000_100 },
};

const renderLibrary = (viewMode, templates = [template]) =>
  render(
    <TemplateLibrary
      templates={templates}
      viewMode={viewMode}
      onApplyTemplate={vi.fn()}
      onDeleteTemplate={vi.fn()}
      onDeleteTemplates={vi.fn()}
      onEditTemplate={vi.fn()}
    />
  );

describe("TemplateLibrary", () => {
  it.each(["grid", "list", "table"])(
    "renders saved templates in %s view",
    (viewMode) => {
      const { container } = renderLibrary(viewMode);

      expect(within(container).getByText("產品介紹範本")).toBeInTheDocument();
    }
  );

  it("renders the empty state without crashing", () => {
    const { container } = renderLibrary("table", []);

    expect(within(container).getByText("尚未儲存任何範本")).toBeInTheDocument();
  });
});
