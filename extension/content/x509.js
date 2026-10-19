const CERT_DN_LABELS = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.5": "serialNumber",
  "2.5.4.4": "SN",
  "2.5.4.42": "GN",
  "2.5.4.12": "T",
  "2.5.4.9": "STREET",
  "2.5.4.17": "PC",
  "1.2.840.113549.1.9.1": "emailAddress",
};

const CERT_SIG_LABELS = {
  "1.2.840.113549.1.1.5": "SHA-1 с RSA",
  "1.2.840.113549.1.1.11": "SHA-256 с RSA",
  "1.2.840.113549.1.1.12": "SHA-384 с RSA",
  "1.2.840.113549.1.1.13": "SHA-512 с RSA",
  "1.2.840.113549.1.1.14": "SHA-224 с RSA",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.10045.4.3.1": "SHA-224 с ECDSA",
  "1.2.840.10045.4.3.2": "SHA-256 с ECDSA",
  "1.2.840.10045.4.3.3": "SHA-384 с ECDSA",
  "1.2.840.10045.4.3.4": "SHA-512 с ECDSA",
  "1.2.643.7.1.1.3.2": "ГОСТ Р 34.10-2012 256",
  "1.2.643.7.1.1.3.3": "ГОСТ Р 34.10-2012 512",
  "1.2.643.2.2.3": "ГОСТ Р 34.10-2001",
};

const CERT_KEY_LABELS = {
  "1.2.840.113549.1.1.1": "RSA",
  "1.2.840.10045.2.1": "EC",
  "1.2.643.7.1.1.1.1": "ГОСТ Р 34.10-2012 256",
  "1.2.643.7.1.1.1.2": "ГОСТ Р 34.10-2012 512",
};

const CERT_CURVES = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
};

const CERT_EKU_LABELS = {
  "1.3.6.1.5.5.7.3.1": "аутентификация сервера",
  "1.3.6.1.5.5.7.3.2": "аутентификация клиента",
  "1.3.6.1.5.5.7.3.3": "подпись кода",
  "1.3.6.1.5.5.7.3.4": "защита почты",
  "1.3.6.1.5.5.7.3.8": "метка времени",
  "1.3.6.1.5.5.7.3.9": "OCSP",
};

const CERT_KU_LABELS = [
  "digitalSignature",
  "nonRepudiation",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

function certRotr(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function certSha256(data) {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = certRotr(w[index - 15], 7) ^ certRotr(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      const s1 = certRotr(w[index - 2], 17) ^ certRotr(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = certRotr(e, 6) ^ certRotr(e, 11) ^ certRotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + k[index] + w[index]) >>> 0;
      const s0 = certRotr(a, 2) ^ certRotr(a, 13) ^ certRotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((part) => part.toString(16).padStart(8, "0")).join("");
}

function certReadTlv(bytes, offset) {
  if (offset >= bytes.length) {
    return null;
  }
  let pos = offset + 1;
  if (pos >= bytes.length) {
    return null;
  }
  let length = bytes[pos];
  pos += 1;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (!count || pos + count > bytes.length) {
      return null;
    }
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = length * 256 + bytes[pos];
      pos += 1;
    }
  }
  const end = pos + length;
  if (end > bytes.length) {
    return null;
  }
  return { tag: bytes[offset], value: bytes.subarray(pos, end), end };
}

function certTlvs(bytes) {
  const items = [];
  let offset = 0;
  while (offset < bytes.length) {
    const item = certReadTlv(bytes, offset);
    if (!item) {
      break;
    }
    items.push(item);
    offset = item.end;
  }
  return items;
}

function certDecodeOid(bytes) {
  if (!bytes.length) {
    return "";
  }
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (let index = 1; index < bytes.length; index += 1) {
    value = value * 128 + (bytes[index] & 0x7f);
    if ((bytes[index] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function certDecodeString(tlv) {
  const bytes = tlv.value;
  if (tlv.tag === 0x1e) {
    let text = "";
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return text;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function certDecodeName(bytes) {
  const names = [];
  certTlvs(bytes).forEach((set) => {
    certTlvs(set.value).forEach((attribute) => {
      const parts = certTlvs(attribute.value);
      if (parts.length < 2 || parts[0].tag !== 0x06) {
        return;
      }
      const oid = certDecodeOid(parts[0].value);
      names.push((CERT_DN_LABELS[oid] || oid) + "=" + certDecodeString(parts[1]));
    });
  });
  return names.join(", ");
}

function certDecodeSmallInt(bytes) {
  let value = 0;
  bytes.forEach((byte) => {
    value = value * 256 + byte;
  });
  return value;
}

function certParseTime(tlv) {
  const text = certDecodeString(tlv).trim();
  const utc = text.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if (tlv.tag === 0x17 && utc) {
    const year = Number(utc[1]) + (Number(utc[1]) >= 50 ? 1900 : 2000);
    return new Date(Date.UTC(year, Number(utc[2]) - 1, Number(utc[3]), Number(utc[4]), Number(utc[5]), Number(utc[6])));
  }
  const general = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if (general) {
    return new Date(Date.UTC(Number(general[1]), Number(general[2]) - 1, Number(general[3]), Number(general[4]), Number(general[5]), Number(general[6])));
  }
  return null;
}

function certFormatSerial(bytes) {
  let start = 0;
  if (bytes.length > 1 && bytes[0] === 0x00) {
    start = 1;
  }
  return [...bytes.subarray(start)].map((byte) => byte.toString(16).padStart(2, "0")).join(":").toUpperCase();
}

function certFormatHex(hex) {
  return hex.toUpperCase().replace(/../g, "$&:").slice(0, -1);
}

function certIntegerBits(bytes) {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }
  let bits = (bytes.length - start) * 8;
  let lead = bytes[start];
  while (lead && (lead & 0x80) === 0) {
    bits -= 1;
    lead = (lead << 1) & 0xff;
  }
  return bits;
}

function certParseSpki(tlv) {
  const parts = certTlvs(tlv.value);
  if (parts.length < 2) {
    return "";
  }
  const algorithm = certTlvs(parts[0].value);
  const oid = algorithm[0] && algorithm[0].tag === 0x06 ? certDecodeOid(algorithm[0].value) : "";
  const label = CERT_KEY_LABELS[oid] || oid;
  const bit = parts[1].value;
  if (!bit.length) {
    return label;
  }
  const key = bit.subarray(1);
  if (oid === "1.2.840.113549.1.1.1") {
    const wrapped = certTlvs(key);
    const rsa = wrapped[0] && wrapped[0].tag === 0x30 ? certTlvs(wrapped[0].value) : wrapped;
    if (rsa[0] && rsa[0].tag === 0x02) {
      return "RSA " + certIntegerBits(rsa[0].value);
    }
  }
  if (oid === "1.2.840.10045.2.1") {
    const curve = algorithm[1] && algorithm[1].tag === 0x06 ? CERT_CURVES[certDecodeOid(algorithm[1].value)] : "";
    return curve ? "EC " + curve : "EC";
  }
  return label;
}

function certExtensionBody(bytes) {
  const outer = certTlvs(bytes);
  if (outer.length === 1 && outer[0].tag === 0x30) {
    return outer[0].value;
  }
  return bytes;
}

function certParseSan(bytes) {
  return certTlvs(certExtensionBody(bytes)).map((name) => {
    const kind = name.tag & 0x1f;
    if (kind === 1) {
      return "email:" + certDecodeString({ tag: 0x16, value: name.value });
    }
    if (kind === 2) {
      return "DNS:" + certDecodeString({ tag: 0x16, value: name.value });
    }
    if (kind === 4) {
      const nameSeq = certTlvs(name.value);
      const body = nameSeq.length === 1 && nameSeq[0].tag === 0x30 ? nameSeq[0].value : name.value;
      return certDecodeName(body);
    }
    if (kind === 6) {
      return "URI:" + certDecodeString({ tag: 0x16, value: name.value });
    }
    if (kind === 7) {
      const ip = [...name.value];
      if (ip.length === 4) {
        return "IP:" + ip.join(".");
      }
      if (ip.length === 16) {
        const groups = [];
        for (let index = 0; index < 16; index += 2) {
          groups.push(((ip[index] << 8) | ip[index + 1]).toString(16));
        }
        return "IP:" + groups.join(":");
      }
    }
    return "";
  }).filter(Boolean);
}

function certParseKeyUsage(bytes) {
  const bit = certTlvs(bytes)[0];
  if (!bit || bit.tag !== 0x03 || bit.value.length < 2) {
    return [];
  }
  const bits = [];
  for (let index = 1; index < bit.value.length; index += 1) {
    bits.push(bit.value[index]);
  }
  return CERT_KU_LABELS.filter((label, index) => {
    const byte = bits[Math.floor(index / 8)];
    if (byte == null) {
      return false;
    }
    return (byte & (1 << (7 - (index % 8)))) !== 0;
  });
}

function certParseBasicConstraints(bytes) {
  const parts = certTlvs(certExtensionBody(bytes));
  let ca = false;
  let pathLength = null;
  parts.forEach((part) => {
    if (part.tag === 0x01) {
      ca = part.value[0] !== 0;
    }
    if (part.tag === 0x02) {
      pathLength = certDecodeSmallInt(part.value);
    }
  });
  return ca ? "CA" + (pathLength == null ? "" : ", pathLen=" + pathLength) : "не CA";
}

function certParseEku(bytes) {
  return certTlvs(certExtensionBody(bytes)).filter((part) => part.tag === 0x06).map((part) => {
    const oid = certDecodeOid(part.value);
    return CERT_EKU_LABELS[oid] || oid;
  });
}

function certExtensions(field) {
  if (!field) {
    return [];
  }
  let body = field.value;
  const wrapped = certTlvs(body);
  if (wrapped.length === 1 && wrapped[0].tag === 0x30) {
    body = wrapped[0].value;
  }
  return certTlvs(body).filter((item) => item.tag === 0x30).map((item) => {
    const parts = certTlvs(item.value);
    let index = 1;
    if (parts[index] && parts[index].tag === 0x01) {
      index += 1;
    }
    return {
      oid: parts[0] && parts[0].tag === 0x06 ? certDecodeOid(parts[0].value) : "",
      value: parts[index] ? parts[index].value : new Uint8Array(),
    };
  });
}

function parseCertificate(bytes) {
  const outer = certTlvs(bytes);
  if (!outer.length || outer[0].tag !== 0x30) {
    throw new Error("bad certificate");
  }
  const certificate = certTlvs(outer[0].value);
  const tbs = certTlvs(certificate[0].value);
  let index = 0;
  if (tbs[index] && tbs[index].tag === 0xa0) {
    index += 1;
  }
  const serial = tbs[index];
  index += 1;
  index += 1;
  const issuer = tbs[index];
  index += 1;
  const validity = certTlvs(tbs[index].value);
  index += 1;
  const subject = tbs[index];
  index += 1;
  const spki = tbs[index];
  let extensions = null;
  for (let field = index + 1; field < tbs.length; field += 1) {
    if (tbs[field].tag === 0xa3) {
      extensions = tbs[field];
    }
  }
  const signature = certTlvs(certificate[1].value);
  const signatureOid = signature[0] && signature[0].tag === 0x06 ? certDecodeOid(signature[0].value) : "";
  const parsedExtensions = certExtensions(extensions);
  const san = parsedExtensions.find((item) => item.oid === "2.5.29.17");
  const keyUsage = parsedExtensions.find((item) => item.oid === "2.5.29.15");
  const extendedKeyUsage = parsedExtensions.find((item) => item.oid === "2.5.29.37");
  const basicConstraints = parsedExtensions.find((item) => item.oid === "2.5.29.19");
  return {
    subject: certDecodeName(subject.value),
    issuer: certDecodeName(issuer.value),
    serial: certFormatSerial(serial.value),
    notBefore: certParseTime(validity[0]),
    notAfter: certParseTime(validity[1]),
    signature: CERT_SIG_LABELS[signatureOid] || signatureOid,
    publicKey: certParseSpki(spki),
    san: san ? certParseSan(san.value) : [],
    keyUsage: keyUsage ? certParseKeyUsage(keyUsage.value) : [],
    extendedKeyUsage: extendedKeyUsage ? certParseEku(extendedKeyUsage.value) : [],
    basicConstraints: basicConstraints ? certParseBasicConstraints(basicConstraints.value) : "",
    fingerprint: certFormatHex(certSha256(bytes)),
  };
}

function certBase64ToBytes(value) {
  const clean = String(value || "").replace(/[^A-Za-z0-9+/=]/g, "");
  if (!clean || clean.length % 4 === 1) {
    throw new Error("bad base64");
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function unwrapChainData(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.includes("-----BEGIN")) {
    return trimmed;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(certBase64ToBytes(trimmed));
    if (text.includes("-----BEGIN")) {
      return text;
    }
  } catch (error) {
    return trimmed;
  }
  return trimmed;
}

function certPemBlocks(text) {
  const blocks = [];
  const pattern = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let match = pattern.exec(text);
  while (match) {
    try {
      blocks.push({ type: match[1], bytes: certBase64ToBytes(match[2]) });
    } catch (error) {
      blocks.push({ type: match[1], bytes: null });
    }
    match = pattern.exec(text);
  }
  return blocks;
}

function parseCertificateMaterial(value) {
  const unwrapped = unwrapChainData(value);
  const blocks = certPemBlocks(unwrapped);
  const certificates = [];
  let privateKeys = 0;
  blocks.forEach((block) => {
    if (/PRIVATE KEY/.test(block.type)) {
      privateKeys += 1;
      return;
    }
    if (!/CERTIFICATE$/.test(block.type) || /REQUEST/.test(block.type)) {
      return;
    }
    if (!block.bytes) {
      certificates.push({ error: "Не удалось разобрать сертификат" });
      return;
    }
    try {
      certificates.push(parseCertificate(block.bytes));
    } catch (error) {
      certificates.push({ error: "Не удалось разобрать сертификат" });
    }
  });
  if (!blocks.length && unwrapped) {
    try {
      const bytes = certBase64ToBytes(unwrapped);
      if (bytes[0] === 0x30) {
        certificates.push(parseCertificate(bytes));
      }
    } catch (error) {
      return { certificates, privateKeys };
    }
  }
  return { certificates, privateKeys };
}
