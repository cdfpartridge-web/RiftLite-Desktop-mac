import type { ReplayInsightReflection } from "../shared/replayCoaching";

export const REPLAY_COACH_SESSION_STORAGE_KEY = "riftlite:replay-coach-session:v1";

export interface ReplayCoachSession {
  step: "review" | "context" | "practice" | "checkin";
  selectedId: string;
  journalFocusId: string;
  focusId: string;
  reflection: ReplayInsightReflection;
  note: string;
  trigger: string;
  cue: string;
  goalId: string;
  conclusion: string;
  target: number;
}

const STEPS = new Set(["review", "context", "practice", "checkin"]);
const REFLECTIONS = new Set<ReplayInsightReflection>([
  "intentional", "missed", "forced", "unsure", "wrong", "already-understood"
]);
const TEXT_FIELDS = ["selectedId", "journalFocusId", "focusId", "note", "trigger", "cue", "goalId", "conclusion"] as const;

/** Temporary navigation state only; the durable journal is stored separately. */
export function readReplayCoachSession(storage?: Pick<Storage, "getItem">): ReplayCoachSession | null {
  try {
    const raw = storage?.getItem(REPLAY_COACH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).version !== 1) return null;
    return sessionSnapshot(value);
  } catch {
    return null;
  }
}

/** Failing to save navigation state must never interrupt opening a replay. */
export function writeReplayCoachSession(storage: Pick<Storage, "setItem">, session: ReplayCoachSession): boolean {
  try {
    const snapshot = sessionSnapshot(session);
    if (!snapshot) return false;
    storage.setItem(REPLAY_COACH_SESSION_STORAGE_KEY, JSON.stringify({ version: 1, ...snapshot }));
    return true;
  } catch {
    return false;
  }
}

function sessionSnapshot(value: unknown): ReplayCoachSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!STEPS.has(record.step as string) || !REFLECTIONS.has(record.reflection as ReplayInsightReflection)
    || (record.target !== 3 && record.target !== 4 && record.target !== 5)
    || TEXT_FIELDS.some((field) => typeof record[field] !== "string")) return null;
  const snapshot: ReplayCoachSession = {
    step: record.step as ReplayCoachSession["step"],
    reflection: record.reflection as ReplayInsightReflection,
    target: record.target,
    selectedId: "", journalFocusId: "", focusId: "", note: "", trigger: "", cue: "", goalId: "", conclusion: ""
  };
  // Preserve whitespace in unfinished drafts while bounding stored input.
  for (const field of TEXT_FIELDS) snapshot[field] = (record[field] as string).slice(0, 4_000);
  return snapshot;
}
