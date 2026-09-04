import { describe, expect, it, vi } from "vitest";
import { createReplayVoicePlayback, type ReplayVoicePlaybackAudio, type ReplayVoicePlaybackState } from "../src/renderer/replayVoicePlayback";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class FakeAudio extends EventTarget implements ReplayVoicePlaybackAudio {
  src = "";
  currentTime = 0;
  volume = 1;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

function harness(firstAudio = new FakeAudio()) {
  const audios: FakeAudio[] = [];
  const timers = new Map<number, () => void>();
  const states: ReplayVoicePlaybackState[] = [];
  const errors = vi.fn();
  let timerId = 0;
  const player = createReplayVoicePlayback({
    createAudio: () => {
      const audio = audios.length ? new FakeAudio() : firstAudio;
      audios.push(audio);
      return audio;
    },
    onChange: (state) => states.push(state),
    onError: errors,
    setInterval: (callback, delayMs) => {
      expect(delayMs).toBe(80);
      const id = timerId++;
      timers.set(id, callback);
      return id;
    },
    clearInterval: (id) => { timers.delete(id); }
  });
  return { player, audios, timers, states, errors, state: () => states.at(-1) };
}

const note = { id: "voice-1", dataUrl: "data:audio/webm;base64,AAAA" };

describe("owned replay voice playback", () => {
  it("plays the selected note and publishes the audio clock for annotations", async () => {
    const h = harness();
    h.player.play(note, 0.65);
    await Promise.resolve();
    expect(h.audios[0].src).toBe(note.dataUrl);
    expect(h.audios[0].volume).toBe(0.65);
    expect(h.state()).toEqual({ clipId: note.id, offsetMs: 0, paused: false });
    h.audios[0].currentTime = 1.234;
    h.timers.forEach((tick) => tick());
    expect(h.state()?.offsetMs).toBe(1234);
    expect(h.timers.size).toBe(1);
    h.player.setVolume(0);
    expect(h.audios[0].volume).toBe(0);
    h.player.setVolume(0.9);
    expect(h.audios[0].volume).toBe(0.9);
  });

  it("clears the timer on pause and resumes the same audio position", async () => {
    const h = harness();
    h.player.play(note);
    await Promise.resolve();
    h.audios[0].currentTime = 2;
    h.player.pause();
    expect(h.timers.size).toBe(0);
    expect(h.state()).toEqual({ clipId: note.id, offsetMs: 2000, paused: true });
    h.player.resume();
    await Promise.resolve();
    expect(h.audios).toHaveLength(1);
    expect(h.audios[0].currentTime).toBe(2);
    expect(h.audios[0].play).toHaveBeenCalledTimes(2);
    expect(h.state()?.paused).toBe(false);
    expect(h.timers.size).toBe(1);
  });

  it.each(["play", "resume"] as const)("releases the selected clip and timer after failed %s", async (operation) => {
    const audio = new FakeAudio();
    const h = harness(audio);
    if (operation === "resume") {
      h.player.play(note);
      await Promise.resolve();
      h.player.pause();
    }
    audio.play.mockRejectedValueOnce(new Error("unsupported audio"));
    if (operation === "resume") h.player.resume();
    else h.player.play(note);
    await Promise.resolve();
    expect(h.state()).toEqual({ offsetMs: 0, paused: false });
    expect(h.timers.size).toBe(0);
    expect(audio.src).toBe("");
    expect(audio.pause).toHaveBeenCalled();
    expect(h.errors).toHaveBeenCalledExactlyOnceWith(operation);
  });

  it("handles synchronous playback errors like rejected playback promises", () => {
    const audio = new FakeAudio();
    audio.play.mockImplementationOnce(() => { throw new Error("media unavailable"); });
    const h = harness(audio);
    h.player.play(note);
    expect(h.state()).toEqual({ offsetMs: 0, paused: false });
    expect(h.timers.size).toBe(0);
    expect(h.errors).toHaveBeenCalledExactlyOnceWith("play");
  });

  it.each(["ended", "error"])("releases playback when the audio emits %s", async (event) => {
    const h = harness();
    h.player.play(note);
    await Promise.resolve();
    h.audios[0].dispatchEvent(new Event(event));
    expect(h.timers.size).toBe(0);
    expect(h.state()).toEqual({ offsetMs: 0, paused: false });
    expect(h.errors).toHaveBeenCalledTimes(event === "error" ? 1 : 0);
    const changes = h.states.length;
    h.audios[0].dispatchEvent(new Event("error"));
    expect(h.states).toHaveLength(changes);
  });

  it.each(["resolve", "reject"] as const)("ignores stale %s after another note replaces a pending start", async (settlement) => {
    const pending = deferred();
    const audio = new FakeAudio();
    audio.play.mockReturnValueOnce(pending.promise);
    const h = harness(audio);
    h.player.play(note);
    expect(h.timers.size).toBe(0);
    h.player.play({ ...note, id: "voice-2" });
    await Promise.resolve();
    if (settlement === "resolve") pending.resolve();
    else pending.reject(new Error("old clip"));
    await Promise.resolve();
    expect(h.state()?.clipId).toBe("voice-2");
    expect(h.timers.size).toBe(1);
    expect(h.errors).not.toHaveBeenCalled();
    expect(audio.src).toBe("");
    audio.dispatchEvent(new Event("ended"));
    expect(h.state()?.clipId).toBe("voice-2");
  });

  it("does not restart a note when its pending start resolves after pause", async () => {
    const pending = deferred();
    const audio = new FakeAudio();
    audio.play.mockReturnValueOnce(pending.promise);
    const h = harness(audio);
    h.player.play(note);
    h.player.pause();
    pending.resolve();
    await Promise.resolve();
    expect(h.state()?.paused).toBe(true);
    expect(h.timers.size).toBe(0);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it("does not let an earlier start failure stop a newer resume", async () => {
    const pending = deferred();
    const audio = new FakeAudio();
    audio.play.mockReturnValueOnce(pending.promise);
    const h = harness(audio);
    h.player.play(note);
    h.player.pause();
    h.player.resume();
    await Promise.resolve();
    pending.reject(new Error("old start"));
    await Promise.resolve();
    expect(h.state()).toEqual({ clipId: note.id, offsetMs: 0, paused: false });
    expect(h.timers.size).toBe(1);
    expect(h.errors).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("stays quiet after disposal with a pending %s", async (settlement) => {
    const pending = deferred();
    const audio = new FakeAudio();
    audio.play.mockReturnValueOnce(pending.promise);
    const h = harness(audio);
    h.player.play(note);
    const changes = h.states.length;
    h.player.dispose();
    if (settlement === "resolve") pending.resolve();
    else pending.reject(new Error("unmounted"));
    await Promise.resolve();
    audio.dispatchEvent(new Event("error"));
    h.player.play(note);
    h.player.resume();
    expect(h.states).toHaveLength(changes);
    expect(h.timers.size).toBe(0);
    expect(h.errors).not.toHaveBeenCalled();
    expect(audio.src).toBe("");
  });

  it("disposes an actively playing note and ignores an already queued clock tick", async () => {
    const h = harness();
    h.player.play(note);
    await Promise.resolve();
    const tick = [...h.timers.values()][0];
    const changes = h.states.length;
    h.player.dispose();
    h.player.dispose();
    tick();
    expect(h.states).toHaveLength(changes);
    expect(h.timers.size).toBe(0);
  });
});
