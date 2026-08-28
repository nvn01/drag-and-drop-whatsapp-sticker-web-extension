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
  const CHAT_ROW_SELECTOR = '#pane-side [role="row"][data-testid^="list-item-"]';
  const DRAG_ATTACH_FLOW_NAME = "AttachMediaFlow";
  const DRAG_ATTACH_FLOW_WAIT_MS = 1000;
  const EDITOR_WAIT_MS = 5000;
  const CHAT_CONTEXT_WAIT_MS = 2000;
  const CHAT_CONTEXT_STABLE_MS = 120;
  const CHAT_CONTEXT_POLL_MS = 25;

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
  let dragListenersAttached = false;
  let controlRevision = 0;
  let currentStatus = "idle";
  let leaveTimer = 0;
  let conversationNavigationRevision = 0;
  let pendingConversationNavigation = null;

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
    if (document.querySelector(EDITOR_PROOF_SELECTOR)) {
      return null;
    }

    const contexts = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR))
      .filter((conversation) => isVisible(conversation))
      .map((conversation) => {
        const composers = Array.from(conversation.querySelectorAll(COMPOSER_SELECTOR)).filter(
          (composer) =>
            composer.getAttribute("contenteditable") === "true" &&
            composer.getAttribute("aria-disabled") !== "true",
        );
        const inputs = Array.from(
          conversation.querySelectorAll(STICKER_INPUT_SELECTOR),
        ).filter(
          (input) =>
            input instanceof HTMLInputElement &&
            input.type === "file" &&
            input.accept === "image/*" &&
            !input.disabled &&
            !input.multiple,
        );

        return composers.length === 1 && inputs.length === 1
          ? { conversation, composer: composers[0], input: inputs[0] }
          : null;
      })
      .filter(Boolean);

    if (contexts.length !== 1) {
      return null;
    }

    return contexts[0];
  }

  function isSameStickerContext(left, right) {
    return Boolean(
      left &&
        right &&
        left.conversation === right.conversation &&
        left.composer === right.composer &&
        left.input === right.input,
    );
  }

  function recordConversationNavigation(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const row = target.closest(CHAT_ROW_SELECTOR);
    if (!row || row.querySelector('[aria-selected="true"]')) {
      return;
    }

    conversationNavigationRevision += 1;
    pendingConversationNavigation = {
      previousContext: findStickerContext(),
      revision: conversationNavigationRevision,
      startedAt: Date.now(),
    };
  }

  async function resolveStableStickerContext(initialContext, navigationRevision) {
    const navigation = pendingConversationNavigation;
    const navigationIsPending =
      navigation?.revision === navigationRevision &&
      Date.now() - navigation.startedAt <= CHAT_CONTEXT_WAIT_MS;

    if (!navigationIsPending) {
      const currentContext = findStickerContext();
      return isSameStickerContext(initialContext, currentContext) ? currentContext : null;
    }

    const deadline = navigation.startedAt + CHAT_CONTEXT_WAIT_MS;
    let stableContext = null;
    let stableSince = 0;

    while (Date.now() <= deadline) {
      if (conversationNavigationRevision !== navigationRevision) {
        return null;
      }

      const currentContext = findStickerContext();
      const stillUsingPreviousContext = isSameStickerContext(
        currentContext,
        navigation.previousContext,
      );

      if (currentContext && !stillUsingPreviousContext) {
        if (isSameStickerContext(currentContext, stableContext)) {
          if (Date.now() - stableSince >= CHAT_CONTEXT_STABLE_MS) {
            pendingConversationNavigation = null;
            return currentContext;
          }
        } else {
          stableContext = currentContext;
          stableSince = Date.now();
        }
      } else {
        stableContext = null;
        stableSince = 0;
      }

      await new Promise((resolve) => setTimeout(resolve, CHAT_CONTEXT_POLL_MS));
    }

    return null;
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

  async function closeWhatsAppDragAttachFlow(uiDismissApi, flow) {
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

    const dragAttachFlow = getActiveDragAttachFlow(uiDismissApi);
    if (!dragAttachFlow || typeof dragAttachFlow.requestDismiss !== "function") {
      emitStatus("idle");
      return;
    }

    stopWhatsAppDrop(event);
    dropInFlight = true;
    const startedAtRevision = controlRevision;
    const startedAtNavigationRevision = conversationNavigationRevision;
    emitStatus("processing");

    try {
      const files = await normalizeDroppedFiles(event, decision);
      if (files.length !== 1 || !policy.isSupportedImageMetadata(files[0])) {
        throw new Error("unsupported-image");
      }

      const attachFlowClosed = await closeWhatsAppDragAttachFlow(uiDismissApi, dragAttachFlow);
      if (!extensionEnabled || startedAtRevision !== controlRevision) {
        throw new Error("extension-disabled");
      }
      const freshContext = attachFlowClosed
        ? await resolveStableStickerContext(context, startedAtNavigationRevision)
        : null;
      if (!freshContext) {
        throw new Error("chat-context-changed");
      }

      routeFileToStickerInput(freshContext.input, files[0]);
      const editorOpened = await waitForStickerEditor(EDITOR_WAIT_MS);
      emitStatus(
        editorOpened ? "opened" : "failed",
        editorOpened ? "" : "WhatsApp did not open the sticker editor.",
      );
    } catch (error) {
      if (extensionEnabled && startedAtRevision === controlRevision) {
        emitStatus(
          "failed",
          error?.message === "chat-context-changed"
            ? "Chat changed. Drop the image again."
            : "Could not open the sticker editor. Use Create Sticker and retry.",
        );
      } else {
        emitStatus("idle");
      }
    } finally {
      dropInFlight = false;
    }
  }

  function setDragListenersAttached(shouldAttach) {
    if (shouldAttach === dragListenersAttached) {
      return;
    }

    const method = shouldAttach ? "addEventListener" : "removeEventListener";
    root[method]("dragenter", previewEligibleDrop, true);
    root[method]("dragover", previewEligibleDrop, true);
    root[method]("dragleave", scheduleDragEnd, true);
    root[method]("drop", handleDrop, true);
    root[method]("click", recordConversationNavigation, true);
    dragListenersAttached = shouldAttach;
  }

  function requestCurrentControlState() {
    root.dispatchEvent(new CustomEvent(CONTROL_QUERY_EVENT));
  }

  root.addEventListener(CONTROL_EVENT, (event) => {
    const enabled = event.detail?.enabled === true;
    if (extensionEnabled !== enabled) {
      controlRevision += 1;
    }
    extensionEnabled = enabled;
    setDragListenersAttached(enabled);
    if (!enabled) {
      clearTimeout(leaveTimer);
      emitStatus("idle");
    }
  });

  root.addEventListener("pagehide", () => {
    clearTimeout(leaveTimer);
    if (extensionEnabled) {
      controlRevision += 1;
    }
    extensionEnabled = false;
    pendingConversationNavigation = null;
    setDragListenersAttached(false);
    emitStatus("idle");
  });
  root.addEventListener("pageshow", requestCurrentControlState);
  requestCurrentControlState();
})(globalThis);
