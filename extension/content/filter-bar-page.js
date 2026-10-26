(function () {
  if (window.__ptafFilterBarPage) {
    return;
  }
  window.__ptafFilterBarPage = true;

  function monacoApi() {
    if (window.__ptafFilterMonaco) {
      return window.__ptafFilterMonaco;
    }
    const chunk = window.webpackChunkwaf_ui_ng;
    if (!chunk || typeof chunk.push !== "function") {
      return null;
    }
    let req = window.__ptafFilterRequire;
    if (!req) {
      try {
        chunk.push([["ptaf-fb-monaco"], {}, function (next) {
          req = next;
        }]);
        window.__ptafFilterRequire = req;
      } catch (error) {
        return null;
      }
    }
    const cache = (req && req.c) || {};
    for (const id in cache) {
      const exp = cache[id] && cache[id].exports;
      if (exp && exp.editor && typeof exp.editor.getEditors === "function") {
        window.__ptafFilterMonaco = exp.editor;
        return exp.editor;
      }
    }
    return null;
  }

  function editor() {
    const api = monacoApi();
    const node = document.querySelector("ptaf-filter-input .monaco-editor");
    if (!api || !node || typeof api.getEditors !== "function") {
      return null;
    }
    const list = api.getEditors();
    for (let index = 0; index < list.length; index += 1) {
      if (list[index].getDomNode && list[index].getDomNode() === node) {
        return list[index];
      }
    }
    return null;
  }

  function handler(name) {
    const input = document.querySelector("ptaf-filter-input");
    const tasks = input && input["__zone_symbol__" + name + "false"];
    const task = tasks && tasks[0];
    if (!task || typeof task.callback !== "function") {
      return null;
    }
    const unwrapped = task.callback("__ngUnwrap__");
    if (typeof unwrapped !== "function") {
      return null;
    }
    const fn = unwrapped(Function);
    return typeof fn === "function" ? fn : null;
  }

  function normalize(text) {
    return String(text || "").replace(/\u00a0/g, " ").replace(/\s*\n\s*/g, " ").trim();
  }

  function readText() {
    const current = editor();
    if (current && typeof current.getValue === "function") {
      return normalize(current.getValue());
    }
    const lines = document.querySelector("ptaf-filter-input .view-lines");
    return lines ? normalize(lines.innerText) : "";
  }

  function writeText(text) {
    const apply = handler("apply");
    const clear = handler("clear");
    const current = editor();
    if (current && typeof current.setValue === "function") {
      if (current.getValue() !== text) {
        current.setValue(text);
      }
      if (text === "" && clear) {
        clear();
      } else if (apply) {
        apply();
      }
      return Boolean(apply || (text === "" && clear));
    }
    const change = handler("filterChange");
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

  document.documentElement.addEventListener("ptaf-filter-command", function () {
    const root = document.documentElement;
    const op = root.getAttribute("data-ptaf-filter-op");
    try {
      if (op === "read") {
        root.setAttribute("data-ptaf-filter-text", readText());
        root.setAttribute("data-ptaf-filter-result", "1");
        return;
      }
      if (op === "write") {
        const ok = writeText(root.getAttribute("data-ptaf-filter-text") || "");
        root.setAttribute("data-ptaf-filter-result", ok ? "1" : "0");
      }
    } catch (error) {
      root.setAttribute("data-ptaf-filter-result", "0");
    }
  });

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.__ptafFilterUrl = url;
    } catch (error) {
      /* some request objects reject extra fields */
    }
    return open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      const url = String(this.__ptafFilterUrl || "");
      if (url.indexOf("/threats/events/") !== -1 && typeof body === "string" && body.indexOf("timerange") !== -1) {
        const parsed = JSON.parse(body);
        const range = parsed && parsed.timerange;
        if (range && range.start != null) {
          window.postMessage({
            source: "ptaf-filter-bar",
            timerange: {
              start: range.start,
              end: range.end == null ? null : range.end,
            },
          }, window.location.origin);
        }
      }
    } catch (error) {
      /* not an events query */
    }
    return send.apply(this, arguments);
  };
}());
