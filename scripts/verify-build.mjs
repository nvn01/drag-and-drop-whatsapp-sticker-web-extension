import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const expectedFiles = [
  "build-info.json",
  "icons/active-128.png",
  "icons/active-16.png",
  "icons/active-32.png",
  "icons/active-48.png",
  "icons/inactive-128.png",
  "icons/inactive-16.png",
  "icons/inactive-32.png",
  "icons/inactive-48.png",
  "manifest.json",
  "src/content-script.js",
  "src/drop-policy.js",
  "src/main-world-bridge.js",
  "src/overlay.css",
  "src/service-worker.js",
];

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else {
      result.push(relativePath);
    }
  }
  return result.sort();
}

const actualFiles = await listFiles(dist);
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Unexpected build contents:\n${actualFiles.join("\n")}`);
}

const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) {
  throw new Error("The build may request only the storage permission");
}
if (manifest.host_permissions) {
  throw new Error("The build must not request host permissions");
}
if (manifest.background?.service_worker !== "src/service-worker.js") {
  throw new Error("The toolbar toggle service worker is missing");
}
if (!manifest.action?.default_icon || !manifest.icons?.[128]) {
  throw new Error("The branded toolbar and extension icons are missing");
}

const matches = manifest.content_scripts.flatMap((script) => script.matches || []);
if (matches.some((match) => match !== "https://web.whatsapp.com/*")) {
  throw new Error("Build contains an unexpected host match");
}

const mainSource = await readFile(path.join(dist, "src/main-world-bridge.js"), "utf8");
for (const forbidden of ["XMLHttpRequest", "fetch(", ".click(", "Send 1 selected"]) {
  if (mainSource.includes(forbidden)) {
    throw new Error(`Forbidden runtime behavior found: ${forbidden}`);
  }
}

console.log(`Build verified: ${actualFiles.length} files, WhatsApp-only, storage permission only`);
