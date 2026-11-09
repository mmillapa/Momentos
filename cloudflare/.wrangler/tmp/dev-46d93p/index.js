var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/uint8array-extras/index.js
var objectToString = Object.prototype.toString;
var uint8ArrayStringified = "[object Uint8Array]";
var arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
__name(isType, "isType");
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
__name(isUint8Array, "isUint8Array");
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
__name(isArrayBuffer, "isArrayBuffer");
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
__name(isUint8ArrayOrArrayBuffer, "isUint8ArrayOrArrayBuffer");
function toUint8ArrayIfArrayBuffer(value) {
  return isArrayBuffer(value) ? new Uint8Array(value) : value;
}
__name(toUint8ArrayIfArrayBuffer, "toUint8ArrayIfArrayBuffer");
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
__name(assertUint8ArrayOrArrayBuffer, "assertUint8ArrayOrArrayBuffer");
function toUint8Array(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`Unsupported value, got \`${typeof value}\`.`);
}
__name(toUint8Array, "toUint8Array");
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ??= arrays.reduce((accumulator, currentValue) => accumulator + currentValue.byteLength, 0);
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (let array of arrays) {
    assertUint8ArrayOrArrayBuffer(array);
    array = toUint8ArrayIfArrayBuffer(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
__name(concatUint8Arrays, "concatUint8Arrays");
var cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected \`string\`, got \`${typeof value}\``);
  }
}
__name(assertString, "assertString");
var cachedEncoder = new globalThis.TextEncoder();
function stringToUint8Array(string) {
  assertString(string);
  return cachedEncoder.encode(string);
}
__name(stringToUint8Array, "stringToUint8Array");
function base64ToBase64Url(base64) {
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(base64ToBase64Url, "base64ToBase64Url");
function base64UrlToBase64(base64url) {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - base64.length % 4) % 4;
  return base64 + "=".repeat(padding);
}
__name(base64UrlToBase64, "base64UrlToBase64");
var MAX_BLOCK_SIZE = 65535;
function uint8ArrayToBase64(array, { urlSafe = false } = {}) {
  assertUint8ArrayOrArrayBuffer(array);
  array = toUint8ArrayIfArrayBuffer(array);
  let base64 = "";
  for (let index = 0; index < array.length; index += MAX_BLOCK_SIZE) {
    const chunk = array.subarray(index, index + MAX_BLOCK_SIZE);
    base64 += globalThis.btoa(String.fromCodePoint.apply(void 0, chunk));
  }
  return urlSafe ? base64ToBase64Url(base64) : base64;
}
__name(uint8ArrayToBase64, "uint8ArrayToBase64");
function base64ToUint8Array(base64String) {
  assertString(base64String);
  return Uint8Array.from(globalThis.atob(base64UrlToBase64(base64String)), (x) => x.codePointAt(0));
}
__name(base64ToUint8Array, "base64ToUint8Array");
var byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

// node_modules/@block65/webcrypto-web-push/dist/lib/utils.js
function encodeRecordSize(size) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, size);
  return bytes;
}
__name(encodeRecordSize, "encodeRecordSize");
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
__name(invariant, "invariant");

// node_modules/@block65/webcrypto-web-push/dist/lib/client-keys.js
async function deriveClientKeys(sub) {
  const bytes = base64ToUint8Array(sub.keys.p256dh);
  const authSecretBytes = base64ToUint8Array(sub.keys.auth);
  invariant(bytes.byteLength === 65 && bytes[0] === 4, "Subscription p256dh is not an uncompressed P-256 point");
  invariant(authSecretBytes.byteLength === 16, "Subscription auth secret is not 16 bytes");
  return {
    publicKeyBytes: bytes,
    publicKey: await crypto.subtle.importKey("raw", bytes, {
      name: "ECDH",
      namedCurve: "P-256"
    }, false, []),
    authSecretBytes
  };
}
__name(deriveClientKeys, "deriveClientKeys");

// node_modules/@block65/webcrypto-web-push/dist/lib/hkdf.js
function createHMAC(data) {
  const keyPromise = crypto.subtle.importKey("raw", data, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  return {
    hash: /* @__PURE__ */ __name(async (input) => {
      const k = await keyPromise;
      return crypto.subtle.sign("HMAC", k, input);
    }, "hash")
  };
}
__name(createHMAC, "createHMAC");
async function hkdf(salt, ikm) {
  const prkhPromise = createHMAC(salt).hash(ikm).then((prk) => createHMAC(prk));
  return {
    extract: /* @__PURE__ */ __name(async (info, len) => {
      const prkh = await prkhPromise;
      const blocks = await Array.from({ length: Math.ceil(len / 32) }, (_, i) => i).reduce(async (acc, i) => {
        const previous = await acc;
        const hash = await prkh.hash(new Uint8Array([...previous.at(-1) ?? [], ...info, i + 1]));
        return [...previous, new Uint8Array(hash)];
      }, Promise.resolve([]));
      return concatUint8Arrays(blocks).slice(0, len);
    }, "extract")
  };
}
__name(hkdf, "hkdf");

// node_modules/@block65/webcrypto-web-push/dist/lib/info.js
function createKeyInfo(clientPublic, serverPublic) {
  return new Uint8Array([
    ...stringToUint8Array("WebPush: info\0"),
    ...clientPublic,
    ...serverPublic
  ]);
}
__name(createKeyInfo, "createKeyInfo");
function createInfo(type) {
  return stringToUint8Array(`Content-Encoding: ${type}\0`);
}
__name(createInfo, "createInfo");

// node_modules/@block65/webcrypto-web-push/dist/lib/local-keys.js
async function generateLocalKeys() {
  const keyPair = await crypto.subtle.generateKey({
    name: "ECDH",
    namedCurve: "P-256"
  }, false, ["deriveBits"]);
  return {
    privateKey: keyPair.privateKey,
    publicKeyBytes: new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  };
}
__name(generateLocalKeys, "generateLocalKeys");

// node_modules/@block65/webcrypto-web-push/dist/lib/salt.js
async function getSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}
__name(getSalt, "getSalt");

// node_modules/@block65/webcrypto-web-push/dist/lib/encrypt.js
var recordSize = 4096;
var headerSize = 21 + 65;
var maxPlaintextSize = recordSize - headerSize - 17;
async function encryptNotification(subscription, plaintext, options = {}) {
  invariant(plaintext.byteLength <= maxPlaintextSize, `Payload is ${plaintext.byteLength} bytes, the maximum is ${maxPlaintextSize}`);
  const clientKeys = await deriveClientKeys(subscription);
  const salt = await getSalt();
  const localKeys = await generateLocalKeys();
  const sharedSecret = await crypto.subtle.deriveBits({
    name: "ECDH",
    public: clientKeys.publicKey
  }, localKeys.privateKey, 256);
  const keyInfo = createKeyInfo(clientKeys.publicKeyBytes, localKeys.publicKeyBytes);
  const cekInfo = createInfo("aes128gcm");
  const nonceInfo = createInfo("nonce");
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(keyInfo, 32);
  const messageHkdf = await hkdf(salt, ikm);
  const cekBytes = await messageHkdf.extract(cekInfo, 16);
  const nonceBytes = await messageHkdf.extract(nonceInfo, 12);
  const cekCryptoKey = await crypto.subtle.importKey("raw", cekBytes, {
    name: "AES-GCM",
    length: 128
  }, false, ["encrypt"]);
  const padTo = options.pad ?? true ? maxPlaintextSize : plaintext.byteLength;
  const padded = new Uint8Array(padTo + 1);
  padded.set(plaintext);
  padded[plaintext.byteLength] = 2;
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonceBytes
  }, cekCryptoKey, padded);
  return new Uint8Array([
    ...salt,
    ...encodeRecordSize(recordSize),
    localKeys.publicKeyBytes.byteLength,
    ...localKeys.publicKeyBytes,
    ...new Uint8Array(encrypted)
  ]);
}
__name(encryptNotification, "encryptNotification");

// node_modules/@block65/webcrypto-web-push/dist/lib/base64.js
function encodeBase64Url(value) {
  return uint8ArrayToBase64(toUint8Array(value), { urlSafe: true });
}
__name(encodeBase64Url, "encodeBase64Url");
function objectToBase64Url(obj) {
  return encodeBase64Url(stringToUint8Array(JSON.stringify(obj)));
}
__name(objectToBase64Url, "objectToBase64Url");

// node_modules/@block65/webcrypto-web-push/dist/lib/jwt.js
async function sign(payload, key) {
  const headerStr = objectToBase64Url({
    typ: "JWT",
    alg: "ES256"
  });
  const payloadStr = objectToBase64Url({
    iat: Math.floor(Date.now() / 1e3),
    ...payload
  });
  const dataStr = `${headerStr}.${payloadStr}`;
  const signature = await crypto.subtle.sign({
    name: "ECDSA",
    hash: "SHA-256"
  }, key, stringToUint8Array(dataStr));
  return `${dataStr}.${encodeBase64Url(signature)}`;
}
__name(sign, "sign");

// node_modules/@block65/webcrypto-web-push/dist/lib/vapid.js
async function vapidHeaders(subscription, vapid) {
  invariant(vapid.subject, "Vapid subject is empty");
  invariant(vapid.privateKey, "Vapid private key is empty");
  invariant(vapid.publicKey, "Vapid public key is empty");
  const endpoint = new URL(subscription.endpoint);
  invariant(endpoint.protocol === "https:", `Subscription endpoint is not https: ${endpoint.protocol}`);
  const vapidPublicKeyBytes = base64ToUint8Array(vapid.publicKey);
  const publicKey = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
    y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
    d: vapid.privateKey
  }, {
    name: "ECDSA",
    namedCurve: "P-256"
  }, false, ["sign"]);
  const jwt = await sign({
    aud: endpoint.origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60,
    sub: vapid.subject
  }, publicKey);
  return {
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`
    }
  };
}
__name(vapidHeaders, "vapidHeaders");

// node_modules/@block65/webcrypto-web-push/dist/lib/payload.js
async function buildPushPayload(message, subscription, vapid) {
  const { headers } = await vapidHeaders(subscription, vapid);
  const body = await encryptNotification(subscription, stringToUint8Array(
    // if its a primitive, convert to string, otherwise stringify
    typeof message.data === "string" || typeof message.data === "number" ? message.data.toString() : JSON.stringify(message.data)
  ));
  return {
    headers: {
      ...headers,
      ttl: (message.options?.ttl || 60).toString(),
      ...message.options?.urgency && {
        urgency: message.options.urgency
      },
      ...message.options?.topic && {
        topic: message.options.topic
      },
      "content-encoding": "aes128gcm",
      "content-length": body.byteLength.toString(),
      "content-type": "application/octet-stream"
    },
    method: "post",
    body
  };
}
__name(buildPushPayload, "buildPushPayload");

// src/index.js
var KV_KEY = "data";
var VAPID_SUBJECT = "mailto:nuestros-momentos@example.com";
var CHAT_TZ = "America/Lima";
var DEFAULT_DATA = {
  users: [
    { username: "mmilla", name: "Michael Milla", password: "1303_2024" },
    { username: "mgarcia", name: "Mirella Garcia", password: "1303_2024" }
  ],
  connection: { status: "connected", sender: "Michael Milla", receiver: "Mirella Garcia" },
  nicknames: { "Michael Milla": "Mi Amor", "Mirella Garcia": "Mi Vida" },
  wishlist: [],
  freeDays: [],
  proposals: [],
  matches: [],
  notes: [],
  chat: [],
  pushSubs: {}
};
var ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.nuestrosmomentos.app",
      sha256_cert_fingerprints: [
        "24:C7:1B:AD:0B:70:AD:1E:C5:68:86:41:ED:22:D2:5B:8B:6E:28:4B:5F:55:B0:F8:AB:DF:72:BF:7F:93:C6:52"
      ]
    }
  }
];
var ICON_MAP = { Restaurante: "\u{1F35D}", Viaje: "\u{1F30A}", "Caf\xE9": "\u2615", Paseo: "\u{1F338}" };
var LIST_KEYS = ["wishlist", "freeDays", "proposals", "matches", "notes", "chat"];
var json = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
}), "json");
async function readBody(request) {
  try {
    return await request.json() || {};
  } catch {
    return {};
  }
}
__name(readBody, "readBody");
async function load(env) {
  const data = await env.DATA.get(KV_KEY, "json");
  if (!data) return structuredClone(DEFAULT_DATA);
  if (!data.users) data.users = structuredClone(DEFAULT_DATA.users);
  for (const key of LIST_KEYS) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  if (!data.pushSubs) data.pushSubs = {};
  return data;
}
__name(load, "load");
var save = /* @__PURE__ */ __name((env, data) => env.DATA.put(KV_KEY, JSON.stringify(data)), "save");
function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHAT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
__name(dayKey, "dayKey");
function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
__name(shiftDay, "shiftDay");
function computeStreak(data) {
  const people = (data.users || []).map((u) => u.name);
  const byDay = {};
  for (const msg of data.chat || []) {
    if (!msg.day) continue;
    if (!byDay[msg.day]) byDay[msg.day] = /* @__PURE__ */ new Set();
    byDay[msg.day].add(msg.author);
  }
  const bothTalked = /* @__PURE__ */ __name((day) => people.length >= 2 && people.every((p) => byDay[day] && byDay[day].has(p)), "bothTalked");
  const today = dayKey(/* @__PURE__ */ new Date());
  const todayDone = bothTalked(today);
  let cursor = todayDone ? today : shiftDay(today, -1);
  let count = 0;
  while (bothTalked(cursor)) {
    count++;
    cursor = shiftDay(cursor, -1);
  }
  return { count, todayDone, today };
}
__name(computeStreak, "computeStreak");
function publicView(data) {
  const { vapid, pushSubs, ...rest } = data;
  return {
    ...rest,
    users: (data.users || []).map((u) => ({ username: u.username, name: u.name })),
    streak: computeStreak(data)
  };
}
__name(publicView, "publicView");
async function notifyPartner(env, author, text) {
  try {
    const data = await load(env);
    if (!data.vapid) return;
    const other = data.users.find((u) => u.name !== author);
    if (!other) return;
    const subs = data.pushSubs[other.name] || [];
    if (subs.length === 0) return;
    const nick = (data.nicknames || {})[author] || author;
    const body = text.length > 120 ? text.slice(0, 117) + "..." : text;
    const message = {
      data: { title: `${nick} te escribi\xF3 \u{1F48C}`, body, url: "/", tag: "chat" },
      options: { ttl: 86400, urgency: "high", topic: "chat" }
    };
    const vapid = { subject: VAPID_SUBJECT, publicKey: data.vapid.publicKey, privateKey: data.vapid.privateKey };
    const alive = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        const req = await buildPushPayload(message, sub, vapid);
        const res = await fetch(sub.endpoint, { method: req.method, headers: req.headers, body: req.body });
        if (res.status !== 404 && res.status !== 410) alive.push(sub);
      } catch (err) {
        alive.push(sub);
      }
    }));
    const fresh = await load(env);
    fresh.pushSubs[other.name] = alive;
    await save(env, fresh);
  } catch (err) {
    console.log("No se pudo enviar la notificaci\xF3n:", err && err.message);
  }
}
__name(notifyPartner, "notifyPartner");
async function route(method, parts, request, env, ctx) {
  const [, resource, id, sub] = parts;
  if (method === "GET" && resource === "data" && !id) {
    return json(publicView(await load(env)));
  }
  if (method === "POST" && resource === "login") {
    const { username, password } = await readBody(request);
    const data = await load(env);
    const user = data.users.find((u) => u.username === username && u.password === password);
    if (!user) return json({ success: false, error: "Usuario o contrase\xF1a incorrectos" }, 401);
    return json({ success: true, name: user.name, username: user.username });
  }
  if (method === "GET" && resource === "push" && id === "key") {
    const data = await load(env);
    if (!data.vapid) return json({ success: false, error: "Notificaciones no configuradas" }, 503);
    return json({ publicKey: data.vapid.publicKey });
  }
  if (method === "POST" && resource === "push" && id === "subscribe") {
    const { user, subscription } = await readBody(request);
    const data = await load(env);
    if (!data.users.some((u) => u.name === user) || !subscription || !subscription.endpoint) {
      return json({ success: false, error: "Suscripci\xF3n no v\xE1lida" }, 400);
    }
    const list = (data.pushSubs[user] || []).filter((s) => s.endpoint !== subscription.endpoint);
    list.push(subscription);
    data.pushSubs[user] = list;
    await save(env, data);
    return json({ success: true });
  }
  if (method === "POST" && resource === "chat") {
    const { author, text } = await readBody(request);
    const data = await load(env);
    if (!data.users.some((u) => u.name === author)) {
      return json({ success: false, error: "Usuario no v\xE1lido" }, 403);
    }
    const clean = String(text || "").trim().slice(0, 1e3);
    if (!clean) return json({ success: false, error: "Escribe algo primero \u{1F495}" }, 400);
    const now = /* @__PURE__ */ new Date();
    data.chat.push({ id: Date.now(), author, text: clean, createdAt: now.toISOString(), day: dayKey(now) });
    await save(env, data);
    ctx.waitUntil(notifyPartner(env, author, clean));
    return json({ success: true, chat: data.chat, streak: computeStreak(data) });
  }
  if (resource === "wishlist") {
    const data = await load(env);
    if (method === "POST" && !id) {
      const item = { id: Date.now(), ...await readBody(request) };
      data.wishlist.push(item);
      await save(env, data);
      return json(item);
    }
    if (method === "DELETE" && id) {
      data.wishlist = data.wishlist.filter((i) => String(i.id) !== String(id));
      await save(env, data);
      return json({ success: true, wishlist: data.wishlist });
    }
    if (method === "PUT" && id) {
      const item = data.wishlist.find((i) => String(i.id) === String(id));
      if (!item) return json({ success: false, error: "Lugar no encontrado" }, 404);
      const { title, description, category } = await readBody(request);
      if (title !== void 0) item.title = title;
      if (description !== void 0) item.description = description;
      if (category !== void 0) {
        item.category = category;
        item.image = ICON_MAP[category] || item.image;
      }
      await save(env, data);
      return json({ success: true, item, wishlist: data.wishlist });
    }
  }
  if (resource === "notes") {
    const data = await load(env);
    if (method === "POST" && !id) {
      const { text, author, color } = await readBody(request);
      if (!text || !String(text).trim()) return json({ success: false, error: "Escribe algo bonito primero" }, 400);
      const note = {
        id: Date.now(),
        text: String(text).trim().slice(0, 300),
        author: author || "An\xF3nimo",
        color: color || "#ffd6e0",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      data.notes.unshift(note);
      await save(env, data);
      return json({ success: true, note, notes: data.notes });
    }
    if (method === "DELETE" && id) {
      data.notes = data.notes.filter((n) => String(n.id) !== String(id));
      await save(env, data);
      return json({ success: true, notes: data.notes });
    }
  }
  if (method === "POST" && resource === "freedays") {
    const data = await load(env);
    const newDay = await readBody(request);
    data.freeDays = data.freeDays.filter((d) => !(d.user === newDay.user && d.date === newDay.date));
    data.freeDays.push(newDay);
    await save(env, data);
    return json(data.freeDays);
  }
  if (resource === "proposals") {
    const data = await load(env);
    if (method === "POST" && !id) {
      const proposal = { id: Date.now(), status: "pending", ...await readBody(request) };
      data.proposals.push(proposal);
      await save(env, data);
      return json(proposal);
    }
    if (method === "POST" && id && sub === "respond") {
      const { action } = await readBody(request);
      const proposal = data.proposals.find((p) => String(p.id) === String(id));
      if (!proposal) return json({ error: "Cartita no encontrada" }, 404);
      if (action === "accept") {
        proposal.status = "accepted";
        data.matches.push({
          id: Date.now(),
          place: proposal.place,
          date: proposal.date,
          message: proposal.message,
          sender: proposal.sender,
          receiver: proposal.receiver
        });
      } else {
        proposal.status = "rejected";
      }
      await save(env, data);
      return json(proposal);
    }
  }
  if (method === "DELETE" && resource === "matches" && id) {
    const data = await load(env);
    data.matches = data.matches.filter((m) => String(m.id) !== String(id));
    await save(env, data);
    return json({ success: true, matches: data.matches });
  }
  if (method === "POST" && resource === "connection") {
    const { action, sender, receiver } = await readBody(request);
    const data = await load(env);
    if (action === "request") {
      data.connection = { status: "pending", sender, receiver };
    } else if (action === "accept") {
      data.connection = {
        status: "connected",
        sender: data.connection.sender || sender,
        receiver: data.connection.receiver || receiver
      };
    } else if (action === "disconnect") {
      data.connection = { status: "disconnected", sender: null, receiver: null };
    }
    await save(env, data);
    return json(data.connection);
  }
  if (method === "POST" && resource === "nicknames") {
    const { user, nickname } = await readBody(request);
    const data = await load(env);
    if (!data.nicknames) data.nicknames = {};
    data.nicknames[user] = nickname;
    await save(env, data);
    return json({ success: true, nicknames: data.nicknames });
  }
  return json({ success: false, error: "Ruta no encontrada" }, 404);
}
__name(route, "route");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/assetlinks.json") {
      return new Response(JSON.stringify(ASSET_LINKS), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
      });
    }
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      return await route(request.method, parts, request, env, ctx);
    } catch (err) {
      return json({ success: false, error: "Error interno del servidor" }, 500);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YWRzuK/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YWRzuK/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
