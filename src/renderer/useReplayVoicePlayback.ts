import { useCallback, useEffect, useRef, useState } from "react";
import { createReplayVoicePlayback, type ReplayVoicePlayback, type ReplayVoicePlaybackState } from "./replayVoicePlayback";

export function useReplayVoicePlayback(onError: (operation: "play" | "resume") => void, sessionKey?: string) {
  const [state, setState] = useState<ReplayVoicePlaybackState>({ offsetMs: 0, paused: false });
  const runtime = useRef<ReplayVoicePlayback | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const playback = createReplayVoicePlayback({
      onChange: setState,
      onError: (operation) => onErrorRef.current(operation)
    });
    runtime.current = playback;
    setState({ offsetMs: 0, paused: false });
    return () => {
      playback.dispose();
      if (runtime.current === playback) runtime.current = null;
    };
  }, [sessionKey]);

  const play = useCallback((note: { id: string; dataUrl: string }, volume?: number) => runtime.current?.play(note, volume), []);
  const pause = useCallback(() => runtime.current?.pause(), []);
  const resume = useCallback(() => runtime.current?.resume(), []);
  const stop = useCallback(() => runtime.current?.stop(), []);
  const setVolume = useCallback((volume: number) => runtime.current?.setVolume(volume), []);
  return { ...state, play, pause, resume, stop, setVolume };
}
