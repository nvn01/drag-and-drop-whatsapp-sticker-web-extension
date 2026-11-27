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
  let settings = { pack: "", author: "" };
  let activeOperation = null;
  let pasteEnabled = true;
  let motionEnabled = true;
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

    activeOperation?.abort();
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
      return images.length === 1 && visibleText === "";
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
      const flow = uiDismissApi?.findDismissable();
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
          setTimeout(() => resolve(true), 0);
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

    return normalize(event, ["^image/", "^video/"]);
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
    if (!extensionEnabled || dropInFlight) return;
    const decision = policy.classifyTransfer(snapshotTransfer(event.dataTransfer, false), "preview", motionEnabled);
    if (!decision.eligible) {
      // A protected transfer can briefly expose no types while the tab regains focus.
      if (currentStatus === "eligible" && decision.reason !== "ambiguous-preview") emitStatus("idle");
      return;
    }
    if (currentStatus !== "eligible" && !findStickerContext()) return;

    // Keep WhatsApp's first dragenter. Once its overlay exists, crossing one of
    // its child elements should not start another attachment flow.
    if (event.type === "dragenter" && currentStatus === "eligible" &&
        getActiveDragAttachFlow(getWhatsAppUiDismissApi())) {
      event.stopPropagation();
    }
    emitStatus("eligible");
  }

  function scheduleDragEnd(event) {
    if (currentStatus !== "eligible") return;
    if (event.type === "dragleave" && event.relatedTarget &&
        document.documentElement.contains(event.relatedTarget)) {
      if (getActiveDragAttachFlow(getWhatsAppUiDismissApi())) event.stopPropagation();
      return;
    }
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (currentStatus === "eligible" && !dropInFlight) emitStatus("idle");
    }, 350);
  }

  // Read the transfer synchronously. Chromium clears clipboard and drag data
  // when the event returns, even if a later conversion is still running.
  function handlePaste(event) {
    if (!pasteEnabled || !event.isTrusted || !extensionEnabled || dropInFlight) return;
    const context = findStickerContext();
    if (!context || !context.composer.contains(event.target)) return;
    const transfer = event.clipboardData;
    const files = Array.from(transfer?.files || []);
    if (files.length) {
      if (files.length === 1 && policy.acceptsInput(files[0], motionEnabled)) {
        void openSticker(event, context, () => files);
      }
      return;
    }
    const url = policy.directPasteUrl(readTransferData(transfer, "text/plain"));
    if (!url) return;
    const expectsMotion = policy.isMotionInput({ name: new URL(url).pathname });
    if (!motionEnabled && expectsMotion) return;
    const normalize = getWhatsAppFileNormalizer();
    if (!normalize) {
      emitStatus("failed", "Sticker import unavailable. The link will paste normally.");
      return;
    }
    // Supply the same two flavors as a browser image drag. WhatsApp resolves
    // the image through its own normalizer with its existing network policy.
    const image = document.implementation.createHTMLDocument("").createElement("img");
    image.setAttribute("src", url);
    const data = new DataTransfer();
    data.setData("text/uri-list", url);
    data.setData("text/html", image.outerHTML);
    const drop = new DragEvent("drop", { dataTransfer: data });
    void openSticker(event, context, async () => {
      const normalized = await normalize(drop, ["^image/", "^video/"]);
      if (expectsMotion && normalized?.length === 1 && !policy.isMotionInput(normalized[0])) {
        throw new Error("lost-animation");
      }
      return normalized;
    });
  }

  function handleDrop(event) {
    clearTimeout(leaveTimer);
    if (!extensionEnabled || dropInFlight) return;
    const decision = policy.classifyTransfer(snapshotTransfer(event.dataTransfer, true), "drop", motionEnabled);
    if (!decision.eligible) {
      if (currentStatus === "eligible") emitStatus("idle");
      return;
    }
    const context = findStickerContext();
    if (!context) {
      if (!document.querySelector(EDITOR_PROOF_SELECTOR)) emitStatus("failed", "Open a sendable chat and try again.");
      return;
    }
    const api = getWhatsAppUiDismissApi();
    const flow = api && getActiveDragAttachFlow(api);
    if (!flow || typeof flow.requestDismiss !== "function" ||
        (decision.kind !== "local-image" && !getWhatsAppFileNormalizer())) {
      emitStatus("failed", "Sticker editor unavailable. WhatsApp will handle this drop.");
      return;
    }
    void openSticker(event, context, () => normalizeDroppedFiles(event, decision), api, flow);
  }

  async function openSticker(event, context, loadFiles, api, flow) {
    stopWhatsAppDrop(event);
    clearTimeout(leaveTimer);
    dropInFlight = true;
    const operation = new AbortController();
    activeOperation = operation;
    const revision = conversationNavigationRevision;
    const control = controlRevision;
    const timeout = setTimeout(() => operation.abort(), 25000);
    const interrupted = new Promise((_, reject) => {
      operation.signal.addEventListener("abort", () => reject(new Error("interrupted")), { once: true });
    });
    emitStatus("processing");
    try {
      const files = await Promise.race([loadFiles(), interrupted]);
      if (files?.length !== 1 || !policy.acceptsInput(files[0], motionEnabled)) throw new Error("unsupported");
      if (flow && !await closeWhatsAppDragAttachFlow(api, flow)) throw new Error("attach-flow");
      operation.signal.throwIfAborted();
      const media = root[Symbol.for("wa-sticker-plugin/sticker-media/v1")];
      const file = await Promise.race([media.prepare(files[0], settings, operation.signal), interrupted]);
      if (!file || !["image/webp", "image/jpeg", "image/png", ""].includes(file.type)) throw new Error("unsupported");
      const fresh = await resolveStableStickerContext(context, revision);
      operation.signal.throwIfAborted();
      if (!fresh || conversationNavigationRevision !== revision) throw new Error("chat-context-changed");
      routeFileToStickerInput(fresh.input, file);
      const opened = await Promise.race([waitForStickerEditor(EDITOR_WAIT_MS), interrupted]);
      if (opened) emitStatus("opened");
      else emitStatus("failed", "WhatsApp did not open the sticker editor. Try Create Sticker.");
    } catch (error) {
      if (extensionEnabled && control === controlRevision) {
        let message = "Could not open the sticker editor. Try pasting the image file.";
        if (revision !== conversationNavigationRevision || error?.message === "chat-context-changed") {
          message = "Chat changed. Try again in the current chat.";
        } else if (error?.message === "lost-animation") {
          message = "This link returned a still image. Drop the original GIF or video file.";
        } else if (error?.name === "StickerMediaError") {
          message = error.message;
        } else if (operation.signal.aborted) {
          message = "Sticker preparation timed out. Try a smaller file.";
        }
        emitStatus("failed", message);
      }
    } finally {
      clearTimeout(timeout);
      activeOperation = null;
      dropInFlight = false;
    }
  }

  function setDragListenersAttached(shouldAttach) {
    if (shouldAttach === dragListenersAttached) return;
    const method = shouldAttach ? "addEventListener" : "removeEventListener";
    root[method]("dragenter", previewEligibleDrop, true);
    root[method]("dragover", previewEligibleDrop, true);
    root[method]("dragleave", scheduleDragEnd, true);
    root[method]("drop", handleDrop, true);
    root[method]("paste", handlePaste, true);
    root[method]("dragend", scheduleDragEnd, true);
    root[method]("click", recordConversationNavigation, true);
    dragListenersAttached = shouldAttach;
  }

  function requestCurrentControlState() {
    root.dispatchEvent(new CustomEvent(CONTROL_QUERY_EVENT));
  }

  root.addEventListener(CONTROL_EVENT, (event) => {
    const enabled = event.detail?.enabled === true;
    pasteEnabled = event.detail?.paste !== false;
    motionEnabled = event.detail?.motion !== false;
    if (event.detail?.attribution) {
      const { pack, author } = event.detail.attribution;
      settings = { pack: String(pack || "").slice(0, 128), author: String(author || "").slice(0, 128) };
    }
    if (extensionEnabled !== enabled) {
      controlRevision += 1;
    }
    extensionEnabled = enabled;
    setDragListenersAttached(enabled);
    if (!enabled) {
      activeOperation?.abort();
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
    activeOperation?.abort();
    pendingConversationNavigation = null;
    setDragListenersAttached(false);
    emitStatus("idle");
  });
  root.addEventListener("pageshow", requestCurrentControlState);
  requestCurrentControlState();
})(globalThis);
