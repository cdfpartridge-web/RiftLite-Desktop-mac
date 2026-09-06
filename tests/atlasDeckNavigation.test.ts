import { describe, expect, it } from "vitest";
import { isAtlasDeckPageUrl, isAtlasDeckWorkflowUrl } from "../src/shared/atlasDeckNavigation.js";
import {
  embeddedWebviewPolicy,
  gamePlatformForTrustedUrl,
  isAllowedEmbeddedNavigation,
  isAllowedEmbeddedPermission,
  isAllowedGameMainFrameNavigation,
  isAllowedGamePopupNavigation
} from "../src/shared/embeddedContentSecurity.js";
import { validatedCaptureEvent } from "../src/shared/ipcPayloadSecurity.js";

const atlas = { kind: "game", platform: "atlas" } as const;
const tcga = { kind: "game", platform: "tcga" } as const;

describe("Atlas deck navigation", () => {
  it("preserves deck text copy/export without granting clipboard read or other editor permissions", () => {
    const allowed = new Set(["clipboard-sanitized-write", "fullscreen"]);
    const editor = "https://riftatlas.com/fr/decks/saved-deck-123";
    expect(isAllowedEmbeddedPermission(atlas, editor, "clipboard-sanitized-write", allowed)).toBe(true);
    expect(isAllowedEmbeddedPermission(atlas, editor, "clipboard-read", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, editor, "fullscreen", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, editor, "media", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(tcga, editor, "clipboard-sanitized-write", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, "https://evil.example/decks/123", "clipboard-sanitized-write", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, "https://riftatlas.com/sign-in", "clipboard-sanitized-write", allowed)).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, editor, "clipboard-sanitized-write", new Set())).toBe(false);
    expect(isAllowedEmbeddedPermission(atlas, "https://play.riftatlas.com/", "fullscreen", allowed)).toBe(true);
    expect(isAllowedEmbeddedPermission(atlas, "https://play.riftatlas.com/", "media", allowed)).toBe(false);
  });
  it.each([
    "https://riftatlas.com/decks",
    "https://riftatlas.com/decks/",
    "https://riftatlas.com/decks/new?clearDraft=1",
    "https://riftatlas.com/decks/saved-deck-123?clearDraft=1",
    "https://riftatlas.com/fr/decks/saved-deck-123?clearDraft=1",
    "https://riftatlas.com/zh-TW/decks/new?clearDraft=1"
  ])("keeps %s in Atlas without granting game or capture privileges", (url) => {
    expect(isAtlasDeckPageUrl(url)).toBe(true);
    expect(isAllowedGameMainFrameNavigation(atlas, url)).toBe(true);
    expect(isAllowedGamePopupNavigation(atlas, url)).toBe(true);
    expect(isAllowedGameMainFrameNavigation(tcga, url)).toBe(false);
    expect(gamePlatformForTrustedUrl(url)).toBeNull();
    expect(isAllowedEmbeddedNavigation(atlas, url)).toBe(false);
    expect(embeddedWebviewPolicy(url, "persist:riftlite-atlas")).toBeNull();
    expect(validatedCaptureEvent({
      id: "deck-page-event", platform: "atlas", kind: "match-start",
      capturedAt: "2026-09-06T13:00:00.000Z", url, payload: { active: true }
    })).toBeNull();
  });

  it.each([
    "https://riftatlas.com/sign-in?redirect_url=%2Fdecks%2F123",
    "https://riftatlas.com/sign-in/sso-callback",
    "https://riftatlas.com/fr/sign-up"
  ])("allows the editor's sign-in flow: %s", (url) => {
    expect(isAtlasDeckPageUrl(url)).toBe(false);
    expect(isAtlasDeckWorkflowUrl(url)).toBe(true);
    expect(isAllowedGameMainFrameNavigation(atlas, url)).toBe(true);
    expect(isAllowedGamePopupNavigation(atlas, url)).toBe(true);
    expect(gamePlatformForTrustedUrl(url)).toBeNull();
  });

  it.each([
    "https://riftatlas.com/",
    "https://riftatlas.com/sealed",
    "https://riftatlas.com/decks-elsewhere",
    "https://riftatlas.com/sign-in-elsewhere",
    "https://riftatlas.com/decks/../../sealed",
    "https://riftatlas.com/decks/%2e%2e/sealed",
    "https://riftatlas.com/decks%2fnew",
    "https://riftatlas.com:8443/decks/new",
    "http://riftatlas.com/decks/new",
    "https://riftatlas.com.evil.example/decks/new",
    "https://evil.example/?next=https://riftatlas.com/decks/new",
    "https://user:secret@riftatlas.com/decks/new",
    "file:///decks/new",
    "javascript:alert(1)",
    "not a URL"
  ])("does not expand navigation to unrelated or malformed URL %s", (url) => {
    expect(isAtlasDeckWorkflowUrl(url)).toBe(false);
    expect(isAllowedGameMainFrameNavigation(atlas, url)).toBe(false);
    expect(isAllowedGamePopupNavigation(atlas, url)).toBe(false);
  });
});
