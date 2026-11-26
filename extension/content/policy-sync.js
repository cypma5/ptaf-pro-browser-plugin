const POLICY_SYNC_ID = "ptaf-policy-sync";
const POLICY_SYNC_STATUSES = "/config/ptaf_installations/actions/statuses";
const POLICY_SYNC_SEND = "/config/ptaf_installations/actions/sync";
const POLICY_SYNC_PODS = "/config/configuration_statuses/last";
const POLICY_SYNC_CURRENT_TENANT = "/auth/current_tenant";
const POLICY_SYNC_POLL_MS = 2000;
const POLICY_SYNC_POLL_MAX = 45;
const POLICY_SYNC_REFRESH_MS = 30000;

const POLICY_SYNC_POD_NOTIF = {
  config_applied_successfully: "Все модули обработки трафика имеют актуальную конфигурацию",
  config_applying_in_progress: "Идет обновление конфигурации модулей",
  number_of_cores_have_obsolete_config: "У части модулей устаревшая конфигурация",
  number_of_cores_have_applying_failures: "Ошибка применения конфигурации на модулях",
  config_applying_overdue: "Применение конфигурации занимает слишком много времени",
  server_config_validation_failed: "Ошибка проверки конфигурации сервера",
  upstream_not_resolved: "Не удалось разрешить upstream",
};

let policySyncEnabled = true;
let policySyncStopped = false;
let policySyncFrame = 0;
let policySyncObserver = null;
let policySyncItems = [];
let policySyncPods = {};
let policySyncLocalPods = null;
let policySyncSchedule = null;
let policySyncOpen = false;
let policySyncLoading = false;
let policySyncError = "";
let policySyncSendingIds = new Set();
let policySyncPollTimer = 0;
let policySyncPollLeft = 0;
let policySyncRefreshTimer = 0;
let policySyncFetchToken = 0;
let policySyncUnavailable = false;

function policySyncAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function stopPolicySync() {
  if (policySyncStopped) {
    return;
  }
  policySyncStopped = true;
  if (policySyncFrame) {
    cancelAnimationFrame(policySyncFrame);
    policySyncFrame = 0;
  }
  if (policySyncObserver) {
    policySyncObserver.disconnect();
    policySyncObserver = null;
  }
  if (policySyncPollTimer) {
    clearTimeout(policySyncPollTimer);
    policySyncPollTimer = 0;
  }
  if (policySyncRefreshTimer) {
    clearInterval(policySyncRefreshTimer);
    policySyncRefreshTimer = 0;
  }
  document.removeEventListener("mousedown", onPolicySyncOutside, true);
  document.removeEventListener("keydown", onPolicySyncKey);
  window.removeEventListener("resize", placePolicySyncPop);
  window.removeEventListener("scroll", placePolicySyncPop, true);
  const host = document.getElementById(POLICY_SYNC_ID);
  if (host) {
    host.remove();
  }
  policySyncOpen = false;
  policySyncItems = [];
  policySyncPods = {};
  policySyncLocalPods = null;
  policySyncSchedule = null;
}

function policySyncSlot() {
  return document.querySelector("ptaf-top-panel .config");
}

function policySyncHost() {
  return document.getElementById(POLICY_SYNC_ID);
}

function policySyncTheme() {
  const host = policySyncHost();
  return host && host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
}

function policySyncItemsList(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && Array.isArray(body.items)) {
    return body.items;
  }
  return [];
}

function policySyncPending(item) {
  return Boolean(item && item.config_status === "NOT_SYNCED" && item.last_sync_status !== "IN_PROGRESS");
}

function policySyncParsePods(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  const group = body.default_resource_group || body.dynamic_resource_group || null;
  if (!group) {
    return {
      summary: body.summary || "NO_CONFIGURATION",
      total: 0,
      applied: 0,
      configAt: null,
      startAt: null,
      notifications: [],
      cores: [],
    };
  }
  const cores = Array.isArray(group.cores) ? group.cores : [];
  const applied = cores.filter((core) => core && core.status === "APPLIED").length;
  return {
    summary: group.summary || body.summary || "NO_CONFIGURATION",
    total: cores.length,
    applied,
    configAt: group.config_timestamp,
    startAt: group.start_timestamp,
    notifications: Array.isArray(group.notifications) ? group.notifications : [],
    cores,
  };
}

function policySyncPodsFor(id) {
  return id ? policySyncPods[id] || null : null;
}

function policySyncPodsBusy(pods) {
  return Boolean(pods && (pods.summary === "UPDATING" || pods.summary === "FAILED"));
}

function policySyncAlert(items) {
  if ((items || []).some((item) => item.config_status === "NOT_SYNCED" || item.config_status === "ERROR")) {
    return true;
  }
  if (policySyncPodsBusy(policySyncLocalPods)) {
    return true;
  }
  return (items || []).some((item) => policySyncPodsBusy(policySyncPodsFor(item.id)));
}

function policySyncCloudTone(items) {
  const list = items || [];
  if (list.some((item) => item.config_status === "ERROR" || item.last_sync_status === "FAILED")) {
    return "error";
  }
  if (list.some((item) => item.config_status === "NOT_SYNCED" || item.last_sync_status === "IN_PROGRESS")) {
    return "warn";
  }
  if (list.length && list.every((item) => item.config_status === "SYNCED")) {
    return "ok";
  }
  return "muted";
}

function policySyncAllSynced(items) {
  const list = items || [];
  return list.length > 0 && list.every((item) => item.config_status === "SYNCED");
}

function policySyncPeriodLabel(period) {
  if (!period || period.value == null) {
    return "";
  }
  const value = Number(period.value);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  const units = period.units;
  if (units === "minutes") {
    if (value === 1) {
      return "каждую минуту";
    }
    if (value >= 2 && value <= 4) {
      return `каждые ${value} минуты`;
    }
    return `каждые ${value} минут`;
  }
  if (units === "hours") {
    if (value === 1) {
      return "каждый час";
    }
    if (value >= 2 && value <= 4) {
      return `каждые ${value} часа`;
    }
    return `каждые ${value} часов`;
  }
  if (units === "days") {
    if (value === 1) {
      return "каждый день";
    }
    if (value >= 2 && value <= 4) {
      return `каждые ${value} дня`;
    }
    return `каждые ${value} дней`;
  }
  return String(value);
}

function policySyncScheduleText(schedule) {
  if (!schedule) {
    return { text: "Автосинхронизация: неизвестно", tone: "muted" };
  }
  if (!schedule.enabled) {
    return { text: "Автосинхронизация выключена", tone: "off" };
  }
  const period = policySyncPeriodLabel(schedule.period);
  return {
    text: period ? `Автосинхронизация включена · ${period}` : "Автосинхронизация включена",
    tone: "on",
  };
}

async function policySyncLoadSchedule() {
  try {
    const tenant = await api(POLICY_SYNC_CURRENT_TENANT);
    const id = tenant && tenant.id;
    if (!id) {
      return null;
    }
    const body = await api(`/config/tenants/${id}/sync_schedule`);
    if (!body || typeof body !== "object") {
      return null;
    }
    return {
      enabled: Boolean(body.enabled),
      period: body.period || null,
    };
  } catch (error) {
    return null;
  }
}

function policySyncFormatAt(value) {
  if (value == null || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }
  const date = new Date(number > 1e12 ? number : number * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

function policySyncStatusLabel(item) {
  if (!item) {
    return { text: "", tone: "muted" };
  }
  if (item.last_sync_status === "IN_PROGRESS" || policySyncSendingIds.has(item.id)) {
    return { text: "Синхронизация…", tone: "progress" };
  }
  if (item.config_status === "ERROR" || item.last_sync_status === "FAILED") {
    return { text: "Ошибка синхронизации", tone: "error" };
  }
  if (item.config_status === "NOT_SYNCED") {
    return { text: "Требуется синхронизация", tone: "warn" };
  }
  if (item.config_status === "SYNCED") {
    return { text: "Конфигурация применена", tone: "ok" };
  }
  return { text: String(item.config_status || ""), tone: "muted" };
}

function policySyncDot(item) {
  if (!item) {
    return "muted";
  }
  if (item.config_status === "ERROR" || item.last_sync_status === "FAILED") {
    return "error";
  }
  if (item.last_sync_status === "IN_PROGRESS") {
    return "progress";
  }
  if (item.config_status === "NOT_SYNCED") {
    return "warn";
  }
  const pods = policySyncPodsFor(item.id);
  if (pods && pods.summary === "FAILED") {
    return "error";
  }
  if (pods && pods.summary === "UPDATING") {
    return "progress";
  }
  if (item.config_status === "SYNCED") {
    return "ok";
  }
  return "muted";
}

function policySyncPodNotifText(pods) {
  if (!pods) {
    return "";
  }
  const first = (pods.notifications || []).find((item) => item && item.key);
  if (first && POLICY_SYNC_POD_NOTIF[first.key]) {
    return POLICY_SYNC_POD_NOTIF[first.key];
  }
  if (pods.summary === "UPDATING") {
    return POLICY_SYNC_POD_NOTIF.config_applying_in_progress;
  }
  if (pods.summary === "FAILED") {
    return POLICY_SYNC_POD_NOTIF.number_of_cores_have_applying_failures;
  }
  if (pods.summary === "OK") {
    return POLICY_SYNC_POD_NOTIF.config_applied_successfully;
  }
  if (pods.summary === "NO_CONFIGURATION") {
    return "Нет конфигурации модулей обработки трафика";
  }
  return "";
}

function policySyncCoreTone(status) {
  if (status === "APPLIED") {
    return "ok";
  }
  if (status === "APPLYING" || status === "OBSOLETE_CONFIG") {
    return "progress";
  }
  if (status === "FAILED") {
    return "error";
  }
  return "muted";
}

function policySyncSvg(name) {
  if (name === "cloud") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M14.1 7.4A4.1 4.1 0 0 0 6.2 6.6 3.4 3.4 0 0 0 6.1 13.4h7.9a2.9 2.9 0 0 0 .1-6Zm-4.7 6.6v-3.4H7.3L10 7.5l2.7 3.1h-1.9v3.4H9.4Z"/></svg>';
  }
  if (name === "check") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M8.2 14.2 4.3 10.3l1.4-1.4 2.5 2.5 5.3-5.3 1.4 1.4z"/></svg>';
  }
  if (name === "warn") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 2.2 17.8 16H2.2L10 2.2Zm-.9 4.6h1.8v5.2H9.1V6.8Zm0 7h1.8V15H9.1v-1.2Z"/></svg>';
  }
  if (name === "info") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm.8 11.2H9.2v-5h1.6v5Zm0-6.2H9.2V5.9h1.6v1.6Z"/></svg>';
  }
  if (name === "send") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M2.5 10.1 16.8 3.1 10.9 17.4l-1.9-5.5-6.5-1.8Zm3 .3 4.1 1.1.9 2.6 3.4-8.2-8.4 4.5Z"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M5 3h10v14H5zm1.5 1.5v1.5h7V4.5zm0 3v1.5h7V7.5zm0 3v1.5h7V10.5zm0 3V15h4v-1.5z"/></svg>';
}

function ensurePolicySyncHost() {
  const slot = policySyncSlot();
  if (!slot) {
    return null;
  }
  let host = policySyncHost();
  if (host && host.parentElement !== slot) {
    host.remove();
    host = null;
  }
  if (host) {
    const theme = policySyncTheme();
    if (theme) {
      theme.dataset.theme = pageTheme();
    }
    return host;
  }
  host = document.createElement("div");
  host.id = POLICY_SYNC_ID;
  host.style.cssText = "all:initial;display:inline-flex;flex:0 0 auto;align-items:center;align-self:center;height:32px;margin-left:8px;vertical-align:middle;";
  const theme = attachUi(host);
  if (!theme) {
    return null;
  }
  theme.innerHTML = `
    <div class="ptaf-ps">
      <button type="button" class="ptaf-ps-trigger" aria-haspopup="dialog" aria-expanded="false" title="Статус политики и модулей">
        <span class="ptaf-ps-group">
          <span class="ptaf-ps-cloud">${policySyncSvg("cloud")}</span>
          <span class="ptaf-ps-servers"></span>
        </span>
      </button>
      <div class="ptaf-ps-pop" hidden role="dialog" aria-label="Статус политики и модулей">
        <div class="ptaf-ps-head">
          <div class="ptaf-ps-title"></div>
          <div class="ptaf-ps-sub"></div>
          <div class="ptaf-ps-schedule" hidden></div>
        </div>
        <div class="ptaf-ps-body"></div>
        <div class="ptaf-ps-error" hidden></div>
      </div>
    </div>
  `;
  const trigger = theme.querySelector(".ptaf-ps-trigger");
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePolicySyncPop();
  });
  slot.append(host);
  return host;
}

function removePolicySyncHost() {
  closePolicySyncPop();
  const host = policySyncHost();
  if (host) {
    host.remove();
  }
}

function renderPolicySyncTrigger(theme) {
  const group = theme.querySelector(".ptaf-ps-group");
  const cloud = theme.querySelector(".ptaf-ps-cloud");
  const servers = theme.querySelector(".ptaf-ps-servers");
  const tone = policySyncCloudTone(policySyncItems);
  const alert = tone === "warn" || tone === "error" || policySyncAlert(policySyncItems);
  group.classList.toggle("is-alert", alert);
  group.dataset.tone = tone;
  cloud.hidden = false;
  cloud.dataset.tone = tone;
  cloud.innerHTML = policySyncSvg("cloud");
  servers.innerHTML = "";
  const shown = policySyncItems.slice(0, 6);
  shown.forEach((item) => {
    const node = document.createElement("span");
    node.className = "ptaf-ps-server";
    node.dataset.dot = policySyncDot(item);
    node.innerHTML = `${policySyncSvg("server")}<span class="ptaf-ps-dot"></span>`;
    node.title = item.name || "";
    servers.append(node);
  });
  if (!shown.length) {
    const node = document.createElement("span");
    node.className = "ptaf-ps-server";
    node.dataset.dot = "muted";
    node.innerHTML = `${policySyncSvg("server")}<span class="ptaf-ps-dot"></span>`;
    servers.append(node);
  }
}

function appendPolicySyncPods(target, pods, options) {
  const opts = options || {};
  const block = document.createElement("div");
  block.className = "ptaf-ps-pods";

  const label = document.createElement("div");
  label.className = "ptaf-ps-pods-label";
  label.textContent = opts.label || "Динамические поды";
  block.append(label);

  if (!pods) {
    const empty = document.createElement("div");
    empty.className = "ptaf-ps-pods-note";
    empty.textContent = "Статус модулей недоступен";
    block.append(empty);
    target.append(block);
    return;
  }

  if (pods.total > 0) {
    const bar = document.createElement("div");
    bar.className = "ptaf-ps-pods-bar";
    pods.cores.forEach((core) => {
      const seg = document.createElement("span");
      seg.className = "ptaf-ps-pods-seg";
      seg.dataset.tone = policySyncCoreTone(core && core.status);
      seg.title = (core && (core.name || core.node_ip || core.status)) || "";
      bar.append(seg);
    });
    block.append(bar);
  }

  const meta = document.createElement("div");
  meta.className = "ptaf-ps-pods-meta";
  const when = policySyncFormatAt(pods.configAt);
  if (when) {
    const row = document.createElement("div");
    row.textContent = `Обновлено ${when}`;
    meta.append(row);
  }
  const count = document.createElement("div");
  if (pods.summary === "UPDATING") {
    count.textContent = `Обновлено подов ${pods.applied} / ${pods.total}`;
  } else {
    count.textContent = `Доступно подов ${pods.total}`;
  }
  meta.append(count);
  if (pods.summary === "UPDATING") {
    const started = policySyncFormatAt(pods.startAt);
    if (started) {
      const start = document.createElement("div");
      start.textContent = `Начало применения ${started}`;
      meta.append(start);
    }
  }
  block.append(meta);

  const noteText = policySyncPodNotifText(pods);
  if (noteText) {
    const note = document.createElement("div");
    note.className = "ptaf-ps-pods-note";
    note.dataset.tone = pods.summary === "FAILED" ? "error" : pods.summary === "UPDATING" ? "progress" : "ok";
    note.innerHTML = `<span class="ptaf-ps-mark">${policySyncSvg("info")}</span>`;
    note.append(document.createTextNode(noteText));
    block.append(note);
  }

  target.append(block);
}

function renderPolicySyncCard(item) {
  const status = policySyncStatusLabel(item);
  const when = policySyncFormatAt(item.last_sync_at);
  const pods = policySyncPodsFor(item.id);
  const sending = policySyncSendingIds.has(item.id);
  const card = document.createElement("div");
  card.className = "ptaf-ps-card";
  card.dataset.tone = status.tone;

  const top = document.createElement("div");
  top.className = "ptaf-ps-card-top";

  const main = document.createElement("div");
  main.className = "ptaf-ps-card-main";

  const icon = document.createElement("span");
  icon.className = "ptaf-ps-card-icon";
  icon.innerHTML = policySyncSvg("server");
  main.append(icon);

  const text = document.createElement("div");
  text.className = "ptaf-ps-card-text";

  const name = document.createElement("div");
  name.className = "ptaf-ps-card-name";
  name.textContent = item.name || item.id || "Installation";
  text.append(name);

  const statusRow = document.createElement("div");
  statusRow.className = "ptaf-ps-card-status";
  statusRow.dataset.tone = status.tone;
  const mark = document.createElement("span");
  mark.className = "ptaf-ps-mark";
  mark.innerHTML = status.tone === "ok" ? policySyncSvg("check") : policySyncSvg("warn");
  statusRow.append(mark, document.createTextNode(status.text));
  text.append(statusRow);

  if (when) {
    const meta = document.createElement("div");
    meta.className = "ptaf-ps-card-meta";
    meta.textContent = when;
    text.append(meta);
  }
  main.append(text);
  top.append(main);

  if (policySyncPending(item) || sending) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ptaf-ps-send";
    button.innerHTML = `${policySyncSvg("send")}<span>Отправить</span>`;
    button.disabled = sending || item.last_sync_status === "IN_PROGRESS";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendPolicySync(item.id);
    });
    top.append(button);
  }

  card.append(top);
  appendPolicySyncPods(card, pods);
  return card;
}

function renderPolicySyncSourceCard() {
  const card = document.createElement("div");
  card.className = "ptaf-ps-card ptaf-ps-card-source";
  const top = document.createElement("div");
  top.className = "ptaf-ps-card-top";
  const main = document.createElement("div");
  main.className = "ptaf-ps-card-main";
  const icon = document.createElement("span");
  icon.className = "ptaf-ps-card-icon";
  icon.innerHTML = policySyncSvg("server");
  main.append(icon);
  const text = document.createElement("div");
  text.className = "ptaf-ps-card-text";
  const name = document.createElement("div");
  name.className = "ptaf-ps-card-name";
  name.innerHTML = '<span class="ptaf-ps-badge">Экземпляр-источник</span>';
  text.append(name);
  main.append(text);
  top.append(main);
  card.append(top);
  appendPolicySyncPods(card, policySyncLocalPods);
  return card;
}

function renderPolicySyncPop(theme) {
  const title = theme.querySelector(".ptaf-ps-title");
  const sub = theme.querySelector(".ptaf-ps-sub");
  const scheduleNode = theme.querySelector(".ptaf-ps-schedule");
  const body = theme.querySelector(".ptaf-ps-body");
  const error = theme.querySelector(".ptaf-ps-error");
  const allSynced = policySyncAllSynced(policySyncItems);
  const podsBusy = policySyncAlert(policySyncItems) && allSynced;

  if (!allSynced && policySyncItems.some((item) => item.config_status === "ERROR")) {
    title.textContent = "Ошибка синхронизации политики";
    sub.textContent = "Проверьте статус управляемых инсталляций и повторите отправку";
  } else if (!allSynced) {
    title.textContent = "Изменена политика безопасности";
    sub.textContent = "Ожидает применения. Можно отправить на любую инсталляцию";
  } else if (podsBusy) {
    title.textContent = "Конфигурация модулей обновляется";
    sub.textContent = "Политика синхронна. Следите за применением на подах";
  } else {
    title.textContent = "Конфигурация синхронна";
    sub.textContent = "Политика и модули обработки трафика на управляемых инсталляциях";
  }

  const schedule = policySyncScheduleText(policySyncSchedule);
  scheduleNode.hidden = false;
  scheduleNode.dataset.tone = schedule.tone;
  scheduleNode.textContent = schedule.text;

  body.innerHTML = "";
  body.append(renderPolicySyncSourceCard());
  policySyncItems.forEach((item) => {
    body.append(renderPolicySyncCard(item));
  });

  if (policySyncError) {
    error.hidden = false;
    error.textContent = policySyncError;
  } else {
    error.hidden = true;
    error.textContent = "";
  }
}

function placePolicySyncPop() {
  const theme = policySyncTheme();
  if (!theme || !policySyncOpen) {
    return;
  }
  const trigger = theme.querySelector(".ptaf-ps-trigger");
  const pop = theme.querySelector(".ptaf-ps-pop");
  if (!trigger || !pop || pop.hidden) {
    return;
  }
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(460, window.innerWidth - 16);
  let left = rect.right - width;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + 8;
  pop.style.width = `${width}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  const box = pop.getBoundingClientRect();
  if (box.bottom > window.innerHeight - 8) {
    top = Math.max(8, rect.top - box.height - 8);
    pop.style.top = `${top}px`;
  }
}

function openPolicySyncPop() {
  const theme = policySyncTheme();
  if (!theme) {
    return;
  }
  policySyncOpen = true;
  const trigger = theme.querySelector(".ptaf-ps-trigger");
  const pop = theme.querySelector(".ptaf-ps-pop");
  trigger.setAttribute("aria-expanded", "true");
  pop.hidden = false;
  renderPolicySyncPop(theme);
  placePolicySyncPop();
  document.addEventListener("mousedown", onPolicySyncOutside, true);
  document.addEventListener("keydown", onPolicySyncKey);
  window.addEventListener("resize", placePolicySyncPop);
  window.addEventListener("scroll", placePolicySyncPop, true);
  refreshPolicySync(true);
}

function closePolicySyncPop() {
  policySyncOpen = false;
  document.removeEventListener("mousedown", onPolicySyncOutside, true);
  document.removeEventListener("keydown", onPolicySyncKey);
  window.removeEventListener("resize", placePolicySyncPop);
  window.removeEventListener("scroll", placePolicySyncPop, true);
  const theme = policySyncTheme();
  if (!theme) {
    return;
  }
  const trigger = theme.querySelector(".ptaf-ps-trigger");
  const pop = theme.querySelector(".ptaf-ps-pop");
  if (trigger) {
    trigger.setAttribute("aria-expanded", "false");
  }
  if (pop) {
    pop.hidden = true;
  }
}

function togglePolicySyncPop() {
  if (policySyncOpen) {
    closePolicySyncPop();
  } else {
    openPolicySyncPop();
  }
}

function onPolicySyncOutside(event) {
  const host = policySyncHost();
  if (!host) {
    return;
  }
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.includes(host) || host.contains(event.target)) {
    return;
  }
  closePolicySyncPop();
}

function onPolicySyncKey(event) {
  if (event.key === "Escape") {
    closePolicySyncPop();
  }
}

function paintPolicySync() {
  const theme = policySyncTheme();
  if (!theme) {
    return;
  }
  theme.dataset.theme = pageTheme();
  renderPolicySyncTrigger(theme);
  if (policySyncOpen) {
    renderPolicySyncPop(theme);
    placePolicySyncPop();
  }
}

async function policySyncLoadPods(items) {
  let local = null;
  try {
    local = policySyncParsePods(await api(POLICY_SYNC_PODS));
  } catch (error) {
    local = null;
  }
  const entries = await Promise.all((items || []).map(async (item) => {
    if (!item || !item.id) {
      return null;
    }
    try {
      const path = `/installation/${item.id}/proxy/${encodeURIComponent("config/configuration_statuses/last")}`;
      return [item.id, policySyncParsePods(await api(path))];
    } catch (error) {
      return [item.id, null];
    }
  }));
  const map = {};
  entries.forEach((entry) => {
    if (entry) {
      map[entry[0]] = entry[1];
    }
  });
  return { local, map };
}

async function refreshPolicySync(force) {
  if (policySyncStopped || !policySyncEnabled || policySyncUnavailable) {
    return;
  }
  if (policySyncLoading && !force) {
    return;
  }
  if (!getAccessToken()) {
    return;
  }
  const token = ++policySyncFetchToken;
  policySyncLoading = true;
  try {
    const body = await api(POLICY_SYNC_STATUSES);
    if (token !== policySyncFetchToken || policySyncStopped) {
      return;
    }
    const items = policySyncItemsList(body).filter((item) => item && item.id);
    policySyncItems = items;
    policySyncError = "";
    policySyncUnavailable = false;
    if (!items.length) {
      removePolicySyncHost();
      return;
    }
    const [pods, schedule] = await Promise.all([
      policySyncLoadPods(items),
      policySyncLoadSchedule(),
    ]);
    if (token !== policySyncFetchToken || policySyncStopped) {
      return;
    }
    policySyncLocalPods = pods.local;
    policySyncPods = pods.map;
    policySyncSchedule = schedule;
    if (!ensurePolicySyncHost()) {
      return;
    }
    paintPolicySync();
  } catch (error) {
    if (token !== policySyncFetchToken || policySyncStopped) {
      return;
    }
    if (error && (error.status === 404 || error.status === 403)) {
      policySyncUnavailable = true;
      policySyncItems = [];
      policySyncPods = {};
      policySyncLocalPods = null;
      policySyncSchedule = null;
      removePolicySyncHost();
      return;
    }
    policySyncError = error && error.message ? error.message : "Не удалось загрузить статусы";
    if (policySyncHost()) {
      paintPolicySync();
    }
  } finally {
    if (token === policySyncFetchToken) {
      policySyncLoading = false;
    }
  }
}

function policySyncItemDone(item) {
  if (!item) {
    return true;
  }
  const syncDone = item.config_status === "SYNCED"
    || item.last_sync_status === "SUCCESS"
    || item.last_sync_status === "FAILED"
    || item.config_status === "ERROR";
  const pods = policySyncPodsFor(item.id);
  const podsDone = !pods || pods.summary === "OK" || pods.summary === "FAILED" || pods.summary === "NO_CONFIGURATION";
  return syncDone && podsDone;
}

function schedulePolicySyncPoll() {
  if (policySyncPollTimer) {
    clearTimeout(policySyncPollTimer);
    policySyncPollTimer = 0;
  }
  if (policySyncPollLeft <= 0 || policySyncSendingIds.size === 0) {
    policySyncSendingIds.clear();
    policySyncPollLeft = 0;
    paintPolicySync();
    return;
  }
  policySyncPollTimer = setTimeout(async () => {
    policySyncPollTimer = 0;
    policySyncPollLeft -= 1;
    await refreshPolicySync(true);
    [...policySyncSendingIds].forEach((id) => {
      const target = policySyncItems.find((item) => item.id === id);
      if (policySyncItemDone(target)) {
        policySyncSendingIds.delete(id);
      }
    });
    if (policySyncSendingIds.size === 0 || policySyncPollLeft <= 0) {
      policySyncSendingIds.clear();
      policySyncPollLeft = 0;
      paintPolicySync();
      return;
    }
    schedulePolicySyncPoll();
  }, POLICY_SYNC_POLL_MS);
}

async function sendPolicySync(installationId) {
  if (!installationId || policySyncSendingIds.has(installationId)) {
    return;
  }
  policySyncSendingIds.add(installationId);
  policySyncError = "";
  paintPolicySync();
  try {
    await api(POLICY_SYNC_SEND, {
      method: "POST",
      body: { installation_id: installationId },
    });
    policySyncPollLeft = Math.max(policySyncPollLeft, POLICY_SYNC_POLL_MAX);
    schedulePolicySyncPoll();
    await refreshPolicySync(true);
  } catch (error) {
    policySyncSendingIds.delete(installationId);
    policySyncError = error && error.message ? error.message : "Не удалось отправить конфигурацию";
    paintPolicySync();
  }
}

function ensurePolicySyncRefresh() {
  if (policySyncRefreshTimer || policySyncStopped || !policySyncEnabled) {
    return;
  }
  policySyncRefreshTimer = setInterval(() => {
    if (policySyncStopped || !policySyncEnabled || policySyncUnavailable) {
      return;
    }
    if (!policySyncSlot()) {
      return;
    }
    refreshPolicySync(false);
  }, POLICY_SYNC_REFRESH_MS);
}

function syncPolicySync() {
  if (policySyncStopped || !policySyncAlive() || typeof attachUi !== "function") {
    stopPolicySync();
    return;
  }
  if (!policySyncEnabled) {
    removePolicySyncHost();
    if (policySyncRefreshTimer) {
      clearInterval(policySyncRefreshTimer);
      policySyncRefreshTimer = 0;
    }
    return;
  }
  const slot = policySyncSlot();
  if (!slot) {
    removePolicySyncHost();
    return;
  }
  ensurePolicySyncRefresh();
  if (policySyncUnavailable) {
    return;
  }
  if (policySyncItems.length) {
    if (!ensurePolicySyncHost()) {
      return;
    }
    paintPolicySync();
  }
  refreshPolicySync(false);
}

function schedulePolicySync() {
  if (policySyncStopped || policySyncFrame) {
    return;
  }
  policySyncFrame = requestAnimationFrame(() => {
    policySyncFrame = 0;
    syncPolicySync();
  });
}

function policySyncNodeRelevant(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  if (node.id === POLICY_SYNC_ID) {
    return true;
  }
  return Boolean(
    node.matches("ptaf-top-panel, .config") ||
    node.querySelector("ptaf-top-panel, .config, #" + POLICY_SYNC_ID)
  );
}

function watchPolicySync() {
  if (policySyncObserver || policySyncStopped) {
    return;
  }
  policySyncObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (policySyncNodeRelevant(mutation.target)) {
        schedulePolicySync();
        return;
      }
      for (const node of mutation.addedNodes) {
        if (policySyncNodeRelevant(node)) {
          schedulePolicySync();
          return;
        }
      }
      for (const node of mutation.removedNodes) {
        if (policySyncNodeRelevant(node)) {
          schedulePolicySync();
          return;
        }
      }
    }
  });
  if (document.body) {
    policySyncObserver.observe(document.body, { childList: true, subtree: true });
  }
}

pluginSetting("policySync", true, (enabled) => {
  policySyncEnabled = enabled;
  policySyncUnavailable = false;
  schedulePolicySync();
});

watchPolicySync();
schedulePolicySync();

if (!window.__ptafPolicySyncHistory) {
  window.__ptafPolicySyncHistory = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedPolicySyncHistory() {
      const result = original.apply(this, arguments);
      schedulePolicySync();
      return result;
    };
  }
  window.addEventListener("popstate", schedulePolicySync);
}
