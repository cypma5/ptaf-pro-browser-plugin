const COMPARE_BUTTON_ID = "ptaf-compare-open";
const COMPARE_DIALOG_ID = "ptaf-compare-dialog";
const COMPARE_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COMPARE_RULE_PATH = new RegExp(
  `/conf-scheme/(application_policy|policy|user_policy)/(${COMPARE_UUID})/rules/rule/(${COMPARE_UUID})`,
  "i"
);

const compareState = {
  token: 0,
  writing: false,
  pending: [],
  policies: [],
  linkedPolicies: [],
  policyId: "",
  templateId: "",
  policyName: "",
  templateName: "",
  policyPath: "",
  templatePath: "",
  policyVars: {},
  templateVars: {},
  policyExclusions: [],
  templateExclusions: [],
  policySkip: [],
  templateSkip: [],
  policyPlace: null,
  templatePlace: null,
  policySkipPlace: null,
  templateSkipPlace: null,
  policyLists: [],
  templateLists: [],
  ruleSets: [],
  vendorIds: [],
  mode: "policy",
  overridden: false,
  policyChoices: [],
  appPolicyPath: "",
  appPolicyFor: "",
  appPolicyVars: {},
  ruleKey: "",
  canRestore: false,
  parts: [],
  rows: [],
  note: "",
  error: "",
};

let compareFrame = 0;
let compareObserver = null;
let compareThemeObserver = null;
let compareStopped = false;
let compareExperimental = false;
let comparePageOverride = null;
let compareHost = null;

function compareDialogHost() {
  if (compareHost && compareHost.isConnected) {
    return compareHost;
  }
  return document.getElementById(COMPARE_DIALOG_ID);
}

function parseComparePage() {
  if (comparePageOverride) {
    return comparePageOverride;
  }
  const match = location.pathname.match(COMPARE_RULE_PATH);
  if (!match) {
    return null;
  }
  return {
    kind: match[1].toLowerCase() === "user_policy" ? "template" : "policy",
    entityId: match[2],
    ruleRef: match[3],
  };
}

function compareClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function compareStable(value) {
  return JSON.stringify(compareSort(value));
}

function compareSort(value) {
  if (Array.isArray(value)) {
    return value.map(compareSort);
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = compareSort(value[key]);
    }
    return sorted;
  }
  return value;
}

function compareObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

const EXCLUSION_KEYS = ["exclusions", "exceptions", "skip_conditions", "preconditions", "rule_exclusions"];

const PARAM_LABELS = {
  client_ip: "IP-адрес",
  ip: "IP-адрес",
  client_country: "Страна",
  country: "Страна",
  client_region: "Регион",
  region: "Регион",
  client_city: "Город",
  city: "Город",
  request_header: "Заголовок",
  header: "Заголовок",
  request_get: "GET-параметр",
  get: "GET-параметр",
  request_post: "POST-параметр",
  post: "POST-параметр",
  request_cookie: "Cookie",
  cookie: "Cookie",
  request_path: "Путь",
  path: "Путь",
  request_uri: "URI",
  uri: "URI",
  request_method: "Метод",
  method: "Метод",
  request_headers: "Заголовок",
  request_get: "GET-параметр",
  request_post: "POST-параметр",
  request_cookies: "Cookie",
  websocket: "Данные WebSocket клиента",
  websocket_client: "Данные WebSocket клиента",
  websocket_upstream: "Данные WebSocket клиента",
};

const CHECK_PART_LABELS = {
  REQUEST_GET: "GET-параметры",
  REQUEST_POST: "POST-параметры",
  REQUEST_HEADERS: "Заголовки",
  REQUEST_COOKIES: "Cookie",
  REQUEST_PATH: "Путь",
  REQUEST_URI: "URI",
  REQUEST_BODY: "Тело запроса",
  REQUEST_JSON: "JSON",
  REQUEST_XML: "XML",
  REQUEST_FILES: "Файлы",
  WEBSOCKET_UPSTREAM: "Данные WebSocket от сервера",
  WEBSOCKET_DOWNSTREAM: "Данные WebSocket от клиента",
};

const SCHEMA_TITLE_LABELS = {
  list_of_flags_as_dbms_dialect_types_parameters: "Типы диалектов СУБД",
  list_of_flags_as_quote_types_parameters: "Типы кавычек",
};

const OPERATOR_LABELS = {
  eq: "равно",
  equal: "равно",
  equals: "равно",
  is: "равно",
  ne: "не равно",
  neq: "не равно",
  not_equal: "не равно",
  is_not: "не равно",
  regexp: "регулярное выражение",
  regex_hs: "регулярное выражение",
  contains: "содержит",
  icontains: "содержит",
  regex: "регулярное выражение",
  match: "регулярное выражение",
  matches: "регулярное выражение",
  exists: "существует",
  empty: "пусто",
  in: "в списке",
};

function freshId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (error) {
    // Страница без secure context не отдаёт randomUUID.
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function stripIds(value) {
  if (Array.isArray(value)) {
    return value.map(stripIds);
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      if (key === "id") {
        continue;
      }
      next[key] = stripIds(value[key]);
    }
    return next;
  }
  return value;
}

function exclusionSignature(value) {
  return compareStable(stripIds(value));
}

function renewIds(value) {
  if (Array.isArray(value)) {
    return value.map(renewIds);
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      next[key] = key === "id" && typeof value[key] === "string" ? freshId() : renewIds(value[key]);
    }
    return next;
  }
  return value;
}

function looksLikeCondition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return ["operator", "op", "source", "parameter", "field", "value"].filter((key) => keys.includes(key)).length >= 2;
}

function isSkipPartItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.source !== "string") {
    return false;
  }
  if (typeof item.skip === "string") {
    return true;
  }
  const conditions = item.conditions;
  return Boolean(conditions && typeof conditions === "object" && !Array.isArray(conditions) && ("if_key" in conditions || "if_value" in conditions));
}

function isExclusionItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || isSkipPartItem(item)) {
    return false;
  }
  if (Array.isArray(item.group) || Array.isArray(item.conditions) || Array.isArray(item.condition_groups) || Array.isArray(item.conditionGroups)) {
    return true;
  }
  if (typeof item.source === "string") {
    return true;
  }
  return looksLikeCondition(item);
}

function itemKind(item) {
  if (isSkipPartItem(item)) {
    return "skip";
  }
  if (isExclusionItem(item)) {
    return "exclusion";
  }
  return "";
}

function isExclusionList(value) {
  if (!Array.isArray(value) || !value.length) {
    return false;
  }
  return value.every((item) => isExclusionItem(item));
}

function decodeExclusionList(value) {
  if (Array.isArray(value)) {
    return { items: value, encoded: false };
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return { items: parsed, encoded: true };
      }
    } catch (error) {
      return null;
    }
  }
  return null;
}

function namedExclusionList(variables, key) {
  const value = variables[key];
  if (EXCLUSION_KEYS.includes(key)) {
    const decoded = decodeExclusionList(value);
    if (decoded) {
      return { container: "variables", key, nested: "", items: decoded.items, encoded: decoded.encoded, found: true };
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const nested of EXCLUSION_KEYS) {
      const decoded = decodeExclusionList(value[nested]);
      if (decoded) {
        return { container: "variables", key, nested, items: decoded.items, encoded: decoded.encoded, found: true };
      }
    }
  }
  return null;
}

function collectListPlaces(details) {
  const places = [];
  const push = (place) => {
    if (!place || !Array.isArray(place.items) || !place.items.some((item) => itemKind(item))) {
      return;
    }
    places.push(place);
  };
  if (Array.isArray(details && details.exclusions)) {
    push({ container: "root", key: "exclusions", nested: "", items: details.exclusions, encoded: false, found: true });
  }
  const variables = compareObject(details && details.variables);
  for (const key of Object.keys(variables)) {
    if (key === "settings") {
      continue;
    }
    const value = variables[key];
    const decoded = decodeExclusionList(value);
    if (decoded) {
      push({ container: "variables", key, nested: "", items: decoded.items, encoded: decoded.encoded, found: true });
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of Object.keys(value)) {
        const inner = decodeExclusionList(value[nested]);
        if (inner) {
          push({ container: "variables", key, nested, items: inner.items, encoded: inner.encoded, found: true });
        }
      }
    }
  }
  return places;
}

function itemsByKind(places, kind) {
  const items = [];
  for (const place of places) {
    for (const item of exclusionItems(place)) {
      if (itemKind(item) === kind) {
        items.push(item);
      }
    }
  }
  return items;
}

function placeByKind(places, kind) {
  return places.find((place) => place.items.some((item) => itemKind(item) === kind)) || null;
}

function readExclusionPlace(details) {
  const variables = compareObject(details && details.variables);
  const candidates = [];
  if (Array.isArray(details && details.exclusions)) {
    candidates.push({ container: "root", key: "exclusions", nested: "", items: details.exclusions, encoded: false, found: true });
  }
  for (const key of EXCLUSION_KEYS) {
    const named = namedExclusionList(variables, key);
    if (named) {
      candidates.push(named);
    }
  }
  for (const key of Object.keys(variables)) {
    if (key === "settings") {
      continue;
    }
    if (isExclusionList(variables[key])) {
      candidates.push({ container: "variables", key, nested: "", items: variables[key], encoded: false, found: true });
    }
    const named = namedExclusionList(variables, key);
    if (named) {
      candidates.push(named);
    }
  }
  const filled = candidates.find((place) => place.items.length);
  if (filled) {
    return filled;
  }
  if (candidates.length) {
    return candidates[0];
  }
  return { container: "variables", key: "exclusions", nested: "", items: [], encoded: false, found: false };
}

function exclusionItems(place) {
  return place && Array.isArray(place.items) ? place.items : [];
}

function missingExclusions(sourceItems, targetItems) {
  const seen = new Set(targetItems.map(exclusionSignature));
  return sourceItems.filter((item) => !seen.has(exclusionSignature(item)));
}

function appendExclusions(currentItems, additions) {
  const next = currentItems.map((item) => compareClone(item));
  const seen = new Set(next.map(exclusionSignature));
  for (const item of additions) {
    const signature = exclusionSignature(item);
    if (seen.has(signature)) {
      continue;
    }
    next.push(renewIds(compareClone(item)));
    seen.add(signature);
  }
  return next;
}

function setVariablePath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function deleteVariablePath(target, path) {
  const keys = path.split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      return;
    }
    cursor = cursor[key];
  }
  if (cursor && Object.prototype.hasOwnProperty.call(cursor, keys[keys.length - 1])) {
    delete cursor[keys[keys.length - 1]];
  }
}

function writeParamsBody(baseVars, fields, valueOf, presentOf) {
  const next = compareClone(compareObject(baseVars));
  const body = {};
  let variablesChanged = false;
  for (const field of fields) {
    if (!field || !field.path) {
      continue;
    }
    if (!presentOf(field)) {
      if (field.scope === "variables") {
        deleteVariablePath(next, field.path);
        variablesChanged = true;
      }
      continue;
    }
    const value = compareClone(valueOf(field));
    if (field.scope === "enabled") {
      body.enabled = Boolean(value);
      continue;
    }
    if (field.scope === "actions") {
      body.actions = Array.isArray(value) ? value : [];
      continue;
    }
    if (field.scope !== "variables") {
      continue;
    }
    setVariablePath(next, field.path, value);
    variablesChanged = true;
  }
  if (variablesChanged) {
    body.variables = next;
  }
  return body;
}

function paramTransferTarget(direction) {
  if (direction === "app") {
    return {
      path: compareState.appPolicyPath,
      vars: compareState.appPolicyVars,
      valueOf: (field) => field.policyValue,
      present: (field) => field.policyPresent,
    };
  }
  if (compareState.mode === "vendor") {
    if (direction === "policy") {
      return null;
    }
    return {
      path: compareState.policyPath,
      vars: compareState.policyVars,
      valueOf: (field) => field.templateValue,
      present: (field) => field.templatePresent,
    };
  }
  if (direction === "policy") {
    return {
      path: compareState.policyPath,
      vars: compareState.policyVars,
      valueOf: (field) => field.templateValue,
      present: (field) => field.templatePresent,
    };
  }
  return {
    path: compareState.templatePath,
    vars: compareState.templateVars,
    valueOf: (field) => field.policyValue,
    present: (field) => field.policyPresent,
  };
}

function writesOntoPolicyState(direction) {
  return compareState.mode === "vendor" || direction === "policy";
}

function writeQueuedDirection(direction, entries) {
  const target = paramTransferTarget(direction);
  if (!target || !target.path) {
    throw new Error("Набор системных правил не изменяется.");
  }
  const fields = entries
    .filter((entry) => entry.kind === "copy-params")
    .flatMap((entry) => entry.fields || []);
  const body = writeParamsBody(target.vars, fields, target.valueOf, target.present);
  const vars = body.variables ? body.variables : compareClone(compareObject(target.vars));
  const cache = new Map();
  let variablesChanged = Boolean(body.variables);
  const toPolicyState = writesOntoPolicyState(direction);
  for (const bucket of ["skip", "exclusion"]) {
    const additions = entries
      .filter((entry) => (entry.kind === "copy" || entry.kind === "copy-all") && (entry.bucket || "exclusion") === bucket)
      .flatMap((entry) => entry.items || []);
    if (!additions.length) {
      continue;
    }
    const place = targetExclusionPlace(toPolicyState, bucket);
    const changed = applyPlaceAdditions(vars, body, place, additions, cache);
    variablesChanged = variablesChanged || changed;
  }
  if (variablesChanged) {
    body.variables = vars;
  }
  if (!Object.keys(body).length) {
    throw new Error("Нечего записывать.");
  }
  return api(target.path, { method: "PATCH", body });
}

function applyPlaceAdditions(vars, body, place, additions, cache) {
  const id = `${place.container}:${place.key || ""}:${place.nested || ""}`;
  const base = cache.has(id) ? cache.get(id) : exclusionItems(place);
  const items = appendExclusions(base, additions);
  cache.set(id, items);
  const stored = place.encoded ? JSON.stringify(items) : items;
  if (place.container === "root") {
    body.exclusions = stored;
    return false;
  }
  if (place.nested) {
    const parent = compareClone(compareObject(vars[place.key]));
    parent[place.nested] = stored;
    vars[place.key] = parent;
  } else {
    vars[place.key] = stored;
  }
  return true;
}

function writeExclusionBody(targetVars, place, additions) {
  const items = appendExclusions(exclusionItems(place), additions);
  const stored = place.encoded ? JSON.stringify(items) : items;
  if (place.container === "root") {
    return { exclusions: stored };
  }
  const next = compareClone(compareObject(targetVars));
  if (place.nested) {
    const parent = compareClone(compareObject(next[place.key]));
    parent[place.nested] = stored;
    next[place.key] = parent;
  } else {
    next[place.key] = stored;
  }
  return { variables: next };
}

function targetExclusionPlace(targetIsPolicy, bucket) {
  const skip = bucket === "skip";
  const own = skip
    ? (targetIsPolicy ? compareState.policySkipPlace : compareState.templateSkipPlace)
    : (targetIsPolicy ? compareState.policyPlace : compareState.templatePlace);
  const other = skip
    ? (targetIsPolicy ? compareState.templateSkipPlace : compareState.policySkipPlace)
    : (targetIsPolicy ? compareState.templatePlace : compareState.policyPlace);
  if (own && own.found) {
    return own;
  }
  if (other && other.found) {
    if (other.container === "root") {
      return { container: other.container, key: other.key, nested: other.nested, items: [], encoded: false, found: true };
    }
    const vars = targetIsPolicy ? compareState.policyVars : compareState.templateVars;
    const current = other.nested ? compareObject(vars[other.key])[other.nested] : vars[other.key];
    const decoded = decodeExclusionList(current);
    return {
      container: other.container,
      key: other.key,
      nested: other.nested,
      items: decoded ? decoded.items : [],
      encoded: decoded ? decoded.encoded : other.encoded,
      found: true,
    };
  }
  return own || { container: "variables", key: skip ? "skip_conditions" : "exclusions", nested: "", items: [], encoded: false, found: false };
}

function systemTemplateIds(template) {
  if (!template || typeof template !== "object") {
    return [];
  }
  if (Array.isArray(template.templates)) {
    return template.templates.filter(Boolean);
  }
  for (const key of ["template_id", "vendor_template_id", "system_template_id", "parent_template_id"]) {
    if (template[key]) {
      return [template[key]];
    }
  }
  return [];
}

function ruleSnapshot(details) {
  return {
    enabled: Boolean(details && details.enabled),
    actions: Array.isArray(details && details.actions) ? details.actions.slice().sort() : [],
    variables: compareObject(details && details.variables),
    exclusions: Array.isArray(details && details.exclusions) ? details.exclusions : [],
  };
}

function rulesMatch(policyDetails, templateDetails) {
  return compareStable(stripIds(ruleSnapshot(policyDetails))) === compareStable(stripIds(ruleSnapshot(templateDetails)));
}

function labelOf(map, value) {
  const token = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return map[token] || map[token.replace(/_/g, " ")] || "";
}

function localizedParamTitle(path, schemaTitle) {
  const translatedSchema = schemaTitle ? labelOf(SCHEMA_TITLE_LABELS, schemaTitle) : "";
  if (translatedSchema) {
    return translatedSchema;
  }
  const leaf = String(path || "").split(".").pop();
  if (!schemaTitle || schemaTitle === path) {
    return CHECK_PART_LABELS[leaf] || path;
  }
  return schemaTitle;
}

function conditionText(condition) {
  if (!condition || typeof condition !== "object") {
    return String(condition);
  }
  const source = condition.source || condition.parameter || condition.field || condition.type || "";
  const name = condition.name || condition.header || condition.param || "";
  const operator = condition.operator || condition.op || condition.condition || "";
  const rawValue = condition.value != null ? condition.value : condition.values;
  const label = labelOf(PARAM_LABELS, source) || source || "Условие";
  const named = name ? `${label} «${name}»` : label;
  const operatorLabel = labelOf(OPERATOR_LABELS, operator) || operator;
  const shown = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
  if (shown == null || shown === "") {
    return operatorLabel ? `${named}: ${operatorLabel}` : named;
  }
  return operatorLabel ? `${named}: ${operatorLabel} ${shown}` : `${named}: ${shown}`;
}

function preconditionText(entry) {
  if (!entry || typeof entry !== "object") {
    return String(entry);
  }
  const nested = entry.condition && typeof entry.condition === "object" ? entry.condition : {};
  return conditionText({
    source: entry.source,
    name: entry.name,
    operator: nested.operator || entry.operator,
    value: nested.value != null ? nested.value : entry.value,
  });
}

function skipPartView(item) {
  if (!isSkipPartItem(item)) {
    return null;
  }
  const places = {
    REQUEST_GET: "В GET-параметрах",
    REQUEST_POST: "В POST-параметрах",
    REQUEST_HEADERS: "В заголовке",
    REQUEST_COOKIES: "В куки",
    REQUEST_PATH: "В пути",
    REQUEST_URI: "В URI",
    REQUEST_BODY: "В теле запроса",
    REQUEST_JSON: "В JSON",
    REQUEST_XML: "В XML",
    REQUEST_FILES: "В файлах",
  };
  const what = {
    key: "ключ",
    value: "значение",
    all: "ключ и значение",
    key_and_value: "ключ и значение",
  }[String(item.skip || "value").toLowerCase()] || "значение";
  const conditions = item.conditions && typeof item.conditions === "object" && !Array.isArray(item.conditions) ? item.conditions : {};
  const key = conditions.if_key != null ? String(conditions.if_key) : (conditions.key != null ? String(conditions.key) : "");
  const value = conditions.if_value != null ? String(conditions.if_value) : (conditions.value != null ? String(conditions.value) : "");
  return {
    title: `${places[item.source] || `В ${item.source}`} пропускать ${what}, если`,
    key,
    value,
  };
}

function exclusionLines(item) {
  if (!item || typeof item !== "object") {
    return [String(item)];
  }
  if (Array.isArray(item.group) && item.group.length) {
    return [item.group.map(preconditionText).filter(Boolean).join(" И ")];
  }
  const groups = item.conditions || item.condition || item.condition_groups || item.conditionGroups || item.groups || item.parameters;
  if (Array.isArray(groups) && groups.length && Array.isArray(groups[0])) {
    return groups.map((group) => group.map(conditionText).filter(Boolean).join(" И "));
  }
  if (Array.isArray(groups) && groups.length && groups[0] && typeof groups[0] === "object" && Array.isArray(groups[0].conditions)) {
    return groups.map((group) => group.conditions.map(conditionText).filter(Boolean).join(" И "));
  }
  if (Array.isArray(groups) && groups.length && looksLikeCondition(groups[0])) {
    return [groups.map(conditionText).filter(Boolean).join(" И ")];
  }
  if (looksLikeCondition(item)) {
    return [conditionText(item)];
  }
  const text = JSON.stringify(stripIds(item), null, 2);
  return [text || "Исключение"];
}

const RULE_META_KEYS = new Set([
  "id",
  "name",
  "rule_id",
  "rule_group_id",
  "policy_template_id",
  "policy_template_type",
  "accuracy",
  "phase",
  "event",
  "description",
  "is_system",
  "has_overrides",
  "revision",
  "variables_schema",
  "upsert_time",
  "variables",
  "actions",
  "enabled",
  "exclusions",
  "configuration",
  "user",
  "policy_id",
  "template_id",
]);

function parseRuleSchema(details) {
  const raw = details && details.variables_schema;
  if (!raw) {
    return {};
  }
  if (typeof raw === "object") {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function schemaText(property) {
  if (!property || typeof property !== "object") {
    return "";
  }
  if (typeof property.title === "string" && property.title) {
    return property.title;
  }
  if (typeof property.description === "string" && property.description) {
    return property.description;
  }
  return "";
}

function schemaTitles(details) {
  const titles = {};
  const properties = parseRuleSchema(details).properties;
  if (!properties || typeof properties !== "object") {
    return titles;
  }
  for (const key of Object.keys(properties)) {
    const property = properties[key];
    if (!property || typeof property !== "object") {
      continue;
    }
    const title = schemaText(property);
    if (title) {
      titles[key] = title;
    }
    if (property.properties && typeof property.properties === "object") {
      for (const child of Object.keys(property.properties)) {
        const nestedTitle = schemaText(property.properties[child]);
        if (nestedTitle) {
          titles[`${key}.${child}`] = nestedTitle;
        }
      }
    }
  }
  return titles;
}

function partKind(key, title) {
  const text = `${key} ${title || ""}`.toLowerCase();
  if (/не\s*проверя|пропуск|skip|ignore|bypass|unchecked/.test(text)) {
    return "skip";
  }
  if (/проверя|check|inspect|scan|analy[sz]/.test(text)) {
    return "check";
  }
  return "other";
}

function ruleEnabled(details) {
  if (details && typeof details.enabled === "boolean") {
    return details.enabled;
  }
  const configured = details && details.configuration;
  if (configured && typeof configured.enabled === "boolean") {
    return configured.enabled;
  }
  return Boolean(details && details.enabled);
}

function actionIds(details) {
  const direct = details && details.actions;
  const configured = details && details.configuration && details.configuration.actions;
  const raw = Array.isArray(direct) ? direct : configured;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => {
    if (typeof item === "string") {
      return item;
    }
    return item && (item.id || item.name) ? String(item.id || item.name) : "";
  }).filter(Boolean);
}

function enabledLabel(value) {
  return value ? "Включено" : "Выключено";
}

function formatAuthSetting(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const condition = item.condition && typeof item.condition === "object" ? item.condition : {};
  const lines = [];
  if (item.auth_type) {
    lines.push(`Тип аутентификации: ${item.auth_type}`);
  }
  const labels = {
    endpoint: "Конечная точка",
    method: "Метод",
    login_field: "Поле логина",
    body_contains: "Тело содержит",
    failure_codes: "Коды ошибки",
    success_codes: "Коды успеха",
    session_lifetime: "Время сессии, с",
    sessions_list: "Список сессий",
    body_status_field: "Поле статуса",
    body_status_value: "Значение статуса",
  };
  for (const key of Object.keys(labels)) {
    if (condition[key] == null || condition[key] === "") {
      continue;
    }
    const shown = Array.isArray(condition[key]) ? condition[key].join(", ") : condition[key];
    lines.push(`${labels[key]}: ${shown}`);
  }
  return lines.join("\n");
}

function formatPartValue(value) {
  if (value === undefined || value === null || value === "") {
    return "нет";
  }
  if (typeof value === "boolean") {
    return value ? "да" : "нет";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return labelOf(PARAM_LABELS, value) || value;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "нет";
    }
    if (value.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => formatPartValue(item)).join(", ");
    }
    if (value.some((item) => item && typeof item === "object" && (item.auth_type || (item.condition && item.condition.endpoint)))) {
      return value.map(formatAuthSetting).filter(Boolean).join("\n\n") || "нет";
    }
    return JSON.stringify(stripIds(value), null, 2);
  }
  return JSON.stringify(stripIds(value), null, 2);
}

function isParamGroup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (looksLikeCondition(value) || "conditions" in value || "groups" in value || "condition_groups" in value) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => {
    const child = value[key];
    if (child == null || ["string", "number", "boolean"].includes(typeof child)) {
      return true;
    }
    return Array.isArray(child) && child.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item));
  });
}

function hidesSkippedList(value, path, skip) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const key of Object.keys(value)) {
    const childPath = `${path}.${key}`;
    if (skip.has(childPath) || hidesSkippedList(value[key], childPath, skip)) {
      return true;
    }
  }
  return false;
}

function collectLeaves(source, prefix, skip) {
  const leaves = [];
  for (const key of Object.keys(compareObject(source))) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (skip.has(path)) {
      continue;
    }
    const value = source[key];
    if (isParamGroup(value) || hidesSkippedList(value, path, skip)) {
      leaves.push(...collectLeaves(value, path, skip));
      continue;
    }
    leaves.push({ path, value });
  }
  return leaves;
}

function leafIndex(leaves) {
  const index = {};
  for (const leaf of leaves) {
    index[leaf.path] = leaf.value;
  }
  return index;
}

function exclusionSkipKeys() {
  const skip = new Set();
  const places = (compareState.templateLists || []).concat(compareState.policyLists || []);
  for (const place of places) {
    if (!place || !place.found) {
      continue;
    }
    if (place.container === "root") {
      skip.add("exclusions");
    } else if (place.nested) {
      skip.add(`${place.key}.${place.nested}`);
    } else {
      skip.add(place.key);
    }
  }
  return skip;
}

function ruleVariables(details) {
  const configured = compareObject(details && details.configuration && details.configuration.parameters);
  const direct = compareObject(details && details.variables);
  return Object.assign({}, configured, direct);
}

function valuesEqual(left, right) {
  return compareStable(stripIds(left)) === compareStable(stripIds(right));
}

function partSection(id, title, fields) {
  if (!fields.length) {
    return { id, title, status: "absent", fields: [] };
  }
  return { id, title, status: fields.every((field) => field.same) ? "same" : "diff", fields };
}

function buildRuleParts(policyDetails, templateDetails, actionNames) {
  const titles = Object.assign(schemaTitles(templateDetails), schemaTitles(policyDetails));
  const skip = exclusionSkipKeys();
  const policyLeaves = leafIndex(collectLeaves(ruleVariables(policyDetails), "", skip));
  const templateLeaves = leafIndex(collectLeaves(ruleVariables(templateDetails), "", skip));
  const buckets = { skip: [], check: [], other: [] };
  const paths = Object.keys(policyLeaves).concat(Object.keys(templateLeaves));
  for (const path of Array.from(new Set(paths)).sort()) {
    let title = localizedParamTitle(path, titles[path]);
    if (path === "settings" || path.endsWith(".settings")) {
      title = "Параметры правила";
    }
    const kind = partKind(path, title);
    const templatePresent = Object.prototype.hasOwnProperty.call(templateLeaves, path);
    const policyPresent = Object.prototype.hasOwnProperty.call(policyLeaves, path);
    buckets[kind].push({
      path,
      scope: "variables",
      title,
      template: formatPartValue(templatePresent ? templateLeaves[path] : undefined),
      policy: formatPartValue(policyPresent ? policyLeaves[path] : undefined),
      templateValue: templatePresent ? templateLeaves[path] : undefined,
      policyValue: policyPresent ? policyLeaves[path] : undefined,
      templatePresent,
      policyPresent,
      same: templatePresent && policyPresent && valuesEqual(templateLeaves[path], policyLeaves[path]),
    });
  }
  const policyObject = policyDetails && typeof policyDetails === "object" ? policyDetails : {};
  const templateObject = templateDetails && typeof templateDetails === "object" ? templateDetails : {};
  for (const key of Array.from(new Set(Object.keys(policyObject).concat(Object.keys(templateObject)))).sort()) {
    if (RULE_META_KEYS.has(key)) {
      continue;
    }
    if (valuesEqual(policyObject[key], templateObject[key])) {
      continue;
    }
    const templatePresent = Object.prototype.hasOwnProperty.call(templateObject, key);
    const policyPresent = Object.prototype.hasOwnProperty.call(policyObject, key);
    buckets.other.push({
      path: key,
      scope: "rule",
      title: key,
      template: formatPartValue(templatePresent ? templateObject[key] : undefined),
      policy: formatPartValue(policyPresent ? policyObject[key] : undefined),
      templateValue: templatePresent ? templateObject[key] : undefined,
      policyValue: policyPresent ? policyObject[key] : undefined,
      templatePresent,
      policyPresent,
      same: false,
    });
  }
  const policyActions = actionIds(policyDetails).slice().sort();
  const templateActions = actionIds(templateDetails).slice().sort();
  const names = actionNames || {};
  const actionNamesOf = (ids) => ids.map((id) => names[id] || id).sort((left, right) => left.localeCompare(right, "ru"));
  const templateEnabled = ruleEnabled(templateDetails);
  const policyEnabled = ruleEnabled(policyDetails);
  const actionsSame = compareStable(policyActions) === compareStable(templateActions);
  return [
    {
      id: "enabled",
      title: "Состояние",
      status: policyEnabled === templateEnabled ? "same" : "diff",
      fields: [{
        path: "enabled",
        scope: "enabled",
        title: "Состояние",
        templateValue: templateEnabled,
        policyValue: policyEnabled,
        templatePresent: true,
        policyPresent: true,
        same: policyEnabled === templateEnabled,
      }],
    },
    {
      id: "actions",
      title: "Назначенные действия",
      status: actionsSame ? "same" : "diff",
      fields: [{
        path: "actions",
        scope: "actions",
        title: "Назначенные действия",
        templateValue: templateActions,
        policyValue: policyActions,
        templateNames: actionNamesOf(templateActions),
        policyNames: actionNamesOf(policyActions),
        templatePresent: true,
        policyPresent: true,
        same: actionsSame,
      }],
    },
    partSection("skip", "Пропускаемые части", buckets.skip),
    partSection("check", "Проверяемые части", buckets.check),
    partSection("other", "Другие параметры", buckets.other),
  ];
}

async function loadActionNames() {
  try {
    const names = {};
    for (const item of itemsOf(await api("/config/actions"))) {
      if (item && item.id) {
        names[item.id] = item.name || item.id;
      }
    }
    return names;
  } catch (error) {
    return {};
  }
}

function compareButtonLabel(page) {
  return page && page.kind === "template" ? "Сравнить с политикой" : "Сравнить с шаблоном";
}

function compareButtonSlot() {
  const alert = document.querySelector("ptaf-reset-rule-alert");
  if (alert && alert.parentElement) {
    return { parent: alert.parentElement, before: alert.nextSibling };
  }
  const card = document.querySelector("ptaf-card > .content");
  if (card) {
    return { parent: card, before: card.firstChild };
  }
  return null;
}

function compareButtonInSlot(button, slot) {
  return Boolean(button && slot && button.parentElement === slot.parent && (slot.before === button || button.nextSibling === slot.before));
}

function placeCompareButton() {
  const page = parseComparePage();
  const current = document.getElementById(COMPARE_BUTTON_ID);
  if (!compareExperimental || !page) {
    if (current) {
      current.remove();
    }
    return;
  }
  const slot = compareButtonSlot();
  if (!slot) {
    if (current) {
      current.remove();
    }
    return;
  }
  if (compareButtonInSlot(current, slot)) {
    const label = current.shadowRoot && current.shadowRoot.querySelector(".ptaf-compare-trigger-label");
    if (label) {
      label.textContent = compareButtonLabel(page);
    }
    return;
  }
  if (current) {
    current.remove();
  }
  const host = document.createElement("div");
  host.id = COMPARE_BUTTON_ID;
  host.style.cssText = "all:initial;display:block;margin:12px 0;";
  const theme = attachUi(host);
  if (!theme) {
    return;
  }
  theme.dataset.theme = pageTheme();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-compare-trigger";
  const label = document.createElement("span");
  label.className = "ptaf-compare-trigger-label";
  label.textContent = compareButtonLabel(page);
  const mark = document.createElement("span");
  mark.className = "ptaf-compare-mark";
  mark.textContent = "эксперимент";
  button.append(label, mark);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCompareDialog();
  });
  theme.append(button);
  const before = slot.before && slot.before.parentElement === slot.parent ? slot.before : null;
  slot.parent.insertBefore(host, before);
}

function closeCompareDialog() {
  if (compareState.writing) {
    return;
  }
  const host = compareDialogHost();
  if (host) {
    host.remove();
  }
  compareHost = null;
  comparePageOverride = null;
  compareState.token += 1;
  compareState.pending = [];
}

function compareDialogTheme() {
  const host = compareDialogHost();
  const theme = host && (
    (host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme"))
    || (host.closest && host.closest(".ptaf-theme"))
  );
  if (theme) {
    theme.dataset.theme = pageTheme();
  }
  const button = document.getElementById(COMPARE_BUTTON_ID);
  const buttonTheme = button && button.shadowRoot && button.shadowRoot.querySelector(".ptaf-theme");
  if (buttonTheme) {
    buttonTheme.dataset.theme = pageTheme();
  }
}

function renderCompareDialog() {
  const host = compareDialogHost();
  const root = host && (host.shadowRoot || host).querySelector(".ptaf-compare-body");
  if (!root) {
    return;
  }
  root.replaceChildren();
  const warning = document.createElement("p");
  warning.className = "ptaf-compare-warning";
  warning.textContent = "Экспериментальная функция. Сравниваются состояние, действия, пропускаемые и проверяемые части и остальные параметры. Копирование исключения добавляет его и не меняет действия. Отличающиеся параметры можно перенести в шаблон.";
  root.append(warning, renderCompareLegend());

  if (compareState.policies.length > 1) {
    const field = document.createElement("label");
    field.className = "ptaf-compare-field";
    field.textContent = "Политика";
    const select = document.createElement("select");
    select.className = "ptaf-compare-select";
    for (const policy of compareState.policies) {
      const option = document.createElement("option");
      option.value = policy.id;
      option.textContent = policy.name || policy.id;
      option.selected = policy.id === compareState.policyId;
      select.append(option);
    }
    select.disabled = compareState.writing;
    select.addEventListener("change", () => {
      compareState.policyId = select.value;
      compareState.pending = [];
      loadCompare(host);
    });
    field.append(select);
    root.append(field);
  }

  if (compareState.note) {
    const note = document.createElement("p");
    note.className = "ptaf-compare-note";
    note.textContent = compareState.note;
    root.append(note);
  }
  if (compareState.error) {
    const error = document.createElement("p");
    error.className = "ptaf-compare-error";
    error.textContent = compareState.error;
    root.append(error);
  }

  if (!compareState.note && compareState.parts.length) {
    root.append(renderRuleParts());
  }

  if (!compareState.note && (compareState.policyName || compareState.templateName)) {
    if (compareState.templateSkip.length || compareState.policySkip.length) {
      root.append(renderComparedList({
        title: "Пропускаемые части",
        bucket: "skip",
        templateItems: compareState.templateSkip,
        policyItems: compareState.policySkip,
        allLabel: "Перенести все пропускаемые части",
      }));
    }
    root.append(renderComparedList({
      title: "Исключения",
      bucket: "exclusion",
      templateItems: compareState.templateExclusions,
      policyItems: compareState.policyExclusions,
      allLabel: "Перенести все исключения",
    }));
  }

  if (compareState.canRestore && !compareState.note) {
    const banner = document.createElement("div");
    banner.className = "ptaf-compare-restore";
    const text = document.createElement("p");
    text.textContent = compareState.mode === "vendor"
      ? "Правило шаблона совпадает с набором системных правил, но наследуемость нарушена. Изменения набора больше не попадают в это правило."
      : "Правило в политике совпадает с шаблоном, но наследуемость нарушена. Изменения шаблона больше не попадают в это правило.";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "ptaf-compare-arrow";
    restore.textContent = "Восстановить наследуемость";
    restore.disabled = compareState.writing;
    restore.addEventListener("click", () => armCompare({ kind: "restore" }));
    banner.append(text, restore);
    root.append(banner);
  }

  const confirm = renderPendingConfirm();
  root.append(confirm);
  if (compareState.templateId && compareState.note !== "Чтение правил...") {
    root.append(renderLinkedPolicies());
  }
  placeWriteButton(root);
  const close = host.shadowRoot.querySelector(".ptaf-compare-close");
  if (close) {
    close.disabled = compareState.writing;
  }
}

function renderPolicyItems(policies, emptyText, markCurrent) {
  const list = document.createElement("ul");
  list.className = "ptaf-compare-policy-list";
  if (!policies.length) {
    const item = document.createElement("li");
    item.textContent = emptyText;
    list.append(item);
    return list;
  }
  for (const policy of policies) {
    const item = document.createElement("li");
    item.textContent = policy.name || policy.id;
    if (markCurrent && policy.id === compareState.policyId) {
      item.textContent += " — эта политика";
    }
    list.append(item);
  }
  return list;
}

function renderLinkedPolicies() {
  const box = document.createElement("section");
  box.className = "ptaf-compare-linked";
  const title = document.createElement("h3");
  title.textContent = `Политики безопасности на основе шаблона «${compareState.templateName || compareState.templateId}»`;
  const note = document.createElement("p");
  note.className = "ptaf-compare-note";
  note.textContent = "Изменение шаблона повлияет на эти политики.";
  box.append(title, note, renderPolicyItems(compareState.linkedPolicies || [], "Нет политик приложений на основе этого шаблона.", true));
  return box;
}

function renderCompareLegend() {
  const legend = document.createElement("ul");
  legend.className = "ptaf-compare-legend";
  const items = [
    ["accent", "Синяя рамка — сюда перенесётся"],
    ["warning", "Жёлтая рамка — отличие"],
    ["success", "Зелёная рамка — уже совпадает или будет добавлено"],
    ["error", "Красная рамка — будет удалено"],
  ];
  for (const [tone, text] of items) {
    const item = document.createElement("li");
    item.dataset.tone = tone;
    item.textContent = text;
    legend.append(item);
  }
  return legend;
}

function createWriteButton() {
  const write = document.createElement("button");
  write.type = "button";
  write.className = "ptaf-compare-write";
  const entries = pendingList();
  const restoring = entries.some((entry) => entry.kind === "restore");
  const count = entries.length;
  write.textContent = compareState.writing
    ? "Запись..."
    : restoring
      ? "Восстановить"
      : (count > 1 ? `Записать ${count}` : "Записать");
  write.disabled = compareState.writing || !count;
  write.addEventListener("click", () => writeCompare());
  return write;
}

function placeWriteButton(root) {
  const entries = pendingList();
  if (!entries.length) {
    return;
  }
  const write = createWriteButton();
  if (entries.some((entry) => entry.kind === "restore")) {
    const banner = root.querySelector(".ptaf-compare-restore");
    if (banner) {
      banner.append(write);
    }
    return;
  }
  const targets = root.querySelectorAll(".ptaf-compare-exclusion[data-match='target']");
  const target = targets[targets.length - 1];
  if (!target) {
    return;
  }
  const slot = document.createElement("div");
  slot.className = "ptaf-compare-write-slot";
  slot.append(write);
  target.append(slot);
  target.scrollIntoView({ block: "nearest" });
}

function renderRuleParts() {
  const wrap = document.createElement("div");
  wrap.className = "ptaf-compare-parts";
  const summary = document.createElement("p");
  summary.className = "ptaf-compare-summary";
  if (compareState.overridden) {
    const flag = document.createElement("p");
    flag.className = "ptaf-compare-summary";
    flag.textContent = compareState.mode === "vendor"
      ? "Правило шаблона переопределено относительно набора системных правил."
      : "Правило политики переопределено относительно шаблона.";
    wrap.append(flag);
  }
  const diffs = compareState.parts.filter((part) => part.status === "diff").map((part) => part.title);
  summary.textContent = diffs.length
    ? `Отличается: ${diffs.join(", ")}.`
    : "Состояние, действия, пропускаемые и проверяемые части и остальные параметры совпадают.";
  wrap.append(summary);
  for (const part of compareState.parts) {
    if (part.status === "absent") {
      continue;
    }
    wrap.append(renderRulePart(part));
  }
  return wrap;
}

function renderRulePart(part) {
  if (part.id === "other" || part.id === "check" || part.id === "enabled" || part.id === "actions") {
    return renderOtherParams(part);
  }
  const card = document.createElement("section");
  card.className = "ptaf-compare-part";
  card.dataset.status = part.status;
  const title = document.createElement("h3");
  const mark = part.status === "diff" ? "отличается" : part.status === "absent" ? "нет в правиле" : "совпадает";
  title.textContent = `${part.title}: ${mark}`;
  card.append(title);
  if (part.fields) {
    if (part.status === "same") {
      const note = document.createElement("p");
      note.className = "ptaf-compare-note";
      note.textContent = part.fields.length === 1 ? "1 параметр совпадает." : `${part.fields.length} параметров совпадают.`;
      card.append(note);
      return card;
    }
    for (const field of part.fields) {
      if (!field.same) {
        card.append(renderPartField(field));
      }
    }
    return card;
  }
  if (part.status === "same") {
    const note = document.createElement("p");
    note.className = "ptaf-compare-note";
    note.textContent = part.template;
    card.append(note);
    return card;
  }
  card.append(renderPartField({ title: "", template: part.template, policy: part.policy }));
  return card;
}

function canCopyParam(field, direction) {
  if (!field || field.same || !field.path || !["variables", "enabled", "actions"].includes(field.scope)) {
    return false;
  }
  if (compareState.mode === "vendor") {
    return direction === "template";
  }
  return direction === "policy" || direction === "template";
}

function isFlagList(value) {
  return Array.isArray(value) && value.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item));
}

function renderEnabledToggle(on) {
  const row = document.createElement("span");
  row.className = "ptaf-compare-toggle";
  const knob = document.createElement("span");
  knob.className = "ptaf-compare-switch";
  knob.dataset.on = on ? "true" : "false";
  const label = document.createElement("span");
  label.textContent = enabledLabel(Boolean(on));
  row.append(knob, label);
  return row;
}

function renderParamValue(value, other, present, field) {
  if (field && field.scope === "enabled") {
    if (!present) {
      const text = document.createElement("p");
      text.textContent = "нет";
      return text;
    }
    return renderEnabledToggle(value);
  }
  if (!present) {
    const text = document.createElement("p");
    text.textContent = "нет";
    return text;
  }
  if (isFlagList(value)) {
    if (!value.length) {
      const text = document.createElement("p");
      text.textContent = "нет";
      return text;
    }
    const wrap = document.createElement("div");
    wrap.className = "ptaf-compare-flags";
    const known = new Set((isFlagList(other) ? other : []).map((item) => String(item)));
    for (const item of value) {
      const chip = document.createElement("span");
      chip.className = "ptaf-compare-flag";
      if (!known.has(String(item))) {
        chip.dataset.extra = "true";
      }
      chip.textContent = formatPartValue(item);
      wrap.append(chip);
    }
    return wrap;
  }
  const text = document.createElement("p");
  text.textContent = formatPartValue(value);
  return text;
}

function renderOtherParams(part) {
  const wrap = document.createElement("section");
  wrap.className = "ptaf-compare-params";
  const title = document.createElement("h3");
  const mark = part.status === "diff" ? "отличается" : "совпадает";
  title.textContent = `${part.title}: ${mark}`;
  wrap.append(title);
  if (part.status !== "diff") {
    const note = document.createElement("p");
    note.className = "ptaf-compare-note";
    const field = (part.fields || [])[0];
    if (part.id === "enabled" && field) {
      note.append(renderEnabledToggle(field.templateValue));
    } else if (part.id === "actions" && field) {
      note.textContent = (field.templateNames || []).join(", ") || "нет";
    } else {
      const count = (part.fields || []).length;
      note.textContent = count === 1 ? "1 параметр совпадает." : `${count} параметров совпадают.`;
    }
    wrap.append(note);
    return wrap;
  }
  const vendor = compareState.mode === "vendor";
  for (const field of part.fields || []) {
    if (field.same) {
      continue;
    }
    const block = document.createElement("article");
    block.className = "ptaf-compare-param";
    const columns = document.createElement("div");
    columns.className = "ptaf-compare-board";
    columns.append(
      renderOtherParamSide(field, {
        caption: vendor ? "Набор правил" : "Шаблон",
        source: "template",
        arrow: "policy",
        write: vendor ? "template" : "policy",
        buttonLabel: vendor ? "В шаблон" : "В политику",
        readOnly: false,
      }),
      renderOtherParamSide(field, {
        caption: vendor ? "Шаблон" : "Политика",
        source: "policy",
        arrow: "template",
        write: "template",
        buttonLabel: "В шаблон",
        readOnly: vendor,
      })
    );
    if (field.title && field.title !== part.title) {
      const name = document.createElement("h3");
      name.textContent = field.title;
      block.append(name);
    }
    block.append(columns);
    const footer = renderParamPendingFooter(field);
    if (footer) {
      block.append(footer);
    }
    wrap.append(block);
  }
  return wrap;
}

function renderFlagOutcome(current, next) {
  const currentList = Array.isArray(current) ? current : [];
  const nextList = Array.isArray(next) ? next : [];
  const nextSet = new Set(nextList.map((item) => String(item)));
  const currentSet = new Set(currentList.map((item) => String(item)));
  if (!nextList.length && !currentList.length) {
    const text = document.createElement("p");
    text.textContent = "нет";
    return text;
  }
  const wrap = document.createElement("div");
  wrap.className = "ptaf-compare-flags";
  for (const item of nextList) {
    const chip = document.createElement("span");
    chip.className = "ptaf-compare-flag";
    if (!currentSet.has(String(item))) {
      chip.dataset.extra = "true";
    }
    chip.textContent = formatPartValue(item);
    wrap.append(chip);
  }
  for (const item of currentList) {
    if (nextSet.has(String(item))) {
      continue;
    }
    const chip = document.createElement("span");
    chip.className = "ptaf-compare-flag";
    chip.dataset.removed = "true";
    chip.textContent = formatPartValue(item);
    wrap.append(chip);
  }
  return wrap;
}

function sideIsTransferTarget(field, side) {
  const pending = pendingParam(field);
  if (!pending) {
    return false;
  }
  if (compareState.mode === "vendor" || pending.direction === "policy") {
    return side.source === "policy";
  }
  return side.source === "template";
}

function renderPendingParamBody(field) {
  const pending = pendingParam(field);
  const outcome = transferOutcome(field, pending ? pending.direction : "policy");
  const current = field.scope === "actions" ? (outcome.currentNames || []) : outcome.current;
  const next = field.scope === "actions" ? (outcome.nextNames || []) : outcome.next;
  if (field.scope === "actions" || isFlagList(current) || isFlagList(next)) {
    const currentList = field.scope === "actions" || isFlagList(current) ? current : [];
    const nextList = field.scope === "actions" || isFlagList(next) ? next : [];
    return renderFlagOutcome(currentList, nextList);
  }
  return renderParamValue(next, current, outcome.nextPresent, field);
}

function renderParamPendingFooter(field) {
  const chosen = pendingParam(field);
  if (!chosen) {
    return null;
  }
  const footer = document.createElement("div");
  footer.className = "ptaf-compare-param-pending";
  const note = document.createElement("p");
  note.className = "ptaf-compare-target-note";
  note.textContent = `После «Записать» в ${pendingDestination(chosen.direction)} значение станет таким. Остальное не изменится.`;
  const actions = document.createElement("div");
  actions.className = "ptaf-compare-param-pending-actions";
  actions.append(removePendingButton(pendingKey(chosen)), createWriteButton());
  footer.append(note, actions);
  return footer;
}

function renderOtherParamSide(field, side) {
  const cell = document.createElement("div");
  cell.className = "ptaf-compare-param-side";
  const targeted = sideIsTransferTarget(field, side);
  if (targeted) {
    cell.classList.add("is-target");
  }
  const label = document.createElement("p");
  label.className = "ptaf-compare-caption";
  label.textContent = side.caption;
  cell.append(label);
  if (targeted) {
    cell.append(renderPendingParamBody(field));
  } else {
    const present = side.source === "template" ? field.templatePresent : field.policyPresent;
    let value = side.source === "template" ? field.templateValue : field.policyValue;
    let other = side.source === "template" ? field.policyValue : field.templateValue;
    if (field.scope === "actions") {
      value = side.source === "template" ? field.templateNames : field.policyNames;
      other = side.source === "template" ? field.policyNames : field.templateNames;
    }
    cell.append(renderParamValue(value, other, present, field));
  }
  if (!side.readOnly && canCopyParam(field, side.write)) {
    cell.append(compareArrowButton(side.arrow, () => armCompare({
      kind: "copy-params",
      direction: side.write,
      fields: [field],
    }), side.buttonLabel));
  }
  return cell;
}

function renderPartField(field) {
  const row = document.createElement("div");
  row.className = "ptaf-compare-part-field";
  if (field.title) {
    const name = document.createElement("p");
    name.className = "ptaf-compare-kicker";
    name.textContent = field.title;
    row.append(name);
  }
  const columns = document.createElement("div");
  columns.className = "ptaf-compare-board";
  const left = compareState.mode === "vendor" ? "Набор правил" : "Шаблон";
  const right = compareState.mode === "vendor" ? "Шаблон" : "Политика";
  columns.append(renderPartCell(left, field.template), renderPartCell(right, field.policy));
  row.append(columns);
  return row;
}

function renderPartCell(caption, value) {
  const cell = document.createElement("div");
  const label = document.createElement("p");
  label.className = "ptaf-compare-caption";
  label.textContent = caption;
  const text = document.createElement("p");
  text.textContent = value || "нет";
  cell.append(label, text);
  return cell;
}

function pairExclusions(leftItems, rightItems) {
  const pools = new Map();
  rightItems.forEach((item, index) => {
    const signature = exclusionSignature(item);
    if (!pools.has(signature)) {
      pools.set(signature, []);
    }
    pools.get(signature).push({ item, index });
  });
  const pairs = [];
  leftItems.forEach((item, index) => {
    const pool = pools.get(exclusionSignature(item));
    if (pool && pool.length) {
      pairs.push({ left: { item, index }, right: pool.shift(), same: true });
      return;
    }
    pairs.push({ left: { item, index }, right: null, same: false });
  });
  for (const pool of pools.values()) {
    for (const match of pool) {
      pairs.push({ left: null, right: match, same: false });
    }
  }
  return pairs;
}

function renderComparedList(list) {
  const title = document.createElement("h3");
  title.className = "ptaf-compare-section";
  title.textContent = list.title;
  const fragment = document.createDocumentFragment();
  fragment.append(title, renderExclusionBoard(list));
  return fragment;
}

function renderExclusionBoard(list) {
  const vendorMode = compareState.mode === "vendor";
  const ruleSet = compareState.ruleSets.length
    ? `Набор системных правил: ${compareState.ruleSets.join(", ")}`
    : "Набор системных правил не указан";
  const left = {
    kicker: vendorMode ? "Набор системных правил" : "Шаблон политики",
    name: vendorMode ? (compareState.ruleSets.join(", ") || "—") : compareState.templateName,
    ruleSet: vendorMode ? "" : ruleSet,
    items: list.templateItems,
    otherItems: list.policyItems,
    direction: "policy",
    bucket: list.bucket,
    showAll: false,
    readOnly: vendorMode,
    emptyText: list.bucket === "skip" ? "Пропускаемых частей нет" : "Исключений нет",
  };
  const right = {
    kicker: vendorMode ? "Шаблон политики" : "Политика безопасности веб-приложения",
    name: vendorMode ? compareState.templateName : compareState.policyName,
    ruleSet: "",
    items: list.policyItems,
    otherItems: list.templateItems,
    direction: "template",
    bucket: list.bucket,
    showAll: !vendorMode,
    readOnly: vendorMode,
    allLabel: list.allLabel,
    emptyText: list.bucket === "skip" ? "Пропускаемых частей нет" : "Исключений нет",
  };
  const board = document.createElement("div");
  board.className = "ptaf-compare-pairs";
  board.append(renderExclusionHead(left), renderExclusionHead(right));
  for (const pair of pairExclusions(left.items, right.items)) {
    const sendLeft = pair.left && !pair.same && pendingCopyMatches(pair.left.item, left.direction, left.bucket);
    const sendRight = pair.right && !pair.same && pendingCopyMatches(pair.right.item, right.direction, right.bucket);
    board.append(
      pair.left ? renderExclusionCard(pair.left.item, pair.left.index, left.direction, pair.same, left.readOnly, left.bucket) : (sendRight ? renderTransferTarget(pair.right.item, right.direction, right.bucket) : renderExclusionGap()),
      pair.right ? renderExclusionCard(pair.right.item, pair.right.index, right.direction, pair.same, right.readOnly, right.bucket) : (sendLeft ? renderTransferTarget(pair.left.item, left.direction, left.bucket) : renderExclusionGap())
    );
  }
  return board;
}

function renderExclusionHead(options) {
  const side = document.createElement("section");
  side.className = "ptaf-compare-side";
  const kicker = document.createElement("p");
  kicker.className = "ptaf-compare-kicker";
  kicker.textContent = options.kicker;
  const title = document.createElement("h3");
  title.textContent = options.name || "—";
  side.append(kicker, title);
  if (options.ruleSet) {
    const set = document.createElement("p");
    set.className = "ptaf-compare-ruleset";
    set.textContent = options.ruleSet;
    side.append(set);
  }
  if (!options.items.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-compare-note";
    empty.textContent = options.emptyText || "Исключений нет";
    side.append(empty);
  }
  if (options.showAll && !options.readOnly) {
    const fresh = missingExclusions(options.items, options.otherItems || []);
    const all = document.createElement("button");
    all.type = "button";
    all.className = "ptaf-compare-all";
    all.textContent = options.allLabel || "Перенести все исключения";
    all.disabled = compareState.writing || !fresh.length;
    all.addEventListener("click", () => armCompare({ kind: "copy-all", direction: "template", bucket: options.bucket || "exclusion", items: fresh.slice() }));
    side.append(all);
  }
  return side;
}

function pendingCopyMatches(item, direction, bucket) {
  const bucketName = bucket || "exclusion";
  const signature = exclusionSignature(item);
  return pendingList().some((entry) => {
    if ((entry.kind !== "copy" && entry.kind !== "copy-all") || entry.direction !== direction) {
      return false;
    }
    if ((entry.bucket || "exclusion") !== bucketName) {
      return false;
    }
    if (entry.kind === "copy-all") {
      return true;
    }
    return (entry.items || []).some((candidate) => exclusionSignature(candidate) === signature);
  });
}

function renderTransferTarget(item, direction, bucket) {
  const card = renderExclusionCard(item, 0, direction, false, true, bucket || "exclusion");
  card.dataset.match = "target";
  const note = document.createElement("p");
  note.className = "ptaf-compare-target-note";
  note.textContent = `После «Записать» в ${pendingDestination(direction)} будет добавлено. Уже существующие записи сохранятся.`;
  const key = pendingKey({ kind: "copy", bucket: bucket || "exclusion", items: [item] });
  card.append(note, removePendingButton(key));
  return card;
}

function renderExclusionGap() {
  const gap = document.createElement("div");
  gap.className = "ptaf-compare-pair-gap";
  return gap;
}

function renderSkipRow(label, value) {
  const row = document.createElement("div");
  row.className = "ptaf-compare-skip-row";
  const name = document.createElement("span");
  name.className = "ptaf-compare-skip-label";
  name.textContent = label;
  const text = document.createElement("span");
  text.className = "ptaf-compare-skip-value";
  text.textContent = value;
  row.append(name, text);
  return row;
}

function renderJsonToggle(item) {
  const wrap = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-compare-json";
  button.textContent = "JSON";
  const pre = document.createElement("pre");
  pre.className = "ptaf-compare-json-body";
  pre.hidden = true;
  pre.textContent = JSON.stringify(stripIds(item), null, 2);
  button.addEventListener("click", () => {
    pre.hidden = !pre.hidden;
    button.textContent = pre.hidden ? "JSON" : "Скрыть JSON";
  });
  wrap.append(button, pre);
  return wrap;
}

function renderExclusionCard(item, index, direction, already, readOnly, bucket) {
  const card = document.createElement("article");
  card.className = "ptaf-compare-exclusion";
  card.dataset.match = already ? "same" : "diff";
  const title = document.createElement("h3");
  const view = skipPartView(item);
  if (view) {
    title.textContent = view.title;
    card.append(title, renderSkipRow("ключ", view.key));
    const and = document.createElement("p");
    and.className = "ptaf-compare-or ptaf-compare-skip-and";
    and.textContent = "и";
    card.append(and, renderSkipRow("значение", view.value), renderJsonToggle(item));
  } else {
    title.textContent = item && typeof item.name === "string" && item.name ? item.name : `Исключение ${index + 1}`;
    card.append(title);
    const lines = exclusionLines(item);
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        const or = document.createElement("p");
        or.className = "ptaf-compare-or";
        or.textContent = "ИЛИ";
        card.append(or);
      }
      const text = document.createElement("p");
      text.textContent = line;
      card.append(text);
    });
    if (!(lines.length === 1 && /^\s*[{[]/.test(lines[0]))) {
      card.append(renderJsonToggle(item));
    }
  }
  if (already) {
    const have = document.createElement("p");
    have.className = "ptaf-compare-caption";
    have.textContent = direction === "template" ? "Уже есть в шаблоне" : "Уже есть в политике";
    card.append(have);
    return card;
  }
  if (readOnly) {
    return card;
  }
  card.append(compareArrowButton(direction, () => armCompare({ kind: "copy", direction, bucket: bucket || "exclusion", items: [item] })));
  return card;
}

function compareArrowButton(direction, onClick, labelText) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-compare-arrow";
  button.disabled = compareState.writing;
  const mark = document.createElement("span");
  mark.className = "ptaf-compare-arrow-mark";
  mark.textContent = direction === "template" ? "←" : "→";
  const label = document.createElement("span");
  label.textContent = labelText || (direction === "template" ? "В шаблон" : "В политику");
  if (direction === "template") {
    button.append(mark, label);
  } else {
    button.append(label, mark);
  }
  button.addEventListener("click", onClick);
  return button;
}

function pendingDestination(direction) {
  const toPolicy = compareState.mode !== "vendor" && direction === "policy";
  if (toPolicy) {
    return `политике «${compareState.policyName || compareState.policyId}»`;
  }
  return `шаблоне «${compareState.templateName || compareState.templateId}»`;
}

function transferOutcome(field, direction) {
  const fromTemplate = compareState.mode === "vendor" || direction === "policy";
  return {
    current: fromTemplate ? field.policyValue : field.templateValue,
    next: fromTemplate ? field.templateValue : field.policyValue,
    currentPresent: fromTemplate ? field.policyPresent : field.templatePresent,
    nextPresent: fromTemplate ? field.templatePresent : field.policyPresent,
    currentNames: fromTemplate ? field.policyNames : field.templateNames,
    nextNames: fromTemplate ? field.templateNames : field.policyNames,
  };
}

function renderOutcomeValue(field, outcome, which) {
  const present = which === "current" ? outcome.currentPresent : outcome.nextPresent;
  let value = which === "current" ? outcome.current : outcome.next;
  let other = which === "current" ? outcome.next : outcome.current;
  if (field.scope === "actions") {
    value = which === "current" ? outcome.currentNames : outcome.nextNames;
    other = which === "current" ? outcome.nextNames : outcome.currentNames;
  }
  return renderParamValue(value, other, present, field);
}

function renderTransferPreview(field, direction) {
  const outcome = transferOutcome(field, direction);
  const row = document.createElement("div");
  row.className = "ptaf-compare-preview";
  if ((field.title || field.path) && field.title !== "Состояние" && field.title !== "Назначенные действия") {
    const name = document.createElement("p");
    name.className = "ptaf-compare-kicker";
    name.textContent = field.title || field.path;
    row.append(name);
  }
  const columns = document.createElement("div");
  columns.className = "ptaf-compare-board";
  for (const side of [["Сейчас", "current"], ["Станет", "next"]]) {
    const cell = document.createElement("div");
    cell.className = side[1] === "next" ? "ptaf-compare-preview-next" : "ptaf-compare-preview-now";
    const label = document.createElement("p");
    label.className = "ptaf-compare-caption";
    label.textContent = side[0];
    cell.append(label, renderOutcomeValue(field, outcome, side[1]));
    columns.append(cell);
  }
  row.append(columns);
  return row;
}

function renderAddedPreview(item) {
  const card = document.createElement("article");
  card.className = "ptaf-compare-exclusion";
  card.dataset.match = "diff";
  const view = skipPartView(item);
  const title = document.createElement("h3");
  if (view) {
    title.textContent = view.title;
    card.append(title, renderSkipRow("ключ", view.key));
    const and = document.createElement("p");
    and.className = "ptaf-compare-or ptaf-compare-skip-and";
    and.textContent = "и";
    card.append(and, renderSkipRow("значение", view.value));
    return card;
  }
  title.textContent = item && typeof item.name === "string" && item.name ? item.name : "Будет добавлено";
  card.append(title);
  exclusionLines(item).forEach((line) => {
    const text = document.createElement("p");
    text.textContent = line;
    card.append(text);
  });
  return card;
}

function renderPendingConfirm() {
  const box = document.createElement("div");
  box.className = "ptaf-compare-confirm";
  const pending = pendingList().find((entry) => entry.kind === "restore");
  if (!pending) {
    return box;
  }
  const intro = document.createElement("p");
  intro.textContent = comparePendingText(pending);
  box.append(intro);
  return box;
}

function comparePendingText(pending) {
  if (!pending) {
    return "";
  }
  if (pending.kind === "copy-params") {
    const where = pending.direction === "policy"
      ? `политику «${compareState.policyName || compareState.policyId}»`
      : `шаблон «${compareState.templateName || compareState.templateId}»`;
    const fields = pending.fields || [];
    if (fields.length === 1) {
      const name = fields[0].title || fields[0].path || "Параметр";
      return `Параметр «${name}» будет записан в ${where}. Остальные параметры, исключения и действия не изменятся.`;
    }
    return `Отличающиеся параметры будут записаны в ${where}. Исключения и действия не изменятся.`;
  }
  if (pending.kind === "restore") {
    const where = compareState.mode === "vendor"
      ? `шаблоне «${compareState.templateName || compareState.templateId}»`
      : `политике «${compareState.policyName || compareState.policyId}»`;
    return `Переопределение правила в ${where} будет снято. Значения совпадают с исходными, и дальнейшие изменения снова будут наследоваться.`;
  }
  const target = pending.direction === "template"
    ? `шаблон «${compareState.templateName || compareState.templateId}»`
    : `политику «${compareState.policyName || compareState.policyId}»`;
  const skip = pending.bucket === "skip";
  const scope = pending.kind === "copy-all"
    ? (skip ? "Все пропускаемые части" : "Все исключения")
    : (skip ? "Выбранная пропускаемая часть" : "Выбранное исключение");
  const kept = skip
    ? "Уже существующие пропускаемые части сохранятся, совпадения не дублируются. Исключения и действия не изменятся."
    : "Уже существующие исключения сохранятся, совпадения не дублируются. Пропускаемые части и действия не изменятся.";
  return `${scope} будут добавлены в ${target}. ${kept}`;
}

function pendingList() {
  return Array.isArray(compareState.pending) ? compareState.pending : [];
}

function queuedDirection() {
  const entry = pendingList().find((item) => item.kind !== "restore" && item.direction);
  return entry ? entry.direction : "";
}

function acceptDirectionChange(direction) {
  const current = queuedDirection();
  if (!current || current === direction) {
    return true;
  }
  return window.confirm("Предыдущие настройки сбросятся. Сменить направление переноса?");
}

function pendingKey(entry) {
  if (!entry) {
    return "";
  }
  if (entry.kind === "restore") {
    return "restore";
  }
  if (entry.kind === "copy-params") {
    const field = (entry.fields || [])[0] || {};
    return `params:${field.scope || ""}:${field.path || ""}`;
  }
  if (entry.kind === "copy-all") {
    return `all:${entry.bucket || "exclusion"}:${entry.direction || ""}`;
  }
  const item = (entry.items || [])[0];
  return `copy:${entry.bucket || "exclusion"}:${item ? exclusionSignature(item) : ""}`;
}

function pendingParam(field) {
  return pendingList().find((entry) => (
    entry.kind === "copy-params"
    && (entry.fields || []).some((item) => item.path === field.path && item.scope === field.scope)
  )) || null;
}

function queuedDirection() {
  const entry = pendingList().find((item) => item.kind !== "restore" && item.direction);
  return entry ? entry.direction : "";
}

function acceptDirectionChange(direction) {
  const current = queuedDirection();
  if (!current || current === direction) {
    return true;
  }
  return window.confirm("Предыдущие настройки сбросятся. Сменить направление переноса?");
}

function dropPending(key) {
  compareState.pending = pendingList().filter((entry) => pendingKey(entry) !== key);
  compareState.error = "";
  renderCompareDialog();
}

function removePendingButton(key) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-compare-remove";
  button.textContent = "Убрать";
  button.disabled = compareState.writing;
  button.addEventListener("click", () => dropPending(key));
  return button;
}

function armCompare(entry) {
  if (entry.kind === "restore") {
    compareState.pending = [entry];
    compareState.error = "";
    renderCompareDialog();
    return;
  }
  if (entry.kind === "copy-all") {
    armCopyAll(entry);
    return;
  }
  const key = pendingKey(entry);
  const list = pendingList().filter((item) => item.kind !== "restore");
  const queued = queuedDirection();
  if (queued && queued !== entry.direction) {
    if (!acceptDirectionChange(entry.direction)) {
      return;
    }
    compareState.pending = [entry];
    compareState.error = "";
    renderCompareDialog();
    return;
  }
  const current = list.find((item) => pendingKey(item) === key);
  if (current && current.direction === entry.direction) {
    compareState.pending = list.filter((item) => pendingKey(item) !== key);
  } else {
    compareState.pending = list.concat(entry);
  }
  compareState.error = "";
  renderCompareDialog();
}

function armCopyAll(entry) {
  const copies = (entry.items || []).map((item) => ({
    kind: "copy",
    direction: entry.direction,
    bucket: entry.bucket,
    items: [item],
  }));
  const keys = new Set(copies.map(pendingKey));
  const list = pendingList().filter((item) => item.kind !== "restore");
  const queued = queuedDirection();
  if (queued && entry.direction && queued !== entry.direction) {
    if (!copies.length || !acceptDirectionChange(entry.direction)) {
      return;
    }
    compareState.pending = copies;
    compareState.error = "";
    renderCompareDialog();
    return;
  }
  const allSelected = copies.length > 0 && copies.every((copy) => (
    list.some((item) => pendingKey(item) === pendingKey(copy) && item.direction === copy.direction)
  ));
  compareState.pending = allSelected
    ? list.filter((item) => !keys.has(pendingKey(item)))
    : list.filter((item) => !keys.has(pendingKey(item))).concat(copies);
  compareState.error = "";
  renderCompareDialog();
}

function openCompareDialog() {
  if (compareState.writing || !compareExperimental) {
    return;
  }
  comparePageOverride = null;
  closeCompareDialog();
  const host = document.createElement("div");
  host.id = COMPARE_DIALOG_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const theme = attachUi(host);
  if (!theme) {
    return;
  }
  theme.dataset.theme = pageTheme();
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-compare-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "ptaf-compare-dialog";
  dialog.tabIndex = -1;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const titleBar = document.createElement("div");
  titleBar.className = "ptaf-compare-titlebar";
  const title = document.createElement("h2");
  title.textContent = "Сравнение правила";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ptaf-compare-close";
  close.setAttribute("aria-label", "Закрыть");
  close.textContent = "×";
  close.addEventListener("click", () => closeCompareDialog());
  titleBar.append(title, close);
  const body = document.createElement("div");
  body.className = "ptaf-compare-body";
  dialog.append(titleBar, body);
  backdrop.append(dialog);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeCompareDialog();
    }
  });
  theme.append(backdrop);
  document.body.appendChild(host);
  dialog.focus();
  loadCompare(host);
}

function openComparePanel(parent, page, onClose) {
  if (!parent || compareState.writing || !compareExperimental || !page || !page.entityId || !page.ruleRef) {
    return false;
  }
  closeCompareDialog();
  comparePageOverride = {
    kind: page.kind === "template" ? "template" : "policy",
    entityId: page.entityId,
    ruleRef: page.ruleRef,
  };
  const host = document.createElement("section");
  host.className = "ptaf-mx-compare";
  compareHost = host;
  const dialog = document.createElement("div");
  dialog.className = "ptaf-compare-dialog";
  dialog.tabIndex = -1;
  const titleBar = document.createElement("div");
  titleBar.className = "ptaf-compare-titlebar";
  const title = document.createElement("h2");
  title.textContent = "Сравнение правила";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ptaf-compare-close";
  close.setAttribute("aria-label", "Закрыть");
  close.textContent = "×";
  close.addEventListener("click", () => {
    closeCompareDialog();
    if (onClose) {
      onClose();
    }
  });
  titleBar.append(title, close);
  const body = document.createElement("div");
  body.className = "ptaf-compare-body";
  dialog.append(titleBar, body);
  host.append(dialog);
  parent.append(host);
  loadCompare(host);
  return true;
}

async function loadCompare(host) {
  const token = compareState.token + 1;
  compareState.token = token;
  compareState.note = "Чтение правил...";
  compareState.error = "";
  compareState.rows = [];
  compareState.pending = [];
  compareState.policyExclusions = [];
  compareState.templateExclusions = [];
  compareState.policySkip = [];
  compareState.templateSkip = [];
  compareState.policyLists = [];
  compareState.templateLists = [];
  compareState.policySkipPlace = null;
  compareState.templateSkipPlace = null;
  compareState.canRestore = false;
  compareState.parts = [];
  compareState.ruleSets = [];
  compareState.vendorIds = [];
  compareState.mode = "policy";
  compareState.overridden = false;
  compareState.linkedPolicies = [];
  renderCompareDialog();
  try {
    const page = parseComparePage();
    if (!page) {
      throw new Error("Откройте страницу правила политики или шаблона.");
    }
    if (page.kind === "policy") {
      const policy = await api(`/config/policies/${page.entityId}`);
      if (token !== compareState.token || !host.isConnected) {
        return;
      }
      compareState.mode = "policy";
      compareState.policyId = page.entityId;
      compareState.policyName = policy && policy.name ? policy.name : page.entityId;
      compareState.templateId = policy && policy.template_id ? policy.template_id : "";
      compareState.policies = [];
      if (!compareState.templateId) {
        throw new Error("У политики нет шаблона.");
      }
      const template = await api(`/config/policies/templates/user/${compareState.templateId}`);
      if (token !== compareState.token || !host.isConnected) {
        return;
      }
      compareState.templateName = template && template.name ? template.name : compareState.templateId;
      const linked = await policiesForTemplate(compareState.templateId, token, host);
      if (linked === null) {
        return;
      }
      compareState.linkedPolicies = linked;
      if (!(await loadRuleSets(template, token, host))) {
        return;
      }
    } else {
      compareState.templateId = page.entityId;
      const template = await api(`/config/policies/templates/user/${page.entityId}`);
      const linked = await policiesForTemplate(page.entityId, token, host);
      if (linked === null) {
        return;
      }
      compareState.templateName = template && template.name ? template.name : page.entityId;
      compareState.linkedPolicies = linked;
      if (!(await loadRuleSets(template, token, host))) {
        return;
      }
      compareState.policies = linked;
      if (!compareState.policies.length) {
        compareState.mode = "vendor";
        compareState.policyId = "";
        compareState.policyName = "";
      } else {
        compareState.mode = "policy";
        if (!compareState.policies.some((item) => item.id === compareState.policyId)) {
          compareState.policyId = compareState.policies[0].id;
        }
        const selected = compareState.policies.find((item) => item.id === compareState.policyId);
        compareState.policyName = selected && selected.name ? selected.name : compareState.policyId;
      }
    }
    await loadCompareRules(page, token, host);
  } catch (error) {
    if (token !== compareState.token || !host.isConnected) {
      return;
    }
    compareState.note = "";
    compareState.rows = [];
    compareState.error = error.message || "Не удалось прочитать правила.";
    renderCompareDialog();
  }
}

async function policiesForTemplate(templateId, token, host) {
  if (!templateId) {
    return [];
  }
  const policiesBody = await api("/config/policies");
  if (token !== compareState.token || !host.isConnected) {
    return null;
  }
  let policies = itemsOf(policiesBody);
  if (policies.length && !linkedTemplateId(policies[0])) {
    const detailed = [];
    for (const item of policies) {
      if (!item || !item.id) {
        continue;
      }
      detailed.push(await api(`/config/policies/${item.id}`));
      if (token !== compareState.token || !host.isConnected) {
        return null;
      }
    }
    policies = detailed;
  }
  return policies
    .filter((item) => item && linkedTemplateId(item) === templateId)
    .sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id), "ru"));
}

function linkedTemplateId(policy) {
  if (!policy || typeof policy !== "object") {
    return "";
  }
  if (policy.template_id) {
    return policy.template_id;
  }
  if (policy.user_template_id) {
    return policy.user_template_id;
  }
  if (policy.policy_template_id && policy.policy_template_type !== "VENDOR_TEMPLATE") {
    return policy.policy_template_id;
  }
  return "";
}

function vendorIdFrom(details) {
  if (details && details.policy_template_type === "VENDOR_TEMPLATE" && details.policy_template_id) {
    return details.policy_template_id;
  }
  return compareState.vendorIds[0] || "";
}

function applyComparedRules(parentDetails, childDetails, actionNames) {
  compareState.templateVars = compareObject(parentDetails && parentDetails.variables);
  compareState.policyVars = compareObject(childDetails && childDetails.variables);
  compareState.templateLists = collectListPlaces(parentDetails);
  compareState.policyLists = collectListPlaces(childDetails);
  compareState.templateSkipPlace = placeByKind(compareState.templateLists, "skip");
  compareState.policySkipPlace = placeByKind(compareState.policyLists, "skip");
  compareState.templatePlace = placeByKind(compareState.templateLists, "exclusion");
  compareState.policyPlace = placeByKind(compareState.policyLists, "exclusion");
  compareState.templateSkip = itemsByKind(compareState.templateLists, "skip");
  compareState.policySkip = itemsByKind(compareState.policyLists, "skip");
  compareState.templateExclusions = itemsByKind(compareState.templateLists, "exclusion");
  compareState.policyExclusions = itemsByKind(compareState.policyLists, "exclusion");
  compareState.parts = buildRuleParts(childDetails, parentDetails, actionNames);
  compareState.overridden = Boolean(childDetails && childDetails.has_overrides);
  compareState.canRestore = compareState.overridden && compareState.parts.every((part) => part.status !== "diff");
}

async function loadVendorCompare(page, token, host) {
  const templateList = `/config/policies/templates/user/${compareState.templateId}/rules`;
  const templateRule = await findCompareRule(templateList, page.ruleRef);
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  if (!templateRule) {
    compareState.note = "Правило не найдено в шаблоне. Запись не выполняется.";
    renderCompareDialog();
    return;
  }
  compareState.templatePath = "";
  compareState.policyPath = `/config/policies/templates/user/${compareState.templateId}/rules/${templateRule.id}`;
  const templateDetails = await api(compareState.policyPath);
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  const vendorId = vendorIdFrom(templateDetails);
  let vendorDetails = null;
  if (vendorId) {
    if (!compareState.ruleSets.length || !compareState.vendorIds.includes(vendorId)) {
      const vendor = await api(`/config/policies/templates/vendor/${vendorId}`).catch(() => null);
      if (token !== compareState.token || !host.isConnected) {
        return;
      }
      if (vendor && vendor.name && !compareState.ruleSets.includes(vendor.name)) {
        compareState.ruleSets = compareState.ruleSets.concat(vendor.name);
      }
      if (!compareState.vendorIds.includes(vendorId)) {
        compareState.vendorIds = compareState.vendorIds.concat(vendorId);
      }
    }
    const vendorList = `/config/policies/templates/vendor/${vendorId}/rules`;
    const vendorRule = await findCompareRule(vendorList, templateDetails.rule_id || templateRule.rule_id || templateRule.id);
    if (token !== compareState.token || !host.isConnected) {
      return;
    }
    if (vendorRule) {
      compareState.templatePath = `/config/policies/templates/vendor/${vendorId}/rules/${vendorRule.id}`;
      vendorDetails = await api(compareState.templatePath);
    }
  }
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  if (!vendorDetails) {
    compareState.overridden = Boolean(templateDetails && templateDetails.has_overrides);
    compareState.parts = [];
    compareState.canRestore = false;
    compareState.note = compareState.overridden
      ? "Правило переопределено (has_overrides). Правило набора системных правил прочитать не удалось, поэтому значения не с чем сравнить."
      : "Правило набора системных правил прочитать не удалось.";
    renderCompareDialog();
    return;
  }
  const actionNames = await loadActionNames();
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  applyComparedRules(vendorDetails, templateDetails, actionNames);
  compareState.note = "";
  renderCompareDialog();
}

async function loadCompareRules(page, token, host) {
  if (compareState.mode === "vendor") {
    await loadVendorCompare(page, token, host);
    return;
  }
  const policyList = `/config/policies/${compareState.policyId}/rules`;
  const templateList = `/config/policies/templates/user/${compareState.templateId}/rules`;
  let policyRule = await findCompareRule(policyList, page.ruleRef);
  let templateRule = await findCompareRule(templateList, page.ruleRef);
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  if (!policyRule && templateRule) {
    policyRule = await findCompareRule(policyList, templateRule.rule_id || templateRule.id);
  }
  if (!templateRule && policyRule) {
    templateRule = await findCompareRule(templateList, policyRule.rule_id || policyRule.id);
  }
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  if (!policyRule || !templateRule) {
    compareState.policyPath = "";
    compareState.templatePath = "";
    compareState.policyVars = {};
    compareState.templateVars = {};
    compareState.policyExclusions = [];
    compareState.templateExclusions = [];
    compareState.policySkip = [];
    compareState.templateSkip = [];
    compareState.policyLists = [];
    compareState.templateLists = [];
    compareState.policyPlace = null;
    compareState.templatePlace = null;
    compareState.policySkipPlace = null;
    compareState.templateSkipPlace = null;
    compareState.canRestore = false;
    compareState.parts = [];
    compareState.rows = [];
    compareState.note = !policyRule
      ? "Правило не найдено в политике. Запись не выполняется."
      : "Правило не найдено в шаблоне. Запись не выполняется.";
    renderCompareDialog();
    return;
  }
  compareState.policyPath = `/config/policies/${compareState.policyId}/rules/${policyRule.id}`;
  compareState.templatePath = `/config/policies/templates/user/${compareState.templateId}/rules/${templateRule.id}`;
  const policyDetails = await api(compareState.policyPath);
  const templateDetails = await api(compareState.templatePath);
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  const actionNames = await loadActionNames();
  if (token !== compareState.token || !host.isConnected) {
    return;
  }
  applyComparedRules(templateDetails, policyDetails, actionNames);
  compareState.rows = [];
  compareState.note = "";
  renderCompareDialog();
}

async function loadRuleSets(template, token, host) {
  const names = [];
  const ids = [];
  for (const entry of systemTemplateIds(template)) {
    if (entry && typeof entry === "object") {
      if (entry.id) {
        ids.push(entry.id);
      }
      names.push(entry.name || entry.id || "");
      continue;
    }
    if (entry) {
      ids.push(String(entry));
    }
    try {
      const vendor = await api(`/config/policies/templates/vendor/${entry}`);
      if (token !== compareState.token || !host.isConnected) {
        return false;
      }
      names.push((vendor && vendor.name) || String(entry));
    } catch (error) {
      names.push(String(entry));
    }
  }
  if (token !== compareState.token || !host.isConnected) {
    return false;
  }
  compareState.vendorIds = ids;
  compareState.ruleSets = names.filter(Boolean);
  return true;
}

async function findCompareRule(listPath, ref) {
  if (!ref) {
    return null;
  }
  const items = itemsOf(await api(listPath));
  return items.find((rule) => rule && (rule.id === ref || rule.rule_id === ref)) || null;
}

async function restoreInheritance() {
  const path = compareState.policyPath;
  const attempts = [
    { method: "POST", path: `${path}/reset` },
    { method: "POST", path: `${path}/reset`, body: {} },
    { method: "DELETE", path: `${path}/overrides` },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      await api(attempt.path, { method: attempt.method, body: attempt.body });
      return;
    } catch (error) {
      lastError = error;
      const status = error && error.status;
      if (status && status >= 500) {
        throw error;
      }
      if (status && status !== 400 && status !== 404 && status !== 405 && status !== 422 && status !== 501) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Стенд не принял сброс переопределения.");
}

async function writeCompare() {
  const entries = pendingList();
  const host = compareDialogHost();
  if (!entries.length || compareState.writing || !host) {
    return;
  }
  const restoring = entries.some((entry) => entry.kind === "restore");
  if (!restoring) {
    for (const entry of entries) {
      const target = paramTransferTarget(entry.direction);
      if (!target || !target.path || (compareState.mode === "vendor" && target.path === compareState.templatePath)) {
        compareState.error = "Набор системных правил не изменяется.";
        renderCompareDialog();
        return;
      }
    }
  } else if (!compareState.policyPath) {
    compareState.error = "Запись невозможна: правило есть только на одной стороне.";
    renderCompareDialog();
    return;
  }
  compareState.writing = true;
  compareState.error = "";
  renderCompareDialog();
  try {
    if (restoring) {
      await restoreInheritance();
    } else {
      const directions = [];
      for (const entry of entries) {
        if (!directions.includes(entry.direction)) {
          directions.push(entry.direction);
        }
      }
      for (const direction of directions) {
        await writeQueuedDirection(direction, entries.filter((entry) => entry.direction === direction));
      }
    }
    compareState.pending = [];
    const page = parseComparePage();
    if (!page || !host.isConnected) {
      compareState.writing = false;
      return;
    }
    await loadCompareRules(page, compareState.token, host);
    if (restoring && compareState.canRestore) {
      compareState.error = "Стенд не снял переопределение: наследуемость по-прежнему нарушена.";
    }
  } catch (error) {
    compareState.error = error.message || "Не удалось записать изменения.";
  } finally {
    compareState.writing = false;
    if (host.isConnected) {
      renderCompareDialog();
    }
  }
}

function scheduleCompare() {
  if (compareStopped || compareFrame) {
    return;
  }
  compareFrame = requestAnimationFrame(() => {
    compareFrame = 0;
    placeCompareButton();
  });
}

function stopCompare() {
  if (compareStopped) {
    return;
  }
  compareStopped = true;
  if (compareFrame) {
    cancelAnimationFrame(compareFrame);
    compareFrame = 0;
  }
  if (compareObserver) {
    compareObserver.disconnect();
    compareObserver = null;
  }
  if (compareThemeObserver) {
    compareThemeObserver.disconnect();
    compareThemeObserver = null;
  }
  document.removeEventListener("keydown", onCompareKey);
  window.removeEventListener("popstate", scheduleCompare);
  const button = document.getElementById(COMPARE_BUTTON_ID);
  if (button) {
    button.remove();
  }
  const dialog = compareDialogHost();
  if (dialog) {
    dialog.remove();
  }
  compareHost = null;
  comparePageOverride = null;
}

function onCompareKey(event) {
  if (event.key === "Escape" && compareDialogHost()) {
    closeCompareDialog();
  }
}

function hookCompareHistory() {
  if (hookCompareHistory.installed) {
    return;
  }
  hookCompareHistory.installed = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedCompareHistory() {
      const result = original.apply(this, arguments);
      scheduleCompare();
      return result;
    };
  }
  window.addEventListener("popstate", scheduleCompare);
}

function watchCompareTheme() {
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-kbq-theme"],
  };
  compareThemeObserver = new MutationObserver(() => compareDialogTheme());
  compareThemeObserver.observe(document.documentElement, options);
  if (document.body) {
    compareThemeObserver.observe(document.body, options);
  }
}

function watchCompareDom() {
  compareObserver = new MutationObserver(() => scheduleCompare());
  compareObserver.observe(document.body, { childList: true, subtree: true });
}

function hideCompareUi() {
  const button = document.getElementById(COMPARE_BUTTON_ID);
  if (button) {
    button.remove();
  }
  if (!compareState.writing) {
    const dialog = compareDialogHost();
    if (dialog) {
      dialog.remove();
    }
    compareHost = null;
    comparePageOverride = null;
  }
}

function applyExperimentalSetting(enabled) {
  compareExperimental = Boolean(enabled);
  if (!compareExperimental) {
    hideCompareUi();
    return;
  }
  scheduleCompare();
}

function readExperimentalSetting() {
  if (typeof pluginSetting !== "function") {
    applyExperimentalSetting(false);
    return;
  }
  pluginSetting("compareRules", "experimental", applyExperimentalSetting);
}

hookCompareHistory();
document.addEventListener("keydown", onCompareKey);
watchCompareDom();
watchCompareTheme();
readExperimentalSetting();
