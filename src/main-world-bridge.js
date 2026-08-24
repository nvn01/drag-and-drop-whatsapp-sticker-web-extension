(function installMainWorldBridge(root) {
  "use strict";

  const INSTALL_KEY = Symbol.for("wa-sticker-plugin/main-installed/v1");
  const POLICY_KEY = Symbol.for("wa-sticker-plugin/drop-policy/v1");
  const STATUS_EVENT = "wa-sticker-plugin:status:v1";
  const CONTROL_EVENT = "wa-sticker-plugin:control:v1";
  const CONTROL_QUERY_EVENT = "wa-sticker-plugin:control-query:v1";
  const CONVERSATION_SELECTOR = '[data-testid="conversation-panel-wrapper"]';
  const COMPOSER_SELECTOR = '[data-testid="conversation-compose-box-input"]';
  const STICKER_INPUT_SELECTOR = 'footer input[type="file"][accept="image/*"]';
  const EDITOR_PROOF_SELECTOR =
    '[data-testid="drawer-middle"] [data-testid="media-editor-copy-button"]';
  const DRAG_ATTACH_FLOW_NAME = "AttachMediaFlow";
  const DRAG_ATTACH_FLOW_WAIT_MS = 1000;
  const EDITOR_WAIT_MS = 5000;

  if (root[INSTALL_KEY] || !root[POLICY_KEY]) {
    return;
  }

  Object.defineProperty(root, INSTALL_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  const policy = root[POLICY_KEY];
  let extensionEnabled = false;
  let dropInFlight = false;
  let currentStatus = "idle";
  let leaveTimer = 0;

  function emitStatus(state, message) {
    if (state === currentStatus && !message) {
      return;
    }

    currentStatus = state;
    root.dispatchEvent(
      new CustomEvent(STATUS_EVENT, {
        detail: Object.freeze({
          state,
          message: typeof message === "string" ? message.slice(0, 160) : "",
        }),
      }),
    );
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function findStickerContext() {
    const conversation = document.querySelector(CONVERSATION_SELECTOR);
    if (!conversation || !isVisible(conversation)) {
      return null;
    }

    const composer = conversation.querySelector(COMPOSER_SELECTOR);
    if (
      !composer ||
      composer.getAttribute("contenteditable") !== "true" ||
      composer.getAttribute("aria-disabled") === "true"
    ) {
      return null;
    }

    if (document.querySelector(EDITOR_PROOF_SELECTOR)) {
      return null;
    }

    const inputs = Array.from(conversation.querySelectorAll(STICKER_INPUT_SELECTOR)).filter(
      (input) =>
        input instanceof HTMLInputElement &&
        input.type === "file" &&
        input.accept === "image/*" &&
        !input.disabled &&
        !input.multiple,
    );

    if (inputs.length !== 1) {
      return null;
    }

    return { conversation, input: inputs[0] };
  }

  function readTransferData(dataTransfer, type) {
    try {
      return dataTransfer.getData(type) || "";
    } catch {
      return "";
    }
  }

  function hasSafeImageHtml(html) {
    if (!html) {
      return false;
    }

    try {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const images = Array.from(parsed.images).filter((image) => image.src);
      const visibleText = String(parsed.body?.textContent || "").trim();
      return images.length > 0 && visibleText === "";
    } catch {
      return false;
    }
  }

  function snapshotTransfer(dataTransfer, includePayload) {
    const files = Array.from(dataTransfer?.files || []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    const fileItems = Array.from(dataTransfer?.items || [])
      .filter((item) => item.kind === "file")
      .map((item) => ({ name: "", size: 0, type: item.type }));
    const types = Array.from(dataTransfer?.types || []);
    const html = includePayload ? readTransferData(dataTransfer, "text/html") : "";
    const uri = includePayload ? readTransferData(dataTransfer, "text/uri-list") : "";

    return {
      files,
      fileItems,
      hasImageHtml: includePayload && hasSafeImageHtml(html),
      html,
      types,
      uri,
    };
  }

  function getWhatsAppFileNormalizer() {
    try {
      const loader = root.require;
      if (typeof loader !== "function") {
        return null;
      }
      const module = loader("WAWebEventFiles");
      return typeof module?.getFiles === "function" ? module.getFiles : null;
    } catch {
      return null;
    }
  }

  function getWhatsAppUiDismissApi() {
    try {
      const loader = root.require;
      if (typeof loader !== "function") {
        return null;
      }

      const module = loader("WAWebUim");
      const UIM = module?.UIM;
      if (
        typeof UIM?.findMostRecentlyActiveDismissable !== "function" ||
        !module?.DismissReason?.UIM_INTERACTION
      ) {
        return null;
      }

      return {
        dismissReason: module.DismissReason.UIM_INTERACTION,
        findDismissable: UIM.findMostRecentlyActiveDismissable.bind(UIM),
      };
    } catch {
      return null;
    }
  }

  function getActiveDragAttachFlow(uiDismissApi) {
    try {
      const flow = uiDismissApi.findDismissable();
      return flow?.displayName === DRAG_ATTACH_FLOW_NAME ? flow : null;
    } catch {
      return null;
    }
  }

  function waitForDragAttachFlowToClose(uiDismissApi, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = performance.now() + timeoutMs;

      function check() {
        if (!getActiveDragAttachFlow(uiDismissApi)) {
          requestAnimationFrame(() => resolve(true));
          return;
        }

        if (performance.now() >= deadline) {
          resolve(false);
          return;
        }

        setTimeout(check, 25);
      }

      check();
    });
  }

  async function closeWhatsAppDragAttachFlow(uiDismissApi) {
    const flow = getActiveDragAttachFlow(uiDismissApi);
    if (!flow) {
      return true;
    }

    if (typeof flow.requestDismiss !== "function") {
      return false;
    }

    try {
      flow.requestDismiss(uiDismissApi.dismissReason);
    } catch {
      return false;
    }

    return waitForDragAttachFlowToClose(uiDismissApi, DRAG_ATTACH_FLOW_WAIT_MS);
  }

  function stopWhatsAppDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function waitForStickerEditor(timeoutMs) {
    return new Promise((resolve) => {
      if (document.querySelector(EDITOR_PROOF_SELECTOR)) {
        resolve(true);
        return;
      }

      let settled = false;
      const observer = new MutationObserver(() => {
        if (!settled && document.querySelector(EDITOR_PROOF_SELECTOR)) {
          settled = true;
          observer.disconnect();
          clearTimeout(timeout);
          resolve(true);
        }
      });
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          observer.disconnect();
          resolve(false);
        }
      }, timeoutMs);

      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function normalizeDroppedFiles(event, decision) {
    const directFiles = Array.from(event.dataTransfer?.files || []);
    if (decision.kind === "local-image" && directFiles.length === 1) {
      return directFiles;
    }

    const normalize = getWhatsAppFileNormalizer();
    if (!normalize) {
      throw new Error("normalizer-unavailable");
    }

    return normalize(event, ["^image/"]);
  }

  function routeFileToStickerInput(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.value = "";
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    setTimeout(() => {
      if (input.isConnected) {
        input.value = "";
      }
    }, 0);
  }

  function previewEligibleDrop(event) {
    clearTimeout(leaveTimer);
    if (!extensionEnabled || dropInFlight || !findStickerContext()) {
      return;
    }

    const decision = policy.classifyTransfer(
      snapshotTransfer(event.dataTransfer, false),
      "preview",
    );
    if (decision.eligible) {
      emitStatus("eligible");
    }
  }

  function scheduleDragEnd() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (!dropInFlight) {
        emitStatus("idle");
      }
    }, 120);
  }

  async function handleDrop(event) {
    clearTimeout(leaveTimer);
    if (!extensionEnabled || dropInFlight) {
      return;
    }

    const context = findStickerContext();
    if (!context) {
      emitStatus("idle");
      return;
    }

    const snapshot = snapshotTransfer(event.dataTransfer, true);
    const decision = policy.classifyTransfer(snapshot, "drop");
    if (!decision.eligible) {
      emitStatus("idle");
      return;
    }

    if (decision.kind !== "local-image" && !getWhatsAppFileNormalizer()) {
      emitStatus("idle");
      return;
    }

    const uiDismissApi = getWhatsAppUiDismissApi();
    if (!uiDismissApi) {
      emitStatus("idle");
      return;
    }

    stopWhatsAppDrop(event);
    dropInFlight = true;
    emitStatus("processing");

    try {
      const files = await normalizeDroppedFiles(event, decision);
      if (files.length !== 1 || !policy.isSupportedImageMetadata(files[0])) {
        throw new Error("unsupported-image");
      }

      const attachFlowClosed = await closeWhatsAppDragAttachFlow(uiDismissApi);
      const freshContext = attachFlowClosed ? findStickerContext() : null;
      if (!freshContext) {
        throw new Error("drag-attach-flow-still-open");
      }

      routeFileToStickerInput(freshContext.input, files[0]);
      const editorOpened = await waitForStickerEditor(EDITOR_WAIT_MS);
      emitStatus(
        editorOpened ? "opened" : "failed",
        editorOpened ? "" : "WhatsApp did not open the sticker editor.",
      );
    } catch {
      emitStatus("failed", "Could not open the sticker editor. Use Create Sticker and retry.");
    } finally {
      dropInFlight = false;
    }
  }

  root.addEventListener(CONTROL_EVENT, (event) => {
    const enabled = event.detail?.enabled === true;
    extensionEnabled = enabled;
    if (!enabled) {
      clearTimeout(leaveTimer);
      emitStatus("idle");
    }
  });

  root.addEventListener("dragenter", previewEligibleDrop, true);
  root.addEventListener("dragover", previewEligibleDrop, true);
  root.addEventListener("dragleave", scheduleDragEnd, true);
  root.addEventListener("drop", handleDrop, true);
  root.addEventListener("pagehide", () => {
    clearTimeout(leaveTimer);
    emitStatus("idle");
  });
  root.dispatchEvent(new CustomEvent(CONTROL_QUERY_EVENT));
})(globalThis);
