const TRANSFER_BAR_ID = "ptaf-transfer-bar";
const TRANSFER_DIALOG_ID = "ptaf-transfer-dialog";
const TRANSFER_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TRANSFER_RULE_PATH = new RegExp(
  `/conf-scheme/(application_policy|policy|user_policy)/(${TRANSFER_UUID})/rules/rule/(${TRANSFER_UUID})`,
  "i"
);
const TRANSFER_UUID_TEST = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const transferState = {
  exporting: false,
  writing: false,
  loading: false,
  token: 0,
  doc: null,
  rows: [],
  templates: [],
  templateId: "",
  existing: null,
  targetRule: null,
  error: "",
  actionOptions: [],
  actionPick: null,
  actionsOpen: false,
  actionNotice: "",
};

let transferFrame = 0;
let transferObserver = null;
let transferThemeObserver = null;
let transferPath = "";

function transferRoute() {
  return location.pathname + location.hash;
}

function transferRouteIds() {
  return transferRoute().match(new RegExp(TRANSFER_UUID, "gi")) || [];
}

function transferKindFromSegment(segment) {
  const value = String(segment || "").toLowerCase();
  if (value === "application_policy" || value === "policy") {
    return "policy";
  }
  if (value === "user_policy") {
    return "template";
  }
  return "user-rules";
}

function transferVisible(node) {
  if (!node || !node.isConnected) {
    return false;
  }
  const style = getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function transferRulePage() {
  const path = transferRoute();
  const match = path.match(new RegExp(
    `/conf-scheme/(?:[\\w-]+/)*([\\w-]+)/(${TRANSFER_UUID})/rules/rule/(${TRANSFER_UUID})`,
    "i"
  ));
  if (match) {
    return {
      mode: "rule",
      kind: transferKindFromSegment(match[1]),
      entityId: match[2],
      ruleRef: match[3],
    };
  }
  const tail = path.match(new RegExp(`/rules/rule/(${TRANSFER_UUID})`, "i"));
  if (!tail) {
    return null;
  }
  const entity = typeof parseTarget === "function" ? parseTarget(path) : null;
  const ids = transferRouteIds();
  return {
    mode: "rule",
    kind: entity ? entity.kind : "user-rules",
    entityId: entity ? entity.id : (ids.length > 1 ? ids[ids.length - 2] : ""),
    ruleRef: tail[1],
  };
}

function transferTitleNode() {
  const pattern = /набор пользовательских правил|user rules? set|set of user rules|custom rules set/i;
  const nodes = document.querySelectorAll("h1, h2, h3, header, ptaf-form-card-header, ptaf-card-header, [class*='title'], [class*='header'], [class*='name']");
  for (const node of nodes) {
    if (node.closest && node.closest(`#${TRANSFER_BAR_ID}, #${TRANSFER_DIALOG_ID}`)) {
      continue;
    }
    if (node.childElementCount > 8) {
      continue;
    }
    const text = (node.innerText || "").replace(/\s+/g, " ").trim();
    if (text && text.length < 60 && pattern.test(text)) {
      return node;
    }
  }
  return null;
}

function transferHasUserRulesTitle() {
  if (transferTitleNode()) {
    return true;
  }
  if (!/conf-scheme/i.test(transferRoute())) {
    return false;
  }
  const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 2000);
  return /набор пользовательских правил|user rules? set|set of user rules/i.test(text);
}

function transferLaidOut(node) {
  if (!node || !node.isConnected) {
    return false;
  }
  const style = getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  if (style.display === "contents") {
    return [...node.children].some((child) => transferVisible(child));
  }
  const rect = node.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return true;
  }
  return [...node.children].some((child) => transferVisible(child));
}

function transferQueryDeep(selector) {
  const found = [...document.querySelectorAll(selector)];
  if (found.length) {
    return found;
  }
  document.querySelectorAll("*").forEach((host) => {
    if (host.shadowRoot) {
      found.push(...host.shadowRoot.querySelectorAll(selector));
    }
  });
  return found;
}

function transferRuleBar() {
  const nodes = transferQueryDeep(".waf-modal-active .rules-action, .rules-action");
  for (const node of nodes) {
    if (transferLaidOut(node)) {
      return node;
    }
  }
  return null;
}

const TRANSFER_USER_RULES_TITLE = /^(набор пользовательских правил|user rules? set|set of user rules|custom rules set)$/i;
let transferAnchorCache = null;

function transferUserRulesAnchor() {
  if (transferAnchorCache && transferAnchorCache.isConnected) {
    const cached = (transferAnchorCache.textContent || "").replace(/\s+/g, " ").trim();
    if (TRANSFER_USER_RULES_TITLE.test(cached)) {
      return transferAnchorCache;
    }
  }
  transferAnchorCache = null;
  if (!document.body) {
    return null;
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  let steps = 0;
  while (current && steps < 12000) {
    steps += 1;
    const text = current.textContent.replace(/\s+/g, " ").trim();
    if (text && text.length < 80 && TRANSFER_USER_RULES_TITLE.test(text)) {
      const element = current.parentElement;
      if (element && !(element.closest && element.closest(`#${TRANSFER_BAR_ID}, #${TRANSFER_DIALOG_ID}`))) {
        transferAnchorCache = element;
        return element;
      }
    }
    current = walker.nextNode();
  }
  return null;
}

function transferPage() {
  const rule = transferRulePage();
  if (rule) {
    return rule;
  }
  if (transferRuleBar()) {
    const entity = typeof parseTarget === "function" ? parseTarget(transferRoute()) : null;
    const ids = transferRouteIds();
    return {
      mode: "rule",
      kind: entity ? entity.kind : "user-rules",
      entityId: entity ? entity.id : (ids[0] || ""),
      ruleRef: ids.length > 1 ? ids[ids.length - 1] : "",
    };
  }
  const entity = typeof parseTarget === "function" ? parseTarget(transferRoute()) : null;
  if (entity) {
    return { mode: "list", kind: entity.kind, entityId: entity.id, ruleRef: "" };
  }
  if (transferHasUserRulesTitle() || /user[_-]rules|with[_-]user[_-]rules/i.test(transferRoute())) {
    const ids = transferRouteIds();
    return { mode: "list", kind: "user-rules", entityId: ids[0] || "", ruleRef: "" };
  }
  return null;
}

function transferEntity() {
  const page = transferPage();
  if (!page) {
    return null;
  }
  return { kind: page.kind, id: page.entityId };
}

function transferPanel() {
  const panels = [...document.querySelectorAll(".top-panel")].filter(transferVisible);
  const title = transferTitleNode();
  if (title) {
    const root = title.closest(".container, ptaf-card, ptaf-modal-body, section, ptaf-private");
    if (root) {
      const inside = panels.find((panel) => root.contains(panel));
      if (inside) {
        return inside;
      }
    }
  }
  if (panels.length) {
    return panels[panels.length - 1];
  }
  if (!title) {
    return null;
  }
  let node = title.parentElement;
  for (let guard = 0; node && guard < 6; guard += 1) {
    const buttons = [...node.querySelectorAll("ptaf-button, button.kbq-button")].filter(transferVisible);
    const search = node.querySelector("input, ptaf-search, [class*='search']");
    if (buttons.length && search) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function transferSlot(page) {
  if (page.mode === "rule") {
    const bar = transferRuleBar();
    if (bar) {
      return bar;
    }
  }
  const named = document.querySelector(".waf-modal-active .top-panel .rules-actions, .top-panel .rules-actions");
  if (named && transferVisible(named)) {
    return named;
  }
  const panel = transferPanel();
  if (!panel) {
    return null;
  }
  const local = panel.querySelector(".rules-actions, .rules-action");
  if (local && transferVisible(local)) {
    return local;
  }
  const buttons = [...panel.querySelectorAll("ptaf-button, button.kbq-button")].filter(transferVisible);
  if (!buttons.length) {
    return panel;
  }
  return buttons[buttons.length - 1].parentElement || panel;
}

function transferMount(slot, host) {
  const buttons = [...slot.querySelectorAll(":scope > ptaf-button, :scope > button")].filter(transferVisible);
  const anchor = buttons.length ? buttons[buttons.length - 1] : null;
  if (anchor) {
    slot.insertBefore(host, anchor);
    return;
  }
  slot.append(host);
}

function transferClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function transferToast(message) {
  if (typeof showToast === "function") {
    showToast(message);
  }
}

function transferFail(error) {
  const message = (error && error.message) || "Не удалось выполнить запрос.";
  transferToast(message.length > 280 ? `${message.slice(0, 280)}…` : message);
}

function transferMiss(error) {
  const status = error && error.status;
  return status === 403 || status === 404 || status === 405 || status === 422;
}

function transferFileName(name) {
  const clean = String(name || "rule")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${clean || "rule"}.json`;
}

function transferDownload(name, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function transferUnique(values) {
  const seen = new Set();
  const next = [];
  for (const value of values || []) {
    if (typeof value !== "string" || !value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }
  return next;
}

function transferApplyMap(value, map) {
  if (typeof value === "string") {
    return value.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      (id) => map.get(id.toLowerCase()) || id
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => transferApplyMap(item, map));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      next[key] = transferApplyMap(value[key], map);
    }
    return next;
  }
  return value;
}

function transferOwnIds(details) {
  const ids = new Set();
  const add = (id) => {
    if (typeof id === "string" && id) {
      ids.add(id.toLowerCase());
    }
  };
  add(details && details.id);
  add(details && details.rule_group_id);
  const parameters = details && details.configuration && details.configuration.parameters;
  for (const param of parameters || []) {
    add(param && param.id);
  }
  return ids;
}

function transferCollectRefs(payload, catalogs, skip) {
  const actions = new Map();
  const lists = new Map();
  const classifiers = new Map();
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const text = JSON.stringify(payload);
  let match = re.exec(text);
  while (match) {
    const id = match[0].toLowerCase();
    if (!skip || !skip.has(id)) {
      if (catalogs.actions.has(id)) {
        actions.set(id, catalogs.actions.get(id));
      } else if (catalogs.lists.has(id)) {
        lists.set(id, catalogs.lists.get(id));
      } else if (catalogs.classifiers.has(id)) {
        classifiers.set(id, catalogs.classifiers.get(id));
      }
    }
    match = re.exec(text);
  }
  return {
    actions: [...actions.values()],
    global_lists: [...lists.values()],
    classifiers: [...classifiers.values()],
  };
}

function transferActionIds(details) {
  if (details && Array.isArray(details.actions)) {
    return details.actions.slice();
  }
  const configured = details && details.configuration && details.configuration.actions;
  if (Array.isArray(configured)) {
    return configured.slice();
  }
  return [];
}

function transferUserPayload(details, aggregation, catalogs) {
  const configuration = details.configuration || {};
  const event = details.event || {};
  const classifications = Array.isArray(event.classifications) ? event.classifications : [];
  const ruleEvent = {
    class: event.class,
    threat: event.threat,
    tags: Array.isArray(event.tags) ? event.tags : [],
  };
  if (classifications.length) {
    ruleEvent.classifications = classifications;
  }
  const payload = {
    format: "ptaf-rule",
    version: 1,
    kind: "user",
    rule: {
      name: details.name,
      description: details.description == null ? null : details.description,
      enabled: details.enabled !== false,
      event: ruleEvent,
      configuration: {
        code: configuration.code || "",
        actions: Array.isArray(configuration.actions) ? configuration.actions : [],
        parameters: (configuration.parameters || []).filter(Boolean).map((param) => ({
          name: param.name,
          display_name: param.display_name || param.name,
          value: param.value,
        })),
      },
    },
    aggregation: aggregation || null,
  };
  payload.refs = transferCollectRefs(payload, catalogs, transferOwnIds(details));
  return payload;
}

function transferSystemPayload(details, listed, aggregation, catalogs) {
  const payload = {
    format: "ptaf-rule",
    version: 1,
    kind: "system",
    identity: {
      name: details.name || (listed && listed.name) || "",
      rule_id: details.rule_id || (listed && listed.rule_id) || "",
    },
    state: {
      enabled: details.enabled !== false,
      actions: transferActionIds(details),
      variables: details.variables && typeof details.variables === "object" ? details.variables : {},
    },
    aggregation: aggregation || null,
  };
  payload.refs = transferCollectRefs(payload, catalogs, transferOwnIds(details));
  return payload;
}

function transferCollections(entity) {
  const id = entity.id;
  if (entity.kind === "policy") {
    return [
      {
        user: true,
        list: `/config/policies/${id}/user_rules`,
        detail: (ruleId) => `/config/policies/${id}/user_rules/${ruleId}`,
        agg: (ruleId) => `/config/policies/${id}/user_rules/${ruleId}/aggregation`,
      },
      {
        user: false,
        list: `/config/policies/${id}/rules`,
        detail: (ruleId) => `/config/policies/${id}/rules/${ruleId}`,
        agg: (ruleId) => `/config/policies/${id}/rules/${ruleId}/aggregation`,
      },
    ];
  }
  return [
    {
      user: true,
      list: `/config/policies/templates/with_user_rules/${id}/rules`,
      detail: (ruleId) => `/config/policies/templates/with_user_rules/${id}/rules/${ruleId}`,
      agg: (ruleId) => `/config/policies/templates/with_user_rules/${id}/rules/${ruleId}/aggregation`,
    },
    {
      user: true,
      list: `/config/policies/templates/user/${id}/user_rules`,
      detail: (ruleId) => `/config/policies/templates/user/${id}/user_rules/${ruleId}`,
      agg: (ruleId) => `/config/policies/templates/user/${id}/user_rules/${ruleId}/aggregation`,
    },
    {
      user: false,
      list: `/config/policies/templates/user/${id}/rules`,
      detail: (ruleId) => `/config/policies/templates/user/${id}/rules/${ruleId}`,
      agg: (ruleId) => `/config/policies/templates/user/${id}/rules/${ruleId}/aggregation`,
    },
  ];
}

async function transferFindInCollection(collection, ref) {
  if (!ref) {
    return null;
  }
  try {
    const details = await api(collection.detail(ref));
    if (details && details.id) {
      return {
        collection,
        listed: { id: details.id, name: details.name, rule_id: details.rule_id },
        details,
      };
    }
  } catch (error) {
    if (!transferMiss(error)) {
      throw error;
    }
  }
  try {
    const listed = itemsOf(await api(collection.list)).find((rule) => rule && (rule.id === ref || rule.rule_id === ref));
    if (!listed || !listed.id || listed.id === ref) {
      return null;
    }
    return { collection, listed, details: await api(collection.detail(listed.id)) };
  } catch (error) {
    if (transferMiss(error)) {
      return null;
    }
    throw error;
  }
}

async function transferFillEntity(page) {
  if (!page || page.entityId || page.kind === "policy" || page.kind === "template") {
    return page;
  }
  try {
    const templates = itemsOf(await api("/config/policies/templates/with_user_rules")).filter((item) => item && item.id);
    if (templates.length === 1) {
      return { ...page, kind: "user-rules", entityId: templates[0].id };
    }
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw error;
    }
  }
  return page;
}

function transferOpenRuleName() {
  const modal = transferActiveModal();
  const editor = transferRuleEditorNode();
  const root = modal
    || (editor && (editor.closest("ptaf-card, ptaf-modal-body, form, section, main, .container") || editor.parentElement))
    || document.body;
  const inputs = [...root.querySelectorAll("input")].filter((input) => transferVisible(input));
  for (const input of inputs) {
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();
    if ((placeholder.includes("групп") && placeholder.includes("правил")) || (placeholder.includes("group") && placeholder.includes("rule"))) {
      continue;
    }
    const field = input.closest("label, ptaf-input, kbq-form-field, [class*='field']");
    const label = ((field && field.innerText) || input.getAttribute("aria-label") || "").toLowerCase();
    if (!/имя|названи|\bname\b/.test(label)) {
      continue;
    }
    const value = (input.value || "").replace(/\s+/g, " ").trim();
    if (value && value.length < 300 && !TRANSFER_USER_RULES_TITLE.test(value)) {
      return value;
    }
  }
  const headings = root.querySelectorAll("h1, h2, h3, ptaf-form-card-header, ptaf-card-header, [class*='title']");
  for (const header of headings) {
    if (header.closest && header.closest(`#${TRANSFER_BAR_ID}, #${TRANSFER_DOWNLOAD_ID}, #${TRANSFER_DIALOG_ID}`)) {
      continue;
    }
    if (header.childElementCount > 6) {
      continue;
    }
    const text = (header.innerText || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 240 || TRANSFER_USER_RULES_TITLE.test(text)) {
      continue;
    }
    if (/добавить правило|скачать правило|загрузить json|выгрузить json/i.test(text)) {
      continue;
    }
    const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
    const name = parts.length ? parts[parts.length - 1] : "";
    if (name && !TRANSFER_USER_RULES_TITLE.test(name) && !/^(действия|параметры|событие|агрегация|описание|условия|код|основное)$/i.test(name)) {
      return name;
    }
  }
  return "";
}

async function transferFindRuleByName(page, name) {
  for (const collection of transferCollections(page)) {
    try {
      const listed = itemsOf(await api(collection.list)).find((rule) => rule && rule.name === name);
      if (listed && listed.id) {
        return listed.id;
      }
    } catch (error) {
      if (error.status === 401) {
        throw error;
      }
    }
  }
  return "";
}

async function transferLocate(page) {
  let current = await transferFillEntity(page);
  if (current && !current.ruleRef) {
    const name = transferOpenRuleName();
    if (name && current.entityId) {
      const ruleId = await transferFindRuleByName(current, name);
      if (ruleId) {
        current = { ...current, ruleRef: ruleId };
      }
    }
  }
  if (!current || !current.ruleRef) {
    throw new Error("Откройте правило ещё раз: в адресе страницы нет его идентификатора.");
  }
  const found = [];
  for (const collection of transferCollections(current)) {
    const hit = await transferFindInCollection(collection, current.ruleRef);
    if (hit) {
      found.push(hit);
    }
  }
  const exact = found.find((hit) => hit.details && hit.details.id === current.ruleRef);
  const hit = exact || found[0];
  if (!hit) {
    throw new Error("Правило не найдено в открытой политике или шаблоне.");
  }
  let aggregation = null;
  try {
    aggregation = await api(hit.collection.agg(hit.details.id));
  } catch (error) {
    if (error.status === 401) {
      throw error;
    }
    aggregation = null;
  }
  return { ...hit, aggregation };
}

async function transferLoadCatalogs() {
  const [actionsBody, typesBody, listsBody] = await Promise.all([
    api("/config/actions"),
    api("/config/action_types"),
    api("/config/global_lists"),
  ]);
  let classifierItems = [];
  try {
    classifierItems = itemsOf(await api("/config/classifiers"));
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw error;
    }
  }
  const typeById = new Map();
  for (const type of itemsOf(typesBody)) {
    if (type && type.id) {
      typeById.set(type.id, type);
    }
  }
  const actions = new Map();
  for (const action of itemsOf(actionsBody)) {
    if (!action || !action.id) {
      continue;
    }
    const type = typeById.get(action.type_id) || {};
    actions.set(action.id.toLowerCase(), {
      id: action.id,
      name: action.name || action.id,
      type_key: type.key || "",
      type_name: type.name || "",
      is_system: Boolean(action.is_system),
      type: "",
    });
  }
  const lists = new Map();
  for (const list of itemsOf(listsBody)) {
    if (!list || !list.id) {
      continue;
    }
    lists.set(list.id.toLowerCase(), {
      id: list.id,
      name: list.name || list.id,
      type_key: "",
      type_name: "",
      is_system: Boolean(list.is_system),
      type: list.type || "",
    });
  }
  const classifiers = new Map();
  for (const classifier of classifierItems) {
    if (!classifier || !classifier.id) {
      continue;
    }
    classifiers.set(classifier.id.toLowerCase(), {
      id: classifier.id,
      name: classifier.name || classifier.id,
      type_key: "",
      type_name: "",
      is_system: false,
      type: "",
    });
  }
  return { actions, lists, classifiers };
}

function transferIsUser(hit) {
  const configuration = hit.details && hit.details.configuration;
  return Boolean(hit.collection && hit.collection.user) || Boolean(configuration && typeof configuration.code === "string");
}

async function transferExport(button) {
  if (transferState.exporting) {
    return;
  }
  const page = transferPage();
  if (!page || page.mode !== "rule") {
    transferToast("Откройте правило, которое нужно выгрузить.");
    return;
  }
  transferState.exporting = true;
  button.disabled = true;
  try {
    const hit = await transferLocate(page);
    if (!transferIsUser(hit)) {
      throw new Error("Выгрузить можно только пользовательское правило.");
    }
    const catalogs = await transferLoadCatalogs();
    const payload = transferUserPayload(hit.details, hit.aggregation, catalogs);
    const name = (payload.rule && payload.rule.name) || (payload.identity && payload.identity.name) || "rule";
    transferDownload(transferFileName(name), payload);
    const actions = payload.refs.actions.length;
    const lists = payload.refs.global_lists.length;
    transferToast(`Правило «${name}» выгружено. Действий: ${actions}, списков: ${lists}.`);
  } catch (error) {
    transferFail(error);
  } finally {
    transferState.exporting = false;
    if (button.isConnected) {
      button.disabled = false;
    }
  }
}

async function transferResolveTemplateId(ruleName) {
  const templates = itemsOf(await api("/config/policies/templates/with_user_rules")).filter((item) => item && item.id);
  const routeIds = new Set(transferRouteIds().map((id) => id.toLowerCase()));
  const routed = templates.filter((item) => routeIds.has(String(item.id).toLowerCase()));
  if (routed.length === 1) {
    return routed[0].id;
  }
  if (templates.length === 1) {
    return templates[0].id;
  }
  const pool = routed.length ? routed : templates;
  if (!ruleName) {
    return pool[0] ? pool[0].id : "";
  }
  for (const template of pool) {
    const rules = itemsOf(await api(`/config/policies/templates/with_user_rules/${template.id}/rules`));
    if (rules.some((rule) => rule && rule.name === ruleName)) {
      return template.id;
    }
  }
  return "";
}

async function transferExportByName(name, button) {
  const ruleName = String(name || "").replace(/\s+/g, " ").trim();
  if (!ruleName) {
    transferToast("Не удалось прочитать имя правила.");
    return;
  }
  if (transferState.exporting) {
    return;
  }
  transferState.exporting = true;
  if (button) {
    button.disabled = true;
  }
  try {
    const templateId = await transferResolveTemplateId(ruleName);
    if (!templateId) {
      throw new Error("Не удалось определить набор пользовательских правил.");
    }
    const listed = itemsOf(await api(`/config/policies/templates/with_user_rules/${templateId}/rules`))
      .find((rule) => rule && rule.name === ruleName);
    if (!listed || !listed.id) {
      throw new Error(`Правило «${ruleName}» не найдено в наборе.`);
    }
    const details = await api(`/config/policies/templates/with_user_rules/${templateId}/rules/${listed.id}`);
    let aggregation = null;
    try {
      aggregation = await api(`/config/policies/templates/with_user_rules/${templateId}/rules/${listed.id}/aggregation`);
    } catch (error) {
      if (error.status === 401) {
        throw error;
      }
    }
    const catalogs = await transferLoadCatalogs();
    const payload = transferUserPayload(details, aggregation, catalogs);
    transferDownload(transferFileName(ruleName), payload);
    transferToast(`Правило «${ruleName}» выгружено. Действий: ${payload.refs.actions.length}, списков: ${payload.refs.global_lists.length}.`);
  } catch (error) {
    transferFail(error);
  } finally {
    transferState.exporting = false;
    if (button && button.isConnected) {
      button.disabled = false;
    }
  }
}

function transferPutRef(map, item) {
  if (!item || typeof item.id !== "string" || !TRANSFER_UUID_TEST.test(item.id)) {
    return;
  }
  const prev = map.get(item.id.toLowerCase());
  const name = item.name && item.name !== item.id ? item.name : (prev && prev.name) || item.name || item.id;
  map.set(item.id.toLowerCase(), {
    id: (prev && prev.id) || item.id,
    name,
    type_key: item.type_key || (prev && prev.type_key) || "",
    type_name: item.type_name || (prev && prev.type_name) || "",
    is_system: Boolean(item.is_system || (prev && prev.is_system)),
    type: item.type || (prev && prev.type) || "",
  });
}

function transferRefsFromDoc(doc) {
  const actions = new Map();
  const lists = new Map();
  const classifiers = new Map();
  const rule = doc.rule || {};
  const configuration = rule.configuration || {};
  const actionIds = Array.isArray(configuration.actions)
    ? configuration.actions
    : (doc.state && doc.state.actions) || [];
  for (const id of actionIds) {
    transferPutRef(actions, { id, name: id });
  }
  for (const param of configuration.parameters || []) {
    const value = param && param.value;
    if (value && typeof value.type === "string" && value.type.indexOf("GLOBAL_LIST") === 0) {
      transferPutRef(lists, { id: value.value, name: value.value });
    }
  }
  if (doc.aggregation && doc.aggregation.global_list_id) {
    transferPutRef(lists, { id: doc.aggregation.global_list_id, name: doc.aggregation.global_list_id });
  }
  for (const id of (rule.event && rule.event.classifications) || []) {
    transferPutRef(classifiers, { id, name: id });
  }
  const refs = doc.refs || {};
  for (const item of refs.actions || []) {
    transferPutRef(actions, item);
  }
  for (const item of refs.global_lists || []) {
    transferPutRef(lists, item);
  }
  for (const item of refs.classifiers || []) {
    transferPutRef(classifiers, item);
  }
  // Ссылки, которые есть только внутри кода, приходят из refs и уже добавлены выше.
  return {
    actions: [...actions.values()],
    lists: [...lists.values()],
    classifiers: [...classifiers.values()],
  };
}

function transferListType(type) {
  if (type === "DYNAMIC") {
    return "динамический";
  }
  if (type === "STATIC") {
    return "статический";
  }
  return "";
}

function transferSameLabel(left, right) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalize(left) !== "" && normalize(left) === normalize(right);
}

function transferOptionLabel(item) {
  const name = item.name || item.id;
  const bits = [name];
  const typeLabel = item.type_name || item.type_key || "";
  if (typeLabel && !transferSameLabel(typeLabel, name)) {
    bits.push(typeLabel);
  }
  const listType = transferListType(item.type);
  if (listType) {
    bits.push(listType);
  }
  if (item.is_system) {
    bits.push("системное");
  }
  return bits.join(" · ");
}

function transferCompatible(source, item) {
  if (source.type_key && item.type_key) {
    return source.type_key === item.type_key;
  }
  if (source.type && item.type) {
    return source.type === item.type;
  }
  return true;
}

function transferSuggest(source, options) {
  if (!options.length) {
    return { id: "", reason: "На этой инсталляции нет объектов этого типа." };
  }
  const sameId = options.find((item) => String(item.id).toLowerCase() === String(source.id).toLowerCase());
  if (sameId) {
    return { id: sameId.id, reason: "Тот же идентификатор уже есть на этой инсталляции." };
  }
  const sameName = options.filter((item) => item.name === source.name);
  const sameKind = sameName.filter((item) => transferCompatible(source, item));
  if (sameKind.length === 1) {
    return { id: sameKind[0].id, reason: "На инсталляции один объект с таким именем." };
  }
  if (sameKind.length > 1) {
    return { id: "", reason: "Несколько объектов с таким именем. Выберите, какой подставить." };
  }
  if (sameName.length) {
    return { id: "", reason: "Имя совпало, но тип другой. Выберите замену." };
  }
  return { id: "", reason: "Объекта с таким именем нет. Выберите замену." };
}

function transferBuildRows(doc, catalogs) {
  const refs = transferRefsFromDoc(doc);
  const groups = [
    ["actions", refs.actions, [...catalogs.actions.values()]],
    ["lists", refs.lists, [...catalogs.lists.values()]],
    ["classifiers", refs.classifiers, [...catalogs.classifiers.values()]],
  ];
  const rows = [];
  for (const [kind, sources, options] of groups) {
    const sorted = options.slice().sort((left, right) => (left.name || "").localeCompare(right.name || "", "ru"));
    for (const source of sources) {
      const suggestion = transferSuggest(source, sorted);
      rows.push({
        kind,
        source,
        options: sorted,
        chosen: suggestion.id,
        reason: suggestion.reason,
        matched: Boolean(suggestion.id),
      });
    }
  }
  return rows;
}

function transferParseFile(text) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Файл не является JSON.");
  }
  if (!data || data.format !== "ptaf-rule" || data.version !== 1) {
    throw new Error("Файл не похож на выгрузку правила PT AF.");
  }
  if (data.kind !== "user") {
    throw new Error("Загрузить можно только пользовательское правило.");
  }
  if (!data.rule || !data.rule.name || !data.rule.event || !data.rule.configuration) {
    throw new Error("В файле нет описания пользовательского правила.");
  }
  return data;
}

async function transferTemplates() {
  return itemsOf(await api("/config/policies/templates/with_user_rules"))
    .filter((item) => item && item.id)
    .map((item) => ({ id: item.id, name: item.name || item.id }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

async function transferLinkedTemplate(templateId, ids) {
  if (ids.has(templateId)) {
    return templateId;
  }
  try {
    const template = await api(`/config/policies/templates/user/${templateId}`);
    for (const id of (template && template.templates) || []) {
      if (ids.has(id)) {
        return id;
      }
    }
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw error;
    }
  }
  return "";
}

async function transferPreferredTemplate(templates) {
  const ids = new Set(templates.map((item) => item.id));
  const page = transferEntity();
  if (page && ids.has(page.id)) {
    return page.id;
  }
  if (page && page.kind === "policy") {
    try {
      const policy = await api(`/config/policies/${page.id}`);
      if (policy && ids.has(policy.template_id)) {
        return policy.template_id;
      }
      if (policy && policy.template_id) {
        const linked = await transferLinkedTemplate(policy.template_id, ids);
        if (linked) {
          return linked;
        }
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        throw error;
      }
    }
  }
  if (page && page.kind === "template") {
    const linked = await transferLinkedTemplate(page.id, ids);
    if (linked) {
      return linked;
    }
  }
  return templates.length ? templates[0].id : "";
}

async function transferRefreshExisting() {
  transferState.existing = null;
  const doc = transferState.doc;
  if (!doc || doc.kind !== "user" || !transferState.templateId) {
    return;
  }
  const items = itemsOf(await api(`/config/policies/templates/with_user_rules/${transferState.templateId}/rules`));
  transferState.existing = items.find((rule) => rule && rule.name === doc.rule.name) || null;
}

async function transferFindSystem(doc) {
  const page = transferEntity();
  if (!page) {
    throw new Error("Откройте политику или шаблон, куда нужно загрузить правило.");
  }
  const identity = doc.identity || {};
  for (const collection of transferCollections(page).filter((item) => !item.user)) {
    let items = [];
    try {
      items = itemsOf(await api(collection.list));
    } catch (error) {
      if (transferMiss(error)) {
        continue;
      }
      throw error;
    }
    let found = identity.rule_id
      ? items.find((rule) => rule && (rule.rule_id === identity.rule_id || rule.id === identity.rule_id))
      : null;
    let by = found ? "rule_id" : "";
    if (!found && identity.name) {
      found = items.find((rule) => rule && rule.name === identity.name);
      by = found ? "name" : "";
    }
    if (found && found.id) {
      return {
        id: found.id,
        name: found.name || identity.name || found.id,
        detail: collection.detail(found.id),
        agg: collection.agg(found.id),
        by,
      };
    }
  }
  return null;
}

function transferMap() {
  const map = new Map();
  for (const row of transferState.rows) {
    if (row.source.id && row.chosen) {
      map.set(row.source.id.toLowerCase(), row.chosen);
    }
  }
  return map;
}

function transferAggregation(aggregation, map) {
  if (!aggregation || typeof aggregation !== "object") {
    return null;
  }
  const next = transferApplyMap(transferClone(aggregation), map);
  const count = transferFinite(next.count);
  const interval = transferFinite(next.interval);
  const blacklistTtl = transferFinite(next.blacklist_ttl);
  if (typeof next.enabled !== "boolean" || !next.global_list_id || count == null || interval == null || blacklistTtl == null) {
    return null;
  }
  return {
    enabled: next.enabled,
    count,
    interval,
    blacklist_ttl: blacklistTtl,
    global_list_id: next.global_list_id,
  };
}

function transferFinite(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function transferCanSubmit() {
  if (transferState.loading || transferState.writing || !transferState.doc) {
    return false;
  }
  if (transferState.rows.some((row) => row.kind !== "actions" && !row.chosen)) {
    return false;
  }
  if (transferActionConflict()) {
    return false;
  }
  if (transferState.doc.kind === "user") {
    return Boolean(transferState.templateId);
  }
  return Boolean(transferState.targetRule);
}

function transferKeptActions(actions) {
  if (Array.isArray(transferState.actionPick)) {
    return transferUnique(transferState.actionPick);
  }
  const drop = new Set();
  for (const row of transferState.rows) {
    if (row.kind === "actions" && row.source && row.source.id && !row.chosen) {
      drop.add(String(row.source.id).toLowerCase());
    }
  }
  return transferUnique((actions || []).filter((id) => typeof id === "string" && !drop.has(id.toLowerCase())));
}

function transferSeedActions(catalogs) {
  transferState.actionOptions = [...catalogs.actions.values()].sort((left, right) => (left.name || "").localeCompare(right.name || "", "ru"));
  const seen = new Set();
  const pick = [];
  for (const row of transferState.rows) {
    if (row.kind !== "actions" || !row.chosen) {
      continue;
    }
    const key = String(row.chosen).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    pick.push(row.chosen);
  }
  transferState.actionPick = pick;
  transferState.actionsOpen = false;
  transferState.actionNotice = transferActionNoticeText();
}

function transferActionPicked(id) {
  const key = String(id).toLowerCase();
  return (transferState.actionPick || []).some((item) => String(item).toLowerCase() === key);
}

function transferToggleAction(id, open) {
  const key = String(id).toLowerCase();
  const adding = !transferActionPicked(id);
  const item = transferState.actionOptions.find((option) => String(option.id).toLowerCase() === key);
  if (adding && transferActionBlocked(item)) {
    const group = transferActionGroup(item);
    transferState.actionNotice = group === "log" ? TRANSFER_LOG_CONFLICT : TRANSFER_RESPONSE_CONFLICT;
    if (typeof open === "boolean") {
      transferState.actionsOpen = open;
    }
    transferRenderDialog();
    return;
  }
  const pick = transferState.actionPick || [];
  transferState.actionPick = adding
    ? pick.concat(id)
    : pick.filter((value) => String(value).toLowerCase() !== key);
  transferState.actionNotice = transferActionNoticeText();
  if (typeof open === "boolean") {
    transferState.actionsOpen = open;
  }
  transferRenderDialog();
}

async function transferWrite() {
  const doc = transferState.doc;
  const map = transferMap();
  if (doc.kind === "user") {
    const rule = transferApplyMap(transferClone(doc.rule), map);
    const event = {
      class: rule.event.class,
      threat: rule.event.threat,
      tags: Array.isArray(rule.event.tags) ? rule.event.tags : [],
    };
    if (Array.isArray(rule.event.classifications) && rule.event.classifications.length) {
      event.classifications = transferUnique(rule.event.classifications);
    }
    const body = {
      name: rule.name,
      description: rule.description == null ? null : rule.description,
      event,
      configuration: {
        code: rule.configuration.code || "",
        actions: transferKeptActions(rule.configuration.actions),
        parameters: (rule.configuration.parameters || []).filter(Boolean).map((param) => ({
          name: param.name,
          display_name: param.display_name || param.name,
          value: param.value,
        })),
      },
    };
    const root = `/config/policies/templates/with_user_rules/${transferState.templateId}/rules`;
    let id = "";
    let updated = false;
    if (transferState.existing && transferState.existing.id) {
      id = transferState.existing.id;
      updated = true;
      await api(`${root}/${id}`, {
        method: "PATCH",
        body: { ...body, enabled: rule.enabled },
      });
    } else {
      const created = await api(root, { method: "POST", body });
      id = created && created.id;
      if (!id) {
        throw new Error("Стенд создал правило, но не вернул его идентификатор.");
      }
      if (typeof rule.enabled === "boolean") {
        await api(`${root}/${id}`, { method: "PATCH", body: { enabled: rule.enabled } });
      }
    }
    const aggregation = transferAggregation(doc.aggregation, map);
    if (aggregation) {
      await api(`${root}/${id}/aggregation`, { method: "PATCH", body: aggregation });
    }
    return updated ? `Правило «${rule.name}» обновлено.` : `Правило «${rule.name}» загружено.`;
  }
  throw new Error("Загрузить можно только пользовательское правило.");
}

function transferCloseDialog() {
  if (transferState.writing) {
    return;
  }
  const host = document.getElementById(TRANSFER_DIALOG_ID);
  if (host) {
    host.remove();
  }
  transferState.token += 1;
  transferState.doc = null;
  transferState.rows = [];
  transferState.error = "";
  transferState.actionOptions = [];
  transferState.actionPick = null;
  transferState.actionsOpen = false;
  transferState.actionNotice = "";
}

function transferLead() {
  const doc = transferState.doc;
  if (!doc) {
    return "";
  }
  if (doc.kind === "user") {
    const where = transferState.existing
      ? "Правило с таким именем уже есть в наборе пользовательских правил. Загрузка обновит его."
      : "Правило будет создано в наборе пользовательских правил.";
    return `Пользовательское правило «${doc.rule.name}». ${where} Действия и списки ниже нужно сопоставить с объектами этой инсталляции.`;
  }
  const name = (doc.identity && (doc.identity.name || doc.identity.rule_id)) || "правило";
  if (!transferState.targetRule) {
    return `Системное правило «${name}». В открытой политике или шаблоне нет правила с таким идентификатором или именем.`;
  }
  const how = transferState.targetRule.by === "name"
    ? "Идентификатор набора не найден, совпало имя."
    : "Правило найдено по идентификатору набора.";
  return `Системное правило «${name}». ${how} Будет обновлено «${transferState.targetRule.name}».`;
}

function transferSectionTitle(kind) {
  if (kind === "actions") {
    return "Действия";
  }
  if (kind === "lists") {
    return "Динамические списки";
  }
  return "Классификаторы";
}

function transferChipLabel(item) {
  const name = (item && (item.name || item.id)) || "";
  return item && item.is_system ? `${name} (system)` : name;
}

function transferActionMissText(source) {
  const name = (source && (source.name || source.id)) || "действие";
  const type = (source && (source.type_name || source.type_key)) || "";
  if (type && !transferSameLabel(type, name)) {
    return `Действие «${name}» «${type}» отсутствует в тенанте, выберите ему замену.`;
  }
  return `Действие «${name}» отсутствует в тенанте, выберите ему замену.`;
}

function transferActionGroup(item) {
  const key = String((item && item.type_key) || "").toLowerCase();
  const name = `${(item && item.type_name) || ""} ${(item && item.name) || ""}`.toLowerCase();
  if (key === "log" || key === "log_to_db" || /log to db/.test(name)) {
    return "log";
  }
  if (key === "close" || key === "send_rst" || key.includes("rst") || key.includes("close") || /send rst|close connection|tcp rst/.test(name)) {
    return "close";
  }
  if (key === "custom_response" || key.includes("response") || /\bblock\b|custom response/.test(name)) {
    return "response";
  }
  return "";
}

const TRANSFER_RESPONSE_CONFLICT = "Нельзя одновременно использовать Custom response и Close connection. Оставьте одно из этих действий.";
const TRANSFER_LOG_CONFLICT = "Нельзя использовать два действия типа Log. Оставьте одно из них.";

function transferPickedItems() {
  return transferState.actionOptions.filter((item) => transferActionPicked(item.id));
}

function transferActionProblems() {
  const picked = transferPickedItems();
  const groups = new Set();
  let logs = 0;
  for (const item of picked) {
    const group = transferActionGroup(item);
    if (group) {
      groups.add(group);
    }
    if (group === "log") {
      logs += 1;
    }
  }
  const messages = [];
  if (groups.has("response") && groups.has("close")) {
    messages.push(TRANSFER_RESPONSE_CONFLICT);
  }
  if (logs > 1) {
    messages.push(TRANSFER_LOG_CONFLICT);
  }
  return messages;
}

function transferActionNoticeText() {
  return transferActionProblems().join(" ");
}

function transferActionConflict() {
  return transferActionProblems().length > 0;
}

function transferActionBlocked(item) {
  const group = transferActionGroup(item);
  if (!group || transferActionPicked(item && item.id)) {
    return false;
  }
  const picked = transferPickedItems();
  if (group === "log" && picked.some((option) => transferActionGroup(option) === "log")) {
    return true;
  }
  const groups = new Set(picked.map((option) => transferActionGroup(option)));
  return (group === "response" && groups.has("close")) || (group === "close" && groups.has("response"));
}

function transferActionSubtitle(item) {
  const type = (item && (item.type_name || item.type_key)) || "";
  if (type && !transferSameLabel(type, item.name || "")) {
    return type;
  }
  return "";
}

function transferRenderActions(section, rows) {
  for (const row of rows) {
    if (row.matched) {
      continue;
    }
    const note = document.createElement("p");
    note.className = "ptaf-transfer-reason";
    note.textContent = transferActionMissText(row.source);
    section.append(note);
  }
  const field = document.createElement("div");
  field.className = "ptaf-transfer-multiselect";
  const box = document.createElement("div");
  box.className = "ptaf-transfer-chips";
  box.tabIndex = 0;
  box.setAttribute("role", "combobox");
  box.setAttribute("aria-expanded", transferState.actionsOpen ? "true" : "false");
  const picked = transferState.actionOptions.filter((item) => transferActionPicked(item.id));
  if (!picked.length) {
    const empty = document.createElement("span");
    empty.className = "ptaf-transfer-chips-empty";
    empty.textContent = "Выберите действия";
    box.append(empty);
  }
  for (const item of picked) {
    const chip = document.createElement("span");
    chip.className = "ptaf-transfer-chip";
    const label = document.createElement("span");
    label.textContent = transferChipLabel(item);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ptaf-transfer-chip-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Убрать ${transferChipLabel(item)}`);
    remove.disabled = transferState.writing;
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      transferToggleAction(item.id, transferState.actionsOpen);
    });
    chip.append(label, remove);
    box.append(chip);
  }
  const caret = document.createElement("span");
  caret.className = "ptaf-transfer-caret";
  caret.textContent = "▾";
  box.append(caret);
  box.addEventListener("click", () => {
    if (transferState.writing) {
      return;
    }
    transferState.actionsOpen = !transferState.actionsOpen;
    transferRenderDialog();
  });
  field.append(box);
  if (transferState.actionsOpen) {
    const menu = document.createElement("div");
    menu.className = "ptaf-transfer-menu";
    const options = transferState.actionOptions;
    if (!options.length) {
      const empty = document.createElement("p");
      empty.className = "ptaf-transfer-reason";
      empty.textContent = "В тенанте нет действий.";
      menu.append(empty);
    }
    for (const item of options) {
      const choice = document.createElement("label");
      choice.className = "ptaf-transfer-choice";
      if (transferActionPicked(item.id)) {
        choice.classList.add("is-selected");
      }
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = transferActionPicked(item.id);
      input.disabled = transferState.writing || transferActionBlocked(item);
      if (transferActionBlocked(item)) {
        choice.classList.add("is-locked");
        input.title = transferActionGroup(item) === "log" ? TRANSFER_LOG_CONFLICT : TRANSFER_RESPONSE_CONFLICT;
      }
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => transferToggleAction(item.id, true));
      const text = document.createElement("span");
      text.className = "ptaf-transfer-choice-text";
      const name = document.createElement("span");
      name.className = "ptaf-transfer-choice-name";
      name.textContent = transferChipLabel(item);
      text.append(name);
      const subtitle = transferActionSubtitle(item);
      if (subtitle) {
        const type = document.createElement("span");
        type.className = "ptaf-transfer-choice-type";
        type.textContent = subtitle;
        text.append(type);
      }
      choice.append(input, text);
      menu.append(choice);
    }
    field.append(menu);
    requestAnimationFrame(() => {
      const rect = box.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.width = `${rect.width}px`;
    });
  }
  section.append(field);
  if (transferState.actionNotice || transferActionConflict()) {
    const conflict = document.createElement("p");
    conflict.className = "ptaf-transfer-error";
    conflict.textContent = transferState.actionNotice || transferActionNoticeText();
    section.append(conflict);
  }
}

function transferRenderDialog() {
  const host = document.getElementById(TRANSFER_DIALOG_ID);
  const body = host && host.shadowRoot && host.shadowRoot.querySelector(".ptaf-transfer-body");
  if (!body) {
    return;
  }
  const theme = host.shadowRoot.querySelector(".ptaf-theme");
  if (theme && typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  body.replaceChildren();
  const title = document.createElement("h2");
  const doc = transferState.doc;
  const ruleName = doc && doc.kind === "user"
    ? doc.rule.name
    : (doc && doc.identity && doc.identity.name) || "";
  title.textContent = ruleName ? `Загрузка правила «${ruleName}»` : "Загрузка правила";
  body.append(title);

  if (transferState.loading) {
    const wait = document.createElement("p");
    wait.className = "ptaf-transfer-note";
    wait.textContent = "Читаю действия и списки этой инсталляции…";
    body.append(wait);
    return;
  }

  const lead = document.createElement("p");
  lead.className = "ptaf-transfer-lead";
  lead.textContent = transferLead();
  body.append(lead);

  let currentKind = "";
  let section = null;
  let actionRows = [];
  const flushActions = () => {
    if (!actionRows.length || !section) {
      actionRows = [];
      return;
    }
    transferRenderActions(section, actionRows);
    actionRows = [];
  };
  for (const row of transferState.rows) {
    if (row.kind !== currentKind) {
      flushActions();
      currentKind = row.kind;
      section = document.createElement("section");
      section.className = "ptaf-transfer-section";
      const heading = document.createElement("h3");
      heading.textContent = transferSectionTitle(row.kind);
      section.append(heading);
      body.append(section);
    }
    if (row.kind === "actions") {
      actionRows.push(row);
      continue;
    }
    const map = document.createElement("label");
    map.className = "ptaf-transfer-map";
    const source = document.createElement("span");
    source.className = "ptaf-transfer-source";
    source.textContent = transferOptionLabel(row.source);
    const select = document.createElement("select");
    select.className = "ptaf-transfer-select";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = row.options.length ? "Выберите замену" : "Нет объектов";
    select.append(placeholder);
    for (const option of row.options) {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = transferOptionLabel(option);
      node.selected = option.id === row.chosen;
      select.append(node);
    }
    select.disabled = transferState.writing || !row.options.length;
    select.addEventListener("change", () => {
      row.chosen = select.value;
      row.reason = select.value ? "Выбрана замена на этой инсталляции." : transferSuggest(row.source, row.options).reason;
      const reason = map.querySelector(".ptaf-transfer-reason");
      if (reason) {
        reason.textContent = row.reason;
      }
      const submit = body.querySelector(".ptaf-transfer-submit");
      if (submit) {
        submit.disabled = !transferCanSubmit();
      }
    });
    const reason = document.createElement("p");
    reason.className = "ptaf-transfer-reason";
    reason.textContent = row.reason;
    map.append(source, select, reason);
    section.append(map);
  }
  flushActions();

  if (doc && !transferState.rows.length) {
    const empty = document.createElement("p");
    empty.className = "ptaf-transfer-note";
    empty.textContent = "В правиле нет ссылок на действия, списки и классификаторы. Его можно загрузить как есть.";
    body.append(empty);
  }

  if (transferState.error) {
    const error = document.createElement("p");
    error.className = "ptaf-transfer-error";
    error.textContent = transferState.error;
    body.append(error);
  }

  const actions = document.createElement("div");
  actions.className = "ptaf-transfer-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ptaf-transfer-cancel";
  cancel.textContent = "Отмена";
  cancel.disabled = transferState.writing;
  cancel.addEventListener("click", () => transferCloseDialog());
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "ptaf-transfer-submit";
  submit.textContent = transferState.writing ? "Загрузка…" : "Загрузить";
  submit.disabled = !transferCanSubmit();
  submit.addEventListener("click", () => transferSubmit());
  actions.append(cancel, submit);
  body.append(actions);
}

function transferEnsureDialog() {
  const existing = document.getElementById(TRANSFER_DIALOG_ID);
  if (existing) {
    return existing;
  }
  const host = document.createElement("div");
  host.id = TRANSFER_DIALOG_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const theme = typeof attachUi === "function" ? attachUi(host) : null;
  if (!theme) {
    return null;
  }
  if (typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-transfer-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "ptaf-transfer-dialog";
  dialog.tabIndex = -1;
  const body = document.createElement("div");
  body.className = "ptaf-transfer-body";
  dialog.append(body);
  backdrop.append(dialog);
  theme.append(backdrop);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      transferCloseDialog();
    }
  });
  dialog.addEventListener("click", (event) => {
    const path = event.composedPath ? event.composedPath() : [];
    const inside = path.some((node) => node.classList && (node.classList.contains("ptaf-transfer-multiselect") || node.classList.contains("ptaf-transfer-menu")));
    if (!inside && transferState.actionsOpen) {
      transferState.actionsOpen = false;
      transferRenderDialog();
    }
  });
  document.body.appendChild(host);
  dialog.focus();
  return host;
}

async function transferOpenImport(doc) {
  const token = transferState.token + 1;
  transferState.token = token;
  transferState.doc = doc;
  transferState.rows = [];
  transferState.templates = [];
  transferState.templateId = "";
  transferState.existing = null;
  transferState.targetRule = null;
  transferState.error = "";
  transferState.actionOptions = [];
  transferState.actionPick = null;
  transferState.actionsOpen = false;
  transferState.actionNotice = "";
  transferState.loading = true;
  transferState.writing = false;
  if (!transferEnsureDialog()) {
    transferFail(new Error("Не удалось открыть окно загрузки."));
    return;
  }
  transferRenderDialog();
  try {
    const catalogs = await transferLoadCatalogs();
    if (token !== transferState.token) {
      return;
    }
    transferState.rows = transferBuildRows(doc, catalogs);
    transferSeedActions(catalogs);
    if (doc.kind === "user") {
      transferState.templates = await transferTemplates();
      if (token !== transferState.token) {
        return;
      }
      transferState.templateId = await transferPreferredTemplate(transferState.templates);
      if (!transferState.templates.length) {
        transferState.error = "Нет шаблона пользовательских правил, куда можно загрузить правило.";
      } else {
        await transferRefreshExisting();
      }
    } else {
      transferState.targetRule = await transferFindSystem(doc);
      if (!transferState.targetRule) {
        transferState.error = "В открытой политике или шаблоне нет такого правила.";
      }
    }
  } catch (error) {
    if (token !== transferState.token) {
      return;
    }
    transferState.error = error.message || "Не удалось прочитать объекты инсталляции.";
  } finally {
    if (token === transferState.token) {
      transferState.loading = false;
      transferRenderDialog();
    }
  }
}

function transferPickFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    file.text().then((text) => transferOpenImport(transferParseFile(text))).catch((error) => {
      transferFail(error);
    });
  });
  input.click();
}

function transferPlainError(error) {
  const message = (error && error.message) || "";
  const parts = [];
  if (message.includes("combination_of_response_and_close_types_actions")) {
    parts.push(TRANSFER_RESPONSE_CONFLICT);
  }
  if (message.includes("multiple_log_type_actions")) {
    parts.push(TRANSFER_LOG_CONFLICT);
  }
  if (parts.length) {
    return parts.join(" ");
  }
  return message || "Не удалось загрузить правило.";
}

const TRANSFER_NOTICE_KEY = "ptaf-transfer-notice";

function transferInsideUserRules() {
  return Boolean(transferRulesSearch() || transferUserRulesAnchor() || transferEmptySetHeader());
}

function transferReloadAfterWrite(message) {
  try {
    sessionStorage.setItem(TRANSFER_NOTICE_KEY, JSON.stringify({
      message,
      reopen: transferInsideUserRules(),
    }));
  } catch (error) {
    transferToast(message);
    return;
  }
  location.reload();
}

function transferRestoreNotice() {
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(TRANSFER_NOTICE_KEY) || "null");
    sessionStorage.removeItem(TRANSFER_NOTICE_KEY);
  } catch (error) {
    stored = null;
  }
  if (!stored || !stored.message) {
    return;
  }
  if (!stored.reopen) {
    transferToast(stored.message);
    return;
  }
  const started = Date.now();
  let opened = false;
  const timer = window.setInterval(() => {
    if (transferRulesSearch()) {
      window.clearInterval(timer);
      transferToast(stored.message);
      return;
    }
    if (!opened) {
      const header = transferSetHeader();
      if (header && header.before) {
        header.before.click();
        opened = true;
      }
    }
    if (Date.now() - started > 8000) {
      window.clearInterval(timer);
      transferToast(stored.message);
    }
  }, 400);
}

async function transferSubmit() {
  if (!transferCanSubmit()) {
    return;
  }
  transferState.writing = true;
  transferState.error = "";
  transferRenderDialog();
  try {
    const message = await transferWrite();
    transferState.writing = false;
    transferCloseDialog();
    transferReloadAfterWrite(message);
  } catch (error) {
    transferState.writing = false;
    if (transferState.doc && transferState.doc.kind === "user") {
      try {
        await transferRefreshExisting();
      } catch (refreshError) {
        // Ошибка записи важнее, чем повторное чтение списка правил.
      }
    }
    transferState.error = transferPlainError(error);
    if (document.getElementById(TRANSFER_DIALOG_ID)) {
      transferRenderDialog();
    }
  }
}

function transferSyncTheme() {
  if (typeof pageTheme !== "function") {
    return;
  }
  const theme = pageTheme();
  for (const id of [TRANSFER_BAR_ID, TRANSFER_DIALOG_ID]) {
    const node = document.getElementById(id);
    const root = node && node.shadowRoot && node.shadowRoot.querySelector(".ptaf-theme");
    if (root) {
      root.dataset.theme = theme;
    }
  }
}

function transferRowName(row) {
  const leaves = [...row.querySelectorAll("span, a, div")].filter((node) => !node.children.length && !(node.closest && node.closest("[data-ptaf-rule-export], button, ptaf-button, kbq-slide-toggle, ptaf-slide-toggle")));
  const named = leaves.find((node) => {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return text && text.length < 300;
  });
  if (named) {
    return named.textContent.replace(/\s+/g, " ").trim();
  }
  const copy = row.cloneNode(true);
  copy.querySelectorAll("[data-ptaf-rule-export], button, ptaf-button, kbq-slide-toggle, ptaf-slide-toggle, input").forEach((node) => node.remove());
  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

function transferUserRulesView() {
  const anchor = transferUserRulesAnchor();
  if (!anchor) {
    return null;
  }
  let root = null;
  let node = anchor.parentElement;
  for (let guard = 0; node && node !== document.body && guard < 12; guard += 1) {
    const search = node.querySelector("input, textarea, ptaf-search, kbq-input, [placeholder], [class*='search']");
    const buttons = [...node.querySelectorAll("button, ptaf-button")].filter((button) => transferVisible(button) && !(button.closest && button.closest(`#${TRANSFER_BAR_ID}, [data-ptaf-rule-export]`)));
    if (search && buttons.length) {
      root = node;
      break;
    }
    node = node.parentElement;
  }
  if (!root) {
    return { anchor, root: anchor.parentElement, slot: anchor.parentElement, plus: null, search: null };
  }
  const search = root.querySelector("input, textarea, ptaf-search, kbq-input, [placeholder], [class*='search']");
  const searchRect = search && search.getBoundingClientRect ? search.getBoundingClientRect() : null;
  const buttons = [...root.querySelectorAll("button, ptaf-button")].filter((button) => {
    if (!transferVisible(button) || (button.closest && button.closest(`#${TRANSFER_BAR_ID}, [data-ptaf-rule-export]`))) {
      return false;
    }
    if (!searchRect) {
      return true;
    }
    return Math.abs(button.getBoundingClientRect().top - searchRect.top) < 56;
  });
  const plus = buttons.length ? buttons[buttons.length - 1] : null;
  const host = plus && (plus.closest("ptaf-button") || plus);
  return {
    anchor,
    root,
    search,
    plus,
    slot: host ? host.parentElement : root,
    before: host,
  };
}

function transferUserRuleRows(view) {
  if (!view || !view.root) {
    return [];
  }
  const searchBottom = view.search && view.search.getBoundingClientRect ? view.search.getBoundingClientRect().bottom : 0;
  const toggles = [...view.root.querySelectorAll("kbq-slide-toggle, ptaf-slide-toggle, [role='switch'], [class*='slide-toggle']")];
  const rows = [];
  for (const toggle of toggles) {
    if (!transferVisible(toggle) || toggle.getBoundingClientRect().top < searchBottom - 4) {
      continue;
    }
    let row = toggle.parentElement;
    for (let guard = 0; row && guard < 6; guard += 1) {
      const height = row.getBoundingClientRect().height;
      const name = transferRowName(row);
      if (name && height >= 24 && height <= 96) {
        if (!rows.includes(row)) {
          rows.push(row);
        }
        break;
      }
      row = row.parentElement;
    }
  }
  return rows;
}

const TRANSFER_DOWNLOAD_ID = "ptaf-transfer-download";
const TRANSFER_DOWNLOAD_LABEL = "Скачать правило в формате JSON";

function transferPlainButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = "box-sizing:border-box;flex:0 0 auto;align-self:center;height:32px;margin:0 8px 0 0;padding:0 12px;border:1px solid rgba(180,186,204,.45);border-radius:8px;background:transparent;color:inherit;font:13px/16px Inter,Segoe UI,sans-serif;white-space:nowrap;cursor:pointer;vertical-align:middle;";
  return button;
}

function transferRulesSearch() {
  const inputs = document.querySelectorAll("input, textarea");
  for (const input of inputs) {
    if (!transferVisible(input)) {
      continue;
    }
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();
    const groupAndRule = (placeholder.includes("групп") && placeholder.includes("правил"))
      || (placeholder.includes("group") && placeholder.includes("rule"));
    if (groupAndRule) {
      return input;
    }
  }
  return null;
}

function transferTopModal() {
  const nodes = [...document.querySelectorAll(".waf-modal-active")].filter((node) => transferLaidOut(node));
  return nodes.length ? nodes[nodes.length - 1] : null;
}

function transferHeaderText(node) {
  const copy = node.cloneNode(true);
  copy.querySelectorAll("button").forEach((button) => button.remove());
  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

function transferOpenUserRulesSet() {
  const surface = transferTopModal() || document.body;
  const headers = [...surface.querySelectorAll("ptaf-form-card-header .content")];
  for (let index = headers.length - 1; index >= 0; index -= 1) {
    const header = headers[index];
    if (header.closest("ptaf-user-rule-form-card, ptaf-user-rule-base-form")) {
      continue;
    }
    const text = transferHeaderText(header);
    if (!text || text.length > 160) {
      continue;
    }
    if (TRANSFER_USER_RULES_TITLE.test(text)) {
      return surface;
    }
    return null;
  }
  return null;
}

function transferSetToolbar() {
  const surface = transferOpenUserRulesSet();
  if (!surface) {
    return null;
  }
  const search = transferRulesSearch();
  if (!search || !surface.contains(search)) {
    return null;
  }
  const searchTop = search.getBoundingClientRect().top;
  let node = search.parentElement;
  for (let guard = 0; node && guard < 8; guard += 1) {
    const buttons = [...node.querySelectorAll("button, ptaf-button")].filter((button) => {
      if (!transferVisible(button) || (button.closest && button.closest(`#${TRANSFER_BAR_ID}, #${TRANSFER_DOWNLOAD_ID}`))) {
        return false;
      }
      return Math.abs(button.getBoundingClientRect().top - searchTop) < 48;
    });
    if (buttons.length) {
      const plus = buttons[buttons.length - 1];
      const before = plus.closest("ptaf-button") || plus;
      if (before.parentElement) {
        return { slot: before.parentElement, before };
      }
    }
    node = node.parentElement;
  }
  return null;
}

function transferSetHeader() {
  const anchor = transferUserRulesAnchor();
  if (!anchor || !transferVisible(anchor)) {
    return null;
  }
  const anchorTop = anchor.getBoundingClientRect().top;
  let node = anchor.parentElement;
  for (let guard = 0; node && guard < 6; guard += 1) {
    const height = node.getBoundingClientRect().height;
    if (height > 0 && height < 88) {
      const buttons = [...node.querySelectorAll("button, ptaf-button, a")].filter((button) => {
        if (!transferVisible(button) || button.id === TRANSFER_BAR_ID) {
          return false;
        }
        return Math.abs(button.getBoundingClientRect().top - anchorTop) < 28;
      });
      if (buttons.length) {
        const arrow = buttons[buttons.length - 1];
        const before = arrow.closest("ptaf-button") || arrow;
        if (before.parentElement) {
          return { slot: before.parentElement, before };
        }
      }
    }
    node = node.parentElement;
  }
  return null;
}

function transferEmptySetHeader() {
  const surface = transferOpenUserRulesSet();
  if (!surface) {
    return null;
  }
  const nodes = surface.querySelectorAll("ptaf-form-card-header .content");
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const content = nodes[index];
    if (!transferLaidOut(content) || (content.closest && content.closest("ptaf-user-rule-form-card, ptaf-user-rule-base-form, #" + TRANSFER_BAR_ID))) {
      continue;
    }
    const copy = content.cloneNode(true);
    copy.querySelectorAll("button").forEach((button) => button.remove());
    const text = (copy.textContent || "").replace(/\s+/g, " ").trim();
    if (TRANSFER_USER_RULES_TITLE.test(text)) {
      return { slot: content, before: null, header: true };
    }
  }
  return null;
}

function transferPlaceSetButton() {
  const toolbar = transferOpenUserRulesSet() ? (transferSetToolbar() || transferEmptySetHeader()) : null;
  const existing = document.getElementById(TRANSFER_BAR_ID);
  if (!toolbar) {
    if (existing && existing.dataset.place === "user-rules") {
      existing.remove();
    }
    return;
  }
  if (existing && existing.dataset.place === "user-rules" && existing.parentElement === toolbar.slot && (toolbar.header ? existing.nextElementSibling === null : existing.nextElementSibling === toolbar.before)) {
    if (existing.textContent !== "Добавить правило в формате JSON") {
      existing.textContent = "Добавить правило в формате JSON";
    }
    return;
  }
  if (existing) {
    existing.remove();
  }
  const button = transferPlainButton("Добавить правило в формате JSON");
  button.id = TRANSFER_BAR_ID;
  button.dataset.place = "user-rules";
  button.dataset.mode = "list";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    transferPickFile();
  });
  if (toolbar.header) {
    const display = getComputedStyle(toolbar.slot).display;
    if (display !== "flex" && display !== "inline-flex") {
      toolbar.slot.style.display = "flex";
      toolbar.slot.style.alignItems = "center";
    }
    button.style.height = "24px";
    button.style.margin = "0 0 0 auto";
    toolbar.slot.append(button);
    return;
  }
  if (toolbar.before && toolbar.before.parentElement === toolbar.slot) {
    toolbar.slot.insertBefore(button, toolbar.before);
  } else {
    toolbar.slot.append(button);
  }
}

function transferActiveModal() {
  const nodes = document.querySelectorAll(".waf-modal-active, ptaf-modal-layer.waf-modal-active");
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (transferLaidOut(nodes[index])) {
      return nodes[index];
    }
  }
  return null;
}

function transferRuleEditorNode() {
  const selectors = [
    "ptaf-code-editor",
    "ptaf-rule-code",
    "ptaf-user-rule",
    ".monaco-editor",
    "textarea.inputarea",
    "[class*='code-editor']",
  ];
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (transferVisible(node) && !(node.closest && node.closest(`#${TRANSFER_DIALOG_ID}`))) {
        return node;
      }
    }
  }
  for (const area of document.querySelectorAll("textarea")) {
    if (!transferVisible(area) || (area.closest && area.closest(`#${TRANSFER_DIALOG_ID}`))) {
      continue;
    }
    const placeholder = (area.getAttribute("placeholder") || "").toLowerCase();
    if (placeholder.includes("групп") && placeholder.includes("правил")) {
      continue;
    }
    return area;
  }
  return null;
}

function transferUserRuleHeader() {
  const nodes = document.querySelectorAll(
    "ptaf-user-rule-form-card ptaf-form-card-header .content, ptaf-user-rule-base-form ptaf-form-card-header .content"
  );
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const content = nodes[index];
    if (transferLaidOut(content) && !(content.closest && content.closest(`#${TRANSFER_DOWNLOAD_ID}`))) {
      return content;
    }
  }
  return null;
}

function transferUserRuleTitle() {
  const header = transferUserRuleHeader();
  if (!header) {
    return "";
  }
  const copy = header.cloneNode(true);
  copy.querySelectorAll("button").forEach((button) => button.remove());
  const text = (copy.textContent || "").replace(/\s+/g, " ").trim();
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : "";
  if (!name || TRANSFER_USER_RULES_TITLE.test(name)) {
    return "";
  }
  return name;
}

function transferRuleDownloadSlot() {
  const header = transferUserRuleHeader();
  if (!header) {
    return null;
  }
  return { slot: header, before: null, header: true };
}

function transferBindDownload(button) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const userRuleName = transferUserRuleTitle();
    if (!userRuleName) {
      transferToast("Выгрузить можно только пользовательское правило.");
      return;
    }
    transferExportByName(userRuleName, button);
  });
}

function transferPlaceRuleDownload() {
  const place = transferRuleDownloadSlot();
  const existing = document.getElementById(TRANSFER_DOWNLOAD_ID);
  if (!place) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const sameFlow = !place.fixed && existing && existing.dataset.fixed !== "1" && existing.parentElement === place.slot && existing.nextElementSibling === place.before;
  const sameFixed = place.fixed && existing && existing.dataset.fixed === "1";
  if (sameFlow || sameFixed) {
    if (existing.textContent !== TRANSFER_DOWNLOAD_LABEL) {
      existing.textContent = TRANSFER_DOWNLOAD_LABEL;
    }
    return;
  }
  if (existing) {
    existing.remove();
  }
  const button = transferPlainButton(TRANSFER_DOWNLOAD_LABEL);
  button.id = TRANSFER_DOWNLOAD_ID;
  transferBindDownload(button);
  if (place.header) {
    const display = getComputedStyle(place.slot).display;
    if (display !== "flex" && display !== "inline-flex") {
      place.slot.style.display = "flex";
      place.slot.style.alignItems = "center";
    }
    button.style.height = "24px";
    button.style.margin = "0 0 0 auto";
    place.slot.append(button);
    return;
  }
  if (place.before && place.before.parentElement === place.slot) {
    place.slot.insertBefore(button, place.before);
  } else {
    place.slot.prepend(button);
  }
}

function transferClearUserRules() {
  document.querySelectorAll("[data-ptaf-rule-export]").forEach((node) => {
    const row = node.parentElement;
    node.remove();
    if (row && row.dataset.ptafTransferPosition === "relative") {
      row.style.position = "";
      delete row.dataset.ptafTransferPosition;
    }
  });
}

function transferPlaceBar() {
  if (typeof stylesheetUrl === "function" && !stylesheetUrl()) {
    const stale = document.getElementById(TRANSFER_BAR_ID);
    if (stale) {
      stale.remove();
    }
    const download = document.getElementById(TRANSFER_DOWNLOAD_ID);
    if (download) {
      download.remove();
    }
    transferClearUserRules();
    return;
  }
  transferClearUserRules();
  transferPlaceSetButton();
  transferPlaceRuleDownload();
  const bar = document.getElementById(TRANSFER_BAR_ID);
  if (bar && bar.dataset.place !== "user-rules") {
    bar.remove();
  }
}

function transferSchedule() {
  if (transferFrame) {
    return;
  }
  transferFrame = requestAnimationFrame(() => {
    transferFrame = 0;
    if (transferRoute() !== transferPath) {
      transferPath = transferRoute();
      if (!transferState.writing) {
        transferCloseDialog();
      }
    }
    transferPlaceBar();
  });
}

function transferOnKey(event) {
  if (event.key === "Escape" && document.getElementById(TRANSFER_DIALOG_ID)) {
    transferCloseDialog();
  }
}

function transferHookHistory() {
  if (transferHookHistory.installed) {
    return;
  }
  transferHookHistory.installed = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedTransferHistory() {
      const result = original.apply(this, arguments);
      transferSchedule();
      return result;
    };
  }
  window.addEventListener("popstate", transferSchedule);
}

function transferWatch() {
  transferObserver = new MutationObserver(() => transferSchedule());
  transferObserver.observe(document.body, { childList: true, subtree: true });
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-scheme", "data-kbq-theme"],
  };
  transferThemeObserver = new MutationObserver(() => transferSyncTheme());
  transferThemeObserver.observe(document.documentElement, options);
  if (document.body) {
    transferThemeObserver.observe(document.body, options);
  }
}

transferPath = transferRoute();
transferHookHistory();
document.addEventListener("keydown", transferOnKey);
if (document.body) {
  transferWatch();
  transferSchedule();
}
transferRestoreNotice();
