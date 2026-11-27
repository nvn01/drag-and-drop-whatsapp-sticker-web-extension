import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ Blob, File, TextEncoder });
vm.runInContext(await readFile(new URL("../src/sticker-media.js", import.meta.url), "utf8"), context);
const { prepare } = vm.runInContext('globalThis[Symbol.for("wa-sticker-plugin/sticker-media/v1")]', context);

test("with blank attribution, ordinary files pass through byte-for-byte", async () => {
  const original = new File(["image data"], "photo.jpg", { type: "image/jpeg" });
  assert.equal(await prepare(original, {}, new AbortController().signal), original);
});

test("editing attribution preserves animated WebP chunks and replaces the previous TIFF tag", async () => {
  const chunk = (tag, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(data.length);
    return Buffer.concat([Buffer.from(tag), length, data, Buffer.alloc(data.length % 2)]);
  };
  const frame = chunk("ANMF", Buffer.alloc(20, 123));
  const header = Buffer.from([0x12, 0, 0, 0, 255, 1, 0, 255, 1, 0]);
  const body = Buffer.concat([Buffer.from("WEBP"), chunk("VP8X", header), chunk("ANIM", Buffer.alloc(6)), frame, frame]);
  const file = new File([chunk("RIFF", body)], "original.webp", {type: "image/webp"});
  const signal = new AbortController().signal;
  const first = await prepare(file, { pack: "Test", author: "Old author" }, signal);
  const result = await prepare(first, { pack: "My pack", author: "Kucing 🐈" }, signal);
  const data = Buffer.from(await result.arrayBuffer());
  assert.equal(data.readUInt32LE(4) + 8, data.length);
  assert.equal(data[20], 0x1a);
  assert.ok(data.includes(Buffer.concat([frame, frame])));
  assert.ok(!data.includes("Old author"));
  const tiff = data.indexOf("EXIF") + 8;
  assert.equal(data.readUInt16LE(tiff + 10), 0x5741);
  const start = tiff + data.readUInt32LE(tiff + 18);
  const info = JSON.parse(data.toString("utf8", start, start + data.readUInt32LE(tiff + 14)));
  assert.equal(info["sticker-pack-publisher"], "Kucing 🐈");
  assert.equal(info["sticker-pack-name"], "My pack");
});
