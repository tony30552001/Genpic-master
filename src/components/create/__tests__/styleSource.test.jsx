import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import StylePresetPicker from "../StylePresetPicker";
import StyleSourceTabs from "../StyleSourceTabs";
import TaskTemplatePicker from "../TaskTemplatePicker";
import {
  buildTaskTemplateContext,
  STYLE_PRESETS,
} from "../styleSourceData";

describe("style source controls", () => {
  afterEach(() => cleanup());

  it("selects a task structure without changing the caller's content", () => {
    const onChange = vi.fn();
    render(
      <TaskTemplatePicker
        context={buildTaskTemplateContext("infographic")}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "敘事海報" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "poster",
        moduleCount: 3,
        informationFlow: "主視覺聚焦",
      })
    );
  });

  it("allows only one value per visual dimension", () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <StyleSourceTabs
          open
          templateContext={buildTaskTemplateContext("infographic")}
          selectedPalette={{}}
          onPaletteChange={onChange}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("radio", { name: "插畫" }));
    fireEvent.click(screen.getByRole("radio", { name: "繪本" }));

    expect(onChange).toHaveBeenLastCalledWith({ paintStyle: ["繪本"] });
  });

  it("returns the selected preset and renders its local preview asset", () => {
    const onSelect = vi.fn();
    render(
      <StylePresetPicker
        selectedPresetId={null}
        onSelect={onSelect}
        presets={STYLE_PRESETS.slice(0, 1)}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "晨光編輯感" }));

    expect(onSelect).toHaveBeenCalledWith(STYLE_PRESETS[0]);
    expect(screen.getByRole("img", { name: "晨光編輯感 預覽" })).toHaveAttribute(
      "src",
      "/style-presets/dawn-editorial.svg"
    );
  });

  it("keeps the source panel usable inside the application's router", () => {
    render(
      <MemoryRouter>
        <StyleSourceTabs
          open
          templateContext={buildTaskTemplateContext("infographic")}
          selectedPalette={{}}
          onPaletteChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("資訊圖引擎設定")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /風格預設/ })).toBeInTheDocument();
  });
});
