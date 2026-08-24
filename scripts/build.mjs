import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const sourceFiles = [
  "manifest.json",
  "icons/active-16.png",
  "icons/active-32.png",
  "icons/active-48.png",
  "icons/active-128.png",
  "icons/inactive-16.png",
  "icons/inactive-32.png",
  "icons/inactive-48.png",
  "icons/inactive-128.png",
  "src/content-script.js",
  "src/drop-policy.js",
  "src/main-world-bridge.js",
  "src/overlay.css",
  "src/service-worker.js",
];

if (path.dirname(dist) !== root || path.basename(dist) !== "dist") {
  throw new Error("Refusing to build outside the project dist directory");
}

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (manifest.version !== packageJson.version) {
  throw new Error("manifest.json and package.json versions must match");
}

await rm(dist, { force: true, recursive: true });

for (const relativePath of sourceFiles) {
  const destination = path.join(dist, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relativePath), destination);
}

const buildInfo = {
  artifact: "unpacked Chromium extension",
  sourceFiles,
  version: manifest.version,
};
await writeFile(path.join(dist, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`Built ${manifest.name} ${manifest.version} in ${dist}`);
