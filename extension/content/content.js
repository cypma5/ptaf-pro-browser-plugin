const BUTTON_ID = "ptaf-bulk-actions-button";
const DIALOG_ID = "ptaf-bulk-dialog";
const TOAST_ID = "ptaf-bulk-toast";
const API_ROOT = "/api/ptaf/v4";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const USER_POLICY_PATH = new RegExp(`/conf-scheme/user_policy/(${UUID})`, "i");
const APPLICATION_POLICY_PATH = new RegExp(
  `/conf-scheme/(?:application_policy|policy)/(${UUID})`,
  "i"
);

let dialogHost = null;
let dialogTarget = null;
let applying = false;
const rulePicker = {
  token: 0,
  key: "",
  rules: [],
  selected: new Set(),
  ready: false,
  loading: false,
};
let syncFrame = 0;
let returnFocus = null;
let domObserver = null;
let themeObserver = null;
let extensionStopped = false;
let detectedTheme = null;
let pluginUserAgentReady = null;

function pluginUrl(url) {
  const value = String(url);
  const hashAt = value.indexOf("#");
  const before = hashAt === -1 ? value : value.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : value.slice(hashAt);
  if (/[?&]ptaf_ext=1(?:&|$)/.test(before)) {
    return value;
  }
  const joiner = before.includes("?") ? "&" : "?";
  return `${before}${joiner}ptaf_ext=1${hash}`;
}

function ensurePluginUserAgent() {
  if (pluginUserAgentReady) {
    return pluginUserAgentReady;
  }
  const attempt = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "ensure-plugin-user-agent" }, (response) => {
        void chrome.runtime.lastError;
        resolve(Boolean(response && response.ok));
      });
    } catch (error) {
      resolve(false);
    }
  });
  pluginUserAgentReady = attempt.then((ok) => {
    if (!ok) {
      pluginUserAgentReady = null;
    }
  });
  return pluginUserAgentReady;
}

function stylesheetUrl() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return null;
    }
    return chrome.runtime.getURL("content/content.css");
  } catch (error) {
    return null;
  }
}

function themeFromText(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const tokens = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let light = false;
  let dark = false;
  for (const token of tokens) {
    if (token === "light" || token === "lighttheme") {
      light = true;
    }
    if (token === "dark" || token === "darktheme") {
      dark = true;
    }
  }
  if (light && !dark) {
    return "light";
  }
  if (dark && !light) {
    return "dark";
  }
  return null;
}

function backgroundLuminance(node) {
  if (!node || node.nodeType !== 1) {
    return null;
  }
  const match = getComputedStyle(node).backgroundColor.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i
  );
  if (!match) {
    return null;
  }
  const alpha = match[4] == null ? 1 : Number(match[4]);
  if (alpha < 0.6) {
    return null;
  }
  const channels = [match[1], match[2], match[3]].map((part) => {
    const scaled = Number(part) / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function namedTheme() {
  const nodes = [document.documentElement, document.body];
  for (const node of nodes) {
    if (!node) {
      continue;
    }
    const scheme = getComputedStyle(node).colorScheme;
    const chunks = [
      node.className,
      node.getAttribute("data-theme"),
      node.getAttribute("data-color-scheme"),
      node.getAttribute("data-kbq-theme"),
      scheme === "light" || scheme === "dark" ? scheme : "",
    ];
    for (const chunk of chunks) {
      const theme = themeFromText(chunk);
      if (theme) {
        return theme;
      }
    }
  }
  return null;
}

function surfaceLuminance() {
  for (const node of [document.body, document.documentElement]) {
    const direct = backgroundLuminance(node);
    if (direct != null) {
      return direct;
    }
  }
  const skip = new Set([BUTTON_ID, DIALOG_ID, TOAST_ID, "ptaf-traffic-open", "ptaf-traffic-dialog", "ptaf-compare-open", "ptaf-compare-dialog", "ptaf-transfer-bar", "ptaf-transfer-download", "ptaf-transfer-dialog", "ptaf-event-view", "ptaf-dash-view"]);
  let node = document.elementFromPoint(
    Math.max(0, Math.floor(window.innerWidth / 2)),
    Math.max(0, Math.floor(window.innerHeight / 2))
  );
  for (let guard = 0; node && guard < 12; guard += 1) {
    if (skip.has(node.id)) {
      node = node.parentElement;
      continue;
    }
    const sampled = backgroundLuminance(node);
    if (sampled != null) {
      return sampled;
    }
    node = node.parentElement;
  }
  return null;
}

function pageTheme() {
  const named = namedTheme();
  if (named) {
    detectedTheme = named;
    return named;
  }
  const luminance = surfaceLuminance();
  if (luminance != null) {
    detectedTheme = luminance > 0.55 ? "light" : "dark";
    return detectedTheme;
  }
  return detectedTheme || "dark";
}

function syncTheme() {
  const theme = pageTheme();
  for (const id of [BUTTON_ID, DIALOG_ID, TOAST_ID, "ptaf-compare-open", "ptaf-compare-dialog", "ptaf-transfer-bar", "ptaf-transfer-download", "ptaf-transfer-dialog", "ptaf-event-view", "ptaf-dash-view"]) {
    const node = document.getElementById(id);
    const root = node && node.shadowRoot && node.shadowRoot.querySelector(".ptaf-theme");
    if (root) {
      root.dataset.theme = theme;
    }
  }
}

function stopExtension() {
  if (extensionStopped) {
    return;
  }
  extensionStopped = true;
  if (syncFrame) {
    cancelAnimationFrame(syncFrame);
    syncFrame = 0;
  }
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  document.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("popstate", scheduleSync);
  for (const id of [BUTTON_ID, DIALOG_ID, TOAST_ID, "ptaf-compare-open", "ptaf-compare-dialog", "ptaf-transfer-bar", "ptaf-transfer-download", "ptaf-transfer-dialog", "ptaf-event-view", "ptaf-dash-view"]) {
    const node = document.getElementById(id);
    if (node) {
      node.remove();
    }
  }
  dialogHost = null;
}

function attachUi(host) {
  const href = stylesheetUrl();
  if (!href) {
    stopExtension();
    return null;
  }
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const theme = document.createElement("div");
  theme.className = "ptaf-theme";
  theme.dataset.theme = pageTheme();
  shadow.append(link, theme);
  return theme;
}

function parseTarget(pathname) {
  const template = pathname.match(USER_POLICY_PATH);
  if (template) {
    return { kind: "template", id: template[1] };
  }
  const policy = pathname.match(APPLICATION_POLICY_PATH);
  if (policy) {
    return { kind: "policy", id: policy[1] };
  }
  return null;
}

const OPERATIONS = [
  {
    id: "add_syslog",
    mode: "bulk",
    bulk: "ADD",
    label: "Добавить Send to syslog",
    listLabel: "Действие",
  },
  {
    id: "remove_syslog",
    mode: "bulk",
    bulk: "DELETE",
    label: "Удалить Send to syslog",
    listLabel: "Действие",
  },
  {
    id: "filter_syslog",
    mode: "filter",
    label: "Добавить или удалить действие выбранных правил",
    listLabel: "Действие",
  },
  {
    id: "replace_log",
    mode: "replace",
    sourceKeys: ["log"],
    targetKey: "log",
    label: "Заменить Log to DB",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
  {
    id: "replace_response",
    mode: "replace",
    sourceKeys: ["custom_response"],
    targetKey: "custom_response",
    label: "Заменить Custom response",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
  {
    id: "replace_rst",
    mode: "replace",
    sourceKeys: ["close", "send_rst"],
    targetKey: "custom_response",
    label: "Заменить Send RST на Custom response",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
];

let actionCatalog = null;

function operationsPath(target) {
  if (target.kind === "template") {
    return `/config/policies/templates/user/${target.id}/rules/operations`;
  }
  return `/config/policies/${target.id}/rules/operations`;
}

function ruleCollections(target) {
  if (target.kind === "template") {
    const root = `/config/policies/templates/user/${target.id}/rules`;
    return [{ listPath: root, detailPath: (id) => `${root}/${id}`, user: false }];
  }
  return [
    {
      listPath: `/config/policies/${target.id}/rules`,
      detailPath: (id) => `/config/policies/${target.id}/rules/${id}`,
      user: false,
    },
    {
      listPath: `/config/policies/${target.id}/user_rules`,
      detailPath: (id) => `/config/policies/${target.id}/user_rules/${id}`,
      user: true,
    },
  ];
}

function getAccessToken() {
  try {
    const stored = JSON.parse(localStorage.getItem("PTAF__AUTHENTICATION") || "{}");
    return stored.data && stored.data.accessToken ? stored.data.accessToken : null;
  } catch (error) {
    return null;
  }
}

function errorMessage(status, body) {
  if (status === 401) {
    return "Session expired. Refresh the page and sign in again.";
  }
  const codes = body && body.errors && body.errors.error_codes;
  if (Array.isArray(codes) && codes.length) {
    return codes.join(", ");
  }
  if (body && body.errors) {
    return JSON.stringify(body.errors);
  }
  return `Request failed (${status})`;
}

async function api(path, options) {
  const token = getAccessToken();
  if (!token) {
    const error = new Error(errorMessage(401));
    error.status = 401;
    throw error;
  }

  await ensurePluginUserAgent();
  const response = await fetch(pluginUrl(API_ROOT + path), {
    method: options && options.method ? options.method : "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Accept-Language": acceptLanguageHeader(),
      Authorization: `Bearer ${token}`,
      ...(options && options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = null;
    }
  }

  if (!response.ok) {
    const error = new Error(errorMessage(response.status, body));
    error.status = response.status;
    throw error;
  }
  return body;
}

function entityName() {
  const header = document.querySelector("ptaf-form-card-header");
  const text = header ? header.textContent.replace(/\s+/g, " ").trim() : "";
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "this policy";
}

function selectedAction(dialog, role) {
  const list = dialog.querySelector(`.ptaf-bulk-list[data-role="${role || "to"}"]`);
  const row = list && list.querySelector('.ptaf-bulk-row[aria-selected="true"]');
  if (!row || !row.dataset.id) {
    return null;
  }
  if (actionCatalog) {
    const known = actionCatalog.actions.find((item) => item.id === row.dataset.id);
    if (known) {
      return known;
    }
  }
  return { id: row.dataset.id, name: row.dataset.name || "" };
}

function selectActionRow(row) {
  const list = row.closest(".ptaf-bulk-list");
  list.querySelectorAll(".ptaf-bulk-row").forEach((item) => {
    item.setAttribute("aria-selected", item === row ? "true" : "false");
  });
  const dialog = row.getRootNode();
  renderRuleRows(dialog);
  updateConfirmation(dialog);
}

function localeCandidates() {
  const values = [];
  const push = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(trimmed)) {
      values.push(trimmed);
    }
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") {
      push(node);
      return;
    }
    Object.values(node).forEach(walk);
  };
  try {
    walk(JSON.parse(localStorage.getItem("PTAF__TRANSLATION") || "null"));
  } catch (error) {
    push(null);
  }
  push(document.documentElement.lang);
  if (navigator.language) {
    push(navigator.language);
    if (navigator.language.toLowerCase().startsWith("ru")) {
      values.push("ru-RU");
    }
    if (navigator.language.toLowerCase().startsWith("en")) {
      values.push("en-US");
    }
  }
  values.push("ru-RU", "en-US");
  return values.filter((value, index) => values.indexOf(value) === index);
}

async function loadTypeCaptions() {
  for (const locale of localeCandidates()) {
    try {
      await ensurePluginUserAgent();
      const response = await fetch(pluginUrl(`/assets/l10n/${locale}/actions.json`), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      if (data && data.types) {
        return data.types;
      }
    } catch (error) {
      continue;
    }
  }
  return {};
}

function canonicalLocale(locale) {
  const lower = String(locale || "").toLowerCase();
  if (lower === "ru" || lower === "ru-ru") {
    return "ru-RU";
  }
  if (lower === "en" || lower === "en-us") {
    return "en-US";
  }
  return locale;
}

function interfaceLocale() {
  try {
    const stored = JSON.parse(localStorage.getItem("PTAF__TRANSLATION") || "null");
    const active = stored && stored.data && stored.data.activeLang;
    if (typeof active === "string" && active.trim()) {
      return canonicalLocale(active.trim());
    }
  } catch (error) {
    return canonicalLocale(localeCandidates()[0] || "ru-RU");
  }
  return canonicalLocale(localeCandidates()[0] || "ru-RU");
}

function preferredLocales() {
  const primary = interfaceLocale();
  const family = primary.slice(0, 2).toLowerCase();
  const values = [primary];
  for (const locale of localeCandidates()) {
    const canonical = canonicalLocale(locale);
    if (canonical.slice(0, 2).toLowerCase() !== family || values.indexOf(canonical) !== -1) {
      continue;
    }
    values.push(canonical);
  }
  return values;
}

function acceptLanguageHeader() {
  const locales = preferredLocales();
  const parts = locales.map((locale, index) => {
    if (index === 0) {
      return locale;
    }
    return `${locale};q=${Math.max(0.1, 0.9 - index * 0.1).toFixed(1)}`;
  });
  if (locales[0] && !locales[0].toLowerCase().startsWith("en")) {
    parts.push("en-US;q=0.5");
  }
  return parts.join(", ");
}

function textFromLocale(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const keys = [];
  for (const locale of preferredLocales()) {
    keys.push(locale, locale.split("-")[0].toLowerCase());
  }
  keys.push("ru-RU", "ru", "en-US", "en", "name");
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return "";
}

async function loadLocaleDocument(fileName) {
  for (const locale of preferredLocales()) {
    try {
      await ensurePluginUserAgent();
      const response = await fetch(pluginUrl(`/assets/l10n/${locale}/${fileName}`), {
        credentials: "same-origin",
      });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.includes("json")) {
        continue;
      }
      const data = await response.json();
      if (data && typeof data === "object") {
        return data;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

function translationIndex(dicts) {
  const map = new Map();
  const walk = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        const text = value.trim();
        if (text && text !== key && !map.has(key)) {
          map.set(key, text);
        }
        continue;
      }
      if (value && typeof value === "object") {
        const named = textFromLocale(value.name || value.title);
        if (named && named !== key && !map.has(key)) {
          map.set(key, named);
        }
        walk(value);
      }
    }
  };
  for (const dict of dicts) {
    walk(dict);
  }
  return map;
}

let translationLocale = "";
let translationLoad = null;
const uiLabels = {
  classes: {
    attack: "Атака",
    weakness: "Уязвимость",
    incident: "Инцидент",
    info: "Информация",
  },
  threats: {
    unset: "Не задана",
    none: "Нет",
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    critical: "Критический",
  },
};

async function loadRuleTranslationsNow() {
  const [ruleSet, policy] = await Promise.all([
    loadLocaleDocument("ruleSet.json"),
    loadLocaleDocument("policy.json"),
  ]);
  if (policy) {
    for (const key of ["attack", "weakness", "incident", "info"]) {
      if (typeof policy[key] === "string" && policy[key].trim()) {
        uiLabels.classes[key] = policy[key].trim();
      }
    }
    const types = policy.severity_types;
    if (types && typeof types === "object") {
      for (const key of ["none", "low", "medium", "high"]) {
        if (typeof types[key] === "string" && types[key].trim()) {
          uiLabels.threats[key] = types[key].trim();
        }
      }
    }
  }
  return translationIndex([ruleSet]);
}

function loadRuleTranslations() {
  const locale = interfaceLocale();
  if (!translationLoad || translationLocale !== locale) {
    translationLocale = locale;
    translationLoad = loadRuleTranslationsNow();
  }
  return translationLoad;
}

function syncFilterLabels(dialog) {
  dialog.querySelectorAll('.ptaf-bulk-attr[data-attr="class"] input').forEach((input) => {
    const label = classLabel(input.value);
    if (label && input.nextSibling) {
      input.nextSibling.textContent = label;
    }
  });
  dialog.querySelectorAll('.ptaf-bulk-attr[data-attr="threat"] input').forEach((input) => {
    const label = threatLabel(input.value);
    if (label && input.nextSibling) {
      input.nextSibling.textContent = label;
    }
  });
}

function displayText(value, index, extraKeys) {
  const raw = textFromLocale(value);
  for (const key of extraKeys || []) {
    const translated = index && typeof key === "string" && index.get(key);
    if (translated) {
      return translated;
    }
  }
  if (raw && index && index.get(raw)) {
    return index.get(raw);
  }
  return raw;
}

function fold(value) {
  return String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function currentOperation(dialog) {
  const menu = dialog.querySelector("#ptaf-bulk-menu");
  const id = menu ? menu.value : OPERATIONS[0].id;
  return OPERATIONS.find((item) => item.id === id) || OPERATIONS[0];
}

function typeOf(action) {
  if (!actionCatalog) {
    return {};
  }
  return actionCatalog.typeById[action.type_id] || {};
}

function typeKey(action) {
  return typeOf(action).key || "";
}

function isRstSource(action) {
  const type = typeOf(action);
  const key = (type.key || "").toLowerCase();
  const name = `${type.name || ""} ${action.name || ""}`.toLowerCase();
  return key === "close" || key === "send_rst" || key.includes("rst") || /send rst|close connection/.test(name);
}

const ACTION_FREE_PHASES = new Set([
  "on_websocket_upstream",
  "on_websocket_downstream",
  "on_icap_check",
]);

const THREAT_OPTIONS = [
  { value: "unset", label: "Не задана" },
  { value: "none", label: "Нет" },
  { value: "low", label: "Низкий" },
  { value: "medium", label: "Средний" },
  { value: "high", label: "Высокий" },
];

const CLASS_OPTIONS = [
  { value: "attack", label: "Атака" },
  { value: "weakness", label: "Уязвимость" },
];

function matchesRole(action, operation, role) {
  const key = typeKey(action);
  if (operation.mode === "bulk") {
    return role === "to" && key === "send_to_syslog";
  }
  if (operation.mode === "filter") {
    return role === "to" && selectableKind(action) !== "";
  }
  if (role === "to" && operation.mode === "replace") {
    return key === operation.targetKey;
  }
  if (role === "from") {
    if (operation.id === "replace_rst") {
      return isRstSource(action);
    }
    return operation.sourceKeys.indexOf(key) !== -1;
  }
  return false;
}

function actionsForRole(operation, role) {
  if (!actionCatalog) {
    return [];
  }
  return actionCatalog.actions.filter((action) => matchesRole(action, operation, role));
}

function actionKind(action) {
  const key = typeKey(action);
  if (key === "log") {
    return "log";
  }
  if (key === "custom_response") {
    return "response";
  }
  if (key === "send_to_syslog") {
    return "syslog";
  }
  if (key === "close" || key === "send_rst" || isRstSource(action)) {
    return "rst";
  }
  return "";
}

function selectableKind(action) {
  const kind = actionKind(action);
  if (kind === "log" || kind === "response" || kind === "rst" || kind === "syslog") {
    return kind;
  }
  return "";
}

function idsOfKind(kind) {
  if (!actionCatalog) {
    return new Set();
  }
  return new Set(actionCatalog.actions.filter((action) => actionKind(action) === kind).map((action) => action.id));
}

function ruleHasKind(rule, kind) {
  const ids = idsOfKind(kind);
  return (rule.actionIds || []).some((id) => ids.has(id));
}

function ruleMatchesOperation(rule, operation) {
  if (operation.id === "replace_rst") {
    return ruleHasKind(rule, "rst");
  }
  if (operation.id === "replace_log") {
    return ruleHasKind(rule, "log");
  }
  if (operation.id === "replace_response") {
    return ruleHasKind(rule, "response");
  }
  return true;
}

function exclusiveIds(action) {
  const kind = actionKind(action);
  if (kind === "log") {
    return idsOfKind("log");
  }
  if (kind === "response" || kind === "rst") {
    const ids = new Set(idsOfKind("response"));
    idsOfKind("rst").forEach((id) => ids.add(id));
    return ids;
  }
  return new Set();
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameSet(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function picksRules(operation) {
  return operation.mode === "filter" || operation.mode === "replace";
}

function pageRuleSearch() {
  const inputs = document.querySelectorAll(".top-panel input");
  for (const input of inputs) {
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();
    if (
      placeholder.includes("назван") ||
      placeholder.includes("груп") ||
      placeholder.includes("правил") ||
      placeholder.includes("group") ||
      placeholder.includes("rule")
    ) {
      return (input.value || "").trim();
    }
  }
  return "";
}

function filterQuery(dialog) {
  const input = dialog.querySelector("#ptaf-bulk-filter");
  return input ? input.value.trim() : "";
}

function filterMode(dialog) {
  const checked = dialog.querySelector('input[name="ptaf-bulk-filter-mode"]:checked');
  return checked && checked.value === "DELETE" ? "DELETE" : "ADD";
}

function confirmationText(dialog) {
  const action = selectedAction(dialog, "to");
  const operation = currentOperation(dialog);
  const name = entityName();
  if (!action) {
    return "";
  }
  if (operation.mode === "replace") {
    const selected = rulePicker.rules.filter((rule) => rulePicker.selected.has(rule.key) && ruleMatchesOperation(rule, operation)).length;
    const what = operation.id === "replace_log"
      ? "Log to DB"
      : operation.id === "replace_response"
        ? "Custom response"
        : "Send TCP RST";
    if (!selected) {
      return `Отметьте правила, в которых ${what} нужно заменить на «${action.name}».`;
    }
    return `Заменить ${what} на «${action.name}» в ${selected} отмеченных правилах «${name}».`;
  }
  if (operation.mode === "filter") {
    const selected = rulePicker.selected.size;
    const verb = filterMode(dialog) === "DELETE" ? "Удалить" : "Добавить";
    if (!selected) {
      return `Отметьте правила, на которые нужно ${verb.toLowerCase()} «${action.name}».`;
    }
    const kind = actionKind(action);
    if (verb === "Удалить") {
      return `Удалить «${action.name}» с ${selected} отмеченных правил «${name}».`;
    }
    if (kind === "log") {
      return `Добавить «${action.name}» на ${selected} отмеченных правилах «${name}», где Log to DB ещё нет.`;
    }
    if (kind === "response" || kind === "rst") {
      return `Добавить «${action.name}» на ${selected} отмеченных правилах «${name}», где ещё нет Custom response и Send TCP RST.`;
    }
    return `Добавить «${action.name}» на ${selected} отмеченных правилах «${name}», где уже есть Log to DB. Без Log to DB Send to syslog не работает.`;
  }
  if (operation.mode === "bulk") {
    if (operation.bulk === "DELETE") {
      return `Удалить «${action.name}» со всех правил «${name}».`;
    }
    return `Добавить «${action.name}» на все правила «${name}» одним запросом.`;
  }
  const source = selectedAction(dialog, "from");
  if (!source) {
    return "";
  }
  if (source.id === action.id) {
    return "Выберите два разных действия.";
  }
  return `На всех правилах «${name}» действие «${source.name}» будет заменено на «${action.name}».`;
}

function setStatus(dialog, message, tone) {
  const status = dialog.querySelector(".ptaf-bulk-status");
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone || "error";
}

function updateConfirmation(dialog) {
  dialog.querySelector(".ptaf-bulk-confirm").textContent = confirmationText(dialog);
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  if (!submit || applying) {
    return;
  }
  const operation = currentOperation(dialog);
  const action = selectedAction(dialog, "to");
  if (operation.mode === "filter") {
    submit.disabled = !action || rulePicker.loading || rulePicker.selected.size === 0;
    return;
  }
  if (operation.mode !== "replace") {
    submit.disabled = !action;
    return;
  }
  const selected = rulePicker.rules.filter((rule) => rulePicker.selected.has(rule.key) && ruleMatchesOperation(rule, operation)).length;
  submit.disabled = !action || rulePicker.loading || selected === 0;
}

function setBusy(dialog, busy) {
  dialog.querySelector(".ptaf-bulk-submit").disabled = busy;
  dialog.querySelector(".ptaf-bulk-cancel").disabled = busy;
  dialog.querySelector("#ptaf-bulk-menu").disabled = busy;
  const filter = dialog.querySelector("#ptaf-bulk-filter");
  if (filter) {
    filter.disabled = busy;
  }
  dialog.querySelectorAll('input[name="ptaf-bulk-filter-mode"], .ptaf-bulk-attr input, .ptaf-bulk-rules input').forEach((input) => {
    input.disabled = busy;
  });
  dialog.querySelectorAll(".ptaf-bulk-link").forEach((button) => {
    button.disabled = busy;
  });
  dialog.querySelectorAll(".ptaf-bulk-row").forEach((row) => {
    row.disabled = busy;
  });
}

function itemsOf(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && Array.isArray(body.items)) {
    return body.items;
  }
  return [];
}

function readActionIds(details) {
  if (details && Array.isArray(details.actions)) {
    return details.actions.slice();
  }
  const configured = details && details.configuration && details.configuration.actions;
  if (Array.isArray(configured)) {
    return configured.slice();
  }
  return [];
}

function replaceIds(current, sourceIds, targetId) {
  if (!current.some((id) => sourceIds.has(id))) {
    return null;
  }
  const next = [];
  const seen = new Set();
  for (const id of current) {
    const value = sourceIds.has(id) ? targetId : id;
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }
  return next;
}

function userRulePatch(details, actions) {
  const configuration = { actions };
  const parameters = details && details.configuration && details.configuration.parameters;
  if (Array.isArray(parameters)) {
    configuration.parameters = parameters;
  }
  return { configuration };
}

function resetRulePicker() {
  rulePicker.token += 1;
  rulePicker.key = "";
  rulePicker.rules = [];
  rulePicker.selected = new Set();
  rulePicker.ready = false;
  rulePicker.loading = false;
}

function closeDialog(options) {
  if (applying) {
    return;
  }
  resetRulePicker();
  dialogTarget = null;
  if (dialogHost) {
    dialogHost.remove();
    dialogHost = null;
  }
  const restore = !options || options.restoreFocus !== false;
  if (restore && returnFocus && returnFocus.isConnected) {
    returnFocus.focus();
  }
  returnFocus = null;
}

function showToast(message) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }
  const host = document.createElement("div");
  host.id = TOAST_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;";
  const shadow = attachUi(host);
  if (!shadow) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = "ptaf-bulk-toast";
  toast.textContent = message;
  shadow.append(toast);
  document.body.appendChild(host);
  window.setTimeout(() => {
    if (host.isConnected) {
      host.remove();
    }
  }, 4000);
}

function actionDescription(action, typeById, captions) {
  const type = typeById[action.type_id];
  const key = type && type.key;
  const caption = key && captions[key];
  return typeof caption === "string" ? caption : "";
}

function fillActionList(list, actions) {
  list.replaceChildren();
  for (const action of actions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ptaf-bulk-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.dataset.id = action.id;
    row.dataset.name = action.name;
    const top = document.createElement("span");
    top.className = "ptaf-bulk-row-top";
    const name = document.createElement("span");
    name.className = "ptaf-bulk-row-name";
    name.textContent = action.name;
    top.append(name);
    if (action.is_system) {
      const mark = document.createElement("span");
      mark.className = "ptaf-bulk-row-mark";
      mark.textContent = "системное";
      top.append(mark);
    }
    row.append(top);
    const description = actionDescription(action, actionCatalog.typeById, actionCatalog.captions);
    if (description) {
      const caption = document.createElement("span");
      caption.className = "ptaf-bulk-row-desc";
      caption.textContent = description;
      row.append(caption);
    }
    row.addEventListener("click", () => selectActionRow(row));
    list.append(row);
  }
}

function renderActionList(dialog) {
  const operation = currentOperation(dialog);
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  const fromField = dialog.querySelector(".ptaf-bulk-from");
  const fromList = dialog.querySelector('.ptaf-bulk-list[data-role="from"]');
  const toList = dialog.querySelector('.ptaf-bulk-list[data-role="to"]');
  const filterField = dialog.querySelector(".ptaf-bulk-filter");
  const panel = dialog.querySelector(".ptaf-bulk-dialog");
  const picking = picksRules(operation);
  const previous = panel.dataset.operation || "";
  const previousOp = OPERATIONS.find((item) => item.id === previous);
  if (previous && previous !== operation.id && ((previousOp && picksRules(previousOp)) || picking)) {
    rulePicker.selected.clear();
  }
  panel.dataset.operation = operation.id;
  panel.classList.toggle("is-replace", false);
  panel.classList.toggle("is-filter", picking);
  panel.classList.toggle("is-replace-rules", operation.mode === "replace");
  fromField.hidden = true;
  if (filterField.hidden && picking) {
    dialog.querySelector("#ptaf-bulk-filter").value = pageRuleSearch();
  }
  filterField.hidden = !picking;
  dialog.querySelector(".ptaf-bulk-arrow").hidden = true;
  dialog.querySelector(".ptaf-bulk-from-label").textContent = operation.fromLabel || "Что меняем";
  dialog.querySelector(".ptaf-bulk-to-label").textContent = operation.mode === "replace"
    ? operation.toLabel
    : operation.listLabel;
  fromList.replaceChildren();
  toList.replaceChildren();

  if (!actionCatalog) {
    submit.disabled = true;
    return;
  }

  const toActions = actionsForRole(operation, "to");
  if (!toActions.length) {
    const empty = operation.id === "replace_log"
      ? "Нет действий Log to DB."
      : operation.id === "replace_response" || operation.id === "replace_rst"
        ? "Нет действий Custom response."
        : operation.mode === "filter"
          ? "Нет действий выбранных типов."
          : "No Send to syslog actions.";
    setStatus(dialog, empty, "error");
    submit.disabled = true;
    updateConfirmation(dialog);
    return;
  }

  fillActionList(toList, toActions);
  selectActionRow(toList.querySelector(".ptaf-bulk-row"));
  submit.disabled = false;
  setStatus(dialog, "", "info");
  if (picking) {
    updateConfirmation(dialog);
    ensureRulePicker(dialog);
  }
}

async function loadActions(dialog) {
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  submit.disabled = true;
  actionCatalog = null;
  setStatus(dialog, "Loading actions...", "info");

  try {
    const [actionsBody, typesBody, captions] = await Promise.all([
      api("/config/actions"),
      api("/config/action_types"),
      loadTypeCaptions(),
    ]);
    if (!dialog.isConnected) {
      return;
    }
    const typeById = {};
    for (const type of itemsOf(typesBody)) {
      typeById[type.id] = type;
    }
    const actions = itemsOf(actionsBody).slice().sort((left, right) => {
      if (left.is_system !== right.is_system) {
        return left.is_system ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });
    actionCatalog = { actions, typeById, captions };
    renderActionList(dialog);
  } catch (error) {
    if (!dialog.isConnected) {
      return;
    }
    setStatus(dialog, error.message || "Failed to load actions.", "error");
  }
}

async function applyBulk(dialog, target, operation, action) {
  if (actionKind(action) !== "syslog") {
    applying = false;
    setBusy(dialog, false);
    updateConfirmation(dialog);
    setStatus(dialog, "Быстрое изменение всех правил работает только для Send to syslog.", "error");
    return;
  }
  setStatus(dialog, "Applying...", "info");
  await api(operationsPath(target), {
    method: "POST",
    body: {
      action_id: action.id,
      type: operation.bulk,
    },
  });
  applying = false;
  closeDialog();
  showToast(operation.bulk === "DELETE" ? "Action removed from all rules." : "Action added to all rules.");
}

function actionsBlockedByPhase(phase) {
  if (!Array.isArray(phase) || !phase.length) {
    return false;
  }
  return phase.every((item) => ACTION_FREE_PHASES.has(item));
}

function ruleHasLogAction(ids) {
  if (!actionCatalog) {
    return false;
  }
  const byId = new Map(actionCatalog.actions.map((item) => [item.id, item]));
  return ids.some((id) => {
    const known = byId.get(id);
    return known && typeKey(known) === "log";
  });
}

function changeActionIds(current, action, mode) {
  const actionId = action.id;
  if (mode === "DELETE") {
    if (current.indexOf(actionId) === -1) {
      return null;
    }
    return current.filter((id) => id !== actionId);
  }
  const drop = exclusiveIds(action);
  const next = [];
  const seen = new Set();
  for (const id of current) {
    if (drop.has(id)) {
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  if (!seen.has(actionId)) {
    next.push(actionId);
  }
  return sameSet(next, current) ? null : next;
}

function replaceExclusive(current, dropIds, targetId) {
  const next = [];
  const seen = new Set();
  let removed = false;
  for (const id of current) {
    if (dropIds.has(id)) {
      removed = true;
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  if (!removed) {
    return null;
  }
  if (!seen.has(targetId)) {
    next.push(targetId);
  }
  return sameSet(next, current) ? null : next;
}

function dropIdsForReplace(operation) {
  if (operation.id === "replace_log") {
    return idsOfKind("log");
  }
  const ids = new Set(idsOfKind("response"));
  idsOfKind("rst").forEach((id) => ids.add(id));
  return ids;
}

function ruleGroupName(rule, groupsById) {
  const nested = [rule.group, rule.rule_group];
  for (const value of nested) {
    if (value && typeof value.name === "string" && value.name) {
      return value.name;
    }
  }
  if (typeof rule.group_name === "string" && rule.group_name) {
    return rule.group_name;
  }
  if (rule.rule_group_id && groupsById[rule.rule_group_id]) {
    return groupsById[rule.rule_group_id];
  }
  return "";
}

function plainActionId(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }
  return "";
}

function threatValue(threat) {
  const raw = textFromLocale(threat).toLowerCase();
  if (!raw) {
    return "unset";
  }
  const aliases = {
    "низкий": "low",
    "средний": "medium",
    "высокий": "high",
    "критический": "critical",
    "нет": "none",
    "отсутствует": "none",
    "не задана": "unset",
  };
  return aliases[raw] || raw;
}

function classValue(value) {
  const raw = textFromLocale(value).toLowerCase();
  if (raw === "attack" || raw === "атака") {
    return "attack";
  }
  if (raw === "weakness" || raw === "vulnerability" || raw === "уязвимость") {
    return "weakness";
  }
  if (raw === "incident" || raw === "инцидент") {
    return "incident";
  }
  if (raw === "info" || raw === "information" || raw === "информация") {
    return "info";
  }
  return raw;
}

function classLabel(value) {
  const key = classValue(value);
  return uiLabels.classes[key] || "";
}

function threatLabel(value) {
  if (uiLabels.threats[value]) {
    return uiLabels.threats[value];
  }
  const fallback = THREAT_OPTIONS.find((item) => item.value === value);
  return fallback ? fallback.label : "";
}

function actionLabel(id) {
  if (!actionCatalog) {
    return id;
  }
  const known = actionCatalog.actions.find((item) => item.id === id);
  if (known && known.name) {
    return known.name;
  }
  return id;
}

function fillAttrBox(dialog, attr, options) {
  const host = dialog.querySelector(`.ptaf-bulk-attr[data-attr="${attr}"]`);
  if (!host) {
    return;
  }
  host.replaceChildren();
  for (const option of options) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option.value;
    input.addEventListener("change", () => renderRuleRows(dialog));
    label.append(input, document.createTextNode(option.label));
    host.append(label);
  }
}

function checkedAttr(dialog, attr) {
  return Array.from(dialog.querySelectorAll(`.ptaf-bulk-attr[data-attr="${attr}"] input:checked`)).map((input) => input.value);
}

function ruleVisible(rule, dialog) {
  if (classValue(rule.eventClass) === "info") {
    return false;
  }
  if (!ruleMatchesOperation(rule, currentOperation(dialog))) {
    return false;
  }
  const query = fold(filterQuery(dialog));
  if (query) {
    const haystack = fold([
      rule.name,
      rule.rawName,
      rule.group,
      rule.rawGroup,
      classLabel(rule.eventClass),
      threatLabel(rule.threat),
    ].join("\n"));
    if (haystack.indexOf(query) === -1) {
      return false;
    }
  }
  const classes = checkedAttr(dialog, "class");
  if (classes.length && classes.indexOf(rule.eventClass) === -1) {
    return false;
  }
  const threats = checkedAttr(dialog, "threat");
  if (threats.length && threats.indexOf(rule.threat) === -1) {
    return false;
  }
  if (!ruleMatchesSelectedAction(rule, dialog)) {
    return false;
  }
  return true;
}

function ruleMatchesSelectedAction(rule, dialog) {
  if (currentOperation(dialog).mode !== "filter") {
    return true;
  }
  const action = selectedAction(dialog, "to");
  if (!action) {
    return true;
  }
  if (filterMode(dialog) === "DELETE") {
    return (rule.actionIds || []).indexOf(action.id) !== -1;
  }
  const kind = actionKind(action);
  if (kind === "log") {
    return !ruleHasKind(rule, "log");
  }
  if (kind === "response" || kind === "rst") {
    return !ruleHasKind(rule, "response") && !ruleHasKind(rule, "rst");
  }
  if (kind === "syslog") {
    return ruleHasKind(rule, "log");
  }
  return true;
}

function updateRuleCount(dialog) {
  const count = dialog.querySelector(".ptaf-bulk-rule-count");
  if (!count) {
    return;
  }
  const visible = rulePicker.rules.filter((rule) => ruleVisible(rule, dialog)).length;
  count.textContent = `Показано ${visible}, отмечено ${rulePicker.selected.size}`;
}

function dropIneligibleActionSelection(dialog) {
  if (currentOperation(dialog).mode !== "filter") {
    return;
  }
  for (const rule of rulePicker.rules) {
    if (!ruleMatchesSelectedAction(rule, dialog)) {
      rulePicker.selected.delete(rule.key);
    }
  }
}

function renderRuleRows(dialog) {
  const host = dialog.querySelector(".ptaf-bulk-rules");
  if (!host) {
    return;
  }
  dropIneligibleActionSelection(dialog);
  host.replaceChildren();
  updateRuleCount(dialog);
  if (!rulePicker.ready) {
    return;
  }
  const visible = rulePicker.rules.filter((rule) => ruleVisible(rule, dialog));
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-bulk-rules-empty";
    const operation = currentOperation(dialog);
    const hasMatch = rulePicker.rules.some((rule) => ruleMatchesOperation(rule, operation) && classValue(rule.eventClass) !== "info");
    if (operation.id === "replace_log" && !hasMatch) {
      empty.textContent = "Нет правил с Log to DB.";
    } else if (operation.id === "replace_response" && !hasMatch) {
      empty.textContent = "Нет правил с Custom response.";
    } else if (operation.id === "replace_rst" && !hasMatch) {
      empty.textContent = "Нет правил с Send TCP RST.";
    } else if (operation.mode === "filter" && filterMode(dialog) === "DELETE" && !rulePicker.rules.some((rule) => {
      const action = selectedAction(dialog, "to");
      return action && classValue(rule.eventClass) !== "info" && (rule.actionIds || []).indexOf(action.id) !== -1;
    })) {
      empty.textContent = "Нет правил с этим действием.";
    } else if (operation.mode === "filter" && filterMode(dialog) === "ADD" && actionKind(selectedAction(dialog, "to")) === "log" && !rulePicker.rules.some((rule) => classValue(rule.eventClass) !== "info" && !ruleHasKind(rule, "log"))) {
      empty.textContent = "Нет правил без Log to DB.";
    } else if (operation.mode === "filter" && filterMode(dialog) === "ADD" && (actionKind(selectedAction(dialog, "to")) === "response" || actionKind(selectedAction(dialog, "to")) === "rst") && !rulePicker.rules.some((rule) => classValue(rule.eventClass) !== "info" && !ruleHasKind(rule, "response") && !ruleHasKind(rule, "rst"))) {
      empty.textContent = "Нет правил без Custom response и Send TCP RST.";
    } else if (operation.mode === "filter" && filterMode(dialog) === "ADD" && actionKind(selectedAction(dialog, "to")) === "syslog" && !rulePicker.rules.some((rule) => classValue(rule.eventClass) !== "info" && ruleHasKind(rule, "log"))) {
      empty.textContent = "Нет правил с Log to DB. Без него Send to syslog не работает.";
    } else {
      empty.textContent = "Нет правил по этому фильтру.";
    }
    host.append(empty);
    return;
  }
  for (const rule of visible) {
    const label = document.createElement("label");
    label.className = "ptaf-bulk-rule";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = rulePicker.selected.has(rule.key);
    input.addEventListener("change", () => {
      if (input.checked) {
        rulePicker.selected.add(rule.key);
      } else {
        rulePicker.selected.delete(rule.key);
      }
      updateRuleCount(dialog);
      updateConfirmation(dialog);
    });
    const text = document.createElement("span");
    text.className = "ptaf-bulk-rule-text";
    const title = document.createElement("span");
    title.className = "ptaf-bulk-rule-name";
    title.textContent = rule.name;
    const meta = document.createElement("span");
    meta.className = "ptaf-bulk-rule-meta";
    const bits = [];
    if (rule.group) {
      bits.push(rule.group);
    }
    const kind = classLabel(rule.eventClass);
    if (kind) {
      bits.push(kind);
    }
    const threat = threatLabel(rule.threat);
    if (threat) {
      bits.push(threat);
    }
    if (rule.user) {
      bits.push("пользовательское");
    }
    meta.textContent = bits.join(" · ");
    const actions = document.createElement("span");
    actions.className = "ptaf-bulk-rule-actions";
    actions.textContent = (rule.actionIds || []).map((id) => actionLabel(id)).join(" · ");
    text.append(title, meta, actions);
    label.append(input, text);
    host.append(label);
  }
}

function selectVisibleRules(dialog, select) {
  for (const rule of rulePicker.rules) {
    if (!ruleVisible(rule, dialog)) {
      continue;
    }
    if (select) {
      rulePicker.selected.add(rule.key);
    } else {
      rulePicker.selected.delete(rule.key);
    }
  }
  renderRuleRows(dialog);
  updateConfirmation(dialog);
}

async function ensureRulePicker(dialog) {
  if (!dialogTarget || !dialog.isConnected) {
    return;
  }
  const key = `${dialogTarget.kind}:${dialogTarget.id}`;
  if (rulePicker.key === key && rulePicker.ready) {
    renderRuleRows(dialog);
    updateConfirmation(dialog);
    return;
  }
  if (rulePicker.key === key && rulePicker.loading) {
    return;
  }
  const token = rulePicker.token + 1;
  rulePicker.token = token;
  rulePicker.key = key;
  rulePicker.loading = true;
  rulePicker.ready = false;
  rulePicker.rules = [];
  rulePicker.selected = new Set();
  renderRuleRows(dialog);
  updateConfirmation(dialog);
  setStatus(dialog, "Чтение правил...", "info");
  try {
    const groupsById = await groupNamesById();
    const translations = await loadRuleTranslations();
    syncFilterLabels(dialog);
    const stubs = [];
    for (const collection of ruleCollections(dialogTarget)) {
      const body = await api(collection.listPath);
      for (const rule of itemsOf(body)) {
        stubs.push({ rule, collection });
      }
    }
    const kept = [];
    let unread = 0;
    for (let index = 0; index < stubs.length; index += 1) {
      if (token !== rulePicker.token || !dialog.isConnected) {
        return;
      }
      setStatus(dialog, `Чтение правил: ${index + 1} из ${stubs.length}.`, "info");
      const stub = stubs[index];
      const listed = stub.rule;
      if (actionsBlockedByPhase(listed.phase) || classValue(listed.event && listed.event.class) === "info") {
        continue;
      }
      let details = null;
      try {
        details = await api(stub.collection.detailPath(listed.id));
      } catch (error) {
        unread += 1;
        continue;
      }
      if (token !== rulePicker.token || !dialog.isConnected) {
        return;
      }
      if (actionsBlockedByPhase(details && details.phase)) {
        continue;
      }
      const actionIds = readActionIds(details).map(plainActionId).filter(Boolean);
      if (!actionIds.length) {
        continue;
      }
      const event = (details && details.event) || listed.event || {};
      if (classValue(event.class) === "info") {
        continue;
      }
      const parameters = details && details.configuration ? details.configuration.parameters : undefined;
      const rawName = textFromLocale((details && details.name) || listed.name) || listed.id;
      const name = displayText((details && details.name) || listed.name, translations, [
        listed.rule_id,
        details && details.rule_id,
      ]) || rawName;
      const rawGroup = ruleGroupName(listed, groupsById) || ruleGroupName(details || {}, groupsById);
      const group = displayText(rawGroup, translations, [rawGroup]) || rawGroup;
      kept.push({
        key: `${stub.collection.user ? "user" : "rule"}:${listed.id}`,
        id: listed.id,
        name,
        rawName,
        group,
        rawGroup,
        threat: threatValue(event.threat),
        eventClass: classValue(event.class),
        user: stub.collection.user,
        detailPath: stub.collection.detailPath(listed.id),
        actionIds,
        parameters: Array.isArray(parameters) ? parameters : undefined,
      });
    }
    if (token !== rulePicker.token || !dialog.isConnected) {
      return;
    }
    kept.sort((left, right) => String(left.name).localeCompare(String(right.name), "ru"));
    rulePicker.rules = kept;
    rulePicker.ready = true;
    rulePicker.loading = false;
    renderRuleRows(dialog);
    updateConfirmation(dialog);
    if (!kept.length) {
      setStatus(dialog, "Нет правил с действиями.", "error");
      return;
    }
    setStatus(dialog, unread ? `Не удалось прочитать правил: ${unread}.` : "", unread ? "error" : "info");
  } catch (error) {
    if (token !== rulePicker.token || !dialog.isConnected) {
      return;
    }
    rulePicker.loading = false;
    rulePicker.ready = false;
    updateConfirmation(dialog);
    setStatus(dialog, error.message || "Не удалось загрузить правила.", "error");
  }
}

async function groupNamesById() {
  try {
    const body = await api("/config/rule_groups");
    const map = {};
    for (const group of itemsOf(body)) {
      if (group && group.id) {
        map[group.id] = group.name || "";
      }
    }
    return map;
  } catch (error) {
    return {};
  }
}

async function applyFiltered(dialog, action, mode) {
  const rules = rulePicker.rules.filter((rule) => rulePicker.selected.has(rule.key) && rule.actionIds.length);
  if (!rules.length) {
    applying = false;
    setBusy(dialog, false);
    updateConfirmation(dialog);
    setStatus(dialog, "Отметьте правила. Записи без действий в список не входят.", "error");
    return;
  }

  let changed = 0;
  let skipped = 0;
  let unchanged = 0;
  let failed = 0;
  const failures = [];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    setStatus(
      dialog,
      `Проверка правил: ${index + 1} из ${rules.length}. Изменено: ${changed}. Пропущено: ${skipped}.`,
      "info"
    );
    try {
      const current = rule.actionIds.slice();
      if (!current.length) {
        skipped += 1;
        continue;
      }
      if (mode === "DELETE" && current.indexOf(action.id) === -1) {
        unchanged += 1;
        continue;
      }
      if (mode === "ADD" && actionKind(action) === "log" && ruleHasLogAction(current)) {
        unchanged += 1;
        continue;
      }
      if (mode === "ADD" && (actionKind(action) === "response" || actionKind(action) === "rst") && (ruleHasKind(rule, "response") || ruleHasKind(rule, "rst"))) {
        unchanged += 1;
        continue;
      }
      if (mode === "ADD" && actionKind(action) === "syslog" && !ruleHasLogAction(current)) {
        skipped += 1;
        continue;
      }
      const next = changeActionIds(current, action, mode);
      if (!next) {
        unchanged += 1;
        continue;
      }
      await api(rule.detailPath, {
        method: "PATCH",
        body: rule.user ? userRulePatch({ configuration: { parameters: rule.parameters } }, next) : { actions: next },
      });
      rule.actionIds = next;
      changed += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 3) {
        failures.push(`${rule.name}: ${error.message}`);
      }
    }
  }

  applying = false;
  const summary = `Изменено: ${changed}. Пропущено: ${skipped}. Не удалось: ${failed}.`;
  if (failed) {
    setBusy(dialog, false);
    updateConfirmation(dialog);
    setStatus(dialog, `${summary} ${failures.join(" ")}`, "error");
    return;
  }
  closeDialog();
  showToast(unchanged ? `${summary} Без изменений: ${unchanged}.` : summary);
}

async function applyKindReplace(dialog, operation, action) {
  const dropIds = dropIdsForReplace(operation);
  const rules = rulePicker.rules.filter((rule) => rulePicker.selected.has(rule.key) && ruleMatchesOperation(rule, operation));
  if (!rules.length) {
    applying = false;
    setBusy(dialog, false);
    updateConfirmation(dialog);
    setStatus(dialog, "Отметьте правила для замены.", "error");
    return;
  }

  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  const failures = [];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    setStatus(dialog, `Проверка правил: ${index + 1} из ${rules.length}. Заменено: ${changed}.`, "info");
    try {
      const next = replaceExclusive(rule.actionIds, dropIds, action.id);
      if (!next) {
        unchanged += 1;
        continue;
      }
      await api(rule.detailPath, {
        method: "PATCH",
        body: rule.user ? userRulePatch({ configuration: { parameters: rule.parameters } }, next) : { actions: next },
      });
      rule.actionIds = next;
      changed += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 3) {
        failures.push(`${rule.name}: ${error.message}`);
      }
    }
  }

  applying = false;
  const summary = `Заменено: ${changed}. Без изменений: ${unchanged}. Не удалось: ${failed}.`;
  if (failed) {
    setBusy(dialog, false);
    updateConfirmation(dialog);
    setStatus(dialog, `${summary} ${failures.join(" ")}`, "error");
    return;
  }
  closeDialog();
  showToast(summary);
}

async function applyReplace(dialog, target, source, action) {
  const sourceIds = new Set([source.id]);
  const rules = [];
  for (const collection of ruleCollections(target)) {
    const body = await api(collection.listPath);
    for (const rule of itemsOf(body)) {
      rules.push({
        id: rule.id,
        name: rule.name || rule.id,
        user: collection.user,
        detailPath: collection.detailPath(rule.id),
      });
    }
  }

  let changed = 0;
  let failed = 0;
  const failures = [];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    setStatus(
      dialog,
      `Checking rules: ${index + 1} of ${rules.length}. Replaced: ${changed}.`,
      "info"
    );
    try {
      const details = await api(rule.detailPath);
      const next = replaceIds(readActionIds(details), sourceIds, action.id);
      if (!next) {
        continue;
      }
      await api(rule.detailPath, {
        method: "PATCH",
        body: rule.user ? userRulePatch(details, next) : { actions: next },
      });
      changed += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 3) {
        failures.push(`${rule.name}: ${error.message}`);
      }
    }
  }

  applying = false;
  if (failed) {
    setBusy(dialog, false);
    const summary = `Replaced in ${changed} of ${rules.length} rules. Failed: ${failed}.`;
    setStatus(dialog, `${summary} ${failures.join(" ")}`, "error");
    return;
  }
  closeDialog();
  showToast(`Replaced the action in ${changed} of ${rules.length} rules.`);
}

async function applyOperation(dialog, target) {
  const operation = currentOperation(dialog);
  const action = selectedAction(dialog, "to");
  const source = operation.mode === "replace" && !picksRules(operation) ? selectedAction(dialog, "from") : null;
  if (!action || applying) {
    return;
  }
  if (source && source.id === action.id) {
    setStatus(dialog, "Выберите два разных действия.", "error");
    return;
  }
  if (picksRules(operation)) {
    const selected = operation.mode === "replace"
      ? rulePicker.rules.filter((rule) => rulePicker.selected.has(rule.key) && ruleMatchesOperation(rule, operation)).length
      : rulePicker.selected.size;
    if (!selected) {
      setStatus(dialog, operation.mode === "replace" ? "Отметьте правила для замены." : "Отметьте правила. Записи без действий в список не входят.", "error");
      return;
    }
  }

  applying = true;
  setBusy(dialog, true);

  try {
    if (operation.mode === "bulk") {
      await applyBulk(dialog, target, operation, action);
    } else if (operation.mode === "replace") {
      await applyKindReplace(dialog, operation, action);
    } else if (operation.mode === "filter") {
      await applyFiltered(dialog, action, filterMode(dialog));
    } else {
      await applyReplace(dialog, target, source, action);
    }
  } catch (error) {
    applying = false;
    if (!dialog.isConnected) {
      return;
    }
    setBusy(dialog, false);
    setStatus(dialog, error.message || "Request failed.", "error");
  }
}

function openDialog(target) {
  if (applying) {
    return;
  }
  const focusTarget = returnFocus;
  closeDialog({ restoreFocus: false });
  returnFocus = focusTarget;
  dialogTarget = target;
  const host = document.createElement("div");
  host.id = DIALOG_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const shadow = attachUi(host);
  if (!shadow) {
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-bulk-backdrop";
  backdrop.innerHTML = `
    <div class="ptaf-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="ptaf-bulk-title" tabindex="-1">
      <div class="ptaf-bulk-main">
        <h2 id="ptaf-bulk-title">Действия для всех правил</h2>
        <p class="ptaf-bulk-warning">Это дополнительный модуль (addon). Компания Positive Technologies его не поддерживает. Используйте на свой страх и риск.</p>
        <p class="ptaf-bulk-entity"></p>
        <div class="ptaf-bulk-field">
          <label for="ptaf-bulk-menu">Операция</label>
          <select id="ptaf-bulk-menu" class="ptaf-bulk-menu"></select>
        </div>
        <div class="ptaf-bulk-field ptaf-bulk-mode">
          <span class="ptaf-bulk-to-label">Режим</span>
          <div class="ptaf-bulk-filter-mode">
            <label><input type="radio" name="ptaf-bulk-filter-mode" value="ADD" checked> Добавить</label>
            <label><input type="radio" name="ptaf-bulk-filter-mode" value="DELETE"> Удалить</label>
          </div>
        </div>
        <div class="ptaf-bulk-field ptaf-bulk-from" hidden>
          <span class="ptaf-bulk-from-label">Что меняем</span>
          <div class="ptaf-bulk-list" data-role="from" role="listbox" aria-label="Что меняем"></div>
        </div>
        <div class="ptaf-bulk-arrow" hidden aria-hidden="true"><span>↓</span></div>
        <div class="ptaf-bulk-field ptaf-bulk-to">
          <span class="ptaf-bulk-to-label">Действие</span>
          <div class="ptaf-bulk-list" data-role="to" role="listbox" aria-label="На что меняем"></div>
        </div>
        <p class="ptaf-bulk-confirm"></p>
        <p class="ptaf-bulk-status" hidden></p>
        <div class="ptaf-bulk-actions">
          <button type="button" class="ptaf-bulk-cancel">Отмена</button>
          <button type="button" class="ptaf-bulk-submit">Применить</button>
        </div>
      </div>
      <div class="ptaf-bulk-field ptaf-bulk-filter" hidden>
        <label for="ptaf-bulk-filter">Поиск</label>
        <input id="ptaf-bulk-filter" class="ptaf-bulk-filter-input" type="text" placeholder="Имя правила или группы" autocomplete="off">
        <span class="ptaf-bulk-filter-caption">Критичность</span>
        <div class="ptaf-bulk-attr" data-attr="threat"></div>
        <span class="ptaf-bulk-filter-caption">Тип</span>
        <div class="ptaf-bulk-attr" data-attr="class"></div>
        <div class="ptaf-bulk-rule-tools">
          <button type="button" class="ptaf-bulk-link" data-rule-select="shown">Выбрать показанные</button>
          <button type="button" class="ptaf-bulk-link" data-rule-select="none">Снять выбор</button>
          <span class="ptaf-bulk-rule-count"></span>
        </div>
        <div class="ptaf-bulk-rules" role="group" aria-label="Правила"></div>
      </div>
    </div>
  `;
  shadow.append(backdrop);

  const menu = shadow.querySelector("#ptaf-bulk-menu");
  for (const operation of OPERATIONS) {
    const option = document.createElement("option");
    option.value = operation.id;
    option.textContent = operation.label;
    menu.append(option);
  }
  shadow.querySelector(".ptaf-bulk-entity").textContent = entityName();
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });
  shadow.querySelector(".ptaf-bulk-cancel").addEventListener("click", closeDialog);
  menu.addEventListener("change", () => {
    if (actionCatalog) {
      renderActionList(shadow);
    }
  });
  shadow.querySelector("#ptaf-bulk-filter").addEventListener("input", () => {
    renderRuleRows(shadow);
    updateConfirmation(shadow);
  });
  shadow.querySelectorAll('input[name="ptaf-bulk-filter-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      renderRuleRows(shadow);
      updateConfirmation(shadow);
    });
  });
  fillAttrBox(shadow, "threat", THREAT_OPTIONS);
  fillAttrBox(shadow, "class", CLASS_OPTIONS);
  loadRuleTranslations().then(() => {
    if (!shadow.isConnected) {
      return;
    }
    syncFilterLabels(shadow);
    if (rulePicker.ready) {
      renderRuleRows(shadow);
    }
  });
  shadow.querySelector('[data-rule-select="shown"]').addEventListener("click", () => selectVisibleRules(shadow, true));
  shadow.querySelector('[data-rule-select="none"]').addEventListener("click", () => {
    rulePicker.selected.clear();
    renderRuleRows(shadow);
    updateConfirmation(shadow);
  });
  shadow.querySelector(".ptaf-bulk-submit").addEventListener("click", () => {
    applyOperation(shadow, target);
  });

  document.body.appendChild(host);
  dialogHost = host;
  shadow.querySelector(".ptaf-bulk-dialog").focus();
  loadActions(shadow);
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    closeDialog();
  }
}

function createButton() {
  const host = document.createElement("div");
  host.id = BUTTON_ID;
  host.style.cssText = "all:initial;display:inline-flex;flex:0 0 auto;margin-right:8px;vertical-align:middle;";
  const shadow = attachUi(host);
  if (!shadow) {
    return null;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-bulk-trigger";
  button.textContent = "Действия для всех правил";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    returnFocus = button;
    const target = parseTarget(location.pathname);
    if (target) {
      openDialog(target);
    }
  });
  shadow.append(button);
  return host;
}

function syncButton() {
  if (extensionStopped || !stylesheetUrl()) {
    stopExtension();
    return;
  }
  syncTheme();
  const target = parseTarget(location.pathname);
  const host = document.querySelector(".top-panel .rules-actions");
  const existing = document.getElementById(BUTTON_ID);

  if (!target || !host) {
    if (existing) {
      existing.remove();
    }
    if (!target) {
      closeDialog();
    }
    return;
  }

  if (existing) {
    if (existing.parentElement !== host) {
      host.prepend(existing);
    }
    return;
  }

  const button = createButton();
  if (button) {
    host.prepend(button);
  }
}

function scheduleSync() {
  if (extensionStopped || syncFrame) {
    return;
  }
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    syncButton();
  });
}

function nodeRelevant(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  if (node.id === BUTTON_ID || node.id === DIALOG_ID || node.id === TOAST_ID) {
    return true;
  }
  return Boolean(
    node.matches(".top-panel, .rules-actions") ||
    node.querySelector(".top-panel .rules-actions, #" + BUTTON_ID)
  );
}

function hookHistory() {
  if (hookHistory.installed) {
    return;
  }
  hookHistory.installed = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedHistory() {
      const result = original.apply(this, arguments);
      scheduleSync();
      return result;
    };
  }
  window.addEventListener("popstate", scheduleSync);
}

function watchTheme() {
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-kbq-theme"],
  };
  themeObserver = new MutationObserver(() => syncTheme());
  themeObserver.observe(document.documentElement, options);
  if (document.body) {
    themeObserver.observe(document.body, options);
  }
}

function watchDom() {
  domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (nodeRelevant(mutation.target)) {
        scheduleSync();
        return;
      }
      for (const node of mutation.addedNodes) {
        if (nodeRelevant(node)) {
          scheduleSync();
          return;
        }
      }
      for (const node of mutation.removedNodes) {
        if (nodeRelevant(node)) {
          scheduleSync();
          return;
        }
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

hookHistory();
document.addEventListener("keydown", onKeyDown);
watchDom();
watchTheme();
scheduleSync();
