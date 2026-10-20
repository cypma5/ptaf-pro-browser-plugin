const CERT_NODE_SELECTOR = [
  "ptaf-ssl-server-certificate-chains-node",
  "ptaf-server-certificate-chains-node",
  "ptaf-ca-certificate-chains-node",
  "ptaf-ssl-certificate-chains-node",
].join(", ");
const CERT_LISTS = [
  "/api/ptaf/v4/config/ssl_certificate_chains",
  "/api/ptaf/v4/config/server_certificate_chains",
  "/api/ptaf/v4/config/ca_certificate_chains",
];
const CERT_SOON_SECONDS = 30 * 24 * 60 * 60;
const CERT_MONTHS = [
  ["january", "января", "январь"],
  ["february", "февраля", "февраль"],
  ["march", "марта", "март"],
  ["april", "апреля", "апрель"],
  ["may", "мая", "май"],
  ["june", "июня", "июнь"],
  ["july", "июля", "июль"],
  ["august", "августа", "август"],
  ["september", "сентября", "сентябрь"],
  ["october", "октября", "октябрь"],
  ["november", "ноября", "ноябрь"],
  ["december", "декабря", "декабрь"],
];

let certChains = [];
let certFetchedAt = 0;
let certLoading = null;
let certFrame = 0;
let certObserver = null;
let certStopped = false;
const certBoundInputs = new Set();

function certContextAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function stopCertificates() {
  if (certStopped) {
    return;
  }
  certStopped = true;
  if (certFrame) {
    cancelAnimationFrame(certFrame);
    certFrame = 0;
  }
  if (certObserver) {
    certObserver.disconnect();
    certObserver = null;
  }
  document.querySelectorAll("[data-ptaf-cert-expiry]").forEach((node) => {
    node.style.removeProperty("color");
    node.style.removeProperty("font-weight");
    delete node.dataset.ptafCertExpiry;
  });
  document.querySelectorAll(".ptaf-cert-attrs, #ptaf-cert-attrs-style").forEach((node) => node.remove());
  certBoundInputs.forEach((textarea) => {
    textarea.removeEventListener("input", scheduleCertificates);
    delete textarea.dataset.ptafCertBound;
  });
  certBoundInputs.clear();
}

function certToken() {
  try {
    const stored = JSON.parse(localStorage.getItem("PTAF__AUTHENTICATION") || "{}");
    return stored.data && stored.data.accessToken ? stored.data.accessToken : null;
  } catch (error) {
    return null;
  }
}

async function certApi(path) {
  const token = certToken();
  if (!token) {
    return null;
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function loadCertChains() {
  const now = Date.now();
  if (certLoading) {
    return certLoading;
  }
  if (certFetchedAt && now - certFetchedAt < 10000) {
    return certChains;
  }
  certLoading = Promise.all(CERT_LISTS.map((path) => certApi(path).catch(() => null))).then((lists) => {
    certChains = lists.flatMap((body) => (body && Array.isArray(body.items) ? body.items : []));
    certFetchedAt = Date.now();
    certLoading = null;
    return certChains;
  });
  return certLoading;
}

function expiresSoon(unix) {
  const seconds = Number(unix);
  if (!Number.isFinite(seconds)) {
    return false;
  }
  return seconds - Date.now() / 1000 < CERT_SOON_SECONDS;
}

function dateMentioned(unix, text) {
  const seconds = Number(unix);
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(seconds) || Number.isNaN(date.getTime()) || !text) {
    return false;
  }
  const raw = text.toLowerCase();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const months = CERT_MONTHS[date.getMonth()];
  const dayPattern = new RegExp("(?:^|\\D)" + day + "(?:\\D|$)");
  if (raw.includes(String(year)) && months.some((name) => raw.includes(name)) && dayPattern.test(raw)) {
    return true;
  }
  const pad = (value) => String(value).padStart(2, "0");
  return [
    day + "." + month + "." + year,
    pad(day) + "." + pad(month) + "." + year,
    day + "/" + month + "/" + year,
    pad(day) + "/" + pad(month) + "/" + year,
    year + "-" + pad(month) + "-" + pad(day),
  ].some((token) => raw.includes(token));
}

function paintExpiry(paragraph, soon) {
  if (soon) {
    paragraph.dataset.ptafCertExpiry = "1";
    paragraph.style.setProperty("color", "#ff4d4f", "important");
    paragraph.style.setProperty("font-weight", "600", "important");
    return;
  }
  if (paragraph.dataset.ptafCertExpiry) {
    paragraph.style.removeProperty("color");
    paragraph.style.removeProperty("font-weight");
    delete paragraph.dataset.ptafCertExpiry;
  }
}

function paintCertificates() {
  const soon = certChains.filter((item) => expiresSoon(item.not_valid_after));
  document.querySelectorAll(CERT_NODE_SELECTOR).forEach((node) => {
    node.querySelectorAll(".item-params p").forEach((paragraph) => {
      const text = paragraph.textContent || "";
      const match = soon.some((item) => dateMentioned(item.not_valid_after, text));
      paintExpiry(paragraph, match);
    });
  });
}

function ensureCertStyle() {
  if (document.getElementById("ptaf-cert-attrs-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "ptaf-cert-attrs-style";
  style.textContent = [
    ".ptaf-cert-attrs{box-sizing:border-box;display:block;width:100%;margin:8px 0 0;padding:0;border:0;background:transparent;color:inherit;font:inherit;white-space:normal;text-align:left;}",
    ".ptaf-cert-attrs h3{margin:10px 0 2px;font-size:13px;font-weight:600;line-height:18px;text-align:left;}",
    ".ptaf-cert-attrs .ptaf-cert-row,.ptaf-cert-attrs .ptaf-cert-row-long{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:2px;margin:0;padding:8px 0;font-weight:400;line-height:18px;text-align:left;}",
    ".ptaf-cert-attrs .ptaf-cert-row span,.ptaf-cert-attrs .ptaf-cert-row-long span{flex:none;width:auto;max-width:100%;text-align:left;overflow-wrap:anywhere;}",
    ".ptaf-cert-attrs .ptaf-cert-row span:first-child{opacity:.72;}",
    ".item-params > .ptaf-cert-row{white-space:normal;}",
  ].join("");
  document.documentElement.append(style);
}

function ensureAttrPanel(host) {
  let panel = host.querySelector(":scope > .ptaf-cert-attrs");
  if (panel) {
    return panel;
  }
  panel = document.createElement("div");
  panel.className = "ptaf-cert-attrs";
  host.append(panel);
  return panel;
}

function formatCertDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const pad = (value) => String(value).padStart(2, "0");
  return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear() + ", " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function certRows(certificate) {
  if (certificate.error) {
    return [["Ошибка", certificate.error]];
  }
  const rows = [
    ["Субъект", certificate.subject],
    ["Издатель", certificate.issuer],
    ["Серийный номер", certificate.serial],
    ["Действителен с", formatCertDate(certificate.notBefore)],
    ["Действителен до", formatCertDate(certificate.notAfter)],
    ["Алгоритм подписи", certificate.signature],
    ["Открытый ключ", certificate.publicKey],
  ];
  if (certificate.san && certificate.san.length) {
    rows.push(["Дополнительные имена", certificate.san.join(", ")]);
  }
  if (certificate.keyUsage && certificate.keyUsage.length) {
    rows.push(["Использование ключа", certificate.keyUsage.join(", ")]);
  }
  if (certificate.extendedKeyUsage && certificate.extendedKeyUsage.length) {
    rows.push(["Расширенное использование", certificate.extendedKeyUsage.join(", ")]);
  }
  if (certificate.basicConstraints) {
    rows.push(["Ограничения", certificate.basicConstraints]);
  }
  rows.push(["Отпечаток SHA-256", certificate.fingerprint]);
  return rows.filter((row) => row[1]);
}

function certSignature(parsed) {
  return JSON.stringify({
    privateKeys: parsed.privateKeys,
    certificates: parsed.certificates.map((certificate) => ({
      ...certificate,
      notBefore: certificate.notBefore instanceof Date ? certificate.notBefore.toISOString() : certificate.notBefore,
      notAfter: certificate.notAfter instanceof Date ? certificate.notAfter.toISOString() : certificate.notAfter,
    })),
  });
}

function addCertRow(panel, label, value) {
  const row = document.createElement("div");
  const longValue = String(value).length > 48;
  row.className = longValue ? "ptaf-cert-row ptaf-cert-row-long" : "ptaf-cert-row";
  const name = document.createElement("span");
  name.textContent = label;
  const text = document.createElement("span");
  text.textContent = value;
  row.append(name, text);
  panel.append(row);
}

function paramSample(host) {
  return [...host.children].find((child) => child.tagName === "P" && !child.classList.contains("ptaf-cert-row"));
}

function setClonedRowText(row, label, value) {
  const leaves = [...row.querySelectorAll("span, div")].filter((element) => {
    return ![...element.children].some((child) => child.tagName === "SPAN" || child.tagName === "DIV");
  });
  if (leaves.length >= 2) {
    leaves[0].textContent = label;
    leaves[leaves.length - 1].textContent = value;
    return;
  }
  const texts = [];
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.trim()) {
      texts.push(walker.currentNode);
    }
  }
  if (texts.length >= 2) {
    texts[0].textContent = label;
    texts[texts.length - 1].textContent = value;
    return;
  }
  row.textContent = "";
  const name = document.createElement("span");
  name.textContent = label;
  const text = document.createElement("span");
  text.textContent = value;
  row.append(name, text);
}

function clonedParamRow(sample, label, value) {
  const row = sample.cloneNode(true);
  row.removeAttribute("id");
  row.classList.add("ptaf-cert-row");
  setClonedRowText(row, label, value);
  return row;
}

function renderItemParams(host, parsed) {
  const signature = certSignature(parsed) + ":params";
  const sample = paramSample(host);
  if (!sample) {
    return false;
  }
  if (!parsed.certificates.length) {
    host.querySelectorAll(":scope > .ptaf-cert-row, :scope > .ptaf-cert-attrs").forEach((node) => node.remove());
    delete host.dataset.ptafCertSignature;
    return true;
  }
  if (host.dataset.ptafCertSignature === signature && host.querySelector(":scope > .ptaf-cert-row")) {
    return true;
  }
  host.dataset.ptafCertSignature = signature;
  host.querySelectorAll(":scope > .ptaf-cert-row, :scope > .ptaf-cert-attrs").forEach((node) => node.remove());
  const rows = [];
  parsed.certificates.forEach((certificate, index) => {
    if (parsed.certificates.length > 1) {
      const cn = String(certificate.subject || "").match(/(?:^|,\s*)CN=([^,]+)/);
      rows.push(["Сертификат " + (index + 1) + (cn ? ": " + cn[1] : ""), ""]);
    }
    certRows(certificate).forEach((row) => rows.push(row));
  });
  if (!rows.length) {
    rows.push(["Сертификат", "не удалось разобрать"]);
  }
  rows.forEach((row) => host.append(clonedParamRow(sample, row[0], row[1])));
  return true;
}

function fillAttrPanel(panel, parsed, options) {
  const hideKeyNote = options && options.hideKeyNote;
  panel.replaceChildren();
  if (parsed.privateKeys && !hideKeyNote) {
    addCertRow(panel, "Закрытый ключ", "есть в данных, содержимое скрыто");
  }
  parsed.certificates.forEach((certificate, index) => {
    if (parsed.certificates.length > 1) {
      const title = document.createElement("h3");
      const cn = String(certificate.subject || "").match(/(?:^|,\s*)CN=([^,]+)/);
      title.textContent = "Сертификат " + (index + 1) + (cn ? ": " + cn[1] : "");
      panel.append(title);
    }
    certRows(certificate).forEach((row) => addCertRow(panel, row[0], row[1]));
  });
  if (!parsed.certificates.length && !parsed.privateKeys) {
    addCertRow(panel, "Сертификат", "не удалось разобрать");
  }
}

function renderParsed(host, parsed, options) {
  if (host.classList.contains("item-params") && renderItemParams(host, parsed)) {
    return;
  }
  const hideKeyNote = Boolean(options && options.hideKeyNote);
  const panel = host.querySelector(":scope > .ptaf-cert-attrs");
  if (!parsed.certificates.length && !parsed.privateKeys) {
    if (panel) {
      panel.remove();
    }
    return;
  }
  ensureCertStyle();
  const next = ensureAttrPanel(host);
  const signature = certSignature(parsed) + (hideKeyNote ? ":node" : ":field");
  if (next.dataset.signature === signature) {
    return;
  }
  next.dataset.signature = signature;
  fillAttrPanel(next, parsed, { hideKeyNote });
}

function renderMaterial(host, material, options) {
  const text = String(material || "").trim();
  const parsed = parseCertificateMaterial(text);
  if (!parsed.certificates.length && !parsed.privateKeys) {
    if (text.length < 40) {
      const panel = host.querySelector(":scope > .ptaf-cert-attrs");
      if (panel) {
        panel.remove();
      }
      return;
    }
    renderParsed(host, { certificates: [{ error: "Не удалось разобрать сертификат" }], privateKeys: 0 }, options);
    return;
  }
  renderParsed(host, parsed, options);
}

function headerText(node) {
  const header = node.querySelector(".item.expandable > .content, .item > .content");
  if (!header) {
    return "";
  }
  return [...header.childNodes].filter((child) => {
    return !(child.nodeType === 1 && child.classList.contains("ptaf-cert-attrs"));
  }).map((child) => child.textContent || "").join(" ").replace(/\s+/g, " ").trim();
}

function chainForTitle(title) {
  const normalized = String(title || "").replace(/\s+/g, " ").trim();
  let best = null;
  let score = 0;
  certChains.forEach((item) => {
    const name = String(item.name || "").trim();
    if (name.length < 2) {
      return;
    }
    const matched = normalized === name || normalized.startsWith(name + " ");
    if (matched && name.length > score) {
      best = item;
      score = name.length;
    }
  });
  return best;
}

function expiryHint(host) {
  const text = [...host.children].filter((child) => {
    return !child.classList.contains("ptaf-cert-row") && !child.classList.contains("ptaf-cert-attrs");
  }).map((child) => child.innerText || child.textContent || "").join("\n");
  const months = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };
  const russian = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i);
  if (russian) {
    return { day: Number(russian[1]), month: months[russian[2].toLowerCase()], year: Number(russian[3]) };
  }
  const english = text.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s*(\d{4})/i);
  if (english) {
    return { day: Number(english[2]), month: months[english[1].toLowerCase()], year: Number(english[3]) };
  }
  return null;
}

function sameLocalDay(date, hint) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getFullYear() === hint.year && date.getMonth() === hint.month && date.getDate() === hint.day;
}

function certificatesForHint(certificates, hint) {
  if (!hint) {
    return certificates;
  }
  const matched = certificates.filter((certificate) => sameLocalDay(certificate.notAfter, hint));
  return matched.length ? matched : certificates;
}

function chainByExpiry(hint) {
  if (!hint) {
    return null;
  }
  return certChains.find((item) => {
    if (!item.chain_data) {
      return false;
    }
    return certificatesForHint(parseCertificateMaterial(item.chain_data).certificates, hint).some((certificate) => sameLocalDay(certificate.notAfter, hint));
  }) || null;
}

function chainForNode(node) {
  return chainForTitle(headerText(node));
}

function restoreCertHeaders(node) {
  node.querySelectorAll(".content").forEach((content) => {
    content.querySelectorAll(":scope > .ptaf-cert-attrs").forEach((panel) => panel.remove());
    content.style.overflow = "";
    content.style.height = "";
    content.style.maxHeight = "";
    content.style.flexWrap = "";
    content.style.whiteSpace = "";
  });
}

function sectionCertificates(parsed, index, total) {
  if (total <= 1) {
    return parsed;
  }
  const certificate = parsed.certificates[index];
  return certificate ? { certificates: [certificate], privateKeys: 0 } : { certificates: [], privateKeys: 0 };
}

function paintChainNodes() {
  document.querySelectorAll(CERT_NODE_SELECTOR).forEach((node) => {
    restoreCertHeaders(node);
    const chain = chainForNode(node);
    if (!chain || !chain.chain_data) {
      return;
    }
    const params = [...node.querySelectorAll("div.item-params")].filter((item) => item.closest(CERT_NODE_SELECTOR) === node);
    if (!params.length) {
      return;
    }
    params.forEach((host, index) => {
      const hint = expiryHint(host);
      const named = parseCertificateMaterial(chain.chain_data);
      const namedMatch = certificatesForHint(named.certificates, hint);
      const useNamed = !hint || namedMatch.some((certificate) => sameLocalDay(certificate.notAfter, hint));
      const source = useNamed ? chain : (chainByExpiry(hint) || chain);
      const parsed = source === chain ? named : parseCertificateMaterial(source.chain_data);
      const certificates = certificatesForHint(parsed.certificates, hint);
      const section = sectionCertificates({ certificates, privateKeys: parsed.privateKeys }, index, params.length);
      renderParsed(host, section, { hideKeyNote: true });
    });
  });
}

function paintChainFields() {
  document.querySelectorAll("ptaf-ddf-core-field.field-chain-data textarea, ptaf-key-upload-wrapper textarea").forEach((textarea) => {
    if (!textarea.dataset.ptafCertBound) {
      textarea.dataset.ptafCertBound = "1";
      textarea.addEventListener("input", scheduleCertificates);
      certBoundInputs.add(textarea);
    }
    const host = textarea.closest("ptaf-ddf-core-field") || textarea.closest("ptaf-key-upload-wrapper");
    if (host) {
      renderMaterial(host, textarea.value);
    }
  });
}

function scheduleCertificates() {
  if (certStopped || certFrame) {
    return;
  }
  certFrame = requestAnimationFrame(() => {
    certFrame = 0;
    syncCertificates();
  });
}

async function syncCertificates() {
  if (certStopped || !certContextAlive()) {
    stopCertificates();
    return;
  }
  const hasNodes = Boolean(document.querySelector(CERT_NODE_SELECTOR));
  const hasField = Boolean(document.querySelector("ptaf-ddf-core-field.field-chain-data textarea, ptaf-key-upload-wrapper textarea"));
  if (!hasNodes && !hasField) {
    return;
  }
  if (hasNodes) {
    try {
      await loadCertChains();
    } catch (error) {
      certChains = certChains || [];
    }
  }
  if (certStopped) {
    return;
  }
  if (hasNodes) {
    paintCertificates();
    paintChainNodes();
  }
  paintChainFields();
}

function watchCertificates() {
  certObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target && target.closest && target.closest(".ptaf-cert-attrs, #ptaf-cert-attrs-style")) {
        continue;
      }
      scheduleCertificates();
      return;
    }
  });
  certObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

watchCertificates();
scheduleCertificates();
