import { describe, expect, it } from "vitest";
import {
  APP_ICON_MAP,
  APP_IDS,
  DEFAULT_VISIBLE_APPS,
  isAdditiveAppId,
  isProxyAppId,
  PROXY_APP_IDS,
} from "@/config/appConfig";
import { getIcon, hasIcon } from "@/icons/extracted";

describe("appConfig provider lifecycle", () => {
  it.each(["opencode", "openclaw", "hermes", "pi"])(
    "classifies %s as additive",
    (appId) => {
      expect(isAdditiveAppId(appId)).toBe(true);
    },
  );

  it.each(["claude", "claude-desktop", "codex", "gemini", "grokbuild"])(
    "does not classify %s as additive",
    (appId) => {
      expect(isAdditiveAppId(appId)).toBe(false);
    },
  );
});

describe("Kilo app registration", () => {
  it("registers Kilo in the app list", () => {
    expect(APP_IDS).toContain("kilo");
  });

  it("shows Kilo by default so the icon can appear on the homepage", () => {
    expect(DEFAULT_VISIBLE_APPS.kilo).toBe(true);
  });

  it("maps Kilo to a display label", () => {
    expect(APP_ICON_MAP.kilo.label).toBe("Kilo");
  });

  it("registers the Kilo Code brand icon", () => {
    expect(hasIcon("kilo")).toBe(true);
    expect(getIcon("kilo")).toContain("<title>Kilo Code</title>");
    expect(getIcon("kilo")).toContain('viewBox="0 0 24 24"');
  });

  it("no longer registers GLM as an app", () => {
    expect(APP_IDS).not.toContain("glm");
  });
});

describe("Kilo proxy classification", () => {
  it("includes kilo in PROXY_APP_IDS", () => {
    expect(PROXY_APP_IDS).toContain("kilo");
  });

  it("classifies kilo as a proxy app", () => {
    expect(isProxyAppId("kilo")).toBe(true);
  });
});
