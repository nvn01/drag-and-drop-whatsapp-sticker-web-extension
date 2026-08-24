import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("inactive mode removes every capture listener and leaves drop untouched", async () => {
  const listeners = new Map();
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
  const source = await readFile(path.join(root, "src/main-world-bridge.js"), "utf8");
  vm.runInContext(source, context, { filename: "main-world-bridge.js" });

  for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} starts detached`);
  }

  context.dispatchEvent(
    new FixtureCustomEvent("wa-sticker-plugin:control:v1", { detail: { enabled: true } }),
  );
  for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
    assert.equal((listeners.get(type) || []).length, 1, `${type} attaches when enabled`);
  }

  context.dispatchEvent(
    new FixtureCustomEvent("wa-sticker-plugin:control:v1", { detail: { enabled: false } }),
  );
  for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
    assert.equal((listeners.get(type) || []).length, 0, `${type} detaches when inactive`);
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
