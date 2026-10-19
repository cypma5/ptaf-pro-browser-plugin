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

let dialogRoot = null;
let applying = false;
let syncTimer = 0;

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

function selectedAction(select) {
  const option = select.options[select.selectedIndex];
  if (!option || !option.value) {
    return null;
  }
  return { id: option.value, name: option.dataset.name || option.textContent };
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
  const select = dialog.querySelector(".ptaf-bulk-action");
  const operation = dialog.querySelector('input[name="ptaf-bulk-op"]:checked');
  const action = selectedAction(select);
  dialog.querySelector(".ptaf-bulk-confirm").textContent = confirmationText(
    action && action.name,
    operation ? operation.value : "ADD"
  );
}

function closeDialog() {
  if (applying) {
    return;
  }
  if (dialogRoot) {
    dialogRoot.remove();
    dialogRoot = null;
  }
}

function showToast(message) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.className = "ptaf-bulk-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => {
    if (toast.isConnected) {
      toast.remove();
    }
  }, 4000);
}

function actionLabel(action, typeById) {
  const type = typeById[action.type_id];
  const scope = action.is_system ? "system" : "user";
  const typeKey = type && type.key ? type.key : "unknown";
  return `${action.name} · ${scope} · ${typeKey}`;
}

async function loadActions(dialog) {
  const select = dialog.querySelector(".ptaf-bulk-action");
  const submit = dialog.querySelector(".ptaf-bulk-submit");
  select.disabled = true;
  submit.disabled = true;
  setStatus(dialog, "Loading actions...", "info");

  try {
    if (!dialog.isConnected) {
      return;
    }
    const [actionsBody, typesBody] = await Promise.all([
      api("/config/actions"),
      api("/config/action_types"),
    ]);
    const typeById = {};
    for (const type of (typesBody && typesBody.items) || []) {
      typeById[type.id] = type;
    }
    const actions = ((actionsBody && actionsBody.items) || [])
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));

    select.replaceChildren();
    if (!actions.length) {
      setStatus(dialog, "No actions found.", "error");
      return;
    }

    for (const action of actions) {
      const option = document.createElement("option");
      option.value = action.id;
      option.dataset.name = action.name;
      option.textContent = actionLabel(action, typeById);
      select.appendChild(option);
    }
    if (!dialog.isConnected) {
      return;
    }
    select.disabled = false;
    submit.disabled = false;
    setStatus(dialog, "", "info");
    updateConfirmation(dialog);
  } catch (error) {
    if (!dialog.isConnected) {
      return;
    }
    setStatus(dialog, error.message || "Failed to load actions.", "error");
  }
}

async function applyOperation(dialog, target) {
  const select = dialog.querySelector(".ptaf-bulk-action");
  const operation = dialog.querySelector('input[name="ptaf-bulk-op"]:checked');
  const action = selectedAction(select);
  if (!action || !operation) {
    return;
  }

  applying = true;
  dialog.querySelector(".ptaf-bulk-submit").disabled = true;
  dialog.querySelector(".ptaf-bulk-cancel").disabled = true;
  select.disabled = true;
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
    select.disabled = false;
    setStatus(dialog, error.message || "Request failed.", "error");
  }
}

function openDialog(target) {
  if (applying) {
    return;
  }
  closeDialog();
  const dialog = document.createElement("div");
  dialog.id = DIALOG_ID;
  dialog.className = "ptaf-bulk-backdrop";
  dialog.innerHTML = `
    <div class="ptaf-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="ptaf-bulk-title">
      <h2 id="ptaf-bulk-title">Apply action to all rules</h2>
      <p class="ptaf-bulk-entity"></p>
      <label class="ptaf-bulk-field">Action
        <select class="ptaf-bulk-action"></select>
      </label>
      <fieldset class="ptaf-bulk-ops">
        <legend>Operation</legend>
        <label><input type="radio" name="ptaf-bulk-op" value="ADD" checked> Add</label>
        <label><input type="radio" name="ptaf-bulk-op" value="DELETE"> Remove</label>
      </fieldset>
      <p class="ptaf-bulk-confirm"></p>
      <p class="ptaf-bulk-status" hidden></p>
      <div class="ptaf-bulk-actions">
        <button type="button" class="ptaf-bulk-cancel">Cancel</button>
        <button type="button" class="ptaf-bulk-submit">Apply</button>
      </div>
    </div>
  `;

  dialog.querySelector(".ptaf-bulk-entity").textContent = `Target: ${entityName()}`;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });
  dialog.querySelector(".ptaf-bulk-dialog").addEventListener("click", (event) => {
    event.stopPropagation();
  });
  dialog.querySelector(".ptaf-bulk-cancel").addEventListener("click", closeDialog);
  dialog.querySelector(".ptaf-bulk-action").addEventListener("change", () => updateConfirmation(dialog));
  dialog.querySelectorAll('input[name="ptaf-bulk-op"]').forEach((input) => {
    input.addEventListener("change", () => updateConfirmation(dialog));
  });
  dialog.querySelector(".ptaf-bulk-submit").addEventListener("click", () => {
    applyOperation(dialog, target);
  });

  document.body.appendChild(dialog);
  dialogRoot = dialog;
  loadActions(dialog);
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    closeDialog();
  }
}

function createButton() {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "ptaf-bulk-trigger";
  button.textContent = "Apply action to all rules";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = parseTarget(location.pathname);
    if (target) {
      openDialog(target);
    }
  });
  return button;
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
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncButton, 50);
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
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
}

hookHistory();
document.addEventListener("keydown", onKeyDown);
watchDom();
scheduleSync();
