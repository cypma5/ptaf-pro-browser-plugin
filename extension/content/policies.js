const POLICY_TEMPLATE_NODE = "ptaf-user-policies-templates-node";
const POLICY_APP_NODE = "ptaf-applications-node";
const POLICY_RULES_NODE = "ptaf-user-rules-node";
const POLICY_THREATS = {
  high: { en: "High", ru: "Высокая", color: "#e06b5c" },
  medium: { en: "Medium", ru: "Средняя", color: "#e0a045" },
  low: { en: "Low", ru: "Низкая", color: "#3d7ef0" },
  none: { en: "None", ru: "Нет", color: "#8d93a8" },
};
const POLICY_CLASSES = {
  attack: { en: "Attack", ru: "Атака" },
  weakness: { en: "Weakness", ru: "Уязвимость" },
  incident: { en: "Incident", ru: "Инцидент" },
  info: { en: "Info", ru: "Информация" },
};

let policyFacts = null;
let policyFetchedAt = 0;
let policyFailedAt = 0;
let policyRules = null;
let policyRulesAt = 0;
let policyRulesFailedAt = 0;
let policyLoading = null;
let policyRulesLoading = null;
let policyFrame = 0;
let policyObserver = null;
let policyStopped = false;
let policyEnabled = true;
let userRulesEnabled = true;

function policyAlive() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

function stopPolicies() {
  if (policyStopped) {
    return;
  }
  policyStopped = true;
  if (policyFrame) {
    cancelAnimationFrame(policyFrame);
    policyFrame = 0;
  }
  if (policyObserver) {
    policyObserver.disconnect();
    policyObserver = null;
  }
  document.querySelectorAll(".ptaf-policy-meta, .ptaf-policy-base, .ptaf-rule-list, .ptaf-rule-bar, .ptaf-rule-extra, #ptaf-policy-style").forEach((node) => node.remove());
}

function policyList(body) {
  if (Array.isArray(body)) {
    return body;
  }
  return body && Array.isArray(body.items) ? body.items : [];
}

function policyEnglish() {
  const root = document.querySelector(`${POLICY_TEMPLATE_NODE}, ${POLICY_APP_NODE}, ${POLICY_RULES_NODE}`);
  const text = root ? root.textContent : "";
  if (/user rule set|based on|security policy template|web application/i.test(text)) {
    return true;
  }
  if (/набор пользовательских правил|на основе|шаблон политик|веб-приложен/i.test(text)) {
    return false;
  }
  return false;
}

function policyCopy(english) {
  if (english) {
    return {
      based: (name) => `Based on ${name}`,
      on: "User rules set is on",
      off: "User rules set is off",
      count: (enabled, available) => `${enabled} enabled, ${available} available`,
      system: "system",
    };
  }
  return {
    based: (name) => `На основе ${name}`,
    on: "Набор пользовательских правил включён",
    off: "Набор пользовательских правил выключен",
    count: (enabled, available) => `${enabled} включено, ${available} доступно`,
    system: "системное",
  };
}

function policyStyle() {
  if (document.getElementById("ptaf-policy-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "ptaf-policy-style";
  style.textContent = [
    "ptaf-user-policies-templates-node .title-row:has(.ptaf-policy-meta),",
    "ptaf-applications-node .title-row:has(.ptaf-policy-base){display:flex;align-items:center;gap:8px;min-width:0;}",
    "ptaf-user-policies-templates-node .title-row:has(.ptaf-policy-meta)>h4,",
    "ptaf-applications-node .title-row:has(.ptaf-policy-base)>h4{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".ptaf-policy-meta{display:inline-flex;flex:none;align-items:center;gap:6px;margin-left:auto;color:inherit;pointer-events:none;}",
    ".ptaf-policy-meta svg{display:block;flex:none;}",
    ".ptaf-policy-count{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;line-height:16px;letter-spacing:0;}",
    ".ptaf-policy-base{flex:none;max-width:58%;margin:0 0 0 auto;overflow:hidden;color:rgb(138,143,168);font-size:11px;font-weight:400;line-height:16px;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;}",
    ".ptaf-rule-list{display:flex;flex-direction:column;margin-top:4px;}",
    ".ptaf-rule-set{margin:8px 0 2px;color:rgb(138,143,168);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}",
    ".ptaf-rule-row{display:flex;align-items:center;gap:8px;min-height:36px;min-width:0;}",
    ".ptaf-rule-row.is-off{opacity:.55;}",
    ".ptaf-rule-bar{flex:none;width:3px;height:28px;border-radius:2px;}",
    ".ptaf-rule-name{min-width:0;overflow:hidden;font-size:13px;line-height:18px;text-overflow:ellipsis;white-space:nowrap;}",
    ".ptaf-rule-extra{flex:none;max-width:54%;margin-left:auto;overflow:hidden;color:rgb(138,143,168);font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap;}",
    ".all-rules .rules>div:has(.ptaf-rule-bar)>.name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ].join("");
  document.documentElement.append(style);
}

function policyIcon(on) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  if (on) {
    circle.setAttribute("r", "7");
    circle.setAttribute("fill", "#2f9e6b");
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "path");
    mark.setAttribute("d", "M4.6 8.2 7 10.6 11.6 5.6");
    mark.setAttribute("fill", "none");
    mark.setAttribute("stroke", "#fff");
    mark.setAttribute("stroke-width", "1.6");
    mark.setAttribute("stroke-linecap", "round");
    mark.setAttribute("stroke-linejoin", "round");
    svg.append(circle, mark);
    return svg;
  }
  circle.setAttribute("r", "7");
  circle.setAttribute("fill", "#8d93a8");
  const slash = document.createElementNS("http://www.w3.org/2000/svg", "path");
  slash.setAttribute("d", "M4.5 8h7");
  slash.setAttribute("fill", "none");
  slash.setAttribute("stroke", "#fff");
  slash.setAttribute("stroke-width", "1.6");
  slash.setAttribute("stroke-linecap", "round");
  svg.append(circle, slash);
  return svg;
}

function policyTitle(item) {
  const heading = item.querySelector(".title-row h4");
  return heading ? heading.textContent.replace(/\s+/g, " ").trim() : "";
}

function policyCards(selector) {
  const root = document.querySelector(selector);
  if (!root) {
    return [];
  }
  return [...root.querySelectorAll("ptaf-node-item")].filter((item) => item.closest(selector) === root);
}

function policyPlace(item, className, signature) {
  const row = item.querySelector(".title-row");
  if (!row) {
    return;
  }
  const existing = row.querySelector(`:scope > .${className}`);
  if (item.dataset.ptafPolicyMark === signature && existing) {
    return;
  }
  if (existing) {
    existing.remove();
  }
  item.dataset.ptafPolicyMark = signature;
  return row;
}

async function loadPolicyFacts() {
  const now = Date.now();
  if (policyFacts && now - policyFetchedAt < 30000) {
    return policyFacts;
  }
  if (policyLoading) {
    return policyLoading;
  }
  policyLoading = (async () => {
    const [users, vendors, apps] = await Promise.all([
      api("/config/policies/templates/user"),
      api("/config/policies/templates/vendor").catch(() => null),
      api("/config/applications").catch(() => null),
    ]);
    const detailed = await Promise.all(policyList(users).filter((item) => item && item.id).map(async (item) => {
      const [detail, stats] = await Promise.all([
        api(`/config/policies/templates/user/${item.id}`).catch(() => null),
        api(`/config/policies/templates/user/${item.id}/stats`).catch(() => null),
      ]);
      const rules = stats && stats.system_rules;
      return {
        id: item.id,
        name: (detail && detail.name) || item.name || "",
        hasUserRules: Boolean(detail && detail.has_user_rules),
        enabled: rules && Number.isFinite(Number(rules.enabled)) ? Number(rules.enabled) : null,
        available: rules && Number.isFinite(Number(rules.available)) ? Number(rules.available) : null,
      };
    }));
    const names = new Map();
    detailed.forEach((item) => {
      if (item.id && item.name) {
        names.set(item.id, item.name);
      }
    });
    policyList(vendors).forEach((item) => {
      if (item && item.id && item.name && !names.has(item.id)) {
        names.set(item.id, item.name);
      }
    });
    policyFacts = {
      templates: detailed,
      applications: policyList(apps).map((item) => ({
        name: item && item.name ? item.name : "",
        templateName: item && names.get(item.policy_template_id) || "",
      })),
    };
    policyFetchedAt = Date.now();
    policyFailedAt = 0;
    return policyFacts;
  })();
  try {
    return await policyLoading;
  } finally {
    policyLoading = null;
  }
}

function paintPolicyTemplates(facts, copy) {
  const byName = new Map(facts.templates.map((item) => [item.name, item]));
  policyCards(POLICY_TEMPLATE_NODE).forEach((item) => {
    const found = byName.get(policyTitle(item));
    const row = item.querySelector(".title-row");
    if (!found || !row) {
      const stale = row && row.querySelector(":scope > .ptaf-policy-meta");
      if (stale) {
        stale.remove();
        delete item.dataset.ptafPolicyMark;
      }
      return;
    }
    const count = found.enabled === null || found.available === null ? "" : `${found.enabled}/${found.available}`;
    const signature = `rules:${found.hasUserRules ? 1 : 0}:${count}`;
    const host = policyPlace(item, "ptaf-policy-meta", signature);
    if (!host) {
      return;
    }
    const meta = document.createElement("span");
    meta.className = found.hasUserRules ? "ptaf-policy-meta" : "ptaf-policy-meta is-off";
    const icon = document.createElement("span");
    icon.title = found.hasUserRules ? copy.on : copy.off;
    icon.append(policyIcon(found.hasUserRules));
    meta.append(icon);
    if (count) {
      const value = document.createElement("span");
      value.className = "ptaf-policy-count";
      value.textContent = count;
      value.title = copy.count(found.enabled, found.available);
      meta.append(value);
    }
    host.append(meta);
  });
}

function paintPolicyApplications(facts, copy) {
  const byName = new Map(facts.applications.map((item) => [item.name, item.templateName]));
  policyCards(POLICY_APP_NODE).forEach((item) => {
    const templateName = byName.get(policyTitle(item)) || "";
    const row = item.querySelector(".title-row");
    if (!templateName || !row) {
      const stale = row && row.querySelector(":scope > .ptaf-policy-base");
      if (stale) {
        stale.remove();
        delete item.dataset.ptafPolicyMark;
      }
      return;
    }
    const label = copy.based(templateName);
    const host = policyPlace(item, "ptaf-policy-base", `base:${label}`);
    if (!host) {
      return;
    }
    const note = document.createElement("span");
    note.className = "ptaf-policy-base";
    note.textContent = label;
    note.title = label;
    host.append(note);
  });
}

function policyPhrase(table, id, english) {
  const known = table[String(id || "").toLowerCase()];
  if (known) {
    return english ? known.en : known.ru;
  }
  const raw = String(id || "").trim();
  if (!raw) {
    return "";
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function policyRuleSignature(rule) {
  const actions = rule.actions.map((action) => `${action.system ? 1 : 0}:${action.name}`).join(",");
  return `${rule.name}|${rule.enabled ? 1 : 0}|${rule.threat}|${rule.className}|${actions}`;
}

function policyRuleBar(rule, english) {
  const bar = document.createElement("i");
  bar.className = "ptaf-rule-bar";
  const known = POLICY_THREATS[String(rule.threat || "").toLowerCase()] || {};
  bar.style.background = known.color || "#8d93a8";
  bar.title = policyPhrase(POLICY_THREATS, rule.threat, english);
  return bar;
}

function policyRuleExtra(rule, copy, english) {
  const extra = document.createElement("span");
  extra.className = "ptaf-rule-extra";
  const type = policyPhrase(POLICY_CLASSES, rule.className, english);
  const actions = rule.actions.map((action) => (action.system ? `${action.name} (${copy.system})` : action.name)).join(", ");
  const text = [type, actions].filter(Boolean).join(" · ");
  extra.textContent = text;
  extra.title = text;
  return extra;
}

async function loadPolicyRules() {
  const now = Date.now();
  if (policyRules && now - policyRulesAt < 30000) {
    return policyRules;
  }
  if (policyRulesLoading) {
    return policyRulesLoading;
  }
  policyRulesLoading = (async () => {
    const [setsBody, actionsBody] = await Promise.all([
      api("/config/policies/templates/with_user_rules"),
      api("/config/actions").catch(() => null),
    ]);
    const actionById = new Map(policyList(actionsBody).map((item) => [item.id, item]));
    const groups = await Promise.all(policyList(setsBody).filter((item) => item && item.id).map(async (set) => {
      const listed = policyList(await api(`/config/policies/templates/with_user_rules/${set.id}/rules`).catch(() => null));
      const rules = await Promise.all(listed.filter((item) => item && item.id).map(async (item) => {
        const detail = await api(`/config/policies/templates/with_user_rules/${set.id}/rules/${item.id}`).catch(() => null);
        const ids = detail && detail.configuration && Array.isArray(detail.configuration.actions) ? detail.configuration.actions : [];
        const event = (detail && detail.event) || item.event || {};
        return {
          name: (detail && detail.name) || item.name || "",
          enabled: detail ? detail.enabled !== false : item.enabled !== false,
          threat: event.threat || "none",
          className: event.class || "",
          actions: ids.map((id) => actionById.get(id)).filter(Boolean).map((action) => ({
            name: action.name || "",
            system: Boolean(action.is_system),
          })),
        };
      }));
      return { name: set.name || "", rules };
    }));
    policyRules = groups;
    policyRulesAt = Date.now();
    policyRulesFailedAt = 0;
    return policyRules;
  })();
  try {
    return await policyRulesLoading;
  } finally {
    policyRulesLoading = null;
  }
}

function paintRuleCatalog(groups, copy, english) {
  const host = document.querySelector(`${POLICY_RULES_NODE} .body`) || document.querySelector(POLICY_RULES_NODE);
  if (host) {
    const signature = groups.map((group) => `${group.name}:${group.rules.map(policyRuleSignature).join("|")}`).join(";");
    let list = host.querySelector(":scope > .ptaf-rule-list");
    if (!list || list.dataset.signature !== signature) {
      if (list) {
        list.remove();
      }
      list = document.createElement("div");
      list.className = "ptaf-rule-list";
      list.dataset.signature = signature;
      groups.forEach((group) => {
        if (groups.length > 1 && group.name) {
          const heading = document.createElement("div");
          heading.className = "ptaf-rule-set";
          heading.textContent = group.name;
          list.append(heading);
        }
        group.rules.forEach((rule) => {
          const row = document.createElement("div");
          row.className = rule.enabled ? "ptaf-rule-row" : "ptaf-rule-row is-off";
          const name = document.createElement("span");
          name.className = "ptaf-rule-name";
          name.textContent = rule.name;
          name.title = rule.name;
          row.append(policyRuleBar(rule, english), name, policyRuleExtra(rule, copy, english));
          list.append(row);
        });
      });
      const stats = host.querySelector(".stats");
      if (stats && stats.parentElement === host) {
        stats.after(list);
      } else {
        host.append(list);
      }
    }
  }
  const queues = new Map();
  groups.forEach((group) => {
    group.rules.forEach((rule) => {
      const bucket = queues.get(rule.name) || [];
      bucket.push(rule);
      queues.set(rule.name, bucket);
    });
  });
  const used = new Map();
  document.querySelectorAll(".all-rules .rules > div").forEach((row) => {
    const nameNode = row.querySelector(":scope > .name");
    if (!nameNode) {
      return;
    }
    const name = nameNode.textContent.replace(/\s+/g, " ").trim();
    const bucket = queues.get(name) || [];
    const index = used.get(name) || 0;
    used.set(name, index + 1);
    const rule = bucket[index] || bucket[0];
    if (!rule) {
      return;
    }
    const signature = policyRuleSignature(rule);
    if (row.dataset.ptafRule === signature && row.querySelector(":scope > .ptaf-rule-bar")) {
      return;
    }
    row.querySelectorAll(":scope > .ptaf-rule-bar, :scope > .ptaf-rule-extra").forEach((node) => node.remove());
    row.dataset.ptafRule = signature;
    row.insertBefore(policyRuleBar(rule, english), nameNode);
    const extra = policyRuleExtra(rule, copy, english);
    const actions = row.querySelector(":scope > .actions");
    if (actions) {
      row.insertBefore(extra, actions);
    } else {
      row.append(extra);
    }
  });
}

function hidePolicyFacts() {
  document.querySelectorAll(".ptaf-policy-meta, .ptaf-policy-base").forEach((node) => node.remove());
}

function hideUserRules() {
  document.querySelectorAll(".ptaf-rule-list, .ptaf-rule-bar, .ptaf-rule-extra").forEach((node) => node.remove());
  document.querySelectorAll("[data-ptaf-rule]").forEach((row) => {
    delete row.dataset.ptafRule;
  });
}

function hidePolicyStyle() {
  if (policyEnabled || userRulesEnabled) {
    return;
  }
  const style = document.getElementById("ptaf-policy-style");
  if (style) {
    style.remove();
  }
}

function paintPolicies() {
  if (policyEnabled && policyFacts) {
    policyStyle();
    const copy = policyCopy(policyEnglish());
    paintPolicyTemplates(policyFacts, copy);
    paintPolicyApplications(policyFacts, copy);
  } else if (!policyEnabled) {
    hidePolicyFacts();
  }
  if (userRulesEnabled && policyRules) {
    policyStyle();
    const english = policyEnglish();
    paintRuleCatalog(policyRules, policyCopy(english), english);
  } else if (!userRulesEnabled) {
    hideUserRules();
  }
  hidePolicyStyle();
}

function schedulePolicies() {
  if (policyStopped || policyFrame) {
    return;
  }
  policyFrame = requestAnimationFrame(() => {
    policyFrame = 0;
    syncPolicies();
  });
}

async function syncPolicies() {
  if (!policyEnabled && !userRulesEnabled) {
    hidePolicyFacts();
    hideUserRules();
    hidePolicyStyle();
    return;
  }
  if (policyStopped || !policyAlive()) {
    stopPolicies();
    return;
  }
  if (typeof api !== "function") {
    return;
  }
  const wantsFacts = policyEnabled && document.querySelector(`${POLICY_TEMPLATE_NODE}, ${POLICY_APP_NODE}`);
  const wantsRules = userRulesEnabled && document.querySelector(`${POLICY_RULES_NODE}, .all-rules`);
  if (!wantsFacts && !wantsRules) {
    if (!policyEnabled) {
      hidePolicyFacts();
    }
    if (!userRulesEnabled) {
      hideUserRules();
    }
    hidePolicyStyle();
    return;
  }
  if (wantsFacts && !(policyFailedAt && Date.now() - policyFailedAt < 15000)) {
    try {
      await loadPolicyFacts();
    } catch (error) {
      policyFailedAt = Date.now();
    }
  }
  if (wantsRules && !(policyRulesFailedAt && Date.now() - policyRulesFailedAt < 15000)) {
    try {
      await loadPolicyRules();
    } catch (error) {
      policyRulesFailedAt = Date.now();
    }
  }
  if (policyStopped) {
    return;
  }
  paintPolicies();
}

function policyOwnMutation(mutation) {
  const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
  if (target && target.closest && target.closest(".ptaf-policy-meta, .ptaf-policy-base, .ptaf-rule-list, .ptaf-rule-bar, .ptaf-rule-extra, .ptaf-rule-name, .ptaf-rule-row, .ptaf-rule-set, #ptaf-policy-style")) {
    return true;
  }
  return [...(mutation.addedNodes || [])].some((node) => node.nodeType === 1 && node.classList && [...node.classList].some((name) => name.startsWith("ptaf-policy-") || name.startsWith("ptaf-rule-")));
}

function watchPolicies() {
  policyObserver = new MutationObserver((mutations) => {
    if (mutations.every(policyOwnMutation)) {
      return;
    }
    schedulePolicies();
  });
  policyObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (typeof pluginSetting === "function") {
  pluginSetting("policyList", true, (enabled) => {
    policyEnabled = enabled;
    if (!enabled) {
      hidePolicyFacts();
      hidePolicyStyle();
    }
    schedulePolicies();
  });
  pluginSetting("userRuleSet", true, (enabled) => {
    userRulesEnabled = enabled;
    if (!enabled) {
      hideUserRules();
      hidePolicyStyle();
    }
    schedulePolicies();
  });
}
watchPolicies();
schedulePolicies();
