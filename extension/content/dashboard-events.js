const DASH_EV_WINDOWS = [
  { id: 3600, label: "1 час" },
  { id: 10800, label: "3 часа" },
  { id: 21600, label: "6 часов" },
  { id: 86400, label: "24 часа" },
];

const DASH_EV_LEVELS = [
  { key: "low", label: "Низкая", color: "#3d7ef0" },
  { key: "medium", label: "Средняя", color: "#e0a045" },
  { key: "high", label: "Высокая", color: "#e06b5c" },
  { key: "none", label: "Нет", color: "#8d93a8" },
];

let dashEvActive = false;
let dashEvToken = 0;
let dashEvTimer = 0;
let dashEvAuto = true;
let dashEvInstall = "";
let dashEvTouched = false;
let dashEvWindow = 10800;
let dashEvPinned = true;
let dashEvEnd = 0;
let dashEvPoints = [];
let dashEvRange = { start: 0, end: 0 };

function dashEvNow() {
  return Math.floor(Date.now() / 1000);
}

function dashEvZone() {
  return typeof dashOvZone === "function" ? dashOvZone() : "UTC";
}

function dashEvGranularity(span, target) {
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 86400];
  const raw = Math.max(60, Math.round(span / target));
  return steps.find((step) => step >= raw) || steps[steps.length - 1];
}

function dashEvSelection(now) {
  const rangeEnd = dashEvRange.end || now;
  const rangeStart = dashEvRange.start || rangeEnd - 14 * 86400;
  let finish = dashEvPinned ? rangeEnd : (dashEvEnd || rangeEnd);
  finish = Math.min(rangeEnd, Math.max(rangeStart, finish));
  let start = finish - dashEvWindow;
  if (start < rangeStart) {
    start = rangeStart;
    finish = Math.min(rangeEnd, start + dashEvWindow);
  }
  return { start, end: finish };
}

function dashEvUrl(path, query) {
  const clean = String(path || "").replace(/^\//, "");
  const encoded = dashEvInstall
    ? `/installation/${dashEvInstall}/proxy/${encodeURIComponent(clean)}`
    : `/${clean}`;
  return query ? `${encoded}?${query}` : encoded;
}

function dashEvStamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dashEventsEnsure(theme) {
  const root = theme.querySelector(".ptaf-dash-events");
  if (!root || root.dataset.ready === "1") {
    return root;
  }
  root.dataset.ready = "1";
  root.innerHTML = [
    '<div class="ptaf-ev-toolbar">',
    '  <label>Установка <select class="ptaf-ev-install"></select></label>',
    '  <label>Окно <select class="ptaf-ev-window"></select></label>',
    '  <button type="button" class="ptaf-ev-now">К текущему</button>',
    '  <label class="ptaf-ov-auto"><input type="checkbox" checked> Автообновление</label>',
    "</div>",
    '<p class="ptaf-ev-status" hidden></p>',
    '<section class="ptaf-ev-card">',
    "  <h3>RPS</h3>",
    '  <p class="ptaf-ev-hint">Щелкните или протяните по графику RPS, чтобы выбрать интервал событий</p>',
    '  <div class="ptaf-ev-rps"></div>',
    '  <div class="ptaf-ev-legend"></div>',
    "  <h3>События безопасности</h3>",
    '  <div class="ptaf-ev-events"></div>',
    "</section>",
  ].join("");
  const windowSelect = root.querySelector(".ptaf-ev-window");
  DASH_EV_WINDOWS.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item.id);
    option.textContent = item.label;
    option.selected = item.id === dashEvWindow;
    windowSelect.append(option);
  });
  windowSelect.addEventListener("change", () => {
    dashEvWindow = Number(windowSelect.value) || dashEvWindow;
    dashEventsLoad(theme, false);
  });
  root.querySelector(".ptaf-ev-install").addEventListener("change", (event) => {
    dashEvTouched = true;
    dashEvInstall = event.target.value;
    dashEvPinned = true;
    dashEventsLoad(theme, true);
  });
  root.querySelector(".ptaf-ev-now").addEventListener("click", () => {
    dashEvPinned = true;
    dashEvEnd = 0;
    dashEventsLoad(theme, false);
  });
  const auto = root.querySelector(".ptaf-ov-auto input");
  auto.checked = dashEvAuto;
  auto.addEventListener("change", () => {
    dashEvAuto = auto.checked;
    if (dashEvAuto) {
      dashEventsArm(theme);
    } else {
      dashEventsDisarm();
    }
  });
  return root;
}

function dashEvFillInstalls(theme, items) {
  const select = theme.querySelector(".ptaf-ev-install");
  if (!select) {
    return;
  }
  const current = select.value;
  select.replaceChildren();
  const local = document.createElement("option");
  local.value = "";
  local.textContent = "Текущее пространство";
  select.append(local);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.short_name || item.name || item.id;
    select.append(option);
  });
  if (dashEvInstall && ![...select.options].some((option) => option.value === dashEvInstall)) {
    const extra = document.createElement("option");
    extra.value = dashEvInstall;
    extra.textContent = "Установка из адреса";
    select.append(extra);
  }
  const wanted = dashEvTouched ? current || dashEvInstall : dashEvInstall;
  if ([...select.options].some((option) => option.value === wanted)) {
    select.value = wanted;
  }
  dashEvInstall = select.value;
}

function dashEvPlotX(width, padLeft, padRight, range, time) {
  const span = Math.max(1, range.end - range.start);
  const ratio = (time - range.start) / span;
  return padLeft + Math.min(1, Math.max(0, ratio)) * (width - padLeft - padRight);
}

function dashEvDrawRps(theme) {
  const body = theme.querySelector(".ptaf-ev-rps");
  body.replaceChildren();
  const points = dashEvPoints;
  if (!points.length) {
    const note = document.createElement("p");
    note.className = "ptaf-ov-empty";
    note.textContent = "Нет RPS за последние 14 дней";
    body.append(note);
    return;
  }
  const width = 960;
  const height = 96;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 18;
  const innerH = height - padTop - padBottom;
  const max = (typeof dashOvNice === "function" ? dashOvNice : (value) => value || 1)(Math.max(...points.map((point) => point.value), 0));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("ptaf-ev-chart");
  const selection = dashEvSelection(dashEvNow());
  const x1 = dashEvPlotX(width, padLeft, padRight, dashEvRange, selection.start);
  const x2 = dashEvPlotX(width, padLeft, padRight, dashEvRange, selection.end);
  const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  band.setAttribute("x", String(Math.min(x1, x2)));
  band.setAttribute("y", String(padTop));
  band.setAttribute("width", String(Math.max(2, Math.abs(x2 - x1))));
  band.setAttribute("height", String(innerH));
  band.setAttribute("class", "ptaf-ev-band");
  svg.append(band);
  const baseline = padTop + innerH;
  const coords = points.map((point) => {
    const x = dashEvPlotX(width, padLeft, padRight, dashEvRange, point.time);
    const y = padTop + innerH - (point.value / max) * innerH;
    return { x, y };
  });
  const line = coords.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
  area.setAttribute("d", `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`);
  area.setAttribute("class", "ptaf-ev-area");
  const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
  stroke.setAttribute("d", line);
  stroke.setAttribute("class", "ptaf-ev-line");
  svg.append(area, stroke);
  [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].forEach((point) => {
    if (!point) {
      return;
    }
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(dashEvPlotX(width, padLeft, padRight, dashEvRange, point.time)));
    label.setAttribute("y", String(height - 4));
    label.setAttribute("class", "ptaf-ov-axis");
    label.textContent = typeof dashOvClock === "function" ? dashOvClock(point.time) : "";
    svg.append(label);
  });
  svg.addEventListener("pointerdown", (event) => {
    svg.setPointerCapture(event.pointerId);
    const place = (next) => {
      const box = svg.getBoundingClientRect();
      const ratio = box.width ? (next.clientX - box.left) / box.width : 0;
      const span = Math.max(1, dashEvRange.end - dashEvRange.start);
      const time = dashEvRange.start + ((ratio * width - padLeft) / (width - padLeft - padRight)) * span;
      dashEvPinned = false;
      dashEvEnd = time;
      const nextSelection = dashEvSelection(dashEvNow());
      const left = dashEvPlotX(width, padLeft, padRight, dashEvRange, nextSelection.start);
      const right = dashEvPlotX(width, padLeft, padRight, dashEvRange, nextSelection.end);
      band.setAttribute("x", String(Math.min(left, right)));
      band.setAttribute("width", String(Math.max(2, Math.abs(right - left))));
      const boxStatus = theme.querySelector(".ptaf-ev-status");
      if (boxStatus) {
        boxStatus.hidden = false;
        boxStatus.textContent = `${dashEvStamp(nextSelection.start)} — ${dashEvStamp(nextSelection.end)}`;
      }
    };
    place(event);
    function onMove(next) {
      place(next);
    }
    function onUp() {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      dashEventsLoad(theme, false);
    }
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
  });
  body.append(svg);
}

function dashEvDrawEvents(theme, chart) {
  const body = theme.querySelector(".ptaf-ev-events");
  const legend = theme.querySelector(".ptaf-ev-legend");
  legend.replaceChildren();
  if (!chart.ok) {
    body.replaceChildren();
    const note = document.createElement("p");
    note.className = "ptaf-ov-empty";
    note.textContent = chart.error;
    body.append(note);
    return;
  }
  const items = (chart.data && chart.data.items) || [];
  const series = DASH_EV_LEVELS.map((level) => Object.assign(
    typeof dashOvSeries === "function" ? dashOvSeries(items, level.key, "severity") : { timestamps: [], values: [] },
    level,
  ));
  if (typeof dashOvLegend === "function") {
    legend.append(dashOvLegend(series.map((level) => ({
      label: level.label,
      value: level.values.reduce((sum, value) => sum + value, 0),
      color: level.color,
    }))));
  }
  if (typeof dashOvStacked === "function") {
    dashOvStacked(
      body,
      series[0].timestamps,
      series.map((level) => ({ key: level.key, label: level.label, values: level.values })),
      { low: "#3d7ef0", medium: "#e0a045", high: "#e06b5c", none: "#8d93a8" },
    );
    return;
  }
  body.replaceChildren();
}

async function dashEventsLoad(theme, reloadRps) {
  const root = dashEventsEnsure(theme);
  if (!root) {
    return;
  }
  const token = dashEvToken + 1;
  dashEvToken = token;
  const status = root.querySelector(".ptaf-ev-status");
  status.hidden = false;
  status.textContent = "Читаем RPS и события…";
  const now = dashEvNow();
  if (reloadRps || !dashEvRange.end) {
    dashEvRange = { start: now - 14 * 86400, end: now };
  } else if (dashEvPinned) {
    const span = dashEvRange.end - dashEvRange.start;
    dashEvRange = { start: now - span, end: now };
  }
  const selection = dashEvSelection(now);
  const zone = dashEvZone();
  try {
    if (reloadRps || !dashEvPoints.length) {
      let installs = [];
      try {
        installs = typeof dashItems === "function" ? dashItems(await api("/config/ptaf_installations")) : [];
      } catch (error) {
        installs = [];
      }
      if (!dashEvTouched) {
        dashEvInstall = new URLSearchParams(location.search).get("installationId") || "";
      }
      dashEvFillInstalls(theme, installs);
      const granularity = dashEvGranularity(dashEvRange.end - dashEvRange.start, 160);
      const period = encodeURIComponent(JSON.stringify({ start: dashEvRange.start, end: dashEvRange.end }));
      const query = `granularity=${granularity}&timezone=${encodeURIComponent(zone)}&period=${period}`;
      let payload;
      try {
        payload = await api(dashEvUrl("monitoring/core_rps", query));
      } catch (error) {
        if (!(error && error.status === 404) || dashEvInstall) {
          throw error;
        }
        payload = await api("/metrics/timeseries", {
          method: "POST",
          body: { name: "rps", start: dashEvRange.start, end: dashEvRange.end },
        });
      }
      dashEvPoints = (typeof dashOvPoints === "function" ? dashOvPoints(payload) : []).filter((point) => point.time >= dashEvRange.start && point.time <= dashEvRange.end);
    }
    const eventGranularity = dashEvGranularity(selection.end - selection.start, 36);
    const chart = await api(dashEvUrl("threats/events/chart_query"), {
      method: "POST",
      body: {
        filter: "",
        timerange: { start: selection.start, end: selection.end },
        granularity: eventGranularity,
        timezone: zone,
      },
    });
    if (token !== dashEvToken || !dashEvActive) {
      return;
    }
    status.hidden = true;
    dashEvDrawRps(theme);
    dashEvDrawEvents(theme, { ok: true, data: chart });
    status.hidden = false;
    status.textContent = `${dashEvStamp(selection.start)} — ${dashEvStamp(selection.end)}`;
  } catch (error) {
    if (token !== dashEvToken || !dashEvActive) {
      return;
    }
    status.hidden = false;
    status.textContent = error && error.status === 401
      ? "Сессия истекла. Обновите страницу и войдите снова."
      : (error && error.message) || "Не удалось прочитать графики";
  }
}

function dashEventsDisarm() {
  if (dashEvTimer) {
    clearInterval(dashEvTimer);
    dashEvTimer = 0;
  }
}

function dashEventsArm(theme) {
  dashEventsDisarm();
  if (!dashEvAuto || !dashEvActive) {
    return;
  }
  dashEvTimer = setInterval(() => {
    if (dashEvActive) {
      dashEventsLoad(theme, true);
    }
  }, 15000);
}

function dashEventsOpen(theme) {
  dashEvActive = true;
  dashEventsEnsure(theme);
  dashEventsLoad(theme, true);
  dashEventsArm(theme);
}

function dashEventsPause() {
  dashEvActive = false;
  dashEvToken += 1;
  dashEventsDisarm();
}

function dashEventsReload(theme) {
  if (!dashEvActive) {
    dashEventsOpen(theme);
    return;
  }
  dashEventsLoad(theme, true);
  dashEventsArm(theme);
}
