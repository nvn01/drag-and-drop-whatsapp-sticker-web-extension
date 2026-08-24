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

test("toolbar click persists and renders active and inactive states", async () => {
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

  listeners.installed[0]();
  await waitFor(() => state.enabled === true);

  listeners.clicked[0]({ id: 42, url: "https://web.whatsapp.com/" });
  await waitFor(() => state.enabled === false && renders.titles.at(-1)?.title === "Drop as Sticker: off");
  assert.equal(
    renders.icons.at(-1).path[16],
    "chrome-extension://test/icons/inactive-gray-x-16.png",
  );
  await waitFor(() => injections.length === 1);
  assert.equal(injections[0].target.tabId, 42);
  assert.deepEqual(Array.from(injections[0].target.frameIds), [0]);
  assert.equal(injections[0].world, "MAIN");
  assert.deepEqual(Array.from(injections[0].args), ["wa-sticker-plugin:control:v1", false]);

  listeners.clicked[0]({ id: 42, url: "https://web.whatsapp.com/" });
  await waitFor(() => state.enabled === true && renders.titles.at(-1)?.title === "Drop as Sticker: on");
  assert.equal(renders.icons.at(-1).path[128], "chrome-extension://test/icons/active-128.png");
  await waitFor(() => injections.length === 2);
  assert.deepEqual(Array.from(injections[1].args), ["wa-sticker-plugin:control:v1", true]);
});

test("toolbar state is not injected into a non-WhatsApp tab", async () => {
  const state = { enabled: true };
  const injections = [];
  let clicked;
  const chrome = {
    action: {
      onClicked: { addListener: (listener) => (clicked = listener) },
      setIcon: async () => {},
      setTitle: async () => {},
    },
    runtime: {
      getURL: (relativePath) => `chrome-extension://test/${relativePath}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    scripting: { executeScript: async (details) => injections.push(details) },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...state }),
        set: async (update) => Object.assign(state, update),
      },
      onChanged: { addListener: () => {} },
    },
  };

  const source = await readFile(path.join(root, "src/service-worker.js"), "utf8");
  vm.runInNewContext(source, { chrome, URL }, { filename: "service-worker.js" });
  clicked({ id: 7, url: "https://example.com/" });
  await waitFor(() => state.enabled === false);
  assert.equal(injections.length, 0);
});
