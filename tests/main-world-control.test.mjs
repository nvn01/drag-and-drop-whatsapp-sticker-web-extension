import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("inactive mode removes every capture listener and leaves drop untouched", async () => {
  const listeners = new Map();
  let storedEnabled = true;
  class FixtureCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const context = vm.createContext({
    CustomEvent: FixtureCustomEvent,
    clearTimeout,
    setTimeout,
  });
  context.addEventListener = (type, listener) => {
    const registered = listeners.get(type) || [];
    registered.push(listener);
    listeners.set(type, registered);
  };
  context.removeEventListener = (type, listener) => {
    listeners.set(
      type,
      (listeners.get(type) || []).filter((registered) => registered !== listener),
    );
  };
  context.dispatchEvent = (event) => {
    for (const listener of [...(listeners.get(event.type) || [])]) {
      listener.call(context, event);
    }
    return event.defaultPrevented !== true;
  };

  vm.runInContext(
    'globalThis[Symbol.for("wa-sticker-plugin/drop-policy/v1")] = Object.freeze({});',
    context,
  );
  vm.runInContext(await readFile(path.join(root, "src/sticker-media.js"), "utf8"), context);
  const source = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  vm.runInContext(source, context, { filename: "main-world-bridge.js" });

  context.addEventListener("wa-sticker-plugin:control-query:v1", () => {
    context.dispatchEvent(
      new FixtureCustomEvent("wa-sticker-plugin:control:v1", {
        detail: { enabled: storedEnabled },
      }),
    );
  });

  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} starts detached`);
  }

  context.dispatchEvent(
    new FixtureCustomEvent("wa-sticker-plugin:control:v1", { detail: { enabled: true } }),
  );
  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal((listeners.get(type) || []).length, 1, `${type} attaches when enabled`);
  }

  context.dispatchEvent(new FixtureCustomEvent("pagehide"));
  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} detaches on pagehide`);
  }

  context.dispatchEvent(new FixtureCustomEvent("pageshow"));
  context.dispatchEvent(new FixtureCustomEvent("pageshow"));
  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal(
      (listeners.get(type) || []).length,
      1,
      `${type} restores exactly once after pageshow`,
    );
  }

  storedEnabled = false;
  context.dispatchEvent(
    new FixtureCustomEvent("wa-sticker-plugin:control:v1", { detail: { enabled: false } }),
  );
  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} detaches when inactive`);
  }

  context.dispatchEvent(new FixtureCustomEvent("pageshow"));
  for (const type of ["dragenter", "dragover", "dragleave", "dragend", "drop", "paste", "click"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} stays detached after inactive resume`);
  }

  let nativeDrops = 0;
  context.addEventListener("drop", () => {
    nativeDrops += 1;
  });
  const inactiveDrop = { defaultPrevented: false, type: "drop" };
  context.dispatchEvent(inactiveDrop);
  assert.equal(inactiveDrop.defaultPrevented, false);
  assert.equal(nativeDrops, 1);
});

test("a drop begun during chat navigation waits for the replacement sticker input", async () => {
  const rootListeners = new Map();
  const statuses = [];
  let editorOpen = false;
  let attachFlow = null;

  class FixtureEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
      this.dataTransfer = options.dataTransfer;
      this.target = options.target || null;
      this.defaultPrevented = false;
    }

    preventDefault() {
      this.defaultPrevented = true;
    }

    stopPropagation() {}

    stopImmediatePropagation() {}
  }

  class FixtureCustomEvent extends FixtureEvent {}

  class FixtureElement {
    constructor(kind) {
      this.kind = kind;
      this.isConnected = true;
      this.attributes = new Map();
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    getBoundingClientRect() {
      return { height: 600, width: 800 };
    }

    closest() {
      return null;
    }

    querySelector() {
      return null;
    }

    querySelectorAll() {
      return [];
    }
  }

  class FixtureInput extends FixtureElement {
    constructor(onChange) {
      super("input");
      this.accept = "image/*";
      this.disabled = false;
      this.files = [];
      this.multiple = false;
      this.type = "file";
      this.value = "";
      this.onChange = onChange;
    }

    dispatchEvent(event) {
      if (event.type === "change") {
        this.onChange();
      }
      return true;
    }
  }

  function makeStickerContext(onChange) {
    const composer = new FixtureElement("composer");
    composer.attributes.set("contenteditable", "true");
    const input = new FixtureInput(onChange);
    const conversation = new FixtureElement("conversation");
    conversation.querySelectorAll = (selector) => {
      if (selector.includes("conversation-compose-box-input")) {
        return [composer];
      }
      if (selector.includes('input[type="file"]')) {
        return [input];
      }
      return [];
    };
    return { composer, conversation, input };
  }

  let oldChanges = 0;
  let newChanges = 0;
  const oldContext = makeStickerContext(() => {
    oldChanges += 1;
  });
  const newContext = makeStickerContext(() => {
    newChanges += 1;
    editorOpen = true;
  });
  let currentContext = oldContext;

  const row = new FixtureElement("row");
  row.querySelector = () => null;
  const rowChild = new FixtureElement("row-child");
  rowChild.closest = () => row;

  class FixtureDataTransfer {
    constructor() {
      this._files = [];
      this.items = { add: (file) => this._files.push(file) };
    }

    get files() {
      return this._files;
    }
  }

  const document = {
    documentElement: new FixtureElement("document"),
    querySelector: (selector) =>
      selector.includes("media-editor-copy-button") && editorOpen
        ? new FixtureElement("editor-proof")
        : null,
    querySelectorAll: (selector) =>
      selector.includes("conversation-panel-wrapper")
        ? [currentContext.conversation]
        : [],
  };

  const context = vm.createContext({
    CustomEvent: FixtureCustomEvent,
    AbortController,
    DataTransfer: FixtureDataTransfer,
    Element: FixtureElement,
    Event: FixtureEvent,
    HTMLInputElement: FixtureInput,
    MutationObserver: class {},
    clearTimeout,
    document,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    performance,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    setTimeout,
  });
  context.addEventListener = (type, listener) => {
    const registered = rootListeners.get(type) || [];
    registered.push(listener);
    rootListeners.set(type, registered);
  };
  context.removeEventListener = (type, listener) => {
    rootListeners.set(
      type,
      (rootListeners.get(type) || []).filter((registered) => registered !== listener),
    );
  };
  context.dispatchEvent = (event) => {
    for (const listener of [...(rootListeners.get(event.type) || [])]) {
      listener.call(context, event);
    }
    return event.defaultPrevented !== true;
  };
  context.require = (name) => {
    if (name === "WAWebUim") {
      return {
        DismissReason: { UIM_INTERACTION: "UIM_INTERACTION" },
        UIM: { findMostRecentlyActiveDismissable: () => attachFlow },
      };
    }
    throw new Error(`Unknown fixture module: ${name}`);
  };

  vm.runInContext(
    `globalThis[Symbol.for("wa-sticker-plugin/drop-policy/v1")] = Object.freeze({
      classifyTransfer: () => ({ eligible: true, kind: "local-image" }),
      acceptsInput: () => true,
    });`,
    context,
  );
  vm.runInContext(await readFile(path.join(root, "src/sticker-media.js"), "utf8"), context);
  const source = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  vm.runInContext(source, context, { filename: "main-world-bridge.js" });

  context.addEventListener("wa-sticker-plugin:status:v1", (event) => {
    statuses.push(event.detail);
  });
  context.dispatchEvent(
    new FixtureCustomEvent("wa-sticker-plugin:control:v1", { detail: { enabled: true } }),
  );
  context.dispatchEvent(new FixtureEvent("click", { target: rowChild }));

  attachFlow = {
    displayName: "AttachMediaFlow",
    requestDismiss: () => {
      attachFlow = null;
      setTimeout(() => {
        oldContext.conversation.isConnected = false;
        oldContext.composer.isConnected = false;
        oldContext.input.isConnected = false;
        currentContext = newContext;
      }, 30);
    },
  };
  const file = { name: "fixture.png", size: 8, type: "image/png" };
  const transfer = {
    files: [file],
    getData: () => "",
    items: [{ kind: "file", type: "image/png" }],
    types: ["Files"],
  };
  const drop = new FixtureEvent("drop", { dataTransfer: transfer });
  context.dispatchEvent(drop);

  await new Promise((resolve) => setTimeout(resolve, 350));

  assert.equal(drop.defaultPrevented, true);
  assert.equal(oldChanges, 0, "the stale chat input is never used");
  assert.equal(newChanges, 1, "the stabilized replacement chat receives the file");
  assert.equal(newContext.input.files.length, 1);
  assert.equal(statuses.at(-1)?.state, "opened");

  editorOpen = false;
  const ambiguousDrop = new FixtureEvent("drop", { dataTransfer: transfer });
  context.dispatchEvent(ambiguousDrop);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ambiguousDrop.defaultPrevented, false, "missing attach flow fails open");
  assert.equal(newChanges, 1, "ambiguous UI state never reaches the sticker input");
  assert.equal(statuses.at(-1).state, "failed");
  context.dispatchEvent(new FixtureEvent("dragleave"));
  await new Promise(resolve => setTimeout(resolve, 375));
  assert.equal(statuses.at(-1).state, "failed", "drag cleanup preserves the failure notice");

  newContext.composer.contains = target => target === newContext.composer;
  const paste = new FixtureEvent("paste", { target: newContext.composer });
  paste.isTrusted = true;
  paste.clipboardData = transfer;
  context.dispatchEvent(paste);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(paste.defaultPrevented, true);
  assert.equal(newChanges, 2);
  assert.equal(statuses.at(-1).state, "opened");
});
