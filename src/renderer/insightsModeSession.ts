export type InsightsMode = "deck" | "coach";
export const INSIGHTS_MODE_SESSION_KEY = "riftlite:insights-mode:v1";

function sessionStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; }
  catch { return undefined; }
}

export function readInsightsMode(storage: Pick<Storage, "getItem"> | undefined = sessionStorage()): InsightsMode {
  try { return storage?.getItem(INSIGHTS_MODE_SESSION_KEY) === "coach" ? "coach" : "deck"; }
  catch { return "deck"; }
}

export function saveInsightsMode(mode: InsightsMode, storage: Pick<Storage, "setItem"> | undefined = sessionStorage()): void {
  try { storage?.setItem(INSIGHTS_MODE_SESSION_KEY, mode); }
  catch { /* Navigation still works when session storage is unavailable. */ }
}
