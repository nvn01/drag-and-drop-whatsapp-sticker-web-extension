(function installToolbarToggle() {
  "use strict";

  const ENABLED_KEY = "enabled";
  const CONTROL_EVENT = "wa-sticker-plugin:control:v1";
  const WHATSAPP_ORIGIN = "https://web.whatsapp.com";
  const ACTIVE_ICONS = Object.freeze({
    16: chrome.runtime.getURL("icons/active-16.png"),
    32: chrome.runtime.getURL("icons/active-32.png"),
    48: chrome.runtime.getURL("icons/active-48.png"),
    128: chrome.runtime.getURL("icons/active-128.png"),
  });
  const INACTIVE_ICONS = Object.freeze({
    16: chrome.runtime.getURL("icons/inactive-gray-x-16.png"),
    32: chrome.runtime.getURL("icons/inactive-gray-x-32.png"),
    48: chrome.runtime.getURL("icons/inactive-gray-x-48.png"),
    128: chrome.runtime.getURL("icons/inactive-gray-x-128.png"),
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

  function isWhatsAppTab(tab) {
    if (!Number.isInteger(tab?.id) || typeof tab.url !== "string") {
      return false;
    }

    try {
      return new URL(tab.url).origin === WHATSAPP_ORIGIN;
    } catch {
      return false;
    }
  }

  async function synchronizeClickedTab(tab, enabled) {
    if (!isWhatsAppTab(tab)) {
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: "MAIN",
        func: (eventName, nextEnabled) => {
          globalThis.dispatchEvent(
            new CustomEvent(eventName, {
              detail: Object.freeze({ enabled: nextEnabled === true }),
            }),
          );
        },
        args: [CONTROL_EVENT, enabled],
      });
    } catch {
      // Storage remains authoritative. A newly installed extension still needs one page reload.
    }
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

  chrome.action.onClicked.addListener((tab) => {
    void (async () => {
      const enabled = !(await readEnabled());
      await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
      await Promise.all([renderAction(enabled), synchronizeClickedTab(tab, enabled)]);
    })();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && typeof changes[ENABLED_KEY]?.newValue === "boolean") {
      void renderAction(changes[ENABLED_KEY].newValue);
    }
  });

  void synchronizeAction();
})();
