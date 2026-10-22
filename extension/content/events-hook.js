(function () {
  if (window.__ptafEventHook) {
    return;
  }
  window.__ptafEventHook = true;

  const pattern = /\/threats\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)/i;

  function remember(url) {
    const match = String(url || "").match(pattern);
    if (!match || !document.documentElement) {
      return;
    }
    document.documentElement.dataset.ptafLastEvent = match[1];
  }

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = function (input) {
      try {
        remember(typeof input === "string" ? input : input && input.url);
      } catch (error) {
        /* ignore */
      }
      return originalFetch.apply(this, arguments);
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      remember(url);
    } catch (error) {
      /* ignore */
    }
    return originalOpen.apply(this, arguments);
  };
})();
