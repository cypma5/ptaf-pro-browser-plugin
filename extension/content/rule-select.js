const RULE_SELECT_BAR = "ptaf-rule-select-bar";
const RULE_SELECT_DIALOG = "ptaf-rule-select-dialog";
const RULE_SELECT_STYLE = "ptaf-rule-select-style";
const RULE_SELECT_NOTICE = "ptaf-rule-select-notice";
const RULE_SELECT_SET = /\/conf-scheme\/policy_with_user_rules\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

let ruleSelectStopped = false;
let ruleSelectEnabled = true;
let ruleSelectFrame = 0;
let ruleSelectRunning = false;
let ruleSelectAgain = false;
let ruleSelectBusy = false;
let ruleSelectSet = "";
let ruleSelectAnchor = "";
let ruleSelectProgress = "";
let ruleSelectError = "";
let ruleSelectObserver = null;
let ruleSelectCatalog = { id: "", rules: [], at: 0 };
let ruleSelectLoading = null;
const ruleSelectSelected = new Set();

function ruleSelectAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function stopRuleSelect() {
  if (ruleSelectStopped) {
    return;
  }
  ruleSelectStopped = true;
  if (ruleSelectFrame) {
    cancelAnimationFrame(ruleSelectFrame);
    ruleSelectFrame = 0;
  }
  if (ruleSelectObserver) {
    ruleSelectObserver.disconnect();
    ruleSelectObserver = null;
  }
  document.removeEventListener("keydown", ruleSelectOnKey, true);
  ruleSelectClear();
  const dialog = document.getElementById(RULE_SELECT_DIALOG);
  if (dialog) {
    dialog.remove();
  }
}

function ruleSelectItems(body) {
  if (Array.isArray(body)) {
    return body;
  }
  return body && Array.isArray(body.items) ? body.items : [];
}

function ruleSelectSetId() {
  const match = location.pathname.match(RULE_SELECT_SET);
  return match ? match[1] : "";
}

function ruleSelectEnglish() {
  const input = document.querySelector(".top-panel input");
  const placeholder = input ? input.getAttribute("placeholder") || "" : "";
  if (/group or rule name/i.test(placeholder)) {
    return true;
  }
  if (/групп|имя правила/i.test(placeholder)) {
    return false;
  }
  return /user rule set/i.test(document.body ? document.body.textContent : "");
}

function ruleSelectPlural(count, one, few, many) {
  const value = Math.abs(Number(count)) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

function ruleSelectCopy() {
  if (ruleSelectEnglish()) {
    const rules = (count) => (count === 1 ? "1 rule" : `${count} rules`);
    return {
      none: "None selected",
      selected: (count) => `Selected: ${rules(count)}`,
      shown: "Select shown rules",
      enable: "Enable",
      disable: "Disable",
      remove: "Delete",
      loading: "Reading the rule list…",
      progress: (verb, index, count) => `${verb} ${index} of ${count}`,
      verbs: { enable: "Enabling", disable: "Disabling", remove: "Deleting" },
      done: {
        enable: "Enabled",
        disable: "Disabled",
        remove: "Deleted",
      },
      result: (kind, done, failed) => {
        const title = { enable: "Enabled", disable: "Disabled", remove: "Deleted" }[kind];
        if (!failed) {
          return `${title}: ${rules(done)}.`;
        }
        if (!done) {
          return `Could not update ${rules(failed)}.`;
        }
        return `${title}: ${rules(done)}. Failed: ${rules(failed)}.`;
      },
      confirmTitle: "Delete rules",
      confirm: (count) => `Delete ${rules(count)} from the user rule set? This cannot be undone.`,
      cancel: "Cancel",
      readFailed: "Could not read the rule list.",
    };
  }
  const rules = (count) => `${count} ${ruleSelectPlural(count, "правило", "правила", "правил")}`;
  return {
    none: "Ничего не выбрано",
    selected: (count) => `Выбрано: ${rules(count)}`,
    shown: "Выбрать показанные правила",
    enable: "Включить",
    disable: "Отключить",
    remove: "Удалить",
    loading: "Читаем список правил…",
    progress: (verb, index, count) => `${verb} ${index} из ${count}`,
    verbs: { enable: "Включение", disable: "Отключение", remove: "Удаление" },
    result: (kind, done, failed) => {
      const title = { enable: "Включено", disable: "Отключено", remove: "Удалено" }[kind];
      if (!failed) {
        return `${title}: ${rules(done)}.`;
      }
      if (!done) {
        return `Не удалось изменить ${rules(failed)}.`;
      }
      return `${title}: ${rules(done)}. Не удалось: ${rules(failed)}.`;
    },
    confirmTitle: "Удалить правила",
    confirm: (count) => `Удалить ${rules(count)} из набора пользовательских правил? Вернуть их можно только из сохранённого JSON.`,
    cancel: "Отмена",
    readFailed: "Не удалось прочитать список правил.",
  };
}

function ruleSelectStyle() {
  if (document.getElementById(RULE_SELECT_STYLE)) {
    return;
  }
  const style = document.createElement("style");
  style.id = RULE_SELECT_STYLE;
  style.textContent = [
    ".rules > div:has(> .ptaf-rule-pick){position:relative;}",
    ".ptaf-rule-pick{position:absolute;z-index:2;left:10px;top:50%;width:16px;height:16px;margin:-8px 0 0;accent-color:#3d7ef0;cursor:pointer;}",
    ".ptaf-rule-pick:disabled{cursor:default;}",
    ".ptaf-rule-pick:focus-visible{outline:2px solid #5b8def;outline-offset:2px;}",
  ].join("");
  document.documentElement.append(style);
}

function ruleSelectClear() {
  document.querySelectorAll(".ptaf-rule-pick").forEach((node) => node.remove());
  const bar = document.getElementById(RULE_SELECT_BAR);
  if (bar) {
    bar.remove();
  }
  const style = document.getElementById(RULE_SELECT_STYLE);
  if (style) {
    style.remove();
  }
}

function ruleSelectRoot() {
  if (!ruleSelectSetId()) {
    return null;
  }
  const panels = document.querySelectorAll(".top-panel");
  for (let index = panels.length - 1; index >= 0; index -= 1) {
    const panel = panels[index];
    const root = panel.parentElement;
    if (!root || !root.querySelector(".all-rules, .grouped")) {
      continue;
    }
    const rect = panel.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return root;
    }
  }
  return null;
}

function ruleSelectRows(root) {
  return [...root.querySelectorAll(".rules > div")].filter((row) => row.querySelector(":scope > .name"));
}

function ruleSelectShown(row) {
  if (!row || row.hidden || (row.closest && row.closest("[hidden]"))) {
    return false;
  }
  const rect = row.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function ruleSelectName(row) {
  const name = row.querySelector(":scope > .name");
  return name ? name.textContent.replace(/\s+/g, " ").trim() : "";
}

function ruleSelectVisibleIds(root) {
  return ruleSelectRows(root).filter(ruleSelectShown).map((row) => row.dataset.ptafRuleId || "").filter(Boolean);
}

async function ruleSelectLoad(setId) {
  const fresh = ruleSelectCatalog.id === setId && ruleSelectCatalog.rules.length && Date.now() - ruleSelectCatalog.at < 20000;
  if (fresh) {
    return ruleSelectCatalog.rules;
  }
  if (ruleSelectLoading && ruleSelectLoading.id === setId) {
    return ruleSelectLoading.promise;
  }
  const promise = (async () => {
    const listed = ruleSelectItems(await api(`/config/policies/templates/with_user_rules/${setId}/rules`));
    const rules = listed.filter((item) => item && item.id && item.name).map((item) => ({
      id: item.id,
      name: String(item.name).replace(/\s+/g, " ").trim(),
    }));
    ruleSelectCatalog = { id: setId, rules, at: Date.now() };
    return rules;
  })();
  ruleSelectLoading = { id: setId, promise };
  try {
    return await promise;
  } finally {
    if (ruleSelectLoading && ruleSelectLoading.promise === promise) {
      ruleSelectLoading = null;
    }
  }
}

function ruleSelectAssign(rows, rules) {
  const buckets = new Map();
  rules.forEach((rule) => {
    const bucket = buckets.get(rule.name) || [];
    bucket.push(rule);
    buckets.set(rule.name, bucket);
  });
  const used = new Map();
  rows.forEach((row) => {
    const name = ruleSelectName(row);
    const bucket = buckets.get(name) || [];
    const index = used.get(name) || 0;
    used.set(name, index + 1);
    const rule = bucket[index] || null;
    row.dataset.ptafRuleId = rule ? rule.id : "";
  });
}

function ruleSelectOnCheck(event) {
  event.stopPropagation();
  const input = event.currentTarget;
  const row = input.closest(".rules > div");
  const id = row && row.dataset.ptafRuleId;
  if (!id || ruleSelectBusy) {
    event.preventDefault();
    input.checked = Boolean(id && ruleSelectSelected.has(id));
    return;
  }
  const root = ruleSelectRoot();
  const ids = root ? ruleSelectVisibleIds(root) : [];
  if (event.shiftKey && ruleSelectAnchor) {
    const start = ids.indexOf(ruleSelectAnchor);
    const end = ids.indexOf(id);
    if (start >= 0 && end >= 0) {
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let index = from; index <= to; index += 1) {
        if (input.checked) {
          ruleSelectSelected.add(ids[index]);
        } else {
          ruleSelectSelected.delete(ids[index]);
        }
      }
      ruleSelectPaintChecks(root);
      ruleSelectPaintBar();
      return;
    }
  }
  if (input.checked) {
    ruleSelectSelected.add(id);
  } else {
    ruleSelectSelected.delete(id);
  }
  ruleSelectAnchor = id;
  ruleSelectPaintBar();
}

function ruleSelectEnsureChecks(rows) {
  rows.forEach((row) => {
    let input = row.querySelector(":scope > .ptaf-rule-pick");
    if (input) {
      return;
    }
    input = document.createElement("input");
    input.type = "checkbox";
    input.className = "ptaf-rule-pick";
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", ruleSelectOnCheck);
    row.insertBefore(input, row.firstChild);
  });
}

function ruleSelectPaintChecks(root) {
  ruleSelectRows(root).forEach((row) => {
    const input = row.querySelector(":scope > .ptaf-rule-pick");
    if (!input) {
      return;
    }
    const id = row.dataset.ptafRuleId || "";
    const name = ruleSelectName(row);
    input.disabled = ruleSelectBusy || !id;
    input.checked = Boolean(id && ruleSelectSelected.has(id));
    input.title = name;
    input.setAttribute("aria-label", name);
  });
}

function ruleSelectBarTheme(host) {
  const theme = host && host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
  if (theme && typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  return theme;
}

function ruleSelectEnsureBar(root) {
  const panel = root.querySelector(":scope > .top-panel") || root.querySelector(".top-panel");
  if (!panel) {
    return null;
  }
  let host = document.getElementById(RULE_SELECT_BAR);
  if (host && host.previousElementSibling === panel && host.parentElement === panel.parentElement) {
    ruleSelectBarTheme(host);
    return host;
  }
  if (host) {
    host.remove();
  }
  host = document.createElement("div");
  host.id = RULE_SELECT_BAR;
  host.className = "ptaf-rule-select-host";
  host.style.cssText = "all:initial;display:block;flex:0 0 auto;width:100%;";
  host.addEventListener("pointerdown", (event) => event.stopPropagation());
  host.addEventListener("mousedown", (event) => event.stopPropagation());
  host.addEventListener("click", (event) => event.stopPropagation());
  const theme = typeof attachUi === "function" ? attachUi(host) : null;
  if (!theme) {
    return null;
  }
  theme.append(ruleSelectBarView());
  panel.after(host);
  ruleSelectBindBar(theme);
  ruleSelectBarTheme(host);
  return host;
}

function ruleSelectBarView() {
  const copy = ruleSelectCopy();
  const bar = document.createElement("div");
  bar.className = "ptaf-rule-select";

  const all = document.createElement("label");
  all.className = "ptaf-rule-select-all";
  const master = document.createElement("input");
  master.type = "checkbox";
  master.dataset.role = "all";
  master.title = copy.shown;
  master.setAttribute("aria-label", copy.shown);
  const count = document.createElement("span");
  count.dataset.role = "count";
  count.textContent = copy.none;
  all.append(master, count);

  const status = document.createElement("span");
  status.className = "ptaf-rule-select-status";
  status.dataset.role = "status";

  const actions = document.createElement("div");
  actions.className = "ptaf-rule-select-actions";
  [
    ["enable", copy.enable, ""],
    ["disable", copy.disable, ""],
    ["remove", copy.remove, " is-danger"],
  ].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ptaf-rule-select-button${item[2]}`;
    button.dataset.act = item[0];
    button.textContent = item[1];
    button.disabled = true;
    actions.append(button);
  });

  bar.append(all, status, actions);
  return bar;
}

function ruleSelectBindBar(theme) {
  const master = theme.querySelector('[data-role="all"]');
  master.addEventListener("change", () => {
    const root = ruleSelectRoot();
    if (!root || ruleSelectBusy) {
      ruleSelectPaintBar();
      return;
    }
    ruleSelectVisibleIds(root).forEach((id) => {
      if (master.checked) {
        ruleSelectSelected.add(id);
      } else {
        ruleSelectSelected.delete(id);
      }
    });
    ruleSelectPaintChecks(root);
    ruleSelectPaintBar();
  });
  theme.querySelectorAll("[data-act]").forEach((button) => {
    button.addEventListener("click", () => {
      const act = button.dataset.act;
      if (act === "remove") {
        ruleSelectConfirm();
        return;
      }
      ruleSelectApply(act);
    });
  });
}

function ruleSelectPaintBar() {
  const host = document.getElementById(RULE_SELECT_BAR);
  const theme = ruleSelectBarTheme(host);
  if (!theme) {
    return;
  }
  const copy = ruleSelectCopy();
  const root = ruleSelectRoot();
  const visible = root ? ruleSelectVisibleIds(root) : [];
  const pickedVisible = visible.filter((id) => ruleSelectSelected.has(id)).length;
  const master = theme.querySelector('[data-role="all"]');
  const count = theme.querySelector('[data-role="count"]');
  const status = theme.querySelector('[data-role="status"]');
  master.disabled = ruleSelectBusy || visible.length === 0;
  master.checked = visible.length > 0 && pickedVisible === visible.length;
  master.indeterminate = pickedVisible > 0 && pickedVisible < visible.length;
  master.title = copy.shown;
  master.setAttribute("aria-label", copy.shown);
  count.textContent = ruleSelectSelected.size ? copy.selected(ruleSelectSelected.size) : copy.none;
  const message = ruleSelectProgress || (!ruleSelectCatalog.rules.length ? copy.loading : ruleSelectError);
  status.textContent = message;
  status.dataset.tone = ruleSelectError && !ruleSelectProgress ? "error" : "info";
  const ready = !ruleSelectBusy && ruleSelectSelected.size > 0;
  theme.querySelectorAll("[data-act]").forEach((button) => {
    button.disabled = !ready;
  });
}

function ruleSelectOnKey(event) {
  if (event.key !== "Escape" || ruleSelectBusy) {
    return;
  }
  if (!document.getElementById(RULE_SELECT_DIALOG)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  ruleSelectCloseDialog();
}

function ruleSelectCloseDialog() {
  if (ruleSelectBusy) {
    return;
  }
  const host = document.getElementById(RULE_SELECT_DIALOG);
  if (host) {
    host.remove();
  }
}

function ruleSelectConfirm() {
  if (ruleSelectBusy || !ruleSelectSelected.size || document.getElementById(RULE_SELECT_DIALOG)) {
    return;
  }
  const copy = ruleSelectCopy();
  const host = document.createElement("div");
  host.id = RULE_SELECT_DIALOG;
  host.style.cssText = "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;";
  const theme = typeof attachUi === "function" ? attachUi(host) : null;
  if (!theme) {
    return;
  }
  if (typeof pageTheme === "function") {
    theme.dataset.theme = pageTheme();
  }
  const backdrop = document.createElement("div");
  backdrop.className = "ptaf-bulk-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "ptaf-bulk-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  const title = document.createElement("h2");
  title.textContent = copy.confirmTitle;
  const warning = document.createElement("p");
  warning.className = "ptaf-bulk-warning";
  warning.textContent = copy.confirm(ruleSelectSelected.size);
  const status = document.createElement("p");
  status.className = "ptaf-rule-select-status";
  status.dataset.role = "dialog-status";
  const actions = document.createElement("div");
  actions.className = "ptaf-bulk-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ptaf-bulk-cancel";
  cancel.textContent = copy.cancel;
  cancel.addEventListener("click", ruleSelectCloseDialog);
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "ptaf-bulk-submit ptaf-rule-select-danger";
  submit.textContent = copy.remove;
  submit.addEventListener("click", () => ruleSelectApply("remove"));
  actions.append(cancel, submit);
  dialog.append(title, warning, status, actions);
  backdrop.append(dialog);
  theme.append(backdrop);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      ruleSelectCloseDialog();
    }
  });
  document.body.append(host);
  cancel.focus();
}

function ruleSelectDialogStatus(message, failed) {
  const host = document.getElementById(RULE_SELECT_DIALOG);
  const theme = host && host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
  const status = theme && theme.querySelector('[data-role="dialog-status"]');
  if (status) {
    status.textContent = message;
    status.dataset.tone = failed ? "error" : "info";
  }
  if (!theme) {
    return;
  }
  theme.querySelectorAll("button").forEach((button) => {
    button.disabled = ruleSelectBusy;
  });
}

function ruleSelectNotice(message) {
  if (typeof showToast === "function") {
    showToast(message);
  }
}

function ruleSelectReload(message) {
  try {
    sessionStorage.setItem(RULE_SELECT_NOTICE, message);
  } catch (error) {
    ruleSelectNotice(message);
    return;
  }
  location.reload();
}

function ruleSelectRestoreNotice() {
  let message = "";
  try {
    message = sessionStorage.getItem(RULE_SELECT_NOTICE) || "";
    sessionStorage.removeItem(RULE_SELECT_NOTICE);
  } catch (error) {
    message = "";
  }
  if (message) {
    ruleSelectNotice(message);
  }
}

async function ruleSelectApply(kind) {
  const setId = ruleSelectSetId();
  const ids = [...ruleSelectSelected];
  if (ruleSelectBusy || !setId || !ids.length) {
    return;
  }
  const copy = ruleSelectCopy();
  ruleSelectBusy = true;
  ruleSelectError = "";
  ruleSelectProgress = copy.progress(copy.verbs[kind], 1, ids.length);
  ruleSelectPaintBar();
  ruleSelectDialogStatus(ruleSelectProgress, false);
  const root = ruleSelectRoot();
  if (root) {
    ruleSelectPaintChecks(root);
  }
  let done = 0;
  let failed = 0;
  let lastError = "";
  for (const id of ids) {
    ruleSelectProgress = copy.progress(copy.verbs[kind], done + failed + 1, ids.length);
    ruleSelectPaintBar();
    ruleSelectDialogStatus(ruleSelectProgress, false);
    try {
      const path = `/config/policies/templates/with_user_rules/${setId}/rules/${id}`;
      if (kind === "remove") {
        await api(path, { method: "DELETE" });
      } else {
        await api(path, { method: "PATCH", body: { enabled: kind === "enable" } });
      }
      done += 1;
      ruleSelectSelected.delete(id);
    } catch (error) {
      failed += 1;
      lastError = (error && error.message) || "";
    }
  }
  const message = [copy.result(kind, done, failed), lastError].filter(Boolean).join(" ");
  ruleSelectProgress = "";
  ruleSelectBusy = false;
  if (done > 0) {
    ruleSelectCloseDialog();
    ruleSelectReload(message);
    return;
  }
  ruleSelectError = message;
  ruleSelectPaintBar();
  ruleSelectDialogStatus(message, true);
  const current = ruleSelectRoot();
  if (current) {
    ruleSelectPaintChecks(current);
  }
}

async function ruleSelectSync() {
  if (!ruleSelectEnabled) {
    ruleSelectCloseDialog();
    ruleSelectClear();
    return;
  }
  if (ruleSelectStopped || !ruleSelectAlive()) {
    stopRuleSelect();
    return;
  }
  if (typeof api !== "function") {
    return;
  }
  const setId = ruleSelectSetId();
  const root = setId ? ruleSelectRoot() : null;
  if (!root) {
    if (!ruleSelectBusy) {
      ruleSelectClear();
    }
    return;
  }
  if (ruleSelectSet !== setId) {
    ruleSelectSet = setId;
    ruleSelectAnchor = "";
    ruleSelectError = "";
    if (!ruleSelectBusy) {
      ruleSelectSelected.clear();
    }
    ruleSelectCatalog = { id: "", rules: [], at: 0 };
  }
  ruleSelectStyle();
  const rows = ruleSelectRows(root);
  ruleSelectEnsureChecks(rows);
  try {
    const rules = await ruleSelectLoad(setId);
    if (ruleSelectStopped || ruleSelectSetId() !== setId) {
      return;
    }
    const current = ruleSelectRoot();
    if (!current) {
      return;
    }
    ruleSelectAssign(ruleSelectRows(current), rules);
    ruleSelectError = "";
  } catch (error) {
    ruleSelectError = (error && error.message) || ruleSelectCopy().readFailed;
  }
  const current = ruleSelectRoot();
  if (!current || ruleSelectStopped) {
    return;
  }
  ruleSelectEnsureChecks(ruleSelectRows(current));
  ruleSelectPaintChecks(current);
  ruleSelectEnsureBar(current);
  ruleSelectPaintBar();
}

function ruleSelectSchedule() {
  if (ruleSelectStopped || ruleSelectFrame) {
    return;
  }
  ruleSelectFrame = requestAnimationFrame(() => {
    ruleSelectFrame = 0;
    if (ruleSelectRunning) {
      ruleSelectAgain = true;
      return;
    }
    ruleSelectRunning = true;
    ruleSelectSync().finally(() => {
      ruleSelectRunning = false;
      if (ruleSelectAgain) {
        ruleSelectAgain = false;
        ruleSelectSchedule();
      }
    });
  });
}

function ruleSelectOwn(mutation) {
  const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
  if (target && target.closest && target.closest(`#${RULE_SELECT_BAR}, #${RULE_SELECT_DIALOG}, #${RULE_SELECT_STYLE}, .ptaf-rule-pick`)) {
    return true;
  }
  return [...(mutation.addedNodes || [])].some((node) => {
    if (node.nodeType !== 1) {
      return false;
    }
    if (node.id === RULE_SELECT_BAR || node.id === RULE_SELECT_DIALOG || node.id === RULE_SELECT_STYLE) {
      return true;
    }
    return Boolean(node.classList && (node.classList.contains("ptaf-rule-pick") || node.classList.contains("ptaf-rule-select-host")));
  });
}

function ruleSelectWatch() {
  ruleSelectObserver = new MutationObserver((mutations) => {
    if (mutations.every(ruleSelectOwn)) {
      return;
    }
    ruleSelectSchedule();
  });
  ruleSelectObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("popstate", ruleSelectSchedule);
  document.addEventListener("keydown", ruleSelectOnKey, true);
}

if (typeof pluginSetting === "function") {
  pluginSetting("bulkActions", true, (enabled) => {
    ruleSelectEnabled = enabled;
    ruleSelectSchedule();
  });
}
ruleSelectRestoreNotice();
ruleSelectWatch();
ruleSelectSchedule();
