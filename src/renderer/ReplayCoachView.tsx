import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, Clock3, Flag, History, LockKeyhole, Pause, Play, ShieldCheck, Target } from "lucide-react";
import type { ActiveView } from "../shared/navigationModel";
import type { DeckNotebook, MatchDraft, ReplayRecord, SavedDeck } from "../shared/types";
import {
  createReplayCoachingFocus, defineReplayCoachingExperiment, hasReplayCoachingPracticeScope,
  isReplayCoachingGameEligibleForFocus, recordReplayCoachingGame, reflectOnReplayInsight,
  replayCoachingProgress, saveReplayCoachingConclusion, startReplayCoachingExperiment,
  transitionReplayCoachingFocus, type ReplayCoachingAdherence, type ReplayCoachingFocus,
  type ReplayCoachingGameSnapshot, type ReplayInsightReflection
} from "../shared/replayCoaching";
import { buildReplayCoachGames, buildReplayCoachMoments, isReplayCoachFocusExcluded, replayCoachReflectionCopy, type ReplayCoachMoment } from "./replayCoachModel";
import { readReplayCoachState, saveReplayCoachFocus } from "./replayCoachStorage";
import { readReplayCoachSession, writeReplayCoachSession } from "./replayCoachSession";
import { CardArtworkImage } from "./CardArtworkImage";
import "./styles/replayCoach.css";

interface ReplayCoachViewProps {
  replays: ReplayRecord[];
  matches: MatchDraft[];
  decks: SavedDeck[];
  activeDeckId?: string;
  onOpenReplay: (replayId: string, timeMs?: number, correctionEventId?: string) => void;
  onNavigate: (view: ActiveView) => void;
}
type Step = "review" | "context" | "practice" | "checkin";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "review", label: "Review" }, { id: "context", label: "Your context" },
  { id: "practice", label: "Practice cue" }, { id: "checkin", label: "Check-in" }
];
const REFLECTIONS: Array<{ value: ReplayInsightReflection; label: string }> = [
  { value: "intentional", label: "Intentional" }, { value: "forced", label: "Forced" },
  { value: "missed", label: "Missed something" }, { value: "unsure", label: "Unsure" }
];
const CHECKINS: Array<{ value: ReplayCoachingAdherence; label: string }> = [
  { value: "followed", label: "Used it" }, { value: "adapted", label: "Adapted it" },
  { value: "missed", label: "Didn't use it" }, { value: "not-applicable", label: "No opportunity" }
];

export function ReplayCoachView({ replays, matches, decks, onOpenReplay, onNavigate }: ReplayCoachViewProps) {
  const [session] = useState(() => {
    try { return readReplayCoachSession(typeof window === "undefined" ? undefined : window.sessionStorage); }
    catch { return null; }
  });
  const [initial] = useState(() => {
    try { return readReplayCoachState(typeof window === "undefined" ? undefined : window.localStorage); }
    catch { return { ...readReplayCoachState(), error: "Local storage is unavailable. Your notes cannot be saved." }; }
  });
  const [store, setStore] = useState(initial.store);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState<Step>(session?.step ?? "review");
  const [selectedId, setSelectedId] = useState(session?.selectedId ?? "");
  const [journalFocusId, setJournalFocusId] = useState(session?.journalFocusId ?? "");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reflection, setReflection] = useState<ReplayInsightReflection>(session?.reflection ?? "unsure");
  const [note, setNote] = useState(session?.note ?? "");
  const [trigger, setTrigger] = useState(session?.trigger ?? "");
  const [cue, setCue] = useState(session?.cue ?? "");
  const [target, setTarget] = useState(session?.target ?? 3);
  const [goalId, setGoalId] = useState(session?.goalId ?? "");
  const [conclusion, setConclusion] = useState(session?.conclusion ?? "");
  const [notebook, setNotebook] = useState<DeckNotebook | null>(null);
  const [notebookError, setNotebookError] = useState("");
  const draftIdentity = useRef(session?.focusId ?? "");
  const allMoments = useMemo(() => buildReplayCoachMoments(replays, matches), [replays, matches]);
  const moments = useMemo(() => allMoments.filter((moment) => !moment.excluded
    && !store.focuses.some((focus) => focus.insight.id === moment.id && focus.reflection?.value === "wrong")), [allMoments, store.focuses]);
  const moment = moments.find((item) => item.id === selectedId)
    ?? moments.find((item) => !skipped.includes(item.id) && !store.focuses.some((focus) => focus.insight.id === item.id && focus.reflection))
    ?? moments.find((item) => !skipped.includes(item.id));
  const savedFocus = journalFocusId ? store.focuses.find((focus) => focus.id === journalFocusId)
    : store.focuses.find((focus) => focus.insight.id === moment?.id);
  const focus = useMemo(() => savedFocus ?? (moment ? createReplayCoachingFocus({
    id: `coach:${moment.id}`, insight: {
      id: moment.id, title: moment.question, body: moment.observation, replayId: moment.replayId,
      matchId: moment.matchId, gameNumber: moment.gameNumber, cardId: moment.cardId,
      cardName: moment.cardName, opponentLegend: moment.opponentLegend, scope: moment.scopeLabel
    }, eligibility: moment.scope
  }) : undefined), [savedFocus, moment]);
  const evidenceMoment = journalFocusId ? allMoments.find((item) => item.id === focus?.insight.id) : moment;
  const sourceExcluded = !!focus && isReplayCoachFocusExcluded(focus, replays, matches, allMoments);
  const active = store.focuses.find((item) => item.id === store.activeFocusId && !isReplayCoachFocusExcluded(item, replays, matches, allMoments) && item.status !== "learned");
  const progress = focus ? replayCoachingProgress(focus) : null;
  const games = useMemo(() => buildReplayCoachGames(replays, matches), [replays, matches]);
  const pendingGames = !sourceExcluded && focus?.experiment && focus.status === "testing" && !progress?.readyForReview
    ? games.filter((game) => isReplayCoachingGameEligibleForFocus(focus, game)
      && !focus.experiment!.games.some((recorded) => recorded.id === game.id)) : [];
  const deckId = evidenceMoment?.notebookDeckId
    ?? decks.find((deck) => deck.id === focus?.eligibility.deckKey || deck.sourceKey === focus?.eligibility.deckKey)?.id;
  const goalOptions = notebook?.goals.filter((goal) => goal.status === "Active") ?? [];
  const linkedGoal = focus?.experiment?.goalId && focus.experiment.goalText
    ? { id: focus.experiment.goalId, text: focus.experiment.goalText } : undefined;
  const availableGoals = linkedGoal && !goalOptions.some((goal) => goal.id === linkedGoal.id)
    ? [linkedGoal, ...goalOptions] : goalOptions;
  const copy = replayCoachReflectionCopy(reflection);
  const canPractice = !!focus && !sourceExcluded && focus.status !== "learned" && (hasReplayCoachingPracticeScope(focus.eligibility) || !!focus.experiment);

  useEffect(() => {
    if (!focus || draftIdentity.current === focus.id) return;
    draftIdentity.current = focus.id;
    setReflection(focus.reflection?.value ?? evidenceMoment?.assessment ?? "unsure");
    setNote(focus.reflection?.note ?? evidenceMoment?.contextNote ?? "");
    setTrigger(focus.experiment?.hypothesis ?? "");
    setCue(focus.experiment?.process ?? "");
    setTarget(focus.experiment?.targetEligibleGames ?? 3);
    setGoalId(focus.experiment?.goalId ?? "");
    setConclusion("");
  }, [focus, evidenceMoment]);

  useEffect(() => {
    if (!focus) { if (step !== "review") setStep("review"); return; }
    if (journalFocusId && !savedFocus) { setJournalFocusId(""); setStep("review"); }
    if (step === "practice" && focus.status === "learned") setStep("checkin");
    try {
      writeReplayCoachSession(window.sessionStorage, {
        step, selectedId, journalFocusId, focusId: focus.id, reflection, note, trigger, cue, target, goalId, conclusion
      });
    } catch { /* Navigation remains available if temporary storage is disabled. */ }
  }, [step, selectedId, journalFocusId, focus, savedFocus, reflection, note, trigger, cue, target, goalId, conclusion]);

  useEffect(() => {
    let cancelled = false;
    setNotebook(null);
    setNotebookError("");
    if (deckId) {
      void window.riftlite.getDeckNotebook(deckId).then((value) => {
        if (!cancelled) setNotebook(value);
      }).catch(() => { if (!cancelled) setNotebookError("Notebook goals couldn't be loaded. You can practise without a linked goal."); });
    }
    return () => { cancelled = true; };
  }, [deckId]);

  function commit(next: ReplayCoachingFocus, activate = false): boolean {
    if (initial.error) { setError(initial.error); return false; }
    try {
      setStore(saveReplayCoachFocus(window.localStorage, store, next, activate));
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes("journal") ? reason.message
        : "RiftLite couldn't save this change on your device. Your previous notes and check-ins are unchanged. Please try again.");
      return false;
    }
  }
  function chooseMoment(id: string) {
    setSelectedId(id); setJournalFocusId(""); setStep("review"); setNotice("");
  }
  function openFocus(next: ReplayCoachingFocus) {
    setJournalFocusId(next.id); setStep(next.experiment ? "checkin" : "context"); setNotice("");
  }
  function saveReflection(nextStep: Step) {
    if (!focus || sourceExcluded) return;
    const next = reflectOnReplayInsight(focus, reflection, note);
    if (!commit(next)) return;
    setNotice("Your reflection is saved on this device.");
    if (nextStep === "practice" && !cue) setCue(note.trim());
    setJournalFocusId(nextStep === "review" ? "" : next.id);
    if (nextStep === "review") setSelectedId("");
    setStep(nextStep);
  }
  function excludeMoment() {
    if (!focus || !commit(reflectOnReplayInsight(focus, "wrong", note))) return;
    setJournalFocusId(""); setSelectedId(""); setStep("review");
    setNotice("Capture correction saved. This moment is excluded from Coach suggestions and practice.");
  }
  function startPractice() {
    if (!focus || !canPractice || !trigger.trim() || !cue.trim()) return;
    const goal = availableGoals.find((item) => item.id === goalId);
    const next = startReplayCoachingExperiment(defineReplayCoachingExperiment(
      reflectOnReplayInsight(focus, reflection, note), {
        hypothesis: trigger, process: cue, targetEligibleGames: target,
        goalId: goal?.id || "", goalText: goal?.text || "", notebookDeckId: goal ? deckId : ""
      }
    ));
    if (next.status !== "testing" || !commit(next, true)) return;
    setJournalFocusId(next.id); setStep("checkin");
    setNotice("Practice saved. Check in after later games where this situation could apply.");
  }
  function checkIn(game: ReplayCoachingGameSnapshot, adherence: ReplayCoachingAdherence) {
    if (!focus || sourceExcluded) return;
    const result = recordReplayCoachingGame(focus, game, adherence);
    if (!result.recorded) { setError("This game can no longer be checked in. Choose another eligible game."); return; }
    if (commit(result.focus)) setNotice(adherence === "not-applicable"
      ? "Saved as no opportunity. It does not count towards your practice target." : "Check-in saved.");
  }
  function finish(decision: "keep-practising" | "adjust-cue" | "finish-practice") {
    if (!focus || sourceExcluded || !conclusion.trim()) return;
    const next = saveReplayCoachingConclusion(focus, { note: conclusion, decision });
    if (next === focus || !commit(next, decision === "keep-practising")) return;
    setConclusion(""); setNotice("Your conclusion is saved in the journal.");
    if (decision === "adjust-cue") setStep("practice");
  }

  return <section className="replay-coach-page" aria-label="Replay Coach">
    <header className="rc-page-heading">
      <div><h2>One moment. One useful takeaway.</h2><p>Understand your decision, then choose what to practise.</p></div>
      <span className="rc-private"><LockKeyhole size={14} /> Saved on this device</span>
    </header>
    {error && <div className="rc-alert" role="alert">{error}</div>}
    <div className="rc-status" role="status" aria-live="polite">{notice}</div>
    {active && active.id !== focus?.id && <div className="rc-active-practice rc-panel">
      <Target size={18} /><div><strong>Your current practice</strong><p>{active.experiment?.process || active.insight.title}</p></div>
      <button className="rc-button" onClick={() => openFocus(active)}>Continue practice <ArrowRight size={14} /></button>
    </div>}
    <nav className="rc-steps" aria-label="Replay Coach steps">
      {STEPS.map((item, index) => <button key={item.id} className="rc-step" aria-current={step === item.id ? "step" : undefined}
        disabled={item.id !== "review" && (!focus || (item.id === "practice" && (!focus.reflection || focus.status === "learned" || sourceExcluded)) || (item.id === "checkin" && !focus.experiment))}
        onClick={() => { if (item.id === "review") { setJournalFocusId(""); setSelectedId(""); } setStep(item.id); }}><b>{index + 1}</b><span>{item.label}</span></button>)}
    </nav>

    {step === "review" && <>
      {moment ? <>
        <div className="rc-moment rc-panel">
          <div className="rc-moment-top"><span className="rc-eyebrow"><CircleHelp size={14} /> A moment to understand</span>
            <span className="rc-marker"><Flag size={13} />{moment.source === "marked" ? "Marked for review" : "Choose your own focus"}</span></div>
          <div className={`rc-moment-grid${moment.cardId || moment.imageUrl ? "" : " rc-without-art"}`}>
            <div><h3>{moment.question}</h3><p className="rc-body-copy">{moment.observation}</p>
              <div className="rc-meta"><span>{moment.deckName}</span><span>vs {moment.opponentLegend || "Unknown opponent"}</span>
                {moment.gameNumber && <span>Game {moment.gameNumber}</span>}<span>{moment.platform}</span><span>{dateLabel(moment.capturedAt)}</span></div>
              <PlanSnapshot moment={moment} />
              <div className="rc-actions"><button className="rc-button rc-primary" onClick={() => { setSelectedId(moment.id); setJournalFocusId(""); setStep("context"); }}>Review this moment <ArrowRight size={14} /></button>
                <button className="rc-button rc-quiet" onClick={() => { setSkipped((items) => [...items, moment.id]); setSelectedId(""); setJournalFocusId(""); }}>Not now</button></div>
            </div>
            {(moment.cardId || moment.imageUrl) && <div><CardArtworkImage className="rc-card-art" card={{ cardId: moment.cardId, imageUrl: moment.imageUrl }}
              alt={moment.cardName || "Card from this decision"} fallback={<div className="rc-art-placeholder"><BookOpen /></div>} /><p className="rc-card-caption">{moment.cardName}</p></div>}
          </div>
        </div>
        {moments.length > 1 && <label className="rc-field rc-moment-picker">Choose another moment<select value={moment.id} onChange={(event) => chooseMoment(event.target.value)}>
          {moments.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {dateLabel(item.capturedAt)} · {item.deckName} · vs {item.opponentLegend} · {item.title}{item.timeMs !== undefined ? ` · ${timeLabel(item.timeMs)}` : ""}</option>)}
        </select></label>}
      </> : <div className="rc-empty rc-panel"><BookOpen size={28} /><h3>{allMoments.length ? "You're caught up for now" : "Start with a replay worth reviewing"}</h3>
        <p>{allMoments.length ? "Your saved reflections and practice cues are in the journal below." : "Save a local replay, then mark a decision or add a review note. Coach will bring the recorded moment here."}</p>
        <div className="rc-actions"><button className="rc-button rc-primary" onClick={() => onNavigate("replays")}>Open replays <ArrowRight size={14} /></button>
          {skipped.length > 0 && <button className="rc-button" onClick={() => setSkipped([])}>Show skipped moments</button>}</div></div>}
    </>}

    {step === "context" && focus && <>
      <span className="rc-eyebrow">Your explanation comes first</span><h3 className="rc-stage-title">What was behind your decision?</h3>
      <p className="rc-stage-intro">A recorded action shows what happened. Your context explains why.</p>
      <div className="rc-reflect-grid">
        <EvidencePanel moment={evidenceMoment} focus={focus} onOpenReplay={onOpenReplay} />
        <div className="rc-reflection">{sourceExcluded && <p className="rc-alert">This source was excluded from Coach. Your saved reflection remains in the journal.</p>}<fieldset disabled={sourceExcluded}><legend>How do you see this moment?</legend><div className="rc-choices">
          {REFLECTIONS.map((item) => <button className="rc-choice" key={item.value} aria-pressed={reflection === item.value} onClick={() => setReflection(item.value)}>
            {reflection === item.value ? <Check size={14} /> : <CircleHelp size={14} />}{item.label}</button>)}</div></fieldset>
          <label className="rc-field">{copy.question}<textarea disabled={sourceExcluded} value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} placeholder="Add your plan, constraint or alternative…" /></label>
          <div className="rc-response"><ShieldCheck size={15} /><p>{copy.response}</p></div>
          <div className="rc-actions"><button className="rc-button rc-primary" disabled={sourceExcluded} onClick={() => saveReflection(focus.status === "learned" ? "review" : "practice")}>Save reflection <ArrowRight size={14} /></button>
            <button className="rc-button rc-quiet" disabled={sourceExcluded} onClick={() => saveReflection("review")}>Keep as a note</button></div>
          <button className="rc-wrong" disabled={sourceExcluded} onClick={excludeMoment}>Capture is wrong — exclude this moment</button>
        </div>
      </div>
    </>}

    {step === "practice" && focus && <>
      <span className="rc-eyebrow"><Target size={14} /> A cue you choose</span><h3 className="rc-stage-title">What would you like to try next?</h3>
      <p className="rc-stage-intro">Keep the lesson specific enough to recognise in a later game.</p>
      <div className="rc-practice-panel rc-panel">
        {note && <div className="rc-plan"><small>Your reflection</small><p>{note}</p></div>}
        <div className="rc-rule-fields"><label htmlFor="rc-trigger">When</label><input id="rc-trigger" maxLength={4000} value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="Describe the situation you want to notice…" />
          <label htmlFor="rc-cue">I'll</label><textarea id="rc-cue" maxLength={4000} value={cue} onChange={(event) => setCue(event.target.value)} placeholder={copy.cuePlaceholder} /></div>
        <div className="rc-practice-controls"><label className="rc-field">Link a Notebook goal (optional)<select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
          <option value="">No linked goal</option>{availableGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.text}</option>)}</select></label>
          <fieldset><legend>Practice target</legend><div className="rc-game-target">{[3, 5].map((count) => <button key={count} aria-pressed={target === count} onClick={() => setTarget(count)}>{count} games</button>)}</div></fieldset></div>
        {notebookError && <p className="rc-subtle">{notebookError}</p>}
        <p className="rc-scope"><ShieldCheck size={14} /><span>{focus.insight.scope || "Existing practice scope"}. Only later games in this scope appear for check-in. No opportunity does not count towards the target.</span></p>
        {!canPractice && <p className="rc-alert">This replay is missing a verified deck version, opponent, initiative or game stage. Keep your reflection as a note; a practice target needs that recorded scope.</p>}
        <div className="rc-actions"><button className="rc-button rc-primary" disabled={!canPractice || !trigger.trim() || !cue.trim()} onClick={startPractice}>
          {focus.experiment ? "Continue practice" : "Start practice"}<ArrowRight size={14} /></button>
          <button className="rc-button rc-quiet" onClick={() => saveReflection("review")}>Leave as a note</button></div>
        {focus.experiment && <p className="rc-subtle">Your existing check-ins stay with this cue. A fresh trial can begin after you save a conclusion.</p>}
      </div>
    </>}

    {step === "checkin" && focus?.experiment && progress && <>
      <span className="rc-eyebrow"><Target size={14} /> Your practice</span><h3 className="rc-stage-title">Did the situation come up?</h3>
      <p className="rc-stage-intro">Check your process after each relevant game. A few games can inform your next step; they don't prove a better win rate.</p>
      <div className="rc-practice-panel rc-panel">
        <div className="rc-plan"><small>When {focus.experiment.hypothesis}</small><p>I'll {focus.experiment.process}</p></div>
        {focus.experiment.goalText && <p className="rc-goal-strip"><Target size={15} />Linked goal: {focus.experiment.goalText}</p>}
        <p className="rc-subtle">{focus.insight.scope || "Existing practice scope"}</p>
        <div className="rc-trial-header"><span>{progress.eligibleGamesTracked} of {progress.targetEligibleGames} opportunities reviewed</span><strong>{progress.gamesRemaining} remaining</strong></div>
        <progress className="rc-progress" aria-label="Practice progress" max={progress.targetEligibleGames} value={progress.eligibleGamesTracked} />
        <div className="rc-checkin-list">{focus.experiment.games.map((game) => <div className="rc-checkin-row" key={game.id}>
          <CheckCircle2 size={16} /><div><strong>{dateTimeLabel(game.capturedAt)} · Game {game.gameNumber || "?"}</strong><small>vs {game.opponentLegend || "Unknown opponent"}</small></div>
          <span className="rc-checkin-label">{checkinLabel(game.adherence)}</span>
          {game.replayId && replays.some((replay) => replay.id === game.replayId && !replay.deletedAt) && <button className="rc-button rc-quiet" onClick={() => onOpenReplay(game.replayId!)} aria-label={`Open replay for ${dateLabel(game.capturedAt)} game ${game.gameNumber || "unknown"}`}><Play size={14} /></button>}
        </div>)}</div>
        {sourceExcluded && <div className="rc-alert">The source for this practice was excluded from Coach. Your previous check-ins remain saved; new check-ins are disabled.</div>}
        {!sourceExcluded && focus.status === "testing" && !progress.readyForReview && <>
          {pendingGames.length ? <div className="rc-next-game"><h4>Next game to check in</h4><p>{dateTimeLabel(pendingGames[0].capturedAt)} · Game {pendingGames[0].gameNumber || "?"} · vs {pendingGames[0].opponentLegend}</p>
            <div className="rc-actions">{CHECKINS.map((item) => <button className="rc-button" key={item.value} onClick={() => checkIn(pendingGames[0], item.value)}>{item.label}</button>)}</div>
            {pendingGames[0].replayId && <button className="rc-button rc-quiet" onClick={() => onOpenReplay(pendingGames[0].replayId!)}><Play size={14} />Review this game first</button>}
          </div> : <div className="rc-response"><Clock3 size={16} /><p>No later games in this scope are waiting for check-in. Play with this deck version, then return here.</p></div>}
          <p className="rc-subtle">No opportunity is recorded separately and never counts as a missed cue.</p>
        </>}
        {!sourceExcluded && progress.readyForReview && focus.status !== "learned" && <div className="rc-conclusion"><h4>What will you carry forward?</h4>
          <label className="rc-field">Your conclusion<textarea maxLength={4000} value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="What helped, what changed, or what needs another try?" /></label>
          <div className="rc-actions"><button className="rc-button" disabled={!conclusion.trim()} onClick={() => finish("keep-practising")}>Keep practising</button>
            <button className="rc-button" disabled={!conclusion.trim()} onClick={() => finish("adjust-cue")}>Adjust cue</button>
            <button className="rc-button rc-primary" disabled={!conclusion.trim()} onClick={() => finish("finish-practice")}>Finish practice <Check size={14} /></button></div>
          {focus.experiment.goalId && <p className="rc-subtle">Finishing saves this practice in your journal. You can update the linked goal in Deck Notebook.</p>}
        </div>}
        {focus.status === "learned" && <div className="rc-response"><CheckCircle2 size={16} /><p>Practice complete. Your cue, check-ins and conclusion are saved in the journal.</p></div>}
        <div className="rc-actions rc-secondary-actions"><button className="rc-button rc-quiet" onClick={() => { setJournalFocusId(""); setStep("review"); }}><ArrowLeft size={14} />Back to review</button>
          {!progress.readyForReview && focus.status === "testing" && <button className="rc-button rc-quiet" onClick={() => { if (commit(transitionReplayCoachingFocus(focus, "paused", "Paused by the player"))) setNotice("Practice paused. Your check-ins are saved."); }}><Pause size={14} />Pause practice</button>}
          {!sourceExcluded && focus.status === "paused" && <button className="rc-button" onClick={() => { if (commit(startReplayCoachingExperiment(focus), true)) setNotice("Practice resumed with your existing check-ins."); }}>Resume practice</button>}
        </div>
      </div>
    </>}

    <details className="rc-journal"><summary><History size={16} /><span>Your journal</span><small>{store.focuses.length} saved {store.focuses.length === 1 ? "moment" : "moments"}</small></summary>
      {store.focuses.length ? store.focuses.map((item) => <article key={item.id} className="rc-journal-entry">
        <div><strong>{item.insight.title}</strong><small>{dateLabel(item.updatedAt)} · {item.reflection?.value === "wrong" ? "Capture correction · excluded" : item.status === "learned" ? "Practice complete" : item.experiment ? "Practice saved" : "Reflection saved"}</small></div>
        {item.reflection?.note && <p>{item.reflection.note}</p>}
        {item.conclusions?.map((entry, index) => <p className="rc-journal-conclusion" key={`${entry.recordedAt}:${index}`}><b>Conclusion:</b> {entry.note}</p>)}
        {item.reflection?.value !== "wrong" && <button className="rc-button" onClick={() => openFocus(item)}>{item.experiment ? "Open practice" : "Open reflection"}<ArrowRight size={14} /></button>}
      </article>) : <p className="rc-subtle">Your saved reflections, practice cues and conclusions will appear here.</p>}
    </details>
  </section>;
}

function PlanSnapshot({ moment }: { moment: ReplayCoachMoment }) {
  return <div className="rc-plan"><small>{moment.frozenPlan ? `Your plan at the time · ${dateLabel(moment.frozenPlan.capturedAt)}` : "Your plan at the time"}</small>
    {moment.frozenPlan?.lines.length ? moment.frozenPlan.lines.map((line, index) => <p key={index}>{line}</p>)
      : <p>No match-time plan was captured. Add what you remember in your reflection.</p>}</div>;
}

function EvidencePanel({ moment, focus, onOpenReplay }: {
  moment?: ReplayCoachMoment; focus: ReplayCoachingFocus;
  onOpenReplay: ReplayCoachViewProps["onOpenReplay"];
}) {
  return <aside className="rc-evidence rc-panel" aria-label="Replay evidence">
    <h4><ShieldCheck size={15} />Recorded evidence</h4>
    {moment && (moment.cardId || moment.imageUrl) && <div className="rc-evidence-card">
      <CardArtworkImage card={{ cardId: moment.cardId, imageUrl: moment.imageUrl }} alt={moment.cardName || "Card from this decision"} fallback={<BookOpen size={24} />} />
      <div><strong>{moment.title}</strong><small>{moment.timeMs !== undefined ? timeLabel(moment.timeMs) : "Recorded decision"}{moment.gameNumber ? ` · Game ${moment.gameNumber}` : ""}</small></div>
    </div>}
    <p className="rc-body-copy">{moment?.observation || focus.insight.body || "Your saved reflection remains available even if the original replay has been removed."}</p>
    {moment ? <>
      <div className="rc-evidence-links">{moment.evidence.map((entry) => <button className="rc-evidence-link" key={entry.id}
        onClick={() => onOpenReplay(entry.replayId, entry.timeMs, entry.eventId)}><Play size={14} /><span><strong>{entry.label}</strong><small>{entry.timeMs !== undefined ? timeLabel(entry.timeMs) : "Open replay"}</small></span><ArrowRight size={14} /></button>)}</div>
      {!moment.evidence.length && <button className="rc-button" onClick={() => onOpenReplay(moment.replayId, moment.timeMs, moment.eventId)}><Play size={14} />Open replay</button>}
      <PlanSnapshot moment={moment} />
    </> : <p className="rc-subtle">The source replay is unavailable in this library.</p>}
    <p className="rc-subtle">Timing and outcomes alone do not tell us whether a decision was right.</p>
  </aside>;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Unknown date";
}
function dateTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Unknown date";
}
function timeLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function checkinLabel(value: ReplayCoachingAdherence): string {
  return CHECKINS.find((item) => item.value === value)?.label ?? "Unsure";
}
