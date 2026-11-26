const EXCLUSIONS_BUTTON_ID = "ptaf-exclusions-open";
const EXCLUSIONS_PANEL_ID = "ptaf-exclusions-panel";
const EXCLUSIONS_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXCLUSIONS_PAGE = new RegExp(
  `/conf-scheme/(application_policy|policy|user_policy)/(${EXCLUSIONS_UUID})`,
  "i"
);

const exclusionsState = {
  token: 0,
  open: false,
  pageKey: "",
  loadedKey: "",
  query: "",
  loading: false,
  status: "",
  note: "",
  error: "",
  empty: "",
  rows: [],
};

let exclusionsEnabled = true;
let exclusionsFrame = 0;
let exclusionsObserver = null;
let exclusionsStopped = false;

function exclusionsAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function exclusionsPageKey(page) {
  return page ? `${page.kind}:${page.id}` : "";
}

function parseExclusionsPage() {
  if (/\/rules\/rule\//i.test(location.pathname)) {
    return null;
  }
  const match = location.pathname.match(EXCLUSIONS_PAGE);
  if (!match) {
    return null;
  }
  const route = match[1].toLowerCase();
  return {
    kind: route === "user_policy" ? "template" : "policy",
    route,
    id: match[2],
  };
}

function exclusionsName(value) {
  if (typeof textFromLocale === "function") {
    return textFromLocale(value);
  }
  return typeof value === "string" ? value.trim() : "";
}

function exclusionsCache() {
  const map = new Map();
  return {
    get(path) {
      if (!map.has(path)) {
        map.set(path, api(path).catch((error) => {
          map.delete(path);
          throw error;
        }));
      }
      return map.get(path);
    },
  };
}

async function exclusionsList(cache, path, required) {
  try {
    const body = await cache.get(path);
    return typeof itemsOf === "function" ? itemsOf(body) : (Array.isArray(body) ? body : []);
  } catch (error) {
    if (required) {
      throw error;
    }
    return [];
  }
}

function policyCollections(id) {
  return [
    {
      listPath: `/config/policies/${id}/rules`,
      detailPath: (ruleId) => `/config/policies/${id}/rules/${ruleId}`,
      required: true,
    },
    {
      listPath: `/config/policies/${id}/user_rules`,
      detailPath: (ruleId) => `/config/policies/${id}/user_rules/${ruleId}`,
      required: false,
    },
  ];
}

function exclusionsTemplatePlace(template, order) {
  return {
    order,
    kind: "template",
    id: template.id,
    name: exclusionsName(template.name) || template.id,
    route: "user_policy",
    collections: [
      {
        listPath: `/config/policies/templates/user/${template.id}/rules`,
        detailPath: (ruleId) => `/config/policies/templates/user/${template.id}/rules/${ruleId}`,
        required: true,
      },
    ],
    parentMode: "vendor",
    template,
    parentId: "",
  };
}

function exclusionsPolicyPlace(policy, route, order, parentMode, parentId) {
  return {
    order,
    kind: "policy",
    id: policy.id,
    name: exclusionsName(policy.name) || policy.id,
    route,
    collections: policyCollections(policy.id),
    parentMode,
    template: null,
    parentId: parentId || "",
  };
}

async function resolveExclusionsPlaces(page, cache) {
  const notes = [];
  if (page.kind === "policy") {
    const policy = await cache.get(`/config/policies/${page.id}`);
    const templateId = typeof linkedTemplateId === "function" ? linkedTemplateId(policy) : "";
    let template = null;
    if (templateId) {
      try {
        template = await cache.get(`/config/policies/templates/user/${templateId}`);
      } catch (error) {
        notes.push("Шаблон политики не найден. Унаследованные части не с чем сравнить.");
      }
    } else {
      notes.push("Шаблон политики не найден. Унаследованные части не с чем сравнить.");
    }
    const places = [];
    if (template && template.id) {
      places.push(exclusionsTemplatePlace(template, 0));
    }
    places.push(exclusionsPolicyPlace(
      { id: policy.id || page.id, name: policy.name },
      page.route,
      1,
      template && template.id ? "template" : "missing",
      template && template.id
    ));
    return { places, notes };
  }
  const template = await cache.get(`/config/policies/templates/user/${page.id}`);
  const policies = (await exclusionsList(cache, "/config/policies", true))
    .filter((item) => item && item.id && linkedTemplateId(item) === page.id)
    .sort((left, right) => exclusionsName(left.name).localeCompare(exclusionsName(right.name), "ru"));
  const places = [exclusionsTemplatePlace(template, 0)];
  policies.forEach((policy, index) => {
    places.push(exclusionsPolicyPlace(policy, "application_policy", index + 1, "template", page.id));
  });
  return { places, notes };
}

function indexRules(items) {
  const byRuleId = new Map();
  for (const rule of items) {
    if (rule && rule.rule_id && rule.id && !byRuleId.has(rule.rule_id)) {
      byRuleId.set(rule.rule_id, rule);
    }
  }
  return byRuleId;
}

async function loadParentIndex(place, cache) {
  if (place.parentMode === "missing") {
    return { mode: "missing" };
  }
  if (place.parentMode === "template") {
    try {
      const items = await exclusionsList(cache, `/config/policies/templates/user/${place.parentId}/rules`, true);
      const byRuleId = indexRules(items);
      return {
        mode: "ready",
        find(ruleId) {
          const rule = ruleId ? byRuleId.get(ruleId) : null;
          if (!rule) {
            return null;
          }
          return `/config/policies/templates/user/${place.parentId}/rules/${rule.id}`;
        },
      };
    } catch (error) {
      return { mode: "error" };
    }
  }
  const vendors = [];
  const entries = typeof systemTemplateIds === "function" ? systemTemplateIds(place.template) : [];
  for (const entry of entries) {
    const id = entry && typeof entry === "object" ? entry.id : entry;
    if (id) {
      vendors.push(String(id));
    }
  }
  const maps = [];
  for (const vendorId of vendors) {
    try {
      const items = await exclusionsList(cache, `/config/policies/templates/vendor/${vendorId}/rules`, true);
      maps.push({ vendorId, byRuleId: indexRules(items) });
    } catch (error) {
      return { mode: "error" };
    }
  }
  return {
    mode: "ready",
    find(ruleId) {
      if (!ruleId) {
        return null;
      }
      for (const entry of maps) {
        const rule = entry.byRuleId.get(ruleId);
        if (rule) {
          return `/config/policies/templates/vendor/${entry.vendorId}/rules/${rule.id}`;
        }
      }
      return null;
    },
  };
}

function exclusionsPieces(details) {
  if (typeof collectListPlaces !== "function" || typeof itemsByKind !== "function") {
    return [];
  }
  const places = collectListPlaces(details);
  const pieces = [];
  for (const kind of ["exclusion", "skip"]) {
    for (const item of itemsByKind(places, kind)) {
      pieces.push({ kind, item });
    }
  }
  return pieces;
}

function pieceSignature(piece) {
  return `${piece.kind}:${exclusionSignature(piece.item)}`;
}

function addedPieces(details, parent) {
  const own = exclusionsPieces(details);
  if (!parent) {
    return own;
  }
  const seen = new Set(exclusionsPieces(parent).map(pieceSignature));
  return own.filter((piece) => !seen.has(pieceSignature(piece)));
}

function exclusionsEnglish() {
  if (typeof interfaceLocale !== "function") {
    return false;
  }
  return String(interfaceLocale()).toLowerCase().startsWith("en");
}

function exclusionsCaption(key) {
  const english = exclusionsEnglish();
  const labels = english
    ? { parameter: "Parameter", condition: "Condition", value: "Value", name: "Name", and: "AND", or: "OR" }
    : { parameter: "Параметр", condition: "Условие", value: "Значение", name: "Имя", and: "И", or: "ИЛИ" };
  return labels[key] || key;
}

function sourceLabel(source) {
  const token = String(source || "");
  if (exclusionsEnglish()) {
    const english = {
      CLIENT_IP: "IP address",
      CLIENT_COUNTRY: "Country",
      CLIENT_REGION: "Region",
      CLIENT_CITY: "City",
      REQUEST_GET: "GET parameter",
      REQUEST_POST: "POST parameter",
      REQUEST_HEADERS: "Header",
      REQUEST_COOKIES: "Cookie",
      REQUEST_PATH: "Path",
      REQUEST_URI: "URI",
      REQUEST_METHOD: "Method",
      WEBSOCKET_UPSTREAM: "WebSocket upstream",
    };
    return english[token] || token;
  }
  if (typeof labelOf === "function" && typeof PARAM_LABELS !== "undefined") {
    return labelOf(PARAM_LABELS, token) || token;
  }
  return token;
}

function operatorLabel(operator) {
  const token = String(operator || "");
  if (exclusionsEnglish()) {
    const english = {
      eq: "is",
      equal: "is",
      equals: "is",
      is: "is",
      ne: "is not",
      neq: "is not",
      not_equal: "is not",
      is_not: "is not",
      regexp: "matches regular expression (Lua)",
      regex_hs: "matches regular expression (Hyperscan)",
      regex: "matches regular expression",
      match: "matches regular expression",
      matches: "matches regular expression",
      contains: "contains",
      icontains: "contains",
      in: "in list",
      exists: "exists",
      empty: "empty",
    };
    const key = token.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return english[key] || token;
  }
  if (typeof labelOf === "function" && typeof OPERATOR_LABELS !== "undefined") {
    return labelOf(OPERATOR_LABELS, token) || token;
  }
  return token;
}

function shownValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => shownValue(item)).join(", ");
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function conditionRecord(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const nested = entry.condition && typeof entry.condition === "object" ? entry.condition : {};
  const value = nested.value != null ? nested.value : entry.value;
  return {
    source: entry.source || entry.parameter || entry.field || "",
    name: entry.name || entry.header || entry.param || nested.name || "",
    operator: nested.operator || entry.operator || entry.op || "",
    value: value == null ? "" : value,
  };
}

function exclusionGroups(item) {
  if (!item || typeof item !== "object") {
    return [];
  }
  if (Array.isArray(item.group) && item.group.length) {
    return [item.group.map(conditionRecord).filter(Boolean)];
  }
  const groups = item.conditions || item.condition || item.condition_groups || item.conditionGroups || item.groups || item.parameters;
  if (Array.isArray(groups) && groups.length && Array.isArray(groups[0])) {
    return groups.map((group) => group.map(conditionRecord).filter(Boolean));
  }
  if (Array.isArray(groups) && groups.length && groups[0] && typeof groups[0] === "object" && Array.isArray(groups[0].conditions)) {
    return groups.map((group) => group.conditions.map(conditionRecord).filter(Boolean));
  }
  if (Array.isArray(groups) && groups.length && typeof looksLikeCondition === "function" && looksLikeCondition(groups[0])) {
    return [groups.map(conditionRecord).filter(Boolean)];
  }
  if (typeof looksLikeCondition === "function" && looksLikeCondition(item)) {
    const record = conditionRecord(item);
    return record ? [[record]] : [];
  }
  return [];
}

function pieceView(piece) {
  if (piece.kind === "skip") {
    const item = piece.item || {};
    const conditions = item.conditions && typeof item.conditions === "object" && !Array.isArray(item.conditions) ? item.conditions : {};
    return {
      type: "skip",
      source: item.source || "",
      skip: item.skip || "",
      conditions,
    };
  }
  const groups = exclusionGroups(piece.item);
  if (groups.length) {
    return { type: "exclusion", groups };
  }
  const lines = typeof exclusionLines === "function" ? exclusionLines(piece.item).filter(Boolean) : [];
  return { type: "text", lines };
}

function pieceText(view) {
  if (view.type === "skip") {
    const lines = ["source", view.source, "skip", view.skip, "conditions"];
    for (const key of Object.keys(view.conditions)) {
      lines.push(key, shownValue(view.conditions[key]));
    }
    return lines.filter(Boolean).join(" ");
  }
  if (view.type === "exclusion") {
    return view.groups.map((group) => group.map((record) => [
      sourceLabel(record.source),
      record.name,
      operatorLabel(record.operator),
      shownValue(record.value),
    ].filter(Boolean).join(" ")).join(` ${exclusionsCaption("and")} `)).join(` ${exclusionsCaption("or")} `);
  }
  return (view.lines || []).join("\n");
}

function exclusionsField(caption, value, wide) {
  const line = document.createElement("div");
  line.className = wide ? "ptaf-exclusions-line is-wide" : "ptaf-exclusions-line";
  const label = document.createElement("span");
  label.className = "ptaf-exclusions-caption";
  label.textContent = caption;
  const field = document.createElement("span");
  field.className = wide ? "ptaf-exclusions-field is-wide" : "ptaf-exclusions-field";
  field.textContent = value;
  line.append(label, field);
  return line;
}

function renderExclusionView(view) {
  const stack = document.createElement("div");
  stack.className = "ptaf-exclusions-stack";
  view.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      const join = document.createElement("div");
      join.className = "ptaf-exclusions-join";
      join.textContent = exclusionsCaption("or");
      stack.append(join);
    }
    const frame = document.createElement("div");
    frame.className = "ptaf-exclusions-frame";
    group.forEach((record, index) => {
      if (index > 0) {
        const join = document.createElement("div");
        join.className = "ptaf-exclusions-join";
        join.textContent = exclusionsCaption("and");
        frame.append(join);
      }
      const head = document.createElement("div");
      head.className = "ptaf-exclusions-pair";
      head.append(
        exclusionsField(exclusionsCaption("parameter"), sourceLabel(record.source), false),
        exclusionsField(exclusionsCaption("condition"), operatorLabel(record.operator), false)
      );
      frame.append(head);
      if (record.name) {
        frame.append(exclusionsField(exclusionsCaption("name"), record.name, true));
      }
      frame.append(exclusionsField(exclusionsCaption("value"), shownValue(record.value), true));
    });
    stack.append(frame);
  });
  return stack;
}

function renderTreePair(key, value) {
  const block = document.createElement("div");
  block.className = "ptaf-exclusions-tree-pair";
  const name = document.createElement("div");
  name.className = "ptaf-exclusions-tree-key";
  name.textContent = key;
  const shown = document.createElement("div");
  shown.className = "ptaf-exclusions-tree-value";
  shown.textContent = shownValue(value);
  block.append(name, shown);
  return block;
}

function renderSkipView(view) {
  const tree = document.createElement("div");
  tree.className = "ptaf-exclusions-tree";
  tree.append(renderTreePair("source", view.source), renderTreePair("skip", view.skip));
  const conditions = document.createElement("div");
  conditions.className = "ptaf-exclusions-tree-key";
  conditions.textContent = "conditions";
  const nest = document.createElement("div");
  nest.className = "ptaf-exclusions-tree-nest";
  for (const key of Object.keys(view.conditions)) {
    nest.append(renderTreePair(key, view.conditions[key]));
  }
  tree.append(conditions, nest);
  return tree;
}

function renderPiece(view) {
  if (!view || view.type === "text") {
    const text = document.createElement("div");
    text.className = "ptaf-exclusions-plain";
    text.textContent = view && view.lines ? view.lines.join("\n") : "";
    return text;
  }
  if (view.type === "skip") {
    return renderSkipView(view);
  }
  return renderExclusionView(view);
}

function placeLabel(place) {
  return place.kind === "template" ? `Шаблон политики «${place.name}»` : `Политика «${place.name}»`;
}

function ruleHref(place, ruleId) {
  return `/conf-scheme/${place.route}/${place.id}/rules/rule/${ruleId}/overview`;
}

function ruleTitle(listed, details, translations) {
  const raw = (details && details.name) || listed.name;
  const named = typeof displayText === "function"
    ? displayText(raw, translations, [listed.rule_id, details && details.rule_id])
    : "";
  return named || exclusionsName(raw) || listed.id;
}

async function exclusionsPool(items, limit, worker) {
  let cursor = 0;
  const runners = [];
  const count = Math.min(limit, items.length);
  for (let index = 0; index < count; index += 1) {
    runners.push((async () => {
      while (cursor < items.length) {
        const current = cursor;
        cursor += 1;
        await worker(items[current], current);
      }
    })());
  }
  await Promise.all(runners);
}

async function loadExclusions(page, token) {
  const cache = exclusionsCache();
  try {
    const translations = typeof loadRuleTranslations === "function" ? await loadRuleTranslations() : null;
    if (token !== exclusionsState.token) {
      return;
    }
    const resolved = await resolveExclusionsPlaces(page, cache);
    if (token !== exclusionsState.token) {
      return;
    }
    const jobs = [];
    for (const place of resolved.places) {
      try {
        const overridden = [];
        for (const collection of place.collections) {
          const items = await exclusionsList(cache, collection.listPath, collection.required);
          if (token !== exclusionsState.token) {
            return;
          }
          for (const rule of items) {
            if (rule && rule.id && rule.has_overrides === true) {
              overridden.push({ rule, collection });
            }
          }
        }
        if (!overridden.length) {
          continue;
        }
        const parent = await loadParentIndex(place, cache);
        if (token !== exclusionsState.token) {
          return;
        }
        if (parent.mode === "error") {
          jobs.push({ place, failed: overridden.length });
          continue;
        }
        for (const entry of overridden) {
          jobs.push({ place, entry, parent });
        }
      } catch (error) {
        if (place.kind === page.kind && place.id === page.id) {
          throw error;
        }
        const where = place.kind === "template" ? "Шаблон политики" : `Политику «${place.name}»`;
        resolved.notes.push(`${where} прочитать не удалось.`);
      }
    }
    const rows = [];
    let unread = 0;
    let finished = 0;
    const readable = jobs.filter((job) => job.entry);
    if (jobs.some((job) => job.failed)) {
      unread += jobs.reduce((sum, job) => sum + (job.failed || 0), 0);
    }
    if (readable.length && token === exclusionsState.token) {
      exclusionsState.status = `Правило 0 из ${readable.length}.`;
      paintExclusions();
    }
    await exclusionsPool(readable, 6, async (job) => {
      if (token !== exclusionsState.token) {
        return;
      }
      try {
        const details = await cache.get(job.entry.collection.detailPath(job.entry.rule.id));
        if (token !== exclusionsState.token) {
          return;
        }
        const ruleId = (details && details.rule_id) || job.entry.rule.rule_id || "";
        let parent = null;
        if (job.parent.mode === "ready") {
          const path = job.parent.find(ruleId);
          if (path) {
            parent = await cache.get(path);
          }
        }
        if (token !== exclusionsState.token) {
          return;
        }
        const name = ruleTitle(job.entry.rule, details, translations);
        for (const piece of addedPieces(details, parent)) {
          const view = pieceView(piece);
          rows.push({
            order: job.place.order,
            name,
            place: placeLabel(job.place),
            href: ruleHref(job.place, job.entry.rule.id),
            kindOrder: piece.kind === "skip" ? 1 : 0,
            text: pieceText(view),
            view,
          });
        }
      } catch (error) {
        unread += 1;
      } finally {
        finished += 1;
        if (token === exclusionsState.token) {
          exclusionsState.status = `Правило ${finished} из ${readable.length}.`;
          paintExclusions();
        }
      }
    });
    if (token !== exclusionsState.token) {
      return;
    }
    rows.sort((left, right) => left.order - right.order
      || left.name.localeCompare(right.name, "ru")
      || left.kindOrder - right.kindOrder
      || left.text.localeCompare(right.text, "ru"));
    exclusionsState.rows = rows;
    exclusionsState.note = resolved.notes.join(" ");
    exclusionsState.error = unread ? `Не удалось прочитать правил: ${unread}.` : "";
    exclusionsState.loading = false;
    exclusionsState.status = "";
    exclusionsState.loadedKey = exclusionsPageKey(page);
    exclusionsState.empty = "";
    if (!rows.length && !unread) {
      exclusionsState.empty = readable.length
        ? "Своих исключений и пропускаемых частей нет."
        : "Переопределённых правил нет.";
    }
    paintExclusions();
  } catch (error) {
    if (token !== exclusionsState.token) {
      return;
    }
    exclusionsState.loading = false;
    exclusionsState.status = "";
    exclusionsState.rows = [];
    exclusionsState.error = error.message || "Не удалось прочитать правила.";
    exclusionsState.empty = "";
    paintExclusions();
  }
}

function startExclusionsLoad(page) {
  const token = exclusionsState.token + 1;
  exclusionsState.token = token;
  exclusionsState.pageKey = exclusionsPageKey(page);
  exclusionsState.loadedKey = "";
  exclusionsState.loading = true;
  exclusionsState.rows = [];
  exclusionsState.note = "";
  exclusionsState.error = "";
  exclusionsState.empty = "";
  exclusionsState.status = "Чтение списка правил...";
  paintExclusions();
  loadExclusions(page, token);
}

function exclusionsQueryMatch(row) {
  const query = typeof fold === "function" ? fold(exclusionsState.query).trim() : exclusionsState.query.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = typeof fold === "function"
    ? fold(`${row.name} ${row.place} ${row.text}`)
    : `${row.name} ${row.place} ${row.text}`.toLowerCase();
  return haystack.includes(query);
}

function exclusionsTheme(host) {
  return host && host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
}

function paintExclusions() {
  const host = document.getElementById(EXCLUSIONS_PANEL_ID);
  const theme = exclusionsTheme(host);
  if (!theme) {
    return;
  }
  if (typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  const status = theme.querySelector("[data-role='status']");
  const note = theme.querySelector("[data-role='note']");
  const error = theme.querySelector("[data-role='error']");
  const empty = theme.querySelector("[data-role='empty']");
  const body = theme.querySelector("tbody");
  if (status) {
    status.hidden = !exclusionsState.status;
    status.textContent = exclusionsState.status;
  }
  if (note) {
    note.hidden = !exclusionsState.note;
    note.textContent = exclusionsState.note;
  }
  if (error) {
    error.hidden = !exclusionsState.error;
    error.textContent = exclusionsState.error;
  }
  if (!body) {
    return;
  }
  body.replaceChildren();
  const visible = exclusionsState.rows.filter(exclusionsQueryMatch);
  visible.forEach((row, index) => {
    const tr = document.createElement("tr");
    const number = document.createElement("td");
    number.className = "ptaf-exclusions-num";
    number.textContent = String(index + 1);
    const name = document.createElement("td");
    const link = document.createElement("a");
    link.href = row.href;
    link.textContent = row.name;
    name.append(link);
    const place = document.createElement("td");
    place.textContent = row.place;
    const text = document.createElement("td");
    text.className = "ptaf-exclusions-text";
    text.append(renderPiece(row.view));
    tr.append(number, name, place, text);
    body.append(tr);
  });
  if (empty) {
    const message = exclusionsState.query.trim() && exclusionsState.rows.length && !visible.length
      ? "Ничего не найдено."
      : exclusionsState.empty;
    empty.hidden = exclusionsState.loading || !message;
    empty.textContent = message || "";
  }
}

function markExclusionsButton() {
  const host = document.getElementById(EXCLUSIONS_BUTTON_ID);
  const button = host && host.shadowRoot && host.shadowRoot.querySelector("button");
  if (!button) {
    return;
  }
  button.classList.toggle("is-on", exclusionsState.open);
  button.setAttribute("aria-pressed", exclusionsState.open ? "true" : "false");
}

function buildExclusionsPanel() {
  const root = document.createElement("div");
  root.className = "ptaf-exclusions";
  const bar = document.createElement("div");
  bar.className = "ptaf-exclusions-bar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "ptaf-exclusions-search";
  search.placeholder = "Правило, место или текст";
  search.setAttribute("aria-label", "Поиск по исключениям");
  search.value = exclusionsState.query;
  search.addEventListener("input", () => {
    exclusionsState.query = search.value;
    paintExclusions();
  });
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "ptaf-exclusions-refresh";
  refresh.textContent = "Обновить";
  refresh.addEventListener("click", () => {
    const page = parseExclusionsPage();
    if (page) {
      startExclusionsLoad(page);
    }
  });
  bar.append(search, refresh);
  const status = document.createElement("p");
  status.dataset.role = "status";
  status.className = "ptaf-exclusions-status";
  const note = document.createElement("p");
  note.dataset.role = "note";
  note.className = "ptaf-exclusions-note";
  const error = document.createElement("p");
  error.dataset.role = "error";
  error.className = "ptaf-exclusions-error";
  const empty = document.createElement("p");
  empty.dataset.role = "empty";
  empty.className = "ptaf-exclusions-empty";
  const scroll = document.createElement("div");
  scroll.className = "ptaf-exclusions-scroll";
  const table = document.createElement("table");
  table.className = "ptaf-exclusions-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["№", "Название правила", "Место", "Что внесено"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  table.append(head, body);
  scroll.append(table);
  root.append(bar, status, note, error, empty, scroll);
  return root;
}

function showRulesList() {
  document.querySelectorAll("[data-ptaf-exclusions-hidden]").forEach((node) => {
    const previous = node.dataset.ptafExclusionsHidden;
    node.style.display = previous === "unset" ? "" : previous;
    delete node.dataset.ptafExclusionsHidden;
  });
}

function hideRulesList(shell) {
  const grouped = shell && shell.querySelector(":scope > .grouped");
  if (!grouped) {
    return;
  }
  if (!grouped.dataset.ptafExclusionsHidden) {
    grouped.dataset.ptafExclusionsHidden = grouped.style.display || "unset";
  }
  grouped.style.display = "none";
}

function closeExclusionsPanel() {
  const panel = document.getElementById(EXCLUSIONS_PANEL_ID);
  const hidden = document.querySelector("[data-ptaf-exclusions-hidden]");
  if (!exclusionsState.open && !panel && !hidden) {
    return;
  }
  exclusionsState.open = false;
  exclusionsState.token += 1;
  showRulesList();
  if (panel) {
    panel.remove();
  }
  markExclusionsButton();
}

function ensureExclusionsPanel(shell) {
  let host = document.getElementById(EXCLUSIONS_PANEL_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = EXCLUSIONS_PANEL_ID;
    host.style.cssText = "display:flex;flex:1 1 auto;min-height:0;overflow:hidden;";
    const theme = typeof attachUi === "function" ? attachUi(host) : null;
    if (!theme) {
      return null;
    }
    theme.append(buildExclusionsPanel());
  }
  const top = shell.querySelector(":scope > .top-panel");
  const created = !host.isConnected;
  if (top && host.previousElementSibling !== top) {
    top.after(host);
  }
  hideRulesList(shell);
  if (created) {
    paintExclusions();
  }
  return host;
}

function ensureExclusionsButton(top) {
  let host = document.getElementById(EXCLUSIONS_BUTTON_ID);
  if (host && host.parentElement !== top) {
    top.prepend(host);
  }
  if (host) {
    markExclusionsButton();
    return host;
  }
  host = document.createElement("div");
  host.id = EXCLUSIONS_BUTTON_ID;
  host.style.cssText = "all:initial;display:inline-flex;flex:0 0 auto;margin-right:8px;vertical-align:middle;";
  const theme = typeof attachUi === "function" ? attachUi(host) : null;
  if (!theme) {
    return null;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-exclusions-tab";
  button.textContent = "Исключения";
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const page = parseExclusionsPage();
    if (!page) {
      return;
    }
    if (exclusionsState.open) {
      closeExclusionsPanel();
      return;
    }
    exclusionsState.open = true;
    const currentTop = host.parentElement;
    const shell = currentTop && currentTop.parentElement;
    if (shell) {
      ensureExclusionsPanel(shell);
    }
    markExclusionsButton();
    if (exclusionsState.loadedKey !== exclusionsPageKey(page)) {
      startExclusionsLoad(page);
    } else {
      exclusionsState.pageKey = exclusionsPageKey(page);
      paintExclusions();
    }
  });
  theme.append(button);
  top.prepend(host);
  markExclusionsButton();
  return host;
}

function syncExclusions() {
  if (exclusionsStopped || !exclusionsAlive()) {
    stopExclusions();
    return;
  }
  if (!exclusionsEnabled) {
    closeExclusionsPanel();
    const hidden = document.getElementById(EXCLUSIONS_BUTTON_ID);
    if (hidden) {
      hidden.remove();
    }
    return;
  }
  const page = parseExclusionsPage();
  const actions = document.querySelector(".top-panel > .rules-actions");
  const top = actions && actions.closest(".top-panel");
  if (!page || !top || !actions) {
    closeExclusionsPanel();
    const button = document.getElementById(EXCLUSIONS_BUTTON_ID);
    if (button) {
      button.remove();
    }
    return;
  }
  ensureExclusionsButton(top);
  if (!exclusionsState.open) {
    return;
  }
  const shell = top.parentElement;
  if (!shell) {
    closeExclusionsPanel();
    return;
  }
  ensureExclusionsPanel(shell);
  const key = exclusionsPageKey(page);
  if (exclusionsState.pageKey !== key) {
    startExclusionsLoad(page);
  }
}

function scheduleExclusions() {
  if (exclusionsStopped || exclusionsFrame) {
    return;
  }
  exclusionsFrame = requestAnimationFrame(() => {
    exclusionsFrame = 0;
    syncExclusions();
  });
}

function stopExclusions() {
  if (exclusionsStopped) {
    return;
  }
  exclusionsStopped = true;
  exclusionsState.token += 1;
  if (exclusionsFrame) {
    cancelAnimationFrame(exclusionsFrame);
    exclusionsFrame = 0;
  }
  if (exclusionsObserver) {
    exclusionsObserver.disconnect();
    exclusionsObserver = null;
  }
  document.removeEventListener("keydown", onExclusionsKey, true);
  window.removeEventListener("popstate", scheduleExclusions);
  closeExclusionsPanel();
  const button = document.getElementById(EXCLUSIONS_BUTTON_ID);
  if (button) {
    button.remove();
  }
}

function onExclusionsKey(event) {
  if (event.key === "Escape" && exclusionsState.open) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeExclusionsPanel();
  }
}

function hookExclusionsHistory() {
  if (hookExclusionsHistory.installed) {
    return;
  }
  hookExclusionsHistory.installed = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedExclusionsHistory() {
      const result = original.apply(this, arguments);
      scheduleExclusions();
      return result;
    };
  }
  window.addEventListener("popstate", scheduleExclusions);
}

function watchExclusionsDom() {
  exclusionsObserver = new MutationObserver(() => scheduleExclusions());
  exclusionsObserver.observe(document.body, { childList: true, subtree: true });
}

function applyExclusionsSetting(enabled) {
  exclusionsEnabled = Boolean(enabled);
  scheduleExclusions();
}

function readExclusionsSetting() {
  if (typeof pluginSetting !== "function") {
    applyExclusionsSetting(true);
    return;
  }
  pluginSetting("exclusionsSummary", true, applyExclusionsSetting);
}

hookExclusionsHistory();
document.addEventListener("keydown", onExclusionsKey, true);
watchExclusionsDom();
readExclusionsSetting();
