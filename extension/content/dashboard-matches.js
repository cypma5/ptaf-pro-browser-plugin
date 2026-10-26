
const DASH_MX_COLORS = ["#5b8def", "#e06ca8", "#3dbe8c", "#e0a045", "#8b7cf7"];

let dashMxPreset = "1d";
let dashMxCustom = null;
let dashMxRule = "";
let dashMxName = "";
let dashMxFilter = null;
let dashMxPattern = "";
let dashMxPlace = null;
let dashMxBusy = false;
let dashMxToken = 0;
let dashMxActive = false;
let dashMxCache = { rows: [], read: 0, truncated: false, error: "" };
let dashMxResize = null;

function dashMxRange() {
  return dashTimeRange(dashMxPreset, dashMxCustom);
}

function dashMxNameOf(match) {
  const name = match && match.matched_name ? String(match.matched_name) : "";
  const key = match && match.matched_key ? String(match.matched_key) : "";
  if (key) {
    return name ? `${name}.${key}` : key;
  }
  return name;
}

function dashMxRows(items) {
  const rows = [];
  items.forEach((item) => {
    const seen = new Set();
    const list = (item.matched_info && item.matched_info.matched_items) || [];
    list.forEach((match) => {
      const name = dashMxNameOf(match);
      if (!name) {
        return;
      }
      const value = match.matched_value == null ? "" : String(match.matched_value);
      const key = `${name}\u0000${value}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      rows.push({
        app: item.app_name || "—",
        rule: item.rule_name || "—",
        name,
        source: match && match.matched_name ? String(match.matched_name) : "",
        param: match && match.matched_key ? String(match.matched_key) : "",
        value,
      });
    });
  });
  return rows;
}

async function dashMxSample(range, token) {
  const pageLength = 200;
  const rows = [];
  let read = 0;
  for (let page = 0; page < 5; page += 1) {
    if (token !== dashMxToken || !dashMxActive) {
      return null;
    }
    const data = await api("/threats/events/events_query", {
      method: "POST",
      body: {
        fields: ["id", "app_name", "rule_name", "matched_info"],
        timerange: { start: range.start, end: range.end },
        page: { offset: page * pageLength, length: pageLength },
        sort: { key: "timestamp", order: "desc" },
      },
    });
    const items = (data && data.items) || [];
    rows.push(...dashMxRows(items));
    read += items.length;
    if (items.length < pageLength) {
      return { rows, read, truncated: false, error: "" };
    }
  }
  return { rows, read, truncated: true, error: "" };
}

function dashMxApps(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    counts.set(row.app, (counts.get(row.app) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
}

function dashMxTree(rows, appName) {
  const rules = new Map();
  rows.forEach((row) => {
    if (row.app !== appName) {
      return;
    }
    if (!rules.has(row.rule)) {
      rules.set(row.rule, new Map());
    }
    const names = rules.get(row.rule);
    if (!names.has(row.name)) {
      const place = dashMxSource(row);
      names.set(row.name, { source: place.source, param: place.param, counts: new Map() });
    }
    const bucket = names.get(row.name);
    bucket.counts.set(row.value, (bucket.counts.get(row.value) || 0) + 1);
  });
  return [...rules.entries()]
    .map(([rule, names]) => {
      const nameList = [...names.entries()].map(([name, bucket]) => {
        const list = [...bucket.counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ru"));
        return {
          name,
          source: bucket.source,
          param: bucket.param,
          count: list.reduce((sum, item) => sum + item.count, 0),
          values: list,
        };
      }).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
      return {
        rule,
        count: nameList.reduce((sum, item) => sum + item.count, 0),
        names: nameList,
      };
    })
    .sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule, "ru"));
}

function dashMxSource(row) {
  if (row.source) {
    return { source: row.source, param: row.param || "" };
  }
  const name = row.name || "";
  const dot = name.indexOf(".");
  if (dot < 0) {
    return { source: name, param: "" };
  }
  return { source: name.slice(0, dot), param: name.slice(dot + 1) };
}

function dashMxList(body) {
  if (typeof dashItems === "function") {
    return dashItems(body);
  }
  if (Array.isArray(body)) {
    return body;
  }
  if (body && Array.isArray(body.items)) {
    return body.items;
  }
  return [];
}

const DASH_MX_DECODERS = {
  url_decode: "url_decode",
  json: "json",
  json_array: "json",
  json_object: "json",
  json_string: "json",
  xml: "xml",
  xml_text: "xml",
  base64: "base64",
  base64flat: "base64flat",
  graphql: "graphql",
  html_entities: "html_entities",
  ascii_hex: "ascii_hex",
  gzip: "gzip",
};

const DASH_MX_SKIP_LABELS = {
  value: "значение",
  key: "ключ",
  filename: "имя",
  url_decode: "URL",
  json: "узел JSON",
  xml: "узел XML",
  base64: "Base64",
  base64flat: "Base64Flat",
  graphql: "узел GraphQL",
  html_entities: "сущности HTML",
  ascii_hex: "ASCII hex",
  gzip: "GZIP",
};

const DASH_MX_PLACES = {
  REQUEST_PATH: "Пропускать путь запроса",
  REQUEST_GET: "В GET-параметрах",
  REQUEST_POST: "В POST-параметрах",
  REQUEST_COOKIES: "В куки",
  REQUEST_HEADERS: "В заголовке",
  REQUEST_BODY: "В теле запроса",
  REQUEST_FILES: "В загружаемом файле",
  WEBSOCKET_UPSTREAM: "При передаче данных по WebSocket",
};

function dashMxLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dashMxDecode(param) {
  const text = String(param || "");
  if (!text.startsWith("http.")) {
    return null;
  }
  const last = text.split(".").pop();
  const skip = DASH_MX_DECODERS[last];
  if (!skip) {
    return { error: `Ключ ${text} не задаёт пропускаемую часть` };
  }
  return { skip, path: text };
}

function dashMxSkipFields(variant) {
  return (variant.properties && variant.properties.conditions && variant.properties.conditions.properties) || {};
}

function dashMxSkipEnum(variant) {
  return (variant.properties && variant.properties.skip && variant.properties.skip.enum) || [];
}

function dashMxSkipTitle(source, skip) {
  const what = DASH_MX_SKIP_LABELS[skip] || skip;
  if (source === "REQUEST_PATH") {
    return "Пропускать путь запроса, если";
  }
  return `${DASH_MX_PLACES[source] || source} пропускать ${what}, если`;
}

function dashMxSkipItem(schemaText, source, param, expression) {
  let schema = null;
  try {
    schema = typeof schemaText === "string" ? JSON.parse(schemaText) : schemaText;
  } catch (error) {
    schema = null;
  }
  const variants = schema && schema.properties && schema.properties.skip && schema.properties.skip.items
    ? schema.properties.skip.items.oneOf
    : null;
  if (!Array.isArray(variants)) {
    return { error: "У правила нет схемы пропускаемых частей" };
  }
  const matching = variants.filter((variant) => {
    const sources = variant.properties && variant.properties.source && variant.properties.source.enum;
    return Array.isArray(sources) && sources.includes(source);
  });
  if (!matching.length) {
    return { error: `Для ${source} нет пропускаемой части` };
  }
  const decoded = param && String(param).startsWith("http.") ? dashMxDecode(param) : null;
  if (decoded && decoded.error) {
    return decoded;
  }
  let variant = null;
  let skipName = "";
  if (decoded) {
    variant = matching.find((item) => dashMxSkipEnum(item).includes(decoded.skip) && dashMxSkipFields(item).if_path);
    if (!variant) {
      return { error: `Правило не умеет пропускать ${DASH_MX_SKIP_LABELS[decoded.skip] || decoded.skip} в ${source}` };
    }
    skipName = decoded.skip;
  } else if (param) {
    variant = matching.find((item) => dashMxSkipEnum(item).includes("value") && dashMxSkipFields(item).if_key);
    if (!variant) {
      return { error: `Для ${source} нет подходящей пропускаемой части` };
    }
    skipName = "value";
  } else {
    variant = matching.find((item) => {
      const fields = dashMxSkipFields(item);
      return dashMxSkipEnum(item).includes("value") && fields.if_value && !fields.if_key && !fields.if_path;
    });
    if (!variant) {
      return { error: `Для ${source} нет подходящей пропускаемой части` };
    }
    skipName = "value";
  }
  const fields = dashMxSkipFields(variant);
  const conditions = {};
  if (fields.if_value) {
    conditions.if_value = expression;
  }
  if (!decoded && fields.if_key && param) {
    conditions.if_key = dashMxLiteral(param);
  }
  if (decoded && fields.if_path) {
    conditions.if_path = decoded.path;
  }
  const required = (variant.properties.conditions && variant.properties.conditions.required) || [];
  const missing = required.find((name) => conditions[name] == null || conditions[name] === "");
  if (missing) {
    const gap = {
      if_filename: "имени файла",
      if_key: "ключа",
      if_path: "пути",
      if_value: "значения",
    }[missing] || missing;
    return { error: `Для ${source} не хватает ${gap}` };
  }
  return {
    item: {
      source,
      skip: skipName,
      conditions,
    },
    title: dashMxSkipTitle(source, skipName),
  };
}

function dashMxSkipSame(left, right) {
  const one = left.conditions || {};
  const two = right.conditions || {};
  return left.source === right.source
    && left.skip === right.skip
    && one.if_key === two.if_key
    && one.if_value === two.if_value
    && one.if_path === two.if_path
    && one.if_filename === two.if_filename;
}

async function dashMxRuleDetail(target, app, ruleName) {
  const applications = dashMxList(await api("/config/applications"));
  const application = applications.find((item) => item && item.name === app);
  if (!application || !application.policy_id) {
    throw new Error("Приложение не найдено");
  }
  const rules = dashMxList(await api(`/config/policies/${application.policy_id}/rules`));
  const rule = rules.find((item) => item && item.name === ruleName);
  if (!rule) {
    throw new Error(`Правило «${ruleName}» не найдено в политике`);
  }
  if (target === "policy") {
    return {
      path: `/config/policies/${application.policy_id}/rules/${rule.id}`,
      where: `правило «${ruleName}» политики «${app}»`,
    };
  }
  const templateId = application.policy_template_id;
  if (!templateId) {
    throw new Error("У приложения нет шаблона политики");
  }
  let template = null;
  try {
    template = await api(`/config/policies/templates/user/${templateId}`);
  } catch (error) {
    if (error && error.status === 404) {
      throw new Error("Политика основана на шаблоне поставщика. Пропускаемую часть можно записать только в правило политики.");
    }
    throw error;
  }
  let ruleId = rule.id;
  try {
    await api(`/config/policies/templates/user/${templateId}/rules/${ruleId}`);
  } catch (error) {
    if (!error || error.status !== 404) {
      throw error;
    }
    const listed = dashMxList(await api(`/config/policies/templates/user/${templateId}/rules`));
    const found = listed.find((item) => item && (item.name === ruleName || item.rule_id === rule.rule_id));
    if (!found) {
      throw new Error(`Правило «${ruleName}» не найдено в шаблоне`);
    }
    ruleId = found.id;
  }
  const templateName = template && template.name ? template.name : "шаблон";
  return {
    path: `/config/policies/templates/user/${templateId}/rules/${ruleId}`,
    where: `шаблон «${templateName}», правило «${ruleName}»`,
  };
}

async function dashMxWriteSkip(target) {
  const place = dashMxPlace;
  const expression = dashMxPattern.trim();
  if (!place) {
    throw new Error("Выберите Matched name");
  }
  if (!expression) {
    throw new Error("Введите регулярное выражение");
  }
  const located = await dashMxRuleDetail(target, place.app, place.rule);
  const detail = await api(located.path);
  const built = dashMxSkipItem(detail.variables_schema, place.source, place.param, expression);
  if (built.error) {
    throw new Error(built.error);
  }
  const variables = Object.assign({}, detail.variables);
  const skip = Array.isArray(variables.skip) ? variables.skip.slice() : [];
  if (skip.some((item) => dashMxSkipSame(item, built.item))) {
    throw new Error("Такая пропускаемая часть уже есть");
  }
  skip.push(built.item);
  variables.skip = skip;
  await api(located.path, { method: "PATCH", body: { variables } });
  const conditions = built.item.conditions;
  const detailText = conditions.if_path
    ? `, путь ${conditions.if_path}`
    : conditions.if_key
      ? `, ключ ${conditions.if_key}`
      : "";
  return `Записано: ${located.where}. ${built.title}${detailText}`;
}

function dashMxSameFilter(next) {
  const filter = dashMxFilter;
  return Boolean(filter)
    && filter.level === next.level
    && filter.app === next.app
    && filter.rule === next.rule
    && filter.name === next.name;
}

function dashMxLimits() {
  const level = dashMxFilter && dashMxFilter.level;
  if (level === "name" || level === "rule") {
    return { rules: 1, names: 40 };
  }
  if (level === "app") {
    return { rules: 40, names: 5 };
  }
  return { rules: 5, names: 5 };
}

function dashMxFilterText() {
  const filter = dashMxFilter;
  if (!filter) {
    return "";
  }
  if (filter.level === "app") {
    return `Связи приложения «${filter.app}»`;
  }
  if (filter.level === "rule") {
    return `Связи правила «${filter.rule}»`;
  }
  return `Связи «${filter.name}»`;
}

function dashMxSyncChrome(theme) {
  const clear = theme.querySelector(".ptaf-dash-clear");
  const note = theme.querySelector(".ptaf-dash-filter");
  const on = Boolean(dashMxFilter);
  if (clear) {
    clear.hidden = !on;
  }
  if (note) {
    note.hidden = !on;
    note.textContent = dashMxFilterText();
  }
}

function dashMxApplyFilter(theme, next) {
  if (dashMxSameFilter(next)) {
    dashMxFilter = null;
    dashMxRule = "";
    dashMxName = "";
  } else {
    dashMxFilter = next;
    dashMxRule = next.level === "name" ? next.rule : "";
    dashMxName = next.level === "name" ? next.name : "";
  }
  dashMxPaint(theme);
}

function dashMxCard(id, title, count, color) {
  const card = document.createElement("article");
  card.className = "ptaf-mx-card";
  card.dataset.id = id;
  if (color) {
    card.style.setProperty("--mx-color", color);
  }
  const heading = document.createElement("h4");
  heading.textContent = title;
  heading.title = title;
  const meta = document.createElement("p");
  meta.textContent = `${count.toLocaleString("ru")} событий`;
  card.append(heading, meta);
  return card;
}

function dashMxParts(text, source) {
  let pattern;
  try {
    pattern = new RegExp(source, "gu");
  } catch (error) {
    return { error: true };
  }
  const parts = [];
  let cursor = 0;
  let hit = false;
  for (const found of text.matchAll(pattern)) {
    if (!found[0]) {
      continue;
    }
    hit = true;
    if (found.index > cursor) {
      parts.push({ text: text.slice(cursor, found.index), hit: false });
    }
    parts.push({ text: found[0], hit: true });
    cursor = found.index + found[0].length;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), hit: false });
  }
  if (!parts.length) {
    parts.push({ text, hit: false });
  }
  return { hit, parts };
}

function dashMxValues(body, values) {
  body.replaceChildren();
  if (!dashMxName) {
    const empty = document.createElement("p");
    empty.className = "ptaf-mx-empty";
    empty.textContent = "Выберите Matched name";
    body.append(empty);
    return "";
  }
  if (!values.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-mx-empty";
    empty.textContent = "Для этого имени нет значений";
    body.append(empty);
    return "";
  }
  const source = dashMxPattern.trim();
  let failed = false;
  const list = document.createElement("div");
  list.className = "ptaf-mx-list";
  values.forEach((item) => {
    const row = document.createElement("div");
    row.className = "ptaf-mx-value";
    const text = document.createElement("span");
    const shown = item.value || "—";
    if (source && item.value) {
      const parsed = dashMxParts(item.value, source);
      if (parsed.error) {
        failed = true;
        text.textContent = shown;
      } else {
        row.classList.toggle("is-hit", parsed.hit);
        parsed.parts.forEach((part) => {
          if (!part.hit) {
            text.append(document.createTextNode(part.text));
            return;
          }
          const mark = document.createElement("mark");
          mark.textContent = part.text;
          text.append(mark);
        });
      }
    } else {
      text.textContent = shown;
    }
    text.title = shown;
    const count = document.createElement("b");
    count.textContent = item.count.toLocaleString("ru");
    row.append(text, count);
    list.append(row);
  });
  body.append(list);
  return failed ? "Выражение не разбирается" : "";
}

function dashMxDraw(board) {
  const svg = board.querySelector(".ptaf-mx-links");
  if (!svg) {
    return;
  }
  const boardRect = board.getBoundingClientRect();
  const width = Math.max(board.scrollWidth, boardRect.width);
  const height = Math.max(board.scrollHeight, boardRect.height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.replaceChildren();
  const svgNs = "http://www.w3.org/2000/svg";
  board.querySelectorAll(".ptaf-mx-card[data-from]").forEach((card) => {
    const from = board.querySelector(`.ptaf-mx-card[data-id="${CSS.escape(card.dataset.from)}"]`);
    if (!from) {
      return;
    }
    const fromRect = from.getBoundingClientRect();
    const toRect = card.getBoundingClientRect();
    const x1 = fromRect.right - boardRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - boardRect.top;
    const x2 = toRect.left - boardRect.left;
    const y2 = toRect.top + toRect.height / 2 - boardRect.top;
    const dx = Math.max(28, (x2 - x1) / 2);
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", card.dataset.color || "#5b8def");
    path.dataset.edge = `${card.dataset.from}>${card.dataset.id}`;
    path.classList.add("ptaf-mx-link");
    svg.append(path);
  });
}

function dashMxHighlight(board, id) {
  if (!id) {
    const picked = [...board.querySelectorAll(".ptaf-mx-card.is-filter")];
    board.classList.remove("is-hot");
    board.querySelectorAll(".is-on, .is-dim").forEach((node) => {
      node.classList.remove("is-on", "is-dim");
    });
    picked.forEach((card) => card.classList.add("is-on"));
    return;
  }
  const keep = new Set([id]);
  let current = board.querySelector(`.ptaf-mx-card[data-id="${CSS.escape(id)}"]`);
  while (current && current.dataset.from) {
    keep.add(current.dataset.from);
    current = board.querySelector(`.ptaf-mx-card[data-id="${CSS.escape(current.dataset.from)}"]`);
  }
  board.querySelectorAll(`.ptaf-mx-card[data-from="${CSS.escape(id)}"]`).forEach((card) => {
    keep.add(card.dataset.id);
    board.querySelectorAll(`.ptaf-mx-card[data-from="${CSS.escape(card.dataset.id)}"]`).forEach((child) => {
      keep.add(child.dataset.id);
    });
  });
  board.classList.add("is-hot");
  board.querySelectorAll(".ptaf-mx-card").forEach((card) => {
    const on = keep.has(card.dataset.id);
    card.classList.toggle("is-on", on);
    card.classList.toggle("is-dim", !on);
  });
  board.querySelectorAll(".ptaf-mx-link").forEach((link) => {
    const [from, to] = (link.dataset.edge || "").split(">");
    const on = keep.has(from) && keep.has(to);
    link.classList.toggle("is-on", on);
    link.classList.toggle("is-dim", !on);
  });
}

function dashMxPaint(theme) {
  const root = theme.querySelector(".ptaf-dash-match");
  if (!root) {
    return;
  }
  root.replaceChildren();
  const toolbar = document.createElement("div");
  toolbar.className = "ptaf-mx-toolbar";
  const periodHost = document.createElement("div");
  const timeRange = dashMountTimeChoice(periodHost, root, {
    get preset() {
      return dashMxPreset;
    },
    set preset(value) {
      dashMxPreset = value;
    },
    get custom() {
      return dashMxCustom;
    },
    set custom(value) {
      dashMxCustom = value;
    },
  }, () => {
    dashMxFilter = null;
    dashMxRule = "";
    dashMxName = "";
    dashMatchLoad(theme);
  });
  toolbar.append(periodHost);

  const apps = dashMxApps(dashMxCache.rows || []);
  const note = document.createElement("p");
  note.className = "ptaf-mx-note";
  if (dashMxCache.error) {
    note.textContent = dashMxCache.error;
  } else if (dashMxCache.truncated) {
    note.textContent = `По последним ${dashMxCache.read} событиям периода`;
  }
  if (note.textContent) {
    toolbar.append(note);
  }
  root.append(toolbar, timeRange);

  const status = document.createElement("p");
  status.className = "ptaf-mx-empty";
  if (dashMxCache.error) {
    status.textContent = dashMxCache.error;
    root.append(status);
    dashMxSyncChrome(theme);
    return;
  }
  if (dashMxFilter && !apps.some((item) => item.name === dashMxFilter.app)) {
    dashMxFilter = null;
    dashMxRule = "";
    dashMxName = "";
  }
  const shownApps = dashMxFilter ? apps.filter((item) => item.name === dashMxFilter.app) : apps;
  if (!shownApps.length) {
    status.textContent = "За период нет событий с Matched names";
    root.append(status);
    dashMxSyncChrome(theme);
    return;
  }
  const limits = dashMxLimits();

  const layout = document.createElement("div");
  layout.className = "ptaf-mx-layout";
  const board = document.createElement("div");
  board.className = "ptaf-mx-board";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ptaf-mx-links");
  board.append(svg);

  const bind = (card, next) => {
    card.tabIndex = 0;
    if (dashMxSameFilter(next)) {
      card.classList.add("is-filter");
    }
    const press = () => dashMxApplyFilter(theme, next);
    card.addEventListener("click", press);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      press();
    });
  };
  let chosen = null;
  dashMxPlace = null;
  shownApps.forEach((application, appIndex) => {
    const group = document.createElement("section");
    group.className = "ptaf-mx-group";
    const appId = `app-${appIndex}`;
    const appCard = dashMxCard(appId, application.name, application.count, DASH_MX_COLORS[0]);
    appCard.classList.add("is-app");
    bind(appCard, { level: "app", app: application.name, rule: "", name: "" });
    const bands = document.createElement("div");
    bands.className = "ptaf-mx-bands";
    let rules = dashMxTree(dashMxCache.rows || [], application.name);
    if (dashMxFilter && dashMxFilter.app === application.name && dashMxFilter.level !== "app") {
      rules = rules.filter((rule) => rule.rule === dashMxFilter.rule);
    }
    rules.slice(0, limits.rules).forEach((rule, ruleIndex) => {
      const color = DASH_MX_COLORS[ruleIndex % DASH_MX_COLORS.length];
      const band = document.createElement("section");
      band.className = "ptaf-mx-band";
      const ruleId = `rule-${appIndex}-${ruleIndex}`;
      const ruleCard = dashMxCard(ruleId, rule.rule, rule.count, color);
      ruleCard.dataset.from = appId;
      ruleCard.dataset.color = color;
      bind(ruleCard, { level: "rule", app: application.name, rule: rule.rule, name: "" });
      const names = document.createElement("div");
      names.className = "ptaf-mx-names";
      const list = rule.names;
      list.slice(0, limits.names).forEach((item, nameIndex) => {
        const card = dashMxCard(`name-${appIndex}-${ruleIndex}-${nameIndex}`, item.name, item.count, color);
        card.dataset.from = ruleId;
        card.dataset.color = color;
        card.classList.add("is-name");
        if (dashMxRule === rule.rule && dashMxName === item.name && dashMxFilter && dashMxFilter.app === application.name) {
          chosen = item;
          dashMxPlace = {
            app: application.name,
            rule: rule.rule,
            source: item.source,
            param: item.param,
            name: item.name,
          };
        }
        bind(card, { level: "name", app: application.name, rule: rule.rule, name: item.name });
        names.append(card);
      });
      band.append(ruleCard, names);
      bands.append(band);
    });
    group.append(appCard, bands);
    board.append(group);
  });
  const heads = document.createElement("div");
  heads.className = "ptaf-mx-heads";
  ["Приложение", "Правила", "Matched names"].forEach((title) => {
    const heading = document.createElement("h3");
    heading.textContent = title;
    heads.append(heading);
  });
  const graph = document.createElement("div");
  graph.className = "ptaf-mx-graph";
  graph.append(heads, board);

  const valuesColumn = document.createElement("aside");
  valuesColumn.className = "ptaf-mx-values";
  const valuesTitle = document.createElement("h3");
  valuesTitle.textContent = "Matched values";
  const patternLabel = document.createElement("label");
  patternLabel.className = "ptaf-mx-pattern";
  patternLabel.append(document.createTextNode("PCRE"));
  const pattern = document.createElement("input");
  pattern.type = "text";
  pattern.spellcheck = false;
  pattern.placeholder = "Выражение";
  pattern.value = dashMxPattern;
  const patternError = document.createElement("p");
  patternError.className = "ptaf-mx-pattern-error";
  const valuesBody = document.createElement("div");
  pattern.addEventListener("input", () => {
    dashMxPattern = pattern.value;
    patternError.textContent = dashMxValues(valuesBody, chosen ? chosen.values : []);
    pattern.classList.toggle("is-bad", Boolean(patternError.textContent));
    patternError.hidden = !patternError.textContent;
  });
  patternLabel.append(pattern);
  const skipBox = document.createElement("div");
  skipBox.className = "ptaf-mx-skip";
  const create = document.createElement("button");
  create.type = "button";
  create.className = "ptaf-mx-skip-button";
  create.textContent = "Создать пропускаемую часть";
  const choices = document.createElement("div");
  choices.className = "ptaf-mx-skip-choices";
  choices.hidden = true;
  const skipStatus = document.createElement("p");
  skipStatus.className = "ptaf-mx-pattern-error";
  skipStatus.hidden = true;
  const setSkipStatus = (text, bad) => {
    skipStatus.hidden = !text;
    skipStatus.textContent = text || "";
    skipStatus.classList.toggle("is-ok", Boolean(text) && !bad);
  };
  const choice = (label, target) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async () => {
      if (dashMxBusy) {
        return;
      }
      dashMxBusy = true;
      setSkipStatus("Записываем пропускаемую часть…", false);
      try {
        setSkipStatus(await dashMxWriteSkip(target), false);
        choices.hidden = true;
      } catch (error) {
        setSkipStatus(error && error.message ? error.message : "Не удалось записать", true);
      }
      dashMxBusy = false;
    });
    return button;
  };
  choices.append(choice("В правило политики", "policy"), choice("В шаблон", "template"));
  create.addEventListener("click", () => {
    if (!dashMxPlace) {
      setSkipStatus("Выберите Matched name", true);
      choices.hidden = true;
      return;
    }
    if (!dashMxPattern.trim()) {
      setSkipStatus("Введите регулярное выражение", true);
      choices.hidden = true;
      return;
    }
    const decoded = dashMxPlace.param && String(dashMxPlace.param).startsWith("http.")
      ? dashMxDecode(dashMxPlace.param)
      : null;
    if (decoded && decoded.error) {
      setSkipStatus(decoded.error, true);
      choices.hidden = true;
      return;
    }
    const hint = decoded
      ? `Путь ${decoded.path}. Пропускать ${DASH_MX_SKIP_LABELS[decoded.skip] || decoded.skip}. `
      : dashMxPlace.param
        ? `Ключ ${dashMxPlace.param}. Пропускать значение. `
        : "Пропускать значение. ";
    setSkipStatus(`${hint}Значение — выражение из поля PCRE.`, false);
    choices.hidden = !choices.hidden;
  });
  skipBox.append(create, choices, skipStatus);
  valuesColumn.append(valuesTitle, patternLabel, patternError, skipBox, valuesBody);
  patternError.textContent = dashMxValues(valuesBody, chosen ? chosen.values : []);
  pattern.classList.toggle("is-bad", Boolean(patternError.textContent));
  patternError.hidden = !patternError.textContent;

  layout.append(graph, valuesColumn);
  root.append(layout);

  board.addEventListener("pointerover", (event) => {
    const card = event.target.closest(".ptaf-mx-card");
    dashMxHighlight(board, card ? card.dataset.id : "");
  });
  board.addEventListener("pointerout", (event) => {
    const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".ptaf-mx-card");
    if (!next) {
      dashMxHighlight(board, "");
    }
  });
  if (dashMxResize) {
    dashMxResize.disconnect();
  }
  const draw = () => dashMxDraw(board);
  requestAnimationFrame(() => requestAnimationFrame(draw));
  if (typeof ResizeObserver === "function") {
    dashMxResize = new ResizeObserver(draw);
    dashMxResize.observe(board);
  }
  dashMxSyncChrome(theme);
}

async function dashMatchLoad(theme) {
  const token = dashMxToken + 1;
  dashMxToken = token;
  const root = theme.querySelector(".ptaf-dash-match");
  if (root && !root.childElementCount) {
    const status = document.createElement("p");
    status.className = "ptaf-mx-empty";
    status.textContent = "Читаем события…";
    root.append(status);
  }
  try {
    const sample = await dashMxSample(dashMxRange(), token);
    if (!sample) {
      return;
    }
    dashMxCache = sample;
  } catch (error) {
    if (token !== dashMxToken || !dashMxActive) {
      return;
    }
    dashMxCache = {
      rows: [],
      read: 0,
      truncated: false,
      error: error && error.message ? error.message : "Не удалось прочитать события",
    };
  }
  if (token !== dashMxToken || !dashMxActive) {
    return;
  }
  dashMxPaint(theme);
}

function dashMatchOpen(theme) {
  dashMxActive = true;
  dashMatchLoad(theme);
}

function dashMatchPause() {
  dashMxActive = false;
  dashMxToken += 1;
  if (dashMxResize) {
    dashMxResize.disconnect();
    dashMxResize = null;
  }
}

function dashMatchReload(theme) {
  if (!dashMxActive) {
    dashMatchOpen(theme);
    return;
  }
  dashMatchLoad(theme);
}
