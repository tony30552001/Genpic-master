import { describe, expect, it } from "vitest";
import { deriveGptImageEditEndpoint } from "../config";

describe("config", () => {
  it("derives Azure GPT image edit endpoints with deployment path", () => {
    const endpoint = deriveGptImageEditEndpoint(
      "https://image-resource.openai.azure.com/openai/v1/images/generations?api-version=preview",
      "gpt-image-2"
    );

    expect(endpoint).toBe(
      "https://image-resource.openai.azure.com/openai/deployments/gpt-image-2/images/edits?api-version=preview"
    );
  });

  it("keeps non-Azure OpenAI-compatible endpoint derivation", () => {
    const endpoint = deriveGptImageEditEndpoint("https://api.openai.com/v1/images/generations");

    expect(endpoint).toBe("https://api.openai.com/v1/images/edits");
  });

  it("preserves explicit Azure edit deployment names", () => {
    const endpoint = deriveGptImageEditEndpoint(
      "https://image-resource.openai.azure.com/openai/deployments/custom-image-deployment/images/edits?api-version=2025-04-01",
      "gpt-image-2"
    );

    expect(endpoint).toBe(
      "https://image-resource.openai.azure.com/openai/deployments/custom-image-deployment/images/edits?api-version=2025-04-01"
    );
  });
});
