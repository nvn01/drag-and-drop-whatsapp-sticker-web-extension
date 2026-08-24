import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "src/drop-policy.js",
  "src/main-world-bridge.js",
  "src/content-script.js",
  "scripts/build.mjs",
  "scripts/check-syntax.mjs",
  "scripts/verify-build.mjs",
  "tests/drop-policy.test.mjs",
  "tests/static-contract.test.mjs",
];

for (const relativePath of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax OK: ${files.length} files`);
