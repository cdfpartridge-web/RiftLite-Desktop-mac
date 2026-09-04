import { describe, expect, it } from "vitest";
import { SerialMutationQueue } from "../src/main/services/serialMutationQueue.js";

describe("serial mutation queue", () => {
  it("keeps a clear behind an unfinished save and permits subsequent writes", async () => {
    const queue = new SerialMutationQueue();
    const events: string[] = [];
    let finishSave!: () => void;
    const blockedSave = new Promise<void>((resolve) => { finishSave = resolve; });
    const save = queue.run(async () => {
      events.push("save-start");
      await blockedSave;
      events.push("save-end");
      return "saved";
    });
    const clear = queue.run(async () => { events.push("clear"); });
    const nextSave = queue.run(async () => { events.push("next-save"); return 42; });
    await Promise.resolve();
    expect(events).toEqual(["save-start"]);
    finishSave();
    expect(await save).toBe("saved");
    await clear;
    expect(await nextSave).toBe(42);
    expect(events).toEqual(["save-start", "save-end", "clear", "next-save"]);
  });

  it("rejects only the failed caller and preserves later operations in order", async () => {
    const queue = new SerialMutationQueue();
    const failure = new Error("disk unavailable");
    const events: string[] = [];
    const failed = queue.run(async () => { events.push("failed"); throw failure; });
    const rejection = expect(failed).rejects.toBe(failure);
    const recovered = queue.run(async () => { events.push("recovered"); return "ok"; });
    await rejection;
    expect(await recovered).toBe("ok");
    expect(events).toEqual(["failed", "recovered"]);
  });

  it("also survives an operation throwing before returning a promise", async () => {
    const queue = new SerialMutationQueue();
    await expect(queue.run(() => { throw new Error("invalid mutation"); })).rejects.toThrow("invalid mutation");
    expect(await queue.run(async () => "next")).toBe("next");
  });
});
