const OPTIONS = [
  { id: "bulk-actions", key: "bulkActions", fallback: true },
  { id: "rule-transfer", key: "ruleTransfer", fallback: true },
  { id: "dashboard", key: "dashboard", fallback: true },
  { id: "policy-sync", key: "policySync", fallback: true },
  { id: "policy-list", key: "policyList", fallback: true },
  { id: "user-rule-set", key: "userRuleSet", fallback: true },
  { id: "certificates", key: "certificates", fallback: true },
  { id: "license-params", key: "licenseParams", fallback: true },
  { id: "event-download", key: "eventDownload", fallback: false },
  { id: "event-import", key: "eventImport", fallback: false },
  { id: "compare-rules", key: "compareRules", fallback: "experimental" },
  { id: "exclusions-summary", key: "exclusionsSummary", fallback: true },
  { id: "traffic-settings", key: "trafficSettings", fallback: false },
  { id: "filter-bar", key: "filterBar", fallback: false },
  { id: "user-rule-builder", key: "userRuleBuilder", fallback: false },
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
