import { deckSnapshotHash } from "../shared/deckNotebook";
import { buildEnhancedInsightsContext, type EnhancedInsightReviewCandidate } from "../shared/enhancedInsightsContext";
import type { ReplayCoachingEligibilityScope, ReplayCoachingFocus, ReplayCoachingGameSnapshot, ReplayInsightReflection } from "../shared/replayCoaching";
import type { InsightDecisionContext, InsightNotebookSnapshot, MatchDraft, ReplayRecord, ReplayStructuredCard, ReplayStructuredEvent } from "../shared/types";
import { resolveCardArtwork } from "./cardArtwork";

export interface ReplayCoachEvidence {
  id: string;
  label: string;
  replayId: string;
  timeMs?: number;
  eventId?: string;
  capturedAt?: string;
}

export interface ReplayCoachMoment {
  id: string;
  replayId: string;
  matchId: string;
  capturedAt: string;
  title: string;
  question: string;
  observation: string;
  source: "marked" | "manual-review";
  evidence: ReplayCoachEvidence[];
  timeMs?: number;
  eventId?: string;
  gameNumber?: number;
  cardId?: string;
  cardName?: string;
  imageUrl?: string;
  scope: ReplayCoachingEligibilityScope;
  scopeLabel: string;
  deckName: string;
  opponentLegend: string;
  platform: ReplayRecord["platform"];
  notebookDeckId?: string;
  frozenPlan: { capturedAt: string; source: "default" | "matchup"; lines: string[] } | null;
  goals: Array<{ id: string; text: string }>;
  contextNote?: string;
  assessment?: ReplayInsightReflection;
  excluded: boolean;
}

/** Player-authored questions only. No timing heuristic is promoted to a verdict. */
export function buildReplayCoachMoments(replays: readonly ReplayRecord[], matches: readonly MatchDraft[]): ReplayCoachMoment[] {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  return replays.flatMap((replay) => {
    const match = resolveMatch(replay, matchById.get(replay.matchId));
    if (!availableReplay(replay, match)) return [];
    const context = match?.insightContext;
    const report = buildEnhancedInsightsContext({ replay, matchInsightContext: context, opponentLegend: match?.opponentChampion, maxReviewCandidates: 50 });
    const candidates = report.reviewCandidates.filter((candidate) => candidate.kind !== "goal-review");
    if (!candidates.length) return [momentFromReplay(replay, match)];
    return candidates.map((candidate) => {
      const decision = context?.decisions.find((item) => candidate.evidence.some((ref) => ref.source === "player-context" && ref.id === item.id));
      const primary = candidate.evidence.find((ref) => ref.eventId || ref.videoTimeMs !== undefined)
        ?? candidate.evidence.find((ref) => ref.source === "player-context" || ref.source === "replay-flag");
      const event = primary?.eventId ? (replay.structuredEvents ?? []).find((item) => item.id === primary.eventId || item.sourceEventId === primary.eventId) : undefined;
      const gameNumber = positiveInteger(decision?.gameNumber) ?? positiveInteger(event?.gameNumber) ?? soleGameNumber(match);
      const moment = momentFromReplay(replay, match, gameNumber);
      const subjectCard = cardForDecision(decision, event);
      const cardId = text(decision?.subject?.cardId) || text(subjectCard?.code) || text(event?.cardId);
      const cardName = text(decision?.subject?.cardName) || text(subjectCard?.name) || text(event?.cardName);
      const flag = replay.flags?.find((item) => candidate.evidence.some((ref) => ref.source === "replay-flag" && ref.id === item.id));
      return {
        ...moment,
        id: `replay-coach:${replay.id}:${decision ? `decision:${decision.id}` : candidate.id}`,
        title: decisionTitle(decision, cardName) || candidate.title,
        question: decisionQuestion(decision, cardName) || candidate.reviewQuestion,
        observation: candidate.observation,
        source: "marked" as const,
        evidence: candidateEvidence(candidate),
        timeMs: primary?.videoTimeMs,
        eventId: primary?.eventId,
        cardId: cardId || undefined,
        cardName: cardName || undefined,
        imageUrl: cardId ? resolveCardArtwork(cardId, subjectCard?.imageUrl) : subjectCard?.imageUrl,
        contextNote: [decision?.intendedPlan, decision?.constraint, decision?.alternative, decision?.note, flag?.note].map(text).filter(Boolean).join("\n") || undefined,
        assessment: decision?.assessment === "capture-wrong" ? "wrong" as const
          : decision?.assessment === "good-line" ? "intentional" as const : decision?.assessment,
        excluded: candidate.kind === "capture-correction" || decision?.assessment === "capture-wrong"
      };
    });
  }).sort((left, right) => Number(right.source === "marked") - Number(left.source === "marked")
    || timestamp(right.capturedAt) - timestamp(left.capturedAt) || left.id.localeCompare(right.id));
}

/** Retain match-start time: editing or importing an old match cannot make it a new opportunity. */
export function buildReplayCoachGames(replays: readonly ReplayRecord[], matches: readonly MatchDraft[]): ReplayCoachingGameSnapshot[] {
  const liveMatches = new Map(matches.map((match) => [match.id, match]));
  const optedOutMatchIds = new Set(replays.filter((replay) => replay.enhancedInsights?.captured === false
    || resolveMatch(replay, liveMatches.get(replay.matchId))?.insightContext?.capturedWithEnhancedInsights === false).map((replay) => replay.matchId));
  const replayByMatchId = new Map<string, ReplayRecord>();
  for (const replay of [...replays].sort((left, right) => timestamp(right.capturedAt) - timestamp(left.capturedAt))) {
    const match = liveMatches.get(replay.matchId) ?? replay.matchSnapshot;
    if (availableReplay(replay, match) && !replayByMatchId.has(replay.matchId)) replayByMatchId.set(replay.matchId, replay);
  }
  const allMatches = new Map(liveMatches);
  for (const replay of replayByMatchId.values()) {
    if (!allMatches.has(replay.matchId) && replay.matchSnapshot) allMatches.set(replay.matchId, replay.matchSnapshot);
  }
  const seen = new Set<string>();
  return [...allMatches.values()].flatMap((match) => {
    if (!availableMatch(match) || match.insightContext?.capturedWithEnhancedInsights === false || optedOutMatchIds.has(match.id)) return [];
    return match.games.flatMap((game) => {
      const gameNumber = positiveInteger(game.gameNumber);
      if (!gameNumber) return [];
      const id = `${match.id}:game-${gameNumber}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        matchId: match.id,
        replayId: replayByMatchId.get(match.id)?.id,
        capturedAt: match.capturedAt,
        gameNumber,
        ...scopeForMatch(match, gameNumber),
        result: game.result
      }];
    });
  }).sort((left, right) => timestamp(left.capturedAt) - timestamp(right.capturedAt) || (left.gameNumber ?? 0) - (right.gameNumber ?? 0));
}

/** A saved journal survives library changes, but excluded source evidence cannot drive practice. */
export function isReplayCoachFocusExcluded(
  focus: ReplayCoachingFocus,
  replays: readonly ReplayRecord[],
  matches: readonly MatchDraft[],
  moments: readonly ReplayCoachMoment[] = buildReplayCoachMoments(replays, matches)
): boolean {
  if (focus.reflection?.value === "wrong" || moments.some((moment) => moment.id === focus.insight.id && moment.excluded)) return true;
  const replay = replays.find((item) => item.id === focus.insight.replayId);
  const matchId = focus.insight.matchId || replay?.matchId;
  const currentMatch = matches.find((item) => item.id === matchId);
  const match = replay ? resolveMatch(replay, currentMatch) : currentMatch;
  if (match && (!availableMatch(match) || match.insightContext?.capturedWithEnhancedInsights === false)) return true;
  return Boolean(replay && (replay.deletedAt || replay.enhancedInsights?.captured === false));
}

export function replayCoachReflectionCopy(value: ReplayInsightReflection): { question: string; response: string; cuePlaceholder: string } {
  switch (value) {
    case "intentional": return {
      question: "What made this choice fit your plan?",
      response: "Your explanation records the condition behind this choice. The replay alone does not tell us whether another line was better.",
      cuePlaceholder: "Name the condition that makes this plan worth repeating."
    };
    case "forced": return {
      question: "Which constraint limited your alternatives?",
      response: "This is recorded as a constraint, not an avoidable error. Choose a practice cue only if there is something you want to notice earlier.",
      cuePlaceholder: "Name the constraint you want to recognise earlier."
    };
    case "missed": return {
      question: "What did you overlook, and what could help you notice it?",
      response: "You identified something to notice next time. You decide which response fits the game state.",
      cuePlaceholder: "Name a visible trigger you want to notice."
    };
    case "wrong": return {
      question: "What should the capture show instead?",
      response: "This moment is excluded from coaching. Your correction note is saved locally; the replay record is not changed automatically.",
      cuePlaceholder: "Correct the evidence before choosing a practice cue."
    };
    case "already-understood": return {
      question: "What have you already learned from this moment?",
      response: "Keep the conclusion as a note, or choose a condition you still want to practise.",
      cuePlaceholder: "Name a condition you still want to practise."
    };
    default: return {
      question: "What were you weighing up, and what remains unclear?",
      response: "Uncertainty stays open. You can save a question without turning it into a rule.",
      cuePlaceholder: "Name the situation you want to observe again."
    };
  }
}

function momentFromReplay(replay: ReplayRecord, match?: MatchDraft, gameNumber = soleGameNumber(match)): ReplayCoachMoment {
  const scope = scopeForMatch(match, gameNumber);
  const snapshot = match?.insightContext?.notebookSnapshot;
  const lines = snapshot ? frozenPlanLines(snapshot) : [];
  return {
    id: `replay-coach:${replay.id}:manual`,
    replayId: replay.id,
    matchId: replay.matchId,
    capturedAt: match?.capturedAt || replay.capturedAt,
    title: "Choose a decision to review",
    question: "Which decision from this replay would you like to understand better?",
    observation: "Open the replay and choose a moment. Describe what you were trying to achieve and the alternatives you considered.",
    source: "manual-review",
    evidence: [{ id: replay.id, label: "Open this replay", replayId: replay.id }],
    gameNumber,
    scope,
    scopeLabel: scopeDescription(scope, text(match?.deckName)),
    deckName: text(match?.deckName) || text(match?.myChampion) || "Unassigned deck",
    opponentLegend: text(match?.opponentChampion) || "Opponent unknown",
    platform: replay.platform,
    notebookDeckId: snapshot?.deckId,
    frozenPlan: snapshot && lines.length ? { capturedAt: snapshot.capturedAt, source: snapshot.guideSource, lines } : null,
    goals: (snapshot?.goals ?? []).map(({ id, text: goalText }) => ({ id, text: goalText })),
    excluded: false
  };
}

function scopeForMatch(match?: MatchDraft, gameNumber?: number): ReplayCoachingEligibilityScope {
  const game = match?.games.find((item) => item.gameNumber === gameNumber);
  const deckVersionId = knownDeckVersion(match?.deckSnapshotJson);
  return {
    deckKey: text(match?.deckSourceKey) || text(match?.deckSourceId) || undefined,
    deckVersionId: deckVersionId || undefined,
    opponentLegend: text(match?.opponentChampion) || undefined,
    gameStage: gameNumber ? (gameNumber === 1 ? "preboard" : "postboard") : undefined,
    initiative: game?.wentFirst === "1st" || game?.wentFirst === "2nd" ? game.wentFirst : undefined
  };
}

function knownDeckVersion(snapshotJson?: string): string {
  if (!snapshotJson) return "";
  try {
    const snapshot: unknown = JSON.parse(snapshotJson);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "";
    const mainDeck = (snapshot as Record<string, unknown>).mainDeck;
    if (!Array.isArray(mainDeck) || !mainDeck.length) return "";
    return deckSnapshotHash(snapshotJson);
  } catch { return ""; }
}

function scopeDescription(scope: ReplayCoachingEligibilityScope, deckName: string): string {
  return [deckName || "Deck unknown", scope.deckVersionId ? "same saved deck version" : "deck version unknown",
    scope.opponentLegend ? `vs ${scope.opponentLegend}` : "opponent unknown",
    scope.gameStage === "preboard" ? "game 1" : scope.gameStage === "postboard" ? "postboard" : "game stage unknown",
    scope.initiative === "1st" ? "going first" : scope.initiative === "2nd" ? "going second" : "initiative unknown"].join(" · ");
}

function candidateEvidence(candidate: EnhancedInsightReviewCandidate): ReplayCoachEvidence[] {
  return candidate.evidence.filter((ref) => ref.source === "player-context" || ref.source === "replay-flag")
    .map((ref) => ({ id: ref.id, label: ref.label, replayId: ref.replayId, timeMs: ref.videoTimeMs, eventId: ref.eventId, capturedAt: ref.capturedAt }));
}

function decisionQuestion(decision?: InsightDecisionContext, cardName = ""): string {
  if (!decision || decision.assessment === "capture-wrong") return "";
  switch (decision.decision) {
    case "mulligan-keep": return cardName ? `What made ${cardName} worth keeping here?` : "What was your plan for this keep?";
    case "mulligan-redraw": return cardName ? `What were you looking for when you redrew ${cardName}?` : "What were you looking for in the redraw?";
    case "mulligan": return "What was your opening-hand plan?";
    case "sideboard-in": return cardName ? `What job did ${cardName} have after sideboarding?` : "What job did you want the cards coming in to do?";
    case "sideboard-out": return cardName ? `What made ${cardName} the card to take out here?` : "What made these cards the ones to take out?";
    case "sideboard": return "What did you want to change after sideboarding?";
    case "battlefield-pick": return decision.subject?.battlefieldName ? `What made ${text(decision.subject.battlefieldName)} fit your plan here?` : "What made this battlefield fit your plan?";
    case "resource-use": return "What were you saving or spending resources for?";
    case "combat": return "What was your plan for this combat?";
    case "sequencing": return "What made this order fit your plan?";
    case "scoring": return "What scoring opportunity were you aiming for?";
    case "information": return "Which information shaped this decision?";
    default: return "";
  }
}

function decisionTitle(decision?: InsightDecisionContext, cardName = ""): string {
  if (!decision || decision.assessment === "capture-wrong") return "";
  switch (decision.decision) {
    case "mulligan-keep": return cardName ? `Keep: ${cardName}` : "Opening-hand keep";
    case "mulligan-redraw": return cardName ? `Redraw: ${cardName}` : "Opening-hand redraw";
    case "sideboard-in": return cardName ? `Sideboard in: ${cardName}` : "Sideboard cards in";
    case "sideboard-out": return cardName ? `Sideboard out: ${cardName}` : "Sideboard cards out";
    case "battlefield-pick": return decision.subject?.battlefieldName ? `Battlefield: ${text(decision.subject.battlefieldName)}` : "Battlefield choice";
    default: return "";
  }
}

function cardForDecision(decision?: InsightDecisionContext, event?: ReplayStructuredEvent): ReplayStructuredCard | undefined {
  const cards = [...(event?.mulligan?.kept ?? []), ...(event?.mulligan?.redrawn ?? []), ...(event?.mulligan?.options ?? [])];
  const id = text(decision?.subject?.cardId);
  const name = text(decision?.subject?.cardName).toLocaleLowerCase();
  if (id) return cards.find((card) => card.code === id || card.id === id);
  return name ? cards.find((card) => card.name.toLocaleLowerCase() === name) : undefined;
}

function frozenPlanLines(snapshot: InsightNotebookSnapshot): string[] {
  const guide = snapshot.guide;
  const sections = [
    ["Keep", guide.mulligan.keep], ["Consider", guide.mulligan.consider], ["Avoid", guide.mulligan.avoid],
    ["Sideboard in", guide.sideboard.in], ["Sideboard out", guide.sideboard.out],
    ["Battlefields", guide.battlefields.game1], ["Going first", guide.battlefields.game1First], ["Going second", guide.battlefields.game1Second]
  ] as const;
  return [
    ...sections.flatMap(([label, section]) => {
      const content = [section.cards.map((card) => card.cardName).filter(Boolean).join(", "), text(section.note)].filter(Boolean).join(" — ");
      return content ? [`${label}: ${content}`] : [];
    }),
    ...(text(guide.sideboard.note) ? [`Sideboard plan: ${text(guide.sideboard.note)}`] : []),
    ...(text(guide.battlefields.note) ? [`Battlefield plan: ${text(guide.battlefields.note)}`] : []),
    ...guide.notes.map((note) => text(note.text)).filter(Boolean)
  ];
}

function availableMatch(match: MatchDraft): boolean {
  return !match.deletedAt && !match.hiddenFromHistory && !match.hiddenFromStats && !match.mergedIntoMatchId;
}

function resolveMatch(replay: ReplayRecord, match?: MatchDraft): MatchDraft | undefined {
  if (!match) return replay.matchSnapshot;
  const snapshotContext = replay.matchSnapshot?.insightContext;
  return !match.insightContext && snapshotContext ? { ...match, insightContext: snapshotContext } : match;
}

function availableReplay(replay: ReplayRecord, match?: MatchDraft): boolean {
  return !replay.deletedAt && replay.enhancedInsights?.captured !== false
    && (!match || (availableMatch(match) && match.insightContext?.capturedWithEnhancedInsights !== false));
}

function soleGameNumber(match?: MatchDraft): number | undefined {
  return match?.games.length === 1 ? positiveInteger(match.games[0]?.gameNumber) : undefined;
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function timestamp(value: string): number { const time = Date.parse(value); return Number.isFinite(time) ? time : 0; }
function positiveInteger(value: unknown): number | undefined { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined; }
