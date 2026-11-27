(function installDropPolicy(root) {
  "use strict";

  const POLICY_KEY = Symbol.for("wa-sticker-plugin/drop-policy/v1");
  if (root[POLICY_KEY]) {
    return;
  }

  const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
  const SUPPORTED_MEDIA_TYPES = new Set([
    "image/gif",
    "video/mp4",
    "video/webm",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  const SUPPORTED_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp", ".gif", ".mp4", ".webm"]);

  function normalizedMime(value) {
    return String(value || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
  }

  function extensionFromName(name) {
    const match = String(name || "")
      .trim()
      .toLowerCase()
      .match(/\.[a-z0-9]+$/);
    return match ? match[0] : "";
  }

  function isSupportedMediaMetadata(file) {
    if (!file) {
      return false;
    }

    const size = Number(file.size || 0);
    if (!Number.isFinite(size) || size < 0 || size > MAX_IMAGE_BYTES) {
      return false;
    }

    const mime = normalizedMime(file.type);
    if (mime) {
      return SUPPORTED_MEDIA_TYPES.has(mime);
    }

    return SUPPORTED_EXTENSIONS.has(extensionFromName(file.name));
  }

  function isLikelyDirectImageUrl(value) {
    const firstValue = String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"));

    if (!firstValue) {
      return false;
    }

    try {
      const url = new URL(firstValue);
      if (!["http:", "https:", "blob:"].includes(url.protocol)) {
        return false;
      }
      return SUPPORTED_EXTENSIONS.has(extensionFromName(url.pathname));
    } catch {
      return false;
    }
  }

  function directPasteUrl(value) {
    const text = String(value || "").trim();
    if (!/^https:\/\//i.test(text) || /\s/.test(text) || !isLikelyDirectImageUrl(text)) {
      return null;
    }
    const url = new URL(text);
    return url.username || url.password ? null : url.href;
  }

  function isMotionInput(file) {
    if (file.type) return /^(?:image\/gif|video\/(?:mp4|webm))$/.test(normalizedMime(file.type));
    return [".gif", ".mp4", ".webm"].includes(extensionFromName(file.name));
  }

  function acceptsInput(file, allowMotion = true) {
    return isSupportedMediaMetadata(file) && (allowMotion || !isMotionInput(file));
  }

  function classifyTransfer(snapshot, phase, allowMotion = true) {
    const currentPhase = phase === "preview" ? "preview" : "drop";
    const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
    const fileItems = Array.isArray(snapshot?.fileItems) ? snapshot.fileItems : [];
    const types = new Set(
      Array.isArray(snapshot?.types)
        ? snapshot.types.map((type) => String(type).toLowerCase())
        : [],
    );

    if (files.length > 0) {
      if (files.length === 1 && acceptsInput(files[0], allowMotion)) {
        return { eligible: true, kind: "local-image" };
      }
      return { eligible: false, kind: "passthrough", reason: "file-selection" };
    }

    if (fileItems.length > 0) {
      if (fileItems.length === 1 && acceptsInput(fileItems[0], allowMotion)) {
        return { eligible: true, kind: "local-image-potential" };
      }
      return { eligible: false, kind: "passthrough", reason: "file-items" };
    }

    if (currentPhase === "preview") {
      if (types.has("text/html")) {
        return { eligible: true, kind: "remote-image-potential" };
      }
      return { eligible: false, kind: "passthrough", reason: "ambiguous-preview" };
    }

    if (snapshot?.hasImageHtml === true) {
      return { eligible: true, kind: "remote-image" };
    }

    if (types.has("text/uri-list") && isLikelyDirectImageUrl(snapshot?.uri)) {
      return { eligible: true, kind: "remote-image" };
    }

    return { eligible: false, kind: "passthrough", reason: "unsupported" };
  }

  Object.defineProperty(root, POLICY_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      MAX_IMAGE_BYTES,
      acceptsInput,
      classifyTransfer,
      directPasteUrl,
      isMotionInput,
      isLikelyDirectImageUrl,
      isSupportedMediaMetadata,
      normalizedMime,
    }),
  });
})(globalThis);
