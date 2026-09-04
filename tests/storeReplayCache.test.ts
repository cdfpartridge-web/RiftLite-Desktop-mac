import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RiftLiteStore } from "../src/main/services/store.js";
import type { ReplayPayloadStore } from "../src/main/services/replayPayloadStore.js";
import type { ReplayRecord, RiftLiteBackupFile } from "../src/shared/types.js";

vi.mock("electron", () => ({ app: { getVersion: () => "cache-test" } }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function replay(title = "Original recording"): ReplayRecord {
  return {
    id: "cache-replay",
    matchId: "cache-match",
    platform: "atlas",
    capturedAt: "2026-09-04T12:00:00.000Z",
    title,
    players: { me: "Player", opponent: "Opponent" },
    events: []
  };
}

function payloadStore(store: RiftLiteStore): ReplayPayloadStore {
  return (store as unknown as { replayPayloadStore: ReplayPayloadStore }).replayPayloadStore;
}

async function withStore(action: (store: RiftLiteStore) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "riftlite-replay-cache-test-"));
  try {
    const store = new RiftLiteStore(join(directory, "store.sqlite"), join(directory, "legacy.json"));
    await store.load();
    await store.saveReplay(replay());
    await action(store);
  } finally {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("RiftLiteStore replay cache consistency", () => {
  it.each(["save", "update", "delete", "restore"] as const)(
    "keeps a completed %s visible after an older payload load finishes",
    async (operation) => withStore(async (store) => {
      const started = deferred();
      const release = deferred();
      const payloads = payloadStore(store);
      const hydrate = payloads.hydrate.bind(payloads);
      vi.spyOn(payloads, "hydrate").mockImplementationOnce(async (stored) => {
        const loaded = await hydrate(stored);
        started.resolve();
        await release.promise;
        return loaded;
      });
      const earlierRead = store.getReplays();
      await started.promise;
      try {
        if (operation === "save") {
          await store.saveReplay(replay("Committed recording"));
        } else if (operation === "update") {
          await store.updateReplay(replay().id, (current) => ({ ...current, title: "Committed recording" }));
        } else if (operation === "delete") {
          await store.deleteReplay(replay().id);
        } else {
          const backup: RiftLiteBackupFile = {
            format: "riftlite.backup", version: 1, appVersion: "cache-test", exportedAt: "2026-09-04T12:00:00.000Z",
            settings: await store.getSettings(), matches: [], deletedMatches: [], decks: [], notebooks: [],
            replays: [replay("Committed recording")], deletedReplays: []
          };
          await store.restoreBackupData(backup);
        }
      } finally {
        release.resolve();
      }
      // The request that began before the write may retain its original snapshot.
      expect((await earlierRead)[0].title).toBe("Original recording");
      const current = await store.getReplays();
      expect(current.map((item) => item.title)).toEqual(operation === "delete" ? [] : ["Committed recording"]);
      if (operation === "delete") {
        expect((await store.getDeletedReplays()).map((item) => item.id)).toEqual([replay().id]);
      }
    })
  );

  it.each(["older-first", "newer-first"] as const)(
    "keeps the newer loader's ownership when overlapping reads finish %s",
    async (completionOrder) => withStore(async (store) => {
      const started = [deferred(), deferred()];
      const release = [deferred(), deferred()];
      const payloads = payloadStore(store);
      const hydrate = payloads.hydrate.bind(payloads);
      const hydration = vi.spyOn(payloads, "hydrate");
      for (let index = 0; index < 2; index += 1) {
        hydration.mockImplementationOnce(async (stored) => {
          const loaded = await hydrate(stored);
          started[index].resolve();
          await release[index].promise;
          return loaded;
        });
      }
      const olderRead = store.getReplays();
      await started[0].promise;
      try {
        await store.saveReplay(replay("Committed recording"));
        const newerRead = store.getReplays();
        await started[1].promise;
        if (completionOrder === "older-first") {
          release[0].resolve();
          await olderRead;
          const joinedRead = store.getReplays();
          release[1].resolve();
          expect((await joinedRead)[0].title).toBe("Committed recording");
        } else {
          release[1].resolve();
          await newerRead;
          release[0].resolve();
        }
        await Promise.all([olderRead, newerRead]);
        expect((await store.getReplays())[0].title).toBe("Committed recording");
        expect(hydration).toHaveBeenCalledTimes(2);
      } finally {
        release.forEach((gate) => gate.resolve());
      }
    })
  );
});
