// Nuestros Momentos en Cloudflare Workers.
// Reimplementa backend/server.js: API completa (login, wishlist, notas, días libres,
// propuestas, citas, conexión, apodos, chat con racha y notificaciones push).
// Los datos viven en Workers KV bajo la clave "data". Los archivos web salen de public/.

import { buildPushPayload } from '@block65/webcrypto-web-push';

const KV_KEY = 'data';
const VAPID_SUBJECT = 'mailto:nuestros-momentos@example.com';
const CHAT_TZ = 'America/Lima';

const DEFAULT_DATA = {
  users: [
    { username: 'mmilla', name: 'Michael Milla', password: '1303_2024' },
    { username: 'mgarcia', name: 'Mirella Garcia', password: '1303_2024' },
  ],
  connection: { status: 'connected', sender: 'Michael Milla', receiver: 'Mirella Garcia' },
  nicknames: { 'Michael Milla': 'Mi Amor', 'Mirella Garcia': 'Mi Vida' },
  wishlist: [],
  freeDays: [],
  proposals: [],
  matches: [],
  notes: [],
  chat: [],
  pushSubs: {},
};

const ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.nuestrosmomentos.app',
      sha256_cert_fingerprints: [
        '24:C7:1B:AD:0B:70:AD:1E:C5:68:86:41:ED:22:D2:5B:8B:6E:28:4B:5F:55:B0:F8:AB:DF:72:BF:7F:93:C6:52',
      ],
    },
  },
];

const ICON_MAP ={ Restaurante: '🍝', Viaje: '🌊', 'Café': '☕', Paseo: '🌸' };
const LIST_KEYS = ['wishlist', 'freeDays', 'proposals', 'matches', 'notes', 'chat'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

async function readBody(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

async function load(env) {
  const data = await env.DATA.get(KV_KEY, 'json');
  if (!data) return structuredClone(DEFAULT_DATA);
  if (!data.users) data.users = structuredClone(DEFAULT_DATA.users);
  for (const key of LIST_KEYS) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  if (!data.pushSubs) data.pushSubs = {};
  return data;
}

const save = (env, data) => env.DATA.put(KV_KEY, JSON.stringify(data));

// ===== Chat: días y racha (hora de Lima) =====
function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHAT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// Un día cuenta cuando AMBOS escriben al menos un mensaje ese día
function computeStreak(data) {
  const people = (data.users || []).map(u => u.name);
  const byDay = {};
  for (const msg of data.chat || []) {
    if (!msg.day) continue;
    if (!byDay[msg.day]) byDay[msg.day] = new Set();
    byDay[msg.day].add(msg.author);
  }
  const bothTalked = day => people.length >= 2 && people.every(p => byDay[day] && byDay[day].has(p));
  const today = dayKey(new Date());
  const todayDone = bothTalked(today);
  let cursor = todayDone ? today : shiftDay(today, -1);
  let count = 0;
  while (bothTalked(cursor)) {
    count++;
    cursor = shiftDay(cursor, -1);
  }
  return { count, todayDone, today };
}

// Lo que se le envía al navegador: sin contraseñas ni claves de push
function publicView(data) {
  const { vapid, pushSubs, ...rest } = data;
  return {
    ...rest,
    users: (data.users || []).map(u => ({ username: u.username, name: u.name })),
    streak: computeStreak(data),
  };
}

// ===== Notificaciones push =====
// Avisa a la pareja (no al que escribió) que llegó un mensaje nuevo
async function notifyPartner(env, author, text) {
  try {
    const data = await load(env);
    if (!data.vapid) return;
    const other = data.users.find(u => u.name !== author);
    if (!other) return;
    const subs = data.pushSubs[other.name] || [];
    if (subs.length === 0) return;

    const nick = (data.nicknames || {})[author] || author;
    const body = text.length > 120 ? text.slice(0, 117) + '...' : text;
    const message = {
      data: { title: `${nick} te escribió 💌`, body, url: '/', tag: 'chat', to: other.name },
      options: { ttl: 86400, urgency: 'high', topic: 'chat' },
    };
    const vapid = { subject: VAPID_SUBJECT, publicKey: data.vapid.publicKey, privateKey: data.vapid.privateKey };

    const alive = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        const req = await buildPushPayload(message, sub, vapid);
        const res = await fetch(sub.endpoint, { method: req.method, headers: req.headers, body: req.body });
        // 404/410 = el celular revocó la suscripción; se descarta
        if (res.status !== 404 && res.status !== 410) alive.push(sub);
      } catch (err) {
        alive.push(sub); // error de red: se conserva para el siguiente intento
      }
    }));

    const fresh = await load(env);
    fresh.pushSubs[other.name] = alive;
    await save(env, fresh);
  } catch (err) {
    console.log('No se pudo enviar la notificación:', err && err.message);
  }
}

// ===== Router de la API =====
async function route(method, parts, request, env, ctx) {
  // parts: ['api', recurso, id?, accion?]
  const [, resource, id, sub] = parts;

  if (method === 'GET' && resource === 'data' && !id) {
    return json(publicView(await load(env)));
  }

  if (method === 'POST' && resource === 'login') {
    const { username, password } = await readBody(request);
    const data = await load(env);
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) return json({ success: false, error: 'Usuario o contraseña incorrectos' }, 401);
    return json({ success: true, name: user.name, username: user.username });
  }

  if (method === 'GET' && resource === 'push' && id === 'key') {
    const data = await load(env);
    if (!data.vapid) return json({ success: false, error: 'Notificaciones no configuradas' }, 503);
    return json({ publicKey: data.vapid.publicKey });
  }

  if (method === 'POST' && resource === 'push' && id === 'subscribe') {
    const { user, subscription } = await readBody(request);
    const data = await load(env);
    if (!data.users.some(u => u.name === user) || !subscription || !subscription.endpoint) {
      return json({ success: false, error: 'Suscripción no válida' }, 400);
    }
    const list = (data.pushSubs[user] || []).filter(s => s.endpoint !== subscription.endpoint);
    list.push(subscription);
    data.pushSubs[user] = list;
    await save(env, data);
    return json({ success: true });
  }

  // Checks de estado: "entregado" (llegó al celular) y "visto" (se mostró en pantalla)
  if (method === 'POST' && resource === 'chat' && (id === 'delivered' || id === 'read')) {
    const { user } = await readBody(request);
    const data = await load(env);
    if (!data.users.some(u => u.name === user)) return json({ success: false, error: 'Usuario no válido' }, 400);
    const now = new Date().toISOString();
    let changed = 0;
    for (const m of data.chat) {
      if (m.author === user) continue; // solo mensajes que recibe 'user'
      if (!m.deliveredAt) { m.deliveredAt = now; changed++; }
      if (id === 'read' && !m.readAt) { m.readAt = now; changed++; }
    }
    // Solo se escribe en KV si cambió algo, para no gastar escrituras en cada consulta
    if (changed) await save(env, data);
    return json({ success: true, changed });
  }

  if (method === 'POST' && resource === 'chat') {
    const { author, text } = await readBody(request);
    const data = await load(env);
    if (!data.users.some(u => u.name === author)) {
      return json({ success: false, error: 'Usuario no válido' }, 403);
    }
    const clean = String(text || '').trim().slice(0, 1000);
    if (!clean) return json({ success: false, error: 'Escribe algo primero 💕' }, 400);
    const now = new Date();
    data.chat.push({ id: Date.now(), author, text: clean, createdAt: now.toISOString(), day: dayKey(now) });
    await save(env, data);
    // La notificación se envía después de responder, sin demorar el chat
    ctx.waitUntil(notifyPartner(env, author, clean));
    return json({ success: true, chat: data.chat, streak: computeStreak(data) });
  }

  if (resource === 'wishlist') {
    const data = await load(env);
    if (method === 'POST' && !id) {
      const item = { id: Date.now(), ...(await readBody(request)) };
      data.wishlist.push(item);
      await save(env, data);
      return json(item);
    }
    if (method === 'DELETE' && id) {
      data.wishlist = data.wishlist.filter(i => String(i.id) !== String(id));
      await save(env, data);
      return json({ success: true, wishlist: data.wishlist });
    }
    if (method === 'PUT' && id) {
      const item = data.wishlist.find(i => String(i.id) === String(id));
      if (!item) return json({ success: false, error: 'Lugar no encontrado' }, 404);
      const { title, description, category } = await readBody(request);
      if (title !== undefined) item.title = title;
      if (description !== undefined) item.description = description;
      if (category !== undefined) {
        item.category = category;
        item.image = ICON_MAP[category] || item.image;
      }
      await save(env, data);
      return json({ success: true, item, wishlist: data.wishlist });
    }
  }

  if (resource === 'notes') {
    const data = await load(env);
    if (method === 'POST' && !id) {
      const { text, author, color } = await readBody(request);
      if (!text || !String(text).trim()) return json({ success: false, error: 'Escribe algo bonito primero' }, 400);
      const note = {
        id: Date.now(),
        text: String(text).trim().slice(0, 300),
        author: author || 'Anónimo',
        color: color || '#ffd6e0',
        createdAt: new Date().toISOString(),
      };
      data.notes.unshift(note);
      await save(env, data);
      return json({ success: true, note, notes: data.notes });
    }
    if (method === 'DELETE' && id) {
      data.notes = data.notes.filter(n => String(n.id) !== String(id));
      await save(env, data);
      return json({ success: true, notes: data.notes });
    }
  }

  if (method === 'POST' && resource === 'freedays') {
    const data = await load(env);
    const newDay = await readBody(request);
    data.freeDays = data.freeDays.filter(d => !(d.user === newDay.user && d.date === newDay.date));
    data.freeDays.push(newDay);
    await save(env, data);
    return json(data.freeDays);
  }

  if (resource === 'proposals') {
    const data = await load(env);
    if (method === 'POST' && !id) {
      const proposal = { id: Date.now(), status: 'pending', ...(await readBody(request)) };
      data.proposals.push(proposal);
      await save(env, data);
      return json(proposal);
    }
    if (method === 'POST' && id && sub === 'respond') {
      const { action } = await readBody(request);
      const proposal = data.proposals.find(p => String(p.id) === String(id));
      if (!proposal) return json({ error: 'Cartita no encontrada' }, 404);
      if (action === 'accept') {
        proposal.status = 'accepted';
        data.matches.push({
          id: Date.now(),
          place: proposal.place,
          date: proposal.date,
          message: proposal.message,
          sender: proposal.sender,
          receiver: proposal.receiver,
        });
      } else {
        proposal.status = 'rejected';
      }
      await save(env, data);
      return json(proposal);
    }
  }

  if (method === 'DELETE' && resource === 'matches' && id) {
    const data = await load(env);
    data.matches = data.matches.filter(m => String(m.id) !== String(id));
    await save(env, data);
    return json({ success: true, matches: data.matches });
  }

  if (method === 'POST' && resource === 'connection') {
    const { action, sender, receiver } = await readBody(request);
    const data = await load(env);
    if (action === 'request') {
      data.connection = { status: 'pending', sender, receiver };
    } else if (action === 'accept') {
      data.connection = {
        status: 'connected',
        sender: data.connection.sender || sender,
        receiver: data.connection.receiver || receiver,
      };
    } else if (action === 'disconnect') {
      data.connection = { status: 'disconnected', sender: null, receiver: null };
    }
    await save(env, data);
    return json(data.connection);
  }

  if (method === 'POST' && resource === 'nicknames') {
    const { user, nickname } = await readBody(request);
    const data = await load(env);
    if (!data.nicknames) data.nicknames = {};
    data.nicknames[user] = nickname;
    await save(env, data);
    return json({ success: true, nicknames: data.nicknames });
  }

  return json({ success: false, error: 'Ruta no encontrada' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Verificación de dominio (Digital Asset Links): Android confía en que esta web
    // pertenece a la APK, y así la app abre a pantalla completa sin barra de navegador.
    if (url.pathname === '/.well-known/assetlinks.json') {
      return new Response(JSON.stringify(ASSET_LINKS), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      return await route(request.method, parts, request, env, ctx);
    } catch (err) {
      return json({ success: false, error: 'Error interno del servidor' }, 500);
    }
  },
};
