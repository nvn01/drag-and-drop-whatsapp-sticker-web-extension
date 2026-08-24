import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest is WhatsApp-only and permission-minimal", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.2.4");
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background.service_worker, "src/service-worker.js");
  assert.equal(
    manifest.content_security_policy.extension_pages,
    "script-src 'self'; object-src 'self';",
  );
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
  assert.match(main, /removeEventListener/);
  assert.doesNotMatch(main, /root\.addEventListener\("drop", handleDrop, true\)/);
});

test("toolbar states use a dedicated inactive SVG export without a runtime text badge", async () => {
  const worker = await readFile(path.join(root, "src/service-worker.js"), "utf8");
  const inactiveSvg = await readFile(path.join(root, "icons/inactive-gray.svg"), "utf8");
  assert.match(worker, /chrome\.runtime\.getURL\("icons\/active-16\.png"\)/);
  assert.match(worker, /chrome\.runtime\.getURL\("icons\/inactive-gray-x-16\.png"\)/);
  assert.doesNotMatch(worker, /setBadgeText/);
  assert.match(inactiveSvg, /fill: #9AA0A8/);
  assert.match(inactiveSvg, /M1370 1354L1690 1674M1690 1354L1370 1674/);
});

test("overlay plus uses centered geometry instead of a font glyph", async () => {
  const isolated = await readFile(path.join(root, "src/content-script.js"), "utf8");
  const css = await readFile(path.join(root, "src/overlay.css"), "utf8");
  assert.doesNotMatch(isolated, /aria-hidden="true">\+</);
  assert.match(css, /> span::before/);
  assert.match(css, /> span::after/);
  assert.match(css, /translate\(-50%, -50%\) rotate\(90deg\)/);
  assert.doesNotMatch(isolated, /innerHTML/);
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

test("CI actions are pinned to immutable revisions", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/verify.yml"), "utf8");
  const actionUses = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]);
  assert.deepEqual(actionUses, [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  ]);
});
