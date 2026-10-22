const EVENT_DOWNLOAD_ID = "ptaf-event-download";
const EVENT_DOWNLOAD_LABEL = "Скачать JSON";
const EVENT_IMPORT_ID = "ptaf-event-import";
const EVENT_IMPORT_LABEL = "Импорт JSON";
const EVENT_VIEW_ID = "ptaf-event-view";
const EVENT_FORMAT = "ptaf-security-event";
const EVENT_FORMAT_VERSION = 1;
const EVENT_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EVENT_DETAIL = new RegExp(`/threats/events/(${EVENT_UUID})(?=[/?#]|$)`, "i");
const EVENT_FIELDS = [
  "id",
  "timestamp",
  "transaction_id",
  "app_id",
  "app_name",
  "processing_time",
  "policy_id",
  "is_ssl",
  "rule_id",
  "rule_name",
  "rule_description",
  "rule_revision",
  "event_class",
  "event_tags",
  "event_severity",
  "event_actions",
  "accuracy",
  "rule_phase",
  "classifications",
  "matched_info",
  "node_hostname",
  "node_listen_address",
  "node_listen_port",
  "request_host",
  "request_method",
  "request_protocol",
  "request_uri",
  "request_path",
  "request_query",
  "request_size",
  "request_headers",
  "request_get_args",
  "request_post_args",
  "request_cookies",
  "client_ip",
  "client_os_name",
  "client_browser_name",
  "client_browser_version",
  "client_geo",
  "client_country",
  "client_username",
  "client_auth_type",
  "response_status_code",
  "response_size",
  "response_headers",
  "raw_request_exist",
  "raw_response_exist",
];

let eventFrame = 0;
let eventObserver = null;
let eventDownloading = false;
let eventStopped = false;
let eventExperimental = false;

function eventContextAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function stopEvents() {
  if (eventStopped) {
    return;
  }
  eventStopped = true;
  if (eventFrame) {
    cancelAnimationFrame(eventFrame);
    eventFrame = 0;
  }
  if (eventObserver) {
    eventObserver.disconnect();
    eventObserver = null;
  }
  for (const id of [EVENT_DOWNLOAD_ID, EVENT_IMPORT_ID, EVENT_VIEW_ID]) {
    const node = document.getElementById(id);
    if (node) {
      node.remove();
    }
  }
}

function eventToast(message) {
  const text = String(message || "Не удалось скачать событие.");
  if (typeof showToast === "function") {
    showToast(text.length > 280 ? `${text.slice(0, 280)}…` : text);
  }
}

function eventIdFromLocation() {
  const href = `${location.pathname}${location.search}${location.hash}`;
  const path = href.match(new RegExp(`/events/(?:[^/?#]+/)?(${EVENT_UUID})`, "i"));
  if (path) {
    return path[1];
  }
  const query = href.match(new RegExp(`[?&#](?:id|eventId|event_id)=(${EVENT_UUID})`, "i"));
  return query ? query[1] : null;
}

function eventIdFromPerformance() {
  let best = null;
  let bestTime = -1;
  let entries = [];
  try {
    entries = performance.getEntriesByType("resource");
  } catch (error) {
    return null;
  }
  for (const entry of entries) {
    const match = String(entry.name || "").match(EVENT_DETAIL);
    if (!match) {
      continue;
    }
    const time = entry.responseEnd || entry.startTime || 0;
    if (time >= bestTime) {
      bestTime = time;
      best = match[1];
    }
  }
  return best;
}

function currentEventId() {
  return eventIdFromLocation()
    || (document.documentElement && document.documentElement.dataset.ptafLastEvent)
    || eventIdFromPerformance();
}

function eventModal() {
  const root = document.querySelector("ptaf-events");
  if (!root) {
    return null;
  }
  const modals = root.querySelectorAll(".waf-modal-active");
  for (let index = modals.length - 1; index >= 0; index -= 1) {
    const modal = modals[index];
    if (modal.querySelector("ptaf-form-card-header, .toolbar, .panable")) {
      return modal;
    }
  }
  return null;
}

function eventCardSlot() {
  const modal = eventModal();
  if (!modal) {
    return null;
  }
  const group = modal.querySelector(".toolbar .button-group");
  if (group) {
    return { slot: group, before: group.firstChild, header: false };
  }
  const header = modal.querySelector("ptaf-form-card-header");
  if (!header) {
    return null;
  }
  const pin = header.querySelector(":scope > button, :scope > ptaf-button");
  return { slot: header, before: pin || null, header: true };
}

function eventUseful(body) {
  return Boolean(body && (body.timestamp || body.rule_name || body.rule_description || body.transaction_id || body.request_uri));
}

function eventKeyCount(body) {
  return body && typeof body === "object" ? Object.keys(body).length : 0;
}

function eventValueEmpty(value) {
  if (value == null || value === "") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function mergeEvents(base, extra) {
  const merged = {};
  if (base && typeof base === "object" && !base.errors) {
    Object.assign(merged, base);
  }
  if (extra && typeof extra === "object" && !extra.errors) {
    for (const key of Object.keys(extra)) {
      if (extra[key] === undefined) {
        continue;
      }
      if (!(key in merged) || (eventValueEmpty(merged[key]) && !eventValueEmpty(extra[key]))) {
        merged[key] = extra[key];
      }
    }
  }
  return merged;
}

function eventDetails(event) {
  const source = event || {};
  return {
    rule_description: source.rule_description || null,
    rule_name: source.rule_name || null,
    rule_id: source.rule_id || null,
    rule_revision: source.rule_revision || null,
    rule_phase: source.rule_phase || null,
    event_id: source.id || null,
    transaction_id: source.transaction_id || null,
    timestamp: source.timestamp ?? null,
    processing_time: source.processing_time ?? null,
    accuracy: source.accuracy ?? null,
    event_class: source.event_class || null,
    event_severity: source.event_severity || null,
    event_tags: Array.isArray(source.event_tags) ? source.event_tags : [],
    classifications: Array.isArray(source.classifications) ? source.classifications : [],
    event_actions: Array.isArray(source.event_actions) ? source.event_actions : [],
    matched_info: source.matched_info || null,
    server: {
      app_id: source.app_id || null,
      app_name: source.app_name || null,
      address: source.node_listen_address || null,
      port: source.node_listen_port ?? null,
      hostname: source.node_hostname || null,
    },
    client: {
      ip: source.client_ip || null,
      country: source.client_country || null,
      username: source.client_username || null,
      os: source.client_os_name || null,
      browser: source.client_browser_name || null,
      browser_version: source.client_browser_version || null,
      geo: source.client_geo || null,
      auth_type: source.client_auth_type || null,
    },
    request: {
      protocol: source.request_protocol || null,
      method: source.request_method || null,
      host: source.request_host || null,
      uri: source.request_uri || null,
      path: source.request_path || null,
      query: source.request_query || null,
      size: source.request_size ?? null,
      headers: Array.isArray(source.request_headers) ? source.request_headers : [],
      get_args: Array.isArray(source.request_get_args) ? source.request_get_args : [],
      post_args: Array.isArray(source.request_post_args) ? source.request_post_args : [],
      cookies: Array.isArray(source.request_cookies) ? source.request_cookies : [],
    },
    response: {
      status_code: source.response_status_code ?? null,
      size: source.response_size ?? null,
      headers: Array.isArray(source.response_headers) ? source.response_headers : [],
    },
  };
}

async function loadListedEvent(id) {
  const encoded = encodeURIComponent(JSON.stringify(EVENT_FIELDS));
  const repeated = EVENT_FIELDS.map((field) => `fields=${encodeURIComponent(field)}`).join("&");
  const paths = [
    `/threats/events/${id}?fields=${encoded}`,
    `/threats/events/${id}?${repeated}`,
  ];
  let best = null;
  let bestCount = -1;
  let lastError = null;
  for (const path of paths) {
    try {
      const body = await api(path);
      const count = eventKeyCount(body);
      if (count > bestCount) {
        best = body;
        bestCount = count;
      }
      if (eventUseful(body) && count > 3) {
        return body;
      }
    } catch (error) {
      lastError = error;
      if (error && (error.status === 401 || error.status === 403)) {
        throw error;
      }
    }
  }
  if (best) {
    return best;
  }
  throw lastError || new Error("Не удалось прочитать поля события.");
}

async function loadSecurityEvent(id) {
  const [plainResult, listedResult] = await Promise.all([
    api(`/threats/events/${id}`).then((body) => ({ body })).catch((error) => ({ error })),
    loadListedEvent(id).then((body) => ({ body })).catch((error) => ({ error })),
  ]);
  const authError = [plainResult.error, listedResult.error].find((error) => error && (error.status === 401 || error.status === 403));
  if (authError && !eventUseful(plainResult.body) && !eventUseful(listedResult.body)) {
    throw authError;
  }
  const merged = mergeEvents(plainResult.body, listedResult.body);
  if (!eventUseful(merged)) {
    throw listedResult.error || plainResult.error || new Error("Не удалось прочитать поля события.");
  }
  return merged;
}

async function eventBytes(path) {
  const token = getAccessToken();
  if (!token) {
    const error = new Error(errorMessage(401));
    error.status = 401;
    throw error;
  }
  await ensurePluginUserAgent();
  const response = await fetch(pluginUrl(API_ROOT + path), {
    credentials: "same-origin",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${token}`,
      "Accept-Language": typeof acceptLanguageHeader === "function" ? acceptLanguageHeader() : "ru-RU",
    },
  });
  if (!response.ok) {
    let body = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (error) {
        body = null;
      }
    }
    const error = new Error(errorMessage(response.status, body));
    error.status = response.status;
    throw error;
  }
  return new Uint8Array(await response.arrayBuffer());
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function rawDocument(bytes) {
  let text = null;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    text = null;
  }
  if (text != null) {
    return { encoding: "utf-8", size: bytes.length, data: text };
  }
  return { encoding: "base64", size: bytes.length, data: bytesToBase64(bytes) };
}

function rawQuery(transactionId, rawType, timestamp, file) {
  const params = new URLSearchParams();
  params.set("raw_type", rawType);
  const number = Number(timestamp);
  if (Number.isFinite(number)) {
    params.set("timestamp", String(number));
  }
  const suffix = file ? "/file" : "";
  return `/threats/raw_data/${encodeURIComponent(transactionId)}${suffix}?${params}`;
}

async function loadRaw(transactionId, rawType, timestamp) {
  let lastError = null;
  for (const file of [true, false]) {
    try {
      const bytes = await eventBytes(rawQuery(transactionId, rawType, timestamp, file));
      return rawDocument(bytes);
    } catch (error) {
      lastError = error;
      if (error && (error.status === 401 || error.status === 403)) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Не удалось прочитать сырой запрос.");
}

function eventFileName(event) {
  const label = String((event && (event.rule_name || event.id)) || "event")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const suffix = event && event.id ? String(event.id).slice(0, 8) : "";
  const base = [label || "event", suffix && suffix !== label ? suffix : ""].filter(Boolean).join(" ");
  return `${base}.json`;
}

function saveEventFile(name, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadOpenEvent(button) {
  if (eventDownloading) {
    return;
  }
  const id = currentEventId();
  if (!id) {
    eventToast("Не удалось определить открытое событие. Закройте карточку и откройте её снова.");
    return;
  }
  eventDownloading = true;
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "…";
  try {
    const event = await loadSecurityEvent(id);
    const notes = [];
    let rawRequest = null;
    let rawResponse = null;
    if (event.raw_request_exist) {
      if (!event.transaction_id) {
        notes.push("сырой запрос");
      } else {
        try {
          rawRequest = await loadRaw(event.transaction_id, "request", event.timestamp);
        } catch (error) {
          if (error && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          notes.push("сырой запрос");
        }
      }
    }
    if (event.raw_response_exist) {
      if (!event.transaction_id) {
        notes.push("сырой ответ");
      } else {
        try {
          rawResponse = await loadRaw(event.transaction_id, "response", event.timestamp);
        } catch (error) {
          if (error && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          notes.push("сырой ответ");
        }
      }
    }
    saveEventFile(eventFileName(event), {
      format: EVENT_FORMAT,
      version: EVENT_FORMAT_VERSION,
      event,
      details: eventDetails(event),
      raw_request: rawRequest,
      raw_response: rawResponse,
    });
    if (notes.length) {
      eventToast(`Файл сохранён без данных: ${notes.join(", ")}.`);
    }
  } catch (error) {
    eventToast((error && error.message) || "Не удалось скачать событие.");
  } finally {
    eventDownloading = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = previous || EVENT_DOWNLOAD_LABEL;
    }
  }
}

function eventImportSlot() {
  return document.querySelector("ptaf-events ptaf-group-grid > .controls")
    || document.querySelector("ptaf-events .controls");
}

function parseEventDocument(text) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Файл не является JSON.");
  }
  if (!data || data.format !== EVENT_FORMAT || Number(data.version) !== EVENT_FORMAT_VERSION || !data.event || typeof data.event !== "object") {
    throw new Error("Файл не является событием PT AF.");
  }
  return data;
}

function readEventFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      openEventView(parseEventDocument(String(reader.result || "")));
    } catch (error) {
      eventToast((error && error.message) || "Файл не является событием PT AF.");
    }
  });
  reader.addEventListener("error", () => eventToast("Не удалось прочитать файл."));
  reader.readAsText(file);
}

function pickEventFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) {
      readEventFile(file);
    }
    input.remove();
  });
  document.body.append(input);
  input.click();
}

function eventStamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }
  let milliseconds = number;
  if (number < 1e11) {
    milliseconds = number * 1000;
  } else if (number > 1e14) {
    milliseconds = number / 1000;
  }
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("ru-RU");
}

function eventJoined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        return item.action_name || item.action_type_key || item.name || "";
      }
      return item == null ? "" : String(item);
    }).filter(Boolean).join(", ");
  }
  if (value == null || value === "") {
    return "";
  }
  return String(value);
}

function rawViewText(raw) {
  if (!raw) {
    return { text: "", binary: false, size: 0 };
  }
  if (typeof raw === "string") {
    return { text: raw, binary: false, size: raw.length };
  }
  const size = Number(raw.size) || 0;
  const data = raw.data == null ? "" : String(raw.data);
  if (raw.encoding === "base64") {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { text, binary: false, size: size || bytes.length };
    } catch (error) {
      return { text: "", binary: true, size: size || data.length };
    }
  }
  return { text: data, binary: false, size: size || data.length };
}

function closeEventView() {
  const host = document.getElementById(EVENT_VIEW_ID);
  if (host) {
    host.remove();
  }
}

function eventRow(list, label, value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) {
    return;
  }
  const row = document.createElement("div");
  row.className = "ptaf-event-row";
  const name = document.createElement("div");
  name.className = "ptaf-event-label";
  name.textContent = label;
  const body = document.createElement("div");
  body.className = "ptaf-event-value";
  body.textContent = text;
  row.append(name, body);
  list.append(row);
}

function eventSize(bytes) {
  const number = Number(bytes);
  if (bytes == null || bytes === "" || !Number.isFinite(number) || number < 0) {
    return "";
  }
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = number;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${units[unit]}`;
}

function eventCard(title) {
  const card = document.createElement("section");
  card.className = "ptaf-event-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "ptaf-event-fields";
  card.append(heading, list);
  return { card, list };
}

function placeCard(board, built) {
  if (built.list.childElementCount || built.card.querySelector(".ptaf-event-pairs, .ptaf-event-chip-row")) {
    board.append(built.card);
  }
}

function eventTone(value) {
  return ["attack", "weakness", "incident", "info", "none", "low", "medium", "high"].includes(value) ? ` is-${value}` : "";
}

function eventChipRow(parent, label, items) {
  const values = (Array.isArray(items) ? items : []).map((item) => {
    if (item && typeof item === "object") {
      return item.name || item.action_name || item.value || "";
    }
    return item == null ? "" : String(item);
  }).map((item) => String(item).trim()).filter(Boolean);
  if (!values.length) {
    return;
  }
  const row = document.createElement("div");
  row.className = "ptaf-event-chip-row";
  const name = document.createElement("div");
  name.className = "ptaf-event-label";
  name.textContent = label;
  const box = document.createElement("div");
  box.className = "ptaf-event-chips";
  values.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "ptaf-event-chip";
    chip.textContent = text;
    box.append(chip);
  });
  row.append(name, box);
  parent.append(row);
}

function eventPairs(parent, title, rows) {
  const items = (rows || []).map((row) => {
    if (!row || typeof row !== "object") {
      return null;
    }
    return {
      key: row.key || row.name || "",
      value: row.value == null ? "" : String(row.value),
    };
  }).filter((row) => row && (row.key || row.value));
  if (!items.length) {
    return;
  }
  const heading = document.createElement("h4");
  heading.className = "ptaf-event-subtitle";
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "ptaf-event-pairs";
  items.forEach((row) => {
    const line = document.createElement("div");
    line.className = "ptaf-event-pair";
    const key = document.createElement("div");
    key.textContent = row.key;
    const value = document.createElement("div");
    value.textContent = row.value;
    line.append(key, value);
    grid.append(line);
  });
  parent.append(heading, grid);
}

function fillEventMatch(panel, info) {
  const items = info && Array.isArray(info.matched_items) ? info.matched_items.filter(Boolean) : [];
  const note = info && info.description ? String(info.description).trim() : "";
  if (!items.length && !note) {
    return;
  }
  const block = document.createElement("section");
  block.className = "ptaf-event-match-block";
  const heading = document.createElement("h3");
  heading.textContent = items.length > 1 ? "Совпадения" : "Совпадение";
  block.append(heading);
  items.forEach((item, index) => {
    if (items.length > 1) {
      const sub = document.createElement("h4");
      sub.className = "ptaf-event-subtitle";
      sub.textContent = `Совпадение ${index + 1}`;
      block.append(sub);
    }
    const list = document.createElement("div");
    list.className = "ptaf-event-fields";
    eventRow(list, "Имя", item.matched_name);
    eventRow(list, "Ключ", item.matched_key);
    eventRow(list, "Значение", item.matched_value);
    block.append(list);
  });
  const extra = document.createElement("div");
  extra.className = "ptaf-event-fields";
  eventRow(extra, "Доп информация", note);
  if (extra.childElementCount) {
    block.append(extra);
  }
  panel.append(block);
}

function fillEventDetails(panel, source) {
  const details = source && source.server && source.request ? source : eventDetails(source);
  const severity = { none: "Нет", low: "Низкий", medium: "Средний", high: "Высокий" };
  const kind = { attack: "Атака", weakness: "Уязвимость", incident: "Инцидент", info: "Инфо" };
  const phase = {
    on_request: "На запросе",
    on_response: "На ответе",
    on_transaction_start: "При начале транзакции",
    on_transaction_complete: "При завершении транзакции",
    on_transaction_process: "Обработка транзакции",
    on_websocket_upstream: "При передаче данных серверу по WebSocket",
    on_websocket_downstream: "При передаче данных клиенту по WebSocket",
    on_icap_check: "При проверке ICAP",
  };
  if (details.rule_description) {
    const description = document.createElement("p");
    description.className = "ptaf-event-summary";
    description.textContent = details.rule_description;
    panel.append(description);
  }
  const meta = document.createElement("div");
  meta.className = "ptaf-event-meta";
  [
    [kind[details.event_class] || details.event_class, eventTone(details.event_class)],
    [severity[details.event_severity] || details.event_severity, eventTone(details.event_severity)],
    details.accuracy == null ? "" : `Точность ${details.accuracy}`,
    eventStamp(details.timestamp),
  ].filter((item) => (Array.isArray(item) ? item[0] : item)).forEach((item) => {
    const chip = document.createElement("span");
    chip.className = `ptaf-event-chip${Array.isArray(item) && item[1] ? ` ${item[1]}` : ""}`;
    chip.textContent = Array.isArray(item) ? item[0] : item;
    meta.append(chip);
  });
  if (meta.childElementCount) {
    panel.append(meta);
  }
  fillEventMatch(panel, details.matched_info);
  const board = document.createElement("div");
  board.className = "ptaf-event-board";
  const facts = document.createElement("div");
  facts.className = "ptaf-event-stack";
  const side = document.createElement("div");
  side.className = "ptaf-event-stack";
  const about = eventCard("Событие");
  const processing = Number(details.processing_time);
  eventRow(about.list, "Фаза", phase[details.rule_phase] || details.rule_phase);
  eventRow(about.list, "Время обработки", Number.isFinite(processing) ? `${processing.toFixed(3)} с` : "");
  eventRow(about.list, "Ревизия", details.rule_revision);
  eventRow(about.list, "Действия", eventJoined(details.event_actions));
  eventRow(about.list, "Транзакция", details.transaction_id);
  eventRow(about.list, "ID события", details.event_id);
  eventRow(about.list, "ID правила", details.rule_id);
  eventChipRow(about.card, "Классификация", details.classifications);
  eventChipRow(about.card, "Теги", details.event_tags);
  placeCard(facts, about);

  const serverInfo = details.server || {};
  const server = eventCard("Сервер");
  const address = [serverInfo.address, serverInfo.port].filter((part) => part != null && part !== "").join(":");
  eventRow(server.list, "Приложение", serverInfo.app_name);
  eventRow(server.list, "Адрес", address);
  eventRow(server.list, "Имя узла", serverInfo.hostname);
  placeCard(side, server);

  const clientInfo = details.client || {};
  const client = eventCard("Клиент");
  eventRow(client.list, "IP-адрес", clientInfo.ip);
  eventRow(client.list, "Страна", clientInfo.country);
  eventRow(client.list, "Пользователь", clientInfo.username);
  eventRow(client.list, "Браузер", [clientInfo.browser, clientInfo.browser_version].filter(Boolean).join(" "));
  eventRow(client.list, "ОС", clientInfo.os);
  placeCard(facts, client);

  const responseInfo = details.response || {};
  const response = eventCard("Ответ");
  eventRow(response.list, "Код", responseInfo.status_code == null ? "" : String(responseInfo.status_code));
  eventRow(response.list, "Размер", eventSize(responseInfo.size));
  eventPairs(response.card, "Заголовки", responseInfo.headers);
  placeCard(side, response);
  if (facts.childElementCount) {
    board.append(facts);
  }
  if (side.childElementCount) {
    board.append(side);
  }

  const requestInfo = details.request || {};
  const request = eventCard("Запрос");
  request.card.classList.add("ptaf-event-card-wide");
  const line = [requestInfo.method, requestInfo.uri || requestInfo.path].filter(Boolean).join(" ");
  eventRow(request.list, "Строка", line);
  eventRow(request.list, "Протокол", requestInfo.protocol);
  eventRow(request.list, "Хост", requestInfo.host);
  eventRow(request.list, "Размер", eventSize(requestInfo.size));
  eventPairs(request.card, "Параметры", (requestInfo.get_args || []).concat(requestInfo.post_args || []));
  eventPairs(request.card, "Куки", requestInfo.cookies);
  eventPairs(request.card, "Заголовки", requestInfo.headers);
  placeCard(board, request);
  panel.append(board);
}

function fillRawPanel(panel, raw, emptyLabel) {
  const view = rawViewText(raw);
  const pre = document.createElement("pre");
  pre.className = "ptaf-event-raw";
  if (view.binary) {
    pre.textContent = `${emptyLabel} в двоичном виде, ${view.size} байт.`;
  } else if (!view.text) {
    pre.textContent = `${emptyLabel} не сохранён.`;
  } else {
    pre.textContent = view.text;
  }
  panel.append(pre);
}

function openEventView(data) {
  closeEventView();
  const event = data.event || {};
  const host = document.createElement("div");
  host.id = EVENT_VIEW_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const shadow = typeof attachUi === "function" ? attachUi(host) : null;
  if (!shadow) {
    host.remove();
    eventToast("Не удалось открыть просмотр события.");
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-bulk-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "ptaf-event-view";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;

  const heading = document.createElement("div");
  heading.className = "ptaf-event-heading";
  const title = document.createElement("h2");
  title.textContent = event.rule_name || "Событие безопасности";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ptaf-event-close";
  close.textContent = "Закрыть";
  close.addEventListener("click", closeEventView);
  heading.append(title, close);

  const note = document.createElement("p");
  note.className = "ptaf-event-note";
  note.textContent = "Событие из файла. Это дополнительный модуль (addon). Компания Positive Technologies его не поддерживает.";

  const tabs = document.createElement("div");
  tabs.className = "ptaf-event-tabs";
  const panels = document.createElement("div");
  panels.className = "ptaf-event-panels";
  const pages = [
    { id: "event", label: "Событие" },
    { id: "request", label: "Сырой запрос" },
  ];
  if (data.raw_response) {
    pages.push({ id: "response", label: "Сырой ответ" });
  }
  pages.forEach((page, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "ptaf-event-tab";
    tab.textContent = page.label;
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    const panel = document.createElement("div");
    panel.className = "ptaf-event-panel";
    panel.hidden = index !== 0;
    if (page.id === "event") {
      fillEventDetails(panel, data.details || event);
    } else if (page.id === "request") {
      fillRawPanel(panel, data.raw_request, "Сырой запрос");
    } else {
      fillRawPanel(panel, data.raw_response, "Сырой ответ");
    }
    tab.addEventListener("click", () => {
      tabs.querySelectorAll(".ptaf-event-tab").forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
      [...panels.children].forEach((item) => {
        item.hidden = item !== panel;
      });
    });
    tabs.append(tab);
    panels.append(panel);
  });

  dialog.append(heading, note, tabs, panels);
  backdrop.append(dialog);
  backdrop.addEventListener("click", (click) => {
    if (click.target === backdrop) {
      closeEventView();
    }
  });
  shadow.append(backdrop);
  document.body.append(host);
  dialog.focus();
}

function bindEventImport(button) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pickEventFile();
  });
  button.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    button.dataset.drag = "1";
    button.style.outline = "2px solid #4c8dff";
    button.style.outlineOffset = "2px";
  });
  button.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    delete button.dataset.drag;
    button.style.outline = "";
    button.style.outlineOffset = "";
  });
  button.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    delete button.dataset.drag;
    button.style.outline = "";
    button.style.outlineOffset = "";
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) {
      eventToast("Перетащите файл JSON.");
      return;
    }
    readEventFile(file);
  });
}

function placeEventImport() {
  const existing = document.getElementById(EVENT_IMPORT_ID);
  if (!eventExperimental) {
    if (existing) {
      existing.remove();
    }
    closeEventView();
    return;
  }
  const slot = eventImportSlot();
  if (!slot) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  if (existing && existing.ptafEventBound && existing.parentElement === slot) {
    return;
  }
  if (existing) {
    existing.remove();
  }
  const button = document.createElement("button");
  button.id = EVENT_IMPORT_ID;
  button.type = "button";
  button.ptafEventBound = true;
  button.textContent = EVENT_IMPORT_LABEL;
  button.title = "Эксперимент. Перетащите JSON события или выберите файл";
  button.style.cssText = "box-sizing:border-box;flex:0 0 auto;align-self:center;height:32px;margin:0 0 0 8px;padding:0 12px;border:1px solid rgba(180,186,204,.45);border-radius:8px;background:transparent;color:inherit;font:13px/16px Inter,Segoe UI,sans-serif;white-space:nowrap;cursor:pointer;";
  bindEventImport(button);
  slot.append(button);
}

function placeEventDownload() {
  const place = eventCardSlot();
  const existing = document.getElementById(EVENT_DOWNLOAD_ID);
  if (!place) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const samePlace = existing && existing.ptafEventBound && existing.parentElement === place.slot && existing.dataset.header === (place.header ? "1" : "0");
  if (samePlace) {
    existing.disabled = eventDownloading;
    return;
  }
  if (existing) {
    existing.remove();
  }
  const button = document.createElement("button");
  button.id = EVENT_DOWNLOAD_ID;
  button.type = "button";
  button.ptafEventBound = true;
  button.dataset.header = place.header ? "1" : "0";
  button.textContent = eventDownloading ? "…" : EVENT_DOWNLOAD_LABEL;
  button.disabled = eventDownloading;
  button.title = "Скачать событие целиком: все поля и сырой запрос";
  button.style.cssText = place.header
    ? "box-sizing:border-box;flex:0 0 auto;align-self:center;height:24px;margin:0 8px 0 auto;padding:0 10px;border:1px solid rgba(180,186,204,.45);border-radius:8px;background:transparent;color:inherit;font:13px/16px Inter,Segoe UI,sans-serif;white-space:nowrap;cursor:pointer;"
    : "box-sizing:border-box;flex:0 0 auto;align-self:center;height:32px;margin:0 8px 0 0;padding:0 12px;border:1px solid rgba(180,186,204,.45);border-radius:8px;background:transparent;color:inherit;font:13px/16px Inter,Segoe UI,sans-serif;white-space:nowrap;cursor:pointer;";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    downloadOpenEvent(button);
  });
  if (place.before && place.before.parentElement === place.slot) {
    place.slot.insertBefore(button, place.before);
  } else {
    place.slot.append(button);
  }
}

function scheduleEvents() {
  if (eventStopped || eventFrame) {
    return;
  }
  eventFrame = requestAnimationFrame(() => {
    eventFrame = 0;
    if (!eventContextAlive()) {
      stopEvents();
      return;
    }
    placeEventDownload();
    placeEventImport();
  });
}

function watchEvents() {
  eventObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target && target.closest && (target.id === EVENT_DOWNLOAD_ID || target.id === EVENT_IMPORT_ID || target.id === EVENT_VIEW_ID || (target.closest && target.closest(`#${EVENT_VIEW_ID}`)))) {
        continue;
      }
      scheduleEvents();
      return;
    }
  });
  eventObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.body) {
  watchEvents();
  scheduleEvents();
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.getElementById(EVENT_VIEW_ID)) {
    closeEventView();
  }
});
function applyEventExperimental(enabled) {
  eventExperimental = Boolean(enabled);
  if (!eventExperimental) {
    const button = document.getElementById(EVENT_IMPORT_ID);
    if (button) {
      button.remove();
    }
    closeEventView();
    return;
  }
  scheduleEvents();
}
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.experimental) {
      applyEventExperimental(changes.experimental.newValue);
    }
  });
}
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get({ experimental: false }, (items) => {
    applyEventExperimental(items && items.experimental);
  });
}
