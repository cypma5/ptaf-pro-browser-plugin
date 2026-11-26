(function () {
  if (window.__ptafRuleBuilderPage) {
    return;
  }
  window.__ptafRuleBuilderPage = true;

  function monacoApi() {
    if (window.__ptafRuleMonaco) {
      return window.__ptafRuleMonaco;
    }
    const chunk = window.webpackChunkwaf_ui_ng;
    if (!chunk || typeof chunk.push !== "function") {
      return null;
    }
    let req = window.__ptafRuleRequire;
    if (!req) {
      try {
        chunk.push([["ptaf-rb-monaco"], {}, function (next) {
          req = next;
        }]);
        window.__ptafRuleRequire = req;
      } catch (error) {
        return null;
      }
    }
    const cache = (req && req.c) || {};
    for (const id in cache) {
      const exp = cache[id] && cache[id].exports;
      if (exp && exp.editor && typeof exp.editor.getEditors === "function") {
        window.__ptafRuleMonaco = exp.editor;
        return exp.editor;
      }
    }
    return null;
  }

  function fieldRoot() {
    return document.querySelector(
      "ptaf-user-rule-base-form .field-code, ptaf-user-rule-form-card .field-code, ptaf-ddf-core-field.field-code"
    );
  }

  function monacoHost() {
    const root = fieldRoot();
    return root && root.querySelector("ptaf-monaco-editor, ptaf-ddf-monaco-editor-template, .monaco-editor");
  }

  function editor() {
    const api = monacoApi();
    const root = fieldRoot();
    const node = root && root.querySelector(".monaco-editor");
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

  function readText() {
    const current = editor();
    if (current && typeof current.getValue === "function") {
      return String(current.getValue() || "").replace(/\u00a0/g, " ");
    }
    const root = fieldRoot();
    const lines = root && root.querySelector(".view-lines");
    return lines ? String(lines.innerText || "").replace(/\u00a0/g, " ") : "";
  }

  function zoneHandler(node, name) {
    if (!node) {
      return null;
    }
    const tasks = node["__zone_symbol__" + name + "false"] || node["__zone_symbol__" + name + "true"];
    const task = tasks && tasks[0];
    if (!task || typeof task.callback !== "function") {
      return null;
    }
    try {
      const unwrapped = task.callback("__ngUnwrap__");
      if (typeof unwrapped !== "function") {
        return null;
      }
      const fn = unwrapped(Function);
      return typeof fn === "function" ? fn : null;
    } catch (error) {
      return null;
    }
  }

  function looksLikeControl(value) {
    return Boolean(
      value &&
      typeof value.setValue === "function" &&
      typeof value.markAsDirty === "function" &&
      ("pristine" in value || "dirty" in value || typeof value.markAsTouched === "function")
    );
  }

  function collectControls(value, bag, depth) {
    if (!value || depth > 5) {
      return;
    }
    if (looksLikeControl(value)) {
      bag.push(value);
      return;
    }
    if (typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectControls(item, bag, depth + 1));
      return;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length && bag.length < 12; index += 1) {
      try {
        collectControls(value[keys[index]], bag, depth + 1);
      } catch (error) {
        /* ignore */
      }
    }
  }

  function angularControls(start) {
    const bag = [];
    const ng = window.ng;
    let node = start;
    for (let guard = 0; node && guard < 10; guard += 1) {
      try {
        if (ng && typeof ng.getDirectives === "function") {
          const dirs = ng.getDirectives(node) || [];
          dirs.forEach((dir) => {
            if (dir && looksLikeControl(dir.control)) {
              bag.push(dir.control);
            }
            if (dir && looksLikeControl(dir)) {
              bag.push(dir);
            }
            if (dir && dir.valueAccessor && typeof dir.valueAccessor.onChange === "function") {
              bag.push(dir);
            }
            collectControls(dir, bag, 0);
          });
        }
        if (ng && typeof ng.getComponent === "function") {
          collectControls(ng.getComponent(node), bag, 0);
        }
        if (ng && typeof ng.getOwningComponent === "function") {
          collectControls(ng.getOwningComponent(node), bag, 0);
        }
      } catch (error) {
        /* ignore */
      }
      if (node.__ngContext__) {
        collectControls(node.__ngContext__, bag, 0);
      }
      node = node.parentElement;
    }
    return bag.filter((item, index, list) => list.indexOf(item) === index);
  }

  function syncAngular(value) {
    const host = monacoHost() || fieldRoot();
    const names = ["codeChange", "valueChange", "onChange", "change", "input", "ngModelChange"];
    names.forEach((name) => {
      const handler = zoneHandler(host, name) || zoneHandler(fieldRoot(), name);
      if (handler) {
        try {
          handler(value);
        } catch (error) {
          try {
            handler({ target: { value: value } });
          } catch (ignored) {
            /* ignore */
          }
        }
      }
    });

    angularControls(host).forEach((control) => {
      try {
        if (typeof control.setValue === "function") {
          const current = typeof control.value === "string" || control.value == null ? control.value : null;
          if (current == null || typeof control.value === "string") {
            if (control.value !== value) {
              control.setValue(value);
            }
          }
        }
        if (typeof control.markAsDirty === "function") {
          control.markAsDirty();
        }
        if (typeof control.markAsTouched === "function") {
          control.markAsTouched();
        }
        if (typeof control.updateValueAndValidity === "function") {
          control.updateValueAndValidity({ emitEvent: true });
        }
        if (control.valueAccessor && typeof control.valueAccessor.onChange === "function") {
          control.valueAccessor.onChange(value);
        }
        if (typeof control.onChange === "function") {
          control.onChange(value);
        }
      } catch (error) {
        /* ignore */
      }
    });

    const root = fieldRoot();
    const area = root && root.querySelector("textarea.inputarea");
    if (area) {
      try {
        area.focus({ preventScroll: true });
      } catch (error) {
        /* ignore */
      }
      try {
        area.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertFromPaste" }));
      } catch (error) {
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }
      area.dispatchEvent(new Event("change", { bubbles: true }));
      area.dispatchEvent(new Event("blur", { bubbles: true }));
    }
  }

  function writeText(text) {
    const current = editor();
    const value = String(text == null ? "" : text);
    if (!current || typeof current.getValue !== "function") {
      return false;
    }
    const previous = String(current.getValue() || "");
    if (previous !== value) {
      const model = typeof current.getModel === "function" ? current.getModel() : null;
      if (model && typeof current.executeEdits === "function" && typeof model.getFullModelRange === "function") {
        current.executeEdits("ptaf-rule-builder", [{
          range: model.getFullModelRange(),
          text: value,
          forceMoveMarkers: true,
        }]);
      } else if (typeof current.setValue === "function") {
        current.setValue(value);
      } else {
        return false;
      }
    }
    syncAngular(value);
    try {
      if (typeof current.trigger === "function") {
        current.trigger("ptaf-rule-builder", "type", { text: "" });
      }
    } catch (error) {
      /* ignore */
    }
    if (typeof current.layout === "function") {
      current.layout();
    }
    return true;
  }

  function setHidden(hidden) {
    const root = fieldRoot();
    if (!root) {
      return false;
    }
    const host = root.querySelector("ptaf-monaco-editor, ptaf-ddf-monaco-editor-template, .editor");
    const target = host || root;
    const props = ["position", "left", "top", "width", "height", "overflow", "opacity", "pointer-events", "margin", "padding"];
    if (hidden) {
      target.setAttribute("data-ptaf-rb-hidden", "1");
      // Keep the editor mounted (no display:none) so Angular CVA still accepts writes.
      target.style.setProperty("position", "absolute", "important");
      target.style.setProperty("left", "-10000px", "important");
      target.style.setProperty("top", "0", "important");
      target.style.setProperty("width", "1px", "important");
      target.style.setProperty("height", "1px", "important");
      target.style.setProperty("overflow", "hidden", "important");
      target.style.setProperty("opacity", "0", "important");
      target.style.setProperty("pointer-events", "none", "important");
      target.style.setProperty("margin", "0", "important");
      target.style.setProperty("padding", "0", "important");
    } else {
      target.removeAttribute("data-ptaf-rb-hidden");
      props.forEach((name) => target.style.removeProperty(name));
      const current = editor();
      if (current && typeof current.layout === "function") {
        current.layout();
      }
    }
    return true;
  }

  document.documentElement.addEventListener("ptaf-rule-builder-command", function () {
    const root = document.documentElement;
    const op = root.getAttribute("data-ptaf-rb-op");
    try {
      if (op === "read") {
        root.setAttribute("data-ptaf-rb-text", readText());
        root.setAttribute("data-ptaf-rb-result", "1");
        return;
      }
      if (op === "write") {
        const ok = writeText(root.getAttribute("data-ptaf-rb-text") || "");
        root.setAttribute("data-ptaf-rb-result", ok ? "1" : "0");
        return;
      }
      if (op === "hide") {
        root.setAttribute("data-ptaf-rb-result", setHidden(true) ? "1" : "0");
        return;
      }
      if (op === "show") {
        root.setAttribute("data-ptaf-rb-result", setHidden(false) ? "1" : "0");
      }
    } catch (error) {
      root.setAttribute("data-ptaf-rb-result", "0");
    }
  });
}());
