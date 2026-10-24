const experimental = document.getElementById("experimental");
const selectionDecode = document.getElementById("selection-decode");

chrome.storage.local.get({ experimental: false, selectionDecode: false }, (items) => {
  experimental.checked = Boolean(items.experimental);
  selectionDecode.checked = Boolean(items.selectionDecode);
});

experimental.addEventListener("change", () => {
  chrome.storage.local.set({ experimental: experimental.checked });
});

selectionDecode.addEventListener("change", () => {
  chrome.storage.local.set({ selectionDecode: selectionDecode.checked });
});
