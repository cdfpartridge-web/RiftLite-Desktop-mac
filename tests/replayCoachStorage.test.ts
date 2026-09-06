import { describe, expect, it, vi } from "vitest";
import {
  REPLAY_COACHING_STORAGE_KEY,
  createReplayCoachingFocus,
  defineReplayCoachingExperiment,
  emptyReplayCoachingStore,
  recordReplayCoachingGame,
  reflectOnReplayInsight,
  saveReplayCoachingConclusion,
  serializeReplayCoachingStore,
  startReplayCoachingExperiment,
  type ReplayCoachingFocus
} from "../src/shared/replayCoaching.js";
import { readReplayCoachState, saveReplayCoachFocus } from "../src/renderer/replayCoachStorage.js";

const START = "2026-09-01T12:00:00.000Z";

function storageWith(raw?: string) {
  const values = new Map<string, string>(raw === undefined ? [] : [[REPLAY_COACHING_STORAGE_KEY, raw]]);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); })
  };
}

function focus(id = "focus-1"): ReplayCoachingFocus {
  return createReplayCoachingFocus({
    id,
    now: START,
    insight: { id: `moment-${id}`, title: "What was your plan for this keep?", replayId: `replay-${id}`, gameNumber: 1 },
    eligibility: { deckKey: "jhin", deckVersionId: "deck-hash-v3", opponentLegend: "Annie", initiative: "2nd", gameStage: "preboard" }
  });
}

function trial(id = "focus-1"): ReplayCoachingFocus {
  return startReplayCoachingExperiment(defineReplayCoachingExperiment(
    reflectOnReplayInsight(focus(id), "intentional", "I kept Jhin because the rest of the hand could develop early.", START),
    {
      hypothesis: "When Jhin is in my opening hand",
      process: "I will name the early play before deciding to keep him.",
      targetEligibleGames: 3,
      goalId: "goal-clear-openings",
      goalText: "Make a clear opening plan",
      notebookDeckId: "saved-jhin"
    }, START
  ), START);
}

function completedTrial(): ReplayCoachingFocus {
  let value = trial();
  for (let index = 1; index <= 3; index += 1) {
    const result = recordReplayCoachingGame(value, {
      id: `later-game-${index}`,
      capturedAt: `2026-09-0${index + 1}T12:00:00.000Z`,
      deckKey: "jhin", deckVersionId: "deck-hash-v3", opponentLegend: "Annie",
      initiative: "2nd", gameNumber: 1, result: "Win"
    }, index === 2 ? "adapted" : "followed", `My note for game ${index}`);
    expect(result.recorded).toBe(true);
    value = result.focus;
  }
  return value;
}

describe("Replay Coach local journal", () => {
  it("round-trips the real reflection, check-ins, goal link and completed conclusion", () => {
    const storage = storageWith();
    const active = saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), completedTrial(), true);
    const finished = saveReplayCoachingConclusion(active.focuses[0]!, {
      note: "The cue helped me explain the keep. I will retain it.", decision: "finish-practice"
    });
    const saved = saveReplayCoachFocus(storage, active, finished);
    const restored = readReplayCoachState(storage);
    expect(restored.error).toBe("");
    expect(restored.store).toEqual(saved);
    expect(restored.store.activeFocusId).toBeUndefined();
    expect(restored.store.focuses[0]).toMatchObject({
      status: "learned",
      reflection: { value: "intentional", note: "I kept Jhin because the rest of the hand could develop early." },
      experiment: { goalId: "goal-clear-openings", goalText: "Make a clear opening plan", notebookDeckId: "saved-jhin" },
      conclusions: [{ note: "The cue helped me explain the keep. I will retain it.", decision: "finish-practice" }]
    });
    expect(restored.store.focuses[0]!.experiment!.games).toHaveLength(3);
    expect(restored.store.focuses[0]!.experiment!.games[1]).toMatchObject({ adherence: "adapted", note: "My note for game 2" });
  });

  it("keeps a previous trial and conclusion when continued practice is reloaded", () => {
    const completed = completedTrial();
    const continued = saveReplayCoachingConclusion(completed, {
      note: "I want another three opportunities before deciding.", decision: "keep-practising"
    }, "2026-09-05T12:00:00.000Z");
    const storage = storageWith();
    saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), continued, true);
    const restored = readReplayCoachState(storage).store.focuses[0]!;
    expect(restored.experimentHistory).toEqual([completed.experiment]);
    expect(restored.experiment!.games).toEqual([]);
    expect(restored.experiment!.startedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(restored.conclusions?.[0]?.experimentId).toBe(completed.experiment!.id);
  });

  it("merges against the latest persisted journal, retaining newer unrelated entries", () => {
    const storage = storageWith();
    const staleView = saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), focus("first"));
    const newerNote = reflectOnReplayInsight(focus("second"), "forced", "The resource constraints mattered.");
    saveReplayCoachFocus(storage, staleView, newerNote);
    const updatedFirst = reflectOnReplayInsight(staleView.focuses[0]!, "intentional", "I had a clear plan.");
    const latest = saveReplayCoachFocus(storage, staleView, updatedFirst);
    expect(latest.focuses).toEqual([updatedFirst, newerNote]);
    expect(readReplayCoachState(storage).store.focuses).toEqual([updatedFirst, newerNote]);
    expect(staleView.focuses).toHaveLength(1);
    expect(staleView.focuses[0]!.reflection).toBeUndefined();
  });

  it("rejects a stale update to the same focus and preserves its newer check-ins", () => {
    const storage = storageWith();
    const staleView = saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), trial(), true);
    const checkin = recordReplayCoachingGame(staleView.focuses[0]!, {
      id: "newer-checkin", capturedAt: "2026-09-02T12:00:00.000Z",
      deckKey: "jhin", deckVersionId: "deck-hash-v3", opponentLegend: "Annie",
      initiative: "2nd", gameNumber: 1, result: "Win"
    }, "adapted", "I changed the plan because the hand called for it.", START);
    expect(checkin.recorded).toBe(true);
    const latest = saveReplayCoachFocus(storage, staleView, checkin.focus);
    const persisted = storage.getItem(REPLAY_COACHING_STORAGE_KEY);
    const writesBefore = storage.setItem.mock.calls.length;
    const staleEdit = reflectOnReplayInsight(staleView.focuses[0]!, "forced", "An edit from the older view.", START);
    expect(() => saveReplayCoachFocus(storage, staleView, staleEdit)).toThrow("changed in another view");
    expect(storage.setItem).toHaveBeenCalledTimes(writesBefore);
    expect(storage.getItem(REPLAY_COACHING_STORAGE_KEY)).toBe(persisted);
    expect(readReplayCoachState(storage).store).toEqual(latest);
    expect(readReplayCoachState(storage).store.focuses[0]!.experiment!.games).toMatchObject([
      { id: "newer-checkin", adherence: "adapted", note: "I changed the plan because the hand called for it." }
    ]);
    expect(staleView.focuses[0]!.experiment!.games).toHaveLength(0);
  });

  it("pauses the previous active trial without changing its check-ins", () => {
    const storage = storageWith();
    const first = completedTrial();
    const current = saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), first, true);
    const next = saveReplayCoachFocus(storage, current, trial("second"), true);
    const previous = next.focuses.find((item) => item.id === first.id)!;
    expect(next.activeFocusId).toBe("second");
    expect(previous.status).toBe("paused");
    expect(previous.experiment!.games).toEqual(first.experiment!.games);
    expect(previous.statusHistory.at(-1)).toMatchObject({ status: "paused", note: "Another practice cue was selected" });
    expect(current.focuses[0]!.status).toBe("testing");
    expect(readReplayCoachState(storage).store).toEqual(next);
  });

  it("throws on storage failure before a caller can publish a saved state", () => {
    const storage = storageWith();
    const current = saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), trial(), true);
    const originalBytes = storage.getItem(REPLAY_COACHING_STORAGE_KEY);
    const originalState = serializeReplayCoachingStore(current);
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    let visibleState = current;
    expect(() => {
      visibleState = saveReplayCoachFocus(storage, current, trial("replacement"), true);
    }).toThrow("Quota exceeded");
    expect(visibleState).toBe(current);
    expect(serializeReplayCoachingStore(current)).toBe(originalState);
    expect(storage.getItem(REPLAY_COACHING_STORAGE_KEY)).toBe(originalBytes);
    expect(current.focuses[0]!.status).toBe("testing");
  });

  it.each([
    ["invalid JSON", "{broken"],
    ["unknown format", "42"],
    ["future version", JSON.stringify({ version: 2, focuses: [] })],
    ["partially corrupt journal", JSON.stringify({ version: 1, focuses: [focus(), { id: "unreadable" }] })]
  ])("leaves %s untouched and refuses a replacement save", (_label, raw) => {
    const storage = storageWith(raw);
    expect(readReplayCoachState(storage).error).toContain("left untouched");
    expect(() => saveReplayCoachFocus(storage, emptyReplayCoachingStore(START), focus())).toThrow("left untouched");
    expect(storage.getItem(REPLAY_COACHING_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reads a legacy journal without rewriting it until a requested save", () => {
    const raw = JSON.stringify([{ id: "legacy", insightId: "old-moment", title: "Old review", reflection: "intentional", reflectionNote: "My old note" }]);
    const storage = storageWith(raw);
    const loaded = readReplayCoachState(storage);
    expect(loaded.error).toBe("");
    expect(loaded.store.focuses[0]).toMatchObject({ id: "legacy", reflection: { value: "intentional", note: "My old note" } });
    expect(storage.getItem(REPLAY_COACHING_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    const saved = saveReplayCoachFocus(storage, loaded.store, focus());
    expect(saved.focuses.map((item) => item.id)).toEqual(["focus-1", "legacy"]);
    expect(readReplayCoachState(storage).store).toEqual(saved);
  });

  it("keeps the journal intact at capacity while allowing updates to an existing entry", () => {
    const source = { ...emptyReplayCoachingStore(START), focuses: Array.from({ length: 100 }, (_, index) => focus(`focus-${index}`)) };
    const original = serializeReplayCoachingStore(source);
    const storage = storageWith(original);
    expect(() => saveReplayCoachFocus(storage, source, focus("overflow"))).toThrow("100-entry limit");
    expect(storage.getItem(REPLAY_COACHING_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    const updated = reflectOnReplayInsight(source.focuses[0]!, "intentional", "An updated note.");
    expect(saveReplayCoachFocus(storage, source, updated).focuses).toHaveLength(100);
    expect(readReplayCoachState(storage).store.focuses[0]!.reflection?.note).toBe("An updated note.");
  });
});
