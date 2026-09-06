import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import rendererConfig from "../vite.config";

describe("renderer build output", () => {
  it("replaces obsolete assets on rebuild while preserving other Electron output", async () => {
    // Vite resolves entry paths; keep its root on the same canonical macOS temp path.
    const fixtureParent = await realpath(tmpdir());
    const fixtureRoot = await mkdtemp(join(fixtureParent, "riftlite-renderer-build-"));
    try {
      const rendererOutput = resolve(fixtureRoot, rendererConfig.build!.outDir!);
      // Fail before a build can clear any path outside this disposable fixture.
      expect(rendererOutput).toBe(join(fixtureRoot, "dist", "renderer"));
      const siblingFiles = [
        "main/main.js",
        "preload/appPreload.js",
        "game-preload/gamePreload.cjs",
        "shared/settingsDefaults.js"
      ];
      for (const file of siblingFiles) {
        const destination = join(fixtureRoot, "dist", file);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, `preserve ${file}`);
      }
      await mkdir(join(fixtureRoot, "public"));
      await writeFile(join(fixtureRoot, "public", "fixture.txt"), "current public asset");
      await writeFile(join(fixtureRoot, "index.html"), '<script type="module" src="/entry.js"></script>');
      await writeFile(join(fixtureRoot, "entry.js"), 'console.log("first renderer");');

      const buildFixture = () => build({
        ...rendererConfig,
        configFile: false,
        root: fixtureRoot,
        logLevel: "silent",
        build: {
          ...rendererConfig.build,
          rollupOptions: { input: join(fixtureRoot, "index.html") }
        }
      });

      await buildFixture();
      const firstAssets = await readdir(join(rendererOutput, "assets"));
      expect(firstAssets.some(file => file.endsWith(".js"))).toBe(true);
      await writeFile(join(rendererOutput, "obsolete.txt"), "stale output");
      await writeFile(join(fixtureRoot, "entry.js"), 'console.log("second renderer");');
      await buildFixture();

      const secondAssets = await readdir(join(rendererOutput, "assets"));
      expect(secondAssets.some(file => file.endsWith(".js"))).toBe(true);
      for (const file of firstAssets) {
        expect(existsSync(join(rendererOutput, "assets", file))).toBe(false);
      }
      expect(existsSync(join(rendererOutput, "obsolete.txt"))).toBe(false);
      const index = await readFile(join(rendererOutput, "index.html"), "utf8");
      for (const file of secondAssets) expect(index).toContain(`assets/${file}`);
      expect(await readFile(join(rendererOutput, "fixture.txt"), "utf8")).toBe("current public asset");
      for (const file of siblingFiles) {
        expect(await readFile(join(fixtureRoot, "dist", file), "utf8")).toBe(`preserve ${file}`);
      }
    } finally {
      if (dirname(fixtureRoot) === fixtureParent && basename(fixtureRoot).startsWith("riftlite-renderer-build-")) {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    }
  }, 20_000);
});
