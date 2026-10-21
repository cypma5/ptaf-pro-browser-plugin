const USER_AGENT_RULE_ID = 1;

let userAgentRuleInstall = null;

function installUserAgentRule() {
  if (userAgentRuleInstall) {
    return userAgentRuleInstall;
  }
  const version = chrome.runtime.getManifest().version;
  let pending;
  try {
    pending = chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [USER_AGENT_RULE_ID],
      addRules: [
        {
          id: USER_AGENT_RULE_ID,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "user-agent",
                operation: "set",
                value: `PTAF-PRO-Browser-Extension/${version}`,
              },
            ],
          },
          condition: {
            urlFilter: "ptaf_ext=1",
            resourceTypes: ["xmlhttprequest"],
          },
        },
      ],
    });
  } catch (error) {
    pending = Promise.reject(error);
  }
  userAgentRuleInstall = Promise.resolve(pending).finally(() => {
    userAgentRuleInstall = null;
  });
  return userAgentRuleInstall;
}

chrome.runtime.onInstalled.addListener(() => {
  installUserAgentRule().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  installUserAgentRule().catch(() => {});
});

installUserAgentRule().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "ensure-plugin-user-agent") {
    return;
  }
  installUserAgentRule().then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false })
  );
  return true;
});
