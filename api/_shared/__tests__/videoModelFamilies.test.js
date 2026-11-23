import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildVideoRequest,
  validateVideoOptions,
} = require("../videoModelFamilies");

const h3 = {
  family: "minimax-h3-max",
  deploymentName: "Fal-MiniMax-H3-Max",
  maxDurationSeconds: 15,
  maxResolution: "1080P",
  allowAudio: true,
};
const kling = {
  family: "kling-v3-pro",
  deploymentName: "Fal-Kling-V3-Pro",
  maxDurationSeconds: 15,
  maxResolution: null,
  allowAudio: true,
};

describe("video model families", () => {
  it("builds the H3 request shape and disables provider prompt expansion", () => {
    const options = validateVideoOptions({
      model: h3,
      mode: "t2v",
      durationSeconds: 5,
      resolution: "768P",
      aspectRatio: "16:9",
      generateAudio: false,
    });
    const request = buildVideoRequest({
      model: h3,
      prompt: "A slow camera move",
      options,
      mode: "t2v",
    });
    expect(request.path).toBe("minimax/h3-max/text-to-video");
    expect(request.body).toMatchObject({
      model: "Fal-MiniMax-H3-Max",
      duration: 5,
      resolution: "768P",
      prompt_expansion_mode: "disabled",
      enable_safety_checker: true,
    });
  });

  it("uses Kling duration strings and an image-specific first-frame field", () => {
    const options = validateVideoOptions({
      model: kling,
      mode: "i2v",
      durationSeconds: 3,
      generateAudio: false,
    });
    const request = buildVideoRequest({
      model: kling,
      prompt: "Continue this shot",
      options,
      mode: "i2v",
      imageDataUrl: "data:image/jpeg;base64,abc",
      endImageDataUrl: "data:image/jpeg;base64,def",
    });
    expect(request.body).toMatchObject({
      duration: "3",
      generate_audio: false,
      start_image_url: "data:image/jpeg;base64,abc",
      end_image_url: "data:image/jpeg;base64,def",
    });
    expect(request.body).not.toHaveProperty("resolution");
  });

  it("enforces catalog and family limits", () => {
    expect(() => validateVideoOptions({
      model: { ...h3, maxDurationSeconds: 3 },
      mode: "t2v",
      durationSeconds: 5,
      resolution: "768P",
      aspectRatio: "16:9",
    })).toThrow(/秒數/);
    expect(() => validateVideoOptions({
      model: { ...h3, maxResolution: "480P" },
      mode: "t2v",
      durationSeconds: 3,
      resolution: "1080P",
      aspectRatio: "16:9",
    })).toThrow(/上限/);
    expect(() => validateVideoOptions({
      model: kling,
      mode: "t2v",
      durationSeconds: 3,
      aspectRatio: "21:9",
    })).toThrow(/比例/);
  });
});
