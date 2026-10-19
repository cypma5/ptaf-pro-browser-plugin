const TRAFFIC_BUTTON_ID = "ptaf-traffic-open";
const TRAFFIC_DIALOG_ID = "ptaf-traffic-dialog";
const TRAFFIC_API = "/api/ptaf/v4/config/traffic_settings";

const TRAFFIC_FIELDS = [
  {
    title: "Веб-приложения",
    fields: [
      { key: "max_applications_count", label: "Максимум веб-приложений", kind: "integer", max: 30 },
      { key: "core_nginx_client_max_body_size", label: "Максимальный размер тела запроса", kind: "string" },
    ],
  },
  {
    title: "Трафик",
    fields: [
      {
        key: "core_nginx_host_header_mode",
        label: "Заголовок Host",
        kind: "enum",
        options: ["host_listen_port", "only_host", "origin_host", "legacy"],
      },
      { key: "envoy_preserve_headers_case", label: "Сохранять регистр заголовков", kind: "boolean" },
    ],
  },
  {
    title: "Буферы nginx",
    fields: [
      { key: "core_nginx_proxy_buffers", label: "Буферы ответа прокси", kind: "string" },
      { key: "core_nginx_proxy_buffer_size", label: "Буфер заголовков ответа", kind: "string" },
      { key: "core_nginx_proxy_busy_buffers_size", label: "Занятые буферы ответа", kind: "string" },
      { key: "core_nginx_client_body_buffer_size", label: "Буфер тела запроса", kind: "string" },
      { key: "core_nginx_client_header_buffer_size", label: "Буфер заголовка запроса", kind: "string" },
      { key: "core_nginx_large_client_header_buffers", label: "Буферы большого заголовка", kind: "string" },
    ],
  },
  {
    title: "Буферы Envoy",
    fields: [
      { key: "envoy_per_connection_buffer_limit_bytes", label: "Лимит буфера соединения, байт", kind: "integer" },
    ],
  },
  {
    title: "Таймауты nginx",
    fields: [
      { key: "core_nginx_proxy_read_timeout", label: "Чтение ответа прокси", kind: "string" },
      { key: "core_nginx_proxy_send_timeout", label: "Передача запроса прокси", kind: "string" },
      { key: "core_nginx_send_timeout", label: "Передача ответа клиенту", kind: "string" },
      { key: "core_nginx_keepalive_timeout", label: "Keepalive клиента", kind: "string" },
      { key: "core_nginx_proxy_connect_timeout", label: "Соединение с прокси", kind: "string" },
      { key: "core_nginx_worker_shutdown_timeout", label: "Остановка рабочих процессов", kind: "string" },
      { key: "core_nginx_client_body_timeout", label: "Чтение тела запроса", kind: "string" },
      { key: "core_nginx_client_header_timeout", label: "Чтение заголовка запроса", kind: "string" },
      { key: "core_nginx_resolver_timeout", label: "Преобразование имени", kind: "string" },
    ],
  },
  {
    title: "Таймауты Envoy",
    fields: [
      { key: "core_envoy_listener_route_idle_timeout", label: "Простой маршрута", kind: "string" },
      { key: "core_envoy_listener_stream_idle_timeout", label: "Простой потока", kind: "string" },
      { key: "core_envoy_listener_idle_timeout", label: "Соединение без запросов", kind: "string" },
      { key: "core_envoy_cluster_connect_timeout", label: "Подключение к узлу", kind: "string" },
      { key: "core_envoy_cluster_query_timeout_seconds", label: "Ответ узла, секунды", kind: "integer" },
      { key: "core_envoy_listener_request_headers_timeout", label: "Заголовки запроса", kind: "string" },
      { key: "core_envoy_listener_route_timeout", label: "Ответ ядра Envoy", kind: "string" },
    ],
  },
  {
    title: "Журналы nginx",
    fields: [
      { key: "core_nginx_access_log", label: "Писать access.log", kind: "boolean" },
      { key: "core_nginx_access_log_format", label: "Формат access.log", kind: "string" },
      { key: "core_nginx_access_log_path", label: "Куда писать access.log", kind: "string" },
      { key: "core_nginx_error_log_enabled", label: "Писать error.log", kind: "boolean" },
      { key: "core_nginx_error_log_endpoints", label: "Точки error.log, по одной на строку", kind: "array" },
    ],
  },
  {
    title: "Журналы Envoy",
    fields: [
      { key: "core_envoy_access_log_enabled", label: "Писать access.log", kind: "boolean" },
      { key: "core_envoy_access_log_format", label: "Формат access.log", kind: "string" },
      { key: "core_envoy_error_log_format", label: "Формат error.log", kind: "string" },
    ],
  },
  {
    title: "Уровень журналирования",
    fields: [
      { key: "core_nginx_log_level", label: "nginx", kind: "enum", options: ["error", "info", "debug", "warn"] },
      {
        key: "core_envoy_log_level",
        label: "Envoy",
        kind: "enum",
        options: ["trace", "debug", "info", "warn", "error", "critical", "off"],
      },
      {
        key: "core_ptaf_log_level",
        label: "Ядро PT AF",
        kind: "enum",
        options: ["trace", "debug", "info", "warning", "error", "fatal", "crit"],
      },
      {
        key: "envoy_proxy_log_level",
        label: "Envoy за внешним балансировщиком",
        kind: "enum",
        options: ["trace", "debug", "info", "warn", "error", "critical", "off"],
      },
    ],
  },
];

let trafficDialog = null;
let trafficSaving = false;
let trafficFrame = 0;
let trafficObserver = null;
let trafficThemeObserver = null;
let trafficStopped = false;
let trafficDetectedTheme = null;
const LOCKED_LOG_KEYS = new Set([
  "core_nginx_access_log",
  "core_nginx_access_log_format",
  "core_nginx_access_log_path",
  "core_nginx_error_log_enabled",
  "core_nginx_error_log_endpoints",
  "core_envoy_access_log_enabled",
  "core_envoy_access_log_format",
  "core_envoy_error_log_format",
  "core_nginx_log_level",
  "core_envoy_log_level",
]);

let trafficOriginal = null;
let trafficDraft = null;
let trafficLogsLocked = false;

function versionParts(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(parts, target) {
  if (!parts) {
    return false;
  }
  for (let index = 0; index < target.length; index += 1) {
    const current = parts[index] || 0;
    if (current > target[index]) {
      return true;
    }
    if (current < target[index]) {
      return false;
    }
  }
  return true;
}

function productVersion(body) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (typeof value === "string") {
        found.push({ name: key.toLowerCase(), value });
      } else {
        walk(value);
      }
    });
  };
  walk(body);
  for (const name of ["ptaf_deploy", "infra", "version"]) {
    const item = found.find((entry) => entry.name === name);
    const parts = item && versionParts(item.value);
    if (parts) {
      return parts;
    }
  }
  return null;
}

function trafficStylesheet() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return null;
    }
    return chrome.runtime.getURL("content/content.css");
  } catch (error) {
    return null;
  }
}

function trafficThemeFromText(value) {
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

function trafficBackgroundLuminance(node) {
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

function trafficPageTheme() {
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
      const named = trafficThemeFromText(chunk);
      if (named) {
        trafficDetectedTheme = named;
        return named;
      }
    }
  }
  for (const node of [document.body, document.documentElement]) {
    const direct = trafficBackgroundLuminance(node);
    if (direct != null) {
      trafficDetectedTheme = direct > 0.55 ? "light" : "dark";
      return trafficDetectedTheme;
    }
  }
  const skip = new Set(["ptaf-bulk-actions-button", "ptaf-bulk-dialog", "ptaf-bulk-toast", TRAFFIC_BUTTON_ID, TRAFFIC_DIALOG_ID]);
  let node = document.elementFromPoint(
    Math.max(0, Math.floor(window.innerWidth / 2)),
    Math.max(0, Math.floor(window.innerHeight / 2))
  );
  for (let guard = 0; node && guard < 12; guard += 1) {
    if (skip.has(node.id)) {
      node = node.parentElement;
      continue;
    }
    const sampled = trafficBackgroundLuminance(node);
    if (sampled != null) {
      trafficDetectedTheme = sampled > 0.55 ? "light" : "dark";
      return trafficDetectedTheme;
    }
    node = node.parentElement;
  }
  return trafficDetectedTheme || "dark";
}

function syncTrafficTheme() {
  const theme = trafficPageTheme();
  for (const id of [TRAFFIC_BUTTON_ID, TRAFFIC_DIALOG_ID]) {
    const node = document.getElementById(id);
    const root = node && node.shadowRoot && node.shadowRoot.querySelector(".ptaf-theme");
    if (root) {
      root.dataset.theme = theme;
    }
  }
}

function stopTraffic() {
  if (trafficStopped) {
    return;
  }
  trafficStopped = true;
  if (trafficFrame) {
    cancelAnimationFrame(trafficFrame);
    trafficFrame = 0;
  }
  if (trafficObserver) {
    trafficObserver.disconnect();
    trafficObserver = null;
  }
  if (trafficThemeObserver) {
    trafficThemeObserver.disconnect();
    trafficThemeObserver = null;
  }
  document.removeEventListener("keydown", onTrafficKey);
  const button = document.getElementById(TRAFFIC_BUTTON_ID);
  if (button) {
    button.remove();
  }
  if (trafficDialog) {
    trafficDialog.remove();
    trafficDialog = null;
  }
}

function attachTrafficUi(host) {
  const href = trafficStylesheet();
  if (!href) {
    stopTraffic();
    return null;
  }
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const theme = document.createElement("div");
  theme.className = "ptaf-theme";
  theme.dataset.theme = trafficPageTheme();
  shadow.append(link, theme);
  return theme;
}

function trafficToken() {
  try {
    const stored = JSON.parse(localStorage.getItem("PTAF__AUTHENTICATION") || "{}");
    return stored.data && stored.data.accessToken ? stored.data.accessToken : null;
  } catch (error) {
    return null;
  }
}

function trafficError(status, body) {
  if (status === 401) {
    return "Сессия истекла. Обновите страницу и войдите снова.";
  }
  const codes = body && body.errors && body.errors.error_codes;
  if (Array.isArray(codes) && codes.length) {
    return codes.join(", ");
  }
  if (body && body.errors) {
    return JSON.stringify(body.errors);
  }
  return `Запрос не выполнен (${status})`;
}

async function trafficApi(path, options) {
  const token = trafficToken();
  if (!token) {
    throw new Error(trafficError(401));
  }
  const response = await fetch(path, {
    method: options && options.method ? options.method : "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
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
    throw new Error(trafficError(response.status, body));
  }
  return body;
}

const CHANGE_PASSWORD_ITEM = /change password|сменить пароль|изменить пароль/i;
const LOG_OUT_ITEM = /log\s*out|выйти/i;

function menuText(node) {
  return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
}

function userMenus() {
  return [...document.querySelectorAll(".kbq-dropdown__content")].filter((menu) => {
    const text = menuText(menu);
    return CHANGE_PASSWORD_ITEM.test(text) && LOG_OUT_ITEM.test(text);
  });
}

function menuEntries(menu) {
  return [...menu.children].filter((node) => node.nodeType === 1 && node.id !== TRAFFIC_BUTTON_ID);
}

function replaceItemLabel(item, label) {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.trim()) {
      nodes.push(walker.currentNode);
    }
  }
  if (!nodes.length) {
    item.textContent = label;
    return;
  }
  nodes[nodes.length - 1].textContent = label;
}

function closeUserMenu() {
  const backdrop = document.querySelector(".cdk-overlay-backdrop");
  if (backdrop) {
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return;
  }
  if (!trafficDialog && !document.getElementById("ptaf-bulk-dialog")) {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }));
  }
}

function onTenantMenuClick(event) {
  event.preventDefault();
  event.stopPropagation();
  closeUserMenu();
  openTrafficDialog();
}

function tenantMenuItem(source) {
  const item = source.cloneNode(true);
  item.removeAttribute("id");
  item.removeAttribute("href");
  item.removeAttribute("routerlink");
  item.removeAttribute("ng-reflect-router-link");
  item.removeAttribute("disabled");
  item.id = TRAFFIC_BUTTON_ID;
  replaceItemLabel(item, "Параметры тенанта");
  item.addEventListener("click", onTenantMenuClick);
  return item;
}

function syncTrafficButton() {
  if (trafficStopped || !trafficStylesheet()) {
    stopTraffic();
    return;
  }
  syncTrafficTheme();
  const floating = document.getElementById(TRAFFIC_BUTTON_ID);
  if (floating && !floating.closest(".kbq-dropdown__content")) {
    floating.remove();
  }
  userMenus().forEach((menu) => {
    if (menu.querySelector("#" + TRAFFIC_BUTTON_ID)) {
      return;
    }
    const entries = menuEntries(menu);
    const source = entries.find((entry) => CHANGE_PASSWORD_ITEM.test(menuText(entry)))
      || entries.find((entry) => LOG_OUT_ITEM.test(menuText(entry)));
    const logout = entries.find((entry) => LOG_OUT_ITEM.test(menuText(entry)));
    if (!source) {
      return;
    }
    const item = tenantMenuItem(source);
    if (logout) {
      menu.insertBefore(item, logout);
    } else {
      menu.append(item);
    }
  });
}

function scheduleTraffic() {
  if (trafficStopped || trafficFrame) {
    return;
  }
  trafficFrame = requestAnimationFrame(() => {
    trafficFrame = 0;
    syncTrafficButton();
  });
}

function setTrafficStatus(dialog, message, tone) {
  const status = dialog.querySelector(".ptaf-traffic-status");
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone || "error";
}

function closeTrafficDialog() {
  if (trafficSaving) {
    return;
  }
  if (trafficDialog) {
    trafficDialog.remove();
    trafficDialog = null;
  }
  trafficOriginal = null;
  trafficDraft = null;
  scheduleTraffic();
}

function fieldValue(control, original) {
  if (control.dataset.kind === "boolean") {
    return control.checked;
  }
  if (control.dataset.kind === "integer") {
    const text = control.value.trim();
    if (!text) {
      return original;
    }
    const value = Number(text);
    if (!Number.isInteger(value)) {
      throw new Error(`«${control.dataset.label}» должно быть целым числом.`);
    }
    return value;
  }
  if (control.dataset.kind === "array") {
    return control.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (control.value.trim() === "" && (original === null || original === undefined)) {
    return null;
  }
  return control.value;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rememberForm(dialog) {
  if (!trafficDraft) {
    return;
  }
  dialog.querySelectorAll("[data-key]").forEach((control) => {
    if (control.disabled) {
      return;
    }
    trafficDraft[control.dataset.key] = fieldValue(control, trafficDraft[control.dataset.key]);
  });
}

function fillTrafficForm(dialog, settings) {
  const form = dialog.querySelector(".ptaf-traffic-form");
  form.replaceChildren();
  const query = dialog.querySelector(".ptaf-traffic-search").value.trim().toLowerCase();
  for (const group of TRAFFIC_FIELDS) {
    const present = group.fields.filter((field) => Object.prototype.hasOwnProperty.call(settings, field.key));
    const visible = present.filter((field) => {
      if (!query) {
        return true;
      }
      return (field.label + " " + field.key).toLowerCase().includes(query);
    });
    if (!visible.length) {
      continue;
    }
    const section = document.createElement("section");
    section.className = "ptaf-traffic-group";
    const title = document.createElement("h3");
    title.textContent = group.title;
    section.append(title);
    for (const field of visible) {
      const value = settings[field.key];
      const row = document.createElement("label");
      row.className = "ptaf-traffic-row";
      const caption = document.createElement("span");
      caption.className = "ptaf-traffic-caption";
      const name = document.createElement("span");
      name.textContent = field.label;
      const key = document.createElement("span");
      key.className = "ptaf-traffic-key";
      key.textContent = field.key;
      caption.append(name, key);
      row.append(caption);
      let control;
      if (field.kind === "boolean") {
        control = document.createElement("input");
        control.type = "checkbox";
        control.checked = Boolean(value);
        control.className = "ptaf-traffic-check";
      } else if (field.kind === "enum") {
        control = document.createElement("select");
        control.className = "ptaf-traffic-input";
        const options = field.options.slice();
        if (value != null && options.indexOf(String(value)) === -1) {
          options.unshift(String(value));
        }
        for (const optionValue of options) {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          control.append(option);
        }
        control.value = value == null ? "" : String(value);
      } else if (field.kind === "array") {
        control = document.createElement("textarea");
        control.className = "ptaf-traffic-input";
        control.rows = 3;
        control.value = Array.isArray(value) ? value.join("\n") : "";
      } else {
        control = document.createElement("input");
        control.type = field.kind === "integer" ? "number" : "text";
        control.className = "ptaf-traffic-input";
        if (field.max) {
          control.max = String(field.max);
        }
        control.value = value == null ? "" : String(value);
      }
      control.dataset.key = field.key;
      control.dataset.kind = field.kind;
      control.dataset.label = field.label;
      if (trafficLogsLocked && LOCKED_LOG_KEYS.has(field.key)) {
        control.disabled = true;
        const note = document.createElement("span");
        note.className = "ptaf-traffic-lock";
        note.textContent = "Не задаётся в версии 4.5.2 и выше";
        caption.append(note);
      }
      row.append(control);
      section.append(row);
    }
    form.append(section);
  }
  if (!form.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "ptaf-traffic-empty";
    empty.textContent = query ? "Ничего не найдено." : "В ответе нет настраиваемых параметров.";
    form.append(empty);
  }
}

async function loadTraffic(dialog) {
  const save = dialog.querySelector(".ptaf-traffic-save");
  save.disabled = true;
  setTrafficStatus(dialog, "Загрузка параметров...", "info");
  try {
    const [settings, versions] = await Promise.all([
      trafficApi(TRAFFIC_API),
      trafficApi("/api/ptaf/v4/about/versions").catch(() => null),
    ]);
    if (!dialog.isConnected) {
      return;
    }
    trafficLogsLocked = versionAtLeast(productVersion(versions), [4, 5, 2]);
    trafficOriginal = settings && typeof settings === "object" ? settings : {};
    trafficDraft = Object.assign({}, trafficOriginal);
    fillTrafficForm(dialog, trafficDraft);
    save.disabled = false;
    setTrafficStatus(dialog, "", "info");
  } catch (error) {
    if (!dialog.isConnected) {
      return;
    }
    setTrafficStatus(dialog, error.message || "Не удалось загрузить параметры.", "error");
  }
}

async function saveTraffic(dialog) {
  if (!trafficOriginal || trafficSaving) {
    return;
  }
  let patch = {};
  try {
    rememberForm(dialog);
    patch = {};
    Object.keys(trafficDraft).forEach((key) => {
      if (trafficLogsLocked && LOCKED_LOG_KEYS.has(key)) {
        return;
      }
      if (!sameValue(trafficDraft[key], trafficOriginal[key])) {
        patch[key] = trafficDraft[key];
      }
    });
  } catch (error) {
    setTrafficStatus(dialog, error.message, "error");
    return;
  }
  if (!Object.keys(patch).length) {
    setTrafficStatus(dialog, "Изменений нет.", "info");
    return;
  }
  trafficSaving = true;
  dialog.querySelector(".ptaf-traffic-save").disabled = true;
  dialog.querySelector(".ptaf-traffic-cancel").disabled = true;
  setTrafficStatus(dialog, "Сохранение...", "info");
  try {
    const updated = await trafficApi(TRAFFIC_API, { method: "PATCH", body: patch });
    trafficOriginal = updated && typeof updated === "object" ? updated : Object.assign({}, trafficOriginal, patch);
    trafficSaving = false;
    closeTrafficDialog();
  } catch (error) {
    trafficSaving = false;
    if (!dialog.isConnected) {
      return;
    }
    dialog.querySelector(".ptaf-traffic-save").disabled = false;
    dialog.querySelector(".ptaf-traffic-cancel").disabled = false;
    setTrafficStatus(dialog, error.message || "Не удалось сохранить параметры.", "error");
  }
}

function openTrafficDialog() {
  if (trafficSaving || trafficStopped) {
    return;
  }
  closeTrafficDialog();
  const host = document.createElement("div");
  host.id = TRAFFIC_DIALOG_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const shadow = attachTrafficUi(host);
  if (!shadow) {
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-traffic-backdrop";
  backdrop.innerHTML = `
    <div class="ptaf-traffic-dialog" role="dialog" aria-modal="true" aria-labelledby="ptaf-traffic-title" tabindex="-1">
      <h2 id="ptaf-traffic-title">Параметры тенанта</h2>
      <p class="ptaf-traffic-warning">Это дополнительный модуль (addon). Компания Positive Technologies его не поддерживает. Используйте на свой страх и риск.</p>
      <p class="ptaf-traffic-warning">Изменение параметров влияет на все веб-приложения изолированного пространства и может нарушить работу PT AF.</p>
      <input class="ptaf-traffic-search" type="search" placeholder="Поиск параметра" aria-label="Поиск параметра">
      <div class="ptaf-traffic-form"></div>
      <p class="ptaf-traffic-status" hidden></p>
      <div class="ptaf-traffic-actions">
        <button type="button" class="ptaf-traffic-cancel">Отмена</button>
        <button type="button" class="ptaf-traffic-save">Сохранить</button>
      </div>
    </div>
  `;
  shadow.append(backdrop);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeTrafficDialog();
    }
  });
  shadow.querySelector(".ptaf-traffic-cancel").addEventListener("click", closeTrafficDialog);
  shadow.querySelector(".ptaf-traffic-save").addEventListener("click", () => saveTraffic(shadow));
  shadow.querySelector(".ptaf-traffic-search").addEventListener("input", () => {
    if (!trafficDraft) {
      return;
    }
    try {
      rememberForm(shadow);
      fillTrafficForm(shadow, trafficDraft);
    } catch (error) {
      setTrafficStatus(shadow, error.message, "error");
    }
  });
  document.body.appendChild(host);
  trafficDialog = host;
  const opener = document.getElementById(TRAFFIC_BUTTON_ID);
  if (opener) {
    opener.remove();
  }
  shadow.querySelector(".ptaf-traffic-dialog").focus();
  loadTraffic(shadow);
}

function onTrafficKey(event) {
  if (event.key === "Escape") {
    closeTrafficDialog();
  }
}

function watchTrafficTheme() {
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-kbq-theme"],
  };
  trafficThemeObserver = new MutationObserver(() => syncTrafficTheme());
  trafficThemeObserver.observe(document.documentElement, options);
  if (document.body) {
    trafficThemeObserver.observe(document.body, options);
  }
}

function watchTraffic() {
  trafficObserver = new MutationObserver(() => scheduleTraffic());
  trafficObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

document.addEventListener("keydown", onTrafficKey);
watchTraffic();
watchTrafficTheme();
scheduleTraffic();
