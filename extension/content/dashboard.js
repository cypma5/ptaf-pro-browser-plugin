const DASH_ITEM_ID = "ptaf-dash-tab";
const DASH_HOST_ID = "ptaf-dash-view";
const DASH_STYLE_ID = "ptaf-dash-page-style";
const DASH_COLORS = ["#5b8def", "#e06ca8", "#3dbe8c", "#e0a045", "#8b7cf7", "#4ec4d4", "#e06b5c", "#a3c44a"];
const DASH_SCHEME_ITEM = /схема конфигурации|configuration scheme/i;

let dashHost = null;
let dashOpen = false;
let dashFrame = 0;
let dashObserver = null;
let dashThemeObserver = null;
let dashResize = null;
let dashStopped = false;
let dashToken = 0;
let dashModel = null;
let dashView = null;
let dashFilterId = "";
let dashSavedLabel = "";
let dashLayoutLock = false;
let dashScreen = "chain";
let dashShowEvents = false;
let dashEventPreset = "1d";
let dashEventCustom = null;
let dashEventCounts = new Map();
let dashEventToken = 0;
let dashInstallIds = [""];

const DASH_EVENT_PRESETS = [
  { id: "5m", label: "За последние 5 минут", seconds: 300 },
  { id: "10m", label: "За последние 10 минут", seconds: 600 },
  { id: "15m", label: "За последние 15 минут", seconds: 900 },
  { id: "30m", label: "За последние 30 минут", seconds: 1800 },
  { id: "1h", label: "За последний час", seconds: 3600 },
  { id: "6h", label: "За последние 6 часов", seconds: 21600 },
  { id: "12h", label: "За последние 12 часов", seconds: 43200 },
  { id: "1d", label: "За последний день", seconds: 86400 },
  { id: "1w", label: "За последнюю неделю", seconds: 604800 },
  { id: "1mo", label: "За последний месяц", seconds: 2592000 },
  { id: "all", label: "За все время", seconds: 0 },
  { id: "custom", label: "За период" },
];

const DASH_EVENT_LEVELS = [
  { id: "high", label: "Высокая" },
  { id: "medium", label: "Средняя" },
  { id: "low", label: "Низкая" },
  { id: "none", label: "Нет" },
];

const DASH_SUBMENU_ID = "ptaf-dash-submenu";

function dashAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id && typeof api === "function" && typeof attachUi === "function");
  } catch (error) {
    return false;
  }
}

function dashItems(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && Array.isArray(body.items)) {
    return body.items;
  }
  return [];
}

function dashText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const nested = value.value || value.name || value.host || value.location || value.path || "";
    return String(nested).trim();
  }
  return "";
}

function dashTextList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(dashText).filter(Boolean);
}

function dashProtocol(balancer) {
  const options = balancer && balancer.protocol_options;
  return options && options.type ? String(options.type) : "";
}

function dashVipAddress(vip) {
  const options = vip && vip.options;
  if (options && options.address) {
    return String(options.address);
  }
  return "";
}

function dashVipTone(vip) {
  const value = vip && vip.status && vip.status.value;
  if (!value || value === "SUCCESS") {
    return "ok";
  }
  return "bad";
}

function dashWorst(left, right) {
  const rank = { ok: 0, warn: 1, bad: 2 };
  return (rank[right] || 0) > (rank[left] || 0) ? right : left;
}

function dashAppTone(mode) {
  if (mode === "ACTIVE_DETECTION" || mode === "PASSIVE") {
    return "warn";
  }
  return "ok";
}

function dashBackendTone(enabled, status) {
  if (enabled === false) {
    return "bad";
  }
  if (status === "STANDBY") {
    return "warn";
  }
  return "ok";
}

function dashProfileBackends(profile) {
  const list = profile && Array.isArray(profile.backends) ? profile.backends : [];
  return list.map((item) => {
    if (typeof item === "string") {
      return { id: item, enabled: true, status: "" };
    }
    if (!item || typeof item !== "object") {
      return null;
    }
    const id = item.id || item.backend_id || "";
    if (!id) {
      return null;
    }
    return {
      id: String(id),
      enabled: item.enabled !== false,
      status: item.status ? String(item.status) : "",
    };
  }).filter(Boolean);
}

function dashListenEndpoints(profile, vipById) {
  const balancer = (profile && profile.balancer) || {};
  const type = balancer.type || "";
  const port = Number(balancer.listen_port) || 0;
  const protocol = dashProtocol(balancer);
  if (type === "EXTERNAL_BALANCER") {
    return [{
      key: `external:${protocol}:${port || 0}`,
      title: "Внешний балансировщик",
      protocol,
      port,
      tone: "ok",
    }];
  }
  const refs = [];
  if (type === "STATIC_BALANCER" && Array.isArray(balancer.vips)) {
    refs.push(...balancer.vips);
  } else if (balancer.vip_id) {
    refs.push(balancer.vip_id);
  }
  if (!refs.length) {
    return [{
      key: `missing:${profile.id || "profile"}:${port}`,
      title: port ? `Адрес не найден:${port}` : "Адрес не найден",
      protocol,
      tone: "bad",
    }];
  }
  return refs.map((ref) => {
    const vipId = typeof ref === "string" ? ref : (ref && ref.id) || "";
    const vip = vipById.get(vipId);
    const address = dashVipAddress(vip);
    if (!address) {
      return {
        key: `missing:${vipId || "vip"}:${port}`,
        title: port ? `Адрес не найден:${port}` : "Адрес не найден",
        protocol,
        tone: "bad",
      };
    }
    return {
      key: `${address}:${port}`,
      title: `${address}:${port}`,
      protocol,
      tone: dashVipTone(vip),
    };
  });
}

function dashByTitle(left, right) {
  return left.title.localeCompare(right.title, "ru");
}

function dashRanks(nodes) {
  const rank = new Map();
  nodes.forEach((node, index) => rank.set(node.id, index));
  return rank;
}

function dashLinkScore(id, edges, rank, neighborOf) {
  const values = [];
  edges.forEach((edge) => {
    const neighbor = neighborOf(edge, id);
    if (neighbor && rank.has(neighbor)) {
      values.push(rank.get(neighbor));
    }
  });
  if (!values.length) {
    return { linked: false, mean: 0, min: 0 };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    linked: true,
    mean: sum / values.length,
    min: Math.min.apply(null, values),
  };
}

function dashOrderByLinks(nodes, edges, rank, neighborOf) {
  return nodes.slice().sort((left, right) => {
    const leftScore = dashLinkScore(left.id, edges, rank, neighborOf);
    const rightScore = dashLinkScore(right.id, edges, rank, neighborOf);
    if (leftScore.linked !== rightScore.linked) {
      return leftScore.linked ? -1 : 1;
    }
    if (leftScore.mean !== rightScore.mean) {
      return leftScore.mean - rightScore.mean;
    }
    if (leftScore.min !== rightScore.min) {
      return leftScore.min - rightScore.min;
    }
    return dashByTitle(left, right);
  });
}

function dashOrderBackends(nodes, edges, appRank, listenRank) {
  const appNeighbor = (edge, id) => (edge.to === id ? edge.from : "");
  const listenNeighbor = (edge, id) => (edge.to === id ? edge.listenId : "");
  return nodes.slice().sort((left, right) => {
    const leftApp = dashLinkScore(left.id, edges, appRank, appNeighbor);
    const rightApp = dashLinkScore(right.id, edges, appRank, appNeighbor);
    if (leftApp.linked !== rightApp.linked) {
      return leftApp.linked ? -1 : 1;
    }
    if (leftApp.mean !== rightApp.mean) {
      return leftApp.mean - rightApp.mean;
    }
    const leftListen = dashLinkScore(left.id, edges, listenRank, listenNeighbor);
    const rightListen = dashLinkScore(right.id, edges, listenRank, listenNeighbor);
    if (leftListen.min !== rightListen.min) {
      return leftListen.min - rightListen.min;
    }
    return dashByTitle(left, right);
  });
}

function dashUnique(list, value) {
  if (value && list.indexOf(value) === -1) {
    list.push(value);
  }
}

function dashBuildGraph(sources) {
  const realms = Array.isArray(sources) ? sources : [sources || {}];
  const multi = realms.length > 1;
  const listenMap = new Map();
  const profileLinks = new Map();
  const appMap = new Map();

  function addListen(endpoint, profile, label) {
    let node = listenMap.get(endpoint.key);
    if (!node) {
      node = {
        id: `listen:${endpoint.key}`,
        kind: "listen",
        title: endpoint.title,
        protocols: [],
        profiles: [],
        port: endpoint.port || 0,
        tone: endpoint.tone || "ok",
      };
      listenMap.set(endpoint.key, node);
    }
    if (endpoint.protocol && node.protocols.indexOf(endpoint.protocol) === -1) {
      node.protocols.push(endpoint.protocol);
    }
    const profileName = (profile && (profile.name || profile.id)) || "";
    const shown = profileName && label ? `${profileName} · ${label}` : profileName;
    dashUnique(node.profiles, shown);
    node.tone = dashWorst(node.tone, endpoint.tone || "ok");
    return node;
  }

  realms.forEach((realm) => {
    const label = realm && realm.label ? String(realm.label) : "";
    const vips = dashItems(realm && realm.vips);
    const profiles = dashItems(realm && realm.profiles);
    const applications = dashItems(realm && realm.applications);
    const backends = dashItems(realm && realm.backends);
    const vipById = new Map(vips.map((vip) => [vip.id, vip]));
    const backendById = new Map(backends.map((backend) => [backend.id, backend]));
    profiles.forEach((profile) => {
      const listenIds = dashListenEndpoints(profile, vipById).map((endpoint) => {
        const key = multi && label ? `${endpoint.key}|${label}` : endpoint.key;
        return addListen(Object.assign({}, endpoint, { key }), profile, multi ? label : "").id;
      });
      profileLinks.set(multi ? `${label}:${profile.id}` : profile.id, {
        listenIds,
        backends: dashProfileBackends(profile),
        backendById,
      });
    });
    applications.forEach((app) => {
      const appKey = multi ? (app.name || app.id) : app.id;
      let node = appMap.get(appKey);
      if (!node) {
        node = {
          id: `app:${appKey}`,
          kind: "app",
          title: app.name || "Веб-приложение",
          eventName: app.name ? String(app.name).trim() : "",
          hosts: [],
          locations: [],
          profileRefs: [],
          tone: "ok",
        };
        appMap.set(appKey, node);
      }
      if (!node.eventName && app.name) {
        node.eventName = String(app.name).trim();
      }
      dashTextList(app.hosts).forEach((host) => dashUnique(node.hosts, host));
      dashTextList(app.locations).forEach((location) => dashUnique(node.locations, location));
      node.tone = dashWorst(node.tone, dashAppTone(app.protection_mode));
      const refs = Array.isArray(app.traffic_profiles) ? app.traffic_profiles : [];
      refs.forEach((ref) => {
        const profileId = typeof ref === "string" ? ref : (ref && (ref.id || ref.traffic_profile_id)) || "";
        if (!profileId) {
          return;
        }
        dashUnique(node.profileRefs, multi ? `${label}:${profileId}` : profileId);
      });
    });
  });

  const apps = [...appMap.values()];

  const backendMap = new Map();
  const edges = [];
  const edgeKeys = new Set();

  function addEdge(from, to, listenId) {
    const key = `${from}|${to}|${listenId}`;
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);
    edges.push({
      id: `edge:${edges.length}`,
      from,
      to,
      listenId,
    });
  }

  apps.forEach((app) => {
    app.profileRefs.forEach((profileId) => {
      const link = profileLinks.get(profileId);
      if (!link) {
        return;
      }
      link.listenIds.forEach((listenId) => {
        addEdge(listenId, app.id, listenId);
        link.backends.forEach((bound) => {
          const catalog = link.backendById.get(bound.id);
          const address = catalog && catalog.address ? String(catalog.address) : "";
          const port = catalog && catalog.port != null && catalog.port !== "" ? String(catalog.port) : "";
          const protocol = catalog && catalog.protocol ? String(catalog.protocol) : "";
          const endpoint = address ? `${address}${port ? `:${port}` : ""}` : "";
          const title = (catalog && catalog.name) || endpoint || bound.id;
          const mergeKey = multi ? `${title}|${endpoint}` : bound.id;
          let node = backendMap.get(mergeKey);
          if (!node) {
            const detailParts = [];
            if (protocol) {
              detailParts.push(protocol);
            }
            if (endpoint && endpoint !== title) {
              detailParts.push(endpoint);
            }
            node = {
              id: `backend:${mergeKey}`,
              kind: "backend",
              title,
              detail: detailParts.join(" · "),
              tone: "ok",
            };
            backendMap.set(mergeKey, node);
          }
          const enabled = bound.enabled !== false && (!catalog || catalog.enabled !== false);
          node.tone = dashWorst(node.tone, dashBackendTone(enabled, bound.status));
          addEdge(app.id, node.id, listenId);
        });
      });
    });
  });

  const listens = [...listenMap.values()].sort(dashByTitle);
  listens.forEach((node, index) => {
    node.color = DASH_COLORS[index % DASH_COLORS.length];
  });
  const colorOf = new Map(listens.map((node) => [node.id, node.color]));
  edges.forEach((edge) => {
    edge.color = colorOf.get(edge.listenId) || DASH_COLORS[0];
  });
  const listenRank = dashRanks(listens);
  const orderedApps = dashOrderByLinks(apps, edges, listenRank, (edge, id) => (edge.to === id ? edge.from : ""));
  const appRank = dashRanks(orderedApps);
  const backendNodes = dashOrderBackends([...backendMap.values()], edges, appRank, listenRank);
  const byId = new Map();
  listens.concat(orderedApps, backendNodes).forEach((node) => byId.set(node.id, node));
  return {
    listens,
    apps: orderedApps,
    backends: backendNodes,
    edges,
    byId,
  };
}

function dashPath(model, id) {
  const nodes = new Set([id]);
  const edgeIds = new Set();
  const node = model.byId.get(id);
  if (!node) {
    return { nodes, edgeIds };
  }
  if (node.kind === "listen") {
    model.edges.forEach((edge) => {
      if (edge.listenId === id) {
        edgeIds.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    });
    return { nodes, edgeIds };
  }
  if (node.kind === "app") {
    model.edges.forEach((edge) => {
      if (edge.from === id || edge.to === id) {
        edgeIds.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    });
    return { nodes, edgeIds };
  }
  const listenIds = new Set();
  model.edges.forEach((edge) => {
    if (edge.to === id) {
      edgeIds.add(edge.id);
      nodes.add(edge.from);
      nodes.add(edge.to);
      listenIds.add(edge.listenId);
    }
  });
  model.edges.forEach((edge) => {
    if (listenIds.has(edge.listenId) && edge.from === edge.listenId && nodes.has(edge.to)) {
      edgeIds.add(edge.id);
      nodes.add(edge.from);
    }
  });
  return { nodes, edgeIds };
}

function dashMenuText(node) {
  return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
}

function dashEnsurePageStyle() {
  let style = document.getElementById(DASH_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = DASH_STYLE_ID;
    (document.head || document.documentElement).append(style);
  }
  const css = [
    "body.ptaf-dash-open ptaf-panel-menu .item.selected:not(#ptaf-dash-tab) {",
    "  color: var(--kbq-foreground-contrast-secondary) !important;",
    "}",
    "body.ptaf-dash-open #ptaf-dash-tab {",
    "  color: var(--kbq-foreground-contrast) !important;",
    "}",
    "#ptaf-dash-submenu {",
    "  position: fixed;",
    "  z-index: 80;",
    "  min-width: 220px;",
    "  padding: 6px;",
    "  border-radius: 8px;",
    "  background: var(--kbq-background-bg, #1c2230);",
    "  color: var(--kbq-foreground-contrast, #fff);",
    "  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);",
    "}",
    "#ptaf-dash-submenu button {",
    "  display: block;",
    "  width: 100%;",
    "  margin: 0;",
    "  padding: 8px 10px;",
    "  border: 0;",
    "  border-radius: 6px;",
    "  background: transparent;",
    "  color: inherit;",
    "  font: inherit;",
    "  text-align: left;",
    "  cursor: pointer;",
    "}",
    "#ptaf-dash-submenu button:hover,",
    "#ptaf-dash-submenu button.is-on {",
    "  background: var(--kbq-states-fade-active, rgba(255, 255, 255, 0.08));",
    "}",
  ].join("\n");
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

function dashCloseSubmenu() {
  const menu = document.getElementById(DASH_SUBMENU_ID);
  if (menu) {
    menu.remove();
  }
}

function dashToggleSubmenu(anchor) {
  if (document.getElementById(DASH_SUBMENU_ID)) {
    dashCloseSubmenu();
    return;
  }
  dashEnsurePageStyle();
  const menu = document.createElement("div");
  menu.id = DASH_SUBMENU_ID;
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  menu.style.left = `${Math.round(Math.max(8, rect.left))}px`;
  [
    ["chain", "Цепочка прослушивания"],
    ["overview", "Обзорный дашборд"],
    ["events", "События и RPS"],
    ["match", "Совпадения"],
  ].forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.screen = id;
    button.textContent = label;
    if (dashOpen && dashScreen === id) {
      button.classList.add("is-on");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dashCloseSubmenu();
      dashOpenScreen(id);
    });
    menu.append(button);
  });
  document.body.append(menu);
}

function dashCreateItem(menu) {
  const source = [...menu.querySelectorAll(".item")].find((item) => item.id !== DASH_ITEM_ID);
  if (!source) {
    return null;
  }
  const item = source.cloneNode(true);
  item.id = DASH_ITEM_ID;
  item.classList.remove("selected");
  item.removeAttribute("routerlink");
  item.removeAttribute("ng-reflect-router-link");
  item.removeAttribute("href");
  const label = item.querySelector(".container") || item;
  label.textContent = "Дашборд";
  item.setAttribute("aria-current", "false");
  item.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  item.addEventListener("click", dashOnItemClick);
  item.addEventListener("keydown", dashOnItemKey);
  const scheme = [...menu.querySelectorAll(".item")].find((entry) => DASH_SCHEME_ITEM.test(dashMenuText(entry)));
  if (scheme && scheme.nextSibling) {
    menu.insertBefore(item, scheme.nextSibling);
  } else {
    menu.append(item);
  }
  return item;
}

function dashStopItemEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function dashOnItemClick(event) {
  dashStopItemEvent(event);
  dashToggleSubmenu(event.currentTarget);
}

function dashOnItemKey(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  dashStopItemEvent(event);
  dashToggleSubmenu(event.currentTarget);
}

function dashApplyChrome() {
  document.querySelectorAll("ptaf-panel-menu").forEach((menu) => {
    let item = menu.querySelector(`#${DASH_ITEM_ID}`);
    if (!item) {
      item = dashCreateItem(menu);
    }
    if (!item) {
      return;
    }
    const current = dashOpen ? "true" : "false";
    if (item.getAttribute("aria-current") !== current) {
      item.setAttribute("aria-current", current);
    }
  });
  document.querySelectorAll(`#${DASH_ITEM_ID}`).forEach((item) => {
    if (!item.closest("ptaf-panel-menu")) {
      item.remove();
    }
  });
  if (document.body) {
    document.body.classList.toggle("ptaf-dash-open", dashOpen);
  }
}

function dashSync() {
  if (dashStopped || !dashAlive()) {
    dashStop();
    return;
  }
  dashEnsurePageStyle();
  dashApplyChrome();
  if (dashHost && dashOpen) {
    dashPlaceHost();
    const theme = dashHost.shadowRoot && dashHost.shadowRoot.querySelector(".ptaf-theme");
    if (theme && typeof pageTheme === "function") {
      theme.dataset.theme = pageTheme();
    }
  }
}

function dashSchedule() {
  if (dashStopped || dashFrame) {
    return;
  }
  dashFrame = requestAnimationFrame(() => {
    dashFrame = 0;
    dashSync();
  });
}

function dashPlaceHost() {
  if (!dashHost) {
    return;
  }
  const panel = document.querySelector("ptaf-top-panel");
  const top = panel ? Math.max(0, panel.getBoundingClientRect().bottom) : 48;
  dashHost.style.top = `${top}px`;
}

function dashEventPad(value) {
  return String(value).padStart(2, "0");
}

function dashEventStamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${dashEventPad(date.getDate())}.${dashEventPad(date.getMonth() + 1)}.${date.getFullYear()} ${dashEventPad(date.getHours())}:${dashEventPad(date.getMinutes())}:${dashEventPad(date.getSeconds())}`;
}

function dashEventDateValue(date) {
  return `${date.getFullYear()}-${dashEventPad(date.getMonth() + 1)}-${dashEventPad(date.getDate())}`;
}

function dashEventTimeValue(date) {
  return `${dashEventPad(date.getHours())}:${dashEventPad(date.getMinutes())}:${dashEventPad(date.getSeconds())}`;
}

function dashEventButtonLabel() {
  if (dashEventPreset === "custom" && dashEventCustom) {
    return `${dashEventStamp(dashEventCustom.start)} — ${dashEventStamp(dashEventCustom.end)}`;
  }
  const preset = DASH_EVENT_PRESETS.find((item) => item.id === dashEventPreset);
  return preset ? preset.label : "За последний день";
}

function dashEventRange() {
  const end = Math.floor(Date.now() / 1000);
  if (dashEventPreset === "custom" && dashEventCustom) {
    return { start: dashEventCustom.start, end: dashEventCustom.end };
  }
  if (dashEventPreset === "all") {
    return { start: 0, end };
  }
  const preset = DASH_EVENT_PRESETS.find((item) => item.id === dashEventPreset);
  const seconds = preset && preset.seconds ? preset.seconds : 86400;
  return { start: Math.max(0, end - seconds), end };
}

function dashEventUrl(installId) {
  const clean = "threats/events/count_query";
  if (!installId) {
    return `/${clean}`;
  }
  return `/installation/${installId}/proxy/${encodeURIComponent(clean)}`;
}

async function dashEventQuery(installId, range) {
  const pageLength = 100;
  const items = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const body = await api(dashEventUrl(installId), {
      method: "POST",
      body: {
        timerange: { start: range.start, end: range.end },
        groupby: ["app_name", "event_severity"],
        page: { offset, length: pageLength },
      },
    });
    const batch = Array.isArray(body) ? body : (body && body.items) || [];
    items.push(...batch);
    const reported = Number(body && body.total);
    total = Number.isFinite(reported) ? reported : items.length;
    if (!batch.length || batch.length < pageLength) {
      break;
    }
    offset += batch.length;
  }
  return { items };
}

function dashEventAbsorb(map, body) {
  const items = Array.isArray(body) ? body : (body && body.items) || [];
  items.forEach((item) => {
    const group = (item && item.group) || item || {};
    const name = typeof group.app_name === "string" ? group.app_name.trim() : "";
    if (!name) {
      return;
    }
    const level = group.event_severity ? String(group.event_severity) : "none";
    const count = Number(item.count) || 0;
    if (!count) {
      return;
    }
    let row = map.get(name);
    if (!row) {
      row = {};
      map.set(name, row);
    }
    row[level] = (row[level] || 0) + count;
  });
}

function dashEventCloseUi(theme) {
  if (!theme) {
    return;
  }
  const menu = theme.querySelector(".ptaf-dash-period-menu");
  if (menu) {
    menu.hidden = true;
  }
  const dialog = theme.querySelector(".ptaf-dash-range");
  if (dialog) {
    dialog.hidden = true;
  }
  const button = theme.querySelector(".ptaf-dash-period-button");
  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
}

function dashEventSyncControls(theme) {
  if (!theme) {
    return;
  }
  const input = theme.querySelector(".ptaf-dash-events-toggle input");
  if (input) {
    input.checked = dashShowEvents;
  }
  const button = theme.querySelector(".ptaf-dash-period-button");
  const menu = theme.querySelector(".ptaf-dash-period-menu");
  if (button) {
    button.disabled = !dashShowEvents;
    button.textContent = dashEventButtonLabel();
    button.title = button.textContent;
    button.setAttribute("aria-expanded", menu && !menu.hidden ? "true" : "false");
  }
  theme.querySelectorAll(".ptaf-dash-period-item").forEach((item) => {
    item.classList.toggle("is-on", item.dataset.preset === dashEventPreset);
  });
}

function dashEventField(theme, edge, part) {
  return theme.querySelector(`.ptaf-dash-range input[data-edge="${edge}"][data-part="${part}"]`);
}

function dashEventWriteFields(theme, start, end) {
  const from = new Date(start * 1000);
  const to = new Date(end * 1000);
  dashEventField(theme, "start", "date").value = dashEventDateValue(from);
  dashEventField(theme, "start", "time").value = dashEventTimeValue(from);
  dashEventField(theme, "end", "date").value = dashEventDateValue(to);
  dashEventField(theme, "end", "time").value = dashEventTimeValue(to);
}

function dashEventRangeNote(theme, message) {
  const note = theme.querySelector(".ptaf-dash-range-error");
  if (!note) {
    return;
  }
  note.hidden = !message;
  note.textContent = message || "";
}

function dashEventParse(dateValue, timeValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || "")) {
    return { error: "Неверная дата" };
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeValue || "")) {
    return { error: "Неверный формат времени" };
  }
  const [year, month, day] = dateValue.split("-").map(Number);
  const parts = timeValue.split(":").map(Number);
  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts.length > 2 ? parts[2] : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return { error: "Неверный формат времени" };
  }
  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { error: "Неверная дата" };
  }
  return { value: Math.floor(date.getTime() / 1000) };
}

function dashEventOpenRange(theme) {
  const dialog = theme.querySelector(".ptaf-dash-range");
  if (!dialog) {
    return;
  }
  const menu = theme.querySelector(".ptaf-dash-period-menu");
  if (menu) {
    menu.hidden = true;
  }
  const now = Math.floor(Date.now() / 1000);
  const range = dashEventCustom || { start: now - 3600, end: now };
  dashEventWriteFields(theme, range.start, range.end);
  dashEventRangeNote(theme, "");
  dialog.hidden = false;
  const first = dashEventField(theme, "start", "time");
  if (first) {
    first.focus();
  }
  dashEventSyncControls(theme);
}

function dashEventSubmitRange(theme, event) {
  event.preventDefault();
  const start = dashEventParse(dashEventField(theme, "start", "date").value, dashEventField(theme, "start", "time").value);
  if (start.error) {
    dashEventRangeNote(theme, start.error);
    return;
  }
  const end = dashEventParse(dashEventField(theme, "end", "date").value, dashEventField(theme, "end", "time").value);
  if (end.error) {
    dashEventRangeNote(theme, end.error);
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  if (start.value > now || end.value > now) {
    dashEventRangeNote(theme, "Дата не должна быть больше сегодняшней");
    return;
  }
  if (start.value > end.value) {
    dashEventRangeNote(theme, "Начало периода не должно быть позднее его конца");
    return;
  }
  dashEventPreset = "custom";
  dashEventCustom = { start: start.value, end: end.value };
  const dialog = theme.querySelector(".ptaf-dash-range");
  if (dialog) {
    dialog.hidden = true;
  }
  dashEventRangeNote(theme, "");
  dashEventSyncControls(theme);
  dashEventLoad(theme);
}

function dashEventBadges(card, node) {
  if (!dashShowEvents || !node.eventName) {
    return;
  }
  const counts = dashEventCounts.get(node.eventName);
  if (!counts) {
    return;
  }
  const known = new Set(DASH_EVENT_LEVELS.map((level) => level.id));
  const levels = DASH_EVENT_LEVELS.concat(
    Object.keys(counts)
      .filter((id) => !known.has(id) && counts[id])
      .sort()
      .map((id) => ({ id, label: id })),
  );
  const row = document.createElement("div");
  row.className = "ptaf-dash-severities";
  levels.forEach((level) => {
    const count = counts[level.id] || 0;
    if (!count) {
      return;
    }
    const chip = document.createElement("span");
    chip.className = `ptaf-dash-sev ptaf-dash-sev-${level.id}`;
    chip.textContent = typeof dashOvCompact === "function" ? dashOvCompact(count) : String(count);
    chip.title = `${level.label}: ${count}`;
    row.append(chip);
  });
  if (row.childElementCount) {
    card.append(row);
  }
}

async function dashEventLoad(theme) {
  if (!theme || !dashShowEvents || dashScreen !== "chain" || !dashOpen) {
    return;
  }
  const token = dashEventToken + 1;
  dashEventToken = token;
  const schemeToken = dashToken;
  dashEventCounts = new Map();
  if (dashModel) {
    dashRender(theme, dashModel);
  }
  const status = theme.querySelector(".ptaf-dash-status");
  const keepScheme = Boolean(status && !status.hidden && status.dataset.kind === "scheme");
  if (!keepScheme) {
    dashSetStatus(theme, "Читаем события…", "events");
  }
  const range = dashEventRange();
  const ids = dashInstallIds.length ? dashInstallIds : [""];
  const jobs = await Promise.allSettled(ids.map((id) => dashEventQuery(id, range)));
  if (token !== dashEventToken || schemeToken !== dashToken || !dashShowEvents || dashScreen !== "chain" || !dashOpen) {
    return;
  }
  const map = new Map();
  let ok = 0;
  let firstError = null;
  jobs.forEach((job) => {
    if (job.status === "fulfilled") {
      ok += 1;
      dashEventAbsorb(map, job.value);
    } else if (!firstError) {
      firstError = job.reason;
    }
  });
  if (!ok) {
    dashEventCounts = new Map();
    if (dashModel) {
      dashRender(theme, dashModel);
    }
    const board = theme.querySelector(".ptaf-dash-board");
    if (board && !board.hidden) {
      dashSetStatus(theme, firstError ? dashErrorText(firstError) : "Не удалось прочитать события.", "events");
    }
    return;
  }
  dashEventCounts = map;
  if (status && status.dataset.kind === "events") {
    dashSetStatus(theme, "");
  }
  if (dashModel) {
    dashRender(theme, dashModel);
  }
}

function dashShell() {
  const root = document.createElement("div");
  root.className = "ptaf-dash";
  root.dataset.screen = "chain";
  root.innerHTML = [
    '<header class="ptaf-dash-bar">',
    '  <div class="ptaf-dash-heading">',
    "    <h2>Дашборд</h2>",
    '    <nav class="ptaf-dash-nav">',
    '      <button type="button" class="ptaf-dash-screen is-on" data-screen="chain" aria-pressed="true">Цепочка прослушивания</button>',
    '      <button type="button" class="ptaf-dash-screen" data-screen="overview" aria-pressed="false">Обзорный дашборд</button>',
    '      <button type="button" class="ptaf-dash-screen" data-screen="events" aria-pressed="false">События и RPS</button>',
    '      <button type="button" class="ptaf-dash-screen" data-screen="match" aria-pressed="false">Совпадения</button>',
    "    </nav>",
    '    <p class="ptaf-dash-subtitle">IP:порт прослушивания → веб-приложение (Host, Location) → защищаемый сервер</p>',
    "  </div>",
    '  <div class="ptaf-dash-tools">',
    '    <label class="ptaf-dash-events-toggle"><input type="checkbox">Отобразить события</label>',
    '    <div class="ptaf-dash-period">',
    '      <button type="button" class="ptaf-dash-period-button" disabled aria-expanded="false" aria-haspopup="true">За последний день</button>',
    '      <div class="ptaf-dash-period-menu" hidden></div>',
    "    </div>",
    '    <button type="button" class="ptaf-dash-clear" hidden>Показать все</button>',
    '    <button type="button" class="ptaf-dash-reload">Обновить</button>',
    "  </div>",
    "</header>",
    '<div class="ptaf-dash-overview" hidden></div>',
    '<div class="ptaf-dash-events" hidden></div>',
    '<div class="ptaf-dash-match" hidden></div>',
    '<div class="ptaf-dash-legend" hidden></div>',
    '<p class="ptaf-dash-filter" hidden></p>',
    '<p class="ptaf-dash-status" hidden></p>',
    '<div class="ptaf-dash-scroll">',
    '  <div class="ptaf-dash-board">',
    '    <svg class="ptaf-dash-links" xmlns="http://www.w3.org/2000/svg"></svg>',
    '    <section class="ptaf-dash-column">',
    "      <h3>Прослушивание</h3>",
    '      <div class="ptaf-dash-cards" data-column="listen"></div>',
    "    </section>",
    '    <section class="ptaf-dash-column">',
    "      <h3>Веб-приложения</h3>",
    '      <div class="ptaf-dash-cards" data-column="app"></div>',
    "    </section>",
    '    <section class="ptaf-dash-column">',
    "      <h3>Защищаемые серверы</h3>",
    '      <div class="ptaf-dash-cards" data-column="backend"></div>',
    "    </section>",
    "  </div>",
    "</div>",
    '<div class="ptaf-dash-range" hidden role="dialog" aria-label="Выбор периода">',
    '  <form class="ptaf-dash-range-card">',
    "    <h3>Выбор периода</h3>",
    '    <div class="ptaf-dash-range-row"><span>с</span>',
    '      <input type="time" step="1" data-edge="start" data-part="time" aria-label="Время начала" required>',
    '      <input type="date" data-edge="start" data-part="date" aria-label="Дата начала" required>',
    "    </div>",
    '    <div class="ptaf-dash-range-row"><span>по</span>',
    '      <input type="time" step="1" data-edge="end" data-part="time" aria-label="Время конца" required>',
    '      <input type="date" data-edge="end" data-part="date" aria-label="Дата конца" required>',
    "    </div>",
    '    <p class="ptaf-dash-range-error" hidden></p>',
    '    <div class="ptaf-dash-range-actions">',
    '      <button type="submit" class="ptaf-dash-range-apply">Применить фильтр</button>',
    '      <button type="button" class="ptaf-dash-range-cancel">Отмена</button>',
    "    </div>",
    "  </form>",
    "</div>",
  ].join("");
  return root;
}

function dashToneTitle(tone) {
  if (tone === "bad") {
    return "ошибка";
  }
  if (tone === "warn") {
    return "внимание";
  }
  return "норма";
}

function dashCard(node) {
  const card = document.createElement("article");
  card.className = "ptaf-dash-card";
  card.dataset.id = node.id;
  card.dataset.kind = node.kind;
  card.tabIndex = 0;
  if (node.color) {
    card.style.setProperty("--dash-color", node.color);
  }
  const dot = document.createElement("span");
  dot.className = "ptaf-dash-dot";
  dot.dataset.tone = node.tone || "ok";
  dot.title = dashToneTitle(node.tone);
  const title = document.createElement("h4");
  title.textContent = node.title;
  card.append(dot, title);
  if (node.kind === "listen") {
    if (node.protocols.length || (node.title === "Внешний балансировщик" && node.port)) {
      const protocol = document.createElement("p");
      const parts = [];
      if (node.protocols.length) {
        parts.push(node.protocols.join(", "));
      }
      if (node.title === "Внешний балансировщик" && node.port) {
        parts.push(`порт ${node.port}`);
      }
      protocol.textContent = parts.join(" · ");
      card.append(protocol);
    }
    if (node.profiles.length) {
      const profiles = document.createElement("p");
      profiles.className = "ptaf-dash-meta";
      profiles.textContent = node.profiles.join(", ");
      card.append(profiles);
    }
  } else if (node.kind === "app") {
    const hosts = document.createElement("p");
    hosts.textContent = `Host: ${node.hosts.length ? node.hosts.join(", ") : "любой Host"}`;
    const locations = document.createElement("p");
    locations.textContent = `Location: ${node.locations.length ? node.locations.join(", ") : "—"}`;
    card.append(hosts, locations);
    dashEventBadges(card, node);
  } else if (node.detail) {
    const detail = document.createElement("p");
    detail.className = "ptaf-dash-meta";
    detail.textContent = node.detail;
    card.append(detail);
  }
  return card;
}

function dashViewOf(model) {
  if (!model) {
    return null;
  }
  if (!dashFilterId || !model.byId.has(dashFilterId)) {
    return model;
  }
  const path = dashPath(model, dashFilterId);
  return {
    listens: model.listens.filter((node) => path.nodes.has(node.id)),
    apps: model.apps.filter((node) => path.nodes.has(node.id)),
    backends: model.backends.filter((node) => path.nodes.has(node.id)),
    edges: model.edges.filter((edge) => path.edgeIds.has(edge.id)),
    byId: model.byId,
  };
}

function dashFillColumn(theme, column, nodes, emptyText) {
  const box = theme.querySelector(`.ptaf-dash-cards[data-column="${column}"]`);
  box.replaceChildren();
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-dash-empty";
    empty.textContent = emptyText;
    box.append(empty);
    return;
  }
  nodes.forEach((node) => box.append(dashCard(node)));
}

function dashRenderLegend(theme, listens) {
  const legend = theme.querySelector(".ptaf-dash-legend");
  legend.replaceChildren();
  if (!listens.length) {
    legend.hidden = true;
    return;
  }
  listens.forEach((node) => {
    const item = document.createElement("span");
    item.className = "ptaf-dash-key";
    const swatch = document.createElement("i");
    swatch.style.background = node.color;
    const label = document.createElement("span");
    const extra = node.title === "Внешний балансировщик"
      ? [node.protocols.join(", "), node.port ? `порт ${node.port}` : ""].filter(Boolean).join(" · ")
      : "";
    label.textContent = extra ? `${node.title} · ${extra}` : node.title;
    item.append(swatch, label);
    legend.append(item);
  });
  legend.hidden = false;
}

function dashApplyFilter(theme, id) {
  if (!dashModel) {
    return;
  }
  dashFilterId = dashFilterId === id ? "" : id;
  dashRender(theme, dashModel);
}

function dashRender(theme, model) {
  dashModel = model;
  if (dashFilterId && !model.byId.has(dashFilterId)) {
    dashFilterId = "";
  }
  dashView = dashViewOf(model);
  if (dashScreen !== "chain") {
    return;
  }
  const board = theme.querySelector(".ptaf-dash-board");
  const filtered = Boolean(dashFilterId);
  const focus = filtered ? model.byId.get(dashFilterId) : null;
  board.classList.remove("is-hot");
  board.hidden = !model.listens.length && !model.apps.length;
  dashFillColumn(theme, "listen", dashView.listens, filtered ? "Нет связанных адресов" : "Нет адресов прослушивания");
  dashFillColumn(theme, "app", dashView.apps, filtered ? "Нет связанных приложений" : "Нет веб-приложений");
  dashFillColumn(theme, "backend", dashView.backends, filtered ? "Нет связанных серверов" : "Нет привязанных серверов");
  board.querySelectorAll(".ptaf-dash-card").forEach((card) => {
    const selected = card.dataset.id === dashFilterId;
    card.classList.toggle("is-filter", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  dashRenderLegend(theme, dashView.listens);
  const clear = theme.querySelector(".ptaf-dash-clear");
  clear.hidden = !filtered;
  const note = theme.querySelector(".ptaf-dash-filter");
  if (note) {
    note.hidden = !focus;
    note.textContent = focus ? `Связи объекта «${focus.title}»` : "";
  }
  requestAnimationFrame(() => dashLayout(theme));
}

function dashLayout(theme) {
  if (dashLayoutLock || !theme || !dashModel) {
    return;
  }
  dashLayoutLock = true;
  try {
    dashDrawLinks(theme);
  } finally {
    dashLayoutLock = false;
  }
}

function dashDrawLinks(theme) {
  const board = theme.querySelector(".ptaf-dash-board");
  const svg = theme.querySelector(".ptaf-dash-links");
  if (!board || !svg || board.hidden) {
    return;
  }
  const boardRect = board.getBoundingClientRect();
  const width = Math.max(board.scrollWidth, boardRect.width);
  const height = Math.max(board.scrollHeight, boardRect.height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.replaceChildren();
  const groups = new Map();
  const viewEdges = (dashView || dashModel).edges;
  viewEdges.forEach((edge) => {
    const key = `${edge.from}>${edge.to}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(edge);
  });
  const shifts = new Map();
  groups.forEach((group) => {
    const mid = (group.length - 1) / 2;
    group.forEach((edge, index) => shifts.set(edge.id, (index - mid) * 8));
  });
  const svgNs = "http://www.w3.org/2000/svg";
  viewEdges.forEach((edge) => {
    const from = board.querySelector(`.ptaf-dash-card[data-id="${CSS.escape(edge.from)}"]`);
    const to = board.querySelector(`.ptaf-dash-card[data-id="${CSS.escape(edge.to)}"]`);
    if (!from || !to) {
      return;
    }
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const shift = shifts.get(edge.id) || 0;
    const x1 = fromRect.right - boardRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - boardRect.top + shift;
    const x2 = toRect.left - boardRect.left;
    const y2 = toRect.top + toRect.height / 2 - boardRect.top + shift;
    const dx = Math.max(36, (x2 - x1) / 2);
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", edge.color);
    path.dataset.edge = edge.id;
    path.classList.add("ptaf-dash-link");
    svg.append(path);
  });
}

function dashHighlight(theme, id) {
  const board = theme.querySelector(".ptaf-dash-board");
  if (!board || !dashModel || !id) {
    if (board) {
      board.classList.remove("is-hot");
      board.querySelectorAll(".is-on, .is-dim").forEach((node) => {
        node.classList.remove("is-on", "is-dim");
      });
    }
    return;
  }
  const path = dashPath(dashModel, id);
  board.classList.add("is-hot");
  board.querySelectorAll(".ptaf-dash-card").forEach((card) => {
    const on = path.nodes.has(card.dataset.id);
    card.classList.toggle("is-on", on);
    card.classList.toggle("is-dim", !on);
  });
  board.querySelectorAll(".ptaf-dash-link").forEach((link) => {
    const on = path.edgeIds.has(link.dataset.edge);
    link.classList.toggle("is-on", on);
    link.classList.toggle("is-dim", !on);
  });
}

function dashSetStatus(theme, message, kind) {
  const status = theme.querySelector(".ptaf-dash-status");
  status.hidden = !message;
  status.textContent = message || "";
  if (message) {
    status.dataset.kind = kind || "scheme";
  } else {
    delete status.dataset.kind;
  }
}

function dashErrorText(error) {
  if (error && error.status === 401) {
    return "Сессия истекла. Обновите страницу и войдите снова.";
  }
  return (error && error.message) || "Не удалось прочитать схему.";
}

async function dashLoad(theme) {
  const token = dashToken + 1;
  dashToken = token;
  dashEventToken += 1;
  const reload = theme.querySelector(".ptaf-dash-reload");
  reload.disabled = true;
  dashSetStatus(theme, "Читаем схему…");
  try {
    const [applications, profiles, backends, vips] = await Promise.all([
      api("/config/applications"),
      api("/config/traffic_profiles"),
      api("/config/backends"),
      api("/config/vips"),
    ]);
    if (token !== dashToken || !dashOpen) {
      return;
    }
    const realms = [{
      id: "",
      label: "",
      applications,
      profiles,
      backends,
      vips,
    }];
    let installations = [];
    try {
      installations = dashItems(await api("/config/ptaf_installations"));
    } catch (error) {
      installations = [];
    }
    if (token !== dashToken || !dashOpen) {
      return;
    }
    const linked = await Promise.all(installations.map(async (inst) => {
      if (!inst || !inst.id) {
        return null;
      }
      const prefix = `/installation/${inst.id}/proxy/`;
      try {
        const [linkedApps, linkedProfiles, linkedBackends, linkedVips] = await Promise.all([
          api(`${prefix}config%2Fapplications`),
          api(`${prefix}config%2Ftraffic_profiles`),
          api(`${prefix}config%2Fbackends`),
          api(`${prefix}config%2Fvips`),
        ]);
        return {
          id: inst.id,
          label: inst.short_name || inst.name || "",
          applications: linkedApps,
          profiles: linkedProfiles,
          backends: linkedBackends,
          vips: linkedVips,
        };
      } catch (error) {
        return null;
      }
    }));
    if (token !== dashToken || !dashOpen) {
      return;
    }
    linked.forEach((realm) => {
      if (realm) {
        realms.push(realm);
      }
    });
    const model = dashBuildGraph(realms.length > 1 ? realms : realms[0]);
    if (!model.listens.length && !model.apps.length) {
      dashSetStatus(theme, "В этом пространстве нет профилей трафика и веб-приложений.");
    } else {
      dashSetStatus(theme, "");
    }
    dashInstallIds = realms.map((realm) => realm.id || "");
    dashRender(theme, model);
    if (dashShowEvents && model.apps.length) {
      dashEventLoad(theme);
    }
  } catch (error) {
    if (token !== dashToken || !dashOpen) {
      return;
    }
    dashModel = null;
    dashView = null;
    theme.querySelector(".ptaf-dash-board").hidden = true;
    theme.querySelector(".ptaf-dash-legend").hidden = true;
    theme.querySelector(".ptaf-dash-clear").hidden = true;
    theme.querySelector(".ptaf-dash-filter").hidden = true;
    dashSetStatus(theme, dashErrorText(error));
  } finally {
    if (token === dashToken) {
      reload.disabled = false;
    }
  }
}

function dashBind(theme) {
  const board = theme.querySelector(".ptaf-dash-board");
  const svg = theme.querySelector(".ptaf-dash-links");
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";
  const periodMenu = theme.querySelector(".ptaf-dash-period-menu");
  DASH_EVENT_PRESETS.forEach((preset) => {
    if (preset.id === "all") {
      const rule = document.createElement("div");
      rule.className = "ptaf-dash-period-rule";
      periodMenu.append(rule);
    }
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ptaf-dash-period-item";
    item.dataset.preset = preset.id;
    item.textContent = preset.label;
    item.addEventListener("click", () => {
      periodMenu.hidden = true;
      if (preset.id === "custom") {
        dashEventOpenRange(theme);
        return;
      }
      dashEventPreset = preset.id;
      dashEventSyncControls(theme);
      dashEventLoad(theme);
    });
    periodMenu.append(item);
  });
  theme.querySelector(".ptaf-dash-period-button").addEventListener("click", () => {
    const button = theme.querySelector(".ptaf-dash-period-button");
    if (!periodMenu || button.disabled) {
      return;
    }
    periodMenu.hidden = !periodMenu.hidden;
    dashEventSyncControls(theme);
  });
  theme.querySelector(".ptaf-dash-events-toggle input").addEventListener("change", (event) => {
    dashShowEvents = event.target.checked;
    dashEventCloseUi(theme);
    dashEventSyncControls(theme);
    if (!dashShowEvents) {
      dashEventToken += 1;
      dashEventCounts = new Map();
      const status = theme.querySelector(".ptaf-dash-status");
      if (status && status.dataset.kind === "events") {
        dashSetStatus(theme, "");
      }
      if (dashModel && dashScreen === "chain") {
        dashRender(theme, dashModel);
      }
      return;
    }
    dashEventLoad(theme);
  });
  theme.querySelector(".ptaf-dash-range-card").addEventListener("submit", (event) => {
    dashEventSubmitRange(theme, event);
  });
  theme.querySelector(".ptaf-dash-range-cancel").addEventListener("click", () => {
    dashEventCloseUi(theme);
  });
  theme.addEventListener("click", (event) => {
    if (!periodMenu || periodMenu.hidden) {
      return;
    }
    const period = theme.querySelector(".ptaf-dash-period");
    if (period && !period.contains(event.target)) {
      periodMenu.hidden = true;
      dashEventSyncControls(theme);
    }
  });
  dashEventSyncControls(theme);
  theme.querySelector(".ptaf-dash-reload").addEventListener("click", () => {
    if (dashScreen === "overview") {
      dashOverviewReload(theme);
      return;
    }
    if (dashScreen === "events") {
      dashEventsReload(theme);
      return;
    }
    if (dashScreen === "match") {
      dashMatchReload(theme);
      return;
    }
    dashLoad(theme);
  });
  theme.querySelectorAll(".ptaf-dash-screen").forEach((button) => {
    button.addEventListener("click", () => dashOpenScreen(button.dataset.screen));
  });
  theme.querySelector(".ptaf-dash-clear").addEventListener("click", () => {
    if (dashScreen === "match") {
      dashMxFilter = null;
      dashMxRule = "";
      dashMxName = "";
      dashMxPaint(theme);
      return;
    }
    dashFilterId = "";
    if (dashModel) {
      dashRender(theme, dashModel);
    }
  });
  board.addEventListener("click", (event) => {
    const card = event.target.closest(".ptaf-dash-card");
    if (!card) {
      return;
    }
    dashApplyFilter(theme, card.dataset.id);
  });
  board.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const card = event.target.closest(".ptaf-dash-card");
    if (!card) {
      return;
    }
    event.preventDefault();
    dashApplyFilter(theme, card.dataset.id);
  });
  board.addEventListener("pointerover", (event) => {
    const card = event.target.closest(".ptaf-dash-card");
    dashHighlight(theme, card ? card.dataset.id : "");
  });
  board.addEventListener("pointerout", (event) => {
    const card = event.target.closest(".ptaf-dash-card");
    if (!card) {
      return;
    }
    const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".ptaf-dash-card");
    if (next) {
      return;
    }
    dashHighlight(theme, "");
  });
  board.addEventListener("focusin", (event) => {
    const card = event.target.closest(".ptaf-dash-card");
    if (card) {
      dashHighlight(theme, card.dataset.id);
    }
  });
  board.addEventListener("focusout", (event) => {
    const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".ptaf-dash-card");
    if (!next) {
      dashHighlight(theme, "");
    }
  });
  if (typeof ResizeObserver === "function") {
    dashResize = new ResizeObserver(() => dashLayout(theme));
    dashResize.observe(board);
  }
}

function dashApplyScreen(theme) {
  const root = theme.querySelector(".ptaf-dash");
  const chain = dashScreen === "chain";
  root.dataset.screen = dashScreen;
  const subtitle = theme.querySelector(".ptaf-dash-subtitle");
  const captions = {
    chain: "IP:порт прослушивания → веб-приложение (Host, Location) → защищаемый сервер",
    overview: "События и трафик текущего пространства за выбранный период",
    events: "RPS за 14 дней и события безопасности в выбранном окне",
    match: "Щелчок по приложению показывает больше правил, щелчок по правилу — больше Matched names",
  };
  subtitle.textContent = captions[dashScreen] || captions.chain;
  theme.querySelectorAll(".ptaf-dash-screen").forEach((button) => {
    const on = button.dataset.screen === dashScreen;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  theme.querySelector(".ptaf-dash-overview").hidden = dashScreen !== "overview";
  const events = theme.querySelector(".ptaf-dash-events");
  if (events) {
    events.hidden = dashScreen !== "events";
  }
  const match = theme.querySelector(".ptaf-dash-match");
  if (match) {
    match.hidden = dashScreen !== "match";
  }
  if (!chain) {
    theme.querySelector(".ptaf-dash-status").hidden = true;
    theme.querySelector(".ptaf-dash-legend").hidden = true;
    dashEventCloseUi(theme);
    if (dashScreen === "match" && typeof dashMxSyncChrome === "function") {
      dashMxSyncChrome(theme);
    } else {
      theme.querySelector(".ptaf-dash-clear").hidden = true;
      theme.querySelector(".ptaf-dash-filter").hidden = true;
    }
  }
}

function dashEnsureHost() {
  if (dashHost) {
    return dashHost;
  }
  const host = document.createElement("div");
  host.id = DASH_HOST_ID;
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.right = "0";
  host.style.bottom = "0";
  host.style.zIndex = "40";
  host.style.display = "none";
  const theme = attachUi(host);
  if (!theme) {
    return null;
  }
  theme.append(dashShell());
  dashBind(theme);
  document.body.append(host);
  dashHost = host;
  return host;
}

function dashOpenScreen(screen) {
  if (!dashAlive()) {
    dashStop();
    return;
  }
  const host = dashEnsureHost();
  if (!host) {
    return;
  }
  const theme = host.shadowRoot.querySelector(".ptaf-theme");
  const same = dashOpen && dashScreen === screen;
  if (!dashOpen) {
    const selected = document.querySelector("ptaf-panel-menu .item.selected");
    dashSavedLabel = selected && selected.id !== DASH_ITEM_ID ? dashMenuText(selected) : dashSavedLabel;
  }
  dashScreen = screen;
  dashOpen = true;
  host.hidden = false;
  host.style.display = "block";
  dashPlaceHost();
  if (typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  dashApplyChrome();
  dashApplyScreen(theme);
  if (same) {
    return;
  }
  if (screen === "overview") {
    dashEventsPause();
    dashMatchPause();
    dashToken += 1;
    const reload = theme.querySelector(".ptaf-dash-reload");
    if (reload) {
      reload.disabled = false;
    }
    dashOverviewOpen(theme);
    return;
  }
  if (screen === "events") {
    dashOverviewPause();
    dashMatchPause();
    dashToken += 1;
    const reload = theme.querySelector(".ptaf-dash-reload");
    if (reload) {
      reload.disabled = false;
    }
    dashEventsOpen(theme);
    return;
  }
  if (screen === "match") {
    dashOverviewPause();
    dashEventsPause();
    dashToken += 1;
    const reload = theme.querySelector(".ptaf-dash-reload");
    if (reload) {
      reload.disabled = false;
    }
    dashMatchOpen(theme);
    return;
  }
  dashOverviewPause();
  dashEventsPause();
  dashMatchPause();
  dashLoad(theme);
}

function dashCloseView(restore) {
  dashCloseSubmenu();
  dashOverviewPause();
  dashEventsPause();
  dashMatchPause();
  dashOpen = false;
  dashFilterId = "";
  dashToken += 1;
  if (dashHost) {
    dashHost.hidden = true;
    dashHost.style.display = "none";
  }
  if (document.body) {
    document.body.classList.remove("ptaf-dash-open");
  }
  document.querySelectorAll(`#${DASH_ITEM_ID}`).forEach((item) => {
    item.setAttribute("aria-current", "false");
  });
  if (restore && dashSavedLabel) {
    document.querySelectorAll("ptaf-panel-menu").forEach((menu) => {
      if (menu.querySelector(".item.selected")) {
        return;
      }
      const match = [...menu.querySelectorAll(".item")].find((item) => item.id !== DASH_ITEM_ID && dashMenuText(item) === dashSavedLabel);
      if (match) {
        match.classList.add("selected");
      }
    });
  }
}

function dashOnPageClick(event) {
  const submenu = document.getElementById(DASH_SUBMENU_ID);
  if (submenu) {
    const inside = event.target && event.target.closest && (
      event.target.closest(`#${DASH_SUBMENU_ID}`) || event.target.closest(`#${DASH_ITEM_ID}`)
    );
    if (!inside) {
      submenu.remove();
    }
  }
  if (!dashOpen) {
    return;
  }
  const item = event.target && event.target.closest && event.target.closest("ptaf-panel-menu .item");
  if (item && item.id !== DASH_ITEM_ID) {
    dashCloseView(false);
  }
}

function dashOnKey(event) {
  if (event.key !== "Escape") {
    return;
  }
  if (document.getElementById(DASH_SUBMENU_ID)) {
    event.preventDefault();
    event.stopPropagation();
    dashCloseSubmenu();
    return;
  }
  if (!dashOpen) {
    return;
  }
  const theme = dashHost && dashHost.shadowRoot && dashHost.shadowRoot.querySelector(".ptaf-theme");
  const dialog = theme && theme.querySelector(".ptaf-dash-range");
  if (dialog && !dialog.hidden) {
    event.preventDefault();
    event.stopPropagation();
    dialog.hidden = true;
    return;
  }
  const menu = theme && theme.querySelector(".ptaf-dash-period-menu");
  if (menu && !menu.hidden) {
    event.preventDefault();
    event.stopPropagation();
    menu.hidden = true;
    const button = theme.querySelector(".ptaf-dash-period-button");
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (dashScreen === "chain" && dashFilterId && dashHost) {
    dashFilterId = "";
    const theme = dashHost.shadowRoot && dashHost.shadowRoot.querySelector(".ptaf-theme");
    if (theme && dashModel) {
      dashRender(theme, dashModel);
    }
    return;
  }
  if (dashScreen === "match" && dashMxFilter && dashHost) {
    dashMxFilter = null;
    dashMxRule = "";
    dashMxName = "";
    const theme = dashHost.shadowRoot && dashHost.shadowRoot.querySelector(".ptaf-theme");
    if (theme) {
      dashMxPaint(theme);
    }
    return;
  }
  dashCloseView(true);
}

function dashOnResize() {
  dashCloseSubmenu();
  if (dashOpen) {
    dashPlaceHost();
    const theme = dashHost && dashHost.shadowRoot && dashHost.shadowRoot.querySelector(".ptaf-theme");
    dashLayout(theme);
  }
}

function dashStop() {
  if (dashStopped) {
    return;
  }
  dashStopped = true;
  dashOpen = false;
  dashCloseSubmenu();
  dashOverviewPause();
  dashEventsPause();
  dashMatchPause();
  if (dashFrame) {
    cancelAnimationFrame(dashFrame);
    dashFrame = 0;
  }
  if (dashObserver) {
    dashObserver.disconnect();
    dashObserver = null;
  }
  if (dashThemeObserver) {
    dashThemeObserver.disconnect();
    dashThemeObserver = null;
  }
  if (dashResize) {
    dashResize.disconnect();
    dashResize = null;
  }
  document.removeEventListener("click", dashOnPageClick, true);
  document.removeEventListener("keydown", dashOnKey, true);
  window.removeEventListener("resize", dashOnResize);
  window.removeEventListener("popstate", dashOnPop);
  document.querySelectorAll(`#${DASH_ITEM_ID}`).forEach((item) => item.remove());
  const style = document.getElementById(DASH_STYLE_ID);
  if (style) {
    style.remove();
  }
  if (document.body) {
    document.body.classList.remove("ptaf-dash-open");
  }
  if (dashHost) {
    dashHost.remove();
    dashHost = null;
  }
}

function dashOnPop() {
  if (dashOpen) {
    dashCloseView(true);
  }
}

function dashStart() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", dashStart, { once: true });
    return;
  }
  document.addEventListener("click", dashOnPageClick, true);
  document.addEventListener("keydown", dashOnKey, true);
  window.addEventListener("resize", dashOnResize);
  window.addEventListener("popstate", dashOnPop);
  dashObserver = new MutationObserver(() => dashSchedule());
  dashObserver.observe(document.documentElement, { childList: true, subtree: true });
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-kbq-theme"],
  };
  dashThemeObserver = new MutationObserver(() => dashSchedule());
  dashThemeObserver.observe(document.documentElement, options);
  dashThemeObserver.observe(document.body, options);
  dashSchedule();
}

if (typeof document !== "undefined") {
  dashStart();
}
