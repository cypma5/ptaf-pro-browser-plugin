const RULE_BUILDER_ID = "ptaf-rule-builder";

const RB_SCALARS = {
  CLIENT_BROWSER_NAME: { type: "string", ru: "Браузер", en: "Browser" },
  CLIENT_BROWSER_VERSION: { type: "string", ru: "Версия браузера", en: "Browser version" },
  CLIENT_CITY: { type: "string", ru: "Город", en: "City" },
  CLIENT_COUNTRY: { type: "string", ru: "Страна", en: "Country" },
  CLIENT_IP: { type: "ip", ru: "IP клиента", en: "Client IP" },
  CLIENT_OS_NAME: { type: "string", ru: "ОС", en: "OS" },
  CLIENT_PROTO: { type: "string", ru: "Протокол", en: "Protocol" },
  CLIENT_REGION: { type: "string", ru: "Регион", en: "Region" },
  REQUEST_BODY: { type: "string", ru: "Тело запроса", en: "Request body" },
  REQUEST_HTTP_VERSION: { type: "string", ru: "Версия HTTP", en: "HTTP version" },
  REQUEST_METHOD: { type: "string", ru: "Метод", en: "Method" },
  REQUEST_PATH: { type: "string", ru: "Путь", en: "Path" },
  REQUEST_QUERY: { type: "string", ru: "Query", en: "Query" },
  REQUEST_SIZE: { type: "int", ru: "Размер запроса", en: "Request size" },
  REQUEST_URI: { type: "string", ru: "URI", en: "URI" },
  RESPONSE_BODY: { type: "string", ru: "Тело ответа", en: "Response body" },
  RESPONSE_SIZE: { type: "int", ru: "Размер ответа", en: "Response size" },
  RESPONSE_STATUS_CODE: { type: "int", ru: "Код ответа", en: "Status code" },
};

const RB_DICTS = {
  REQUEST_COOKIES: { ru: "Cookie", en: "Cookies" },
  REQUEST_GET: { ru: "GET-параметр", en: "GET parameter" },
  REQUEST_HEADERS: { ru: "Заголовок запроса", en: "Request header" },
  REQUEST_POST: { ru: "POST-параметр", en: "POST parameter" },
  RESPONSE_HEADERS: { ru: "Заголовок ответа", en: "Response header" },
  REQUEST_FILES: { ru: "Файл", en: "Uploaded file" },
};

const RB_MAPS = [
  "lowercase",
  "uppercase",
  "url_decode",
  "base64_decode",
  "hex_decode",
  "html_entity_decode",
  "length",
];

const RB_EXTRACTS = ["values", "keys", "filenames", "keys, values"];

const RB_OPS_STRING = ["matches", "matches_re", "==", "!=", "in", "contains", "is_empty", "is_set"];
const RB_OPS_INT = [">", "<", ">=", "<=", "==", "!=", "in", "between"];
const RB_OPS_IP = ["==", "!=", "in"];
const RB_OPS_DICT = ["matches", "matches_re", "==", "!=", "in", "contains", "exists", "is_empty", "is_set"];
const RB_OPS_UNARY = new Set(["exists", "is_empty", "is_set"]);

const RB_OP_LABELS = {
  ru: {
    matches: "соответствует",
    matches_re: "регулярное выражение",
    "==": "равно",
    "!=": "не равно",
    in: "входит в",
    contains: "содержит",
    between: "между",
    exists: "существует",
    is_empty: "пусто",
    is_set: "задано",
    ">": "больше",
    "<": "меньше",
    ">=": "≥",
    "<=": "≤",
  },
  en: {
    matches: "matches",
    matches_re: "regex",
    "==": "equals",
    "!=": "not equals",
    in: "in",
    contains: "contains",
    between: "between",
    exists: "exists",
    is_empty: "is empty",
    is_set: "is set",
    ">": ">",
    "<": "<",
    ">=": "≥",
    "<=": "≤",
  },
};

const RB_COPY = {
  ru: {
    text: "Текст",
    graph: "Графика",
    logic: "Логика проверки",
    legendVar: "variable",
    legendKey: "select",
    legendOp: "operator",
    legendValue: "argument",
    addRule: "+ Правило",
    addGroup: "+ Вложенная группа",
    andAll: "И (все)",
    orAny: "ИЛИ (любое)",
    group: "Группа",
    level: "ур.",
    root: "Корень",
    not: "не",
    empty: "Нет условий",
    raw: "Свободный текст",
    withTitle: "Локальные переменные with",
    key: "Ключ",
    value: "Значение",
    valueTo: "до",
    maps: "map",
    extract: "extract",
    quantifier: "квантор",
    first: "first",
    lengthFn: "length()",
    jsonPath: "json_path",
    none: "—",
  },
  en: {
    text: "Text",
    graph: "Graph",
    logic: "Check logic",
    legendVar: "variable",
    legendKey: "key",
    legendOp: "operator",
    legendValue: "value",
    addRule: "+ Rule",
    addGroup: "+ Nested group",
    andAll: "AND (all)",
    orAny: "OR (any)",
    group: "Group",
    level: "lvl",
    root: "Root",
    not: "not",
    empty: "No conditions",
    raw: "Raw text",
    withTitle: "Local with bindings",
    key: "Key",
    value: "Value",
    valueTo: "to",
    maps: "map",
    extract: "extract",
    quantifier: "quantifier",
    first: "first",
    lengthFn: "length()",
    jsonPath: "json_path",
    none: "—",
  },
};

let ruleBuilderEnabled = false;
let ruleBuilderMode = "text";
let ruleBuilderStopped = false;
let ruleBuilderFrame = 0;
let ruleBuilderObserver = null;
let ruleBuilderTheme = null;
let ruleBuilderModel = emptyRuleModel();
let ruleBuilderSuspend = false;
let ruleBuilderPageReady = null;
let ruleBuilderCommitTimer = 0;

function emptyGroup(join) {
  return { kind: "group", join: join === "or" ? "or" : "and", items: [] };
}

function emptyRuleModel() {
  return { with: [], root: emptyGroup("and") };
}

function defaultPredicate() {
  return {
    kind: "scalar",
    variable: "REQUEST_URI",
    select: "",
    selectRegex: false,
    extract: "values",
    quantifier: "any",
    maps: [],
    jsonPaths: [],
    useFirst: false,
    useLength: false,
    op: "matches",
    arg: "",
    arg2: "",
    regex: false,
    negate: false,
  };
}

function ruleBuilderAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function ruleBuilderLang() {
  const lang = (document.documentElement.lang || "").toLowerCase();
  return lang.startsWith("en") ? "en" : "ru";
}

function ruleBuilderCopy() {
  return RB_COPY[ruleBuilderLang()];
}

function ruleBuilderField() {
  return document.querySelector(
    "ptaf-user-rule-base-form .field-code, ptaf-user-rule-form-card .field-code, ptaf-ddf-core-field.field-code"
  );
}

function ruleBuilderSlot() {
  const field = ruleBuilderField();
  if (!field) {
    return null;
  }
  // Stay inside field-code so Angular form structure is not broken.
  return field.querySelector(".input") || field;
}

function opLabel(name) {
  if (name === "matches_re") {
    return "matches ~";
  }
  if (RB_OPS_UNARY.has(name)) {
    return `${name}()`;
  }
  return name;
}

function formatSelectDisplay(pred) {
  if (!RB_DICTS[pred.variable]) {
    return "";
  }
  const select = String(pred.select == null ? "" : pred.select).trim();
  if (!select) {
    return "";
  }
  if (select.startsWith("@")) {
    return select;
  }
  if (pred.selectRegex) {
    return `~"${select}"`;
  }
  return `"${select}"`;
}

function applySelectInput(pred, text) {
  const raw = String(text || "").trim();
  if (!raw) {
    pred.select = "";
    pred.selectRegex = false;
    return;
  }
  if (raw.startsWith("@")) {
    pred.select = raw;
    pred.selectRegex = false;
    return;
  }
  if (raw.startsWith("~")) {
    const lit = parseDslLiteral(raw.includes("\"") ? raw : `~"${raw.slice(1)}"`);
    pred.select = lit.value;
    pred.selectRegex = true;
    return;
  }
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    pred.select = parseDslLiteral(raw).value;
    pred.selectRegex = false;
    return;
  }
  pred.select = raw;
  pred.selectRegex = false;
}

function formatArgDisplay(pred) {
  if (RB_OPS_UNARY.has(pred.op)) {
    return "";
  }
  const arg = String(pred.arg == null ? "" : pred.arg);
  if (pred.op === "between") {
    return arg;
  }
  if (pred.op === "matches_re" || pred.regex) {
    return `~"${arg}"`;
  }
  if (pred.op === "in" || pred.op === "contains") {
    if (arg.trim().startsWith("@@") || arg.trim().startsWith("[")) {
      return arg.trim();
    }
    const items = splitListArg(arg);
    if (items.length === 1 && items[0].startsWith("@@")) {
      return items[0];
    }
    const meta = RB_SCALARS[pred.variable];
    const asInt = Boolean(meta && (meta.type === "int" || meta.type === "ip")) || pred.useLength;
    return formatListArg(items, asInt);
  }
  if (arg.trim().startsWith("@") || arg.trim().startsWith("@@")) {
    return arg.trim();
  }
  const meta = RB_SCALARS[pred.variable];
  if ((meta && meta.type === "int") || pred.useLength || pred.op === ">" || pred.op === "<" || pred.op === ">=" || pred.op === "<=") {
    return arg;
  }
  if (meta && meta.type === "ip") {
    return arg;
  }
  if (!arg) {
    return "";
  }
  if ((arg.startsWith("\"") && arg.endsWith("\"")) || (arg.startsWith("~\"") && arg.endsWith("\""))) {
    return arg;
  }
  return `"${arg}"`;
}

function applyArgInput(pred, text) {
  const raw = String(text || "").trim();
  if (!raw) {
    pred.arg = "";
    pred.regex = false;
    return;
  }
  if (raw.startsWith("~")) {
    const lit = parseDslLiteral(raw.includes("\"") ? raw : `~"${raw.slice(1)}"`);
    pred.arg = lit.value;
    pred.regex = true;
    if (pred.op === "matches") {
      pred.op = "matches_re";
    }
    return;
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const lit = parseDslLiteral(raw);
    pred.arg = lit.value;
    pred.regex = false;
    return;
  }
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    pred.arg = parseDslLiteral(raw).value;
    pred.regex = false;
    return;
  }
  pred.arg = raw;
  pred.regex = false;
}

function injectRuleBuilderPage() {
  if (typeof isPtafUi !== "function" || !isPtafUi()) {
    return Promise.resolve(false);
  }
  if (ruleBuilderPageReady) {
    return ruleBuilderPageReady;
  }
  ruleBuilderPageReady = new Promise((resolve) => {
    try {
      if (document.documentElement.dataset.ptafRbPage === "1") {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("content/rule-builder-page.js");
      script.onload = () => {
        document.documentElement.dataset.ptafRbPage = "1";
        resolve(true);
      };
      script.onerror = () => resolve(false);
      (document.documentElement || document.head).append(script);
    } catch (error) {
      resolve(false);
    }
  });
  return ruleBuilderPageReady;
}

function pageRuleCommand(op, text) {
  const root = document.documentElement;
  if (!root) {
    return null;
  }
  root.removeAttribute("data-ptaf-rb-result");
  root.setAttribute("data-ptaf-rb-op", op);
  if (op === "write") {
    root.setAttribute("data-ptaf-rb-text", text == null ? "" : text);
  }
  root.dispatchEvent(new Event("ptaf-rule-builder-command"));
  const result = root.getAttribute("data-ptaf-rb-result");
  const value = root.getAttribute("data-ptaf-rb-text") || "";
  root.removeAttribute("data-ptaf-rb-op");
  root.removeAttribute("data-ptaf-rb-result");
  if (op !== "write") {
    root.removeAttribute("data-ptaf-rb-text");
  }
  if (result == null) {
    return null;
  }
  return { ok: result === "1", text: value };
}

async function readRuleCode() {
  await injectRuleBuilderPage();
  const page = pageRuleCommand("read");
  if (page && page.ok) {
    return page.text;
  }
  const field = ruleBuilderField();
  const area = field && field.querySelector("textarea.inputarea");
  if (area) {
    return String(area.value || "").replace(/\u00a0/g, " ");
  }
  return "";
}

async function writeRuleCode(text) {
  await injectRuleBuilderPage();
  const page = pageRuleCommand("write", text);
  return Boolean(page && page.ok);
}

async function setRuleEditorHidden(hidden) {
  await injectRuleBuilderPage();
  pageRuleCommand(hidden ? "hide" : "show");
}

function escapeDslString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function splitListArg(text) {
  return String(text || "")
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatListArg(items, asInt) {
  if (asInt) {
    return `[${items.join(", ")}]`;
  }
  return `[${items.map((item) => (item.startsWith("@@") || item.startsWith("@") ? item : `"${escapeDslString(item)}"`)).join(", ")}]`;
}

function formatDslArg(pred) {
  const arg = String(pred.arg == null ? "" : pred.arg).trim();
  if (RB_OPS_UNARY.has(pred.op)) {
    return "";
  }
  if (arg.startsWith("@@") || arg.startsWith("@")) {
    return arg;
  }
  if (pred.op === "between") {
    const low = String(pred.arg == null ? "" : pred.arg).trim() || "0";
    const high = String(pred.arg2 == null ? "" : pred.arg2).trim() || "0";
    return `${low} and ${high}`;
  }
  if (pred.op === "matches_re" || pred.regex) {
    return `~"${escapeDslString(pred.arg)}"`;
  }
  if (pred.op === "in" || pred.op === "contains") {
    const items = splitListArg(pred.arg);
    const meta = RB_SCALARS[pred.variable];
    const asInt = Boolean(meta && (meta.type === "int" || meta.type === "ip")) || pred.useLength;
    if (items.length === 1 && items[0].startsWith("@@")) {
      return items[0];
    }
    return formatListArg(items, asInt);
  }
  const meta = RB_SCALARS[pred.variable];
  if ((meta && meta.type === "int") || pred.useLength) {
    return String(pred.arg).trim();
  }
  if (meta && meta.type === "ip") {
    return arg;
  }
  if (arg.startsWith("~\"") && arg.endsWith("\"")) {
    return arg;
  }
  return `"${escapeDslString(pred.arg)}"`;
}

function formatSelectArg(pred) {
  const select = String(pred.select == null ? "" : pred.select).trim();
  if (select.startsWith("@")) {
    return select;
  }
  if (pred.selectRegex) {
    return `~"${escapeDslString(pred.select)}"`;
  }
  return `"${escapeDslString(pred.select)}"`;
}

function formatMapChain(maps) {
  const list = (maps || []).filter((name) => RB_MAPS.includes(name));
  if (!list.length) {
    return "";
  }
  return ` . map(${list.join(", ")})`;
}

function compilePredicate(pred) {
  if (!pred || pred.kind === "raw") {
    return String((pred && pred.raw) || "").trim();
  }
  let left = pred.variable;
  const maps = pred.maps || [];
  const jsonPaths = (pred.jsonPaths || []).map((item) => String(item || "").trim()).filter(Boolean);

  if (RB_DICTS[pred.variable]) {
    if (String(pred.select || "").trim() || pred.selectRegex) {
      left += ` . select(${formatSelectArg(pred)})`;
    }
    if (pred.op === "exists") {
      left += " . exists()";
    } else {
      left += ` . extract(${pred.extract || "values"})`;
      left += formatMapChain(maps);
      if (pred.useFirst) {
        left += " . first()";
      } else if (pred.quantifier && !RB_OPS_UNARY.has(pred.op)) {
        left += ` . ${pred.quantifier}()`;
      }
      jsonPaths.forEach((path) => {
        left += ` . json_path("${escapeDslString(path)}")`;
      });
      if (pred.useLength) {
        left += " . length()";
      }
    }
  } else {
    left += formatMapChain(maps);
    jsonPaths.forEach((path) => {
      left += ` . json_path("${escapeDslString(path)}")`;
    });
    if (pred.useLength || pred.mapLength) {
      left += " . length()";
    } else if (pred.mapLower && !maps.includes("lowercase")) {
      left += " . map(lowercase)";
    }
  }

  let body;
  if (pred.op === "exists" && RB_DICTS[pred.variable]) {
    body = left;
  } else if (RB_OPS_UNARY.has(pred.op)) {
    body = `${left} . ${pred.op}()`;
  } else {
    const op = pred.op === "matches_re" ? "matches" : pred.op;
    body = `${left} ${op} ${formatDslArg(pred)}`;
  }
  if (pred.negate) {
    body = `not (${body})`;
  }
  return body;
}

function compileNode(node, depth) {
  if (!node) {
    return "";
  }
  if (node.kind !== "group") {
    return compilePredicate(node);
  }
  const join = node.join === "or" ? "or" : "and";
  const parts = (node.items || []).map((item) => compileNode(item, depth + 1)).filter(Boolean);
  if (!parts.length) {
    return "";
  }
  if (parts.length === 1) {
    const only = parts[0];
    return depth > 0 && node.items[0] && node.items[0].kind === "group" ? `(${only})` : only;
  }
  const glued = parts.map((part, index) => (index === 0 ? part : `${join} ${part}`)).join(" ");
  return depth > 0 ? `(${glued})` : glued;
}

function compileRuleModel(model) {
  const parts = [];
  const locals = (model.with || []).filter((item) => item && item.name);
  if (locals.length) {
    parts.push("with");
    locals.forEach((item, index) => {
      const name = String(item.name).replace(/^@/, "");
      const value = String(item.value || "").trim();
      let formatted = value;
      if (!(value.startsWith("~") || value.startsWith("@") || value.startsWith("[") || /^-?\d+$/.test(value))) {
        if (!(value.startsWith('"') && value.endsWith('"'))) {
          formatted = `"${escapeDslString(value)}"`;
        }
      }
      const comma = index < locals.length - 1 ? "," : "";
      parts.push(`  @${name} = ${formatted}${comma}`);
    });
  }
  const root = model.root || emptyGroup("and");
  const body = compileNode(root, 0);
  if (!body && !locals.length) {
    return "";
  }
  if (!body) {
    return parts.join("\n");
  }
  const join = root.join === "or" ? "or" : "and";
  const topItems = (root.items || []).map((item) => compileNode(item, 1)).filter(Boolean);
  if (topItems.length <= 1) {
    parts.push(`if ${body}`);
  } else {
    topItems.forEach((text, index) => {
      if (index === 0) {
        parts.push(`if ${text}`);
      } else {
        parts.push(`   ${join} ${text}`);
      }
    });
  }
  return parts.join("\n");
}

function stripComments(code) {
  return String(code || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])#[^\n]*/g, "$1");
}

function parseDslLiteral(token) {
  const text = String(token || "").trim();
  if (/^@[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    return { regex: false, value: text, ref: true };
  }
  if (text.startsWith("~\"") && text.endsWith("\"")) {
    return { regex: true, value: text.slice(2, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") };
  }
  if (text.startsWith("\"") && text.endsWith("\"")) {
    return { regex: false, value: text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") };
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1);
    const items = [];
    const re = /"(?:\\.|[^"\\])*"|[^,\s]+/g;
    let match;
    while ((match = re.exec(inner))) {
      const part = match[0];
      if (part.startsWith("\"")) {
        items.push(part.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      } else {
        items.push(part);
      }
    }
    return { regex: false, value: items.join("\n"), list: true };
  }
  return { regex: false, value: text };
}

function normalizeRuleOp(op, argLit) {
  let next = String(op || "").toLowerCase();
  if (next === "eq") next = "==";
  if (next === "ne") next = "!=";
  if (next === "gt") next = ">";
  if (next === "lt") next = "<";
  if (next === "ge") next = ">=";
  if (next === "le") next = "<=";
  if (next === "matches" && argLit && argLit.regex) next = "matches_re";
  return next;
}

function splitTopLevel(text, joiner) {
  const source = String(text || "");
  const parts = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  const needle = ` ${joiner} `;
  const lower = source.toLowerCase();
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    if (lower.slice(index, index + needle.length) === needle) {
      parts.push(source.slice(start, index).trim());
      index += needle.length - 1;
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function splitWithBindings(bindings) {
  const source = String(bindings || "");
  const items = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === "," && depth === 0) {
      items.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(source.slice(start).trim());
  return items.filter(Boolean);
}

function unwrapParens(text) {
  let value = String(text || "").trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let wraps = true;
    for (let index = 0; index < value.length; index += 1) {
      const ch = value[index];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0 && index !== value.length - 1) {
          wraps = false;
          break;
        }
      }
    }
    if (!wraps || depth !== 0) {
      break;
    }
    value = value.slice(1, -1).trim();
  }
  return value;
}

function parseCallArgs(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return [];
  }
  const parts = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function parseFunctionChain(text) {
  const source = String(text || "").trim();
  const calls = [];
  let index = 0;
  while (index < source.length) {
    const start = source.slice(index).match(/^\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*/);
    if (!start) {
      break;
    }
    index += start[0].length;
    let args = [];
    if (source[index] === "(") {
      let depth = 0;
      let inString = false;
      let escape = false;
      const argStart = index + 1;
      let end = -1;
      for (let cursor = index; cursor < source.length; cursor += 1) {
        const ch = source[cursor];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (ch === "\\") {
            escape = true;
          } else if (ch === "\"") {
            inString = false;
          }
          continue;
        }
        if (ch === "\"") {
          inString = true;
          continue;
        }
        if (ch === "(") {
          depth += 1;
          continue;
        }
        if (ch === ")") {
          depth -= 1;
          if (depth === 0) {
            end = cursor;
            break;
          }
        }
      }
      if (end < 0) {
        break;
      }
      args = parseCallArgs(source.slice(argStart, end));
      index = end + 1;
    }
    calls.push({ name: start[1].toLowerCase(), args });
  }
  return { calls, rest: source.slice(index).trim() };
}

function parsePredicateChunk(chunk) {
  let text = String(chunk || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  const original = text;
  let negate = false;
  const notMatch = text.match(/^not\s*\((.*)\)\s*$/i) || text.match(/^not\s+(.+)$/i);
  if (notMatch) {
    negate = true;
    text = notMatch[1].trim();
  }

  const head = text.match(/^((?:CLIENT|REQUEST|RESPONSE)_[A-Z0-9_]+)\b(.*)$/i);
  if (!head) {
    return { kind: "raw", raw: original };
  }
  const variable = head[1].toUpperCase();
  const tail = String(head[2] || "").trim();
  const isDict = Boolean(RB_DICTS[variable]);
  if (!isDict && !RB_SCALARS[variable]) {
    return { kind: "raw", raw: original };
  }

  const pred = defaultPredicate();
  pred.kind = isDict ? "dict" : "scalar";
  pred.variable = variable;
  pred.negate = negate;
  pred.maps = [];
  pred.jsonPaths = [];
  pred.quantifier = "";
  pred.useFirst = false;
  pred.useLength = false;
  pred.select = "";
  pred.extract = "values";

  let rest = tail;
  let calls = [];
  if (tail.startsWith(".")) {
    const parsed = parseFunctionChain(tail);
    calls = parsed.calls;
    rest = parsed.rest;
  }

  calls.forEach((call) => {
    if (call.name === "select" && call.args[0]) {
      const lit = parseDslLiteral(call.args[0]);
      pred.select = lit.value;
      pred.selectRegex = Boolean(lit.regex || call.args[0].trim().startsWith("~"));
      return;
    }
    if (call.name === "extract") {
      pred.extract = call.args.map((item) => item.toLowerCase()).join(", ") || "values";
      return;
    }
    if (call.name === "map") {
      call.args.forEach((item) => {
        const name = item.toLowerCase();
        if (RB_MAPS.includes(name)) {
          pred.maps.push(name);
        }
      });
      return;
    }
    if (call.name === "json_path" && call.args[0]) {
      const lit = parseDslLiteral(call.args[0]);
      pred.jsonPaths.push(lit.value);
      return;
    }
    if (call.name === "any" || call.name === "all") {
      pred.quantifier = call.name;
      return;
    }
    if (call.name === "first") {
      pred.useFirst = true;
      return;
    }
    if (call.name === "length") {
      pred.useLength = true;
      return;
    }
    if (call.name === "exists" || call.name === "is_empty" || call.name === "is_set") {
      pred.op = call.name;
      return;
    }
  });

  if (RB_OPS_UNARY.has(pred.op)) {
    if (isDict && pred.op !== "exists" && !pred.quantifier && !pred.useFirst) {
      /* keep */
    }
    return pred;
  }

  const between = rest.match(/^(between)\s+(.+?)\s+and\s+(.+)$/i);
  if (between) {
    pred.op = "between";
    pred.arg = between[2].trim();
    pred.arg2 = between[3].trim();
    if (isDict && !pred.quantifier && !pred.useFirst) {
      pred.quantifier = "any";
    }
    return pred;
  }

  const compare = rest.match(/^(matches|contains|in|==|!=|eq|ne|>|<|>=|<=|gt|lt|ge|le)\s+(.+)$/i);
  if (compare) {
    const argLit = parseDslLiteral(compare[2]);
    pred.op = normalizeRuleOp(compare[1], argLit);
    pred.arg = argLit.value;
    pred.regex = Boolean(argLit.regex);
    if (compare[1].toLowerCase() === "contains") {
      pred.op = "contains";
    }
    if (compare[1].toLowerCase() === "in") {
      pred.op = "in";
      if (argLit.list) {
        pred.arg = argLit.value;
      } else if (/^\[.*\]$/.test(compare[2].trim())) {
        pred.arg = parseDslLiteral(compare[2].trim()).value;
      }
    }
    if (pred.maps.includes("lowercase")) {
      pred.mapLower = true;
    }
    if (isDict && !pred.quantifier && !pred.useFirst && pred.op !== "exists") {
      pred.quantifier = "any";
    }
    return pred;
  }

  if (!rest && (pred.maps.length || pred.jsonPaths.length || pred.useLength || pred.select)) {
    return { kind: "raw", raw: original };
  }
  if (!rest) {
    return { kind: "raw", raw: original };
  }
  return { kind: "raw", raw: original };
}

function parseExpression(body) {
  const text = unwrapParens(String(body || "").replace(/\s+/g, " ").trim());
  if (!text) {
    return emptyGroup("and");
  }
  let parts = splitTopLevel(text, "and");
  let join = "and";
  if (parts.length === 1) {
    const orParts = splitTopLevel(text, "or");
    if (orParts.length > 1) {
      parts = orParts;
      join = "or";
    }
  }
  if (parts.length === 1) {
    const only = parts[0];
    const unwrapped = unwrapParens(only);
    if (unwrapped !== only) {
      return parseExpression(unwrapped);
    }
    const pred = parsePredicateChunk(only);
    const group = emptyGroup("and");
    if (pred) {
      group.items.push(pred);
    }
    return group;
  }
  const group = emptyGroup(join);
  parts.forEach((part) => {
    const trimmed = part.trim();
    const inner = unwrapParens(trimmed);
    if (inner !== trimmed || /^\(.*\)$/.test(trimmed)) {
      group.items.push(parseExpression(inner));
    } else {
      const pred = parsePredicateChunk(trimmed);
      if (pred) {
        group.items.push(pred);
      }
    }
  });
  return group;
}

function parseRuleModel(code) {
  const model = emptyRuleModel();
  let text = stripComments(code).replace(/\u00a0/g, " ").trim();
  if (!text) {
    return model;
  }

  const withMatch = text.match(/^with\b([\s\S]*?)\bif\b([\s\S]*)$/i);
  let ifBody = text;
  if (withMatch) {
    ifBody = withMatch[2];
    splitWithBindings(withMatch[1]).forEach((item) => {
      const match = item.match(/^@([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
      if (match) {
        model.with.push({ name: match[1], value: match[2].trim().replace(/,$/, "") });
      }
    });
  } else {
    const onlyIf = text.match(/^if\b([\s\S]*)$/i);
    if (onlyIf) {
      ifBody = onlyIf[1];
    } else {
      model.root.items.push({ kind: "raw", raw: text });
      return model;
    }
  }

  model.root = parseExpression(ifBody);
  if (!model.root.items.length && String(ifBody || "").trim()) {
    model.root.items.push({ kind: "raw", raw: String(ifBody).trim() });
  }
  return model;
}

function opsForVariable(variable, pred) {
  if (pred && (pred.useLength || (pred.maps || []).includes("length"))) {
    return RB_OPS_INT;
  }
  if (RB_DICTS[variable]) {
    return RB_OPS_DICT;
  }
  const meta = RB_SCALARS[variable];
  if (meta && meta.type === "int") {
    return RB_OPS_INT;
  }
  if (meta && meta.type === "ip") {
    return RB_OPS_IP;
  }
  return RB_OPS_STRING;
}

function scheduleCommit() {
  if (ruleBuilderCommitTimer) {
    window.clearTimeout(ruleBuilderCommitTimer);
  }
  ruleBuilderCommitTimer = window.setTimeout(() => {
    ruleBuilderCommitTimer = 0;
    commitRuleBuilder();
  }, 180);
}

function ensureRuleBuilderHost() {
  const slot = ruleBuilderSlot();
  if (!slot) {
    return null;
  }
  let host = document.getElementById(RULE_BUILDER_ID);
  if (host && !slot.contains(host) && host.parentElement !== slot) {
    host.remove();
    host = null;
  }
  if (host) {
    ruleBuilderTheme = host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
    if (ruleBuilderTheme) {
      ruleBuilderTheme.dataset.theme = pageTheme();
    }
    return host;
  }
  host = document.createElement("div");
  host.id = RULE_BUILDER_ID;
  host.style.cssText = "all:initial;display:block;width:100%;margin:0 0 12px;position:relative;z-index:2;";
  const theme = attachUi(host);
  if (!theme) {
    return null;
  }
  ruleBuilderTheme = theme;
  theme.innerHTML = `
    <div class="ptaf-rb">
      <div class="ptaf-rb-modes">
        <button type="button" class="ptaf-rb-mode" data-mode="text"></button>
        <button type="button" class="ptaf-rb-mode" data-mode="graph"></button>
        <span class="ptaf-compare-mark">эксперимент</span>
      </div>
      <div class="ptaf-rb-panel" hidden>
        <div class="ptaf-rb-logic-title"></div>
        <div class="ptaf-rb-legend"></div>
        <div class="ptaf-rb-with" hidden></div>
        <div class="ptaf-rb-tree"></div>
      </div>
    </div>
  `;
  theme.querySelectorAll(".ptaf-rb-mode").forEach((button) => {
    button.addEventListener("click", () => {
      applyRuleBuilderMode(button.dataset.mode);
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ userRuleBuilderMode: ruleBuilderMode });
      }
    });
  });
  if (slot.firstChild) {
    slot.insertBefore(host, slot.firstChild);
  } else {
    slot.append(host);
  }
  return host;
}

function removeRuleBuilderHost() {
  const host = document.getElementById(RULE_BUILDER_ID);
  if (host) {
    host.remove();
  }
  ruleBuilderTheme = null;
  setRuleEditorHidden(false);
}

function fillVariableSelect(select, selected) {
  const scalarGroup = document.createElement("optgroup");
  scalarGroup.label = "scalar";
  Object.keys(RB_SCALARS).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    scalarGroup.append(option);
  });
  const dictGroup = document.createElement("optgroup");
  dictGroup.label = "dictionary";
  Object.keys(RB_DICTS).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    dictGroup.append(option);
  });
  const raw = document.createElement("option");
  raw.value = "__raw__";
  raw.textContent = "raw";
  select.append(scalarGroup, dictGroup, raw);
  select.value = selected || "REQUEST_URI";
}

function renderPredicateRow(pred, parentGroup, index) {
  const copy = ruleBuilderCopy();
  const wrap = document.createElement("div");
  wrap.className = "ptaf-rb-rule-wrap";
  const row = document.createElement("div");
  row.className = "ptaf-rb-rule";
  const dsl = document.createElement("div");
  dsl.className = "ptaf-rb-dsl";
  const syncDsl = () => {
    dsl.textContent = pred.kind === "raw" ? String(pred.raw || "") : compilePredicate(pred);
  };
  syncDsl();

  const negate = document.createElement("label");
  negate.className = "ptaf-rb-not";
  const negateBox = document.createElement("input");
  negateBox.type = "checkbox";
  negateBox.checked = Boolean(pred.negate);
  negateBox.addEventListener("change", () => {
    pred.negate = negateBox.checked;
    syncDsl();
    scheduleCommit();
  });
  const negateText = document.createElement("span");
  negateText.textContent = "not";
  negate.append(negateBox, negateText);
  row.append(negate);

  if (pred.kind === "raw") {
    const raw = document.createElement("input");
    raw.className = "ptaf-rb-input ptaf-rb-raw";
    raw.value = pred.raw || "";
    raw.placeholder = "raw";
    raw.addEventListener("input", () => {
      pred.raw = raw.value;
      scheduleCommit();
    });
    row.append(raw);
  } else {
    if (!Array.isArray(pred.maps)) {
      pred.maps = [];
    }
    if (!Array.isArray(pred.jsonPaths)) {
      pred.jsonPaths = [];
    }
    const variable = document.createElement("select");
    variable.className = "ptaf-rb-select ptaf-rb-col-var";
    fillVariableSelect(variable, pred.variable);
    variable.addEventListener("change", () => {
      if (variable.value === "__raw__") {
        parentGroup.items[index] = { kind: "raw", raw: compilePredicate(pred) };
        scheduleCommit();
        renderRuleBuilder();
        return;
      }
      pred.variable = variable.value;
      pred.kind = RB_DICTS[pred.variable] ? "dict" : "scalar";
      if (!RB_DICTS[pred.variable]) {
        pred.select = "";
        pred.selectRegex = false;
      }
      const available = opsForVariable(pred.variable, pred);
      if (!available.includes(pred.op)) {
        pred.op = available[0];
      }
      scheduleCommit();
      renderRuleBuilder();
    });
    row.append(variable);

    const key = document.createElement("input");
    key.className = "ptaf-rb-input ptaf-rb-col-key";
    key.placeholder = RB_DICTS[pred.variable] ? 'select("key") / ~"re"' : "—";
    key.value = formatSelectDisplay(pred);
    key.disabled = !RB_DICTS[pred.variable];
    key.spellcheck = false;
    key.addEventListener("input", () => {
      applySelectInput(pred, key.value);
      syncDsl();
      scheduleCommit();
    });
    key.addEventListener("blur", () => {
      key.value = formatSelectDisplay(pred);
      syncDsl();
    });
    row.append(key);

    const operator = document.createElement("select");
    operator.className = "ptaf-rb-select ptaf-rb-col-op";
    opsForVariable(pred.variable, pred).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = opLabel(name);
      operator.append(option);
    });
    const availableOps = opsForVariable(pred.variable, pred);
    if (!availableOps.includes(pred.op)) {
      pred.op = availableOps[0];
    }
    operator.value = pred.op;
    operator.addEventListener("change", () => {
      pred.op = operator.value;
      pred.regex = pred.op === "matches_re";
      scheduleCommit();
      renderRuleBuilder();
    });
    row.append(operator);

    if (RB_OPS_UNARY.has(pred.op)) {
      const placeholder = document.createElement("div");
      placeholder.className = "ptaf-rb-col-value ptaf-rb-unary";
      placeholder.textContent = `${pred.op}()`;
      row.append(placeholder);
    } else if (pred.op === "between") {
      const range = document.createElement("div");
      range.className = "ptaf-rb-col-value ptaf-rb-between";
      const from = document.createElement("input");
      from.className = "ptaf-rb-input";
      from.placeholder = "1";
      from.value = pred.arg || "";
      from.spellcheck = false;
      from.addEventListener("input", () => {
        pred.arg = from.value;
        syncDsl();
        scheduleCommit();
      });
      const toLabel = document.createElement("span");
      toLabel.textContent = "and";
      const to = document.createElement("input");
      to.className = "ptaf-rb-input";
      to.placeholder = "10";
      to.value = pred.arg2 || "";
      to.spellcheck = false;
      to.addEventListener("input", () => {
        pred.arg2 = to.value;
        syncDsl();
        scheduleCommit();
      });
      range.append(from, toLabel, to);
      row.append(range);
    } else {
      const value = document.createElement("input");
      value.className = "ptaf-rb-input ptaf-rb-col-value";
      value.placeholder = pred.op === "in" || pred.op === "contains" ? '["a", "b"] | @@list' : '"value" | ~"regex"';
      value.value = formatArgDisplay(pred);
      value.spellcheck = false;
      value.addEventListener("input", () => {
        applyArgInput(pred, value.value);
        syncDsl();
        scheduleCommit();
      });
      value.addEventListener("blur", () => {
        value.value = formatArgDisplay(pred);
        syncDsl();
      });
      row.append(value);
    }
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ptaf-rb-x";
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    parentGroup.items.splice(index, 1);
    scheduleCommit();
    renderRuleBuilder();
  });
  row.append(remove);
  wrap.append(row, dsl);

  if (pred.kind !== "raw") {
    const extra = document.createElement("div");
    extra.className = "ptaf-rb-rule-extra";

    const mapsBox = document.createElement("div");
    mapsBox.className = "ptaf-rb-extra-field ptaf-rb-maps";
    const mapsCaption = document.createElement("span");
    mapsCaption.textContent = copy.maps;
    mapsBox.append(mapsCaption);
    const mapsRow = document.createElement("div");
    mapsRow.className = "ptaf-rb-maps-row";
    RB_MAPS.forEach((name) => {
      const item = document.createElement("label");
      item.className = "ptaf-rb-extra-check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = (pred.maps || []).includes(name);
      box.addEventListener("change", () => {
        const set = new Set(pred.maps || []);
        if (box.checked) {
          set.add(name);
        } else {
          set.delete(name);
        }
        pred.maps = RB_MAPS.filter((itemName) => set.has(itemName));
        scheduleCommit();
        if (name === "length") {
          renderRuleBuilder();
        }
      });
      item.append(box, document.createTextNode(name));
      mapsRow.append(item);
    });
    mapsBox.append(mapsRow);
    extra.append(mapsBox);

    if (RB_DICTS[pred.variable]) {
      const extract = document.createElement("select");
      extract.className = "ptaf-rb-select";
      RB_EXTRACTS.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        extract.append(option);
      });
      extract.value = pred.extract || "values";
      extract.addEventListener("change", () => {
        pred.extract = extract.value;
        scheduleCommit();
      });
      const extractLabel = document.createElement("label");
      extractLabel.className = "ptaf-rb-extra-field";
      extractLabel.append(document.createTextNode(copy.extract), extract);
      extra.append(extractLabel);

      const quant = document.createElement("select");
      quant.className = "ptaf-rb-select";
      [
        { value: "any", label: "any()" },
        { value: "all", label: "all()" },
        { value: "", label: copy.none },
      ].forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        quant.append(option);
      });
      quant.value = pred.useFirst ? "" : (pred.quantifier || "any");
      quant.disabled = Boolean(pred.useFirst) || pred.op === "exists";
      quant.addEventListener("change", () => {
        pred.quantifier = quant.value;
        scheduleCommit();
      });
      const quantLabel = document.createElement("label");
      quantLabel.className = "ptaf-rb-extra-field";
      quantLabel.append(document.createTextNode(copy.quantifier), quant);
      extra.append(quantLabel);

      const first = document.createElement("label");
      first.className = "ptaf-rb-extra-check";
      const firstBox = document.createElement("input");
      firstBox.type = "checkbox";
      firstBox.checked = Boolean(pred.useFirst);
      firstBox.addEventListener("change", () => {
        pred.useFirst = firstBox.checked;
        if (pred.useFirst) {
          pred.quantifier = "";
        } else if (!pred.quantifier) {
          pred.quantifier = "any";
        }
        scheduleCommit();
        renderRuleBuilder();
      });
      first.append(firstBox, document.createTextNode(copy.first));
      extra.append(first);
    }

    const length = document.createElement("label");
    length.className = "ptaf-rb-extra-check";
    const lengthBox = document.createElement("input");
    lengthBox.type = "checkbox";
    lengthBox.checked = Boolean(pred.useLength);
    lengthBox.addEventListener("change", () => {
      pred.useLength = lengthBox.checked;
      const available = opsForVariable(pred.variable, pred);
      if (!available.includes(pred.op)) {
        pred.op = available[0];
      }
      scheduleCommit();
      renderRuleBuilder();
    });
    length.append(lengthBox, document.createTextNode(copy.lengthFn));
    extra.append(length);

    const json = document.createElement("input");
    json.className = "ptaf-rb-input ptaf-rb-json";
    json.placeholder = 'json_path("$.path")';
    json.value = (pred.jsonPaths || []).join(" | ");
    json.addEventListener("input", () => {
      pred.jsonPaths = json.value
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      scheduleCommit();
    });
    const jsonLabel = document.createElement("label");
    jsonLabel.className = "ptaf-rb-extra-field ptaf-rb-extra-json";
    jsonLabel.append(document.createTextNode(copy.jsonPath), json);
    extra.append(jsonLabel);

    wrap.append(extra);
  }

  return wrap;
}

function renderGroup(group, depth, parentGroup, indexInParent) {
  const copy = ruleBuilderCopy();
  const box = document.createElement("div");
  box.className = `ptaf-rb-group ptaf-rb-depth-${Math.min(depth, 3)}`;

  const head = document.createElement("div");
  head.className = "ptaf-rb-group-head";
  const title = document.createElement("div");
  title.className = "ptaf-rb-group-title";
  title.textContent = depth === 0 ? copy.root : `${copy.group} · ${copy.level}. ${depth}`;
  head.append(title);

  const join = document.createElement("select");
  join.className = "ptaf-rb-select ptaf-rb-join-select";
  [
    { value: "and", label: "and" },
    { value: "or", label: "or" },
  ].forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    join.append(option);
  });
  join.value = group.join === "or" ? "or" : "and";
  join.addEventListener("change", () => {
    group.join = join.value;
    scheduleCommit();
  });
  head.append(join);

  if (parentGroup) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ptaf-rb-x";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      parentGroup.items.splice(indexInParent, 1);
      scheduleCommit();
      renderRuleBuilder();
    });
    head.append(remove);
  }
  box.append(head);

  const body = document.createElement("div");
  body.className = "ptaf-rb-group-body";
  (group.items || []).forEach((item, index) => {
    if (item && item.kind === "group") {
      body.append(renderGroup(item, depth + 1, group, index));
    } else {
      body.append(renderPredicateRow(item || defaultPredicate(), group, index));
    }
  });
  if (!(group.items || []).length && depth === 0) {
    const empty = document.createElement("div");
    empty.className = "ptaf-rb-empty";
    empty.textContent = copy.empty;
    body.append(empty);
  }
  box.append(body);

  const actions = document.createElement("div");
  actions.className = "ptaf-rb-group-actions";
  const addRule = document.createElement("button");
  addRule.type = "button";
  addRule.className = "ptaf-rb-secondary";
  addRule.textContent = copy.addRule;
  addRule.addEventListener("click", () => {
    group.items.push(defaultPredicate());
    scheduleCommit();
    renderRuleBuilder();
  });
  const addGroup = document.createElement("button");
  addGroup.type = "button";
  addGroup.className = "ptaf-rb-secondary";
  addGroup.textContent = copy.addGroup;
  addGroup.addEventListener("click", () => {
    const nested = emptyGroup("and");
    nested.items.push(defaultPredicate());
    group.items.push(nested);
    scheduleCommit();
    renderRuleBuilder();
  });
  actions.append(addRule, addGroup);
  box.append(actions);
  return box;
}

function renderRuleBuilder() {
  const theme = ruleBuilderTheme;
  if (!theme) {
    return;
  }
  try {
    const copy = ruleBuilderCopy();
    theme.dataset.theme = typeof pageTheme === "function" ? pageTheme() : "dark";
    theme.querySelectorAll(".ptaf-rb-mode").forEach((button) => {
      button.textContent = button.dataset.mode === "graph" ? copy.graph : copy.text;
      button.classList.toggle("is-on", button.dataset.mode === ruleBuilderMode);
    });
    const panel = theme.querySelector(".ptaf-rb-panel");
    panel.hidden = ruleBuilderMode !== "graph";

    const title = theme.querySelector(".ptaf-rb-logic-title");
    title.textContent = copy.logic;

    const legend = theme.querySelector(".ptaf-rb-legend");
    legend.replaceChildren();
    [copy.legendVar, copy.legendKey, copy.legendOp, copy.legendValue].forEach((text, index) => {
      const item = document.createElement("span");
      item.className = `ptaf-rb-legend-item ptaf-rb-legend-${index}`;
      item.textContent = text;
      legend.append(item);
    });

    const withBox = theme.querySelector(".ptaf-rb-with");
    const locals = ruleBuilderModel.with || [];
    withBox.replaceChildren();
    if (locals.length) {
      withBox.hidden = false;
      const caption = document.createElement("div");
      caption.className = "ptaf-rb-with-title";
      caption.textContent = copy.withTitle;
      withBox.append(caption);
      locals.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ptaf-rb-with-row";
        row.textContent = `@${item.name} = ${item.value}`;
        withBox.append(row);
      });
    } else {
      withBox.hidden = true;
    }

    if (!ruleBuilderModel.root || ruleBuilderModel.root.kind !== "group") {
      ruleBuilderModel.root = emptyGroup("and");
    }
    const tree = theme.querySelector(".ptaf-rb-tree");
    tree.replaceChildren(renderGroup(ruleBuilderModel.root, 0, null, 0));
  } catch (error) {
    console.error("ptaf-rule-builder render failed", error);
  }
}

async function commitRuleBuilder() {
  ruleBuilderSuspend = true;
  const text = compileRuleModel(ruleBuilderModel);
  await writeRuleCode(text);
  window.setTimeout(() => {
    ruleBuilderSuspend = false;
  }, 200);
}

async function syncRuleBuilderFromEditor() {
  if (ruleBuilderSuspend) {
    return;
  }
  const text = await readRuleCode();
  if (!String(text || "").trim()) {
    return;
  }
  ruleBuilderModel = parseRuleModel(text);
  renderRuleBuilder();
}

async function applyRuleBuilderMode(mode) {
  const next = mode === "graph" ? "graph" : "text";
  if (next === "text" && ruleBuilderMode === "graph") {
    await commitRuleBuilder();
  }
  if (next === "graph") {
    await syncRuleBuilderFromEditor();
  }
  ruleBuilderMode = next;
  await setRuleEditorHidden(next === "graph");
  renderRuleBuilder();
}

async function syncRuleBuilder() {
  if (ruleBuilderStopped || !ruleBuilderAlive()) {
    stopRuleBuilder();
    return;
  }
  if (!ruleBuilderEnabled) {
    removeRuleBuilderHost();
    return;
  }
  const field = ruleBuilderField();
  if (!field) {
    removeRuleBuilderHost();
    return;
  }
  const firstMount = !document.getElementById(RULE_BUILDER_ID);
  if (!ensureRuleBuilderHost()) {
    return;
  }
  await injectRuleBuilderPage();
  if (firstMount) {
    if (ruleBuilderMode === "graph") {
      await syncRuleBuilderFromEditor();
    }
    await setRuleEditorHidden(ruleBuilderMode === "graph");
    renderRuleBuilder();
    return;
  }
  await setRuleEditorHidden(ruleBuilderMode === "graph");
}

function scheduleRuleBuilder() {
  if (ruleBuilderStopped || ruleBuilderFrame) {
    return;
  }
  ruleBuilderFrame = requestAnimationFrame(() => {
    ruleBuilderFrame = 0;
    syncRuleBuilder();
  });
}

function stopRuleBuilder() {
  if (ruleBuilderStopped) {
    return;
  }
  ruleBuilderStopped = true;
  if (ruleBuilderFrame) {
    cancelAnimationFrame(ruleBuilderFrame);
    ruleBuilderFrame = 0;
  }
  if (ruleBuilderCommitTimer) {
    window.clearTimeout(ruleBuilderCommitTimer);
    ruleBuilderCommitTimer = 0;
  }
  if (ruleBuilderObserver) {
    ruleBuilderObserver.disconnect();
    ruleBuilderObserver = null;
  }
  removeRuleBuilderHost();
}

function watchRuleBuilder() {
  if (ruleBuilderObserver || ruleBuilderStopped || !document.body) {
    return;
  }
  const isOwn = (node) => {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    return node.id === RULE_BUILDER_ID || Boolean(node.closest && node.closest("#" + RULE_BUILDER_ID));
  };
  ruleBuilderObserver = new MutationObserver((records) => {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (isOwn(record.target)) {
        continue;
      }
      let skip = true;
      record.addedNodes.forEach((node) => {
        if (!isOwn(node)) {
          skip = false;
        }
      });
      record.removedNodes.forEach((node) => {
        if (!isOwn(node)) {
          skip = false;
        }
      });
      if (!skip) {
        scheduleRuleBuilder();
        return;
      }
    }
  });
  ruleBuilderObserver.observe(document.body, { childList: true, subtree: true });
  scheduleRuleBuilder();
}

function applyRuleBuilderSetting(enabled) {
  ruleBuilderEnabled = Boolean(enabled);
  ruleBuilderStopped = false;
  if (!ruleBuilderEnabled) {
    removeRuleBuilderHost();
    return;
  }
  watchRuleBuilder();
  scheduleRuleBuilder();
}

function bootRuleBuilder() {
  if (!document.body || !ruleBuilderAlive()) {
    return;
  }
  if (!chrome.storage || !chrome.storage.local) {
    applyRuleBuilderSetting(false);
    return;
  }
  chrome.storage.local.get({ userRuleBuilder: false, userRuleBuilderMode: "text" }, (items) => {
    ruleBuilderMode = items && items.userRuleBuilderMode === "graph" ? "graph" : "text";
    applyRuleBuilderSetting(items && items.userRuleBuilder);
  });
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      if (changes.userRuleBuilderMode) {
        applyRuleBuilderMode(changes.userRuleBuilderMode.newValue);
      }
      if (changes.userRuleBuilder) {
        applyRuleBuilderSetting(changes.userRuleBuilder.newValue);
      }
    });
  }
}

if (typeof document !== "undefined") {
  bootRuleBuilder();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { compileRuleModel, parseRuleModel, escapeDslString };
}
