export const ATLAS_PLAY_URL = "https://play.riftatlas.com/";

function atlasWebsitePath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== "https://riftatlas.com" || url.username || url.password) return null;
    return url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i, "");
  } catch {
    return null;
  }
}

/** Atlas Play's Edit Deck and New Deck links use the main site's deck routes. */
export function isAtlasDeckPageUrl(value: string): boolean {
  const path = atlasWebsitePath(value);
  return path !== null && (path === "/decks" || path.startsWith("/decks/"));
}

/** Navigation permission only: these pages must not acquire game/capture trust. */
export function isAtlasDeckWorkflowUrl(value: string): boolean {
  if (isAtlasDeckPageUrl(value)) return true;
  const path = atlasWebsitePath(value);
  return path !== null && /^\/sign-(?:in|up)(?:\/|$)/.test(path);
}
