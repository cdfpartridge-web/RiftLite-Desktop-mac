import { isAtlasDeckPageUrl } from "../../shared/atlasDeckNavigation.js";

/** Electron cancels beforeunload navigation unless the host explicitly overrides it. */
export function handleAtlasDeckBeforeUnload(
  event: { preventDefault(): void },
  currentUrl: string,
  confirmLeave: () => boolean
): void {
  if (!isAtlasDeckPageUrl(currentUrl)) return;
  let leave = false;
  try {
    leave = confirmLeave() === true;
  } catch {
    // A missing or failed dialog must preserve the user's unsaved deck changes.
  }
  if (leave) event.preventDefault();
}
