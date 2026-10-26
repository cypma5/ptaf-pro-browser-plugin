const OPTIONS = [
  { id: "bulk-actions", key: "bulkActions", fallback: true },
  { id: "rule-transfer", key: "ruleTransfer", fallback: true },
  { id: "dashboard", key: "dashboard", fallback: true },
  { id: "policy-list", key: "policyList", fallback: true },
  { id: "user-rule-set", key: "userRuleSet", fallback: true },
  { id: "certificates", key: "certificates", fallback: true },
  { id: "event-download", key: "eventDownload", fallback: true },
  { id: "event-import", key: "eventImport", fallback: "experimental" },
  { id: "compare-rules", key: "compareRules", fallback: "experimental" },
  { id: "traffic-settings", key: "trafficSettings", fallback: "experimental" },
  { id: "filter-bar", key: "filterBar", fallback: false },
  { id: "selection-decode", key: "selectionDecode", fallback: false },
];

chrome.storage.local.get(null, (items) => {
  const stored = items || {};
  const legacy = Boolean(stored.experimental);
  OPTIONS.forEach((option) => {
    const input = document.getElementById(option.id);
    const known = Object.prototype.hasOwnProperty.call(stored, option.key);
    const checked = known
      ? Boolean(stored[option.key])
      : option.fallback === "experimental"
        ? legacy
        : option.fallback;
    input.checked = checked;
    input.addEventListener("change", () => {
      chrome.storage.local.set({ [option.key]: input.checked });
    });
  });
});
