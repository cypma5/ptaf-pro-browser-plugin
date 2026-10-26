const FILTER_BAR_ID = "ptaf-filter-bar";

const FILTER_GROUPS = [
  { id: "event", en: "Event", ru: "Событие" },
  { id: "request", en: "Request", ru: "Запрос" },
  { id: "response", en: "Response", ru: "Ответ" },
  { id: "client", en: "Client", ru: "Клиент" },
  { id: "app", en: "Application", ru: "Приложение" },
];

const SEVERITY_LABELS = {
  high: { en: "High", ru: "Высокий" },
  medium: { en: "Medium", ru: "Средний" },
  low: { en: "Low", ru: "Низкий" },
  none: { en: "None", ru: "Нет" },
};

const PHASE_LABELS = {
  on_request: { en: "On request", ru: "На запросе" },
  on_response: { en: "On response", ru: "На ответе" },
  on_transaction_complete: { en: "Transaction complete", ru: "Конец транзакции" },
  on_transaction_start: { en: "Transaction start", ru: "Начало транзакции" },
  on_websocket_downstream: { en: "WebSocket from server", ru: "WebSocket от сервера" },
  on_websocket_upstream: { en: "WebSocket to server", ru: "WebSocket к серверу" },
};

const FILTER_FIELDS = [
  { id: "event_severity", group: "event", en: "Severity", ru: "Уровень опасности", valueStyle: "bare", defaultOp: "==", ops: ["==", "!=", "in"], options: ["high", "medium", "low", "none"], optionLabels: SEVERITY_LABELS },
  { id: "rule_id", group: "event", en: "Rule", ru: "Правило", valueStyle: "token", defaultOp: "==", ops: ["==", "!=", "contains", "in"] },
  { id: "rule_phase", group: "event", en: "Phase", ru: "Фаза", valueStyle: "bare", defaultOp: "==", ops: ["==", "!=", "in"], options: Object.keys(PHASE_LABELS), optionLabels: PHASE_LABELS },
  { id: "matched_names", group: "event", en: "Matched name", ru: "Имя совпадения", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains"] },
  { id: "matched_values", group: "event", en: "Matched value", ru: "Значение совпадения", valueStyle: "quote", defaultOp: "~=", ops: ["==", "~="], hint: true },
  { id: "transaction_id", group: "event", en: "Transaction", ru: "Транзакция", valueStyle: "token", defaultOp: "==", ops: ["==", "!="] },
  { id: "request_method", group: "request", en: "Method", ru: "Метод", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "in"], options: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] },
  { id: "request_uri", group: "request", en: "URI", ru: "URI", valueStyle: "quote", defaultOp: "contains", ops: ["==", "!=", "contains", "~=", "in"] },
  { id: "request_path", group: "request", en: "Path", ru: "Путь", valueStyle: "quote", defaultOp: "contains", ops: ["==", "!=", "contains", "~="] },
  { id: "request_size", group: "request", en: "Request size", ru: "Размер запроса", valueStyle: "number", defaultOp: ">=", ops: ["==", "!=", ">", "<", ">=", "<=", "between"] },
  { id: "request_get", group: "request", en: "GET parameter", ru: "GET-параметр", kind: "map", valueStyle: "quote", defaultOp: "==", ops: ["==", "contains"] },
  { id: "request_post", group: "request", en: "POST parameter", ru: "POST-параметр", kind: "map", valueStyle: "quote", defaultOp: "==", ops: ["==", "contains"] },
  { id: "request_headers", group: "request", en: "Request header", ru: "Заголовок запроса", kind: "map", valueStyle: "quote", defaultOp: "contains", ops: ["==", "contains"] },
  { id: "request_cookies", group: "request", en: "Cookie", ru: "Куки", kind: "map", valueStyle: "quote", defaultOp: "==", ops: ["==", "contains"] },
  { id: "raw_request", group: "request", en: "Raw request", ru: "Сырой запрос", kind: "raw", valueStyle: "quote", defaultOp: "contains", ops: ["contains", "~="] },
  { id: "response_status_code", group: "response", en: "Status code", ru: "Код ответа", valueStyle: "number", defaultOp: "==", ops: ["==", "!=", ">", "<", ">=", "<=", "between", "in"] },
  { id: "response_size", group: "response", en: "Response size", ru: "Размер ответа", valueStyle: "number", defaultOp: ">=", ops: ["==", "!=", ">", "<", ">=", "<=", "between"] },
  { id: "response_headers", group: "response", en: "Response header", ru: "Заголовок ответа", kind: "map", valueStyle: "quote", defaultOp: "==", ops: ["==", "contains"] },
  { id: "raw_response", group: "response", en: "Raw response", ru: "Сырой ответ", kind: "raw", valueStyle: "quote", defaultOp: "contains", ops: ["contains", "~="] },
  { id: "client_ip", group: "client", en: "IP address", ru: "IP-адрес", valueStyle: "ip", defaultOp: "==", ops: ["==", "in"] },
  { id: "client_country", group: "client", en: "Country", ru: "Страна", valueStyle: "token", defaultOp: "==", ops: ["==", "!=", "in"] },
  { id: "client_username", group: "client", en: "Username", ru: "Логин", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains", "exists"] },
  { id: "client_browser_name", group: "client", en: "Browser", ru: "Браузер", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains", "in"] },
  { id: "client_browser_version", group: "client", en: "Browser version", ru: "Версия браузера", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains", "~="] },
  { id: "client_os_name", group: "client", en: "Operating system", ru: "ОС", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains"] },
  { id: "app_name", group: "app", en: "Web application", ru: "Веб-приложение", valueStyle: "quote", defaultOp: "==", ops: ["==", "!=", "contains", "in"] },
  { id: "app_id", group: "app", en: "Application id", ru: "Идентификатор приложения", valueStyle: "token", defaultOp: "==", ops: ["==", "!="] },
];

const OP_LABELS = {
  "==": { en: "equals", ru: "равно" },
  "=": { en: "equals, ignore case", ru: "равно без регистра" },
  "!=": { en: "does not equal", ru: "не равно" },
  ">": { en: "greater than", ru: "больше" },
  "<": { en: "less than", ru: "меньше" },
  ">=": { en: "at least", ru: "не меньше" },
  "<=": { en: "at most", ru: "не больше" },
  contains: { en: "contains", ru: "содержит" },
  "~=": { en: "regex", ru: "регулярное выражение" },
  in: { en: "any of", ru: "одно из" },
  between: { en: "between", ru: "диапазон" },
  exists: { en: "is set", ru: "задано" },
};

const COPY = {
  en: {
    filters: "Filters",
    search: "Search URI",
    reset: "Reset",
    add: "Add filter",
    apply: "Apply",
    cancel: "Cancel",
    and: "AND",
    or: "OR",
    not: "Exclude",
    operator: "Operator",
    value: "Value",
    from: "From",
    to: "To",
    key: "Key",
    mode: "Where",
    named: "This key",
    anyKey: "Key name",
    anyValue: "Value",
    hex: "Binary h\"…\"",
    raw: "Expression",
    menuSearch: "Parameter",
    empty: "Enter a value",
    hint: "With a regex, add another condition, such as matched name or URI.",
    failed: "Could not apply the filter.",
    text: "Text filter",
    graph: "Graphical filter",
    suggest: "From microanalysis",
  },
  ru: {
    filters: "Фильтры",
    search: "Поиск по URI",
    reset: "Сбросить",
    add: "Добавить фильтр",
    apply: "Применить",
    cancel: "Отмена",
    and: "И",
    or: "ИЛИ",
    not: "Кроме",
    operator: "Оператор",
    value: "Значение",
    from: "От",
    to: "До",
    key: "Ключ",
    mode: "Где",
    named: "Этот ключ",
    anyKey: "Имя ключа",
    anyValue: "Значение",
    hex: "Бинарные данные h\"…\"",
    raw: "Выражение",
    menuSearch: "Параметр",
    empty: "Укажите значение",
    hint: "Для регулярного выражения добавьте ещё условие, например имя совпадения или URI.",
    failed: "Не удалось применить фильтр.",
    text: "Текстовый фильтр",
    graph: "Графический фильтр",
    suggest: "Из микроанализа",
  },
};

const SYMBOL_OPS = ["<>", "!=", "<=", ">=", "==", "~=", ">", "<", "="];

const MICRO_GROUP = {
  event_severity: ["event_severity"],
  rule_id: ["rule_id", "rule_name"],
  rule_phase: ["rule_phase"],
  request_method: ["request_method"],
  request_uri: ["request_uri"],
  response_status_code: ["response_status_code"],
  client_ip: ["client_ip"],
  client_country: ["client_country"],
  client_username: ["client_username"],
  client_browser_name: ["client_browser_name"],
  client_os_name: ["client_os_name"],
  app_name: ["app_name"],
  transaction_id: ["transaction_id"],
};

let filterBarFrame = 0;
let filterBarObserver = null;
let filterBarStopped = false;
let filterBarEnabled = false;
let filterBarMode = "text";
let filterBarMonaco = null;
let filterBarRequire = null;
let filterBarTheme = null;
let filterBarModel = { join: "and", search: "", pipes: [], raw: "" };
let filterBarCompiled = undefined;
let filterBarSuspend = false;
let filterBarDraft = null;
let filterBarAnchor = null;
let filterBarPipeSeq = 1;
let filterBarSearchTimer = 0;
let filterBarRange = null;
let filterBarRangeHooked = false;
let filterBarRangeWait = null;
let filterBarBridgeReady = null;
let filterBarSuggestSeq = 0;
const filterBarSuggestCache = new Map();

function filterBarAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function unwatchFilterBar() {
  if (filterBarFrame) {
    cancelAnimationFrame(filterBarFrame);
    filterBarFrame = 0;
  }
  if (filterBarObserver) {
    filterBarObserver.disconnect();
    filterBarObserver = null;
  }
  clearTimeout(filterBarSearchTimer);
  document.removeEventListener("click", onFilterBarDocumentClick, true);
  document.removeEventListener("keydown", onFilterBarDocumentKey, true);
  window.removeEventListener("scroll", positionFilterBarPop, true);
  window.removeEventListener("resize", positionFilterBarPop);
  closeFilterPop();
  showNativeFilter();
  const host = document.getElementById(FILTER_BAR_ID);
  if (host) {
    host.remove();
  }
  filterBarTheme = null;
  filterBarCompiled = undefined;
}

function stopFilterBar() {
  if (filterBarStopped) {
    return;
  }
  filterBarStopped = true;
  filterBarEnabled = false;
  unwatchFilterBar();
}

function applyFilterBarSetting(enabled) {
  filterBarEnabled = Boolean(enabled);
  if (filterBarStopped || !filterBarAlive()) {
    return;
  }
  if (!filterBarEnabled) {
    unwatchFilterBar();
    return;
  }
  watchFilterBar();
}

function fieldById(id) {
  return FILTER_FIELDS.find((field) => field.id === id) || null;
}

function filterBarLang() {
  const buttons = document.querySelectorAll("ptaf-events-filter button");
  for (const button of buttons) {
    const text = button.textContent.replace(/\s+/g, " ").trim();
    if (text === "Apply") {
      return "en";
    }
    if (text === "Применить") {
      return "ru";
    }
  }
  return "ru";
}

function filterBarText() {
  return COPY[filterBarLang()] || COPY.ru;
}

function quoteFilter(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatScalar(field, value) {
  const text = String(value).trim();
  if (field.valueStyle === "number" || field.valueStyle === "bare" || field.valueStyle === "ip") {
    return text;
  }
  if (field.valueStyle === "token" && /^[A-Za-z0-9_.:/-]+$/.test(text)) {
    return text;
  }
  return quoteFilter(text);
}

function pipeItems(pipe) {
  if (Array.isArray(pipe.value)) {
    return pipe.value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(pipe.value == null ? "" : pipe.value).trim();
  if (!text) {
    return [];
  }
  if (pipe.op === "in" && text.includes(",")) {
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [text];
}

function targetOf(pipe, field) {
  if (field.kind !== "map") {
    return pipe.param;
  }
  if (pipe.mapMode === "key") {
    return `${pipe.param}.key`;
  }
  if (pipe.mapMode === "value") {
    return `${pipe.param}.value`;
  }
  const key = String(pipe.mapKey || "").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"').toLowerCase();
  return `${pipe.param}["${key}"]`;
}

function compilePipe(pipe) {
  const field = fieldById(pipe.param);
  if (!field) {
    return "";
  }
  if (field.kind === "map" && pipe.mapMode !== "key" && pipe.mapMode !== "value" && !String(pipe.mapKey || "").trim()) {
    return "";
  }
  const target = targetOf(pipe, field);
  if (pipe.op === "exists") {
    return pipe.not ? `not ${target} exists` : `${target} exists`;
  }
  if (pipe.op === "between") {
    const from = String(pipe.value).trim();
    const to = String(pipe.valueTo).trim();
    if (!/^-?\d+$/.test(from) || !/^-?\d+$/.test(to)) {
      return "";
    }
    const body = `${target} between ${from} and ${to}`;
    return pipe.not ? `not ${body}` : body;
  }
  const items = pipeItems(pipe);
  if (!items.length) {
    return "";
  }
  const many = items.length > 1;
  let body = "";
  let negate = Boolean(pipe.not);
  if (pipe.hex && pipe.op === "contains") {
    body = `${target} contains h"${items[0].replace(/"/g, '\\"')}"`;
  } else if (pipe.op === "in" || (many && (pipe.op === "==" || pipe.op === "!="))) {
    if (pipe.op === "!=") {
      negate = true;
    }
    body = field.valueStyle === "ip" && items.length === 1
      ? `${target} in ${items[0]}`
      : `${target} in [${items.map((item) => formatScalar(field, item)).join(", ")}]`;
  } else {
    body = `${target} ${pipe.op} ${formatScalar(field, items[0])}`;
  }
  return negate ? `not ${body}` : body;
}

function compileModel(model) {
  const source = model || { join: "and", search: "", pipes: [], raw: "" };
  const pipes = (source.pipes || []).map(compilePipe).filter(Boolean);
  let clause = "";
  if (pipes.length === 1) {
    clause = pipes[0];
  } else if (pipes.length > 1) {
    const joined = pipes.join(source.join === "or" ? " or " : " and ");
    clause = source.join === "or" ? `(${joined})` : joined;
  }
  const search = String(source.search || "").trim();
  const parts = [];
  if (source.raw) {
    parts.push(`(${source.raw})`);
  }
  if (search) {
    parts.push(`request_uri contains ${quoteFilter(search)}`);
  }
  if (clause) {
    parts.push(source.join === "or" && pipes.length > 1 && parts.length === 0 ? pipes.join(" or ") : clause);
  }
  return parts.join(" and ");
}

function readStringToken(source, start) {
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      value += source[index + 1] || "";
      index += 2;
      continue;
    }
    if (source[index] === '"') {
      return { value, next: index + 1 };
    }
    value += source[index];
    index += 1;
  }
  throw new Error("unterminated string");
}

function tokenizeFilter(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ("()[],".includes(char)) {
      const type = { "(": "(", ")": ")", "[": "lbracket", "]": "rbracket", ",": "comma" }[char];
      tokens.push({ type });
      index += 1;
      continue;
    }
    if ((char === "h" || char === "H") && source[index + 1] === '"') {
      const read = readStringToken(source, index + 1);
      tokens.push({ type: "string", value: read.value, hex: true });
      index = read.next;
      continue;
    }
    if (char === '"') {
      const read = readStringToken(source, index);
      tokens.push({ type: "string", value: read.value, hex: false });
      index = read.next;
      continue;
    }
    const op = SYMBOL_OPS.find((item) => source.startsWith(item, index));
    if (op) {
      tokens.push({ type: "op", value: op });
      index += op.length;
      continue;
    }
    let end = index + 1;
    while (end < source.length && !/\s/.test(source[end]) && !"()[],\"".includes(source[end]) && !SYMBOL_OPS.some((item) => source.startsWith(item, end))) {
      end += 1;
    }
    tokens.push({ type: "word", value: source.slice(index, end) });
    index = end;
  }
  return tokens;
}

function markBetween(tokens) {
  tokens.forEach((token, index) => {
    if (token.type !== "word" || token.value !== "between") {
      return;
    }
    let depth = 0;
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const next = tokens[cursor];
      if (next.type === "(" || next.type === "lbracket") {
        depth += 1;
      } else if (next.type === ")" || next.type === "rbracket") {
        depth -= 1;
      } else if (depth === 0 && next.type === "word" && next.value === "and") {
        next.between = true;
        break;
      }
    }
  });
}

function matchParen(tokens, open, end) {
  let depth = 0;
  for (let index = open; index < end; index += 1) {
    if (tokens[index].type === "(") {
      depth += 1;
    } else if (tokens[index].type === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function readList(tokens, start, end) {
  if (start >= end) {
    return null;
  }
  if (tokens[start].type !== "lbracket") {
    if (tokens[start].type === "string" || tokens[start].type === "word") {
      return { values: [tokens[start].value], next: start + 1 };
    }
    return null;
  }
  const values = [];
  let index = start + 1;
  while (index < end && tokens[index].type !== "rbracket") {
    if (tokens[index].type === "comma") {
      index += 1;
      continue;
    }
    if (tokens[index].type !== "string" && tokens[index].type !== "word") {
      return null;
    }
    values.push(tokens[index].value);
    index += 1;
  }
  if (index >= end || tokens[index].type !== "rbracket") {
    return null;
  }
  return { values, next: index + 1 };
}

function nextPipeId() {
  filterBarPipeSeq += 1;
  return `p${filterBarPipeSeq}`;
}

function parseCondition(tokens, start, end) {
  if (start >= end) {
    return null;
  }
  if (tokens[start].type === "(") {
    const close = matchParen(tokens, start, end);
    if (close !== end - 1) {
      return null;
    }
    const inner = parseJoin(tokens, start + 1, close);
    if (!inner) {
      return null;
    }
    if (inner.conditions.length === 1 && inner.conditions[0].pipe) {
      return inner.conditions[0];
    }
    const pipes = [];
    for (const condition of inner.conditions) {
      if (!condition.pipe) {
        return null;
      }
      pipes.push(condition.pipe);
    }
    return { group: { join: inner.join, pipes } };
  }
  let index = start;
  let not = false;
  if (tokens[index].type === "word" && tokens[index].value === "not") {
    not = true;
    index += 1;
  }
  if (index >= end || tokens[index].type !== "word") {
    return null;
  }
  let param = tokens[index].value;
  let mapMode = "";
  let mapKey = "";
  if (param.endsWith(".key")) {
    mapMode = "key";
    param = param.slice(0, -4);
  } else if (param.endsWith(".value")) {
    mapMode = "value";
    param = param.slice(0, -6);
  }
  index += 1;
  if (index < end && tokens[index].type === "lbracket") {
    if (mapMode || index + 2 >= end || tokens[index + 1].type !== "string" || tokens[index + 2].type !== "rbracket") {
      return null;
    }
    mapMode = "named";
    mapKey = tokens[index + 1].value;
    index += 3;
  }
  const field = fieldById(param);
  if (!field || (mapMode && field.kind !== "map") || (!mapMode && field.kind === "map")) {
    return null;
  }
  if (index >= end) {
    return null;
  }
  const mark = tokens[index];
  let op = "";
  let value = "";
  let valueTo = "";
  let hex = false;
  if (mark.type === "word" && mark.value === "exists") {
    op = "exists";
    index += 1;
  } else if (mark.type === "word" && mark.value === "between") {
    op = "between";
    if (index + 3 >= end || tokens[index + 2].type !== "word" || tokens[index + 2].value !== "and") {
      return null;
    }
    if (!["string", "word"].includes(tokens[index + 1].type) || !["string", "word"].includes(tokens[index + 3].type)) {
      return null;
    }
    value = tokens[index + 1].value;
    valueTo = tokens[index + 3].value;
    index += 4;
  } else if (mark.type === "word" && mark.value === "in") {
    op = "in";
    const list = readList(tokens, index + 1, end);
    if (!list) {
      return null;
    }
    value = list.values;
    index = list.next;
  } else if (mark.type === "word" && (mark.value === "contains" || mark.value === "regex")) {
    op = mark.value === "regex" ? "~=" : "contains";
    if (index + 1 >= end || !["string", "word"].includes(tokens[index + 1].type)) {
      return null;
    }
    value = tokens[index + 1].value;
    hex = Boolean(tokens[index + 1].hex);
    index += 2;
  } else if (mark.type === "op") {
    op = mark.value === "<>" ? "!=" : mark.value;
    if (index + 1 >= end || !["string", "word"].includes(tokens[index + 1].type)) {
      return null;
    }
    value = tokens[index + 1].value;
    index += 2;
  } else {
    return null;
  }
  if (index !== end || (hex && op !== "contains")) {
    return null;
  }
  if (field.options && !Array.isArray(value)) {
    value = [value];
  }
  return {
    pipe: {
      id: nextPipeId(),
      param,
      not,
      op,
      value,
      valueTo,
      mapMode: mapMode || (field.kind === "map" ? "named" : ""),
      mapKey,
      hex,
    },
  };
}

function parseJoin(tokens, start, end) {
  const parts = [];
  let join = "";
  let depth = 0;
  let from = start;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token.type === "(" || token.type === "lbracket") {
      depth += 1;
    } else if (token.type === ")" || token.type === "rbracket") {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
    } else if (depth === 0 && token.type === "word" && (token.value === "and" || token.value === "or") && !token.between) {
      if (join && join !== token.value) {
        return null;
      }
      join = token.value;
      parts.push([from, index]);
      from = index + 1;
    }
  }
  if (depth !== 0) {
    return null;
  }
  parts.push([from, end]);
  const conditions = parts.map(([partStart, partEnd]) => parseCondition(tokens, partStart, partEnd));
  if (conditions.some((condition) => !condition)) {
    return null;
  }
  return { join: join || "and", conditions };
}

function modelFromParsed(source, parsed) {
  const empty = { join: "and", search: "", pipes: [], raw: source };
  if (!parsed) {
    return empty;
  }
  if (parsed.join === "or") {
    if (parsed.conditions.every((condition) => condition.pipe)) {
      return { join: "or", search: "", pipes: parsed.conditions.map((condition) => condition.pipe), raw: "" };
    }
    return empty;
  }
  let search = "";
  const pipes = [];
  let join = "and";
  let grouped = false;
  for (const condition of parsed.conditions) {
    const pipe = condition.pipe;
    if (pipe && pipe.param === "request_uri" && pipe.op === "contains" && !pipe.not && !pipe.hex && !search) {
      search = Array.isArray(pipe.value) ? pipe.value[0] : pipe.value;
      continue;
    }
    if (condition.group) {
      if (pipes.length || grouped) {
        return empty;
      }
      grouped = true;
      join = condition.group.join;
      pipes.push(...condition.group.pipes);
      continue;
    }
    if (pipe) {
      pipes.push(pipe);
      continue;
    }
    return empty;
  }
  return { join, search, pipes, raw: "" };
}

function parseModel(text) {
  const source = String(text || "").replace(/\u00a0/g, " ").trim();
  if (!source) {
    return { join: "and", search: "", pipes: [], raw: "" };
  }
  try {
    const tokens = tokenizeFilter(source);
    markBetween(tokens);
    return modelFromParsed(source, parseJoin(tokens, 0, tokens.length));
  } catch (error) {
    return { join: "and", search: "", pipes: [], raw: source };
  }
}

function filterBarNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function filterBarIcon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ptaf-fb-icon");
  const path = document.createElementNS(ns, "path");
  if (kind === "filter") {
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M2 2.5h12l-4.4 5.1V13l-3.2 1.2V7.6L2 2.5z");
  } else {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    const lines = {
      chevron: "M4 6.2 8 10l4-3.8",
      plus: "M8 3.2v9.6M3.2 8h9.6",
      x: "M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8",
    };
    path.setAttribute("d", lines[kind] || lines.plus);
  }
  svg.append(path);
  return svg;
}

function editorHandler(eventName) {
  const input = document.querySelector("ptaf-filter-input");
  const tasks = input && input[`__zone_symbol__${eventName}false`];
  const task = tasks && tasks[0];
  if (!task || typeof task.callback !== "function") {
    return null;
  }
  const unwrapped = task.callback("__ngUnwrap__");
  if (typeof unwrapped !== "function") {
    return null;
  }
  const handler = unwrapped(Function);
  return typeof handler === "function" ? handler : null;
}

function filterBarMonacoApi() {
  if (filterBarMonaco) {
    return filterBarMonaco;
  }
  const chunk = window.webpackChunkwaf_ui_ng;
  if (!filterBarRequire && chunk && typeof chunk.push === "function") {
    try {
      chunk.push([["ptaf-fb-monaco"], {}, (req) => {
        filterBarRequire = req;
      }]);
    } catch (error) {
      filterBarRequire = null;
    }
  }
  const req = filterBarRequire;
  if (!req) {
    return null;
  }
  const seen = new Set();
  const consider = (exp) => {
    if (exp && exp.editor && typeof exp.editor.getEditors === "function") {
      filterBarMonaco = exp.editor;
      return true;
    }
    return false;
  };
  const cache = req.c || {};
  for (const id of Object.keys(cache)) {
    seen.add(id);
    if (consider(cache[id] && cache[id].exports)) {
      return filterBarMonaco;
    }
  }
  const factories = req.m || {};
  for (const id of Object.keys(factories)) {
    if (seen.has(id) || typeof factories[id] !== "function") {
      continue;
    }
    let source = "";
    try {
      source = Function.prototype.toString.call(factories[id]);
    } catch (error) {
      continue;
    }
    if (source.length > 80000 || !source.includes("getEditors")) {
      continue;
    }
    try {
      if (consider(req(id))) {
        return filterBarMonaco;
      }
    } catch (error) {
      /* the module is not the editor API */
    }
  }
  return null;
}

function filterEditor() {
  const api = filterBarMonacoApi();
  const node = document.querySelector("ptaf-filter-input .monaco-editor");
  if (!api || !node || typeof api.getEditors !== "function") {
    return null;
  }
  return api.getEditors().find((editor) => editor.getDomNode && editor.getDomNode() === node) || null;
}

function pageFilterCommand(op, text) {
  const root = document.documentElement;
  if (!root) {
    return null;
  }
  root.removeAttribute("data-ptaf-filter-result");
  root.setAttribute("data-ptaf-filter-op", op);
  if (op === "write") {
    root.setAttribute("data-ptaf-filter-text", text);
  }
  root.dispatchEvent(new Event("ptaf-filter-command"));
  const result = root.getAttribute("data-ptaf-filter-result");
  const value = root.getAttribute("data-ptaf-filter-text") || "";
  root.removeAttribute("data-ptaf-filter-op");
  root.removeAttribute("data-ptaf-filter-result");
  if (op !== "write") {
    root.removeAttribute("data-ptaf-filter-text");
  }
  if (result == null) {
    return null;
  }
  return { ok: result === "1", text: value };
}

function readEditorText() {
  const page = pageFilterCommand("read");
  if (page && page.ok) {
    return page.text;
  }
  const editor = filterEditor();
  if (editor && typeof editor.getValue === "function") {
    return editor.getValue().replace(/\u00a0/g, " ").replace(/\s*\n\s*/g, " ").trim();
  }
  const lines = document.querySelector("ptaf-filter-input .view-lines");
  if (!lines) {
    return "";
  }
  return lines.innerText.replace(/\u00a0/g, " ").replace(/\s*\n\s*/g, " ").trim();
}

function writeFilter(text) {
  const page = pageFilterCommand("write", text);
  if (page && page.ok) {
    return true;
  }
  const apply = editorHandler("apply");
  const clear = editorHandler("clear");
  const editor = filterEditor();
  if (editor && typeof editor.setValue === "function") {
    if (editor.getValue() !== text) {
      editor.setValue(text);
    }
    if (text === "" && clear) {
      clear();
    } else if (apply) {
      apply();
    }
    return Boolean(apply || (text === "" && clear));
  }
  const change = editorHandler("filterChange");
  if (!change || !apply) {
    return false;
  }
  change(text);
  if (text === "" && clear) {
    clear();
  } else {
    apply();
  }
  return true;
}

function showNativeFilter() {
  const filter = document.querySelector("ptaf-events-filter");
  if (!filter || filter.dataset.ptafFilterHidden !== "1") {
    return;
  }
  filter.style.removeProperty("display");
  delete filter.dataset.ptafFilterHidden;
  const editor = filterEditor();
  if (editor && typeof editor.layout === "function") {
    editor.layout();
  }
}

function hideNativeFilter() {
  const filter = document.querySelector("ptaf-events-filter");
  if (!filter) {
    return;
  }
  filter.dataset.ptafFilterHidden = "1";
  filter.style.setProperty("display", "none", "important");
}

function syncNativeFilter() {
  if (filterBarEnabled && filterBarMode === "graph") {
    hideNativeFilter();
    return;
  }
  showNativeFilter();
}

function applyFilterBarMode(mode) {
  filterBarMode = mode === "graph" ? "graph" : "text";
  if (filterBarTheme) {
    const bar = filterBarTheme.querySelector(".ptaf-fb");
    if (bar) {
      bar.hidden = filterBarMode !== "graph";
    }
    if (filterBarMode !== "graph") {
      closeFilterPop();
    }
  }
  syncNativeFilter();
  if (filterBarMode === "graph") {
    syncFilterBarFromEditor();
  }
  renderFilterBar();
}

function optionLabel(field, value, language) {
  const labels = field.optionLabels && field.optionLabels[value];
  if (labels) {
    return labels[language] || labels.ru || value;
  }
  return value;
}

function chipParts(pipe, language) {
  const copy = COPY[language];
  const field = fieldById(pipe.param);
  const name = field ? field[language] || field.ru : pipe.param;
  if (pipe.op === "exists") {
    return { name, op: pipe.not ? copy.not : "", value: OP_LABELS.exists[language] };
  }
  if (pipe.op === "between") {
    return { name, op: pipe.not ? copy.not : "–", value: `${pipe.value} – ${pipe.valueTo}` };
  }
  const items = pipeItems(pipe);
  const shown = items.map((item) => (field && field.options ? optionLabel(field, item, language) : item)).join(", ");
  let prefix = "";
  if (field && field.kind === "map") {
    if (pipe.mapMode === "key") {
      prefix = `${copy.anyKey} `;
    } else if (pipe.mapMode === "value") {
      prefix = `${copy.anyValue} `;
    } else if (pipe.mapKey) {
      prefix = `${pipe.mapKey} `;
    }
  }
  const mark = pipe.op === "!=" || (pipe.not && pipe.op === "in") ? "≠" : (OP_LABELS[pipe.op] ? pipe.op : "");
  const op = pipe.not && pipe.op !== "!=" && pipe.op !== "in" ? copy.not : mark;
  return { name, op, value: `${prefix}${shown}`.trim() };
}

function closeFilterPop() {
  filterBarDraft = null;
  filterBarAnchor = null;
  if (!filterBarTheme) {
    return;
  }
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  if (pop) {
    pop.hidden = true;
    pop.replaceChildren();
  }
  const menu = filterBarTheme.querySelector(".ptaf-fb-menu");
  const add = filterBarTheme.querySelector(".ptaf-fb-add");
  if (menu) {
    menu.setAttribute("aria-expanded", "false");
  }
  if (add) {
    add.setAttribute("aria-expanded", "false");
  }
}

function positionFilterBarPop() {
  if (!filterBarTheme || !filterBarAnchor || !filterBarAnchor.isConnected) {
    return;
  }
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  if (!pop || pop.hidden) {
    return;
  }
  const rect = filterBarAnchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow > height + 12 || spaceBelow >= rect.top ? rect.bottom + 4 : Math.max(8, rect.top - height - 4);
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function openFilterPop(anchor) {
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  pop.hidden = false;
  filterBarAnchor = anchor;
  positionFilterBarPop();
}

function draftError(draft, field) {
  if (field.kind === "map" && draft.mapMode !== "key" && draft.mapMode !== "value" && !String(draft.mapKey || "").trim()) {
    return true;
  }
  if (draft.op === "exists") {
    return false;
  }
  if (draft.op === "between") {
    return !/^-?\d+$/.test(String(draft.value).trim()) || !/^-?\d+$/.test(String(draft.valueTo).trim());
  }
  if (field.valueStyle === "number" && draft.op !== "in") {
    return !/^-?\d+$/.test(String(Array.isArray(draft.value) ? draft.value[0] : draft.value).trim());
  }
  return pipeItems(draft).length === 0;
}

function onFilterRangeMessage(event) {
  const data = event.data;
  if (!data || data.source !== "ptaf-filter-bar" || !data.timerange || data.timerange.start == null) {
    return;
  }
  const start = Number(data.timerange.start);
  if (!Number.isFinite(start)) {
    return;
  }
  const next = { start };
  if (data.timerange.end != null && Number.isFinite(Number(data.timerange.end))) {
    next.end = Number(data.timerange.end);
  }
  const prev = filterBarRange;
  if (prev && prev.start === next.start && prev.end === next.end) {
    return;
  }
  filterBarRange = next;
  filterBarSuggestCache.clear();
}

function installFilterRangeBridge() {
  if (filterBarBridgeReady) {
    return filterBarBridgeReady;
  }
  filterBarRangeHooked = true;
  window.addEventListener("message", onFilterRangeMessage);
  filterBarBridgeReady = new Promise((resolve) => {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("content/filter-bar-page.js");
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => resolve();
      (document.documentElement || document.head).append(script);
    } catch (error) {
      resolve();
    }
  });
  return filterBarBridgeReady;
}

function productRefreshButton() {
  const root = document.querySelector("ptaf-events");
  if (!root) {
    return null;
  }
  return [...root.querySelectorAll("button")].find((button) => {
    const text = button.textContent.replace(/\s+/g, " ").trim();
    return text === "Refresh" || text === "Обновить";
  }) || null;
}

function requestProductRefresh() {
  const button = productRefreshButton();
  const tasks = button && button.__zone_symbol__clickfalse;
  const task = tasks && tasks[0];
  if (!task || typeof task.callback !== "function") {
    return false;
  }
  const unwrapped = task.callback("__ngUnwrap__");
  if (typeof unwrapped !== "function") {
    return false;
  }
  const handler = unwrapped(Function);
  if (typeof handler !== "function") {
    return false;
  }
  handler();
  return true;
}

function ensureFilterRange() {
  if (filterBarRange) {
    return Promise.resolve(filterBarRange);
  }
  if (filterBarRangeWait) {
    return filterBarRangeWait;
  }
  filterBarRangeWait = (async () => {
    await installFilterRangeBridge();
    if (!filterBarRange) {
      requestProductRefresh();
    }
    const started = Date.now();
    while (!filterBarRange && Date.now() - started < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    filterBarRangeWait = null;
    return filterBarRange || { start: Date.now() / 1000 - 15 * 60 };
  })();
  return filterBarRangeWait;
}

function formatCount(count) {
  const language = filterBarLang() === "en" ? "en" : "ru";
  try {
    return new Intl.NumberFormat(language).format(count);
  } catch (error) {
    return String(count);
  }
}

function suggestKey(fieldId, filter, timerange) {
  return JSON.stringify([fieldId, filter, timerange.start, timerange.end || ""]);
}

async function loadSuggestions(field) {
  const groupby = MICRO_GROUP[field.id];
  if (!groupby || typeof api !== "function") {
    return [];
  }
  const filter = readEditorText();
  const timerange = await ensureFilterRange();
  const key = suggestKey(field.id, filter, timerange);
  if (filterBarSuggestCache.has(key)) {
    return filterBarSuggestCache.get(key);
  }
  const body = await api("/threats/events/count_query", {
    method: "POST",
    body: {
      filter,
      timerange,
      groupby,
      page: { offset: 0, length: 5 },
    },
  });
  const items = ((body && body.items) || []).map((item) => {
    const group = item.group || {};
    const raw = group[groupby[0]];
    if (raw == null || String(raw).trim() === "") {
      return null;
    }
    const value = String(raw);
    let label = value;
    if (field.id === "rule_id" && group.rule_name) {
      label = String(group.rule_name);
    } else if (field.optionLabels) {
      label = optionLabel(field, value, filterBarLang());
    }
    return { value, label, count: Number(item.count) || 0 };
  }).filter(Boolean);
  if (items.length) {
    filterBarSuggestCache.set(key, items);
  }
  if (filterBarSuggestCache.size > 40) {
    const oldest = filterBarSuggestCache.keys().next().value;
    filterBarSuggestCache.delete(oldest);
  }
  return items;
}

function selectSuggestion(draft, field, value) {
  if (field.options) {
    const next = new Set(pipeItems(draft));
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    const ordered = field.options.filter((item) => next.has(item));
    next.forEach((item) => {
      if (!ordered.includes(item)) {
        ordered.push(item);
      }
    });
    draft.value = ordered;
    if (ordered.length > 1 && (draft.op === "==" || draft.op === "!=") && field.ops.includes("in")) {
      draft.op = draft.op === "!=" ? "!=" : "in";
    } else if (ordered.length <= 1 && draft.op === "in") {
      draft.op = "==";
    }
    return;
  }
  if (draft.op === "in") {
    const next = new Set(pipeItems(draft));
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    draft.value = [...next].join(", ");
    return;
  }
  draft.value = String(draft.value) === value ? "" : value;
}

function renderSuggestions(anchor, field, draft, items) {
  const pop = filterBarTheme && filterBarTheme.querySelector(".ptaf-fb-pop");
  const slot = pop && pop.querySelector(".ptaf-fb-suggest");
  if (!slot) {
    return;
  }
  slot.replaceChildren();
  if (!items.length) {
    slot.hidden = true;
    return;
  }
  slot.hidden = false;
  slot.append(filterBarNode("div", "ptaf-fb-label", filterBarText().suggest));
  const selected = new Set(pipeItems(draft));
  items.forEach((item) => {
    const button = filterBarNode("button", "ptaf-fb-suggest-item");
    button.type = "button";
    button.title = item.label;
    button.classList.toggle("is-on", selected.has(item.value));
    const label = filterBarNode("span", "ptaf-fb-suggest-label", item.label);
    const count = filterBarNode("span", "ptaf-fb-suggest-count", formatCount(item.count));
    button.append(label, count);
    button.addEventListener("click", () => {
      selectSuggestion(draft, field, item.value);
      draft.suggestions = items;
      fillPipePop(anchor);
    });
    slot.append(button);
  });
  positionFilterBarPop();
}

function attachSuggestions(anchor, field, draft) {
  if (!MICRO_GROUP[field.id] || draft.op === "exists" || draft.op === "between" || draft.op === "~=") {
    return;
  }
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  const slot = filterBarNode("div", "ptaf-fb-suggest");
  slot.hidden = false;
  slot.append(filterBarNode("div", "ptaf-fb-label", filterBarText().suggest));
  const valueSlot = pop.querySelector(".ptaf-fb-value");
  if (valueSlot) {
    valueSlot.after(slot);
  } else {
    pop.append(slot);
  }
  if (draft.suggestions) {
    renderSuggestions(anchor, field, draft, draft.suggestions);
  }
  const seq = ++filterBarSuggestSeq;
  loadSuggestions(field).then((items) => {
    if (seq !== filterBarSuggestSeq || !slot.isConnected) {
      return;
    }
    draft.suggestions = items;
    const choices = field.options || [];
    const extra = items.some((item) => !choices.includes(item.value));
    if (extra && field.options && !(draft.suggestionsRendered)) {
      draft.suggestionsRendered = true;
      fillPipePop(anchor);
      return;
    }
    renderSuggestions(anchor, field, draft, items);
  }).catch(() => {
    /* the value can still be typed by hand */
  });
}

function fillPipePop(anchor) {
  const language = filterBarLang();
  const copy = COPY[language];
  const draft = filterBarDraft;
  const field = fieldById(draft.param);
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  pop.replaceChildren();
  pop.append(filterBarNode("div", "ptaf-fb-pop-title", field[language] || field.ru));

  if (field.kind === "map") {
    const mode = filterBarNode("label", "ptaf-fb-field");
    mode.append(filterBarNode("span", "ptaf-fb-label", copy.mode));
    const select = filterBarNode("select", "ptaf-fb-select");
    [["named", copy.named], ["key", copy.anyKey], ["value", copy.anyValue]].forEach(([value, label]) => {
      const option = filterBarNode("option", "", label);
      option.value = value;
      select.append(option);
    });
    select.value = draft.mapMode || "named";
    select.addEventListener("change", () => {
      draft.mapMode = select.value;
      fillPipePop(anchor);
    });
    mode.append(select);
    pop.append(mode);
    if ((draft.mapMode || "named") === "named") {
      const key = filterBarNode("label", "ptaf-fb-field");
      key.append(filterBarNode("span", "ptaf-fb-label", copy.key));
      const input = filterBarNode("input", "ptaf-fb-input");
      input.value = draft.mapKey || "";
      input.addEventListener("input", () => {
        draft.mapKey = input.value;
      });
      key.append(input);
      pop.append(key);
    }
  }

  const operator = filterBarNode("label", "ptaf-fb-field");
  operator.append(filterBarNode("span", "ptaf-fb-label", copy.operator));
  const opSelect = filterBarNode("select", "ptaf-fb-select");
  field.ops.forEach((op) => {
    const option = filterBarNode("option", "", `${op}  ${OP_LABELS[op][language]}`);
    option.value = op;
    opSelect.append(option);
  });
  if (!field.ops.includes(draft.op)) {
    draft.op = field.defaultOp;
  }
  opSelect.value = draft.op;
  opSelect.addEventListener("change", () => {
    draft.op = opSelect.value;
    fillPipePop(anchor);
  });
  operator.append(opSelect);
  pop.append(operator);

  const valueSlot = filterBarNode("div", "ptaf-fb-value");
  if (field.options && draft.op !== "between" && draft.op !== "exists") {
    const checks = filterBarNode("div", "ptaf-fb-checks");
    const selected = new Set(pipeItems(draft));
    const choiceValues = field.options.slice();
    pipeItems(draft).concat((draft.suggestions || []).map((item) => item.value)).forEach((value) => {
      if (value && !choiceValues.includes(value)) {
        choiceValues.push(value);
      }
    });
    choiceValues.forEach((value) => {
      const label = filterBarNode("label", "ptaf-fb-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(value);
      input.addEventListener("change", () => {
        const next = new Set(pipeItems(draft));
        if (input.checked) {
          next.add(value);
        } else {
          next.delete(value);
        }
        draft.value = choiceValues.filter((item) => next.has(item));
        if (draft.value.length > 1 && (draft.op === "==" || draft.op === "!=")) {
          draft.op = draft.op === "!=" ? "!=" : "in";
          if (draft.op === "in" && field.ops.includes("in")) {
            opSelect.value = "in";
          }
        } else if (draft.value.length <= 1 && draft.op === "in") {
          draft.op = "==";
          opSelect.value = "==";
        }
      });
      label.append(input, filterBarNode("span", "", optionLabel(field, value, language)));
      checks.append(label);
    });
    valueSlot.append(checks);
  } else if (draft.op === "between") {
    const row = filterBarNode("div", "ptaf-fb-between");
    [ ["value", copy.from], ["valueTo", copy.to] ].forEach(([key, label]) => {
      const fieldWrap = filterBarNode("label", "ptaf-fb-field");
      fieldWrap.append(filterBarNode("span", "ptaf-fb-label", label));
      const input = filterBarNode("input", "ptaf-fb-input");
      input.inputMode = "numeric";
      input.value = draft[key] || "";
      input.addEventListener("input", () => {
        draft[key] = input.value;
      });
      fieldWrap.append(input);
      row.append(fieldWrap);
    });
    valueSlot.append(row);
  } else if (draft.op !== "exists") {
    const fieldWrap = filterBarNode("label", "ptaf-fb-field");
    fieldWrap.append(filterBarNode("span", "ptaf-fb-label", copy.value));
    const input = filterBarNode("input", "ptaf-fb-input");
    input.value = Array.isArray(draft.value) ? draft.value.join(", ") : (draft.value || "");
    if (draft.op === "in") {
      input.placeholder = "a, b";
    }
    input.addEventListener("input", () => {
      draft.value = input.value;
    });
    fieldWrap.append(input);
    valueSlot.append(fieldWrap);
    if (field.kind === "raw" && draft.op === "contains") {
      const hex = filterBarNode("label", "ptaf-fb-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(draft.hex);
      checkbox.addEventListener("change", () => {
        draft.hex = checkbox.checked;
      });
      hex.append(checkbox, filterBarNode("span", "", copy.hex));
      valueSlot.append(hex);
    }
  }
  pop.append(valueSlot);
  attachSuggestions(anchor, field, draft);

  if (field.hint && draft.op === "~=") {
    pop.append(filterBarNode("p", "ptaf-fb-hint", copy.hint));
  }
  const exclude = filterBarNode("label", "ptaf-fb-check");
  const notBox = document.createElement("input");
  notBox.type = "checkbox";
  notBox.checked = Boolean(draft.not);
  notBox.addEventListener("change", () => {
    draft.not = notBox.checked;
  });
  exclude.append(notBox, filterBarNode("span", "", copy.not));
  pop.append(exclude);
  const error = filterBarNode("p", "ptaf-fb-error");
  error.hidden = true;
  pop.append(error);
  const actions = filterBarNode("div", "ptaf-fb-actions");
  const cancel = filterBarNode("button", "ptaf-bulk-cancel", copy.cancel);
  cancel.type = "button";
  cancel.addEventListener("click", () => closeFilterPop());
  const apply = filterBarNode("button", "ptaf-bulk-submit", copy.apply);
  apply.type = "button";
  apply.addEventListener("click", () => {
    if (draftError(draft, field)) {
      error.hidden = false;
      error.textContent = copy.empty;
      return;
    }
    const pipe = {
      id: draft.id || nextPipeId(),
      param: draft.param,
      not: Boolean(draft.not),
      op: draft.op,
      value: Array.isArray(draft.value) ? draft.value.slice() : draft.value,
      valueTo: draft.valueTo || "",
      mapMode: draft.mapMode || "named",
      mapKey: draft.mapKey || "",
      hex: Boolean(draft.hex),
    };
    if (pipe.op === "in" && !Array.isArray(pipe.value)) {
      pipe.value = String(pipe.value).split(",").map((item) => item.trim()).filter(Boolean);
    }
    const index = filterBarModel.pipes.findIndex((item) => item.id === pipe.id);
    if (index >= 0) {
      filterBarModel.pipes[index] = pipe;
    } else {
      filterBarModel.pipes.push(pipe);
    }
    closeFilterPop();
    commitFilterBar();
  });
  actions.append(cancel, apply);
  pop.append(actions);
  openFilterPop(anchor);
  const focusTarget = pop.querySelector("input, select");
  if (focusTarget) {
    focusTarget.focus();
  }
}

function openPipeEditor(pipe, anchor) {
  filterBarDraft = {
    id: pipe ? pipe.id : null,
    param: pipe ? pipe.param : "",
    not: pipe ? pipe.not : false,
    op: pipe ? pipe.op : "==",
    value: pipe && Array.isArray(pipe.value) ? pipe.value.slice() : (pipe ? pipe.value : ""),
    valueTo: pipe ? pipe.valueTo || "" : "",
    mapMode: pipe && pipe.mapMode ? pipe.mapMode : "named",
    mapKey: pipe ? pipe.mapKey || "" : "",
    hex: pipe ? Boolean(pipe.hex) : false,
  };
  fillPipePop(anchor);
}

function fillFilterMenu(anchor) {
  const language = filterBarLang();
  const copy = COPY[language];
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  pop.replaceChildren();
  const search = filterBarNode("input", "ptaf-fb-input ptaf-fb-menu-search");
  search.placeholder = copy.menuSearch;
  search.addEventListener("input", () => paintMenu(search.value));
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const first = pop.querySelector(".ptaf-fb-option");
    if (first) {
      event.preventDefault();
      first.click();
    }
  });
  pop.append(search);
  const list = filterBarNode("div", "ptaf-fb-menu-list");
  pop.append(list);
  const paintMenu = (query) => {
    const needle = String(query || "").trim().toLowerCase();
    list.replaceChildren();
    FILTER_GROUPS.forEach((group) => {
      const fields = FILTER_FIELDS.filter((field) => field.group === group.id && (!needle || field[language].toLowerCase().includes(needle) || field.id.includes(needle)));
      if (!fields.length) {
        return;
      }
      list.append(filterBarNode("div", "ptaf-fb-group", group[language]));
      fields.forEach((field) => {
        const button = filterBarNode("button", "ptaf-fb-option", field[language]);
        button.type = "button";
        button.addEventListener("click", () => {
          filterBarDraft = {
            id: null,
            param: field.id,
            not: false,
            op: field.defaultOp,
            value: field.options ? [] : "",
            valueTo: "",
            mapMode: "named",
            mapKey: "",
            hex: false,
          };
          fillPipePop(anchor);
        });
        list.append(button);
      });
    });
  };
  paintMenu("");
  anchor.setAttribute("aria-expanded", "true");
  openFilterPop(anchor);
  search.focus();
}

function renderFilterBar() {
  if (!filterBarTheme) {
    return;
  }
  const language = filterBarLang();
  const copy = COPY[language];
  filterBarTheme.querySelectorAll(".ptaf-fb-switch button").forEach((button) => {
    const on = button.dataset.mode === filterBarMode;
    button.textContent = button.dataset.mode === "graph" ? copy.graph : copy.text;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const menu = filterBarTheme.querySelector(".ptaf-fb-menu-label");
  const search = filterBarTheme.querySelector(".ptaf-fb-search");
  const pipes = filterBarTheme.querySelector(".ptaf-fb-pipes");
  const reset = filterBarTheme.querySelector(".ptaf-fb-reset");
  const join = filterBarTheme.querySelector(".ptaf-fb-join");
  const add = filterBarTheme.querySelector(".ptaf-fb-add");
  if (menu) {
    menu.textContent = copy.filters;
  }
  if (search) {
    search.placeholder = copy.search;
    if (filterBarTheme.getRootNode().activeElement !== search) {
      search.value = filterBarModel.search;
    }
  }
  if (add) {
    add.title = copy.add;
    add.setAttribute("aria-label", copy.add);
  }
  if (reset) {
    reset.textContent = copy.reset;
    reset.hidden = !filterBarModel.search && !filterBarModel.raw && filterBarModel.pipes.length === 0;
  }
  if (join) {
    join.hidden = filterBarModel.pipes.length < 2;
    join.querySelectorAll("button").forEach((button) => {
      button.textContent = button.dataset.join === "or" ? copy.or : copy.and;
      button.classList.toggle("is-on", button.dataset.join === filterBarModel.join);
    });
  }
  if (!pipes) {
    return;
  }
  pipes.replaceChildren();
  if (filterBarModel.raw) {
    pipes.append(renderRawChip(copy));
  }
  filterBarModel.pipes.forEach((pipe) => pipes.append(renderPipeChip(pipe, language)));
}

function renderRawChip(copy) {
  const chip = filterBarNode("span", "ptaf-fb-chip");
  chip.append(filterBarNode("span", "ptaf-fb-chip-name", copy.raw));
  const value = filterBarNode("span", "ptaf-fb-chip-value", filterBarModel.raw);
  value.title = filterBarModel.raw;
  chip.append(value);
  chip.append(removeChipButton(() => {
    filterBarModel.raw = "";
    commitFilterBar();
  }));
  return chip;
}

function renderPipeChip(pipe, language) {
  const parts = chipParts(pipe, language);
  const chip = filterBarNode("button", "ptaf-fb-chip");
  chip.type = "button";
  chip.append(filterBarNode("span", "ptaf-fb-chip-name", parts.name));
  if (parts.op) {
    chip.append(filterBarNode("span", "ptaf-fb-chip-op", parts.op));
  }
  if (parts.value) {
    const value = filterBarNode("span", "ptaf-fb-chip-value", parts.value);
    value.title = parts.value;
    chip.append(value);
  }
  chip.addEventListener("click", (event) => {
    if (event.target.closest && event.target.closest(".ptaf-fb-chip-x")) {
      return;
    }
    openPipeEditor(pipe, chip);
  });
  chip.append(removeChipButton(() => {
    filterBarModel.pipes = filterBarModel.pipes.filter((item) => item.id !== pipe.id);
    commitFilterBar();
  }));
  return chip;
}

function removeChipButton(onClick) {
  const button = filterBarNode("span", "ptaf-fb-chip-x");
  button.tabIndex = 0;
  button.setAttribute("role", "button");
  button.append(filterBarIcon("x"));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  });
  return button;
}

function commitFilterBar() {
  const text = compileModel(filterBarModel);
  filterBarCompiled = text;
  filterBarSuspend = true;
  const wrote = text === readEditorText() || writeFilter(text);
  renderFilterBar();
  setTimeout(() => {
    filterBarSuspend = false;
  }, 400);
  if (!wrote && typeof showToast === "function") {
    showToast(filterBarText().failed);
  }
}

function syncFilterBarFromEditor() {
  if (!filterBarTheme || filterBarSuspend) {
    return;
  }
  const text = readEditorText();
  if (text === filterBarCompiled) {
    return;
  }
  filterBarModel = parseModel(text);
  filterBarCompiled = text;
  closeFilterPop();
  renderFilterBar();
}

function buildFilterBar() {
  const switcher = filterBarNode("div", "ptaf-fb-switch");
  switcher.setAttribute("role", "group");
  ["text", "graph"].forEach((mode) => {
    const button = filterBarNode("button", "");
    button.type = "button";
    button.dataset.mode = mode;
    button.addEventListener("click", () => {
      if (button.dataset.mode === filterBarMode) {
        return;
      }
      const next = button.dataset.mode === "graph" ? "graph" : "text";
      applyFilterBarMode(next);
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ filterBarMode: next });
      }
    });
    switcher.append(button);
  });
  const bar = filterBarNode("div", "ptaf-fb");
  bar.hidden = filterBarMode !== "graph";
  const menu = filterBarNode("button", "ptaf-fb-menu");
  menu.type = "button";
  menu.setAttribute("aria-expanded", "false");
  menu.append(filterBarIcon("filter"), filterBarNode("span", "ptaf-fb-menu-label", ""), filterBarIcon("chevron"));
  menu.addEventListener("click", () => fillFilterMenu(menu));
  const search = filterBarNode("input", "ptaf-fb-search");
  search.type = "search";
  search.autocomplete = "off";
  search.spellcheck = false;
  const queueSearch = (immediate) => {
    clearTimeout(filterBarSearchTimer);
    const run = () => {
      const next = search.value;
      const trimmed = next.trim();
      if (!immediate && trimmed.length > 0 && trimmed.length < 3) {
        return;
      }
      if (next === filterBarModel.search) {
        return;
      }
      filterBarModel.search = next;
      commitFilterBar();
    };
    if (immediate) {
      run();
    } else {
      filterBarSearchTimer = setTimeout(run, 200);
    }
  };
  search.addEventListener("input", () => queueSearch(false));
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      queueSearch(true);
    }
  });
  search.addEventListener("blur", () => queueSearch(true));
  const join = filterBarNode("div", "ptaf-fb-join");
  join.hidden = true;
  ["and", "or"].forEach((value) => {
    const button = filterBarNode("button", "");
    button.type = "button";
    button.dataset.join = value;
    button.addEventListener("click", () => {
      filterBarModel.join = value;
      commitFilterBar();
    });
    join.append(button);
  });
  const pipes = filterBarNode("div", "ptaf-fb-pipes");
  const add = filterBarNode("button", "ptaf-fb-add");
  add.type = "button";
  add.setAttribute("aria-expanded", "false");
  add.append(filterBarIcon("plus"));
  add.addEventListener("click", () => fillFilterMenu(add));
  const reset = filterBarNode("button", "ptaf-fb-reset");
  reset.type = "button";
  reset.hidden = true;
  reset.addEventListener("click", () => {
    filterBarModel = { join: "and", search: "", pipes: [], raw: "" };
    closeFilterPop();
    commitFilterBar();
  });
  bar.append(menu, filterBarNode("span", "ptaf-fb-divider"), search, join, pipes, add, reset);
  const pop = filterBarNode("div", "ptaf-fb-pop");
  pop.hidden = true;
  const stack = filterBarNode("div", "ptaf-fb-stack");
  stack.append(switcher, bar);
  filterBarTheme.append(stack, pop);
  renderFilterBar();
  syncNativeFilter();
}

function ensureFilterBar(filter) {
  const filters = filter.parentElement;
  const events = filters && filters.parentElement;
  if (!events) {
    return;
  }
  let host = document.getElementById(FILTER_BAR_ID);
  if (host && !host.isConnected) {
    host = null;
  }
  if (!host) {
    host = document.createElement("div");
    host.id = FILTER_BAR_ID;
    host.style.cssText = "display:block;box-sizing:border-box;margin:8px 16px 0;";
    const theme = attachUi(host);
    if (!theme) {
      return;
    }
    theme.style.height = "auto";
    filterBarTheme = theme;
    filterBarCompiled = undefined;
    buildFilterBar();
  }
  if (host.previousElementSibling !== filters) {
    filters.insertAdjacentElement("afterend", host);
  }
}

function tickFilterBar() {
  filterBarFrame = 0;
  if (filterBarStopped || !filterBarEnabled) {
    return;
  }
  if (!filterBarAlive()) {
    stopFilterBar();
    return;
  }
  const filter = document.querySelector("ptaf-events-filter");
  if (!filter) {
    if (document.getElementById(FILTER_BAR_ID)) {
      document.getElementById(FILTER_BAR_ID).remove();
      filterBarTheme = null;
      filterBarCompiled = undefined;
    }
    return;
  }
  ensureFilterBar(filter);
  syncNativeFilter();
  syncFilterBarFromEditor();
}

function scheduleFilterBar() {
  if (filterBarStopped || !filterBarEnabled || filterBarFrame) {
    return;
  }
  filterBarFrame = requestAnimationFrame(tickFilterBar);
}

function watchFilterBar() {
  if (filterBarStopped || !filterBarEnabled || !document.body || !filterBarAlive()) {
    return;
  }
  installFilterRangeBridge();
  if (!filterBarObserver) {
    document.addEventListener("click", onFilterBarDocumentClick, true);
    document.addEventListener("keydown", onFilterBarDocumentKey, true);
    window.addEventListener("scroll", positionFilterBarPop, true);
    window.addEventListener("resize", positionFilterBarPop);
    filterBarObserver = new MutationObserver(() => scheduleFilterBar());
    filterBarObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  scheduleFilterBar();
}

function onFilterBarDocumentClick(event) {
  if (!filterBarTheme) {
    return;
  }
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  if (!pop || pop.hidden) {
    return;
  }
  const path = event.composedPath ? event.composedPath() : [];
  const host = document.getElementById(FILTER_BAR_ID);
  if (host && path.includes(host)) {
    return;
  }
  closeFilterPop();
}

function onFilterBarDocumentKey(event) {
  if (event.key !== "Escape" || !filterBarTheme) {
    return;
  }
  const pop = filterBarTheme.querySelector(".ptaf-fb-pop");
  if (!pop || pop.hidden) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  closeFilterPop();
}

function bootFilterBar() {
  if (!document.body || !filterBarAlive() || !chrome.storage || !chrome.storage.local) {
    return;
  }
  chrome.storage.local.get({ filterBar: false, filterBarMode: "text" }, (items) => {
    filterBarMode = items && items.filterBarMode === "graph" ? "graph" : "text";
    applyFilterBarSetting(items && items.filterBar);
  });
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      if (changes.filterBarMode) {
        applyFilterBarMode(changes.filterBarMode.newValue);
      }
      if (changes.filterBar) {
        applyFilterBarSetting(changes.filterBar.newValue);
      }
    });
  }
}

if (typeof document !== "undefined") {
  bootFilterBar();
} else if (typeof module !== "undefined" && module.exports) {
  module.exports = { compileModel, parseModel, quoteFilter };
}
