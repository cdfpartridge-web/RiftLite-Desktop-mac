import {
  emptyReplayCoachingStore, parseReplayCoachingStore, REPLAY_COACHING_STORAGE_KEY,
  serializeReplayCoachingStore, transitionReplayCoachingFocus,
  type ReplayCoachingFocus, type ReplayCoachingStore
} from "../shared/replayCoaching";

type CoachStorage = Pick<Storage, "getItem" | "setItem">;

/** Do not silently replace an unreadable journal with an empty one. */
export function readReplayCoachState(storage?: CoachStorage): { store: ReplayCoachingStore; error: string } {
  try {
    const raw = storage?.getItem(REPLAY_COACHING_STORAGE_KEY);
    if (!raw) return { store: emptyReplayCoachingStore(), error: "" };
    const value = JSON.parse(raw);
    if (!Array.isArray(value) && (!value || typeof value !== "object"
      || (!Array.isArray(value.focuses) && !Array.isArray(value.items))
      || (value.version !== undefined && value.version !== 1))) throw new Error("Unknown journal format");
    const result = parseReplayCoachingStore(value);
    if (result.discardedFocuses) throw new Error("Journal contains unreadable entries");
    return { store: result.store, error: "" };
  } catch {
    return { store: emptyReplayCoachingStore(), error: "Your existing Coach journal could not be read. It has been left untouched. Restart RiftLite before saving new entries." };
  }
}

/** Persist first: callers must not show a saved result when local storage fails. */
export function saveReplayCoachFocus(
  storage: CoachStorage, current: ReplayCoachingStore, focus: ReplayCoachingFocus, activate = false
): ReplayCoachingStore {
  const loaded = readReplayCoachState(storage);
  if (loaded.error) throw new Error(loaded.error);
  const source = storage.getItem(REPLAY_COACHING_STORAGE_KEY) ? loaded.store : current;
  const latestFocus = source.focuses.find((item) => item.id === focus.id);
  const knownFocus = parseReplayCoachingStore(current).store.focuses.find((item) => item.id === focus.id);
  if (JSON.stringify(latestFocus) !== JSON.stringify(knownFocus)) {
    throw new Error("This journal entry changed in another view. Reopen Replay Coach to load the latest notes before saving.");
  }
  if (!source.focuses.some((item) => item.id === focus.id) && source.focuses.length >= 100) {
    throw new Error("Your Coach journal has reached its 100-entry limit. Existing entries have been preserved.");
  }
  const focuses = source.focuses.filter((item) => item.id !== focus.id).map((item) => (
    activate && item.id === source.activeFocusId && item.status === "testing"
      ? transitionReplayCoachingFocus(item, "paused", "Another practice cue was selected") : item
  ));
  const next: ReplayCoachingStore = {
    ...source, updatedAt: focus.updatedAt, focuses: [focus, ...focuses],
    activeFocusId: activate ? focus.id : source.activeFocusId
  };
  if (next.activeFocusId === focus.id && (focus.status === "learned" || focus.reflection?.value === "wrong")) {
    delete next.activeFocusId;
  }
  storage.setItem(REPLAY_COACHING_STORAGE_KEY, serializeReplayCoachingStore(next));
  return next;
}
