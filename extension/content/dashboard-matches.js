
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
let dashMxCache = { rows: [], read: 0, truncated: false, error: "", key: "" };
let dashMxValueCache = null;
let dashMxRuleMap = new Map();
let dashMxResize = null;
let dashMxRailPick = 0;
let dashMxRailStep = 0;
let dashMxRailHot = 0;
let dashMxRailHoverPick = -1;
let dashMxRailHoverStep = 0;
let dashMxRailSource = "";
let dashMxRailSvg = null;
let dashMxRailMap = null;
let dashMxRailTip = null;
let dashMxRailNav = null;
let dashMxRailCount = null;
let dashMxRailPrev = null;
let dashMxRailNext = null;
let dashMxValuesBody = null;
let dashMxRowTrace = new WeakMap();

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
        appId: item.app_id ? String(item.app_id) : "",
        rule: item.rule_name || "—",
        ruleId: item.rule_id ? String(item.rule_id) : "",
        eventId: item.id ? String(item.id) : "",
        name,
        source: match && match.matched_name ? String(match.matched_name) : "",
        param: match && match.matched_key ? String(match.matched_key) : "",
        value,
      });
    });
  });
  return rows;
}

function dashMxQuote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function dashMxIdClause(field, id) {
  const text = id == null ? "" : String(id).trim();
  if (!text || /[\r\n"]/.test(text)) {
    return "";
  }
  if (/^[A-Za-z0-9_.:/-]+$/.test(text)) {
    return `${field} == ${text}`;
  }
  return `${field} == ${dashMxQuote(text)}`;
}

function dashMxQueryFilter(filter) {
  if (!filter) {
    return "";
  }
  const parts = [];
  const app = dashMxIdClause("app_id", filter.appId);
  if (app) {
    parts.push(app);
  } else if (filter.app && filter.app !== "—") {
    parts.push(`app_name == ${dashMxQuote(filter.app)}`);
  }
  if (filter.level === "rule" || filter.level === "name") {
    const rule = dashMxIdClause("rule_id", filter.ruleId);
    if (!rule) {
      throw new Error(filter.rule && filter.rule !== "—"
        ? `Не удалось определить правило «${filter.rule}»`
        : "Не удалось определить правило");
    }
    parts.push(rule);
  }
  if (filter.level === "name" && filter.source) {
    parts.push(`matched_names == ${dashMxQuote(filter.source)}`);
  }
  return parts.join(" and ");
}

function dashMxRulePair(app, rule) {
  return `${app || ""}\0${rule || ""}`;
}

function dashMxRememberRule(filter, id) {
  dashMxRuleMap.set(dashMxRulePair(filter.app, filter.rule), id);
  if (dashMxFilter && dashMxFilter.app === filter.app && dashMxFilter.rule === filter.rule) {
    dashMxFilter.ruleId = id;
  }
}

function dashMxApplyRuleIds(rows) {
  if (!dashMxRuleMap.size || !rows) {
    return;
  }
  rows.forEach((row) => {
    if (row.ruleId || !row.rule || row.rule === "—") {
      return;
    }
    const id = dashMxRuleMap.get(dashMxRulePair(row.app, row.rule));
    if (id) {
      row.ruleId = id;
    }
  });
}

async function dashMxEnsureRule(filter, token) {
  if (!filter || (filter.level !== "rule" && filter.level !== "name")) {
    return true;
  }
  const known = dashMxIdClause("rule_id", filter.ruleId) ? filter.ruleId : dashMxRuleMap.get(dashMxRulePair(filter.app, filter.rule));
  if (dashMxIdClause("rule_id", known)) {
    filter.ruleId = known;
    dashMxRememberRule(filter, known);
    return true;
  }
  if (token !== dashMxToken || !dashMxActive) {
    return false;
  }
  if (!filter.eventId || !/^[0-9a-f-]{36}$/i.test(filter.eventId)) {
    throw new Error(filter.rule && filter.rule !== "—"
      ? `Не удалось определить правило «${filter.rule}»`
      : "Не удалось определить правило");
  }
  const event = await api(`/threats/events/${filter.eventId}`);
  const id = event && event.rule_id ? String(event.rule_id) : "";
  if (!dashMxIdClause("rule_id", id)) {
    throw new Error(filter.rule && filter.rule !== "—"
      ? `Не удалось определить правило «${filter.rule}»`
      : "Не удалось определить правило");
  }
  filter.ruleId = id;
  dashMxRememberRule(filter, id);
  return true;
}

function dashMxSampleKey(filter) {
  const custom = dashMxCustom ? `${dashMxCustom.start}\0${dashMxCustom.end}` : "";
  if (!filter) {
    return `${dashMxPreset}\0${custom}`;
  }
  const level = filter.level === "name" ? "rule" : filter.level;
  const rule = level === "app" ? "" : (filter.ruleId || filter.rule || "");
  return `${dashMxPreset}\0${custom}\0${level}\0${filter.appId || filter.app || ""}\0${rule}`;
}

async function dashMxSample(range, token, filterText) {
  const pageLength = 200;
  const rows = [];
  let read = 0;
  for (let page = 0; page < 5; page += 1) {
    if (token !== dashMxToken || !dashMxActive) {
      return null;
    }
    const body = {
      fields: ["id", "app_id", "app_name", "rule_id", "rule_name", "matched_info"],
      timerange: { start: range.start, end: range.end },
      page: { offset: page * pageLength, length: pageLength },
      sort: { key: "timestamp", order: "desc" },
    };
    if (filterText) {
      body.filter = filterText;
    }
    const data = await api("/threats/events/events_query", {
      method: "POST",
      body,
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
    const current = counts.get(row.app) || { name: row.app, appId: "", count: 0 };
    current.count += 1;
    if (!current.appId && row.appId) {
      current.appId = row.appId;
    }
    counts.set(row.app, current);
  });
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
}

function dashMxTree(rows, appName) {
  const rules = new Map();
  rows.forEach((row) => {
    if (row.app !== appName) {
      return;
    }
    if (!rules.has(row.rule)) {
      rules.set(row.rule, { ruleId: row.ruleId || "", eventId: row.eventId || "", names: new Map() });
    }
    const rule = rules.get(row.rule);
    if (!rule.ruleId && row.ruleId) {
      rule.ruleId = row.ruleId;
    }
    if (!rule.eventId && row.eventId) {
      rule.eventId = row.eventId;
    }
    const names = rule.names;
    if (!names.has(row.name)) {
      const place = dashMxSource(row);
      names.set(row.name, { source: place.source, param: place.param, counts: new Map() });
    }
    const bucket = names.get(row.name);
    bucket.counts.set(row.value, (bucket.counts.get(row.value) || 0) + 1);
  });
  return [...rules.entries()]
    .map(([rule, bucket]) => {
      const nameList = [...bucket.names.entries()].map(([name, item]) => {
        const list = [...item.counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ru"));
        return {
          name,
          source: item.source,
          param: item.param,
          count: list.reduce((sum, item) => sum + item.count, 0),
          values: list,
        };
      }).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
      return {
        rule,
        ruleId: bucket.ruleId,
        eventId: bucket.eventId,
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

async function dashMxSkipHomes(app, ruleName) {
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
  const policy = {
    title: "Правило политики",
    path: `/config/policies/${application.policy_id}/rules/${rule.id}`,
    where: `правило «${ruleName}» политики «${app}»`,
  };
  const templateId = application.policy_template_id;
  if (!templateId) {
    return { policy, template: { title: "Шаблон", note: "У приложения нет шаблона политики" } };
  }
  let template = null;
  try {
    template = await api(`/config/policies/templates/user/${templateId}`);
  } catch (error) {
    if (error && error.status === 404) {
      return {
        policy,
        template: {
          title: "Шаблон поставщика",
          note: "Запись только в правило политики",
          vendor: true,
        },
      };
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
      const templateName = template && template.name ? template.name : "шаблон";
      return {
        policy,
        template: { title: `Шаблон «${templateName}»`, note: `Правило «${ruleName}» не найдено в шаблоне` },
      };
    }
    ruleId = found.id;
  }
  const templateName = template && template.name ? template.name : "шаблон";
  return {
    policy,
    template: {
      title: `Шаблон «${templateName}»`,
      path: `/config/policies/templates/user/${templateId}/rules/${ruleId}`,
      where: `шаблон «${templateName}», правило «${ruleName}»`,
    },
  };
}

async function dashMxRuleDetail(target, app, ruleName) {
  const homes = await dashMxSkipHomes(app, ruleName);
  const home = target === "policy" ? homes.policy : homes.template;
  if (!home || !home.path) {
    if (home && home.vendor) {
      throw new Error("Политика основана на шаблоне поставщика. Пропускаемую часть можно записать только в правило политики.");
    }
    throw new Error(home && home.note ? home.note : "Не удалось найти правило");
  }
  return { path: home.path, where: home.where };
}

function dashMxSkipMatchesPlace(item, place) {
  if (!place || !item || item.source !== place.source) {
    return false;
  }
  const conditions = item.conditions && typeof item.conditions === "object" ? item.conditions : {};
  const param = place.param ? String(place.param) : "";
  if (param.startsWith("http.")) {
    return conditions.if_path === param;
  }
  if (param) {
    return conditions.if_key === param || conditions.if_key === dashMxLiteral(param);
  }
  return !conditions.if_key && !conditions.if_path && !conditions.if_filename;
}

function dashMxSkipRow(item, place) {
  const row = document.createElement("article");
  row.className = "ptaf-mx-skip-row";
  if (dashMxSkipMatchesPlace(item, place)) {
    row.classList.add("is-here");
  }
  const head = document.createElement("p");
  const source = DASH_MX_PLACES[item.source] || item.source || "Часть";
  const what = DASH_MX_SKIP_LABELS[item.skip] || item.skip || "";
  head.textContent = what ? `${source} · ${what}` : source;
  row.append(head);
  const conditions = item.conditions && typeof item.conditions === "object" && !Array.isArray(item.conditions) ? item.conditions : {};
  [
    ["Ключ", conditions.if_key],
    ["Путь", conditions.if_path],
    ["Файл", conditions.if_filename],
    ["Значение", conditions.if_value],
  ].forEach(([name, value]) => {
    if (value == null || value === "") {
      return;
    }
    const line = document.createElement("p");
    const label = document.createElement("span");
    label.textContent = name;
    const code = document.createElement("code");
    code.textContent = String(value);
    code.title = String(value);
    line.append(label, code);
    row.append(line);
  });
  return row;
}

function dashMxSkipGroup(group, place) {
  const section = document.createElement("section");
  const heading = document.createElement("p");
  heading.className = "ptaf-mx-skip-where";
  heading.textContent = group.title;
  section.append(heading);
  if (group.note) {
    const note = document.createElement("p");
    note.className = "ptaf-mx-empty";
    note.textContent = group.note;
    section.append(note);
    return section;
  }
  const items = Array.isArray(group.items) ? group.items : [];
  if (!items.length) {
    const note = document.createElement("p");
    note.className = "ptaf-mx-empty";
    note.textContent = "Пока нет";
    section.append(note);
    return section;
  }
  items.forEach((item) => {
    if (item && typeof item === "object") {
      section.append(dashMxSkipRow(item, place));
    }
  });
  return section;
}

let dashMxSkipToken = 0;
let dashMxSkipCache = null;

async function dashMxReadSkipHome(home) {
  if (!home || !home.path) {
    return { title: home && home.title ? home.title : "Шаблон", note: home && home.note ? home.note : "Недоступно", items: [] };
  }
  const detail = await api(home.path);
  const skip = detail && detail.variables && Array.isArray(detail.variables.skip) ? detail.variables.skip : [];
  return { title: home.title, items: skip, note: "" };
}

function dashMxPaintSkips(host, cache, place) {
  host.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Пропускаемые части";
  host.append(title);
  if (!cache || cache.error) {
    const note = document.createElement("p");
    note.className = "ptaf-mx-empty";
    note.textContent = cache && cache.error ? cache.error : "Не удалось прочитать";
    host.append(note);
    return;
  }
  host.append(dashMxSkipGroup(cache.policy, place), dashMxSkipGroup(cache.template, place));
}

async function dashMxFillSkips(host, rule, place) {
  if (!host) {
    return;
  }
  if (!rule || !rule.rule) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  const key = `${rule.app}\0${rule.rule}`;
  if (dashMxSkipCache && dashMxSkipCache.key === key && !dashMxSkipCache.error) {
    dashMxPaintSkips(host, dashMxSkipCache, place);
    return;
  }
  host.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Пропускаемые части";
  const note = document.createElement("p");
  note.className = "ptaf-mx-empty";
  note.textContent = "Читаем…";
  host.append(title, note);
  const token = dashMxSkipToken + 1;
  dashMxSkipToken = token;
  try {
    const homes = await dashMxSkipHomes(rule.app, rule.rule);
    if (token !== dashMxSkipToken) {
      return;
    }
    const policy = await dashMxReadSkipHome(homes.policy);
    const template = await dashMxReadSkipHome(homes.template);
    if (token !== dashMxSkipToken) {
      return;
    }
    dashMxSkipCache = { key, policy, template, error: "" };
    dashMxPaintSkips(host, dashMxSkipCache, place);
  } catch (error) {
    if (token !== dashMxSkipToken) {
      return;
    }
    dashMxPaintSkips(host, { error: error && error.message ? error.message : "Не удалось прочитать" }, place);
  }
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

function dashMxFocusName(rows, filter) {
  const matched = rows.filter((row) => row.app === filter.app && row.rule === filter.rule && row.name === filter.name);
  const tree = dashMxTree(matched, filter.app);
  const rule = tree.find((item) => item.rule === filter.rule);
  const found = rule && rule.names.find((item) => item.name === filter.name);
  if (found) {
    return found;
  }
  return {
    name: filter.name,
    source: filter.source || "",
    param: filter.param || "",
    count: 0,
    values: [],
  };
}

function dashMxApplyFilter(theme, next) {
  if (dashMxSameFilter(next)) {
    dashMxFilter = null;
    dashMxRule = "";
    dashMxName = "";
    dashMxValueCache = null;
  } else {
    dashMxFilter = next;
    dashMxRule = next.level === "name" ? next.rule : "";
    dashMxName = next.level === "name" ? next.name : "";
    if (next.level !== "name") {
      dashMxValueCache = null;
    }
  }
  dashMatchLoad(theme);
}

function dashMxBusyNote(theme, text) {
  const root = theme.querySelector(".ptaf-dash-match");
  if (!root) {
    return;
  }
  let note = root.querySelector(".ptaf-mx-note");
  if (note) {
    note.textContent = text;
    return;
  }
  const toolbar = root.querySelector(".ptaf-mx-toolbar");
  if (!toolbar) {
    if (!root.childElementCount) {
      const status = document.createElement("p");
      status.className = "ptaf-mx-empty";
      status.textContent = text;
      root.append(status);
    }
    return;
  }
  note = document.createElement("p");
  note.className = "ptaf-mx-note";
  note.textContent = text;
  toolbar.append(note);
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

function dashMxValues(body, values, trace) {
  body.replaceChildren();
  dashMxRowTrace = new WeakMap();
  if (!dashMxName) {
    const empty = document.createElement("p");
    empty.className = "ptaf-mx-empty";
    empty.textContent = "Выберите Matched name";
    body.append(empty);
    return trace && trace.error ? trace.error : "";
  }
  if (!values.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-mx-empty";
    empty.textContent = "Для этого имени нет значений";
    body.append(empty);
    return trace && trace.error ? trace.error : "";
  }
  let failed = false;
  let firstHit = -1;
  const list = document.createElement("div");
  list.className = "ptaf-mx-list";
  values.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "ptaf-mx-value";
    row.dataset.pick = String(index);
    const text = document.createElement("span");
    const shown = item.value || "—";
    if (trace && trace.re && item.value) {
      const parsed = dashMxTraceText(item.value, trace);
      if (parsed.error) {
        failed = true;
        text.textContent = shown;
      } else {
        if (parsed.hit && firstHit < 0) {
          firstHit = index;
        }
        row.classList.toggle("is-hit", parsed.hit);
        dashMxRowTrace.set(row, { text: item.value, matches: parsed.matches });
        parsed.parts.forEach((part) => {
          if (!part.hit) {
            text.append(document.createTextNode(part.text));
            return;
          }
          const mark = document.createElement("mark");
          mark.dataset.match = String(part.match);
          if (part.spans && part.spans.length) {
            dashMxTraceSegments(item.value, part.start, part.start + part.text.length, part.spans).forEach((segment) => {
              const atom = document.createElement("span");
              atom.className = "ptaf-mx-atom";
              atom.dataset.nodes = segment.ids.join(" ");
              atom.textContent = item.value.slice(segment.textStart, segment.textEnd);
              mark.append(atom);
            });
            if (!mark.childNodes.length) {
              mark.textContent = part.text;
            }
          } else {
            mark.textContent = part.text;
          }
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
  if (firstHit >= 0) {
    const picked = list.children[dashMxRailPick];
    const data = picked ? dashMxRowTrace.get(picked) : null;
    if (!data || !data.matches.length) {
      dashMxRailPick = firstHit;
      dashMxRailStep = 0;
    }
  }
  return failed ? "Выражение не разбирается" : (trace && trace.error ? trace.error : "");
}

function dashMxRailMount(host, trace) {
  host.replaceChildren();
  dashMxRailSvg = null;
  dashMxRailMap = null;
  dashMxRailTip = null;
  dashMxRailNav = null;
  const visible = Boolean(trace && (trace.ast || trace.note));
  host.hidden = !visible;
  if (!visible) {
    return;
  }
  if (trace.ast) {
    const built = dashMxRailBuild(trace.ast);
    dashMxRailSvg = built.svg;
    dashMxRailMap = built.tree;
    const view = document.createElement("div");
    view.className = "ptaf-mx-rail-view";
    view.append(built.svg);
    host.append(view);
  }
  const note = document.createElement("p");
  note.className = "ptaf-mx-rail-note";
  note.textContent = trace.ast
    ? "Наведите на блок — фрагмент в значении. Щелчок по значению оставляет его путь."
    : (trace.note || "");
  if (note.textContent) {
    host.append(note);
  }
  const tip = document.createElement("p");
  tip.className = "ptaf-mx-rail-tip";
  tip.hidden = true;
  host.append(tip);
  dashMxRailTip = tip;
  const nav = document.createElement("div");
  nav.className = "ptaf-mx-rail-nav";
  nav.hidden = true;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "Предыдущее совпадение");
  const count = document.createElement("span");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Следующее совпадение");
  prev.addEventListener("click", () => {
    dashMxRailStep -= 1;
    dashMxRailHoverPick = -1;
    dashMxRailSync();
  });
  next.addEventListener("click", () => {
    dashMxRailStep += 1;
    dashMxRailHoverPick = -1;
    dashMxRailSync();
  });
  nav.append(prev, count, next);
  host.append(nav);
  dashMxRailNav = nav;
  dashMxRailCount = count;
  dashMxRailPrev = prev;
  dashMxRailNext = next;
}

function dashMxRailRow(pick) {
  if (!dashMxValuesBody || pick < 0) {
    return null;
  }
  return dashMxValuesBody.querySelector(`.ptaf-mx-value[data-pick="${pick}"]`);
}

function dashMxRailSync() {
  const hovered = dashMxRailHoverPick >= 0;
  const pick = hovered ? dashMxRailHoverPick : dashMxRailPick;
  const row = dashMxRailRow(pick);
  const data = row ? dashMxRowTrace.get(row) : null;
  const matches = data && data.matches ? data.matches : [];
  let step = hovered ? dashMxRailHoverStep : dashMxRailStep;
  if (!matches.length) {
    step = 0;
  } else if (step < 0) {
    step = 0;
  } else if (step >= matches.length) {
    step = matches.length - 1;
  }
  if (!hovered) {
    dashMxRailStep = step;
  }
  const match = matches[step] || null;
  dashMxRailMark(dashMxRailSvg, dashMxRailMap, match ? match.spans : [], dashMxRailHot);
  if (dashMxValuesBody) {
    dashMxValuesBody.querySelectorAll(".ptaf-mx-value").forEach((item) => {
      const index = Number(item.dataset.pick);
      const pinned = index === dashMxRailPick;
      const rowData = dashMxRowTrace.get(item);
      item.classList.toggle("is-sample", pinned && Boolean(rowData && rowData.matches.length));
      item.classList.toggle("is-preview", hovered && index === dashMxRailHoverPick && !pinned);
    });
    dashMxValuesBody.querySelectorAll("mark[data-match]").forEach((mark) => {
      const parent = mark.closest(".ptaf-mx-value");
      const current = parent && Number(parent.dataset.pick) === pick && Number(mark.dataset.match) === step;
      mark.classList.toggle("is-current", Boolean(current));
    });
    dashMxValuesBody.querySelectorAll(".ptaf-mx-atom").forEach((atom) => {
      const ids = (atom.dataset.nodes || "").split(" ").filter(Boolean);
      atom.classList.toggle("is-hot", Boolean(dashMxRailHot) && ids.includes(String(dashMxRailHot)));
    });
  }
  if (dashMxRailNav) {
    const pinned = dashMxRailRow(dashMxRailPick);
    const pinnedData = pinned ? dashMxRowTrace.get(pinned) : null;
    const total = pinnedData && pinnedData.matches ? pinnedData.matches.length : 0;
    dashMxRailNav.hidden = total < 2;
    if (dashMxRailCount) {
      const shown = total ? Math.min(dashMxRailStep, total - 1) + 1 : 0;
      dashMxRailCount.textContent = total ? `Совпадение ${shown} из ${total}` : "";
    }
    if (dashMxRailPrev) {
      dashMxRailPrev.disabled = dashMxRailStep <= 0;
    }
    if (dashMxRailNext) {
      dashMxRailNext.disabled = !total || dashMxRailStep >= total - 1;
    }
  }
  if (!dashMxRailTip) {
    return;
  }
  if (!dashMxRailHot) {
    dashMxRailTip.hidden = true;
    dashMxRailTip.textContent = "";
    return;
  }
  const labelNode = dashMxRailSvg && dashMxRailSvg.querySelector(`[data-label][data-nid="${CSS.escape(String(dashMxRailHot))}"]`);
  const label = labelNode ? labelNode.dataset.label : "";
  const spans = match ? match.spans.filter((span) => span.id === dashMxRailHot) : [];
  if (!spans.length) {
    dashMxRailTip.hidden = !label;
    dashMxRailTip.textContent = label ? `${label} — в этом совпадении не участвует` : "";
    return;
  }
  const chunks = spans.filter((span) => !span.empty).map((span) => (data ? data.text.slice(span.start, span.end) : ""));
  dashMxRailTip.hidden = false;
  dashMxRailTip.textContent = chunks.length ? chunks.join(" · ") : "Пустое место в строке";
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
    dashMxValueCache = null;
    dashMatchLoad(theme);
  });
  toolbar.append(periodHost);

  const apps = dashMxApps(dashMxCache.rows || []);
  const note = document.createElement("p");
  note.className = "ptaf-mx-note";
  if (dashMxCache.error) {
    note.textContent = dashMxCache.error;
  } else if (dashMxValueCache && dashMxValueCache.error) {
    note.textContent = dashMxValueCache.error;
  } else if (dashMxFilter && dashMxFilter.level === "name" && dashMxValueCache && dashMxValueCache.truncated) {
    note.textContent = `По последним ${dashMxValueCache.read} событиям этого совпадения`;
  } else if (dashMxCache.truncated) {
    note.textContent = dashMxFilter
      ? `По последним ${dashMxCache.read} событиям фильтра`
      : `По последним ${dashMxCache.read} событиям периода`;
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
  const valueName = dashMxValueCache && !dashMxValueCache.error && dashMxFilter && dashMxFilter.level === "name"
    ? dashMxFocusName(dashMxValueCache.rows || [], dashMxFilter)
    : null;
  shownApps.forEach((application, appIndex) => {
    const group = document.createElement("section");
    group.className = "ptaf-mx-group";
    const appId = `app-${appIndex}`;
    const appCard = dashMxCard(appId, application.name, application.count, DASH_MX_COLORS[0]);
    appCard.classList.add("is-app");
    bind(appCard, {
      level: "app",
      app: application.name,
      appId: application.appId || "",
      rule: "",
      ruleId: "",
      name: "",
      source: "",
      param: "",
    });
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
      bind(ruleCard, {
        level: "rule",
        app: application.name,
        appId: application.appId || "",
        rule: rule.rule,
        ruleId: rule.ruleId || "",
        eventId: rule.eventId || "",
        name: "",
        source: "",
        param: "",
      });
      const names = document.createElement("div");
      names.className = "ptaf-mx-names";
      let list = rule.names.slice(0, limits.names);
      if (
        dashMxFilter
        && dashMxFilter.level === "name"
        && dashMxFilter.app === application.name
        && dashMxFilter.rule === rule.rule
        && dashMxName
        && !list.some((item) => item.name === dashMxName)
      ) {
        const extra = rule.names.find((item) => item.name === dashMxName) || valueName;
        if (extra) {
          list = list.concat(extra);
        }
      }
      list.forEach((item, nameIndex) => {
        const shown = valueName && item.name === dashMxName ? valueName : item;
        const card = dashMxCard(`name-${appIndex}-${ruleIndex}-${nameIndex}`, shown.name, shown.count, color);
        card.dataset.from = ruleId;
        card.dataset.color = color;
        card.classList.add("is-name");
        if (dashMxRule === rule.rule && dashMxName === item.name && dashMxFilter && dashMxFilter.app === application.name) {
          chosen = shown;
          dashMxPlace = {
            app: application.name,
            rule: rule.rule,
            source: shown.source,
            param: shown.param,
            name: shown.name,
          };
        }
        bind(card, {
          level: "name",
          app: application.name,
          appId: application.appId || "",
          rule: rule.rule,
          ruleId: rule.ruleId || "",
          eventId: rule.eventId || "",
          name: item.name,
          source: item.source,
          param: item.param,
        });
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
  pattern.autocomplete = "off";
  pattern.autocapitalize = "off";
  pattern.placeholder = "Выражение";
  pattern.value = dashMxPattern;
  const patternError = document.createElement("p");
  patternError.className = "ptaf-mx-pattern-error";
  const rail = document.createElement("div");
  rail.className = "ptaf-mx-rail";
  rail.hidden = true;
  const valuesBody = document.createElement("div");
  dashMxValuesBody = valuesBody;
  const refreshPattern = () => {
    if (pattern.value !== dashMxRailSource) {
      dashMxRailSource = pattern.value;
      dashMxRailStep = 0;
      dashMxRailHot = 0;
      dashMxRailHoverPick = -1;
    }
    dashMxPattern = pattern.value;
    const trace = dashMxCompile(dashMxPattern.trim());
    const message = dashMxValues(valuesBody, chosen ? chosen.values : [], trace);
    patternError.textContent = message;
    pattern.classList.toggle("is-bad", Boolean(message));
    patternError.hidden = !message;
    layout.classList.toggle("has-rail", Boolean(trace && trace.ast));
    dashMxRailMount(rail, trace);
    dashMxRailSync();
  };
  pattern.addEventListener("input", refreshPattern);
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
        dashMxSkipCache = null;
        dashMxFillSkips(skipList, skipRule, dashMxPlace);
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
  const skipList = document.createElement("div");
  skipList.className = "ptaf-mx-skip-list";
  const skipRule = dashMxFilter && (dashMxFilter.level === "rule" || dashMxFilter.level === "name")
    ? { app: dashMxFilter.app, rule: dashMxFilter.rule }
    : null;
  skipBox.append(skipList, create, choices, skipStatus);
  dashMxFillSkips(skipList, skipRule, dashMxPlace);
  valuesColumn.append(valuesTitle, patternLabel, rail, patternError, skipBox, valuesBody);
  valuesBody.addEventListener("pointerover", (event) => {
    const row = event.target.closest(".ptaf-mx-value");
    if (!row) {
      return;
    }
    dashMxRailHoverPick = Number(row.dataset.pick);
    const mark = event.target.closest("mark[data-match]");
    dashMxRailHoverStep = mark ? Number(mark.dataset.match) : 0;
    const atom = event.target.closest(".ptaf-mx-atom");
    if (atom && row.contains(atom)) {
      const ids = (atom.dataset.nodes || "").split(" ").filter(Boolean);
      dashMxRailHot = ids.length ? Number(ids[ids.length - 1]) : 0;
    } else {
      dashMxRailHot = 0;
    }
    dashMxRailSync();
  });
  valuesBody.addEventListener("pointerout", (event) => {
    if (event.relatedTarget && valuesBody.contains(event.relatedTarget)) {
      return;
    }
    dashMxRailHoverPick = -1;
    if (!(event.relatedTarget && rail.contains(event.relatedTarget))) {
      dashMxRailHot = 0;
    }
    dashMxRailSync();
  });
  valuesBody.addEventListener("click", (event) => {
    const row = event.target.closest(".ptaf-mx-value");
    if (!row || row.dataset.pick == null) {
      return;
    }
    const data = dashMxRowTrace.get(row);
    if (!data || !data.matches.length) {
      return;
    }
    const mark = event.target.closest("mark[data-match]");
    dashMxRailPick = Number(row.dataset.pick);
    dashMxRailStep = mark ? Number(mark.dataset.match) : 0;
    dashMxRailHoverPick = -1;
    dashMxRailSync();
  });
  rail.addEventListener("pointerover", (event) => {
    const node = event.target.closest("[data-nid]");
    dashMxRailHot = node ? Number(node.dataset.nid) : 0;
    dashMxRailSync();
  });
  rail.addEventListener("pointerout", (event) => {
    if (event.relatedTarget && rail.contains(event.relatedTarget)) {
      return;
    }
    dashMxRailHot = 0;
    dashMxRailSync();
  });
  refreshPattern();

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
  dashMxBusyNote(theme, "Читаем события…");
  const filter = dashMxFilter;
  const treeFilter = filter && filter.level === "name"
    ? {
      level: "rule",
      app: filter.app,
      appId: filter.appId,
      rule: filter.rule,
      ruleId: filter.ruleId,
      eventId: filter.eventId,
      name: "",
      source: "",
      param: "",
    }
    : filter;
  const treeKey = dashMxSampleKey(treeFilter);
  let treeSample = dashMxCache;
  const reuseTree = Boolean(
    filter
    && filter.level === "name"
    && treeSample
    && treeSample.key === treeKey
    && !treeSample.error,
  );
  try {
    const ready = await dashMxEnsureRule(treeFilter, token);
    if (!ready) {
      return;
    }
    if (!reuseTree) {
      treeSample = await dashMxSample(dashMxRange(), token, dashMxQueryFilter(treeFilter));
      if (!treeSample) {
        return;
      }
      treeSample.key = treeKey;
    }
  } catch (error) {
    if (token !== dashMxToken || !dashMxActive) {
      return;
    }
    dashMxCache = {
      rows: [],
      read: 0,
      truncated: false,
      error: error && error.message ? error.message : "Не удалось прочитать события",
      key: treeKey,
    };
    dashMxValueCache = null;
    dashMxPaint(theme);
    return;
  }
  let valueSample = null;
  if (filter && filter.level === "name") {
    const valueKey = `${treeKey}\0${filter.source || ""}\0${filter.param || ""}\0${filter.name || ""}`;
    try {
      if (dashMxValueCache && dashMxValueCache.key === valueKey && !dashMxValueCache.error) {
        valueSample = dashMxValueCache;
      } else {
        valueSample = await dashMxSample(dashMxRange(), token, dashMxQueryFilter(filter));
        if (!valueSample) {
          return;
        }
        valueSample.key = valueKey;
      }
    } catch (error) {
      if (token !== dashMxToken || !dashMxActive) {
        return;
      }
      valueSample = {
        rows: [],
        read: 0,
        truncated: false,
        error: error && error.message ? error.message : "Не удалось прочитать события",
        key: valueKey,
      };
    }
  }
  if (token !== dashMxToken || !dashMxActive) {
    return;
  }
  dashMxApplyRuleIds(treeSample.rows);
  dashMxCache = treeSample;
  dashMxValueCache = valueSample;
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

globalThis.dashMatchPause = dashMatchPause;

function dashMatchReload(theme) {
  if (!dashMxActive) {
    dashMatchOpen(theme);
    return;
  }
  dashMxCache = { rows: [], read: 0, truncated: false, error: "", key: "" };
  dashMxValueCache = null;
  dashMxRuleMap = new Map();
  dashMatchLoad(theme);
}
