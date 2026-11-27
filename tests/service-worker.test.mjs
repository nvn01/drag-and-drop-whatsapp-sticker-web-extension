import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for service-worker state");
}

test("saved settings update the active and inactive toolbar icon", async () => {
  const listeners = { clicked: [], installed: [], startup: [], storage: [] };
  const state = {};
  const renders = { icons: [], titles: [] };
  const injections = [];
  const chrome = {
    action: {
      onClicked: { addListener: (listener) => listeners.clicked.push(listener) },
      setIcon: async (details) => renders.icons.push(details),
      setTitle: async (details) => renders.titles.push(details),
    },
    runtime: {
      getURL: (relativePath) => `chrome-extension://test/${relativePath}`,
      onInstalled: { addListener: (listener) => listeners.installed.push(listener) },
      onStartup: { addListener: (listener) => listeners.startup.push(listener) },
    },
    scripting: {
      executeScript: async (details) => injections.push(details),
    },
    storage: {
      local: {
        get: async (query) => {
          if (typeof query === "string") {
            return query in state ? { [query]: state[query] } : {};
          }
          return { ...query, ...state };
        },
        set: async (values) => {
          for (const [key, value] of Object.entries(values)) {
            const oldValue = state[key];
            state[key] = value;
            for (const listener of listeners.storage) {
              listener({ [key]: { newValue: value, oldValue } }, "local");
            }
          }
        },
      },
      onChanged: { addListener: (listener) => listeners.storage.push(listener) },
    },
  };
  const source = await readFile(path.join(root, "src/service-worker.js"), "utf8");
  vm.runInNewContext(source, { chrome, URL }, { filename: "service-worker.js" });

  await waitFor(() => renders.titles.at(-1)?.title === "Drop as Sticker: on");
  assert.equal(renders.icons.at(-1).path[16], "chrome-extension://test/icons/active-16.png");

  listeners.installed[0]({ reason: "update" });
  await waitFor(() => state.enabled === true);

  await chrome.storage.local.set({ enabled: false });
  await waitFor(() => state.enabled === false && renders.titles.at(-1)?.title === "Drop as Sticker: off");
  assert.equal(
    renders.icons.at(-1).path[16],
    "chrome-extension://test/icons/inactive-gray-x-16.png",
  );
  await chrome.storage.local.set({ enabled: true });
  await waitFor(() => state.enabled === true && renders.titles.at(-1)?.title === "Drop as Sticker: on");
  assert.equal(renders.icons.at(-1).path[128], "chrome-extension://test/icons/active-128.png");
  assert.equal(injections.length, 0);
});

test("fresh install bootstraps already-open WhatsApp tabs without a reload", async () => {
  const listeners = { clicked: [], installed: [], startup: [], storage: [] };
  const state = {};
  const queries = [];
  const scriptInjections = [];
  const styleInjections = [];
  const tabs = [
    { id: 21, url: "https://web.whatsapp.com/" },
    { id: 22, url: "https://web.whatsapp.com/#chat" },
    { id: 23, url: "https://web.whatsapp.com.evil.example/" },
    { id: 24, url: "https://web.whatsapp.com/", discarded: true },
  ];
  const chrome = {
    action: {
      onClicked: { addListener: (listener) => listeners.clicked.push(listener) },
      setIcon: async () => {},
      setTitle: async () => {},
    },
    runtime: {
      getURL: (relativePath) => `chrome-extension://test/${relativePath}`,
      onInstalled: { addListener: (listener) => listeners.installed.push(listener) },
      onStartup: { addListener: (listener) => listeners.startup.push(listener) },
    },
    scripting: {
      executeScript: async (details) => scriptInjections.push(details),
      insertCSS: async (details) => styleInjections.push(details),
    },
    storage: {
      local: {
        get: async (query) => {
          if (typeof query === "string") {
            return query in state ? { [query]: state[query] } : {};
          }
          return { ...query, ...state };
        },
        set: async (update) => Object.assign(state, update),
      },
      onChanged: { addListener: (listener) => listeners.storage.push(listener) },
    },
    tabs: {
      query: async (details) => {
        queries.push(details);
        return tabs;
      },
    },
  };

  const source = await readFile(path.join(root, "src/service-worker.js"), "utf8");
  vm.runInNewContext(source, { chrome, URL }, { filename: "service-worker.js" });
  listeners.installed[0]({ reason: "install" });

  await waitFor(() => styleInjections.length === 2 && scriptInjections.length === 4);
  assert.equal(state.enabled, true);
  assert.deepEqual({ ...queries[0] }, { url: "https://web.whatsapp.com/*" });

  for (const tabId of [21, 22]) {
    const style = styleInjections.find((entry) => entry.target.tabId === tabId);
    assert.deepEqual(Array.from(style.target.frameIds), [0]);
    assert.deepEqual(Array.from(style.files), ["src/overlay.css"]);

    const scripts = scriptInjections.filter((entry) => entry.target.tabId === tabId);
    assert.equal(scripts.length, 2);
    assert.equal(scripts[0].world, "MAIN");
    assert.deepEqual(Array.from(scripts[0].files), [
      "src/drop-policy.js",
      "src/sticker-media.js",
      "src/main-world-bridge.js",
    ]);
    assert.equal(scripts[1].world, "ISOLATED");
    assert.deepEqual(Array.from(scripts[1].files), ["src/content-script.js"]);
  }

  assert.equal(styleInjections.some((entry) => entry.target.tabId >= 23), false);
  assert.equal(scriptInjections.some((entry) => entry.target.tabId >= 23), false);

  listeners.installed[0]({ reason: "update" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queries.length, 1, "extension updates must not duplicate the fresh-install bootstrap");
  assert.equal(styleInjections.length, 2);
  assert.equal(scriptInjections.length, 4);
});
