"use strict";

const form = document.querySelector("form");
const status = form.querySelector("output");
const fields = form.elements;
const switches = ["enabled", "paste", "motion"];

async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get({ enabled: true, paste: true, motion: true, attribution: {} });
    for (const name of switches) fields[name].checked = settings[name];
    fields.pack.value = settings.attribution.pack || "";
    fields.author.value = settings.attribution.author || "";
    form.querySelector("fieldset").disabled = false;
  } catch {
    status.textContent = "Could not load settings.";
  }
}

for (const name of switches) {
  fields[name].addEventListener("change", async () => {
    const input = fields[name];
    input.disabled = true;
    try {
      await chrome.storage.local.set({ [name]: input.checked });
      status.textContent = "Setting saved.";
    } catch {
      input.checked = !input.checked;
      status.textContent = "Could not save this setting.";
    } finally {
      input.disabled = false;
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const save = form.querySelector("button");
  save.disabled = true;
  try {
    await chrome.storage.local.set({ attribution: { pack: fields.pack.value.trim(), author: fields.author.value.trim() } });
    status.textContent = "Attribution saved.";
  } catch {
    status.textContent = "Could not save attribution.";
  } finally {
    save.disabled = false;
  }
});

void loadSettings();
