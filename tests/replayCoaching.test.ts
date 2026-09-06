import { describe, expect, it } from "vitest";

import {
  REPLAY_COACHING_STORAGE_VERSION,
  createReplayCoachingFocus,
  defineReplayCoachingExperiment,
  hasReplayCoachingPracticeScope,
  isReplayCoachingGameEligible,
  isReplayCoachingGameEligibleForFocus,
  parseReplayCoachingStore,
  recordReplayCoachingGame,
  reflectOnReplayInsight,
  replayCoachingCanTransition,
  replayCoachingProcessMetrics,
  replayCoachingProgress,
  saveReplayCoachingConclusion,
  serializeReplayCoachingStore,
  startReplayCoachingExperiment,
  transitionReplayCoachingFocus,
  type ReplayCoachingFocus,
  type ReplayCoachingGameSnapshot
} from "../src/shared/replayCoaching.js";

const START = "2026-08-25T12:00:00.000Z";

function newFocus(): ReplayCoachingFocus {
  return createReplayCoachingFocus({
    id: "focus-1",
    now: START,
    insight: {
      id: "pattern:late-charm",
      title: "Charm regularly waits after being kept",
      action: "Test redrawing Charm in faster matchups.",
      confidence: "confirmed",
      sampleSize: 8,
      cardName: "Charm",
      cardId: "OGN-173"
    },
    report: {
      generatedAt: START,
      gamesAnalyzed: 24,
      coverageGrade: "high",
      scope: { deckKey: "Ahri Tempo", opponentLegend: "Jinx" }
    },
    eligibility: { gameStage: "preboard", initiative: "1st" }
  });
}

function game(id: string, patch: Partial<ReplayCoachingGameSnapshot> = {}): ReplayCoachingGameSnapshot {
  return {
    id,
    capturedAt: new Date(Date.parse(START) + Number(id.replace(/\D/g, "") || 0) * 86_400_000).toISOString(),
    deckKey: "ahri tempo",
    opponentLegend: " jinx ",
    gameNumber: 1,
    initiative: "1st",
    result: "Win",
    ...patch
  };
}

function testingFocus(targetEligibleGames = 3): ReplayCoachingFocus {
  const reflected = reflectOnReplayInsight(newFocus(), "missed", "I kept it without an early plan.", START);
  const hypothesized = defineReplayCoachingExperiment(reflected, {
    hypothesis: "A faster redraw improves the opening plan.",
    process: "Redraw Charm unless the hand already has a turn-two play.",
    successSignal: "Follow the rule whenever the opening presents the decision.",
    targetEligibleGames,
    baseline: { eligibleGames: 6, followed: 2, missed: 3, unsure: 1 }
  }, START);
  return startReplayCoachingExperiment(hypothesized, START);
}

describe("Replay coaching", () => {
  it("copies renderer-independent insight/report snapshots and merges eligibility scope", () => {
    const focus = newFocus();

    expect(focus).toMatchObject({
      id: "focus-1",
      status: "new",
      eligibility: {
        deckKey: "Ahri Tempo",
        opponentLegend: "Jinx",
        gameStage: "preboard",
        initiative: "1st"
      },
      insight: { id: "pattern:late-charm", sampleSize: 8, cardName: "Charm", cardId: "OGN-173" },
      report: { gamesAnalyzed: 24, coverageGrade: "high" }
    });
    expect(focus.statusHistory).toEqual([{ status: "new", recordedAt: START }]);
  });

  it("records each reflection and moves a new finding into reviewed state", () => {
    const values = ["intentional", "missed", "forced", "unsure", "wrong", "already-understood"] as const;
    for (const value of values) {
      const focus = reflectOnReplayInsight(newFocus(), value, "Context note", START);
      expect(focus.status).toBe("reviewed");
      expect(focus.reflection).toEqual({ value, note: "Context note", recordedAt: START });
    }
  });

  it("enforces the lifecycle while keeping an invalid stale transition as a no-op", () => {
    expect(replayCoachingCanTransition("new", "reviewed")).toBe(true);
    expect(replayCoachingCanTransition("new", "learned")).toBe(false);

    const focus = newFocus();
    expect(transitionReplayCoachingFocus(focus, "learned", undefined, START)).toBe(focus);
    const paused = transitionReplayCoachingFocus(focus, "paused", "Come back later", START);
    expect(paused).toMatchObject({ status: "paused" });
    expect(paused.statusHistory.at(-1)).toMatchObject({ status: "paused", note: "Come back later" });
  });

  it("matches eligible games by normalized deck/opponent plus stage and initiative", () => {
    const scope = newFocus().eligibility;
    expect(isReplayCoachingGameEligible(scope, game("1"))).toBe(true);
    expect(isReplayCoachingGameEligible(scope, game("2", { opponentLegend: "Viktor" }))).toBe(false);
    expect(isReplayCoachingGameEligible(scope, game("3", { gameNumber: 2 }))).toBe(false);
    expect(isReplayCoachingGameEligible(scope, game("4", { initiative: "2nd" }))).toBe(false);
    expect(isReplayCoachingGameEligible({ gameStage: "postboard" }, game("5", { gameNumber: 2 }))).toBe(true);
  });

  it("tracks only the next three to five eligible unique games", () => {
    let focus = testingFocus(99);
    expect(focus.experiment?.targetEligibleGames).toBe(5);

    const ineligible = recordReplayCoachingGame(focus, game("1", { opponentLegend: "Viktor" }), "followed", undefined, START);
    expect(ineligible).toMatchObject({ recorded: false, reason: "ineligible" });

    for (let index = 1; index <= 5; index += 1) {
      const result = recordReplayCoachingGame(focus, game(String(index)), index === 2 ? "missed" : "followed", undefined, START);
      expect(result.recorded).toBe(true);
      focus = result.focus;
    }
    expect(recordReplayCoachingGame(focus, game("5"), "followed", undefined, START)).toMatchObject({ recorded: false, reason: "duplicate" });
    expect(recordReplayCoachingGame(focus, game("6"), "followed", undefined, START)).toMatchObject({ recorded: false, reason: "target-complete" });
    expect(replayCoachingProgress(focus)).toMatchObject({ eligibleGamesTracked: 5, gamesRemaining: 0, readyForReview: true });
  });

  it("compares process adherence before and during without treating results as the goal", () => {
    let focus = testingFocus(3);
    for (const [id, adherence, result] of [
      ["1", "followed", "Loss"],
      ["2", "followed", "Win"],
      ["3", "not-applicable", "Loss"]
    ] as const) {
      focus = recordReplayCoachingGame(focus, game(id, { result }), adherence, undefined, START).focus;
    }

    expect(replayCoachingProcessMetrics({ eligibleGames: 2, followed: 1, missed: 1 })).toMatchObject({
      opportunities: 2,
      assessedOpportunities: 2,
      adherenceRate: 50
    });
    expect(replayCoachingProgress(focus)).toEqual({
      targetEligibleGames: 3,
      eligibleGamesTracked: 2,
      gamesRemaining: 1,
      readyForReview: false,
      before: {
        eligibleGames: 6,
        followed: 2,
        adapted: 0,
        missed: 3,
        unsure: 1,
        notApplicable: 0,
        opportunities: 6,
        assessedOpportunities: 5,
        adherenceRate: 40
      },
      during: {
        eligibleGames: 3,
        followed: 2,
        adapted: 0,
        missed: 0,
        unsure: 0,
        notApplicable: 1,
        opportunities: 2,
        assessedOpportunities: 2,
        adherenceRate: 100
      },
      adherenceDeltaPercentagePoints: 60,
      results: { wins: 1, losses: 2, draws: 0, incomplete: 0 }
    });
  });

  it("round-trips v1 local persistence without executable or unknown fields", () => {
    const focus = testingFocus();
    const source = {
      version: REPLAY_COACHING_STORAGE_VERSION,
      updatedAt: START,
      activeFocusId: focus.id,
      focuses: [{ ...focus, injected: "discard me" }]
    };
    const parsed = parseReplayCoachingStore(JSON.stringify(source), START);
    const roundTrip = JSON.parse(serializeReplayCoachingStore(parsed.store));

    expect(parsed).toMatchObject({ migrated: false, discardedFocuses: 0 });
    expect(parsed.store.activeFocusId).toBe(focus.id);
    expect(roundTrip.focuses[0].injected).toBeUndefined();
    expect(roundTrip.version).toBe(REPLAY_COACHING_STORAGE_VERSION);
  });

  it("safely migrates versionless legacy data and clamps oversized experiments", () => {
    const legacy = {
      activeFocusId: "legacy-focus",
      focuses: [{
        id: "legacy-focus",
        insightId: "legacy-insight",
        title: "Old finding",
        action: "Try the old plan",
        status: "active",
        reflection: "understood",
        scope: { deckKey: "Deck A", gameStage: "preboard" },
        hypothesis: "The plan helps",
        behavior: "Follow the plan",
        targetGames: 12,
        observations: Array.from({ length: 8 }, (_, index) => ({
          id: `legacy-game-${index}`,
          capturedAt: START,
          adherence: index ? "yes" : "n/a"
        }))
      }, { id: "broken" }]
    };
    const parsed = parseReplayCoachingStore(legacy, START);
    const focus = parsed.store.focuses[0]!;

    expect(parsed).toMatchObject({ migrated: true, discardedFocuses: 1 });
    expect(focus).toMatchObject({
      status: "testing",
      reflection: { value: "already-understood" },
      eligibility: { deckKey: "Deck A", gameStage: "preboard" },
      experiment: { targetEligibleGames: 5 }
    });
    expect(focus.experiment?.games).toHaveLength(8);
    expect(focus.experiment?.games[0]?.adherence).toBe("not-applicable");
  });

  it("returns an empty safe store for corrupt JSON", () => {
    expect(parseReplayCoachingStore("{not-json", START)).toEqual({
      store: { version: REPLAY_COACHING_STORAGE_VERSION, updatedAt: START, focuses: [] },
      migrated: false,
      discardedFocuses: 0
    });
  });

  it("requires the exact recorded deck version for a fully comparable new trial", () => {
    const scope = { ...newFocus().eligibility, deckVersionId: "deck-hash-v3" };
    expect(hasReplayCoachingPracticeScope(scope)).toBe(true);
    expect(hasReplayCoachingPracticeScope({ ...scope, deckVersionId: undefined })).toBe(false);
    expect(hasReplayCoachingPracticeScope({ ...scope, opponentLegend: undefined })).toBe(false);
    expect(isReplayCoachingGameEligible(scope, game("1", { deckVersionId: "deck-hash-v3" }))).toBe(true);
    for (const deckVersionId of [undefined, "deck-hash-v2", "DECK-HASH-V3"]) {
      expect(isReplayCoachingGameEligible(scope, game("1", { deckVersionId }))).toBe(false);
    }
    const focus = { ...testingFocus(), eligibility: scope };
    const recorded = recordReplayCoachingGame(focus, game("1", { deckVersionId: "deck-hash-v3" }), "followed");
    const parsed = parseReplayCoachingStore({ version: 1, focuses: [recorded.focus] }).store.focuses[0]!;
    expect(parsed.eligibility.deckVersionId).toBe("deck-hash-v3");
    expect(parsed.experiment?.games[0]?.deckVersionId).toBe("deck-hash-v3");
  });

  it("rejects captures at or before the trial, invalid timestamps, and the originating game", () => {
    const focus = { ...testingFocus(), insight: { ...newFocus().insight, replayId: "source", matchId: "match-source", gameNumber: 1 } };
    for (const capturedAt of [START, "2026-08-24T12:00:00Z", "not a date"]) {
      expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { capturedAt }))).toBe(false);
      expect(recordReplayCoachingGame(focus, game("1", { capturedAt }), "followed").reason).toBe("ineligible");
    }
    expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { replayId: "source" }))).toBe(false);
    expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { matchId: "match-source" }))).toBe(false);
    expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { replayId: "source", gameNumber: undefined, gameStage: "preboard" }))).toBe(false);
    expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { matchId: "match-source", gameNumber: undefined, gameStage: "preboard" }))).toBe(false);
    expect(isReplayCoachingGameEligibleForFocus(focus, game("1"))).toBe(true);
    expect(isReplayCoachingGameEligibleForFocus({ ...focus, experiment: { ...focus.experiment!, startedAt: undefined } }, game("1"))).toBe(false);
  });

  it("only permits completed games to become practice check-ins", () => {
    const focus = testingFocus();
    for (const result of [undefined, "Incomplete"] as const) {
      const candidate = game("1", { result });
      expect(isReplayCoachingGameEligibleForFocus(focus, candidate)).toBe(false);
      expect(recordReplayCoachingGame(focus, candidate, "followed")).toMatchObject({ recorded: false, reason: "ineligible" });
    }
    for (const result of ["Win", "Loss", "Draw"] as const) {
      expect(isReplayCoachingGameEligibleForFocus(focus, game("1", { result }))).toBe(true);
    }
  });

  it("preserves check-ins, trial identity, and original start when editing or resuming", () => {
    const recorded = recordReplayCoachingGame(testingFocus(), game("1"), "not-applicable", "No Charm in this opening.").focus;
    const paused = transitionReplayCoachingFocus(recorded, "paused");
    const edited = defineReplayCoachingExperiment(paused, {
      hypothesis: "I want a concrete plan for this opening.",
      process: "Name the early play before keeping Charm."
    }, "2026-08-27T12:00:00Z");
    const resumed = startReplayCoachingExperiment(edited, "2026-08-28T12:00:00Z");
    expect(resumed.status).toBe("testing");
    expect(resumed.experiment).toMatchObject({
      id: recorded.experiment!.id,
      createdAt: START,
      startedAt: START,
      targetEligibleGames: 3,
      games: recorded.experiment!.games
    });
    const restored = parseReplayCoachingStore(serializeReplayCoachingStore({ version: 1, updatedAt: START, focuses: [resumed] })).store.focuses[0]!;
    expect(restored.experiment).toEqual(resumed.experiment);
  });

  it("retains no-opportunity check-ins without using up the three-game target", () => {
    let focus = testingFocus();
    for (let index = 1; index <= 6; index += 1) {
      const result = recordReplayCoachingGame(focus, game(String(index)), "not-applicable");
      expect(result.recorded).toBe(true);
      focus = result.focus;
    }
    expect(replayCoachingProgress(focus)).toMatchObject({ eligibleGamesTracked: 0, gamesRemaining: 3, readyForReview: false, during: { notApplicable: 6 } });
    for (const [id, adherence] of [["7", "followed"], ["8", "adapted"], ["9", "missed"]] as const) {
      focus = recordReplayCoachingGame(focus, game(id), adherence).focus;
    }
    expect(replayCoachingProgress(focus)).toMatchObject({
      eligibleGamesTracked: 3, gamesRemaining: 0, readyForReview: true,
      during: { adapted: 1, opportunities: 3, assessedOpportunities: 2, adherenceRate: 50 }
    });
    const restored = parseReplayCoachingStore({ version: 1, focuses: [focus] }).store.focuses[0]!;
    expect(restored.experiment?.games).toHaveLength(9);
    expect(recordReplayCoachingGame(restored, game("10"), "followed").reason).toBe("target-complete");
  });

  it("excludes an incorrect capture while retaining the correction and earlier journal", () => {
    const started = testingFocus();
    const wrong = reflectOnReplayInsight(started, "wrong", "The replay omitted the card swap.");
    expect(startReplayCoachingExperiment(wrong)).toBe(wrong);
    expect(defineReplayCoachingExperiment(wrong, { hypothesis: "Test", process: "Act" })).toBe(wrong);
    expect(recordReplayCoachingGame(wrong, game("1"), "followed")).toMatchObject({ recorded: false, reason: "capture-wrong" });
    const restored = parseReplayCoachingStore({ version: 1, focuses: [wrong] }).store.focuses[0]!;
    expect(restored.reflection).toMatchObject({ value: "wrong", note: "The replay omitted the card swap." });
    expect(restored.experiment?.id).toBe(started.experiment?.id);
  });

  it("persists a finished practice conclusion and its Notebook goal snapshot", () => {
    let focus = defineReplayCoachingExperiment(testingFocus(), {
      hypothesis: "A clear opening plan helps.", process: "Name the early play.",
      goalId: "goal-1", goalText: "Make a clear opening plan", notebookDeckId: "deck-1"
    });
    for (const id of ["1", "2", "3"]) focus = recordReplayCoachingGame(focus, game(id), "followed").focus;
    const finished = saveReplayCoachingConclusion(focus, { note: "The cue helped me make the keep intentional.", decision: "finish-practice" });
    expect(finished.status).toBe("learned");
    expect(finished.experiment?.games).toEqual(focus.experiment?.games);
    expect(finished.conclusions?.[0]).toMatchObject({ experimentId: focus.experiment!.id, decision: "finish-practice" });
    expect(saveReplayCoachingConclusion(finished, { note: "Duplicate click", decision: "finish-practice" })).toBe(finished);
    const restored = parseReplayCoachingStore({ version: 1, focuses: [finished] }).store.focuses[0]!;
    expect(restored.conclusions).toEqual(finished.conclusions);
    expect(restored.experiment).toMatchObject({ goalId: "goal-1", goalText: "Make a clear opening plan", notebookDeckId: "deck-1" });
  });

  it.each(["keep-practising", "adjust-cue"] as const)("archives the completed trial when the player chooses %s", (decision) => {
    let focus = testingFocus();
    for (const id of ["1", "2", "3"]) focus = recordReplayCoachingGame(focus, game(id), "followed").focus;
    const nextAt = "2026-08-30T12:00:00.000Z";
    const next = saveReplayCoachingConclusion(focus, { note: "I want to check this again.", decision }, nextAt);
    expect(next.experimentHistory).toEqual([focus.experiment]);
    expect(next.experiment?.id).not.toBe(focus.experiment?.id);
    expect(next.experiment?.games).toEqual([]);
    expect(next.experiment?.process).toBe(focus.experiment?.process);
    expect(next.status).toBe(decision === "keep-practising" ? "testing" : "hypothesis");
    expect(next.experiment?.startedAt).toBe(decision === "keep-practising" ? nextAt : undefined);
    expect(isReplayCoachingGameEligibleForFocus(next, game("1"))).toBe(false);
    const restored = parseReplayCoachingStore({ version: 1, focuses: [next] }).store.focuses[0]!;
    expect(restored.experimentHistory).toEqual(next.experimentHistory);
    expect(restored.conclusions).toEqual(next.conclusions);
  });

  it("does not conclude an unfinished trial or save an empty conclusion", () => {
    const focus = testingFocus();
    expect(saveReplayCoachingConclusion(focus, { note: "Too early", decision: "finish-practice" })).toBe(focus);
    let complete = focus;
    for (const id of ["1", "2", "3"]) complete = recordReplayCoachingGame(complete, game(id), "followed").focus;
    expect(saveReplayCoachingConclusion(complete, { note: "  ", decision: "finish-practice" })).toBe(complete);
  });
});
