import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { paths } = require("../../openapi");

describe("image model API contracts", () => {
  it("documents async-only generation and transformations", () => {
    for (const path of ["/api/generate-images", "/api/image-transform"]) {
      expect(paths[path].post.responses).toHaveProperty("202");
      expect(paths[path].post.responses).not.toHaveProperty("200");
      expect(paths[path].post.requestBody.content["application/json"].schema.properties.quality.enum)
        .toEqual(["low", "medium", "high", "xhigh", "max", "auto"]);
    }
  });

  it("requires a successful job reference to create history", () => {
    expect(paths["/api/history"].post.requestBody.content["application/json"].schema.required)
      .toEqual(["jobId", "imageUrl"]);
    expect(paths["/api/history"].post.responses).toHaveProperty("409");
  });

  it("documents secret-free catalogs and write-only keys", () => {
    const catalog = paths["/api/management/image-models"];
    expect(catalog.post.requestBody.content["application/json"].schema.properties.apiKey.writeOnly).toBe(true);
    const response = catalog.get.responses[200].content["application/json"].schema;
    expect(response.properties.models.items.properties).not.toHaveProperty("apiKey");
    expect(response.properties.models.items.properties.hasApiKey.type).toBe("boolean");
    const profile = paths["/api/me"].get.responses[200].content["application/json"].schema;
    expect(profile.properties.imageModels.items.properties).not.toHaveProperty("endpoint");
    expect(profile.properties.imageModels.items.properties).not.toHaveProperty("hasApiKey");
  });

  it("documents saved-model tests as explicit billed jobs guarded by CSRF", () => {
    const test = paths["/api/management/image-model-tests"].post;
    expect(test.responses).toHaveProperty("202");
    expect(test.parameters).toContainEqual(expect.objectContaining({ name: "X-CSRF-Token", required: true }));
    expect(test.requestBody.content["application/json"].schema.required).toContain("modelKey");
  });

  it("documents the pinned deck image model without requiring it for image-free decks", () => {
    const admission = paths["/api/deck-jobs"].post.responses[202].content["application/json"].schema;
    expect(admission.properties.model.type).toBe("string");
    expect(admission.required).not.toContain("model");
    expect(paths["/api/deck-jobs/{id}"].get.responses[200].content["application/json"].schema.properties.model).toBeDefined();
  });
});
