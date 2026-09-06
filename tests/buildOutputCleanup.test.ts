import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { cleanBuildOutput } from "../scripts/clean-build-output.mjs";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures: string[] = [];

function write(root: string, file: string, content = file) {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "riftlite-build-cleanup-")));
  fixtures.push(root);
  write(root, "package.json", JSON.stringify({ name: "riftlite-desktop-v09", main: "dist/main/main.js" }));
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    if (dirname(root) === realpathSync(tmpdir()) && basename(root).startsWith("riftlite-build-cleanup-")) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("full build cleanup", () => {
  it("removes all generated subtrees and orphan modules while preserving adjacent work", () => {
    const root = fixture();
    for (const file of [
      "main/main.js", "main/services/replayVideoOrganizer.js", "main/services/replayVideoOrganizer.js.map",
      "shared/privateHubReplayLibrary.js", "shared/privateHubReplayLibrary.js.map",
      "preload/appPreload.js", "game-preload/gamePreload.cjs", "renderer/assets/old.js"
    ]) write(root, `dist/${file}`);
    const protectedFiles = ["src/main/main.ts", "release/installer.exe", "output/candidate.exe", "tmp/profile.txt"];
    for (const file of protectedFiles) write(root, file);

    expect(cleanBuildOutput(root)).toBe(join(root, "dist"));
    expect(existsSync(join(root, "dist"))).toBe(false);
    for (const file of protectedFiles) expect(readFileSync(join(root, file), "utf8")).toBe(file);
    expect(() => cleanBuildOutput(root)).not.toThrow();
  });

  it("refuses an unrelated project and a non-directory output path", () => {
    const root = fixture();
    write(root, "dist", "preserve output file");
    expect(() => cleanBuildOutput(root)).toThrow(/unexpected output path/);
    write(root, "package.json", '{"name":"other-project"}');
    expect(() => cleanBuildOutput(root)).toThrow(/outside the RiftLite desktop project/);
    expect(readFileSync(join(root, "dist"), "utf8")).toBe("preserve output file");
  });

  it("refuses a root symlink or junction without touching its target", () => {
    const root = fixture();
    write(root, "outside/preserve.txt", "keep target");
    symlinkSync(join(root, "outside"), join(root, "dist"), process.platform === "win32" ? "junction" : "dir");
    expect(() => cleanBuildOutput(root)).toThrow(/linked or unexpected output path/);
    expect(readFileSync(join(root, "outside/preserve.txt"), "utf8")).toBe("keep target");
  });

  it("refuses nested links before deleting any generated files", () => {
    const root = fixture();
    write(root, "dist/main/main.js", "keep until preflight succeeds");
    write(root, "outside/preserve.txt", "keep target");
    symlinkSync(join(root, "outside"), join(root, "dist/linked"), process.platform === "win32" ? "junction" : "dir");
    expect(() => cleanBuildOutput(root)).toThrow(/containing a linked path/);
    expect(readFileSync(join(root, "outside/preserve.txt"), "utf8")).toBe("keep target");
    expect(readFileSync(join(root, "dist/main/main.js"), "utf8")).toBe("keep until preflight succeeds");
  });

  it("uses the CLI's own checkout instead of the caller's working directory", () => {
    const root = fixture();
    write(root, "scripts/clean-build-output.mjs", readFileSync(join(projectDirectory, "scripts/clean-build-output.mjs"), "utf8"));
    write(root, "dist/main/main.js");
    write(root, "output/foreign/dist/preserve.txt", "foreign output");
    execFileSync(process.execPath, [join(root, "scripts/clean-build-output.mjs")], {
      cwd: join(root, "output/foreign"), windowsHide: true
    });
    expect(existsSync(join(root, "dist"))).toBe(false);
    expect(readFileSync(join(root, "output/foreign/dist/preserve.txt"), "utf8")).toBe("foreign output");
  });

  it("cleans before compilation in full builds while retaining standalone compiler commands", () => {
    const manifest = JSON.parse(readFileSync(join(projectDirectory, "package.json"), "utf8"));
    expect(manifest.scripts["build:clean"]).toBe("node scripts/clean-build-output.mjs");
    expect(manifest.scripts.build).toMatch(/^npm run build:clean && npm run build:electron && npm run build:game-preload && vite build$/);
    expect(manifest.scripts["build:electron"]).toBe("tsc -p tsconfig.electron.json");
    expect(manifest.scripts["build:game-preload"]).not.toContain("build:clean");
  });
});
