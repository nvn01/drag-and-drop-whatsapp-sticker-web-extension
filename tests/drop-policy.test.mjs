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

test("accepts supported local raster images", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
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

test("rejects GIF, SVG, non-image, oversized, and multiple-file drops", () => {
  const rejected = [
    [{ name: "meme.gif", size: 1024, type: "image/gif" }],
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
