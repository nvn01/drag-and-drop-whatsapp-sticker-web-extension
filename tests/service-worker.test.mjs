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
  const chrome = {
    action: {
      onClicked: { addListener: (listener) => listeners.clicked.push(listener) },
      setIcon: async (details) => renders.icons.push(details),
      setTitle: async (details) => renders.titles.push(details),
    },
    runtime: {
      onInstalled: { addListener: (listener) => listeners.installed.push(listener) },
      onStartup: { addListener: (listener) => listeners.startup.push(listener) },
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
  vm.runInNewContext(source, { chrome }, { filename: "service-worker.js" });

  await waitFor(() => renders.titles.at(-1)?.title === "Drop as Sticker: on");
  assert.equal(renders.icons.at(-1).path[16], "icons/active-16.png");

  listeners.installed[0]();
  await waitFor(() => state.enabled === true);

  listeners.clicked[0]();
  await waitFor(() => state.enabled === false && renders.titles.at(-1)?.title === "Drop as Sticker: off");
  assert.equal(renders.icons.at(-1).path[16], "icons/inactive-16.png");

  listeners.clicked[0]();
  await waitFor(() => state.enabled === true && renders.titles.at(-1)?.title === "Drop as Sticker: on");
  assert.equal(renders.icons.at(-1).path[128], "icons/active-128.png");
});
