import { describe, expect, it, vi } from "vitest";
import {
  REPLAY_COACH_SESSION_STORAGE_KEY, readReplayCoachSession, writeReplayCoachSession,
  type ReplayCoachSession
} from "../src/renderer/replayCoachSession.js";

const draft: ReplayCoachSession = {
  step: "context", selectedId: "moment-1", journalFocusId: "", focusId: "focus-1",
  reflection: "intentional", note: "  My unfinished note\n", trigger: "When Jhin is in hand",
  cue: "Name my early play", target: 3, goalId: "goal-1", conclusion: "Still considering this."
};

function memoryStorage(raw?: string) {
  let value = raw ?? null;
  return {
    getItem: vi.fn((_key: string) => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; })
  };
}

describe("Replay Coach temporary navigation session", () => {
  it("restores the selected moment and exact unfinished drafts after returning from evidence", () => {
    const storage = memoryStorage();
    expect(writeReplayCoachSession(storage, draft)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(REPLAY_COACH_SESSION_STORAGE_KEY, expect.any(String));
    expect(readReplayCoachSession(storage)).toEqual(draft);
    expect(draft.note).toBe("  My unfinished note\n");
  });

  it.each(["review", "context", "practice", "checkin"] as const)("retains %s navigation and legacy four-game targets", (step) => {
    const storage = memoryStorage();
    const session = { ...draft, step, target: 4, journalFocusId: "saved-focus" };
    expect(writeReplayCoachSession(storage, session)).toBe(true);
    expect(readReplayCoachSession(storage)).toEqual(session);
  });

  it("whitelists stored fields and bounds text without mutating the draft", () => {
    const storage = memoryStorage();
    const session = { ...draft, note: "x".repeat(5_000), unexpected: "Do not retain this" };
    expect(writeReplayCoachSession(storage, session)).toBe(true);
    const restored = readReplayCoachSession(storage)!;
    expect(restored.note).toHaveLength(4_000);
    expect(restored).not.toHaveProperty("unexpected");
    expect(session.note).toHaveLength(5_000);
    const raw = JSON.parse(storage.getItem(REPLAY_COACH_SESSION_STORAGE_KEY)!);
    expect(raw).not.toHaveProperty("unexpected");
  });

  it.each([
    "{malformed", "null", "[]", "42", "{}",
    JSON.stringify({ version: 2, ...draft }),
    JSON.stringify({ version: 1, ...draft, step: "publish" }),
    JSON.stringify({ version: 1, ...draft, reflection: "invalid" }),
    JSON.stringify({ version: 1, ...draft, target: 99 }),
    JSON.stringify({ version: 1, ...draft, note: {} })
  ])("safely ignores an invalid temporary session: %s", (raw) => {
    const storage = memoryStorage(raw);
    expect(readReplayCoachSession(storage)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(REPLAY_COACH_SESSION_STORAGE_KEY)).toBe(raw);
  });

  it("allows replay navigation to continue when session storage is missing or unavailable", () => {
    expect(readReplayCoachSession()).toBeNull();
    expect(readReplayCoachSession(memoryStorage())).toBeNull();
    expect(readReplayCoachSession({ getItem: () => { throw new Error("Storage disabled"); } })).toBeNull();
    expect(writeReplayCoachSession({ setItem: () => { throw new Error("Storage full"); } }, draft)).toBe(false);
  });

  it("does not replace a saved session with malformed runtime input", () => {
    const storage = memoryStorage();
    writeReplayCoachSession(storage, draft);
    const saved = storage.getItem(REPLAY_COACH_SESSION_STORAGE_KEY);
    expect(writeReplayCoachSession(storage, { ...draft, target: Number.NaN })).toBe(false);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem(REPLAY_COACH_SESSION_STORAGE_KEY)).toBe(saved);
  });
});
