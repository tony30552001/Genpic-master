import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeckSlideRail from "../DeckSlideRail";

describe("DeckSlideRail", () => {
  afterEach(() => cleanup());

  it("renders nothing before the page count is known", () => {
    const { container } = render(<DeckSlideRail total={0} slides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a row for every planned page and a thumbnail only for authored ones", () => {
    render(
      <DeckSlideRail
        total={3}
        slides={[{ slideNumber: 1, revision: 1, title: "封面" }]}
        previews={{ 1: { revision: 1, title: "封面", url: "blob:slide-1" } }}
        activeSlideNumber={2}
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByAltText("第 1 頁預覽")).toHaveAttribute("src", "blob:slide-1");
    expect(screen.queryByAltText("第 2 頁預覽")).not.toBeInTheDocument();
    expect(screen.getByText("設計中…")).toBeInTheDocument();
    expect(screen.getByText("尚未產出")).toBeInTheDocument();
  });

  it("only lets an authored page be selected", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DeckSlideRail
        total={2}
        slides={[{ slideNumber: 1, revision: 1, title: "封面" }]}
        previews={{ 1: { revision: 1, title: "封面", url: "blob:slide-1" } }}
        onSelect={onSelect}
      />
    );

    const authored = screen.getByRole("button", { name: "第 1 頁：封面" });
    const pending = screen.getByRole("button", { name: "第 2 頁" });
    expect(pending).toBeDisabled();

    await user.click(authored);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("clears the selection when the selected page is clicked again", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DeckSlideRail
        total={1}
        slides={[{ slideNumber: 1, revision: 1, title: "封面" }]}
        previews={{ 1: { revision: 1, title: "封面", url: "blob:slide-1" } }}
        selectedSlideNumber={1}
        onSelect={onSelect}
      />
    );

    const selected = screen.getByRole("button", { name: "第 1 頁：封面" });
    expect(selected).toHaveAttribute("aria-pressed", "true");

    await user.click(selected);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
