import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest is WhatsApp-only and permission-minimal", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background.service_worker, "src/service-worker.js");
  assert.equal(manifest.action.default_title, "Drop as Sticker: on");
  assert.equal(manifest.icons[128], "icons/active-128.png");
  assert.equal(manifest.action.default_icon[16], "icons/active-16.png");
  assert.equal(manifest.content_scripts.length, 2);

  const [main, isolated] = manifest.content_scripts;
  assert.deepEqual(main.matches, ["https://web.whatsapp.com/*"]);
  assert.deepEqual(isolated.matches, ["https://web.whatsapp.com/*"]);
  assert.equal(main.world, "MAIN");
  assert.equal(isolated.world, "ISOLATED");
  assert.equal(main.run_at, "document_start");
  assert.equal(isolated.run_at, "document_start");
});

test("runtime starts disabled until the isolated preference relay responds", async () => {
  const main = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  const isolated = await readFile(path.join(root, "src/content-script.js"), "utf8");
  assert.match(main, /let extensionEnabled = false/);
  assert.match(main, /wa-sticker-plugin:control-query:v1/);
  assert.match(main, /if \(!extensionEnabled \|\| dropInFlight\)/);
  assert.match(isolated, /chrome\.storage\.local/);
  assert.match(isolated, /wa-sticker-plugin:control:v1/);
});

test("overlay plus uses centered geometry instead of a font glyph", async () => {
  const isolated = await readFile(path.join(root, "src/content-script.js"), "utf8");
  const css = await readFile(path.join(root, "src/overlay.css"), "utf8");
  assert.doesNotMatch(isolated, /aria-hidden="true">\+</);
  assert.match(css, /> span::before/);
  assert.match(css, /> span::after/);
  assert.match(css, /translate\(-50%, -50%\) rotate\(90deg\)/);
});

test("runtime cannot auto-send or fetch through extension-owned networking", async () => {
  const main = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  assert.doesNotMatch(main, /\.click\s*\(/);
  assert.doesNotMatch(main, /Send 1 selected/);
  assert.doesNotMatch(main, /\bfetch\s*\(/);
  assert.doesNotMatch(main, /XMLHttpRequest/);
  assert.match(main, /input\.dispatchEvent\(new Event\("change"/);
  assert.match(main, /WAWebUim/);
  assert.match(main, /AttachMediaFlow/);
  assert.match(main, /requestDismiss/);
});

test("runtime uses centralized semantic WhatsApp hooks", async () => {
  const main = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  assert.match(main, /conversation-panel-wrapper/);
  assert.match(main, /conversation-compose-box-input/);
  assert.match(main, /media-editor-copy-button/);
  assert.ok(main.includes('footer input[type="file"][accept="image/*"]'));
  assert.doesNotMatch(main, /x1[a-z0-9]{5,}/);
});
