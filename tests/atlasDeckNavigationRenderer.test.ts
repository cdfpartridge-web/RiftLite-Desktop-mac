import { describe, expect, it, vi } from "vitest";
import {
  bindAtlasDeckNavigation,
  type AtlasDeckNavigationState,
  type AtlasDeckWebview
} from "../src/renderer/AtlasDeckNavigation";

class FakeWebview extends EventTarget implements AtlasDeckWebview {
  url = "https://play.riftatlas.com/";
  getURL = vi.fn(() => this.url);
  loadURL = vi.fn(async (_url: string) => {});
  navigate(type: string, url: string, isMainFrame = true) {
    if (isMainFrame && ["did-navigate", "did-navigate-in-page"].includes(type)) this.url = url;
    this.dispatchEvent(Object.assign(new Event(type), { url, isMainFrame }));
  }
}

function setup(url?: string) {
  const webview = new FakeWebview();
  if (url) webview.url = url;
  let state: AtlasDeckNavigationState = { visible: false, busy: false };
  const onChange = vi.fn((next: AtlasDeckNavigationState) => { state = next; });
  const binding = bindAtlasDeckNavigation(webview, onChange);
  return { webview, binding, onChange, state: () => state };
}

describe("Atlas deck return navigation", () => {
  it("appears as a deck navigation starts, even if its load fails", () => {
    const { webview, state } = setup();
    expect(state().visible).toBe(false);
    webview.navigate("did-start-navigation", "https://riftatlas.com/en/decks/example/edit");
    expect(state().visible).toBe(true);
    webview.dispatchEvent(new Event("did-fail-load"));
    expect(state().visible).toBe(true);
  });

  it("recognizes an already loaded editor when the toolbar is mounted", () => {
    expect(setup("https://riftatlas.com/decks/example").state().visible).toBe(true);
  });

  it("waits for a real guest after attachment and reads it on dom-ready", () => {
    const webview = new FakeWebview();
    webview.getURL.mockImplementationOnce(() => { throw new Error("Not attached yet"); });
    const onChange = vi.fn();
    bindAtlasDeckNavigation(webview, onChange);
    expect(onChange).toHaveBeenLastCalledWith({ visible: false, busy: false });
    webview.url = "https://riftatlas.com/decks/example/edit";
    webview.dispatchEvent(new Event("dom-ready"));
    expect(onChange).toHaveBeenLastCalledWith({ visible: true, busy: false });
  });

  it("retains the return action through website and Play sign-in redirects", () => {
    const { webview, state } = setup("https://riftatlas.com/decks/example/edit");
    for (const url of [
      "https://riftatlas.com/sign-in?redirect_url=%2Fdecks%2Fexample",
      "https://riftatlas.com/en/sign-up",
      "https://play.riftatlas.com/sign-in",
      "https://play.riftatlas.com/en/sign-in/sso-callback"
    ]) {
      webview.navigate("did-redirect-navigation", url);
      webview.navigate("did-navigate", url);
      webview.dispatchEvent(new Event("dom-ready"));
      expect(state().visible).toBe(true);
    }
  });

  it("ignores subframe navigation and lookalike hosts", () => {
    const { webview, state } = setup();
    webview.navigate("did-start-navigation", "https://riftatlas.com/decks/example", false);
    webview.navigate("did-navigate-in-page", "https://riftatlas.com/decks/example", false);
    webview.navigate("did-start-navigation", "https://riftatlas.com.attacker.test/decks/example");
    expect(state().visible).toBe(false);
    webview.navigate("did-navigate", "https://riftatlas.com/decks/example");
    webview.navigate("did-navigate-in-page", "https://play.riftatlas.com/", false);
    webview.navigate("did-navigate", "https://play.riftatlas.com.attacker.test/");
    webview.navigate("did-navigate", "https://user@play.riftatlas.com/");
    expect(state().visible).toBe(true);
  });

  it.each(["/", "/lobby", "/en/lobby/", "/en-GB", "/game/example", "/play/example", "/room/example"])(
    "hides only when returning to the committed Play route %s",
    (path) => {
      const { webview, state } = setup("https://riftatlas.com/decks/example/edit");
      webview.navigate("did-start-navigation", `https://play.riftatlas.com${path}`);
      expect(state().visible).toBe(true);
      webview.navigate("did-navigate", `https://play.riftatlas.com${path}`);
      expect(state().visible).toBe(false);
    }
  );

  it("returns inside the same webview after the capture guard allows it", async () => {
    const { webview, binding, state } = setup("https://riftatlas.com/decks/example");
    const guard = vi.fn(async () => true);
    const onError = vi.fn();
    await binding.returnToPlay(guard, onError);
    expect(guard).toHaveBeenCalledOnce();
    expect(webview.loadURL).toHaveBeenCalledExactlyOnceWith("https://play.riftatlas.com/");
    expect(onError).not.toHaveBeenCalled();
    expect(state()).toEqual({ visible: true, busy: false });
    webview.navigate("did-navigate", "https://play.riftatlas.com/");
    expect(state().visible).toBe(false);
  });

  it("keeps the deck open when the capture guard cancels the return", async () => {
    const { webview, binding, state } = setup("https://riftatlas.com/decks/example");
    await binding.returnToPlay(async () => false, vi.fn());
    expect(webview.loadURL).not.toHaveBeenCalled();
    expect(state()).toEqual({ visible: true, busy: false });
  });

  it.each([
    Object.assign(new Error("ERR_ABORTED"), { code: "ERR_ABORTED" }),
    new Error("Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: ERR_ABORTED (-3) loading 'https://play.riftatlas.com/'")
  ])("honours a cancelled beforeunload without showing a misleading error (%s)", async (error) => {
    const { webview, binding, state } = setup("https://riftatlas.com/decks/example");
    const onError = vi.fn();
    webview.loadURL.mockRejectedValueOnce(error);
    await binding.returnToPlay(undefined, onError);
    expect(onError).not.toHaveBeenCalled();
    expect(state()).toEqual({ visible: true, busy: false });
  });

  it("shows a failed return and lets the user retry", async () => {
    const { webview, binding, state } = setup("https://riftatlas.com/decks/example");
    const onError = vi.fn();
    webview.loadURL.mockRejectedValueOnce(new Error("ERR_INTERNET_DISCONNECTED"));
    await binding.returnToPlay(undefined, onError);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Please try Back to Play again"));
    expect(state()).toEqual({ visible: true, busy: false });
    await binding.returnToPlay(undefined, onError);
    expect(webview.loadURL).toHaveBeenCalledTimes(2);
  });

  it("suppresses double clicks while a return is pending", async () => {
    const { webview, binding, state } = setup("https://riftatlas.com/decks/example");
    let allowReturn!: (value: boolean) => void;
    const guard = () => new Promise<boolean>((resolve) => { allowReturn = resolve; });
    const pending = binding.returnToPlay(guard, vi.fn());
    expect(state().busy).toBe(true);
    await binding.returnToPlay(undefined, vi.fn());
    expect(webview.loadURL).not.toHaveBeenCalled();
    allowReturn(true);
    await pending;
    expect(webview.loadURL).toHaveBeenCalledOnce();
  });

  it("removes listeners on unmount and cancels a pending return to a stale guest", async () => {
    const { webview, binding, onChange } = setup("https://riftatlas.com/decks/example");
    let allowReturn!: (value: boolean) => void;
    const pending = binding.returnToPlay(() => new Promise<boolean>((resolve) => { allowReturn = resolve; }), vi.fn());
    binding.dispose();
    binding.dispose();
    onChange.mockClear();
    allowReturn(true);
    await pending;
    webview.navigate("did-start-navigation", "https://riftatlas.com/decks/new");
    webview.navigate("did-navigate", "https://play.riftatlas.com/");
    webview.dispatchEvent(new Event("dom-ready"));
    expect(onChange).not.toHaveBeenCalled();
    expect(webview.loadURL).not.toHaveBeenCalled();
    expect(setup().state()).toEqual({ visible: false, busy: false });
  });
});
