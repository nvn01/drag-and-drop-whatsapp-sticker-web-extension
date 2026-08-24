(function installToolbarToggle() {
  "use strict";

  const ENABLED_KEY = "enabled";
  const ACTIVE_ICONS = Object.freeze({
    16: "icons/active-16.png",
    32: "icons/active-32.png",
    48: "icons/active-48.png",
    128: "icons/active-128.png",
  });
  const INACTIVE_ICONS = Object.freeze({
    16: "icons/inactive-16.png",
    32: "icons/inactive-32.png",
    48: "icons/inactive-48.png",
    128: "icons/inactive-128.png",
  });

  async function readEnabled() {
    const settings = await chrome.storage.local.get({ [ENABLED_KEY]: true });
    return settings[ENABLED_KEY] !== false;
  }

  async function renderAction(enabled) {
    await Promise.all([
      chrome.action.setIcon({ path: enabled ? ACTIVE_ICONS : INACTIVE_ICONS }),
      chrome.action.setTitle({ title: `Drop as Sticker: ${enabled ? "on" : "off"}` }),
    ]);
  }

  async function synchronizeAction() {
    await renderAction(await readEnabled());
  }

  chrome.runtime.onInstalled.addListener(() => {
    void (async () => {
      const settings = await chrome.storage.local.get(ENABLED_KEY);
      if (typeof settings[ENABLED_KEY] !== "boolean") {
        await chrome.storage.local.set({ [ENABLED_KEY]: true });
      }
      await synchronizeAction();
    })();
  });

  chrome.runtime.onStartup.addListener(() => {
    void synchronizeAction();
  });

  chrome.action.onClicked.addListener(() => {
    void (async () => {
      const enabled = !(await readEnabled());
      await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
      await renderAction(enabled);
    })();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && typeof changes[ENABLED_KEY]?.newValue === "boolean") {
      void renderAction(changes[ENABLED_KEY].newValue);
    }
  });

  void synchronizeAction();
})();
