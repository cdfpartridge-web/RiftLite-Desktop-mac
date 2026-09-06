import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function cleanBuildOutput(projectDirectory) {
  const projectRoot = realpathSync(projectDirectory);
  const manifest = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  if (manifest.name !== "riftlite-desktop-v09" || manifest.main !== "dist/main/main.js") {
    throw new Error(`Refusing build cleanup outside the RiftLite desktop project: ${projectRoot}`);
  }

  // The CLI cannot accept a deletion path from cwd, arguments or environment.
  const outputDirectory = join(projectRoot, "dist");
  let outputStat;
  try {
    outputStat = lstatSync(outputDirectory);
  } catch (error) {
    if (error.code === "ENOENT") return outputDirectory;
    throw error;
  }
  if (
    outputStat.isSymbolicLink() || !outputStat.isDirectory() ||
    relative(projectRoot, realpathSync(outputDirectory)) !== "dist"
  ) {
    throw new Error(`Refusing build cleanup of a linked or unexpected output path: ${outputDirectory}`);
  }

  // Preflight the complete tree before removing anything. Generated output must
  // not contain links to source, profiles or other directories.
  assertNoLinks(outputDirectory);
  rmSync(outputDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  return outputDirectory;
}

function assertNoLinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing build cleanup containing a linked path: ${entryPath}`);
    }
    if (entry.isDirectory()) assertNoLinks(entryPath);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(`Build output cleared: ${cleanBuildOutput(projectDirectory)}`);
}
