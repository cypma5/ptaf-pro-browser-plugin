const DASH_OV_SEVERITY = [
  { id: "", label: "Все" },
  { id: "none", label: "Нет" },
  { id: "low", label: "Низкая" },
  { id: "medium", label: "Средняя" },
  { id: "high", label: "Высокая" },
];

const DASH_OV_LEVELS = [
  { id: "high", label: "Высокая" },
  { id: "medium", label: "Средняя" },
  { id: "low", label: "Низкая" },
  { id: "none", label: "Нет" },
];

const DASH_OV_CLASS = {
  attack: { label: "Атака", color: "#e06b5c" },
  weakness: { label: "Уязвимость", color: "#e0a045" },
  incident: { label: "Инцидент", color: "#c46bd4" },
  info: { label: "Инфо", color: "#8d93a8" },
};

let dashOvPreset = "1d";
let dashOvCustom = null;
let dashOvApps = [];
let dashOvSelected = new Set();
let dashOvSeverity = "";
let dashOvAuto = true;
let dashOvTimer = 0;
let dashOvToken = 0;
let dashOvActive = false;

function dashOvZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    return "UTC";
  }
}

function dashOvRange() {
  return dashTimeRange(dashOvPreset, dashOvCustom);
}

function dashOvAppFilter() {
  if (!dashOvSelected.size) {
    return "";
  }
  return [...dashOvSelected].map((id) => `app_id == ${id}`).join(" or ");
}

function dashOvCountFilter() {
  const apps = dashOvAppFilter();
  const severity = dashOvSeverity ? `event_severity == ${dashOvSeverity}` : "";
  if (apps && severity) {
    return `(${apps}) and ${severity}`;
  }
  return apps || severity;
}

function dashOvCompact(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  if (abs < 1000) {
    return String(Math.round(number));
  }
  const digits = abs >= 10000 ? 0 : 1;
  const text = (number / 1000).toFixed(digits).replace(".", ",").replace(",0", "");
  return `${text}\u202fK`;
}

function dashOvPercent(share) {
  const pct = share * 100;
  if (Math.abs(pct - Math.round(pct)) < 0.05) {
    return `${Math.round(pct)}%`;
  }
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

function dashOvClock(timestamp) {
  const date = new Date(timestamp * 1000);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dashOvNice(max) {
  if (max <= 0) {
    return 1;
  }
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = max / pow;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * pow;
}

function dashOvFlag(code) {
  const country = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return "";
  }
  return [...country].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function dashOvTop(items, labelOf) {
  const rows = items.map((item) => ({
    label: labelOf(item),
    count: Number(item.count) || 0,
    extra: item,
  })).filter((row) => row.label);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) {
    return [];
  }
  const sorted = rows.sort((left, right) => right.count - left.count);
  const top = sorted.slice(0, 5).map((row) => ({
    label: row.label,
    count: row.count,
    share: row.count / total,
    extra: row.extra,
  }));
  const rest = sorted.slice(5).reduce((sum, row) => sum + row.count, 0);
  if (rest > 0) {
    top.push({ label: "Прочее", count: rest, share: rest / total, remainder: true });
  }
  return top;
}

function dashOvPost(path, body) {
  return api(path, { method: "POST", body });
}

function dashOvCard(title, note) {
  const card = document.createElement("section");
  card.className = "ptaf-ov-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);
  if (note) {
    const text = document.createElement("p");
    text.className = "ptaf-ov-note";
    text.textContent = note;
    card.append(text);
  }
  const body = document.createElement("div");
  body.className = "ptaf-ov-body";
  card.append(body);
  return { card, body };
}

function dashOvMessage(body, text) {
  body.replaceChildren();
  const note = document.createElement("p");
  note.className = "ptaf-ov-empty";
  note.textContent = text;
  body.append(note);
}

function dashOvStat(title, value, note) {
  const card = document.createElement("article");
  card.className = "ptaf-ov-stat";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const number = document.createElement("p");
  number.className = "ptaf-ov-stat-value";
  number.textContent = value;
  const caption = document.createElement("p");
  caption.textContent = note;
  card.append(heading, number, caption);
  return card;
}

function dashOvLegend(items) {
  const row = document.createElement("div");
  row.className = "ptaf-ov-legend";
  items.forEach((item) => {
    const chip = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.style.background = item.color;
    const text = item.value === "" || item.value == null ? item.label : `${item.label} ${dashOvCompact(item.value)}`;
    chip.append(swatch, document.createTextNode(text));
    row.append(chip);
  });
  return row;
}

function dashOvStacked(body, buckets, series, colors) {
  body.replaceChildren();
  if (!buckets.length) {
    dashOvMessage(body, "Нет данных за выбранный период");
    return;
  }
  const totals = buckets.map((_, index) => series.reduce((sum, list) => sum + (list.values[index] || 0), 0));
  const max = dashOvNice(Math.max(...totals, 0));
  const width = 640;
  const height = 168;
  const padLeft = 36;
  const padBottom = 22;
  const innerW = width - padLeft - 8;
  const innerH = height - padBottom - 8;
  const slot = innerW / buckets.length;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("ptaf-ov-chart");
  [0, 0.5, 1].forEach((part) => {
    const value = max * (1 - part);
    const y = 8 + innerH * part;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padLeft));
    line.setAttribute("x2", String(width - 8));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "ptaf-ov-grid");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", String(y + 4));
    label.setAttribute("class", "ptaf-ov-axis");
    label.textContent = dashOvCompact(value);
    svg.append(line, label);
  });
  buckets.forEach((bucket, index) => {
    let y = 8 + innerH;
    const x = padLeft + index * slot + slot * 0.14;
    const barW = Math.max(1, slot * 0.72);
    series.forEach((list) => {
      const value = list.values[index] || 0;
      if (!value) {
        return;
      }
      const barH = (value / max) * innerH;
      y -= barH;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(barW));
      rect.setAttribute("height", String(Math.max(barH, 0.5)));
      rect.setAttribute("fill", colors[list.key]);
      const bits = series.map((item) => `${item.label}: ${dashOvCompact(item.values[index] || 0)}`).join(", ");
      const hint = document.createElementNS("http://www.w3.org/2000/svg", "title");
      hint.appendChild(document.createTextNode(`${dashOvClock(bucket)} — ${bits}`));
      rect.appendChild(hint);
      svg.appendChild(rect);
    });
  });
  const marks = [0, Math.floor(buckets.length / 2), buckets.length - 1].filter((index, pos, list) => list.indexOf(index) === pos);
  marks.forEach((index) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(padLeft + index * slot));
    label.setAttribute("y", String(height - 4));
    label.setAttribute("class", "ptaf-ov-axis");
    label.textContent = dashOvClock(buckets[index]);
    svg.append(label);
  });
  body.append(svg);
}

function dashOvLines(body, total, blocked) {
  body.replaceChildren();
  const points = total.length ? total : blocked;
  if (!points.length) {
    dashOvMessage(body, "Нет данных за выбранный период");
    return;
  }
  const max = dashOvNice(Math.max(...total.map((point) => point.value), ...blocked.map((point) => point.value), 0));
  const width = 640;
  const height = 180;
  const padLeft = 36;
  const padBottom = 22;
  const innerW = width - padLeft - 8;
  const innerH = height - padBottom - 8;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("ptaf-ov-chart");
  const start = points[0].time;
  const span = Math.max(1, points[points.length - 1].time - start);
  function pathOf(series, color) {
    if (!series.length) {
      return;
    }
    const d = series.map((point, index) => {
      const x = padLeft + ((point.time - start) / span) * innerW;
      const y = 8 + innerH - (point.value / max) * innerH;
      return `${index ? "L" : "M"} ${x} ${y}`;
    }).join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "1.6");
    svg.append(path);
  }
  [0, 0.5, 1].forEach((part) => {
    const y = 8 + innerH * part;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padLeft));
    line.setAttribute("x2", String(width - 8));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "ptaf-ov-grid");
    svg.append(line);
  });
  pathOf(total, "#5b8def");
  pathOf(blocked, "#e06b5c");
  [0, Math.floor(points.length / 2), points.length - 1].filter((index, pos, list) => list.indexOf(index) === pos).forEach((index) => {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const x = padLeft + ((points[index].time - start) / span) * innerW;
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(height - 4));
    label.setAttribute("class", "ptaf-ov-axis");
    label.textContent = dashOvClock(points[index].time);
    svg.append(label);
  });
  body.append(svg);
}

function dashOvShares(body, rows) {
  body.replaceChildren();
  if (!rows.length) {
    dashOvMessage(body, "Нет событий за выбранный период");
    return;
  }
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "ptaf-ov-share";
    const name = document.createElement("span");
    name.className = "ptaf-ov-share-name";
    name.textContent = row.label;
    const track = document.createElement("span");
    track.className = "ptaf-ov-share-track";
    const bar = document.createElement("i");
    bar.style.width = `${Math.max(2, row.share * 100)}%`;
    if (row.color) {
      bar.style.background = row.color;
    }
    track.append(bar);
    const meta = document.createElement("span");
    meta.className = "ptaf-ov-share-meta";
    meta.textContent = `${dashOvPercent(row.share)}  ${dashOvCompact(row.count)}`;
    item.append(name, track, meta);
    body.append(item);
  });
}

function dashOvSourceRows(items) {
  const byIp = new Map();
  items.forEach((item) => {
    const group = item.group || {};
    const ip = group.client_ip || "—";
    let row = byIp.get(ip);
    if (!row) {
      row = { ip, country: group.client_country || "", total: 0, counts: {} };
      byIp.set(ip, row);
    }
    if (!row.country && group.client_country) {
      row.country = group.client_country;
    }
    const level = group.event_severity || "none";
    const count = Number(item.count) || 0;
    row.counts[level] = (row.counts[level] || 0) + count;
    row.total += count;
  });
  return [...byIp.values()]
    .sort((left, right) => right.total - left.total || left.ip.localeCompare(right.ip, "ru"))
    .slice(0, 5);
}

function dashOvSources(body, items) {
  body.replaceChildren();
  const rows = dashOvSourceRows(items);
  if (!rows.length) {
    dashOvMessage(body, "Нет событий за выбранный период");
    return;
  }
  rows.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "ptaf-ov-source";
    const flag = document.createElement("span");
    flag.className = "ptaf-ov-flag";
    flag.textContent = dashOvFlag(entry.country) || "•";
    const ip = document.createElement("span");
    ip.className = "ptaf-ov-source-ip";
    ip.textContent = entry.ip;
    const levels = document.createElement("span");
    levels.className = "ptaf-ov-levels";
    const known = new Set(DASH_OV_LEVELS.map((level) => level.id));
    const order = DASH_OV_LEVELS.concat(
      Object.keys(entry.counts)
        .filter((id) => !known.has(id))
        .sort()
        .map((id) => ({ id, label: id })),
    );
    order.forEach((level) => {
      const count = entry.counts[level.id] || 0;
      if (!count) {
        return;
      }
      const chip = document.createElement("span");
      chip.className = `ptaf-ov-level ptaf-ov-level-${level.id}`;
      chip.textContent = dashOvCompact(count);
      chip.title = `${level.label}: ${count}`;
      levels.append(chip);
    });
    row.append(flag, ip, levels);
    body.append(row);
  });
}

function dashOvTable(body, items) {
  body.replaceChildren();
  if (!items.length) {
    dashOvMessage(body, "Нет событий за выбранный период");
    return;
  }
  const table = document.createElement("table");
  table.className = "ptaf-ov-table";
  const head = document.createElement("tr");
  ["Событие безопасности", "Приложение", "Сраб."].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    head.append(cell);
  });
  table.append(head);
  items.forEach((item) => {
    const group = item.group || {};
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const title = document.createElement("div");
    title.textContent = group.rule_name || group.rule_id || "—";
    const badge = document.createElement("span");
    badge.className = `ptaf-ov-badge ptaf-ov-badge-${group.event_severity || "none"}`;
    const known = DASH_OV_SEVERITY.find((entry) => entry.id === group.event_severity);
    badge.textContent = known ? known.label : "Нет";
    name.append(title, badge);
    const app = document.createElement("td");
    app.textContent = group.app_name || "—";
    const count = document.createElement("td");
    count.textContent = dashOvCompact(item.count);
    row.append(name, app, count);
    table.append(row);
  });
  body.append(table);
}

function dashOvSeries(items, key, field) {
  const sorted = [...items].sort((left, right) => left.timestamp - right.timestamp);
  const values = sorted.map((bucket) => {
    const found = (bucket.items || []).find((item) => item[field] === key || item.label === key || item.severity === key);
    return found ? Number(found.count) || 0 : 0;
  });
  return { timestamps: sorted.map((bucket) => bucket.timestamp), values };
}

function dashOvPoints(payload) {
  const list = Array.isArray(payload) ? payload : (payload && payload.items) || [];
  return list.map((point) => ({
    time: Number(Array.isArray(point) ? point[0] : point.timestamp),
    value: Number(Array.isArray(point) ? point[1] : (point.value != null ? point.value : point.count)) || 0,
  })).filter((point) => Number.isFinite(point.time)).sort((left, right) => left.time - right.time);
}

function dashOvResult(settled) {
  if (settled.status === "fulfilled") {
    return { ok: true, data: settled.value };
  }
  return { ok: false, error: settled.reason && settled.reason.message ? settled.reason.message : "Не удалось прочитать данные" };
}

function dashOverviewEnsure(theme) {
  const root = theme.querySelector(".ptaf-dash-overview");
  if (!root || root.dataset.ready === "1") {
    return root;
  }
  root.dataset.ready = "1";
  root.innerHTML = [
    '<div class="ptaf-ov-toolbar">',
    '  <div class="ptaf-ov-time"></div>',
    '  <div class="ptaf-ov-apps">',
    '    <button type="button" class="ptaf-ov-apps-button">Приложения</button>',
    '    <div class="ptaf-ov-apps-menu" hidden></div>',
    "  </div>",
    '  <label class="ptaf-ov-auto"><input type="checkbox" checked> Автообновление</label>',
    "</div>",
    '<p class="ptaf-ov-status" hidden></p>',
    '<div class="ptaf-ov-top">',
    '  <div class="ptaf-ov-stats"></div>',
    '  <div class="ptaf-ov-charts"></div>',
    "</div>",
    '<div class="ptaf-ov-mid"></div>',
    '<div class="ptaf-ov-bottom"></div>',
    '<div class="ptaf-ov-attack"></div>',
  ].join("");
  const timeRange = dashMountTimeChoice(root.querySelector(".ptaf-ov-time"), root, {
    get preset() {
      return dashOvPreset;
    },
    set preset(value) {
      dashOvPreset = value;
    },
    get custom() {
      return dashOvCustom;
    },
    set custom(value) {
      dashOvCustom = value;
    },
  }, () => {
    dashOverviewLoad(theme);
  });
  root.append(timeRange);
  const appsButton = root.querySelector(".ptaf-ov-apps-button");
  const appsMenu = root.querySelector(".ptaf-ov-apps-menu");
  appsButton.addEventListener("click", () => {
    appsMenu.hidden = !appsMenu.hidden;
  });
  root.addEventListener("click", (event) => {
    if (!event.target.closest(".ptaf-ov-apps")) {
      appsMenu.hidden = true;
    }
  });
  root.querySelector(".ptaf-ov-auto input").checked = dashOvAuto;
  root.querySelector(".ptaf-ov-auto input").addEventListener("change", (event) => {
    dashOvAuto = event.target.checked;
    if (dashOvAuto) {
      dashOverviewArm(theme);
    } else {
      dashOverviewDisarm();
    }
  });
  return root;
}

function dashOvFillApps(theme) {
  const menu = theme.querySelector(".ptaf-ov-apps-menu");
  const button = theme.querySelector(".ptaf-ov-apps-button");
  if (!menu || !button) {
    return;
  }
  menu.replaceChildren();
  if (!dashOvApps.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-ov-empty";
    empty.textContent = "Нет веб-приложений";
    menu.append(empty);
  }
  dashOvApps.forEach((app) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = dashOvSelected.has(app.id);
    input.addEventListener("change", () => {
      if (input.checked) {
        dashOvSelected.add(app.id);
      } else {
        dashOvSelected.delete(app.id);
      }
      button.textContent = dashOvSelected.size ? `Приложения: ${dashOvSelected.size}` : "Приложения";
      dashOverviewLoad(theme);
    });
    label.append(input, document.createTextNode(app.name));
    menu.append(label);
  });
  button.textContent = dashOvSelected.size ? `Приложения: ${dashOvSelected.size}` : "Приложения";
}

function dashOvGone(settled) {
  return settled.status === "rejected" && settled.reason && settled.reason.status === 404;
}

function dashOvChartTotal(settled) {
  if (!settled || settled.status !== "fulfilled") {
    return null;
  }
  const items = (settled.value && settled.value.items) || [];
  return items.reduce((sum, bucket) => {
    return sum + (bucket.items || []).reduce((inner, item) => inner + (Number(item.count) || 0), 0);
  }, 0);
}

function dashOvGroupText(group, key) {
  const value = group && group[key];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  }
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function dashOvBulletin(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const id = text.match(/PT-\d{4}-\d+/i);
  return id ? id[0].toUpperCase() : text;
}

function dashOvActionColor(name) {
  const text = String(name || "").toLowerCase();
  if (/block|блокир|close|закры/.test(text)) {
    return "#e06b5c";
  }
  if (/log|журнал/.test(text)) {
    return "#e0a045";
  }
  return "#5b8def";
}

function dashOvClassColor(name) {
  const known = DASH_OV_CLASS[String(name || "").toLowerCase()];
  return known ? known.color : "#8d93a8";
}

function dashOvClassLabel(name) {
  const known = DASH_OV_CLASS[String(name || "").toLowerCase()];
  return known ? known.label : String(name || "");
}

function dashOvCodeColor(code) {
  const number = Number(code);
  if (number >= 500) {
    return "#e06b5c";
  }
  if (number >= 400) {
    return "#e0a045";
  }
  if (number >= 300) {
    return "#5b8def";
  }
  if (number >= 200) {
    return "#2f9e6b";
  }
  return "#8d93a8";
}

function dashOvShareCard(host, title, note, settled, labelOf, colorOf) {
  const result = dashOvResult(settled);
  if (!result.ok) {
    return;
  }
  const card = dashOvCard(title, note);
  const rows = dashOvTop((result.data && result.data.items) || [], labelOf);
  rows.forEach((row) => {
    if (!row.remainder && colorOf) {
      row.color = colorOf(row.label);
    }
  });
  if (!rows.length) {
    dashOvMessage(card.body, "Нет событий за выбранный период");
  } else {
    dashOvShares(card.body, rows);
  }
  host.append(card.card);
}

function dashOvTargetSettled(pack) {
  const path = dashOvResult(pack.paths);
  const host = dashOvResult(pack.hosts);
  const uri = dashOvResult(pack.uris);
  if (path.ok && dashOvTop(path.data.items || [], (item) => dashOvGroupText(item.group, "request_path")).length) {
    return { settled: pack.paths, key: "request_path" };
  }
  if (host.ok && dashOvTop(host.data.items || [], (item) => dashOvGroupText(item.group, "request_host")).length) {
    return { settled: pack.hosts, key: "request_host" };
  }
  if (uri.ok) {
    return { settled: pack.uris, key: "request_uri" };
  }
  if (path.ok) {
    return { settled: pack.paths, key: "request_path" };
  }
  if (host.ok) {
    return { settled: pack.hosts, key: "request_host" };
  }
  return null;
}

function dashOvStatusCard(host, settled) {
  const result = dashOvResult(settled);
  if (!result.ok) {
    return;
  }
  const items = (result.data && result.data.items) || [];
  const byCode = new Map();
  let passed = 0;
  let numeric = false;
  items.forEach((item) => {
    const group = item.group || {};
    const code = dashOvGroupText(group, "response_status_code");
    const count = Number(item.count) || 0;
    if (!/^\d{3}$/.test(code)) {
      return;
    }
    numeric = true;
    byCode.set(code, (byCode.get(code) || 0) + count);
    if (group.event_severity === "high" && code.startsWith("2")) {
      passed += count;
    }
  });
  const card = dashOvCard("Коды ответа", "Код ответа приложения на запрос, по которому сработало правило");
  if (!numeric) {
    dashOvMessage(card.body, "Коды ответа в событиях не заполнены");
    host.append(card.card);
    return;
  }
  const line = document.createElement("p");
  line.className = "ptaf-ov-note";
  line.textContent = passed
    ? `${dashOvCompact(passed)} событий высокой критичности получили ответ 2xx`
    : "Событий высокой критичности с ответом 2xx нет";
  card.card.insertBefore(line, card.body);
  const rows = [...byCode.entries()]
    .map(([code, count]) => ({ label: code, count, color: dashOvCodeColor(code) }))
    .sort((left, right) => right.count - left.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const top = rows.slice(0, 5).map((row) => ({
    label: row.label,
    count: row.count,
    share: row.count / total,
    color: row.color,
  }));
  const rest = rows.slice(5).reduce((sum, row) => sum + row.count, 0);
  if (rest > 0) {
    top.push({ label: "Прочее", count: rest, share: rest / total, remainder: true });
  }
  dashOvShares(card.body, top);
  host.append(card.card);
}

function dashOvAttack(root, pack) {
  let host = root.querySelector(".ptaf-ov-attack");
  if (!host) {
    host = document.createElement("div");
    host.className = "ptaf-ov-attack";
    root.append(host);
  }
  host.replaceChildren();
  dashOvShareCard(
    host,
    "Действия",
    "Block и Log по событиям. На стенде без метрики блокировок это единственный такой разрез.",
    pack.actions,
    (item) => dashOvGroupText(item.group, "event_actions"),
    dashOvActionColor,
  );
  dashOvShareCard(
    host,
    "Класс события",
    "Атака, уязвимость, инцидент и инфо считаются отдельно от топа правил.",
    pack.classes,
    (item) => dashOvClassLabel(dashOvGroupText(item.group, "event_class")),
    (label) => {
      const found = Object.values(DASH_OV_CLASS).find((entry) => entry.label === label);
      return found ? found.color : dashOvClassColor(label);
    },
  );
  const target = dashOvTargetSettled(pack);
  if (target) {
    dashOvShareCard(
      host,
      "Цели атак",
      "Адреса, по которым приходили события.",
      target.settled,
      (item) => dashOvGroupText(item.group, target.key),
      () => "#5b8def",
    );
  }
  dashOvShareCard(
    host,
    "Бюллетени",
    "Номера бюллетеней PT из классификации события.",
    pack.bulletins,
    (item) => dashOvBulletin(dashOvGroupText(item.group, "classifications")),
    () => "#e06b5c",
  );
  dashOvStatusCard(host, pack.statuses);
  host.hidden = host.childElementCount === 0;
}

function dashOverviewRender(theme, pack) {
  const root = dashOverviewEnsure(theme);
  const stats = root.querySelector(".ptaf-ov-stats");
  const charts = root.querySelector(".ptaf-ov-charts");
  const mid = root.querySelector(".ptaf-ov-mid");
  const bottom = root.querySelector(".ptaf-ov-bottom");
  stats.replaceChildren();
  charts.replaceChildren();
  mid.replaceChildren();
  bottom.replaceChildren();

  const requests = dashOvResult(pack.requests);
  const blocked = dashOvResult(pack.blocked);
  const apps = dashOvResult(pack.apps);
  const requestsGone = dashOvGone(pack.requests);
  const blockedGone = dashOvGone(pack.blocked);
  const corePoints = pack.coreRps && pack.coreRps.status === "fulfilled" ? dashOvPoints(pack.coreRps.value) : null;
  if (requests.ok) {
    stats.append(dashOvStat(
      "Всего запросов",
      dashOvCompact(requests.data && requests.data.value),
      "Запросов обработано за выбранный интервал",
    ));
  } else if (requestsGone && corePoints) {
    const estimated = corePoints.reduce((sum, point) => sum + point.value * pack.granularity, 0);
    const note = dashOvSelected.size
      ? "Оценка по RPS ядра всего стенда. Фильтр приложений на неё не действует."
      : "Оценка по RPS ядра. Метрика total_requests в этой версии отсутствует.";
    stats.append(dashOvStat("Всего запросов", dashOvCompact(estimated), note));
  } else if (requestsGone) {
    stats.append(dashOvStat("Всего запросов", "—", "Метрика запросов в этой версии отсутствует"));
  } else {
    stats.append(dashOvStat("Всего запросов", "—", requests.error));
  }
  if (blocked.ok) {
    stats.append(dashOvStat(
      "Угроз заблокировано",
      dashOvCompact(blocked.data && blocked.data.value),
      "Всего угроз заблокировано за выбранный интервал",
    ));
  } else if (blockedGone && dashOvChartTotal(pack.chart) != null) {
    stats.append(dashOvStat(
      "События безопасности",
      dashOvCompact(dashOvChartTotal(pack.chart)),
      "Метрика заблокированных угроз в этой версии отсутствует",
    ));
  } else if (blockedGone) {
    stats.append(dashOvStat("Угроз заблокировано", "—", "Метрика заблокированных угроз в этой версии отсутствует"));
  } else {
    stats.append(dashOvStat("Угроз заблокировано", "—", blocked.error));
  }
  stats.append(dashOvStat(
    "Всего приложений",
    apps.ok ? dashOvCompact(apps.data && apps.data.total) : "—",
    apps.ok ? "Приложения, в которых были зарегистрированы события безопасности" : apps.error,
  ));

  const histogram = dashOvResult(pack.histogram);
  const attacks = dashOvCard("Таймлайн атак");
  if (!histogram.ok) {
    dashOvMessage(
      attacks.body,
      dashOvGone(pack.histogram)
        ? "Таймлайн блокировок и регистраций в этой версии отсутствует"
        : histogram.error,
    );
  } else {
    const items = (histogram.data && histogram.data.items) || [];
    const blockedSeries = dashOvSeries(items, "blocked", "label");
    const loggedSeries = dashOvSeries(items, "logged", "label");
    const blockedSum = blockedSeries.values.reduce((sum, value) => sum + value, 0);
    const loggedSum = loggedSeries.values.reduce((sum, value) => sum + value, 0);
    attacks.card.insertBefore(dashOvLegend([
      { label: "Заблокировано", value: blockedSum, color: "#e06b5c" },
      { label: "Зарегистрировано", value: loggedSum, color: "#e0a045" },
    ]), attacks.body);
    dashOvStacked(attacks.body, blockedSeries.timestamps, [
      { key: "blocked", label: "Заблокировано", values: blockedSeries.values },
      { key: "logged", label: "Зарегистрировано", values: loggedSeries.values },
    ], { blocked: "#e06b5c", logged: "#e0a045" });
  }
  charts.append(attacks.card);

  const chart = dashOvResult(pack.chart);
  const severity = dashOvCard("События по уровню опасности");
  if (!chart.ok) {
    dashOvMessage(severity.body, chart.error);
  } else {
    const items = (chart.data && chart.data.items) || [];
    const levels = [
      { key: "low", label: "Низкая", color: "#3d7ef0" },
      { key: "medium", label: "Средняя", color: "#e0a045" },
      { key: "high", label: "Высокая", color: "#e06b5c" },
      { key: "none", label: "Нет опасности", color: "#8d93a8" },
    ];
    const series = levels.map((level) => Object.assign(dashOvSeries(items, level.key, "severity"), level));
    severity.card.insertBefore(dashOvLegend(series.map((level) => ({
      label: level.label,
      value: level.values.reduce((sum, value) => sum + value, 0),
      color: level.color,
    }))), severity.body);
    dashOvStacked(
      severity.body,
      series[0].timestamps,
      series.map((level) => ({ key: level.key, label: level.label, values: level.values })),
      { low: "#3d7ef0", medium: "#e0a045", high: "#e06b5c", none: "#8d93a8" },
    );
  }
  charts.append(severity.card);

  const rules = dashOvResult(pack.rules);
  const types = dashOvCard("Топ типов атак", "Доля событий безопасности по сработавшим правилам");
  if (!rules.ok) {
    dashOvMessage(types.body, rules.error);
  } else {
    dashOvShares(types.body, dashOvTop(rules.data.items || [], (item) => (item.group && item.group.rule_name) || "—"));
  }
  mid.append(types.card);

  const appShare = dashOvCard("Топ приложений под атакой", "Доля событий безопасности по приложениям");
  if (!apps.ok) {
    dashOvMessage(appShare.body, apps.error);
  } else {
    dashOvShares(appShare.body, dashOvTop(apps.data.items || [], (item) => (item.group && item.group.app_name) || "—"));
  }
  mid.append(appShare.card);

  const traffic = dashOvCard("Общий поток трафика");
  const rps = dashOvResult(pack.rps);
  const rpsBlocked = dashOvResult(pack.rpsBlocked);
  if (rps.ok || rpsBlocked.ok) {
    traffic.card.insertBefore(dashOvLegend([
      { label: "Всего", value: "", color: "#5b8def" },
      { label: "Заблокировано", value: "", color: "#e06b5c" },
    ]), traffic.body);
    dashOvLines(traffic.body, rps.ok ? dashOvPoints(rps.data) : [], rpsBlocked.ok ? dashOvPoints(rpsBlocked.data) : []);
  } else if (corePoints) {
    const note = dashOvSelected.size
      ? "RPS ядра всего стенда. Фильтр приложений на него не действует."
      : "RPS ядра. Раздельные линии всего и заблокированного трафика в этой версии отсутствуют.";
    traffic.card.insertBefore(dashOvLegend([{ label: "RPS ядра", value: "", color: "#5b8def" }]), traffic.body);
    const caption = document.createElement("p");
    caption.className = "ptaf-ov-note";
    caption.textContent = note;
    traffic.card.insertBefore(caption, traffic.body);
    dashOvLines(traffic.body, corePoints, []);
  } else if (dashOvGone(pack.rps)) {
    const reason = pack.coreRps && pack.coreRps.status === "rejected" ? dashOvResult(pack.coreRps).error : "";
    dashOvMessage(traffic.body, reason || "Поток трафика в этой версии недоступен");
  } else {
    dashOvMessage(traffic.body, rps.error || rpsBlocked.error);
  }
  mid.append(traffic.card);

  const sources = dashOvResult(pack.sources);
  const sourceCard = dashOvCard("Топ источников атак", "IP-адреса с наибольшим числом событий атак");
  if (!sources.ok) {
    dashOvMessage(sourceCard.body, sources.error);
  } else {
    dashOvSources(sourceCard.body, sources.data.items || []);
  }
  bottom.append(sourceCard.card);

  const table = dashOvResult(pack.table);
  const rulesCard = dashOvCard("Топ типов атак по критичности", "Наиболее часто сработавшие правила");
  const filters = document.createElement("div");
  filters.className = "ptaf-ov-severity";
  DASH_OV_SEVERITY.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label;
    button.classList.toggle("is-on", entry.id === dashOvSeverity);
    button.addEventListener("click", () => {
      dashOvSeverity = entry.id;
      dashOverviewLoad(theme);
    });
    filters.append(button);
  });
  rulesCard.card.insertBefore(filters, rulesCard.body);
  if (!table.ok) {
    dashOvMessage(rulesCard.body, table.error);
  } else {
    dashOvTable(rulesCard.body, table.data.items || []);
  }
  bottom.append(rulesCard.card);
  dashOvAttack(root, pack);
}

async function dashOverviewLoad(theme) {
  const root = dashOverviewEnsure(theme);
  const token = dashOvToken + 1;
  dashOvToken = token;
  const status = root.querySelector(".ptaf-ov-status");
  status.hidden = false;
  status.textContent = "Читаем обзор…";
  const range = dashOvRange();
  const zone = dashOvZone();
  const granularity = Math.max(1, Math.round((range.end - range.start) / 48));
  const appIds = [...dashOvSelected];
  const filters = appIds.length ? { application_id: appIds } : null;
  const eventFilter = dashOvAppFilter();
  const tableFilter = dashOvCountFilter();
  function metric(extra) {
    const body = Object.assign({ start: range.start, end: range.end }, extra);
    if (filters) {
      body.filters = filters;
    }
    return body;
  }
  function events(groupby, extra) {
    const body = Object.assign({
      timerange: { start: range.start, end: range.end },
      groupby,
    }, extra || {});
    if (eventFilter && !body.filter) {
      body.filter = eventFilter;
    }
    return body;
  }
  const jobs = await Promise.allSettled([
    dashOvPost("/metrics/scalar", metric({ scalar: "total_requests", timezone: zone })),
    dashOvPost("/metrics/scalar", metric({ scalar: "interval_sum_blocked_events", timezone: zone })),
    dashOvPost("/metrics/histogram", metric({ histogram: "log_block", timezone: zone, granularity })),
    dashOvPost("/threats/events/chart_query", {
      filter: eventFilter,
      timerange: { start: range.start, end: range.end },
      granularity,
      timezone: zone,
    }),
    dashOvPost("/threats/events/count_query", events(["rule_id", "rule_name", "event_severity"])),
    dashOvPost("/threats/events/count_query", events(["app_name"])),
    dashOvPost("/threats/events/count_query", events(["client_ip", "client_country", "event_severity"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 100 },
    })),
    dashOvPost("/threats/events/count_query", {
      timerange: { start: range.start, end: range.end },
      groupby: ["rule_id", "rule_name", "event_severity", "app_name"],
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 8 },
      ...(tableFilter ? { filter: tableFilter } : {}),
    }),
    dashOvPost("/metrics/timeseries", metric({ name: "rps" })),
    dashOvPost("/metrics/timeseries", metric({ name: "rps_blocked" })),
    api("/config/applications"),
    dashOvPost("/threats/events/count_query", events(["event_actions"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["event_class"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["request_path"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["request_host"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["request_uri"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["classifications"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 20 },
    })),
    dashOvPost("/threats/events/count_query", events(["response_status_code", "event_severity"], {
      sort: { key: "count", order: "desc" },
      page: { offset: 0, length: 40 },
    })),
  ]);
  if (token !== dashOvToken || !dashOvActive) {
    return;
  }
  const [requests, blocked, histogram, chart, rules, appCounts, sources, table, rps, rpsBlocked, applications, actions, classes, paths, hosts, uris, bulletins, statuses] = jobs;
  let coreRps = null;
  if (dashOvGone(rps)) {
    const period = encodeURIComponent(JSON.stringify({ start: range.start, end: range.end }));
    const query = `granularity=${granularity}&timezone=${encodeURIComponent(zone)}&period=${period}`;
    try {
      coreRps = { status: "fulfilled", value: await api(`/monitoring/core_rps?${query}`) };
    } catch (error) {
      coreRps = { status: "rejected", reason: error };
    }
    if (token !== dashOvToken || !dashOvActive) {
      return;
    }
  }
  if (applications.status === "fulfilled") {
    const items = (typeof dashItems === "function" ? dashItems(applications.value) : [])
      .filter((item) => item && item.id)
      .map((item) => ({ id: item.id, name: item.name || item.id }))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
    dashOvApps = items;
    dashOvSelected.forEach((id) => {
      if (!dashOvApps.some((app) => app.id === id)) {
        dashOvSelected.delete(id);
      }
    });
    dashOvFillApps(theme);
  }
  const rejected = jobs.filter((job) => job.status === "rejected");
  status.hidden = rejected.length !== jobs.length;
  if (!status.hidden) {
    status.textContent = dashOvResult(rejected[0]).error;
    return;
  }
  try {
    dashOverviewRender(theme, {
      requests,
      blocked,
      histogram,
      chart,
      rules,
      apps: appCounts,
      sources,
      table,
      rps,
      rpsBlocked,
      coreRps,
      granularity,
      actions,
      classes,
      paths,
      hosts,
      uris,
      bulletins,
      statuses,
    });
  } catch (error) {
    status.hidden = false;
    status.textContent = "Не удалось нарисовать обзор";
  }
}

function dashOverviewDisarm() {
  if (dashOvTimer) {
    clearInterval(dashOvTimer);
    dashOvTimer = 0;
  }
}

function dashOverviewArm(theme) {
  dashOverviewDisarm();
  if (!dashOvAuto || !dashOvActive) {
    return;
  }
  dashOvTimer = setInterval(() => {
    if (dashOvActive) {
      dashOverviewLoad(theme);
    }
  }, 15000);
}

function dashOverviewOpen(theme) {
  dashOvActive = true;
  dashOverviewEnsure(theme);
  dashOverviewLoad(theme);
  dashOverviewArm(theme);
}

function dashOverviewPause() {
  dashOvActive = false;
  dashOvToken += 1;
  dashOverviewDisarm();
}

function dashOverviewReload(theme) {
  if (!dashOvActive) {
    dashOverviewOpen(theme);
    return;
  }
  dashOverviewLoad(theme);
  dashOverviewArm(theme);
}
