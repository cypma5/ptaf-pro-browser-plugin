let ptafReObserver = null;
let ptafReFrame = 0;

function ptafReField(node) {
  return Boolean(node && node.classList && (node.classList.contains("field-if-path") || node.classList.contains("field-if-value")));
}

function ptafReThemeHosts() {
  document.querySelectorAll(".ptaf-re-host").forEach((host) => {
    const root = host.shadowRoot && host.shadowRoot.querySelector(".ptaf-theme");
    if (root && typeof pageTheme === "function") {
      root.dataset.theme = pageTheme();
    }
  });
}

function stopRegexHelp() {
  if (ptafReObserver) {
    ptafReObserver.disconnect();
    ptafReObserver = null;
  }
  if (ptafReFrame) {
    cancelAnimationFrame(ptafReFrame);
    ptafReFrame = 0;
  }
  document.querySelectorAll(".ptaf-re-host").forEach((host) => {
    if (host.ptafReStop) {
      host.ptafReStop();
    }
    host.remove();
  });
}

function ptafReSchedule() {
  if (ptafReFrame) {
    return;
  }
  ptafReFrame = requestAnimationFrame(() => {
    ptafReFrame = 0;
    ptafReScan();
  });
}

function ptafReScan() {
  document.querySelectorAll(".ptaf-re-host").forEach((host) => {
    const input = host.ptafReInput;
    const field = host.parentElement;
    if (!input || !input.isConnected || !field || !field.contains(input) || !ptafReField(field)) {
      if (host.ptafReStop) {
        host.ptafReStop();
      }
      host.remove();
    }
  });
  document.querySelectorAll(".field-if-path, .field-if-value").forEach((field) => {
    if (field.querySelector(":scope > .ptaf-re-host")) {
      return;
    }
    const input = field.querySelector("input.kbq-input");
    if (!input) {
      return;
    }
    ptafReAttach(field, input);
  });
}

function ptafReAttach(field, input) {
  const host = document.createElement("div");
  host.className = "ptaf-re-host";
  host.style.display = "block";
  host.style.marginTop = "8px";
  host.style.maxWidth = "100%";
  const theme = typeof attachUi === "function" ? attachUi(host) : null;
  if (!theme) {
    return;
  }
  theme.classList.add("ptaf-re-root");
  host.ptafReInput = input;
  field.append(host);

  const state = {
    input,
    pattern: null,
    sample: "",
    step: 0,
    hot: 0,
    hoverStep: -1,
    trace: null,
    svg: null,
    map: null,
    matches: [],
    text: "",
    rail: null,
    sampleLabel: null,
    tip: null,
    preview: null,
    error: null,
    nav: null,
    count: null,
    prev: null,
    next: null,
  };

  const rail = document.createElement("div");
  rail.className = "ptaf-mx-rail";
  const error = document.createElement("p");
  error.className = "ptaf-re-error";
  error.hidden = true;
  const sampleLabel = document.createElement("label");
  sampleLabel.className = "ptaf-re-sample";
  sampleLabel.append(document.createTextNode("Проверка"));
  const sample = document.createElement("input");
  sample.type = "text";
  sample.spellcheck = false;
  sample.autocomplete = "off";
  sample.autocapitalize = "off";
  sample.placeholder = "Строка для проверки";
  sampleLabel.append(sample);
  const preview = document.createElement("div");
  preview.className = "ptaf-re-preview";
  const tip = document.createElement("p");
  tip.className = "ptaf-mx-rail-tip";
  tip.hidden = true;
  const nav = document.createElement("div");
  nav.className = "ptaf-mx-rail-nav";
  nav.hidden = true;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "Предыдущее совпадение");
  const count = document.createElement("span");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Следующее совпадение");
  nav.append(prev, count, next);
  theme.append(rail, error, sampleLabel, preview, tip, nav);

  state.rail = rail;
  state.sampleLabel = sampleLabel;
  state.error = error;
  state.preview = preview;
  state.tip = tip;
  state.nav = nav;
  state.count = count;
  state.prev = prev;
  state.next = next;

  const read = () => {
    const value = input.value || "";
    if (value === state.pattern) {
      return;
    }
    state.pattern = value;
    state.step = 0;
    state.hot = 0;
    state.hoverStep = -1;
    state.trace = typeof dashMxCompile === "function" ? dashMxCompile(value.trim()) : { error: "Схема недоступна" };
    ptafReMount(state);
    ptafRePaint(state);
  };

  const onPattern = () => read();
  input.addEventListener("input", onPattern);
  input.addEventListener("change", onPattern);
  const watch = new MutationObserver(read);
  watch.observe(input, { attributes: true, attributeFilter: ["class", "value"] });
  host.ptafReStop = () => {
    watch.disconnect();
    input.removeEventListener("input", onPattern);
    input.removeEventListener("change", onPattern);
  };

  sample.addEventListener("input", () => {
    state.sample = sample.value;
    state.step = 0;
    state.hot = 0;
    state.hoverStep = -1;
    ptafRePaint(state);
  });
  prev.addEventListener("click", () => {
    state.step -= 1;
    state.hoverStep = -1;
    ptafReSync(state);
  });
  next.addEventListener("click", () => {
    state.step += 1;
    state.hoverStep = -1;
    ptafReSync(state);
  });
  preview.addEventListener("pointerover", (event) => {
    const mark = event.target.closest("mark[data-match]");
    state.hoverStep = mark ? Number(mark.dataset.match) : -1;
    const atom = event.target.closest(".ptaf-mx-atom");
    if (atom) {
      const ids = (atom.dataset.nodes || "").split(" ").filter(Boolean);
      state.hot = ids.length ? Number(ids[ids.length - 1]) : 0;
    } else {
      state.hot = 0;
    }
    ptafReSync(state);
  });
  preview.addEventListener("pointerout", (event) => {
    if (event.relatedTarget && preview.contains(event.relatedTarget)) {
      return;
    }
    state.hoverStep = -1;
    state.hot = 0;
    ptafReSync(state);
  });
  preview.addEventListener("click", (event) => {
    const mark = event.target.closest("mark[data-match]");
    if (!mark) {
      return;
    }
    state.step = Number(mark.dataset.match);
    state.hoverStep = -1;
    ptafReSync(state);
  });
  rail.addEventListener("pointerover", (event) => {
    const node = event.target.closest("[data-nid]");
    state.hot = node ? Number(node.dataset.nid) : 0;
    ptafReSync(state);
  });
  rail.addEventListener("pointerout", (event) => {
    if (event.relatedTarget && rail.contains(event.relatedTarget)) {
      return;
    }
    state.hot = 0;
    ptafReSync(state);
  });
  read();
}

function ptafReMount(state) {
  const rail = state.rail;
  const trace = state.trace;
  rail.replaceChildren();
  state.svg = null;
  state.map = null;
  const visible = Boolean(trace && (trace.ast || trace.note || trace.error));
  rail.hidden = !visible;
  if (trace && trace.ast && typeof dashMxRailBuild === "function") {
    const built = dashMxRailBuild(trace.ast);
    state.svg = built.svg;
    state.map = built.tree;
    const view = document.createElement("div");
    view.className = "ptaf-mx-rail-view";
    view.append(built.svg);
    rail.append(view);
  }
  const note = document.createElement("p");
  note.className = "ptaf-mx-rail-note";
  if (!trace || trace.empty) {
    note.textContent = "Схема появится, когда в поле будет выражение.";
    rail.hidden = false;
  } else if (trace.error) {
    note.textContent = "";
  } else if (trace.ast) {
    note.textContent = "Наведите на блок — фрагмент в строке. Щелчок по совпадению оставляет его путь.";
  } else {
    note.textContent = trace.note || "";
  }
  if (note.textContent) {
    rail.append(note);
  }
  state.error.hidden = !(trace && trace.error);
  state.error.textContent = trace && trace.error ? trace.error : "";
  if (state.sampleLabel) {
    state.sampleLabel.hidden = !state.pattern || !String(state.pattern).trim();
  }
}

function ptafRePaint(state) {
  const preview = state.preview;
  preview.replaceChildren();
  state.matches = [];
  state.text = state.sample;
  const trace = state.trace;
  if (!state.sample || !trace || !trace.re || typeof dashMxTraceText !== "function") {
    ptafReSync(state);
    return;
  }
  const parsed = dashMxTraceText(state.sample, trace);
  if (parsed.error) {
    preview.textContent = state.sample;
    ptafReSync(state);
    return;
  }
  state.matches = parsed.matches;
  parsed.parts.forEach((part) => {
    if (!part.hit) {
      preview.append(document.createTextNode(part.text));
      return;
    }
    const mark = document.createElement("mark");
    mark.dataset.match = String(part.match);
    if (part.spans && part.spans.length && typeof dashMxTraceSegments === "function") {
      dashMxTraceSegments(state.sample, part.start, part.start + part.text.length, part.spans).forEach((segment) => {
        const atom = document.createElement("span");
        atom.className = "ptaf-mx-atom";
        atom.dataset.nodes = segment.ids.join(" ");
        atom.textContent = state.sample.slice(segment.textStart, segment.textEnd);
        mark.append(atom);
      });
    }
    if (!mark.childNodes.length) {
      mark.textContent = part.text;
    }
    preview.append(mark);
  });
  ptafReSync(state);
}

function ptafReSync(state) {
  const matches = state.matches || [];
  let step = state.hoverStep >= 0 ? state.hoverStep : state.step;
  if (!matches.length) {
    step = 0;
  } else if (step < 0) {
    step = 0;
  } else if (step >= matches.length) {
    step = matches.length - 1;
  }
  if (state.hoverStep < 0) {
    state.step = step;
  }
  const match = matches[step] || null;
  if (typeof dashMxRailMark === "function") {
    dashMxRailMark(state.svg, state.map, match ? match.spans : [], state.hot);
  }
  state.preview.querySelectorAll("mark[data-match]").forEach((mark) => {
    mark.classList.toggle("is-current", Number(mark.dataset.match) === step);
  });
  state.preview.querySelectorAll(".ptaf-mx-atom").forEach((atom) => {
    const ids = (atom.dataset.nodes || "").split(" ").filter(Boolean);
    atom.classList.toggle("is-hot", Boolean(state.hot) && ids.includes(String(state.hot)));
  });
  if (state.nav) {
    state.nav.hidden = matches.length < 2;
    if (state.count) {
      const shown = matches.length ? Math.min(state.step, matches.length - 1) + 1 : 0;
      state.count.textContent = matches.length ? `Совпадение ${shown} из ${matches.length}` : "";
    }
    if (state.prev) {
      state.prev.disabled = state.step <= 0;
    }
    if (state.next) {
      state.next.disabled = !matches.length || state.step >= matches.length - 1;
    }
  }
  if (!state.tip) {
    return;
  }
  if (!state.hot) {
    state.tip.hidden = true;
    state.tip.textContent = "";
    return;
  }
  const labelNode = state.svg && state.svg.querySelector(`[data-label][data-nid="${CSS.escape(String(state.hot))}"]`);
  const label = labelNode ? labelNode.dataset.label : "";
  const spans = match ? match.spans.filter((span) => span.id === state.hot) : [];
  if (!spans.length) {
    state.tip.hidden = !label;
    state.tip.textContent = label ? `${label} — в этом совпадении не участвует` : "";
    return;
  }
  const chunks = spans.filter((span) => !span.empty).map((span) => state.text.slice(span.start, span.end));
  state.tip.hidden = false;
  state.tip.textContent = chunks.length ? chunks.join(" · ") : "Пустое место в строке";
}

function ptafReWatch() {
  if (ptafReObserver || !document.body) {
    return;
  }
  ptafReObserver = new MutationObserver(() => ptafReSchedule());
  ptafReObserver.observe(document.body, { childList: true, subtree: true });
  ptafReSchedule();
}

ptafReWatch();
