const checkbox = document.getElementById("experimental");

chrome.storage.local.get({ experimental: false }, (items) => {
  checkbox.checked = Boolean(items.experimental);
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ experimental: checkbox.checked });
});
