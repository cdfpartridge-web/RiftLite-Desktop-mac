import { describe, expect, it } from "vitest";
import { deckSnapshotHash, emptyDeckMatchupGuide } from "../src/shared/deckNotebook";
import type { InsightDecisionContext, MatchDraft, ReplayRecord, ReplayStructuredEvent } from "../src/shared/types";
import { createReplayCoachingFocus, reflectOnReplayInsight } from "../src/shared/replayCoaching";
import { buildReplayCoachGames, buildReplayCoachMoments, isReplayCoachFocusExcluded, replayCoachReflectionCopy } from "../src/renderer/replayCoachModel";
import { resolveBundledCardImage } from "../src/renderer/cardArtwork";

const AT = "2026-09-05T10:00:00.000Z";
const SNAPSHOT = JSON.stringify({ title: "Jhin v3", mainDeck: [{ name: "Jhin, Meticulous Killer", cardId: "UNL-089", qty: 3 }] });

function match(patch: Partial<MatchDraft> = {}): MatchDraft {
  return {
    id: "match-1", platform: "atlas", status: "saved", capturedAt: AT, updatedAt: AT,
    result: "Win", format: "Bo3", score: "2-0", myName: "Player", opponentName: "Opponent", myChampion: "Jhin",
    opponentChampion: "Annie", myBattlefield: "", opponentBattlefield: "", deckName: "Jhin v3", deckSourceId: "deck-1",
    deckSourceKey: "source:jhin", deckSnapshotJson: SNAPSHOT, flags: "", notes: "",
    games: [{ gameNumber: 1, result: "Win", wentFirst: "2nd" }], rawEvidence: [],
    sync: { community: "disabled", hubs: {}, teams: {} }, ...patch
  };
}

function replay(patch: Partial<ReplayRecord> = {}): ReplayRecord {
  return { id: "replay-1", matchId: "match-1", platform: "atlas", capturedAt: AT, title: "Jhin vs Annie",
    players: { me: "Player", opponent: "Opponent" }, events: [], ...patch };
}

function withDecision(decisionPatch: Partial<InsightDecisionContext> = {}): MatchDraft {
  return match({ insightContext: {
    version: 1, capturedWithEnhancedInsights: true, activeGoalIds: [], updatedAt: AT,
    decisions: [{ id: "decision-1", gameNumber: 1, family: "mulligan", decision: "mulligan-keep", assessment: "unsure",
      subject: { cardId: "VEN-189*", cardName: "Akali, Kinkou Assassin" }, source: "replay", createdAt: AT,
      eventId: "event-1", timeMs: 18_000, intendedPlan: "Keep a route to the early play.", ...decisionPatch }]
  } });
}

function event(patch: Partial<ReplayStructuredEvent> = {}): ReplayStructuredEvent {
  return { id: "event-1", sourceEventId: "source-1", gameNumber: 1, capturedAt: "2026-09-05T10:00:18.000Z",
    labelTime: "0:18", type: "mulligan", side: "me", text: "Kept Akali", cardName: "Akali, Kinkou Assassin",
    cardId: "VEN-189*", destination: "", battlefield: "", ...patch };
}

describe("Replay Coach evidence model", () => {
  it("offers a neutral manual review for a basic replay without inventing a moment or plan", () => {
    const [moment] = buildReplayCoachMoments([replay()], [match()]);
    expect(moment).toMatchObject({ source: "manual-review", excluded: false, frozenPlan: null, goals: [],
      question: "Which decision from this replay would you like to understand better?", gameNumber: 1,
      scope: { deckKey: "source:jhin", deckVersionId: deckSnapshotHash(SNAPSHOT), opponentLegend: "Annie", gameStage: "preboard", initiative: "2nd" }
    });
    expect(moment?.timeMs).toBeUndefined();
    expect(moment?.cardName).toBeUndefined();
  });

  it("links a marked decision to exact captured art and its actual replay event", () => {
    const source = replay({ structuredEvents: [event()] });
    const [moment] = buildReplayCoachMoments([source], [withDecision()]);
    expect(moment).toMatchObject({ source: "marked", eventId: "event-1", timeMs: 18_000,
      cardId: "VEN-189*", cardName: "Akali, Kinkou Assassin", imageUrl: resolveBundledCardImage("VEN-189*"),
      title: "Keep: Akali, Kinkou Assassin", question: "What made Akali, Kinkou Assassin worth keeping here?",
      contextNote: "Keep a route to the early play.", assessment: "unsure" });
    expect(moment?.question).not.toMatch(/redraw|too late|mistake/i);
  });

  it.each([
    ["mulligan-redraw", "What were you looking for when you redrew Jhin, Meticulous Killer?", "Redraw: Jhin, Meticulous Killer"],
    ["sideboard-in", "What job did Jhin, Meticulous Killer have after sideboarding?", "Sideboard in: Jhin, Meticulous Killer"],
    ["sideboard-out", "What made Jhin, Meticulous Killer the card to take out here?", "Sideboard out: Jhin, Meticulous Killer"]
  ] as const)("asks one card-specific neutral question for %s", (decision, question, title) => {
    const [moment] = buildReplayCoachMoments([replay()], [withDecision({ decision, subject: { cardId: "UNL-089", cardName: "Jhin, Meticulous Killer" } })]);
    expect(moment).toMatchObject({ question, title });
  });

  it("keeps unknown card names and capture corrections honest", () => {
    const [withoutCard] = buildReplayCoachMoments([replay()], [withDecision({ subject: undefined })]);
    expect(withoutCard?.question).toBe("What was your plan for this keep?");
    const [wrong] = buildReplayCoachMoments([replay()], [withDecision({ assessment: "capture-wrong" })]);
    expect(wrong?.question).toBe("Which captured detail is wrong, and what should the replay record show instead?");
  });

  it("keeps a frozen Notebook plan and goal text as recorded for that match", () => {
    const sourceMatch = withDecision();
    const guide = emptyDeckMatchupGuide("Annie");
    guide.mulligan.keep.note = "Keep only with an early play.";
    sourceMatch.insightContext!.notebookSnapshot = { deckId: "notebook-jhin", opponentLegend: "Annie", guide, guideSource: "matchup",
      goals: [{ id: "goal-1", text: "Record the condition behind the keep.", createdAt: AT }], capturedAt: AT };
    const [moment] = buildReplayCoachMoments([replay()], [sourceMatch]);
    guide.mulligan.keep.note = "New plan after this game.";
    expect(moment).toMatchObject({ notebookDeckId: "notebook-jhin", frozenPlan: { capturedAt: AT, source: "matchup", lines: ["Keep: Keep only with an early play."] },
      goals: [{ id: "goal-1", text: "Record the condition behind the keep." }] });
  });

  it("namespaces repeated decision IDs by replay", () => {
    const first = withDecision();
    const second = { ...withDecision(), id: "match-2" };
    const moments = buildReplayCoachMoments([replay(), replay({ id: "replay-2", matchId: "match-2" })], [first, second]);
    expect(moments).toHaveLength(2);
    expect(new Set(moments.map((moment) => moment.id)).size).toBe(2);
  });

  it("exposes incorrect capture as excluded instead of recreating a generic review", () => {
    const moments = buildReplayCoachMoments([replay()], [withDecision({ assessment: "capture-wrong" })]);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ excluded: true, assessment: "wrong", source: "marked" });
  });

  it("keeps one source decision identity when a plan comparison is later corrected", () => {
    const original = withDecision();
    const guide = emptyDeckMatchupGuide("Annie");
    guide.mulligan.avoid.cards = [{ id: "avoid-1", cardKey: "akali", cardName: "Akali, Kinkou Assassin", cardId: "VEN-189*", qty: 1 }];
    original.insightContext!.notebookSnapshot = { deckId: "deck-1", opponentLegend: "Annie", guide, guideSource: "matchup", goals: [], capturedAt: AT };
    const [before] = buildReplayCoachMoments([replay()], [original]);
    const corrected = structuredClone(original);
    corrected.insightContext!.decisions[0]!.assessment = "capture-wrong";
    const [after] = buildReplayCoachMoments([replay()], [corrected]);
    expect(before?.excluded).toBe(false);
    expect(after?.excluded).toBe(true);
    expect(after?.id).toBe(before?.id);
  });

  it("respects explicit capture optout and authoritative deletion instead of reviving replay snapshots", () => {
    const optedOut = withDecision();
    optedOut.insightContext!.capturedWithEnhancedInsights = false;
    expect(buildReplayCoachMoments([replay()], [optedOut])).toEqual([]);
    expect(buildReplayCoachMoments([replay({ enhancedInsights: { version: 1, captured: false, capturedAt: AT, captureMode: "semantic-local" } })], [match()])).toEqual([]);
    expect(buildReplayCoachGames([replay({ enhancedInsights: { version: 1, captured: false, capturedAt: AT, captureMode: "semantic-local" } })], [match()])).toEqual([]);
    expect(buildReplayCoachMoments([replay({ matchSnapshot: match() })], [match({ deletedAt: AT })])).toEqual([]);
    expect(buildReplayCoachGames([replay({ matchSnapshot: match() })], [match({ deletedAt: AT })])).toEqual([]);
  });

  it("retains captured replay context when the live match has none, but explicit current optout wins", () => {
    const source = replay({ matchSnapshot: withDecision() });
    expect(buildReplayCoachMoments([source], [match()])[0]?.source).toBe("marked");
    const optedOut = withDecision();
    optedOut.insightContext!.capturedWithEnhancedInsights = false;
    expect(buildReplayCoachMoments([source], [optedOut])).toEqual([]);
    expect(buildReplayCoachGames([replay({ matchSnapshot: optedOut })], [match()])).toEqual([]);
  });

  it("does not borrow an arbitrary game's initiative for a match-wide manual review", () => {
    const twoGames = match({ games: [{ gameNumber: 1, result: "Win", wentFirst: "1st" }, { gameNumber: 2, result: "Loss", wentFirst: "2nd" }] });
    const [moment] = buildReplayCoachMoments([replay()], [twoGames]);
    expect(moment?.gameNumber).toBeUndefined();
    expect(moment?.scope.gameStage).toBeUndefined();
    expect(moment?.scope.initiative).toBeUndefined();
    expect(moment?.scopeLabel).toContain("initiative unknown");
  });

  it.each(["", "not-json", "null", "{}", '{"mainDeck":[]}'])("keeps an invalid or absent deck snapshot unknown: %s", (deckSnapshotJson) => {
    const [moment] = buildReplayCoachMoments([replay()], [match({ deckSnapshotJson })]);
    expect(moment?.scope.deckVersionId).toBeUndefined();
    expect(moment?.scopeLabel).toContain("deck version unknown");
  });

  it("uses honest original timestamps and one ID per game across duplicate replays", () => {
    const sourceMatch = match({ updatedAt: "2026-09-06T10:00:00.000Z", games: [{ gameNumber: 1, result: "Win", wentFirst: "1st" }, { gameNumber: 2, result: "Loss", wentFirst: "2nd" }] });
    const games = buildReplayCoachGames([replay(), replay({ id: "replay-newer", capturedAt: "2026-09-06T10:00:00.000Z" })], [sourceMatch]);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ id: "match-1:game-1", capturedAt: AT, replayId: "replay-newer", initiative: "1st", gameStage: "preboard", deckVersionId: deckSnapshotHash(SNAPSHOT) });
    expect(games[1]).toMatchObject({ id: "match-1:game-2", capturedAt: AT, initiative: "2nd", gameStage: "postboard" });
  });

  it("uses snapshot-only replays but hides merged and manually hidden matches", () => {
    expect(buildReplayCoachGames([replay({ matchSnapshot: match() })], [])).toHaveLength(1);
    expect(buildReplayCoachMoments([replay()], [match({ hiddenFromHistory: true })])).toEqual([]);
    expect(buildReplayCoachGames([replay()], [match({ mergedIntoMatchId: "combined" })])).toEqual([]);
  });

  it("changes the reflection prompt for intention, constraint, missed trigger and uncertainty", () => {
    expect(replayCoachReflectionCopy("intentional").question).toContain("fit your plan");
    expect(replayCoachReflectionCopy("forced").response).toContain("constraint, not an avoidable error");
    expect(replayCoachReflectionCopy("missed").question).toContain("overlook");
    expect(replayCoachReflectionCopy("unsure").response).toContain("without turning it into a rule");
    expect(replayCoachReflectionCopy("wrong").response).toContain("excluded from coaching");
  });

  it("blocks an existing practice when the source decision is later marked as incorrect", () => {
    const [moment] = buildReplayCoachMoments([replay()], [withDecision()]);
    const focus = createReplayCoachingFocus({ insight: { id: moment!.id, title: moment!.title, replayId: "replay-1", matchId: "match-1" } });
    expect(isReplayCoachFocusExcluded(focus, [replay()], [withDecision()])).toBe(false);
    expect(isReplayCoachFocusExcluded(focus, [replay()], [withDecision({ assessment: "capture-wrong" })])).toBe(true);
    expect(isReplayCoachFocusExcluded(reflectOnReplayInsight(focus, "wrong"), [], [])).toBe(true);
  });

  it.each([{ deletedAt: AT }, { hiddenFromHistory: true }, { hiddenFromStats: true }, { mergedIntoMatchId: "combined" }])(
    "blocks saved practice when its authoritative match is excluded: %j", (patch) => {
      const focus = createReplayCoachingFocus({ insight: { id: "saved", title: "A saved review", replayId: "replay-1", matchId: "match-1" } });
      expect(isReplayCoachFocusExcluded(focus, [replay({ matchSnapshot: match() })], [match(patch)])).toBe(true);
    }
  );

  it("blocks explicit source capture optout/deletion without erasing a journal whose source is merely absent", () => {
    const focus = createReplayCoachingFocus({ insight: { id: "saved", title: "A saved review", replayId: "replay-1", matchId: "match-1" } });
    const optedOut = withDecision();
    optedOut.insightContext!.capturedWithEnhancedInsights = false;
    expect(isReplayCoachFocusExcluded(focus, [replay()], [optedOut])).toBe(true);
    expect(isReplayCoachFocusExcluded(focus, [replay({ matchSnapshot: optedOut })], [match()])).toBe(true);
    expect(isReplayCoachFocusExcluded(focus, [replay({ deletedAt: AT })], [match()])).toBe(true);
    expect(isReplayCoachFocusExcluded(focus, [replay({ enhancedInsights: { version: 1, captured: false, capturedAt: AT, captureMode: "semantic-local" } })], [match()])).toBe(true);
    expect(isReplayCoachFocusExcluded(focus, [], [])).toBe(false);
    expect(isReplayCoachFocusExcluded(focus, [], [match()])).toBe(false);
  });
});
