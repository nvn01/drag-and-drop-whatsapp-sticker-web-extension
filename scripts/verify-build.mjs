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
  "icons/inactive-gray-x-128.png",
  "icons/inactive-gray-x-16.png",
  "icons/inactive-gray-x-32.png",
  "icons/inactive-gray-x-48.png",
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
if (
  JSON.stringify(manifest.permissions) !==
  JSON.stringify(["scripting", "storage"])
) {
  throw new Error("The build may request only scripting and storage");
}
if (
  JSON.stringify(manifest.host_permissions) !==
  JSON.stringify(["https://web.whatsapp.com/*"])
) {
  throw new Error("The build must request only the exact WhatsApp Web host permission");
}
if (manifest.background?.service_worker !== "src/service-worker.js") {
  throw new Error("The toolbar toggle service worker is missing");
}
if (
  manifest.content_security_policy?.extension_pages !==
  "script-src 'self'; object-src 'self';"
) {
  throw new Error("The extension-page Content Security Policy is missing or too broad");
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

const isolatedSource = await readFile(path.join(dist, "src/content-script.js"), "utf8");
if (isolatedSource.includes("innerHTML")) {
  throw new Error("Runtime UI must not construct DOM through innerHTML");
}

for (const relativePath of actualFiles.filter((file) => /\.(?:css|js|json)$/.test(file))) {
  const contents = await readFile(path.join(dist, relativePath), "utf8");
  if (contents.includes("\r")) {
    throw new Error(`Build text file is not canonical LF: ${relativePath}`);
  }
}

console.log(
  `Build verified: ${actualFiles.length} files, WhatsApp-only, no broad host permissions`,
);
