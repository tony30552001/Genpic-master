import { describe, expect, it } from "vitest";

import {
  DECK_CANVAS_HEIGHT,
  DECK_CANVAS_WIDTH,
  DECK_IMAGE_ROLES,
  PAGE_ROLES,
} from "../deckContract";
import {
  DECK_FRAMES,
  DECK_FRAME_IDS,
  DEFAULT_FRAME_BY_PAGE_ROLE,
  FRAME_SAFE_AREA,
  describeFrameCatalog,
  describeFrameGeometry,
  framesForPageRole,
  getFrame,
  normalizeFrameId,
} from "../deckFrames";

const frames = DECK_FRAME_IDS.map((id) => DECK_FRAMES[id]);

/** Two rectangles overlap only when they share area on both axes. */
const overlaps = (a, b) => {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
};

describe("frame geometry", () => {
  it.each(frames.map((item) => [item.id, item]))(
    "%s keeps every module inside the canvas",
    (_id, item) => {
      for (const module of item.modules) {
        const [x, y, width, height] = module.bounds;
        expect(width, `${module.id} width`).toBeGreaterThan(0);
        expect(height, `${module.id} height`).toBeGreaterThan(0);
        expect(x, `${module.id} left`).toBeGreaterThanOrEqual(0);
        expect(y, `${module.id} top`).toBeGreaterThanOrEqual(0);
        expect(x + width, `${module.id} right`).toBeLessThanOrEqual(DECK_CANVAS_WIDTH);
        expect(y + height, `${module.id} bottom`).toBeLessThanOrEqual(DECK_CANVAS_HEIGHT);
      }
    }
  );

  it.each(frames.map((item) => [item.id, item]))(
    "%s keeps non-bleed modules inside the safe area",
    (_id, item) => {
      for (const module of item.modules.filter((entry) => !entry.bleed)) {
        const [x, y, width, height] = module.bounds;
        expect(x, `${module.id} left`).toBeGreaterThanOrEqual(FRAME_SAFE_AREA.left);
        expect(y, `${module.id} top`).toBeGreaterThanOrEqual(FRAME_SAFE_AREA.top);
        expect(x + width, `${module.id} right`).toBeLessThanOrEqual(FRAME_SAFE_AREA.right);
        expect(y + height, `${module.id} bottom`).toBeLessThanOrEqual(FRAME_SAFE_AREA.bottom);
      }
    }
  );

  it.each(frames.map((item) => [item.id, item]))(
    "%s never overlaps two non-bleed modules",
    (_id, item) => {
      const solid = item.modules.filter((entry) => !entry.bleed);
      for (let i = 0; i < solid.length; i += 1) {
        for (let j = i + 1; j < solid.length; j += 1) {
          expect(
            overlaps(solid[i].bounds, solid[j].bounds),
            `${solid[i].id} overlaps ${solid[j].id}`
          ).toBe(false);
        }
      }
    }
  );

  it("gives every module a unique id within its frame", () => {
    for (const item of frames) {
      const ids = item.modules.map((module) => module.id);
      expect(new Set(ids).size, `${item.id} module ids`).toBe(ids.length);
    }
  });
});

describe("frame catalog integrity", () => {
  it("keeps frame ids unique", () => {
    expect(new Set(DECK_FRAME_IDS).size).toBe(DECK_FRAME_IDS.length);
  });

  it("declares only known page roles, and at least one per frame", () => {
    for (const item of frames) {
      expect(item.pageRoles.length, `${item.id} page roles`).toBeGreaterThan(0);
      for (const role of item.pageRoles) {
        expect(PAGE_ROLES.has(role), `${item.id} declares ${role}`).toBe(true);
      }
    }
  });

  it("covers every page role with a usable default", () => {
    for (const role of PAGE_ROLES) {
      const fallback = DEFAULT_FRAME_BY_PAGE_ROLE[role];
      expect(fallback, `default for ${role}`).toBeTruthy();
      expect(getFrame(fallback).pageRoles).toContain(role);
      expect(framesForPageRole(role).length).toBeGreaterThan(0);
    }
  });

  it("orders every points range from low to high", () => {
    for (const item of frames) {
      const [min, max] = item.pointsRange;
      expect(min, `${item.id} min`).toBeGreaterThanOrEqual(0);
      expect(max, `${item.id} max`).toBeGreaterThanOrEqual(min);
    }
  });
});

describe("image-dependent frames", () => {
  it("names a real module to hold the picture", () => {
    for (const item of frames) {
      if (!item.imageRole) {
        expect(item.imageModule, `${item.id}`).toBeNull();
        continue;
      }
      expect(DECK_IMAGE_ROLES, `${item.id} role`).toContain(item.imageRole);
      expect(
        item.modules.some((module) => module.id === item.imageModule),
        `${item.id} image module ${item.imageModule}`
      ).toBe(true);
    }
  });

  it("gives every illustrated frame an illustration-free fallback", () => {
    for (const item of frames.filter((entry) => entry.imageRole)) {
      const fallback = getFrame(item.fallbackWithoutImage);
      expect(fallback, `${item.id} fallback`).toBeTruthy();
      expect(fallback.imageRole, `${fallback.id} must not need an image`).toBeNull();
      expect(fallback.pageRoles).toEqual(expect.arrayContaining(item.pageRoles));
    }
  });

  it("never declares a fallback on a frame that needs no image", () => {
    for (const item of frames.filter((entry) => !entry.imageRole)) {
      expect(item.fallbackWithoutImage, `${item.id}`).toBeNull();
    }
  });
});

describe("normalizeFrameId", () => {
  it("keeps a frame that serves the page role", () => {
    expect(normalizeFrameId("compare-2col", "content")).toBe("compare-2col");
    expect(normalizeFrameId("cover-bleed", "cover")).toBe("cover-bleed");
  });

  it("falls back by page role for missing or invented frames", () => {
    expect(normalizeFrameId(undefined, "content")).toBe("content-bullets");
    expect(normalizeFrameId("", "cover")).toBe("cover-centered");
    expect(normalizeFrameId("does-not-exist", "ending")).toBe("ending-statement");
  });

  it("rejects a real frame that serves a different page role", () => {
    expect(normalizeFrameId("cover-bleed", "content")).toBe("content-bullets");
    expect(normalizeFrameId("matrix-2x2", "cover")).toBe("cover-centered");
  });
});

describe("frame descriptions", () => {
  it("lists every frame in the catalog without leaking geometry", () => {
    const catalog = describeFrameCatalog();
    for (const item of frames) {
      expect(catalog).toContain(item.id);
      expect(catalog).toContain(item.intent);
    }
    expect(catalog).not.toContain("data-pptx-bounds");
  });

  it("emits exact bounds for one frame only", () => {
    const geometry = describeFrameGeometry("compare-2col");
    expect(geometry).toContain('<g id="left-body" data-pptx-bounds="96 290 512 350">');
    expect(geometry).toContain('<g id="right-head" data-pptx-bounds="672 200 512 70">');
    expect(geometry).not.toContain("matrix-2x2");
    expect(geometry).not.toContain("quadrant-1");
  });

  it("marks optional and bleed modules so the author can act on them", () => {
    expect(describeFrameGeometry("kpi-three")).toContain("（可省略）");
    expect(describeFrameGeometry("cover-bleed")).toContain("不受安全邊界限制");
  });

  it("returns nothing for an unknown frame", () => {
    expect(describeFrameGeometry("nope")).toBe("");
  });
});
