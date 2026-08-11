import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { optimizePrompt } from "@/services/aiService";
import AssetMetadataSheet from "../AssetMetadataSheet";

vi.mock("@/services/aiService", () => ({
  optimizePrompt: vi.fn(),
}));

describe("AssetMetadataSheet", () => {
  it("optimizes a style description with the existing AI service", async () => {
    optimizePrompt.mockResolvedValue({
      optimizedPromptZh: "融合細膩紙張紋理、柔和筆觸與溫暖自然光的水彩手作風格。",
      optimizedPromptEn: "watercolor handmade style",
      explanation: "補充了材質、筆觸與光線細節。",
    });

    render(
      <AssetMetadataSheet
        asset={{
          id: "style-1",
          name: "水彩手作感",
          description: "柔和的紙張與筆觸",
          tags: ["插畫"],
        }}
        type="style"
        isSaving={false}
        error=""
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "使用 AI 優化風格描述" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("融合細膩紙張紋理、柔和筆觸與溫暖自然光的水彩手作風格。")).toBeInTheDocument();
    });
    expect(optimizePrompt).toHaveBeenCalledWith({
      userScript: "柔和的紙張與筆觸",
      styleContext: "風格名稱：水彩手作感；現有標籤：插畫",
    });
    expect(screen.getByText("補充了材質、筆觸與光線細節。")).toBeInTheDocument();
  });
});
