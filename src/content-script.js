(function installStatusOverlay(root) {
  "use strict";

  const INSTALL_KEY = Symbol.for("wa-sticker-plugin/isolated-installed/v1");
  const STATUS_EVENT = "wa-sticker-plugin:status:v1";
  const CONTROL_EVENT = "wa-sticker-plugin:control:v1";
  const CONTROL_QUERY_EVENT = "wa-sticker-plugin:control-query:v1";
  const OVERLAY_ID = "wa-sticker-plugin-overlay";
  const VALID_STATES = new Set(["eligible", "failed", "idle", "opened", "processing"]);
  const LABELS = Object.freeze({
    eligible: "Drop to create sticker",
    failed: "Could not open sticker editor",
    idle: "",
    opened: "Sticker editor ready",
    processing: "Opening sticker editor...",
  });

  if (root[INSTALL_KEY]) {
    return;
  }

  Object.defineProperty(root, INSTALL_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  let hideTimer = 0;
  let pendingState = { message: "", state: "idle" };
  let extensionEnabled = false;

  function dispatchControl() {
    root.dispatchEvent(
      new CustomEvent(CONTROL_EVENT, {
        detail: Object.freeze({ enabled: extensionEnabled }),
      }),
    );
  }

  function setExtensionEnabled(enabled) {
    extensionEnabled = enabled === true;
    dispatchControl();
    if (!extensionEnabled) {
      renderStatus("idle", "");
    }
  }

  function getOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay || !document.body) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.state = "idle";
    const statusIcon = document.createElement("span");
    statusIcon.setAttribute("aria-hidden", "true");
    const statusText = document.createElement("strong");
    overlay.append(statusIcon, statusText);
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderStatus(state, message) {
    pendingState = { message, state };
    const overlay = getOverlay();
    if (!overlay) {
      return;
    }

    clearTimeout(hideTimer);
    overlay.dataset.state = state;
    overlay.querySelector("strong").textContent = message || LABELS[state];
    const hidden = state === "idle";
    overlay.setAttribute("aria-hidden", String(hidden));

    if (state === "opened" || state === "failed") {
      hideTimer = setTimeout(() => renderStatus("idle", ""), state === "opened" ? 1200 : 2800);
    }
  }

  root.addEventListener(STATUS_EVENT, (event) => {
    const state = String(event.detail?.state || "");
    if (!VALID_STATES.has(state)) {
      return;
    }

    const message = typeof event.detail?.message === "string" ? event.detail.message.slice(0, 160) : "";
    renderStatus(state, message);
  });

  root.addEventListener(CONTROL_QUERY_EVENT, dispatchControl);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && typeof changes.enabled?.newValue === "boolean") {
      setExtensionEnabled(changes.enabled.newValue);
    }
  });

  void chrome.storage.local
    .get({ enabled: true })
    .then((settings) => setExtensionEnabled(settings.enabled !== false))
    .catch(() => setExtensionEnabled(false));

  if (document.body) {
    renderStatus(pendingState.state, pendingState.message);
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => renderStatus(pendingState.state, pendingState.message),
      { once: true },
    );
  }
})(globalThis);
