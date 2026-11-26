const DASH_MX_RAIL_NS = "http://www.w3.org/2000/svg";
const DASH_MX_POSIX = {
  alnum: "0-9A-Za-z",
  alpha: "A-Za-z",
  ascii: "\\x00-\\x7F",
  blank: " \\t",
  digit: "\\d",
  lower: "a-z",
  punct: "!-/:-@\\[-`{-~",
  space: "\\s",
  upper: "A-Z",
  word: "\\w",
  xdigit: "A-Fa-f0-9",
};

function dashMxParseRe(source) {
  let at = 0;
  let nextId = 0;
  let captures = 0;

  const fail = (message) => {
    const error = new Error(message);
    error.rail = true;
    throw error;
  };
  const node = (kind, extra) => {
    nextId += 1;
    return Object.assign({ id: nextId, kind }, extra);
  };
  const peek = (offset) => source[at + (offset || 0)] || "";
  const eat = (text) => {
    if (!source.startsWith(text, at)) {
      return false;
    }
    at += text.length;
    return true;
  };

  const parseAlt = (inside) => {
    const start = at;
    const items = [parseSeq(inside)];
    while (eat("|")) {
      items.push(parseSeq(inside));
    }
    if (items.length === 1) {
      return items[0];
    }
    return node("alt", { items, start, end: at });
  };

  const parseSeq = (inside) => {
    const start = at;
    const items = [];
    while (at < source.length) {
      if (peek() === "|") {
        break;
      }
      if (peek() === ")") {
        if (inside) {
          break;
        }
        fail("Лишняя скобка");
      }
      items.push(parsePiece());
    }
    if (!items.length) {
      return node("empty", { start, end: at });
    }
    if (items.length === 1) {
      return items[0];
    }
    return node("seq", { items, start, end: at });
  };

  const parsePiece = () => {
    const atom = parseAtom();
    const quant = parseQuant();
    if (!quant) {
      return atom;
    }
    if (atom.kind === "empty" || atom.kind === "comment" || (atom.kind === "group" && atom.form === "flags" && !atom.body)) {
      fail("Квантификатор без элемента");
    }
    return node("quant", {
      item: atom,
      min: quant.min,
      max: quant.max,
      lazy: quant.lazy,
      poss: quant.poss,
      start: atom.start,
      end: quant.end,
    });
  };

  const parseQuant = () => {
    const start = at;
    let min = 0;
    let max = 0;
    if (eat("*")) {
      min = 0;
      max = null;
    } else if (eat("+")) {
      min = 1;
      max = null;
    } else if (eat("?")) {
      min = 0;
      max = 1;
    } else if (peek() === "{") {
      const found = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(at));
      if (!found) {
        return null;
      }
      min = Number(found[1]);
      if (found[2] === undefined) {
        max = min;
      } else if (found[2] === "") {
        max = null;
      } else {
        max = Number(found[2]);
      }
      if (max !== null && max < min) {
        fail("Неверный диапазон квантификатора");
      }
      at += found[0].length;
    } else {
      return null;
    }
    let lazy = false;
    let poss = false;
    if (eat("?")) {
      lazy = true;
    } else if (eat("+")) {
      poss = true;
    }
    return { min, max, lazy, poss, start, end: at };
  };

  const parseAtom = () => {
    if (at >= source.length) {
      fail("Выражение обрывается");
    }
    const ch = peek();
    if (ch === "*" || ch === "+" || ch === "?") {
      fail("Квантификатор без элемента");
    }
    if (ch === ".") {
      at += 1;
      return node("dot", { start: at - 1, end: at, raw: ".", label: "любой" });
    }
    if (ch === "^" || ch === "$") {
      at += 1;
      return node("anchor", { start: at - 1, end: at, raw: ch, label: ch, anchor: ch });
    }
    if (ch === "[") {
      return parseClass();
    }
    if (ch === "(") {
      return parseGroup();
    }
    if (ch === "\\") {
      return parseEscape();
    }
    const start = at;
    at += 1;
    return node("lit", dashMxLitParts(ch, source.slice(start, at), start, at));
  };

  const parseClass = () => {
    const start = at;
    at += 1;
    if (eat("^")) {
      // negation belongs to the class text
    }
    if (at >= source.length) {
      fail("Класс не закрыт");
    }
    if (peek() === "]") {
      at += 1;
    }
    while (at < source.length && peek() !== "]") {
      if (peek() === "\\") {
        at += 1;
        if (at >= source.length) {
          fail("Класс не закрыт");
        }
        at += 1;
        continue;
      }
      if (peek() === "[" && peek(1) === ":") {
        const posix = /^\[:\^?[a-z]+:\]/.exec(source.slice(at));
        if (posix) {
          at += posix[0].length;
          continue;
        }
      }
      at += 1;
    }
    if (!eat("]")) {
      fail("Класс не закрыт");
    }
    const raw = source.slice(start, at);
    return node("class", { start, end: at, raw, label: raw });
  };

  const parseGroup = () => {
    const start = at;
    at += 1;
    if (!eat("?")) {
      captures += 1;
      const cap = captures;
      const body = parseAlt(true);
      if (!eat(")")) {
        fail("Группа не закрыта");
      }
      return node("group", { form: "capture", cap, body, start, end: at, label: String(cap) });
    }
    if (eat("#")) {
      const close = source.indexOf(")", at);
      if (close < 0) {
        fail("Комментарий не закрыт");
      }
      at = close + 1;
      return node("comment", { start, end: at });
    }
    if (peek() === "*" || peek() === "R" || peek() === "&" || source.startsWith("P>", at) || /^\d/.test(peek())) {
      const end = dashMxBalancedEnd(source, start);
      if (end < 0) {
        fail("Группа не закрыта");
      }
      at = end;
      const raw = source.slice(start, at);
      return node("raw", { start, end: at, raw, label: raw.length > 18 ? `${raw.slice(0, 16)}…` : raw });
    }
    if (eat(":")) {
      const body = parseAlt(true);
      if (!eat(")")) {
        fail("Группа не закрыта");
      }
      return node("group", { form: "noncap", body, start, end: at, label: "" });
    }
    if (eat("=")) {
      return dashMxLook(node, parseAlt, eat, fail, "ahead", "?=", start);
    }
    if (eat("!")) {
      return dashMxLook(node, parseAlt, eat, fail, "aheadnot", "?!", start);
    }
    if (eat("<=")) {
      return dashMxLook(node, parseAlt, eat, fail, "behind", "?<=", start);
    }
    if (eat("<!")) {
      return dashMxLook(node, parseAlt, eat, fail, "behindnot", "?<!", start);
    }
    if (eat(">")) {
      const body = parseAlt(true);
      if (!eat(")")) {
        fail("Группа не закрыта");
      }
      return node("group", { form: "atomic", body, start, end: at, label: "?>" });
    }
    if (eat("(")) {
      const end = dashMxBalancedEnd(source, start);
      if (end < 0) {
        fail("Группа не закрыта");
      }
      at = end;
      const raw = source.slice(start, at);
      return node("raw", { start, end: at, raw, label: "условие" });
    }
    if (peek() === "<" || peek() === "'" || source.startsWith("P<", at)) {
      return parseNamed(start);
    }
    if (source.startsWith("P=", at)) {
      const end = dashMxBalancedEnd(source, start);
      if (end < 0) {
        fail("Группа не закрыта");
      }
      at = end;
      const name = source.slice(start + 4, at - 1);
      return node("ref", { start, end: at, name, label: `\\k<${name}>`, raw: source.slice(start, at) });
    }
    const flags = dashMxReadFlags(source, at, fail);
    at = flags.next;
    let body = null;
    if (eat(":")) {
      body = parseAlt(true);
    }
    if (!eat(")")) {
      fail("Группа не закрыта");
    }
    return node("group", {
      form: "flags",
      flags: flags.text,
      body,
      start,
      end: at,
      label: body ? "" : `(?${flags.text})`,
    });
  };

  const parseNamed = (start) => {
    if (eat("P")) {
      if (!eat("<")) {
        fail("Имя группы не закрыто");
      }
    } else if (!eat("<") && !eat("'")) {
      fail("Имя группы не закрыто");
    }
    const close = source[at - 1] === "'" ? "'" : ">";
    const end = source.indexOf(close, at);
    if (end < 0) {
      fail("Имя группы не закрыто");
    }
    const name = source.slice(at, end);
    if (!/^[\w]+$/.test(name)) {
      fail("Неверное имя группы");
    }
    at = end + 1;
    captures += 1;
    const cap = captures;
    const body = parseAlt(true);
    if (!eat(")")) {
      fail("Группа не закрыта");
    }
    return node("group", { form: "named", cap, name, body, start, end: at, label: name });
  };

  const parseEscape = () => {
    const start = at;
    at += 1;
    if (at >= source.length) {
      fail("Выражение обрывается");
    }
    const ch = peek();
    at += 1;
    if (ch === "Q") {
      const endQuote = source.indexOf("\\E", at);
      const text = endQuote < 0 ? source.slice(at) : source.slice(at, endQuote);
      at = endQuote < 0 ? source.length : endQuote + 2;
      return node("lit", {
        start,
        end: at,
        quoted: true,
        label: dashMxShowLiteral(text),
        title: source.slice(start, at),
        text,
      });
    }
    if (ch === "k") {
      return parseNamedRef(start);
    }
    if (ch === "g") {
      return parseGRef(start);
    }
    if (/[1-9]/.test(ch)) {
      let end = at;
      while (/[0-9]/.test(peek(end - at))) {
        end += 1;
      }
      let value = 0;
      let taken = 0;
      for (let index = start + 1; index < end; index += 1) {
        const next = value * 10 + Number(source[index]);
        if (next > captures) {
          break;
        }
        value = next;
        taken = index - start;
      }
      if (taken && value >= 1) {
        at = start + 1 + taken;
        return node("ref", { start, end: at, num: value, label: `\\${value}`, raw: source.slice(start, at) });
      }
      at = start + 1;
      return parseOctal(start, ch);
    }
    if ("bBAZzG".includes(ch)) {
      return node("anchor", { start, end: at, raw: `\\${ch}`, label: `\\${ch}`, anchor: ch });
    }
    if ("dDwWsS".includes(ch)) {
      return node("class", { start, end: at, raw: `\\${ch}`, label: `\\${ch}` });
    }
    if (ch === "p" || ch === "P") {
      if (!eat("{")) {
        fail("Класс \\p не закрыт");
      }
      const close = source.indexOf("}", at);
      if (close < 0) {
        fail("Класс \\p не закрыт");
      }
      at = close + 1;
      const raw = source.slice(start, at);
      return node("class", { start, end: at, raw, label: raw });
    }
    if (ch === "x" || ch === "u") {
      if (eat("{")) {
        const hex = /^[0-9A-Fa-f]+\}/.exec(source.slice(at));
        if (!hex) {
          fail("Неверная шестнадцатеричная запись");
        }
        at += hex[0].length;
      } else {
        const size = ch === "u" ? 4 : 2;
        if (!new RegExp(`^[0-9A-Fa-f]{${size}}`).test(source.slice(at))) {
          fail("Неверная шестнадцатеричная запись");
        }
        at += size;
      }
      const raw = source.slice(start, at);
      return node("lit", { start, end: at, raw, label: raw, title: raw });
    }
    if (ch === "c") {
      if (!/[A-Za-z]/.test(peek())) {
        fail("Неверное \\c");
      }
      at += 1;
      const raw = source.slice(start, at);
      return node("lit", { start, end: at, raw, label: raw, title: raw });
    }
    if (/[0-7]/.test(ch)) {
      return parseOctal(start, ch);
    }
    const named = {
      n: ["\\n", "\\n"],
      r: ["\\r", "\\r"],
      t: ["\\t", "\\t"],
      f: ["\\f", "\\f"],
      v: ["\\v", "\\v"],
      a: ["\\u0007", "\\a"],
      e: ["\\u001b", "\\e"],
    };
    if (named[ch]) {
      return node("lit", { start, end: at, raw: named[ch][0], label: named[ch][1], title: named[ch][1] });
    }
    return node("lit", dashMxLitParts(ch, `\\${ch}`, start, at));
  };

  const parseOctal = (start, first) => {
    let digits = first === "0" ? "" : first;
    let guard = first === "0" ? 2 : 2;
    if (first === "0") {
      digits = "0";
      guard = 2;
    }
    while (guard && /[0-7]/.test(peek())) {
      digits += peek();
      at += 1;
      guard -= 1;
    }
    const code = Number.parseInt(digits, 8);
    const raw = code <= 0xffff
      ? `\\u${code.toString(16).padStart(4, "0")}`
      : `\\u{${code.toString(16)}}`;
    const original = source.slice(start, at);
    return node("lit", { start, end: at, raw, label: original, title: original });
  };

  const parseNamedRef = (start) => {
    if (!eat("<") && !eat("'") && !eat("{")) {
      fail("Имя ссылки не закрыто");
    }
    const open = source[at - 1];
    const close = open === "<" ? ">" : open === "'" ? "'" : "}";
    const end = source.indexOf(close, at);
    if (end < 0) {
      fail("Имя ссылки не закрыто");
    }
    const name = source.slice(at, end);
    at = end + 1;
    if (/^\d+$/.test(name)) {
      return node("ref", { start, end: at, num: Number(name), label: `\\${name}`, raw: source.slice(start, at) });
    }
    return node("ref", { start, end: at, name, label: `\\k<${name}>`, raw: source.slice(start, at) });
  };

  const parseGRef = (start) => parseNamedRef(start);

  try {
    const ast = dashMxFold(parseAlt(false));
    if (at < source.length) {
      fail("Выражение не разбирается");
    }
    return { ast };
  } catch (error) {
    if (error && error.rail) {
      return { error: error.message };
    }
    return { error: "Выражение не разбирается" };
  }
}

function dashMxLook(node, parseAlt, eat, fail, form, label, start) {
  const body = parseAlt(true);
  if (!eat(")")) {
    fail("Группа не закрыта");
  }
  return node("group", { form, body, start, end: body.end, label });
}

function dashMxReadFlags(source, at, fail) {
  let text = "";
  let off = false;
  let seen = false;
  while (at < source.length && /[a-zA-Z-]/.test(source[at])) {
    const ch = source[at];
    if (ch === "-") {
      if (off) {
        fail("Неверные флаги");
      }
      off = true;
    } else if (!/[imsuxXJ]/.test(ch)) {
      fail("Неверные флаги");
    } else {
      seen = true;
    }
    text += ch;
    at += 1;
  }
  if (!seen) {
    fail("Неверные флаги");
  }
  return { text, next: at };
}

function dashMxBalancedEnd(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "\\") {
      index += 1;
      continue;
    }
    if (ch === "[") {
      index += 1;
      if (source[index] === "^") {
        index += 1;
      }
      if (source[index] === "]") {
        index += 1;
      }
      while (index < source.length && source[index] !== "]") {
        if (source[index] === "\\") {
          index += 1;
        }
        index += 1;
      }
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return -1;
}

function dashMxLitParts(ch, raw, start, end) {
  const special = ".^$*+?()[]{}|\\";
  const source = special.includes(ch) ? `\\${ch}` : raw === `\\${ch}` && special.includes(ch) ? raw : dashMxPlainRaw(ch, raw);
  return {
    start,
    end,
    raw: source,
    label: dashMxShowLiteral(ch),
    title: raw,
  };
}

function dashMxPlainRaw(ch, raw) {
  if (/[0-9]/.test(ch)) {
    return raw;
  }
  if (raw.startsWith("\\") && raw.length === 2 && !".^$*+?()[]{}|\\".includes(ch)) {
    return ch;
  }
  return raw;
}

function dashMxQuantMark(node) {
  if (!(node.min === 0 && node.max === 1)) {
    return "";
  }
  if (node.lazy) {
    return "??";
  }
  if (node.poss) {
    return "?+";
  }
  return "?";
}

function dashMxQuantWrap(core, node) {
  const mark = dashMxQuantMark(node);
  if (mark) {
    return `((?:${core}))${mark}`;
  }
  return `((?:${core})${dashMxQuantSuffix(node)})`;
}

function dashMxShowLiteral(text) {
  return String(text).replace(/ /g, "␣").replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/\r/g, "↵");
}

function dashMxFold(node) {
  if (!node) {
    return node;
  }
  if (node.kind === "quant") {
    return Object.assign({}, node, { item: dashMxFold(node.item) });
  }
  if (node.kind === "group") {
    return Object.assign({}, node, { body: node.body ? dashMxFold(node.body) : null });
  }
  if (node.kind === "alt") {
    const items = node.items.map(dashMxFold);
    return items.length === 1 ? items[0] : Object.assign({}, node, { items });
  }
  if (node.kind === "seq") {
    const items = [];
    node.items.forEach((item) => {
      const flat = dashMxFold(item);
      if (!flat || flat.kind === "comment") {
        return;
      }
      if (flat.kind === "seq") {
        flat.items.forEach((part) => items.push(part));
        return;
      }
      const prev = items[items.length - 1];
      if (prev && prev.kind === "lit" && flat.kind === "lit" && !prev.quoted && !flat.quoted) {
        prev.label += flat.label;
        prev.raw += flat.raw;
        prev.end = flat.end;
        prev.title = `${prev.title || prev.raw}${flat.title || flat.raw}`;
        return;
      }
      items.push(flat);
    });
    if (!items.length) {
      return { id: node.id, kind: "empty", start: node.start, end: node.end };
    }
    if (items.length === 1) {
      return items[0];
    }
    return Object.assign({}, node, { items });
  }
  return node;
}

function dashMxFlagBag(from) {
  return {
    i: Boolean(from && from.i),
    m: Boolean(from && from.m),
    s: Boolean(from && from.s),
    bad: Boolean(from && from.bad),
  };
}

function dashMxUseFlags(state, text) {
  let off = false;
  for (const ch of text) {
    if (ch === "-") {
      off = true;
      continue;
    }
    if (!"ims".includes(ch)) {
      state.bad = true;
      continue;
    }
    state[ch] = !off;
  }
}

function dashMxFlagChars(state, node) {
  let multiline = state.m;
  if (node && node.kind === "anchor" && "AZzG".includes(node.anchor || "")) {
    multiline = false;
  }
  return `${state.i ? "i" : ""}${multiline ? "m" : ""}${state.s ? "s" : ""}`;
}

function dashMxWrapFlags(raw, state, node) {
  const flags = dashMxFlagChars(state, node);
  if (!flags) {
    return raw;
  }
  return `(?${flags}:${raw})`;
}

function dashMxQuantSuffix(node) {
  let text = "";
  if (node.min === 0 && node.max === null) {
    text = "*";
  } else if (node.min === 1 && node.max === null) {
    text = "+";
  } else if (node.min === 0 && node.max === 1) {
    text = "?";
  } else if (node.max === null) {
    text = `{${node.min},}`;
  } else if (node.min === node.max) {
    text = `{${node.min}}`;
  } else {
    text = `{${node.min},${node.max}}`;
  }
  if (node.lazy) {
    text += "?";
  } else if (node.poss) {
    text += "+";
  }
  return text;
}

function dashMxQuantLabel(node) {
  return dashMxQuantSuffix(node);
}

function dashMxBoxKind(node) {
  return Boolean(node) && (node.kind === "lit" || node.kind === "class" || node.kind === "dot" || node.kind === "anchor" || node.kind === "ref" || node.kind === "raw");
}

function dashMxEscapeQuoted(text) {
  return String(text).replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

function dashMxClassRaw(raw) {
  return raw.replace(/\[:(alnum|alpha|ascii|blank|digit|lower|punct|space|upper|word|xdigit):\]/g, (all, name) => DASH_MX_POSIX[name] || all);
}

function dashMxAnchorRaw(node) {
  if (node.anchor === "A") {
    return "^";
  }
  if (node.anchor === "Z") {
    return "$";
  }
  if (node.anchor === "z") {
    return "(?![\\s\\S])";
  }
  if (node.anchor === "a") {
    return "\\u0007";
  }
  if (node.anchor === "e") {
    return "\\u001b";
  }
  return node.raw;
}

function dashMxInstrument(ast) {
  let group = 0;
  const slots = [];
  const caps = new Map();
  const state = dashMxFlagBag();

  const claim = (id, emptyMeans) => {
    group += 1;
    slots.push({ id, group, emptyMeans });
    return group;
  };
  const alias = (id, shared, emptyMeans) => {
    slots.push({ id, group: shared, emptyMeans });
  };

  const emitBox = (node, flags) => {
    if (node.kind === "lit" && node.quoted) {
      return dashMxWrapFlags(dashMxEscapeQuoted(node.text || ""), flags, node);
    }
    if (node.kind === "anchor") {
      return dashMxWrapFlags(dashMxAnchorRaw(node), flags, node);
    }
    if (node.kind === "class") {
      return dashMxWrapFlags(dashMxClassRaw(node.raw), flags, node);
    }
    if (node.kind === "ref") {
      if (node.name) {
        return dashMxWrapFlags(`\\k<${node.name}>`, flags, node);
      }
      const mapped = caps.get(node.num);
      return dashMxWrapFlags(`\\${mapped || node.num}`, flags, node);
    }
    if (node.kind === "raw") {
      return node.raw;
    }
    return dashMxWrapFlags(node.raw, flags, node);
  };

  const emit = (node, flags) => {
    if (!node || node.kind === "empty" || node.kind === "comment") {
      return "";
    }
    if (node.kind === "seq") {
      return node.items.map((item) => emit(item, flags)).join("");
    }
    if (node.kind === "alt") {
      let carry = dashMxFlagBag(flags);
      const parts = node.items.map((item) => {
        const local = dashMxFlagBag(carry);
        const text = emit(item, local);
        carry = local;
        return text;
      });
      return parts.join("|");
    }
    if (node.kind === "quant") {
      if (dashMxBoxKind(node.item)) {
        const shared = claim(node.id, "off");
        alias(node.item.id, shared, "off");
        const core = emitBox(node.item, flags);
        return dashMxQuantWrap(core, node);
      }
      claim(node.id, "off");
      const inner = emit(node.item, dashMxFlagBag(flags));
      return dashMxQuantWrap(inner, node);
    }
    if (node.kind === "group") {
      return emitGroup(node, flags);
    }
    if (dashMxBoxKind(node)) {
      const emptyMeans = node.kind === "anchor" ? "on" : "off";
      claim(node.id, emptyMeans);
      return `(${emitBox(node, flags)})`;
    }
    return "";
  };

  const emitGroup = (node, flags) => {
    if (node.form === "flags" && !node.body) {
      dashMxUseFlags(flags, node.flags || "");
      return "";
    }
    const innerFlags = dashMxFlagBag(flags);
    if (node.form === "flags") {
      dashMxUseFlags(innerFlags, node.flags || "");
    }
    const look = {
      ahead: "?=",
      aheadnot: "?!",
      behind: "?<=",
      behindnot: "?<!",
    }[node.form];
    if (look) {
      claim(node.id, "on");
      const body = node.body ? emit(node.body, innerFlags) : "";
      return `((?${look.slice(1)}${body}))`;
    }
    if (node.form === "atomic") {
      const body = node.body ? emit(node.body, innerFlags) : "";
      return `(?>${body})`;
    }
    if (node.form === "capture" || node.form === "named") {
      const id = claim(node.id, "off");
      caps.set(node.cap, id);
      const body = node.body ? emit(node.body, innerFlags) : "";
      if (node.name) {
        return `(?<${node.name}>${body})`;
      }
      return `(${body})`;
    }
    const body = node.body ? emit(node.body, innerFlags) : "";
    return `(?:${body})`;
  };

  return { source: emit(ast, state), slots, bad: state.bad };
}

function dashMxRailLimit(ast) {
  let reason = "";
  const walk = (node) => {
    if (!node || reason) {
      return;
    }
    if (node.kind === "quant" && node.poss) {
      reason = "Жадный квантификатор ++ браузер не выполняет";
    } else if (node.kind === "group" && node.form === "atomic") {
      reason = "Атомарную группу браузер не выполняет";
    } else if (node.kind === "raw") {
      reason = "Эту конструкцию PCRE браузер не выполняет";
    } else if (node.flags && /[^ims-]/.test(node.flags)) {
      reason = "Этот флаг PCRE браузер не выполняет";
    }
    const kids = [];
    if (node.items) {
      kids.push(...node.items);
    }
    if (node.body) {
      kids.push(node.body);
    }
    if (node.item) {
      kids.push(node.item);
    }
    kids.forEach(walk);
  };
  walk(ast);
  return reason;
}

function dashMxCompile(source) {
  if (!source) {
    return { empty: true };
  }
  if (source.length > 4000) {
    try {
      return { re: new RegExp(source, "gdu"), linked: false, note: "Схема скрыта: выражение слишком длинное" };
    } catch (error) {
      return { error: "Выражение не разбирается" };
    }
  }
  const parsed = dashMxParseRe(source);
  if (!parsed.ast) {
    try {
      return { re: new RegExp(source, "gdu"), linked: false, note: "Схема для этого выражения недоступна" };
    } catch (error) {
      return { error: parsed.error || "Выражение не разбирается" };
    }
  }
  const built = dashMxInstrument(parsed.ast);
  if (built.bad || dashMxRailLimit(parsed.ast)) {
    const reason = dashMxRailLimit(parsed.ast) || "Этот флаг PCRE браузер не выполняет";
    return { ast: parsed.ast, error: reason, note: reason };
  }
  try {
    const re = new RegExp(built.source, "gdu");
    return { ast: parsed.ast, re, slots: built.slots, linked: true, source: built.source };
  } catch (error) {
    try {
      const re = new RegExp(source, "gdu");
      return {
        ast: parsed.ast,
        re,
        linked: false,
        note: "Схема есть. Браузер выполняет выражение без привязки к блокам",
      };
    } catch (second) {
      const reason = dashMxRailLimit(parsed.ast) || "Браузер не выполняет это выражение PCRE";
      return { ast: parsed.ast, error: reason, note: reason };
    }
  }
}

function dashMxTraceText(text, trace) {
  if (!trace || !trace.re) {
    return { hit: false, parts: [{ text, hit: false }], matches: [] };
  }
  let pattern;
  try {
    pattern = new RegExp(trace.re.source, trace.re.flags.includes("d") ? trace.re.flags : `${trace.re.flags}d`);
  } catch (error) {
    return { error: true, hit: false, parts: [{ text, hit: false }], matches: [] };
  }
  const parts = [];
  const matches = [];
  let cursor = 0;
  let hit = false;
  for (const found of text.matchAll(pattern)) {
    if (!found[0]) {
      continue;
    }
    hit = true;
    const start = found.index;
    const end = start + found[0].length;
    const spans = [];
    if (trace.linked && found.indices) {
      trace.slots.forEach((slot) => {
        const pair = found.indices[slot.group];
        if (!pair) {
          return;
        }
        const empty = pair[0] === pair[1];
        if (empty && slot.emptyMeans !== "on") {
          return;
        }
        spans.push({ id: slot.id, start: pair[0], end: pair[1], empty });
      });
    }
    const match = matches.length;
    matches.push({ start, end, spans });
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), hit: false });
    }
    parts.push({ text: found[0], hit: true, match, spans, start });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), hit: false });
  }
  if (!parts.length) {
    parts.push({ text, hit: false });
  }
  return { hit, parts, matches };
}

function dashMxTraceSegments(text, start, end, spans) {
  const cuts = new Set([start, end]);
  spans.forEach((span) => {
    if (span.empty || span.end <= span.start) {
      return;
    }
    const from = Math.max(span.start, start);
    const to = Math.min(span.end, end);
    if (to > from) {
      cuts.add(from);
      cuts.add(to);
    }
  });
  const points = [...cuts].sort((left, right) => left - right);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const ids = [];
    spans.forEach((span) => {
      if (!span.empty && span.start <= from && span.end >= to) {
        ids.push(span.id);
      }
    });
    if (text.slice(from, to)) {
      segments.push({ textStart: from, textEnd: to, ids });
    }
  }
  return segments;
}

function dashMxRailTree(ast) {
  const map = new Map();
  const walk = (node) => {
    if (!node || node.id == null) {
      return [];
    }
    const ids = [node.id];
    const kids = [];
    if (node.items) {
      kids.push(...node.items);
    }
    if (node.body) {
      kids.push(node.body);
    }
    if (node.item) {
      kids.push(node.item);
    }
    kids.forEach((kid) => {
      walk(kid).forEach((id) => ids.push(id));
    });
    map.set(node.id, ids);
    return ids;
  };
  walk(ast);
  return map;
}

function dashMxRailOn(tree, id, hit) {
  if (hit.has(id)) {
    return true;
  }
  const desc = tree && tree.get(id);
  if (!desc) {
    return false;
  }
  return desc.some((item) => hit.has(item));
}

function dashMxRailMark(svg, tree, spans, hotId) {
  if (!svg) {
    return;
  }
  const hit = new Set((spans || []).map((span) => span.id));
  svg.querySelectorAll("[data-nid]").forEach((el) => {
    const id = Number(el.dataset.nid);
    el.classList.toggle("is-on", dashMxRailOn(tree, id, hit));
    el.classList.toggle("is-hot", Boolean(hotId) && id === Number(hotId));
  });
}

function dashMxRailWidth(text) {
  const value = text ? String(text) : " ";
  if (typeof document === "undefined") {
    return Math.ceil(value.length * 7.2);
  }
  if (!dashMxRailWidth.ctx) {
    const canvas = document.createElement("canvas");
    dashMxRailWidth.ctx = canvas.getContext("2d");
  }
  if (!dashMxRailWidth.ctx) {
    return Math.ceil(value.length * 7.2);
  }
  dashMxRailWidth.ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const width = dashMxRailWidth.ctx.measureText(value).width;
  if (!width) {
    return Math.ceil(value.length * 7.2);
  }
  return Math.ceil(width);
}

function dashMxRailEl(name, attrs) {
  const el = document.createElementNS(DASH_MX_RAIL_NS, name);
  Object.keys(attrs || {}).forEach((key) => {
    if (attrs[key] != null) {
      el.setAttribute(key, String(attrs[key]));
    }
  });
  return el;
}

function dashMxRailClip(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function dashMxRailLayout(node) {
  if (!node || node.kind === "empty" || node.kind === "comment") {
    return dashMxRailLine(12);
  }
  if (node.kind === "seq") {
    return dashMxRailSeq(node);
  }
  if (node.kind === "alt") {
    return dashMxRailAlt(node);
  }
  if (node.kind === "quant") {
    return dashMxRailQuant(node);
  }
  if (node.kind === "group") {
    return dashMxRailGroup(node);
  }
  return dashMxRailToken(node);
}

function dashMxRailLine(width) {
  return {
    w: width,
    h: 26,
    mid: 13,
    draw(parent, x, y) {
      dashMxRailCurve(parent, `M ${x} ${y + 13} H ${x + width}`, 0, "ptaf-mx-rail-wire");
    },
  };
}

function dashMxRailToken(node) {
  const label = dashMxRailClip(node.label || node.raw || "?", 32);
  const title = node.title || node.label || node.raw || "";
  const w = Math.max(24, dashMxRailWidth(label) + 16);
  return {
    w,
    h: 26,
    mid: 13,
    draw(parent, x, y) {
      dashMxRailTokenBox(parent, x, y, w, 26, label, title, node.id);
    },
  };
}

function dashMxRailTokenBox(parent, x, y, w, h, label, title, id) {
  const rect = dashMxRailEl("rect", { x, y, width: w, height: h, rx: 5, class: "ptaf-mx-rail-box" });
  rect.dataset.nid = String(id);
  rect.dataset.label = title || label;
  const text = dashMxRailEl("text", {
    x: x + w / 2,
    y: y + h / 2,
    class: "ptaf-mx-rail-label",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = label;
  parent.append(rect, text);
}

function dashMxRailSeq(node) {
  const parts = node.items.map(dashMxRailLayout);
  const gap = 16;
  const mid = Math.max(...parts.map((part) => part.mid));
  const below = Math.max(...parts.map((part) => part.h - part.mid));
  const w = parts.reduce((sum, part) => sum + part.w, 0) + gap * Math.max(0, parts.length - 1);
  return {
    w,
    h: mid + below,
    mid,
    draw(parent, x, y) {
      let cursor = x;
      parts.forEach((part, index) => {
        if (index) {
          const into = node.items[index];
          dashMxRailCurve(parent, `M ${cursor} ${y + mid} H ${cursor + gap}`, into && into.id, "ptaf-mx-rail-wire");
          cursor += gap;
        }
        part.draw(parent, cursor, y + mid - part.mid);
        cursor += part.w;
      });
    },
  };
}

function dashMxRailAlt(node) {
  const parts = node.items.map(dashMxRailLayout);
  const fork = 18;
  const inner = Math.max(8, ...parts.map((part) => part.w));
  let stack = 0;
  const placed = parts.map((part) => {
    const item = { part, y: stack };
    stack += part.h + 12;
    return item;
  });
  const h = Math.max(26, stack - 12);
  const mid = placed[0].part.mid;
  return {
    w: fork + inner + fork,
    h,
    mid,
    draw(parent, x, y) {
      const spine = y + mid;
      const right = x + fork + inner;
      placed.forEach((item, index) => {
        const branch = node.items[index];
        const branchMid = y + item.y + item.part.mid;
        const nid = branch && branch.id;
        dashMxRailCurve(
          parent,
          `M ${x} ${spine} C ${x + fork / 2} ${spine}, ${x + fork / 2} ${branchMid}, ${x + fork} ${branchMid}`,
          nid,
          "ptaf-mx-rail-wire",
        );
        item.part.draw(parent, x + fork, y + item.y);
        const end = x + fork + item.part.w;
        if (end < right) {
          dashMxRailCurve(parent, `M ${end} ${branchMid} H ${right}`, nid, "ptaf-mx-rail-wire");
        }
        dashMxRailCurve(
          parent,
          `M ${right} ${branchMid} C ${right + fork / 2} ${branchMid}, ${right + fork / 2} ${spine}, ${x + fork + inner + fork} ${spine}`,
          nid,
          "ptaf-mx-rail-wire",
        );
      });
    },
  };
}

function dashMxRailQuant(node) {
  const inner = dashMxRailLayout(node.item);
  const skip = node.min === 0;
  const back = node.max === null || node.max > 1;
  const badge = dashMxQuantLabel(node);
  const plainBadge = Boolean(badge && badge !== "?" && badge !== "*" && badge !== "+");
  const top = (skip ? 14 : 0) + (!skip && !back && plainBadge ? 12 : 0);
  const bottom = back ? 16 : 0;
  const side = 14;
  return {
    w: inner.w + side * 2,
    h: inner.h + top + bottom,
    mid: inner.mid + top,
    draw(parent, x, y) {
      const mid = y + inner.mid + top;
      const left = x + side;
      const right = left + inner.w;
      dashMxRailCurve(parent, `M ${x} ${mid} H ${left}`, node.item.id, "ptaf-mx-rail-wire");
      inner.draw(parent, left, y + top);
      dashMxRailCurve(parent, `M ${right} ${mid} H ${x + inner.w + side * 2}`, node.id, "ptaf-mx-rail-wire");
      if (skip) {
        dashMxRailCurve(
          parent,
          `M ${x + 8} ${mid} C ${x + 8} ${y + 2}, ${x + inner.w + side * 2 - 8} ${y + 2}, ${x + inner.w + side * 2 - 8} ${mid}`,
          0,
          "ptaf-mx-rail-loop",
        );
      }
      if (back) {
        const floor = y + inner.h + top + bottom - 3;
        dashMxRailCurve(
          parent,
          `M ${right - 4} ${mid} C ${right - 4} ${floor}, ${left + 4} ${floor}, ${left + 4} ${mid}`,
          node.id,
          "ptaf-mx-rail-loop",
        );
      }
      if (badge && badge !== "?" && badge !== "*" && badge !== "+") {
        const text = dashMxRailEl("text", {
          x: x + (inner.w + side * 2) / 2,
          y: back ? y + inner.h + top + bottom - 2 : y + 10,
          class: "ptaf-mx-rail-tag",
          "text-anchor": "middle",
        });
        text.dataset.nid = String(node.id);
        text.dataset.label = badge;
        text.textContent = badge;
        parent.append(text);
      } else if (badge && (node.lazy || node.poss || back)) {
        const text = dashMxRailEl("text", {
          x: x + (inner.w + side * 2) / 2,
          y: back ? y + inner.h + top + bottom - 2 : y + 10,
          class: "ptaf-mx-rail-tag",
          "text-anchor": "middle",
        });
        text.dataset.nid = String(node.id);
        text.dataset.label = badge;
        text.textContent = badge;
        parent.append(text);
      }
    },
  };
}

function dashMxRailGroup(node) {
  if (node.form === "flags" && !node.body) {
    return dashMxRailToken(node);
  }
  const inner = node.body ? dashMxRailLayout(node.body) : dashMxRailLine(10);
  const tag = node.label || "";
  const tagH = tag ? 14 : 0;
  const w = Math.max(inner.w, tag ? dashMxRailWidth(tag) + 8 : 0);
  return {
    w,
    h: inner.h + tagH,
    mid: inner.mid + tagH,
    draw(parent, x, y) {
      if (tag) {
        const text = dashMxRailEl("text", {
          x,
          y: y + 10,
          class: "ptaf-mx-rail-tag",
        });
        text.dataset.nid = String(node.id);
        text.dataset.label = tag;
        text.textContent = tag;
        parent.append(text);
      }
      inner.draw(parent, x, y + tagH);
      if (w > inner.w) {
        dashMxRailCurve(parent, `M ${x + inner.w} ${y + tagH + inner.mid} H ${x + w}`, node.id, "ptaf-mx-rail-wire");
      }
    },
  };
}

function dashMxRailCurve(parent, d, nid, kind) {
  if (nid) {
    const hit = dashMxRailEl("path", { d, class: "ptaf-mx-rail-hit" });
    hit.dataset.nid = String(nid);
    parent.append(hit);
  }
  const path = dashMxRailEl("path", { d, class: kind });
  if (nid) {
    path.dataset.nid = String(nid);
  }
  parent.append(path);
}

function dashMxRailBuild(ast) {
  const inner = dashMxRailLayout(ast);
  const w = inner.w + 36;
  const h = Math.max(inner.h, 26) + 16;
  const mid = inner.mid + 8;
  const svg = dashMxRailEl("svg", {
    width: w,
    height: h,
    viewBox: `0 0 ${w} ${h}`,
    class: "ptaf-mx-rail-svg",
    role: "img",
  });
  svg.setAttribute("aria-label", "Схема выражения");
  const start = dashMxRailEl("circle", { cx: 10, cy: mid, r: 3.5, class: "ptaf-mx-rail-end" });
  dashMxRailCurve(svg, `M 14 ${mid} H 18`, ast.id, "ptaf-mx-rail-wire");
  inner.draw(svg, 18, 8);
  const endX = 18 + inner.w;
  dashMxRailCurve(svg, `M ${endX} ${mid} H ${endX + 8}`, ast.id, "ptaf-mx-rail-wire");
  const end = dashMxRailEl("circle", { cx: endX + 14, cy: mid, r: 5, class: "ptaf-mx-rail-end is-ring" });
  const dot = dashMxRailEl("circle", { cx: endX + 14, cy: mid, r: 2, class: "ptaf-mx-rail-end" });
  svg.append(start, end, dot);
  return { svg, tree: dashMxRailTree(ast) };
}
