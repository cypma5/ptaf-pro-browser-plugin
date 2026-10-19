const BUTTON_ID = "ptaf-bulk-actions-button";
const DIALOG_ID = "ptaf-bulk-dialog";
const TOAST_ID = "ptaf-bulk-toast";
const API_ROOT = "/api/ptaf/v4";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const USER_POLICY_PATH = new RegExp(`/conf-scheme/user_policy/(${UUID})`, "i");
const APPLICATION_POLICY_PATH = new RegExp(
  `/conf-scheme/(?:application_policy|policy)/(${UUID})`,
  "i"
);

let dialogHost = null;
let applying = false;
let syncFrame = 0;
let returnFocus = null;

function attachUi(host) {
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("content/content.css");
  shadow.append(link);
  return shadow;
}

function parseTarget(pathname) {
  const template = pathname.match(USER_POLICY_PATH);
  if (template) {
    return { kind: "template", id: template[1] };
  }
  const policy = pathname.match(APPLICATION_POLICY_PATH);
  if (policy) {
    return { kind: "policy", id: policy[1] };
  }
  return null;
}

const OPERATIONS = [
  {
    id: "add_syslog",
    mode: "bulk",
    bulk: "ADD",
    label: "Добавить Send to syslog",
    listLabel: "Действие",
  },
  {
    id: "remove_syslog",
    mode: "bulk",
    bulk: "DELETE",
    label: "Удалить Send to syslog",
    listLabel: "Действие",
  },
  {
    id: "replace_log",
    mode: "replace",
    sourceKeys: ["log"],
    targetKey: "log",
    label: "Заменить Log to DB",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
  {
    id: "replace_response",
    mode: "replace",
    sourceKeys: ["custom_response"],
    targetKey: "custom_response",
    label: "Заменить Custom response",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
  {
    id: "replace_rst",
    mode: "replace",
    sourceKeys: ["close", "send_rst"],
    targetKey: "custom_response",
    label: "Заменить Send RST на Custom response",
    fromLabel: "Что меняем",
    toLabel: "На что меняем",
  },
];

let actionCatalog = null;

function operationsPath(target) {
  if (target.kind === "template") {
    return `/config/policies/templates/user/${target.id}/rules/operations`;
  }
  return `/config/policies/${target.id}/rules/operations`;
}

function ruleCollections(target) {
  if (target.kind === "template") {
    const root = `/config/policies/templates/user/${target.id}/rules`;
    return [{ listPath: root, detailPath: (id) => `${root}/${id}`, user: false }];
  }
  return [
    {
      listPath: `/config/policies/${target.id}/rules`,
      detailPath: (id) => `/config/policies/${target.id}/rules/${id}`,
      user: false,
    },
    {
      listPath: `/config/policies/${target.id}/user_rules`,
      detailPath: (id) => `/config/policies/${target.id}/user_rules/${id}`,
      user: true,
    },
  ];
}

function getAccessToken() {
  try {
    const stored = JSON.parse(localStorage.getItem("PTAF__AUTHENTICATION") || "{}");
    return stored.data && stored.data.accessToken ? stored.data.accessToken : null;
  } catch (error) {
    return null;
  }
}

function errorMessage(status, body) {
  if (status === 401) {
    return "Session expired. Refresh the page and sign in again.";
  }
  const codes = body && body.errors && body.errors.error_codes;
  if (Array.isArray(codes) && codes.length) {
    return codes.join(", ");
  }
  if (body && body.errors) {
    return JSON.stringify(body.errors);
  }
  return `Request failed (${status})`;
}

async function api(path, options) {
  const token = getAccessToken();
  if (!token) {
    const error = new Error(errorMessage(401));
    error.status = 401;
    throw error;
  }

  const response = await fetch(API_ROOT + path, {
    method: options && options.method ? options.method : "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options && options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = null;
    }
  }

  if (!response.ok) {
    const error = new Error(errorMessage(response.status, body));
    error.status = response.status;
    throw error;
  }
  return body;
}

function entityName() {
  const header = document.querySelector("ptaf-form-card-header");
  const text = header ? header.textContent.replace(/\s+/g, " ").trim() : "";
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "this policy";
}

function selectedAction(dialog, role) {
  const list = dialog.querySelector(`.ptaf-bulk-list[data-role="${role || "to"}"]`);
  const row = list && list.querySelector('.ptaf-bulk-row[aria-selected="true"]');
  if (!row || !row.dataset.id) {
    return null;
  }
  return { id: row.dataset.id, name: row.dataset.name || "" };
}

function selectActionRow(row) {
  const list = row.closest(".ptaf-bulk-list");
  list.querySelectorAll(".ptaf-bulk-row").forEach((item) => {
    item.setAttribute("aria-selected", item === row ? "true" : "false");
  });
  updateConfirmation(row.getRootNode());
}

function localeCandidates() {
  const values = [];
  const push = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(trimmed)) {
      values.push(trimmed);
    }
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") {
      push(node);
      return;
    }
    Object.values(node).forEach(walk);
  };
  try {
    walk(JSON.parse(localStorage.getItem("PTAF__TRANSLATION") || "null"));
  } catch (error) {
    push(null);
  }
  push(document.documentElement.lang);
  if (navigator.language) {
    push(navigator.language);
    if (navigator.language.toLowerCase().startsWith("ru")) {
      values.push("ru-RU");
    }
    if (navigator.language.toLowerCase().startsWith("en")) {
      values.push("en-US");
    }
  }
  values.push("ru-RU", "en-US");
  return values.filter((value, index) => values.indexOf(value) === index);
}

async function loadTypeCaptions() {
  for (const locale of localeCandidates()) {
    try {
      const response = await fetch(`/assets/l10n/${locale}/actions.json`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      if (data && data.types) {
        return data.types;
      }
    } catch (error) {
      continue;
    }
  }
  return {};
}

function currentOperation(dialog) {
  const menu = dialog.querySelector("#ptaf-bulk-menu");
  const id = menu ? menu.value : OPERATIONS[0].id;
  return OPERATIONS.find((item) => item.id === id) || OPERATIONS[0];
}

function typeOf(action) {
  if (!actionCatalog) {
    return {};
  }
  return actionCatalog.typeById[action.type_id] || {};
}

function typeKey(action) {
  return typeOf(action).key || "";
}

function isRstSource(action) {
  const type = typeOf(action);
  const key = (type.key || "").toLowerCase();
  const name = `${type.name || ""} ${action.name || ""}`.toLowerCase();
  return key === "close" || key === "send_rst" || key.includes("rst") || /send rst|close connection/.test(name);
}

function matchesRole(action, operation, role) {
  const key = typeKey(action);
  if (operation.mode === "bulk") {
    return role === "to" && key === "send_to_syslog";
  }
  if (role === "from") {
    if (operation.id === "replace_rst") {
      return isRstSource(action);
    }
    return operation.sourceKeys.indexOf(key) !== -1;
  }
  return key === operation.targetKey;
}

function actionsForRole(operation, role) {
  if (!actionCatalog) {
    return [];
  }
  return actionCatalog.actions.filter((action) => matchesRole(action, operation, role));
}

function confirmationText(dialog) {
  const action = selectedAction(dialog, "to");
  const operation = currentOperation(dialog);
  const name = entityName();
  if (!action) {
    return "";
  }
  if (operation.mode === "bulk") {
    if (operation.bulk === "DELETE") {
      return `Удалить «${action.name}» со всех правил «${name}».`;
    }
    return `Добавить «${action.name}» на все правила «${name}».`;
  }
  const source = selectedAction(dialog, "from");
  if (!source) {
    return "";
  }
  if (source.id === action.id) {
    return "Выберите два разных действия.";
  }
  return `На всех правилах «${name}» действие «${source.name}» будет заменено на «${action.name}».`;
}

function setStatus(dialog, message, tone) {
  const status = dialog.querySelector(".ptaf-bulk-status");
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone || "error";
}

function updateConfirmation(dialog) {
  dialog.querySelector(".ptaf-bulk-confirm").textContent = confirmationText(dialog);
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  if (!submit || applying) {
    return;
  }
  const operation = currentOperation(dialog);
  const action = selectedAction(dialog, "to");
  if (operation.mode !== "replace") {
    submit.disabled = !action;
    return;
  }
  const source = selectedAction(dialog, "from");
  const same = !source || !action || source.id === action.id;
  submit.disabled = same;
  if (source && action) {
    setStatus(dialog, same ? "Выберите два разных действия." : "", same ? "error" : "info");
  }
}

function setBusy(dialog, busy) {
  dialog.querySelector(".ptaf-bulk-submit").disabled = busy;
  dialog.querySelector(".ptaf-bulk-cancel").disabled = busy;
  dialog.querySelector("#ptaf-bulk-menu").disabled = busy;
  dialog.querySelectorAll(".ptaf-bulk-row").forEach((row) => {
    row.disabled = busy;
  });
}

function itemsOf(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && Array.isArray(body.items)) {
    return body.items;
  }
  return [];
}

function readActionIds(details) {
  if (details && Array.isArray(details.actions)) {
    return details.actions.slice();
  }
  const configured = details && details.configuration && details.configuration.actions;
  if (Array.isArray(configured)) {
    return configured.slice();
  }
  return [];
}

function replaceIds(current, sourceIds, targetId) {
  if (!current.some((id) => sourceIds.has(id))) {
    return null;
  }
  const next = [];
  const seen = new Set();
  for (const id of current) {
    const value = sourceIds.has(id) ? targetId : id;
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }
  return next;
}

function userRulePatch(details, actions) {
  const configuration = { actions };
  const parameters = details && details.configuration && details.configuration.parameters;
  if (Array.isArray(parameters)) {
    configuration.parameters = parameters;
  }
  return { configuration };
}

function closeDialog(options) {
  if (applying) {
    return;
  }
  if (dialogHost) {
    dialogHost.remove();
    dialogHost = null;
  }
  const restore = !options || options.restoreFocus !== false;
  if (restore && returnFocus && returnFocus.isConnected) {
    returnFocus.focus();
  }
  returnFocus = null;
}

function showToast(message) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }
  const host = document.createElement("div");
  host.id = TOAST_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;";
  const shadow = attachUi(host);
  const toast = document.createElement("div");
  toast.className = "ptaf-bulk-toast";
  toast.textContent = message;
  shadow.append(toast);
  document.body.appendChild(host);
  window.setTimeout(() => {
    if (host.isConnected) {
      host.remove();
    }
  }, 4000);
}

function actionDescription(action, typeById, captions) {
  const type = typeById[action.type_id];
  const key = type && type.key;
  const caption = key && captions[key];
  return typeof caption === "string" ? caption : "";
}

function fillActionList(list, actions) {
  list.replaceChildren();
  for (const action of actions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ptaf-bulk-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.dataset.id = action.id;
    row.dataset.name = action.name;
    const top = document.createElement("span");
    top.className = "ptaf-bulk-row-top";
    const name = document.createElement("span");
    name.className = "ptaf-bulk-row-name";
    name.textContent = action.name;
    top.append(name);
    if (action.is_system) {
      const mark = document.createElement("span");
      mark.className = "ptaf-bulk-row-mark";
      mark.textContent = "системное";
      top.append(mark);
    }
    row.append(top);
    const description = actionDescription(action, actionCatalog.typeById, actionCatalog.captions);
    if (description) {
      const caption = document.createElement("span");
      caption.className = "ptaf-bulk-row-desc";
      caption.textContent = description;
      row.append(caption);
    }
    row.addEventListener("click", () => selectActionRow(row));
    list.append(row);
  }
}

function renderActionList(dialog) {
  const operation = currentOperation(dialog);
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  const fromField = dialog.querySelector(".ptaf-bulk-from");
  const fromList = dialog.querySelector('.ptaf-bulk-list[data-role="from"]');
  const toList = dialog.querySelector('.ptaf-bulk-list[data-role="to"]');
  const replacing = operation.mode === "replace";
  dialog.querySelector(".ptaf-bulk-dialog").classList.toggle("is-replace", replacing);
  fromField.hidden = !replacing;
  dialog.querySelector(".ptaf-bulk-arrow").hidden = !replacing;
  dialog.querySelector(".ptaf-bulk-from-label").textContent = operation.fromLabel || "Что меняем";
  dialog.querySelector(".ptaf-bulk-to-label").textContent = replacing ? operation.toLabel : operation.listLabel;
  fromList.replaceChildren();
  toList.replaceChildren();

  if (!actionCatalog) {
    submit.disabled = true;
    return;
  }

  const fromActions = replacing ? actionsForRole(operation, "from") : [];
  const toActions = actionsForRole(operation, "to");
  if (replacing && !fromActions.length) {
    setStatus(dialog, `No actions for ${operation.fromLabel}.`, "error");
    submit.disabled = true;
    updateConfirmation(dialog);
    return;
  }
  if (!toActions.length) {
    const empty = operation.mode === "bulk"
      ? "No Send to syslog actions."
      : `No actions for ${operation.toLabel}.`;
    setStatus(dialog, empty, "error");
    submit.disabled = true;
    updateConfirmation(dialog);
    return;
  }

  if (replacing) {
    fillActionList(fromList, fromActions);
    selectActionRow(fromList.querySelector(".ptaf-bulk-row"));
  }
  fillActionList(toList, toActions);
  const fromId = replacing ? fromList.querySelector('.ptaf-bulk-row[aria-selected="true"]').dataset.id : "";
  const other = replacing
    ? toList.querySelector(`.ptaf-bulk-row:not([data-id="${CSS.escape(fromId)}"])`)
    : null;
  selectActionRow(other || toList.querySelector(".ptaf-bulk-row"));
  const chosenFrom = replacing ? selectedAction(dialog, "from") : null;
  const chosenTo = selectedAction(dialog, "to");
  const sameChoice = Boolean(chosenFrom && chosenTo && chosenFrom.id === chosenTo.id);
  submit.disabled = sameChoice;
  setStatus(dialog, sameChoice ? "Выберите два разных действия." : "", sameChoice ? "error" : "info");
}

async function loadActions(dialog) {
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  submit.disabled = true;
  actionCatalog = null;
  setStatus(dialog, "Loading actions...", "info");

  try {
    const [actionsBody, typesBody, captions] = await Promise.all([
      api("/config/actions"),
      api("/config/action_types"),
      loadTypeCaptions(),
    ]);
    if (!dialog.isConnected) {
      return;
    }
    const typeById = {};
    for (const type of itemsOf(typesBody)) {
      typeById[type.id] = type;
    }
    const actions = itemsOf(actionsBody).slice().sort((left, right) => {
      if (left.is_system !== right.is_system) {
        return left.is_system ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });
    actionCatalog = { actions, typeById, captions };
    renderActionList(dialog);
  } catch (error) {
    if (!dialog.isConnected) {
      return;
    }
    setStatus(dialog, error.message || "Failed to load actions.", "error");
  }
}

async function applyBulk(dialog, target, operation, action) {
  setStatus(dialog, "Applying...", "info");
  await api(operationsPath(target), {
    method: "POST",
    body: {
      action_id: action.id,
      type: operation.bulk,
    },
  });
  applying = false;
  closeDialog();
  showToast(operation.bulk === "DELETE" ? "Action removed from all rules." : "Action added to all rules.");
}

async function applyReplace(dialog, target, source, action) {
  const sourceIds = new Set([source.id]);
  const rules = [];
  for (const collection of ruleCollections(target)) {
    const body = await api(collection.listPath);
    for (const rule of itemsOf(body)) {
      rules.push({
        id: rule.id,
        name: rule.name || rule.id,
        user: collection.user,
        detailPath: collection.detailPath(rule.id),
      });
    }
  }

  let changed = 0;
  let failed = 0;
  const failures = [];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    setStatus(
      dialog,
      `Checking rules: ${index + 1} of ${rules.length}. Replaced: ${changed}.`,
      "info"
    );
    try {
      const details = await api(rule.detailPath);
      const next = replaceIds(readActionIds(details), sourceIds, action.id);
      if (!next) {
        continue;
      }
      await api(rule.detailPath, {
        method: "PATCH",
        body: rule.user ? userRulePatch(details, next) : { actions: next },
      });
      changed += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 3) {
        failures.push(`${rule.name}: ${error.message}`);
      }
    }
  }

  applying = false;
  if (failed) {
    setBusy(dialog, false);
    const summary = `Replaced in ${changed} of ${rules.length} rules. Failed: ${failed}.`;
    setStatus(dialog, `${summary} ${failures.join(" ")}`, "error");
    return;
  }
  closeDialog();
  showToast(`Replaced the action in ${changed} of ${rules.length} rules.`);
}

async function applyOperation(dialog, target) {
  const operation = currentOperation(dialog);
  const action = selectedAction(dialog, "to");
  const source = operation.mode === "replace" ? selectedAction(dialog, "from") : null;
  if (!action || applying) {
    return;
  }
  if (operation.mode === "replace" && (!source || source.id === action.id)) {
    setStatus(dialog, "Choose two different actions.", "error");
    return;
  }

  applying = true;
  setBusy(dialog, true);

  try {
    if (operation.mode === "bulk") {
      await applyBulk(dialog, target, operation, action);
    } else {
      await applyReplace(dialog, target, source, action);
    }
  } catch (error) {
    applying = false;
    if (!dialog.isConnected) {
      return;
    }
    setBusy(dialog, false);
    setStatus(dialog, error.message || "Request failed.", "error");
  }
}

function openDialog(target) {
  if (applying) {
    return;
  }
  const focusTarget = returnFocus;
  closeDialog({ restoreFocus: false });
  returnFocus = focusTarget;
  const host = document.createElement("div");
  host.id = DIALOG_ID;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const shadow = attachUi(host);
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-bulk-backdrop";
  backdrop.innerHTML = `
    <div class="ptaf-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="ptaf-bulk-title" tabindex="-1">
      <h2 id="ptaf-bulk-title">Действия для всех правил</h2>
      <p class="ptaf-bulk-entity"></p>
      <div class="ptaf-bulk-field">
        <label for="ptaf-bulk-menu">Операция</label>
        <select id="ptaf-bulk-menu" class="ptaf-bulk-menu"></select>
      </div>
      <div class="ptaf-bulk-field ptaf-bulk-from" hidden>
        <span class="ptaf-bulk-from-label">Что меняем</span>
        <div class="ptaf-bulk-list" data-role="from" role="listbox" aria-label="Что меняем"></div>
      </div>
      <div class="ptaf-bulk-arrow" hidden aria-hidden="true"><span>↓</span></div>
      <div class="ptaf-bulk-field">
        <span class="ptaf-bulk-to-label">Действие</span>
        <div class="ptaf-bulk-list" data-role="to" role="listbox" aria-label="На что меняем"></div>
      </div>
      <p class="ptaf-bulk-confirm"></p>
      <p class="ptaf-bulk-status" hidden></p>
      <div class="ptaf-bulk-actions">
        <button type="button" class="ptaf-bulk-cancel">Отмена</button>
        <button type="button" class="ptaf-bulk-submit">Применить</button>
      </div>
    </div>
  `;
  shadow.append(backdrop);

  const menu = shadow.querySelector("#ptaf-bulk-menu");
  for (const operation of OPERATIONS) {
    const option = document.createElement("option");
    option.value = operation.id;
    option.textContent = operation.label;
    menu.append(option);
  }
  shadow.querySelector(".ptaf-bulk-entity").textContent = entityName();
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });
  shadow.querySelector(".ptaf-bulk-cancel").addEventListener("click", closeDialog);
  menu.addEventListener("change", () => {
    if (actionCatalog) {
      renderActionList(shadow);
    }
  });
  shadow.querySelector(".ptaf-bulk-submit").addEventListener("click", () => {
    applyOperation(shadow, target);
  });

  document.body.appendChild(host);
  dialogHost = host;
  shadow.querySelector(".ptaf-bulk-dialog").focus();
  loadActions(shadow);
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    closeDialog();
  }
}

function createButton() {
  const host = document.createElement("div");
  host.id = BUTTON_ID;
  host.style.cssText = "all:initial;display:inline-flex;flex:0 0 auto;margin-right:8px;vertical-align:middle;";
  const shadow = attachUi(host);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ptaf-bulk-trigger";
  button.textContent = "Действия для всех правил";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    returnFocus = button;
    const target = parseTarget(location.pathname);
    if (target) {
      openDialog(target);
    }
  });
  shadow.append(button);
  return host;
}

function syncButton() {
  const target = parseTarget(location.pathname);
  const host = document.querySelector(".top-panel .rules-actions");
  const existing = document.getElementById(BUTTON_ID);

  if (!target || !host) {
    if (existing) {
      existing.remove();
    }
    if (!target) {
      closeDialog();
    }
    return;
  }

  if (existing) {
    if (existing.parentElement !== host) {
      host.prepend(existing);
    }
    return;
  }

  host.prepend(createButton());
}

function scheduleSync() {
  if (syncFrame) {
    return;
  }
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    syncButton();
  });
}

function nodeRelevant(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  if (node.id === BUTTON_ID || node.id === DIALOG_ID || node.id === TOAST_ID) {
    return true;
  }
  return Boolean(
    node.matches(".top-panel, .rules-actions") ||
    node.querySelector(".top-panel .rules-actions, #" + BUTTON_ID)
  );
}

function hookHistory() {
  if (hookHistory.installed) {
    return;
  }
  hookHistory.installed = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedHistory() {
      const result = original.apply(this, arguments);
      scheduleSync();
      return result;
    };
  }
  window.addEventListener("popstate", scheduleSync);
}

function watchDom() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (nodeRelevant(mutation.target)) {
        scheduleSync();
        return;
      }
      for (const node of mutation.addedNodes) {
        if (nodeRelevant(node)) {
          scheduleSync();
          return;
        }
      }
      for (const node of mutation.removedNodes) {
        if (nodeRelevant(node)) {
          scheduleSync();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

hookHistory();
document.addEventListener("keydown", onKeyDown);
watchDom();
scheduleSync();
