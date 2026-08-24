import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policyPath = resolve(
  process.cwd(),
  "infra/azure/storage-lifecycle-policy.json"
);

describe("Azure upload lifecycle policy", () => {
  it("deletes only abandoned staging block blobs after two days", () => {
    const policy = JSON.parse(readFileSync(policyPath, "utf8"));
    expect(policy.rules).toHaveLength(1);

    const rule = policy.rules[0];
    expect(rule).toMatchObject({
      enabled: true,
      name: "delete-abandoned-user-upload-staging",
      type: "Lifecycle",
    });
    expect(rule.definition.filters).toEqual({
      blobTypes: ["blockBlob"],
      prefixMatch: ["uploads/staging/"],
    });
    expect(rule.definition.actions.baseBlob.delete).toEqual({
      daysAfterModificationGreaterThan: 2,
    });

    const serialized = JSON.stringify(policy);
    expect(serialized).not.toContain("uploads/ready/");
    expect(rule.definition.filters.prefixMatch).not.toContain("uploads/");
    expect(serialized).not.toMatch(/tierToCool|archive|deleteSnapshots/i);
  });
});
