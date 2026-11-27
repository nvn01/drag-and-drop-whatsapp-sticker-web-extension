import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "src/drop-policy.js"), "utf8");
const context = vm.createContext({ URL });
vm.runInContext(source, context, { filename: "drop-policy.js" });
const policy = vm.runInContext(
  'globalThis[Symbol.for("wa-sticker-plugin/drop-policy/v1")]',
  context,
);

function decision(snapshot, phase = "drop") {
  return policy.classifyTransfer(snapshot, phase);
}

test("accepts supported image and video inputs", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]) {
    const result = decision({ files: [{ name: "meme", size: 1024, type }] });
    assert.equal(result.eligible, true);
    assert.equal(result.kind, "local-image");
  }
});

test("uses a supported extension when a local MIME type is empty", () => {
  assert.equal(
    decision({ files: [{ name: "meme.PNG", size: 1024, type: "" }] }).eligible,
    true,
  );
});

test("rejects SVG, non-image, oversized, and multiple-file drops", () => {
  const rejected = [
    [{ name: "movie.mov", size: 1024, type: "video/quicktime" }],
    [{ name: "meme.svg", size: 1024, type: "image/svg+xml" }],
    [{ name: "notes.txt", size: 10, type: "text/plain" }],
    [{ name: "large.png", size: policy.MAX_IMAGE_BYTES + 1, type: "image/png" }],
    [
      { name: "one.png", size: 10, type: "image/png" },
      { name: "two.png", size: 10, type: "image/png" },
    ],
  ];

  for (const files of rejected) {
    assert.equal(decision({ files }).eligible, false);
  }
});

test("classifies HTML image drags only after the drop payload is proven", () => {
  const preview = decision({ types: ["text/html"] }, "preview");
  assert.equal(preview.eligible, true);
  assert.equal(preview.kind, "remote-image-potential");

  assert.equal(decision({ hasImageHtml: true, types: ["text/html"] }).eligible, true);
  assert.equal(decision({ hasImageHtml: false, types: ["text/html"] }).eligible, false);
});

test("accepts only direct supported image URI-list values", () => {
  assert.equal(
    decision({ types: ["text/uri-list"], uri: "https://example.com/meme.webp" }).eligible,
    true,
  );
  assert.equal(
    decision({ types: ["text/uri-list"], uri: "https://example.com/article" }).eligible,
    false,
  );
  assert.equal(
    decision({ types: ["text/uri-list"], uri: "javascript:alert(1)" }).eligible,
    false,
  );
});

test("keeps ambiguous and empty transfers on the passthrough path", () => {
  for (const snapshot of [{}, { types: ["text/plain"] }, { files: [] }, { fileItems: [] }]) {
    const result = decision(snapshot);
    assert.equal(result.eligible, false);
    assert.equal(result.kind, "passthrough");
  }
});

test("only a single direct HTTPS media URL qualifies for composer paste", () => {
  for (const ext of ["PNG", "webp", "gif", "mp4", "webm"]) {
    const url = "https://cdn.example/a." + ext + "?size=2";
    assert.equal(policy.directPasteUrl(" " + url + " "), url);
  }
  for (const value of ["hello", "https://example.com/page", "http://x.test/a.png",
    "https://x.test/a.png\nhttps://x.test/b.gif", "https://name:pw@x.test/a.gif",
    "see https://x.test/a.png", "file:///tmp/a.gif"]) {
    assert.equal(policy.directPasteUrl(value), null);
  }
});

test("disabling motion leaves animated source files to WhatsApp", () => {
  for (const file of [
    { name: "clip", type: "video/mp4" },
    { name: "clip.webm", type: "" },
    { name: "loop.GIF", type: "" },
  ]) {
    assert.equal(policy.classifyTransfer({ files: [file] }, "drop", false).eligible, false);
    assert.equal(policy.classifyTransfer({ fileItems: [file] }, "preview", false).eligible, false);
  }
  assert.equal(policy.acceptsInput({ name: "photo.jpg" }, false), true);
});
