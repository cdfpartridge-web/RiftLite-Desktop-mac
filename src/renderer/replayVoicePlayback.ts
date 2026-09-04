export type ReplayVoicePlaybackState = {
  clipId?: string;
  offsetMs: number;
  paused: boolean;
};

export type ReplayVoicePlaybackAudio = Pick<HTMLAudioElement, "src" | "currentTime" | "volume" | "play" | "pause">
  & {
    addEventListener(type: "ended" | "error", listener: () => void): void;
    removeEventListener(type: "ended" | "error", listener: () => void): void;
  };

export type ReplayVoicePlayback = {
  play(note: { id: string; dataUrl: string }, volume?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setVolume(volume: number): void;
  dispose(): void;
};

export function createReplayVoicePlayback(input: {
  onChange: (state: ReplayVoicePlaybackState) => void;
  onError: (operation: "play" | "resume") => void;
  createAudio?: () => ReplayVoicePlaybackAudio;
  setInterval?: (callback: () => void, delayMs: number) => number;
  clearInterval?: (id: number) => void;
}): ReplayVoicePlayback {
  const createAudio = input.createAudio ?? (() => new Audio());
  const startInterval = input.setInterval ?? ((callback, delay) => window.setInterval(callback, delay));
  const clearInterval = input.clearInterval ?? ((id) => window.clearInterval(id));
  let state: ReplayVoicePlaybackState = { offsetMs: 0, paused: false };
  let timer: number | null = null;
  let disposed = false;
  let request = 0;
  let volume = 1;
  let current: { audio: ReplayVoicePlaybackAudio; cleanup: () => void } | null = null;

  function publish(next: ReplayVoicePlaybackState): void {
    state = next;
    if (!disposed) input.onChange({ ...state });
  }

  function stopTimer(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function stop(): void {
    request += 1;
    stopTimer();
    const previous = current;
    current = null;
    previous?.cleanup();
    publish({ offsetMs: 0, paused: false });
  }

  function fail(session: NonNullable<typeof current>, operation: "play" | "resume"): void {
    if (disposed || current !== session) return;
    stop();
    input.onError(operation);
  }

  function start(session: NonNullable<typeof current>, operation: "play" | "resume"): void {
    const attempt = ++request;
    stopTimer();
    publish({ ...state, paused: false });
    const rejected = () => {
      if (request === attempt) fail(session, operation);
    };
    try {
      void session.audio.play().then(() => {
        if (disposed || current !== session) {
          session.audio.pause();
          return;
        }
        // A late start must neither restart a paused note nor disturb a newer resume.
        if (request !== attempt) {
          if (state.paused) session.audio.pause();
          return;
        }
        timer = startInterval(() => {
          if (!disposed && current === session && request === attempt) {
            publish({ ...state, offsetMs: Math.round(session.audio.currentTime * 1000) });
          }
        }, 80);
      }, rejected);
    } catch {
      rejected();
    }
  }

  return {
    play(note, nextVolume = volume) {
      if (disposed) return;
      stop();
      volume = Math.max(0, Math.min(1, nextVolume));
      try {
        const audio = createAudio();
        const session = {
          audio,
          cleanup: () => {
            audio.removeEventListener("ended", ended);
            audio.removeEventListener("error", errored);
            audio.pause();
            audio.src = "";
          }
        };
        const ended = () => { if (current === session) stop(); };
        const errored = () => fail(session, "play");
        current = session;
        audio.addEventListener("ended", ended);
        audio.addEventListener("error", errored);
        audio.src = note.dataUrl;
        audio.currentTime = 0;
        audio.volume = volume;
        publish({ clipId: note.id, offsetMs: 0, paused: false });
        start(session, "play");
      } catch {
        stop();
        input.onError("play");
      }
    },
    pause() {
      if (disposed || !current) return;
      request += 1;
      stopTimer();
      current.audio.pause();
      publish({ ...state, paused: true, offsetMs: Math.round(current.audio.currentTime * 1000) });
    },
    resume() {
      if (!disposed && current) start(current, "resume");
    },
    stop,
    setVolume(nextVolume) {
      volume = Math.max(0, Math.min(1, nextVolume));
      if (current) current.audio.volume = volume;
    },
    dispose() {
      disposed = true;
      stop();
    }
  };
}
