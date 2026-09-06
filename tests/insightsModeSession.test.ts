import { describe, expect, it } from "vitest";
import { INSIGHTS_MODE_SESSION_KEY, readInsightsMode, saveInsightsMode } from "../src/renderer/insightsModeSession";

function memorySession() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

describe("Insights mode session", () => {
  it("defaults a fresh app session to Deck Insights", () => {
    expect(readInsightsMode(memorySession())).toBe("deck");
    expect(readInsightsMode()).toBe("deck");
  });

  it("restores the chosen mode on re-entry and keeps separate app sessions independent", () => {
    const session = memorySession();
    saveInsightsMode("coach", session);
    expect(readInsightsMode(session)).toBe("coach");
    expect(readInsightsMode(memorySession())).toBe("deck");
    saveInsightsMode("deck", session);
    expect(readInsightsMode(session)).toBe("deck");
  });

  it("ignores unknown stored modes and tolerates blocked storage", () => {
    const session = memorySession();
    session.setItem(INSIGHTS_MODE_SESSION_KEY, "legacy-explorer");
    expect(readInsightsMode(session)).toBe("deck");
    const unavailable = {
      getItem: () => { throw new Error("Storage is blocked"); },
      setItem: () => { throw new Error("Storage is full"); }
    };
    expect(readInsightsMode(unavailable)).toBe("deck");
    expect(() => saveInsightsMode("coach", unavailable)).not.toThrow();
    expect(() => saveInsightsMode("coach")).not.toThrow();
  });
});
