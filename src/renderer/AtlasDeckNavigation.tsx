import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft } from "lucide-react";
import { ATLAS_PLAY_URL, isAtlasDeckPageUrl } from "../shared/atlasDeckNavigation";

type AtlasNavigationEvent = Event & { url?: string; isMainFrame?: boolean };

export interface AtlasDeckWebview {
  getURL(): string;
  loadURL(url: string): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface AtlasDeckNavigationState {
  visible: boolean;
  busy: boolean;
}

type BeforeReturn = () => boolean | Promise<boolean>;

function isAtlasPlayDestination(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(ATLAS_PLAY_URL).origin || url.username || url.password) return false;
    const path = url.pathname.replace(/\/+$/, "").replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i, "");
    return path === "" || path === "/lobby" || /^\/(?:game|play|room)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

/** Keep the return route through sign-in redirects, failed loads and cancelled navigation. */
export function bindAtlasDeckNavigation(
  webview: AtlasDeckWebview,
  onChange: (state: AtlasDeckNavigationState) => void
) {
  let active = true;
  let state: AtlasDeckNavigationState = { visible: false, busy: false };
  const update = (next: AtlasDeckNavigationState) => {
    if (!active) return;
    state = next;
    onChange(state);
  };
  const observe = (url: string, committed: boolean) => {
    if (isAtlasDeckPageUrl(url)) update({ ...state, visible: true });
    else if (committed && isAtlasPlayDestination(url)) update({ ...state, visible: false });
  };
  const readCurrentUrl = () => {
    try {
      observe(webview.getURL(), true);
    } catch {
      // A newly attached guest may not have a live webContents yet.
    }
  };
  const onNavigation = (committed: boolean): EventListener => (event) => {
    const navigation = event as AtlasNavigationEvent;
    if (navigation.isMainFrame === false || typeof navigation.url !== "string") return;
    observe(navigation.url, committed);
  };
  const bindings: ReadonlyArray<readonly [string, EventListener]> = [
    ["did-start-navigation", onNavigation(false)],
    ["did-redirect-navigation", onNavigation(false)],
    ["did-navigate", onNavigation(true)],
    ["did-navigate-in-page", onNavigation(true)],
    ["dom-ready", readCurrentUrl]
  ];
  for (const [name, listener] of bindings) webview.addEventListener(name, listener);
  update(state);
  readCurrentUrl();

  return {
    async returnToPlay(onBeforeReturn: BeforeReturn | undefined, onError: (message: string) => void) {
      if (!active || !state.visible || state.busy) return;
      update({ ...state, busy: true });
      try {
        if (onBeforeReturn && !await onBeforeReturn()) return;
        if (!active) return;
        // Keep this guest's session; main handles any unsaved-deck confirmation.
        await webview.loadURL(ATLAS_PLAY_URL);
      } catch (error) {
        const failure = error as { code?: string | number; errno?: number; message?: string } | null;
        // Electron may serialize the guest's rejection without its code/errno.
        const aborted = failure?.code === "ERR_ABORTED" || failure?.code === -3 || failure?.errno === -3
          || (typeof failure?.message === "string" && /(?:^|:\s)ERR_ABORTED(?:\s+\(-3\))?(?:\s|$)/.test(failure.message));
        if (active && !aborted) onError("Couldn’t return to Atlas Play. Please try Back to Play again.");
      } finally {
        if (active) update({ ...state, busy: false });
      }
    },
    dispose() {
      if (!active) return;
      active = false;
      for (const [name, listener] of bindings) webview.removeEventListener(name, listener);
    }
  };
}

export interface AtlasDeckNavigationProps {
  webviewRef: RefObject<Electron.WebviewTag | null>;
  mountKey: string;
  onBeforeReturn?: BeforeReturn;
  onError: (message: string) => void;
}

export function AtlasDeckNavigation({ webviewRef, mountKey, onBeforeReturn, onError }: AtlasDeckNavigationProps) {
  const [state, setState] = useState<AtlasDeckNavigationState>({ visible: false, busy: false });
  const controller = useRef<ReturnType<typeof bindAtlasDeckNavigation> | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    setState({ visible: false, busy: false });
    if (!webview) return;
    const binding = bindAtlasDeckNavigation(webview, setState);
    controller.current = binding;
    return () => {
      binding.dispose();
      if (controller.current === binding) controller.current = null;
    };
  }, [webviewRef, mountKey]);

  if (!state.visible) return null;
  return (
    <button
      type="button"
      className="segmented atlas-back-to-play"
      title="Return to Atlas Play"
      disabled={state.busy}
      onClick={() => void controller.current?.returnToPlay(onBeforeReturn, onError)}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span>Back to Play</span>
    </button>
  );
}
