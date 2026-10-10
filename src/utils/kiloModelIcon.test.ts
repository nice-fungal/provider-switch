import { describe, expect, it } from "vitest";
import { hasIcon, isUrlIcon } from "@/icons/extracted";
import { resolveKiloModelIcon } from "./kiloModelIcon";

describe("resolveKiloModelIcon", () => {
  it("registers the Z.ai SVG as a URL icon", () => {
    expect(hasIcon("zai")).toBe(true);
    expect(isUrlIcon("zai")).toBe(true);
  });

  it.each(["glm", "glm-5.3", "GLM_4", "glm.5", "ZHIPU/GLM-5.3"])(
    "maps %s to the GLM icon",
    (modelId) => {
      expect(resolveKiloModelIcon(modelId)).toBe("zai");
    },
  );

  it.each(["myglm-5", "custom-glm-5", "qwen3"])(
    "does not loosely match %s",
    (modelId) => {
      expect(resolveKiloModelIcon(modelId)).toBeUndefined();
    },
  );

});
