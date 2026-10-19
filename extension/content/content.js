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

function operationsPath(target) {
  if (target.kind === "template") {
    return `/config/policies/templates/user/${target.id}/rules/operations`;
  }
  return `/config/policies/${target.id}/rules/operations`;
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

function selectedAction(dialog) {
  const row = dialog.querySelector('.ptaf-bulk-row[aria-selected="true"]');
  if (!row || !row.dataset.id) {
    return null;
  }
  return { id: row.dataset.id, name: row.dataset.name || "" };
}

function selectActionRow(dialog, row) {
  dialog.querySelectorAll(".ptaf-bulk-row").forEach((item) => {
    item.setAttribute("aria-selected", item === row ? "true" : "false");
  });
  updateConfirmation(dialog);
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

function confirmationText(actionName, operation) {
  const name = entityName();
  if (!actionName) {
    return "";
  }
  if (operation === "DELETE") {
    return `Remove "${actionName}" from all rules of "${name}".`;
  }
  return `Add "${actionName}" to all rules of "${name}".`;
}

function setStatus(dialog, message, tone) {
  const status = dialog.querySelector(".ptaf-bulk-status");
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone || "error";
}

function updateConfirmation(dialog) {
  const operation = dialog.querySelector('input[name="ptaf-bulk-op"]:checked');
  const action = selectedAction(dialog);
  dialog.querySelector(".ptaf-bulk-confirm").textContent = confirmationText(
    action && action.name,
    operation ? operation.value : "ADD"
  );
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
  host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;";
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

async function loadActions(dialog) {
  const list = dialog.querySelector(".ptaf-bulk-list");
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  submit.disabled = true;
  setStatus(dialog, "Loading actions...", "info");

  try {
    if (!dialog.isConnected) {
      return;
    }
    const [actionsBody, typesBody, captions] = await Promise.all([
      api("/config/actions"),
      api("/config/action_types"),
      loadTypeCaptions(),
    ]);
    const typeById = {};
    for (const type of (typesBody && typesBody.items) || []) {
      typeById[type.id] = type;
    }
    const actions = ((actionsBody && actionsBody.items) || []).slice().sort((left, right) => {
      if (left.is_system !== right.is_system) {
        return left.is_system ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });

    list.replaceChildren();
    if (!actions.length) {
      setStatus(dialog, "No actions found.", "error");
      return;
    }

    for (const action of actions) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ptaf-bulk-row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.dataset.id = action.id;
      row.dataset.name = action.name;
      const name = document.createElement("span");
      name.className = "ptaf-bulk-row-name";
      name.textContent = action.name;
      row.append(name);
      const description = actionDescription(action, typeById, captions);
      if (description) {
        const caption = document.createElement("span");
        caption.className = "ptaf-bulk-row-desc";
        caption.textContent = description;
        row.append(caption);
      }
      row.addEventListener("click", () => selectActionRow(dialog, row));
      list.append(row);
    }
    if (!dialog.isConnected) {
      return;
    }
    selectActionRow(dialog, list.querySelector(".ptaf-bulk-row"));
    submit.disabled = false;
    setStatus(dialog, "", "info");
  } catch (error) {
    if (!dialog.isConnected) {
      return;
    }
    setStatus(dialog, error.message || "Failed to load actions.", "error");
  }
}

async function applyOperation(dialog, target) {
  const operation = dialog.querySelector('input[name="ptaf-bulk-op"]:checked');
  const action = selectedAction(dialog);
  if (!action || !operation) {
    return;
  }

  applying = true;
  dialog.querySelector(".ptaf-bulk-submit").disabled = true;
  dialog.querySelector(".ptaf-bulk-cancel").disabled = true;
  dialog.querySelectorAll(".ptaf-bulk-row").forEach((row) => {
    row.disabled = true;
  });
  setStatus(dialog, "Applying...", "info");

  try {
    await api(operationsPath(target), {
      method: "POST",
      body: {
        action_id: action.id,
        type: operation.value,
      },
    });
    applying = false;
    closeDialog();
    showToast("Action applied to all rules.");
  } catch (error) {
    applying = false;
    dialog.querySelector(".ptaf-bulk-submit").disabled = false;
    dialog.querySelector(".ptaf-bulk-cancel").disabled = false;
    dialog.querySelectorAll(".ptaf-bulk-row").forEach((row) => {
      row.disabled = false;
    });
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
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;";
  const shadow = attachUi(host);
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-bulk-backdrop";
  backdrop.innerHTML = `
    <div class="ptaf-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="ptaf-bulk-title" tabindex="-1">
      <h2 id="ptaf-bulk-title">Apply action to all rules</h2>
      <p class="ptaf-bulk-entity"></p>
      <div class="ptaf-bulk-field">Action
        <div class="ptaf-bulk-list" role="listbox" aria-label="Action"></div>
      </div>
      <fieldset class="ptaf-bulk-ops">
        <legend>Operation</legend>
        <label class="ptaf-bulk-radio"><input type="radio" name="ptaf-bulk-op" value="ADD" checked><span class="ptaf-bulk-radio-mark"></span>Add</label>
        <label class="ptaf-bulk-radio"><input type="radio" name="ptaf-bulk-op" value="DELETE"><span class="ptaf-bulk-radio-mark"></span>Remove</label>
      </fieldset>
      <p class="ptaf-bulk-confirm"></p>
      <p class="ptaf-bulk-status" hidden></p>
      <div class="ptaf-bulk-actions">
        <button type="button" class="ptaf-bulk-cancel">Cancel</button>
        <button type="button" class="ptaf-bulk-submit">Apply</button>
      </div>
    </div>
  `;
  shadow.append(backdrop);

  shadow.querySelector(".ptaf-bulk-entity").textContent = `Target: ${entityName()}`;
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });
  shadow.querySelector(".ptaf-bulk-cancel").addEventListener("click", closeDialog);
  shadow.querySelectorAll('input[name="ptaf-bulk-op"]').forEach((input) => {
    input.addEventListener("change", () => updateConfirmation(shadow));
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
  button.textContent = "Apply action to all rules";
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
