import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AtlasGuestRecoveryLifecycle } from "../src/main/services/atlasGuestRecoveryLifecycle.js";
import { AtlasEmptyShellMainRecoveryGuard } from "../src/main/services/atlasEmptyShellMainRecovery.js";
import { AtlasCompatibilityStyleInstaller } from "../src/main/services/atlasCompatibilityStyleInstaller.js";
import { atlasCardRenderingCssForUrl } from "../src/shared/atlasCardRendering.js";
import { atlasLobbyPlayerFieldRepairCssForUrl } from "../src/shared/atlasLobbyPlayerField.js";
import type { AtlasLobbyPlayerFieldState } from "../src/shared/atlasLobbyPlayerField.js";

const main = readFileSync(new URL("../src/main/main.ts", import.meta.url), "utf8");
const preload = readFileSync(new URL("../src/game-preload/gamePreload.ts", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/main/services/atlasLobbyPlayerFieldRepair.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing source block: ${start}`);
  return source.slice(from, to);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

/** Exercise the importable production lifecycle without starting Electron. */
function lifecycleFixture() {
  const state = {
    url: "https://play.riftatlas.com/",
    loading: false,
    destroyed: false,
    platformSwitchAllowed: true,
    protectedByGameEntry: false
  };
  const webContents = {
    id: 41,
    getURL: () => state.url,
    isDestroyed: () => state.destroyed,
    isLoadingMainFrame: () => state.loading
  };
  const currentGuests = new Map([["atlas", webContents]]);
  const emptyShell = new AtlasEmptyShellMainRecoveryGuard();
  const beginNavigation = vi.spyOn(emptyShell, "beginNavigation");
  const readField = vi.fn(async (): Promise<AtlasLobbyPlayerFieldState> => "collapsed");
  const applyCss = vi.fn(async () => undefined);
  const report = vi.fn();
  const repair = new AtlasGuestRecoveryLifecycle({
    guest: webContents,
    platform: "atlas",
    emptyShellRecovery: emptyShell,
    currentAtlasGuestId: () => currentGuests.get("atlas")?.id ?? null,
    platformSwitchAllowed: () => state.platformSwitchAllowed,
    protectedByGameEntry: () => state.protectedByGameEntry,
    readField,
    applyCss,
    report,
    delay: async () => undefined
  });
  beginNavigation.mockClear();
  const isSafe = () => repair.isSafeForAutomaticRecovery();
  const emit = (name: string, url: string, first = false, second = false) => {
    if (name === "did-start-navigation") repair.navigationStarted(first, second);
    else if (name === "did-navigate") repair.navigationCommitted(url);
    else if (name === "did-navigate-in-page") repair.inPageNavigationCommitted(url, first);
    else throw new Error(`Unknown lifecycle event: ${name}`);
  };
  const successfulReads = () => {
    readField.mockResolvedValueOnce("collapsed").mockResolvedValueOnce("collapsed").mockResolvedValueOnce("ready");
  };
  return { state, currentGuests, emptyShell, beginNavigation, isSafe, repair, readField, applyCss, report, emit, successfulReads };
}

describe("Atlas required Player field CSS repair integration", () => {
  it("observes collapsed fields after shell readiness and without debug opt-in", () => {
    const monitor = between(preload, "function reportAtlasShellStatusIfNeeded", "function isAtlasAuthSurface");
    const probe = between(monitor, "const playerFieldState =", "const hiddenShellSelector");
    expect(probe).toContain("readAtlasLobbyPlayerField()");
    expect(probe).toContain('send("debug", { reason: "atlas-lobby-player-field-collapsed" })');
    expect(probe).not.toContain("sendDebug");
    expect(probe).toContain("15_000");
    expect(monitor.indexOf("const playerFieldState =")).toBeLessThan(monitor.indexOf("if (atlasShellReadyReported)"));
    expect(probe).not.toContain("atlasEmptyShellReported");
  });

  it("uses the trusted guest event handler but never routes the defect into a reload", () => {
    const handler = between(main, "function handleAtlasShellStatusEvent", "async function createWindow");
    const branch = between(handler, 'if (reason === "atlas-lobby-player-field-collapsed")', "if (!atlasEmptyShellMainRecovery.isCurrentNavigation");
    expect(branch).toContain("guestLifecycle.check()");
    expect(branch).toContain("return;");
    expect(branch).not.toMatch(/loadURL|clearStorage|recoverAtlasRoomAuth/);
    expect(branch).toContain("reportedUrl === senderUrl");
  });

  it("rechecks the current guest, navigation, capture and matchmaking fences", () => {
    const wiring = between(main, "const guestRecovery =", 'webContents.on("did-start-navigation"');
    expect(wiring).toContain("new AtlasGuestRecoveryLifecycle({");
    expect(wiring).toContain('currentAtlasGuestId: () => gameWebContentsByPlatform.get("atlas")?.id');
    expect(wiring).toContain("platformSwitchAllowed: () => capture.getGamePlatformSwitchStatus().allowed");
    expect(wiring).toContain("protectedByGameEntry: (url) => atlasAutomaticRecoverySafetyFence.isProtected(webContents.id, url)");
    expect(wiring).toContain("webContents.executeJavaScript(ATLAS_LOBBY_PLAYER_FIELD_PROBE)");
    expect(wiring).toContain("webContents.insertCSS(atlasLobbyPlayerFieldRepairCssForUrl(webContents.getURL()))");
    expect(wiring).not.toContain("webContents.insertCSS(atlasCardRenderingCssForUrl(webContents.getURL()))");
    expect(wiring).not.toMatch(/loadURL|removeInsertedCSS|clearStorage|localStorage|cookies/);
    expect(controller).not.toMatch(/loadURL|reload\(|localStorage|sessionStorage|cookies|openSignIn|\.click\(/);
  });

  it("cancels stale work on document/SPA navigation and disposes replaced guests", () => {
    expect(main).toContain("guestRecovery.navigationStarted(isInPlace, isMainFrame)");
    expect(main).toContain("guestRecovery.navigationCommitted(url)");
    expect(main).toContain("guestRecovery.inPageNavigationCommitted(url, isMainFrame)");
    expect(main).toContain("guestRecovery.dispose()");
    expect(main).toContain("atlasGuestRecoveryByGuest.delete(webContents.id)");
  });

  it("shows a failed repair without an automatic remount or sign-in reset prompt", () => {
    const notice = between(renderer, 'if (failure.reason === "lobby-layout")', "void (async () =>");
    expect(notice).toContain("showCaptureNotice");
    expect(notice).toContain("return;");
    expect(notice).not.toMatch(/setGameWebviewEpoch|setAtlasRecoverySuggested|recoverAtlasWebview/);
    const feedback = between(main, 'report: (outcome) =>', 'webContents.on("did-start-navigation"');
    expect(feedback).toContain('if (outcome === "failed")');
    expect(feedback).toContain("canAutoRemount: false");
  });
});

describe("Atlas Player-field repair navigation lifecycle", () => {
  it("accepts committed readiness during slow loading without permitting repair", async () => {
    const fixture = lifecycleFixture();
    fixture.state.loading = true;
    expect(fixture.repair.matchesCommittedDocument()).toBe(true);
    expect(fixture.repair.isCurrentDocument()).toBe(false);
    expect(fixture.emptyShell.isCurrentNavigation(41, fixture.state.url)).toBe(true);
    await fixture.repair.check();
    expect(fixture.applyCss).not.toHaveBeenCalled();
    fixture.emit("did-start-navigation", fixture.state.url, false, true);
    expect(fixture.repair.matchesCommittedDocument()).toBe(false);
    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.repair.matchesCommittedDocument()).toBe(true);
    expect(fixture.repair.isCurrentDocument()).toBe(false);
  });

  it("cancels a scheduled empty-shell reload on a prevented start without poisoning the surviving lobby", () => {
    const fixture = lifecycleFixture();
    const first = fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false);
    if (first.action !== "schedule-reload") throw new Error("Expected scheduled recovery");
    const originalEpoch = fixture.repair.documentEpoch;

    fixture.emit("did-start-navigation", "https://riftatlas.com/decks/new", false, true);
    expect(fixture.repair.isCurrentDocument(originalEpoch)).toBe(false);
    expect(fixture.repair.isCurrentDocument()).toBe(true);
    expect(fixture.emptyShell.isCurrentNavigation(41, fixture.state.url)).toBe(true);
    expect(fixture.emptyShell.commitScheduledReload(first.recoveryKey, 41, first.navigationKey)).toBe(false);
    const next = fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false);
    expect(next.action).toBe("schedule-reload");
    expect(fixture.emptyShell.markAtlasShellReady(41, fixture.state.url, true)).toBe(true);
  });

  it("keeps an already-consumed empty-shell budget across cancelled starts and same-URL reloads", () => {
    const fixture = lifecycleFixture();
    const first = fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false);
    if (first.action !== "schedule-reload") throw new Error("Expected scheduled recovery");
    expect(fixture.emptyShell.commitScheduledReload(first.recoveryKey, 41, first.navigationKey)).toBe(true);

    fixture.emit("did-start-navigation", "https://riftatlas.com/decks/new", false, true);
    expect(fixture.emptyShell.canFinishCommittedReload(first.recoveryKey, 41, first.navigationKey)).toBe(false);
    expect(fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false)).toMatchObject({
      action: "ignore", reason: "already-consumed"
    });
    fixture.emit("did-start-navigation", fixture.state.url, false, true);
    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false)).toMatchObject({
      action: "ignore", reason: "already-consumed"
    });
    expect(fixture.emptyShell.markAtlasShellReady(41, fixture.state.url, false)).toBe(false);
    expect(fixture.emptyShell.markAtlasShellReady(41, fixture.state.url, true)).toBe(true);
  });

  it("does not let outgoing lobby readiness refund a consumed budget during an uncommitted navigation", () => {
    const fixture = lifecycleFixture();
    const first = fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false);
    if (first.action !== "schedule-reload") throw new Error("Expected scheduled recovery");
    fixture.emptyShell.commitScheduledReload(first.recoveryKey, 41, first.navigationKey);
    fixture.state.loading = true;
    fixture.emit("did-start-navigation", "https://play.riftatlas.com/lobby", false, true);
    expect(fixture.repair.matchesCommittedDocument()).toBe(false);
    // This is the read-only guard used by the shell-ready IPC branch.
    if (fixture.repair.matchesCommittedDocument()) {
      fixture.emptyShell.markAtlasShellReady(41, fixture.state.url, true);
    }
    expect(fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false)).toMatchObject({
      action: "ignore", reason: "already-consumed"
    });
    fixture.state.url = "https://play.riftatlas.com/lobby";
    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.repair.matchesCommittedDocument()).toBe(true);
    expect(fixture.emptyShell.markAtlasShellReady(41, fixture.state.url, true)).toBe(true);
    expect(fixture.repair.isSafeForAutomaticRecovery()).toBe(false);
  });

  it("invalidates delayed work across a same-URL commit and SPA transition", () => {
    const fixture = lifecycleFixture();
    const oldDocument = fixture.repair.documentEpoch;
    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.repair.isCurrentDocument(oldDocument)).toBe(false);
    const beforeSpa = fixture.repair.documentEpoch;
    fixture.readField.mockResolvedValue("ready");
    fixture.emit("did-navigate-in-page", fixture.state.url, true);
    expect(fixture.repair.isCurrentDocument(beforeSpa)).toBe(false);
    expect(fixture.repair.isCurrentDocument()).toBe(true);
  });

  it("disposes pending work and navigation identity without refunding a consumed session budget", async () => {
    const fixture = lifecycleFixture();
    const first = fixture.emptyShell.considerEmptyShell(41, fixture.state.url, false);
    if (first.action !== "schedule-reload") throw new Error("Expected scheduled recovery");
    fixture.emptyShell.commitScheduledReload(first.recoveryKey, 41, first.navigationKey);
    const initial = deferred<AtlasLobbyPlayerFieldState>();
    fixture.readField.mockImplementationOnce(() => initial.promise);
    const pending = fixture.repair.check();
    fixture.repair.dispose();
    fixture.repair.dispose();
    initial.resolve("collapsed");
    await pending;
    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.applyCss).not.toHaveBeenCalled();
    expect(fixture.repair.isCurrentDocument()).toBe(false);
    expect(fixture.emptyShell.isCurrentNavigation(41, fixture.state.url)).toBe(false);
    fixture.emptyShell.beginNavigation(77, fixture.state.url);
    expect(fixture.emptyShell.considerEmptyShell(77, fixture.state.url, false)).toMatchObject({
      action: "ignore", reason: "already-consumed"
    });
  });

  it("uses a distinct fallback after the real baseline stylesheet is already installed", async () => {
    const fixture = lifecycleFixture();
    const inserted: string[] = [];
    const baseline = new AtlasCompatibilityStyleInstaller({
      isDestroyed: () => fixture.state.destroyed,
      cssForCurrentUrl: () => atlasCardRenderingCssForUrl(fixture.state.url),
      insertCss: async (css) => { inserted.push(css); return "baseline"; },
      removeCss: vi.fn(async () => undefined),
      reportFailure: vi.fn()
    });
    baseline.install();
    // Baseline insertion does not itself prove recovery of the zero-sized field.
    fixture.applyCss.mockImplementation(async () => {
      inserted.push(atlasLobbyPlayerFieldRepairCssForUrl(fixture.state.url));
    });
    fixture.successfulReads();
    await fixture.repair.check();
    baseline.install();
    await fixture.repair.check();
    expect(inserted).toEqual([
      atlasCardRenderingCssForUrl(fixture.state.url),
      atlasLobbyPlayerFieldRepairCssForUrl(fixture.state.url)
    ]);
    expect(inserted[0]).not.toEqual(inserted[1]);
    expect(fixture.report).toHaveBeenCalledExactlyOnceWith("repaired");
    baseline.dispose();
  });

  it("cancels pending work for a prevented external start, then permits repair in the surviving lobby", async () => {
    const fixture = lifecycleFixture();
    const initial = deferred<AtlasLobbyPlayerFieldState>();
    fixture.readField.mockImplementationOnce(() => initial.promise);
    const pending = fixture.repair.check();

    fixture.state.loading = true;
    fixture.emit("did-start-navigation", "https://riftatlas.com/decks/new", false, true);
    expect(fixture.isSafe()).toBe(false);
    // Electron prevents the external navigation. There is no commit/dom-ready;
    // its actual URL and both controllers remain on the original lobby.
    fixture.state.loading = false;
    expect(fixture.beginNavigation).toHaveBeenCalledWith(41, fixture.state.url);
    expect(fixture.emptyShell.isCurrentNavigation(41, fixture.state.url)).toBe(true);
    expect(fixture.emptyShell.isCurrentNavigation(41, "https://riftatlas.com/decks/new")).toBe(false);
    expect(fixture.isSafe()).toBe(true);
    initial.resolve("collapsed");
    await pending;
    expect(fixture.applyCss).not.toHaveBeenCalled();

    fixture.successfulReads();
    await fixture.repair.check();
    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
    expect(fixture.report).toHaveBeenCalledExactlyOnceWith("repaired");
  });

  it("retains the attempt after cancelled starts and renews it only when a same-URL reload commits", async () => {
    const fixture = lifecycleFixture();
    fixture.successfulReads();
    await fixture.repair.check();

    fixture.emit("did-start-navigation", "https://riftatlas.com/decks/new", false, true);
    await fixture.repair.check();
    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
    expect(fixture.readField).toHaveBeenCalledTimes(3);

    fixture.state.loading = true;
    fixture.emit("did-start-navigation", fixture.state.url, false, true);
    await fixture.repair.check();
    fixture.state.loading = false;
    // Merely finishing a start without committing is still the old document.
    await fixture.repair.check();
    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
    fixture.emit("did-navigate", fixture.state.url);
    fixture.successfulReads();
    await fixture.repair.check();

    expect(fixture.applyCss).toHaveBeenCalledTimes(2);
    expect(fixture.report.mock.calls).toEqual([["repaired"], ["repaired"]]);
  });

  it("cancels an old document's pending probe even when the new document commits to the same URL", async () => {
    const fixture = lifecycleFixture();
    const initial = deferred<AtlasLobbyPlayerFieldState>();
    fixture.readField.mockImplementationOnce(() => initial.promise);
    const pending = fixture.repair.check();

    fixture.emit("did-start-navigation", fixture.state.url, false, true);
    fixture.emit("did-navigate", fixture.state.url);
    initial.resolve("collapsed");
    await pending;
    expect(fixture.applyCss).not.toHaveBeenCalled();

    fixture.successfulReads();
    await fixture.repair.check();
    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
  });

  it("updates SPA identity without granting another attempt in the same document", async () => {
    const fixture = lifecycleFixture();
    fixture.successfulReads();
    await fixture.repair.check();

    fixture.state.url = "https://play.riftatlas.com/lobby";
    expect(fixture.isSafe()).toBe(false);
    fixture.emit("did-navigate-in-page", fixture.state.url, true);
    expect(fixture.isSafe()).toBe(true);
    await fixture.repair.check();

    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
    expect(fixture.readField).toHaveBeenCalledTimes(3);
    expect(fixture.beginNavigation).toHaveBeenCalledWith(41, fixture.state.url);
  });

  it("cancels a pending probe on SPA navigation and measures the new lobby instead", async () => {
    const fixture = lifecycleFixture();
    const initial = deferred<AtlasLobbyPlayerFieldState>();
    const replacement = deferred<AtlasLobbyPlayerFieldState>();
    fixture.readField.mockImplementationOnce(() => initial.promise).mockImplementationOnce(() => replacement.promise);
    const pending = fixture.repair.check();

    fixture.state.url = "https://play.riftatlas.com/lobby";
    fixture.emit("did-navigate-in-page", fixture.state.url, true);
    expect(fixture.readField).toHaveBeenCalledTimes(2);
    initial.resolve("collapsed");
    await pending;
    expect(fixture.applyCss).not.toHaveBeenCalled();
    replacement.resolve("ready");
    await Promise.resolve();
    expect(fixture.readField).toHaveBeenCalledTimes(2);
    expect(fixture.applyCss).not.toHaveBeenCalled();
  });

  it("ignores subframe/in-place starts and does not cancel a current main-frame probe", async () => {
    const fixture = lifecycleFixture();
    const initial = deferred<AtlasLobbyPlayerFieldState>();
    fixture.readField.mockImplementationOnce(() => initial.promise)
      .mockResolvedValueOnce("collapsed").mockResolvedValueOnce("ready");
    const pending = fixture.repair.check();

    fixture.emit("did-start-navigation", "https://example.com/frame", false, false);
    fixture.emit("did-start-navigation", fixture.state.url, true, true);
    initial.resolve("collapsed");
    await pending;

    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
    expect(fixture.beginNavigation).not.toHaveBeenCalled();
  });

  it("blocks loading and uncommitted URL changes until the actual navigation commits", async () => {
    const fixture = lifecycleFixture();
    fixture.state.loading = true;
    expect(fixture.isSafe()).toBe(false);
    await fixture.repair.check();
    fixture.state.loading = false;
    fixture.state.url = "https://play.riftatlas.com/lobby";
    expect(fixture.isSafe()).toBe(false);
    await fixture.repair.check();
    expect(fixture.readField).not.toHaveBeenCalled();

    fixture.emit("did-navigate", fixture.state.url);
    expect(fixture.isSafe()).toBe(true);
    fixture.successfulReads();
    await fixture.repair.check();
    expect(fixture.applyCss).toHaveBeenCalledTimes(1);
  });

  it.each(["replaced guest", "capture", "matchmaking", "destroyed guest"])("honors the live %s fence after a cancelled start", async (fence) => {
    const fixture = lifecycleFixture();
    fixture.emit("did-start-navigation", "https://riftatlas.com/decks/new", false, true);
    if (fence === "replaced guest") fixture.currentGuests.delete("atlas");
    if (fence === "capture") fixture.state.platformSwitchAllowed = false;
    if (fence === "matchmaking") fixture.state.protectedByGameEntry = true;
    if (fence === "destroyed guest") fixture.state.destroyed = true;

    expect(fixture.isSafe()).toBe(false);
    await fixture.repair.check();
    expect(fixture.readField).not.toHaveBeenCalled();
    expect(fixture.applyCss).not.toHaveBeenCalled();
  });
});
