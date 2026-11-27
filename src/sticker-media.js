(function installStickerMedia(root) {
  "use strict";

  const key = Symbol.for("wa-sticker-plugin/sticker-media/v1");
  if (root[key]) return;

  const SIDE = 512;
  const MAX_ANIMATED_BYTES = 500 * 1024;

  class StickerMediaError extends Error {
    name = "StickerMediaError";
  }

  function chunk(tag, ...pieces) {
    const data = new Blob(pieces);
    const header = new Uint8Array(8);
    header.set(new TextEncoder().encode(tag));
    new DataView(header.buffer).setUint32(4, data.size, true);
    return new Blob([header, data, new Uint8Array(data.size % 2)]);
  }

  function webp(chunks) {
    return new File([chunk("RIFF", "WEBP", ...chunks)], "sticker.webp", { type: "image/webp" });
  }

  function put24(bytes, offset, value) {
    bytes.set([value & 255, (value >> 8) & 255, (value >> 16) & 255], offset);
  }

  function extendedHeader(flags, width, height) {
    const header = new Uint8Array(10);
    header[0] = flags;
    put24(header, 4, width - 1);
    put24(header, 7, height - 1);
    return chunk("VP8X", header);
  }

  function attribution(pack, author) {
    // The community WebP convention stores UTF-8 pack JSON in TIFF tag 0x5741.
    const json = new TextEncoder().encode(JSON.stringify({
      "sticker-pack-id": "drop-as-sticker/" + JSON.stringify([pack, author]),
      "sticker-pack-name": pack,
      "sticker-pack-publisher": author,
    }));
    const header = new Uint8Array(26);
    header.set([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 65, 87, 7, 0]);
    const view = new DataView(header.buffer);
    view.setUint32(14, json.length, true);
    view.setUint32(18, header.length, true);
    return chunk("EXIF", header, json);
  }

  function readChunks(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
    if (tag(0) !== "RIFF" || tag(8) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) {
      throw new StickerMediaError("Invalid WebP image.");
    }
    const parts = [];
    for (let at = 12; at < bytes.length;) {
      const size = view.getUint32(at + 4, true);
      const end = at + 8 + size + (size % 2);
      if (end > bytes.length) throw new StickerMediaError("Incomplete WebP image.");
      parts.push({ tag: tag(at), bytes: bytes.subarray(at, end) });
      at = end;
    }
    return parts;
  }

  function canvasFrame(source, width, height, quality) {
    const canvas = new OffscreenCanvas(SIDE, SIDE);
    const scale = SIDE / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d").drawImage(source, (SIDE - w) >> 1, (SIDE - h) >> 1, w, h);
    return canvas.convertToBlob({ type: "image/webp", quality });
  }

  async function gifFrames(file, add, signal) {
    const header = new DataView(await file.slice(0, 10).arrayBuffer());
    if (header.getUint16(6, true) * header.getUint16(8, true) > 4096 ** 2) {
      throw new StickerMediaError("GIF resolution is too large.");
    }
    const decoder = new ImageDecoder({ type: "image/gif", data: await file.arrayBuffer() });
    try {
      await decoder.tracks.ready;
      const count = decoder.tracks.selectedTrack.frameCount;
      if (count > 200) throw new StickerMediaError("Choose a GIF with 200 frames or fewer.");
      let time = 0;
      let nextSample = 0;
      for (let i = 0; i < count; i++) {
        signal.throwIfAborted();
        const { image } = await decoder.decode({ frameIndex: i });
        try {
          const duration = Math.max(8, Math.round((image.duration || 100000) / 1000));
          if (time + duration > 10000) throw new StickerMediaError("Choose a GIF up to 10 seconds long.");
          if (time >= nextSample || i === count - 1) {
            await add(image, image.displayWidth, image.displayHeight, time);
            nextSample = time + 100;
          }
          time += duration;
        } finally { image.close(); }
      }
      return time;
    } finally { decoder.close(); }
  }

  function mediaEvent(video, event, signal) {
    return new Promise((resolve, reject) => {
      const listeners = new AbortController();
      const finish = (error) => {
        listeners.abort();
        if (error) reject(error);
        else resolve();
      };
      const options = { signal: listeners.signal, once: true };
      signal.throwIfAborted();
      signal.addEventListener("abort", () => finish(signal.reason), options);
      video.addEventListener(event, () => finish(), options);
      video.addEventListener("error", () => finish(new Error("Unreadable video.")), options);
    });
  }

  async function videoFrames(file, add, signal) {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    try {
      video.preload = "auto";
      video.muted = true;
      const loaded = mediaEvent(video, "loadeddata", signal);
      video.src = url;
      await loaded;
      if (!(video.duration > 0 && video.duration <= 4)) throw new StickerMediaError("Choose a video up to 4 seconds long.");
      const length = Math.round(video.duration * 1000);
      for (let ms = 0; ms < length; ms += 100) {
        signal.throwIfAborted();
        if (ms) {
          const sought = mediaEvent(video, "seeked", signal);
          video.currentTime = ms / 1000;
          await sought;
        }
        await add(video, video.videoWidth, video.videoHeight, ms);
      }
      return length;
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  async function animatedFile(file, isGif, metadata, signal) {
    const frames = [];
    let size = 0;
    async function add(source, width, height, start) {
      const blob = await canvasFrame(source, width, height, 0.55);
      const chunks = readChunks(new Uint8Array(await blob.arrayBuffer()));
      const pixels = chunks.filter(({ tag }) => ["ALPH", "VP8 ", "VP8L"].includes(tag));
      size += blob.size;
      if (size > MAX_ANIMATED_BYTES) throw new StickerMediaError("This animation is too large. Try a shorter or simpler clip.");
      frames.push({ pixels, start });
    }
    const duration = await (isGif ? gifFrames : videoFrames)(file, add, signal);
    const parts = [extendedHeader(0x12 | (metadata ? 8 : 0), SIDE, SIDE), chunk("ANIM", new Uint8Array(6))];
    for (const [i, frame] of frames.entries()) {
      const frameInfo = new Uint8Array(16);
      put24(frameInfo, 6, SIDE - 1);
      put24(frameInfo, 9, SIDE - 1);
      put24(frameInfo, 12, Math.max(8, (frames[i + 1]?.start ?? duration) - frame.start));
      frameInfo[15] = 2; // Replace the entire canvas, including transparent pixels.
      parts.push(chunk("ANMF", frameInfo, ...frame.pixels.map(part => part.bytes)));
    }
    if (metadata) parts.push(metadata);
    const result = webp(parts);
    if (result.size > MAX_ANIMATED_BYTES) throw new StickerMediaError("This animation exceeds 500 KB.");
    return result;
  }

  async function prepare(file, settings, signal) {
    const suffix = file.name.split(".").pop().toLowerCase();
    const type = file.type || ({ gif: "image/gif", webm: "video/webm", mp4: "video/mp4", webp: "image/webp" })[suffix];
    const metadata = settings.pack || settings.author ? attribution(settings.pack, settings.author) : null;
    if (type === "image/gif" || type?.startsWith("video/")) {
      return animatedFile(file, type === "image/gif", metadata, signal);
    }
    if (!metadata) return file;
    if (type === "image/webp") {
      const chunks = readChunks(new Uint8Array(await file.arrayBuffer()));
      if (chunks[0]?.tag === "VP8X") {
        chunks[0].bytes[8] |= 8;
        const parts = chunks.filter(({ tag }) => tag !== "EXIF" && tag !== "XMP ").map(part => part.bytes);
        return webp([...parts, metadata, ...chunks.filter(part => part.tag === "XMP ").map(part => part.bytes)]);
      }
    }
    const image = await createImageBitmap(file);
    try {
      const blob = await canvasFrame(image, image.width, image.height, 0.8);
      const chunks = readChunks(new Uint8Array(await blob.arrayBuffer()));
      return webp([extendedHeader(0x18, SIDE, SIDE), ...chunks.filter(part => part.tag !== "VP8X").map(part => part.bytes), metadata]);
    } finally { image.close(); }
  }

  Object.defineProperty(root, key, { value: Object.freeze({ prepare }) });
})(globalThis);
