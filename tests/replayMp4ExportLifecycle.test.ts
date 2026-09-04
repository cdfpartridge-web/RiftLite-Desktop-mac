import { describe, expect, it, vi } from "vitest";
import { ReplayMp4ExportLifecycle } from "../src/main/services/replayMp4ExportLifecycle.js";
import type { ReplayMp4ExportProgress } from "../src/shared/types.js";

function harness() {
  const events: string[] = [];
  let nextId = 0;
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn((_channel: string, progress: ReplayMp4ExportProgress) => {
      expect(lifecycle.active === null).toBe(["completed", "failed"].includes(progress.stage));
      events.push(`send:${progress.stage}`);
    })
  };
  const recordProgress = vi.fn();
  const logFailure = vi.fn(async () => { events.push("logged"); });
  const onReleased = vi.fn(() => {
    expect(lifecycle.active).toBeNull();
    events.push("released");
  });
  const lifecycle = new ReplayMp4ExportLifecycle({
    createId: () => `export-${++nextId}`, recordProgress, logFailure, onReleased
  });
  const request = { replayId: "replay-1", kind: "replay" as const, requestId: 7, sender };
  return { lifecycle, request, events, sender, recordProgress, logFailure, onReleased };
}

describe("MP4 export lifecycle", () => {
  it.each(["replay", "presentation"] as const)("releases %s export before completion and carries request identity", async (kind) => {
    const h = harness();
    const path = await h.lifecycle.run({ ...h.request, kind }, async (context) => {
      expect(h.lifecycle.active).toBe(context);
      h.lifecycle.emit(context, { stage: "encoding", percent: 20, message: "Encoding" });
      h.lifecycle.emit(context, { stage: "encoding", percent: 50, message: "Encoding" });
      h.lifecycle.emit(context, { stage: "validating", percent: 92, message: "Validating" });
      return "output.mp4";
    });
    expect(path).toBe("output.mp4");
    expect(h.lifecycle.lastCompletedPath).toBe(path);
    expect(h.events).toEqual(["send:encoding", "send:encoding", "send:validating", "released", "send:completed"]);
    expect(h.recordProgress.mock.calls.map(([progress]) => progress.stage)).toEqual(["encoding", "validating", "completed"]);
    expect(h.sender.send).toHaveBeenLastCalledWith("replay:mp4-export-progress", expect.objectContaining({
      exportId: "export-1", replayId: "replay-1", requestId: 7, kind, stage: "completed", percent: 100, outputPath: path
    }));
    expect(h.onReleased).toHaveBeenCalledTimes(1);
  });

  it("shares one lock between formats and validates identity before lock rejection", async () => {
    const h = harness();
    let finish!: (value: string) => void;
    const pending = h.lifecycle.run(h.request, () => new Promise<string>((resolve) => { finish = resolve; }));
    const operation = vi.fn(async () => "other.mp4");
    await expect(h.lifecycle.run({ ...h.request, kind: "presentation", requestId: 8 }, operation)).rejects.toThrow("Another MP4 export");
    await expect(h.lifecycle.run({ ...h.request, requestId: 0 }, operation)).rejects.toThrow("request identity is invalid");
    expect(h.lifecycle.active?.requestId).toBe(7);
    expect(operation).not.toHaveBeenCalled();
    expect(h.sender.send).not.toHaveBeenCalled();
    expect(h.onReleased).not.toHaveBeenCalled();
    finish("first.mp4");
    await pending;
    expect(await h.lifecycle.run({ ...h.request, kind: "presentation", requestId: 8 }, operation)).toBe("other.mp4");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid identity %s without starting", async (requestId) => {
    const h = harness();
    const operation = vi.fn(async () => "output.mp4");
    await expect(h.lifecycle.run({ ...h.request, requestId }, operation)).rejects.toThrow("identity");
    expect(operation).not.toHaveBeenCalled();
    expect(h.lifecycle.active).toBeNull();
    expect(h.onReleased).not.toHaveBeenCalled();
  });

  it("releases on save-dialog cancellation without announcing success or erasing previous output", async () => {
    const h = harness();
    h.lifecycle.lastCompletedPath = "previous.mp4";
    expect(await h.lifecycle.run(h.request, async () => "")).toBe("");
    expect(h.events).toEqual(["released"]);
    expect(h.lifecycle.lastCompletedPath).toBe("previous.mp4");
    expect(h.recordProgress).not.toHaveBeenCalled();
  });

  it.each(["replay", "presentation"] as const)("releases failed %s export, preserves error, and permits retry", async (kind) => {
    const h = harness();
    const error = new Error("Failed\n  validation");
    await expect(h.lifecycle.run({ ...h.request, kind }, async (context) => {
      h.lifecycle.emit(context, { stage: "validating", percent: 93, message: "Checking" });
      throw error;
    })).rejects.toBe(error);
    expect(h.events).toEqual(["send:validating", "released", "send:failed", "logged"]);
    expect(h.sender.send).toHaveBeenLastCalledWith("replay:mp4-export-progress", expect.objectContaining({
      stage: "failed", percent: 93, error: "Failed validation", kind
    }));
    expect(h.lifecycle.lastCompletedPath).toBe("");
    expect(h.logFailure).toHaveBeenCalledTimes(1);
    expect(h.onReleased).toHaveBeenCalledTimes(1);
    expect(await h.lifecycle.run(h.request, async () => "retry.mp4")).toBe("retry.mp4");
  });

  it.each(["destroyed", "send throws"])("completes and records diagnostics when the renderer is %s", async (mode) => {
    const h = harness();
    if (mode === "destroyed") h.sender.isDestroyed.mockReturnValue(true);
    else h.sender.send.mockImplementation(() => { throw new Error("renderer replaced"); });
    expect(await h.lifecycle.run(h.request, async () => "output.mp4")).toBe("output.mp4");
    expect(h.lifecycle.active).toBeNull();
    expect(h.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: "completed" }));
    expect(h.logFailure).not.toHaveBeenCalled();
  });
});
