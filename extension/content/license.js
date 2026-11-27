// 1 Mbps = 10 RPS: 100 Mbps → 1 000 RPS, 1 Gbps → 10 000 RPS.
const LICENSE_RPS_PER_MBPS = 10;
const LICENSE_MBPS = {
  k: 0.001,
  m: 1,
  g: 1000,
  t: 1000000,
  к: 0.001,
  м: 1,
  г: 1000,
  т: 1000000,
};

let licenseEnabled = true;
let licenseFrame = 0;
let licenseObserver = null;
let licenseStopped = false;

function licenseAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function licensePlain(node) {
  const copy = node.cloneNode(true);
  copy.querySelectorAll(".ptaf-license-note").forEach((item) => item.remove());
  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

function licenseKind(label) {
  const text = String(label || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (/bandwidth|пропускн/.test(text)) {
    return "bandwidth";
  }
  if (/extra nodes|дополнительн[а-яё]*\s+узл|доп\.?\s*узл/.test(text)) {
    return "extra";
  }
  return "";
}

function licenseMbps(text) {
  // ru-RU writes the unit as "Мбит/c" with a Latin c.
  const match = String(text || "").match(
    /^(\d+(?:[.,]\d+)?)\s*([kmgtкмгт])(?:bps|b\/s|bit\/s|бит\/[сc](?:ек)?)$/i
  );
  if (!match) {
    return null;
  }
  const amount = Number(match[1].replace(",", "."));
  const scale = LICENSE_MBPS[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || amount < 0 || scale == null) {
    return null;
  }
  return amount * scale;
}

function licenseRps(mbps) {
  const rps = mbps * LICENSE_RPS_PER_MBPS;
  const rounded = Math.abs(rps - Math.round(rps)) < 1e-6 ? Math.round(rps) : rps;
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(rounded);
  return formatted + " RPS";
}

function licenseZero(text) {
  return /^(?:0+|0+[.,]0+)$/.test(String(text || "").trim());
}

function paintLicense(node, source, note) {
  let span = node.querySelector(":scope > .ptaf-license-note");
  if (!note) {
    if (span) {
      span.remove();
    }
    delete node.dataset.ptafLicenseSrc;
    return;
  }
  if (span && node.dataset.ptafLicenseSrc === source && span.textContent === note) {
    return;
  }
  if (!span) {
    span = document.createElement("span");
    span.className = "ptaf-license-note";
    span.style.whiteSpace = "nowrap";
    node.append(span);
  }
  span.textContent = note;
  node.dataset.ptafLicenseSrc = source;
}

function clearLicense() {
  document.querySelectorAll(".ptaf-license-note").forEach((span) => span.remove());
  document.querySelectorAll("[data-ptaf-license-src]").forEach((node) => {
    delete node.dataset.ptafLicenseSrc;
  });
}

function syncLicense() {
  if (licenseStopped || !licenseAlive()) {
    stopLicense();
    return;
  }
  if (!licenseEnabled) {
    clearLicense();
    return;
  }
  const seen = new Set();
  document.querySelectorAll("h4").forEach((heading) => {
    const kind = licenseKind(heading.textContent || "");
    if (!kind) {
      return;
    }
    const value = heading.nextElementSibling;
    if (!value || value.tagName !== "P") {
      return;
    }
    seen.add(value);
    const source = licensePlain(value);
    if (kind === "bandwidth") {
      const mbps = licenseMbps(source);
      paintLicense(value, source, mbps == null ? "" : " · " + licenseRps(mbps));
      return;
    }
    paintLicense(value, source, licenseZero(source) ? " · без ограничений" : "");
  });
  document.querySelectorAll(".ptaf-license-note").forEach((span) => {
    if (!seen.has(span.parentElement)) {
      span.remove();
    }
  });
}

function scheduleLicense() {
  if (licenseStopped || licenseFrame) {
    return;
  }
  licenseFrame = requestAnimationFrame(() => {
    licenseFrame = 0;
    syncLicense();
  });
}

function stopLicense() {
  licenseStopped = true;
  if (licenseObserver) {
    licenseObserver.disconnect();
    licenseObserver = null;
  }
  clearLicense();
}

function licenseRelevant(node) {
  const element = node && node.nodeType === 1 ? node : node && node.parentElement;
  if (!element || !element.closest) {
    return false;
  }
  if (element.closest(".ptaf-license-note")) {
    return false;
  }
  return Boolean(element.closest("ptaf-help, .form-fields"));
}

function watchLicense() {
  licenseObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (licenseRelevant(mutation.target)) {
        scheduleLicense();
        return;
      }
      for (const node of mutation.addedNodes) {
        if (licenseRelevant(node)) {
          scheduleLicense();
          return;
        }
        if (node.nodeType === 1 && node.querySelector && node.querySelector("ptaf-help, .form-fields")) {
          scheduleLicense();
          return;
        }
      }
    }
  });
  licenseObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

if (typeof pluginSetting === "function") {
  pluginSetting("licenseParams", true, (enabled) => {
    licenseEnabled = enabled;
    if (enabled) {
      scheduleLicense();
    } else {
      clearLicense();
    }
  });
}
watchLicense();
scheduleLicense();
