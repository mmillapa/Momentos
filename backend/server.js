const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Solo se publica la carpeta public/ (así data.json y las claves nunca se exponen)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Datos iniciales con usuarios definidos
const defaultData = {
  users: [
    { username: 'mmilla', name: 'Michael Milla', password: '1303_2024' },
    { username: 'mgarcia', name: 'Mirella Garcia', password: '1303_2024' }
  ],
  connection: { status: 'connected', sender: 'Michael Milla', receiver: 'Mirella Garcia' },
  nicknames: { 'Michael Milla': 'Mi Amor', 'Mirella Garcia': 'Mi Vida' },
  wishlist: [
    { id: 1, title: 'Cena Romántica Italiana', category: 'Restaurante', description: 'Pasta fresca y vino tinto en el centro.', image: '🍝', addedBy: 'Michael Milla' },
    { id: 2, title: 'Escapada a la Playa', category: 'Viaje', description: 'Fin de semana viendo el atardecer en la arena.', image: '🌊', addedBy: 'Mirella Garcia' },
    { id: 3, title: 'Café y Postre en el Parque', category: 'Café', description: 'Tarde tranquila caminando y tomando helado.', image: '☕', addedBy: 'Michael Milla' }
  ],
  freeDays: [],
  proposals: [],
  matches: [],
  chat: []
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
  try {
    const raw = fs.readFileSync(DATA_FILE);
    const data = JSON.parse(raw);
    if (!data.users) data.users = defaultData.users;
    if (!data.chat) data.chat = [];
    return data;
  } catch (e) {
    return defaultData;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== Chat y racha de días =====
// Un día cuenta para la racha cuando AMBOS escriben al menos un mensaje ese día (hora de Lima).
const CHAT_TZ = 'America/Lima';

function dayKey(date) {
  // en-CA devuelve YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHAT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

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
  // Si hoy aún no hablan, la racha sigue viva hasta que termine el día (cuenta desde ayer)
  let cursor = todayDone ? today : shiftDay(today, -1);
  let count = 0;
  while (bothTalked(cursor)) {
    count++;
    cursor = shiftDay(cursor, -1);
  }
  return { count, todayDone, today };
}

// Endpoint de Login
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const data = loadData();
    const user = data.users.find(u => u.username === username && u.password === password);
    if (user) {
      return res.json({ success: true, name: user.name, username: user.username });
    } else {
      return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoints generales
app.get('/api/data', (req, res) => {
  const data = loadData();
  res.json({ ...data, streak: computeStreak(data) });
});

// Chat: mensajes de texto y emojis
app.post('/api/chat', (req, res) => {
  const { author, text } = req.body || {};
  const data = loadData();
  if (!data.users.some(u => u.name === author)) {
    return res.status(403).json({ success: false, error: 'Usuario no válido' });
  }
  const clean = String(text || '').trim().slice(0, 1000);
  if (!clean) {
    return res.status(400).json({ success: false, error: 'Escribe algo primero 💕' });
  }
  const now = new Date();
  data.chat.push({ id: Date.now(), author, text: clean, createdAt: now.toISOString(), day: dayKey(now) });
  saveData(data);
  notifyPartner(author, clean); // no se espera: la respuesta al chat no debe demorarse
  res.json({ success: true, chat: data.chat, streak: computeStreak(data) });
});

// ===== Notificaciones push =====
const VAPID_SUBJECT = 'mailto:nuestros-momentos@example.com';

// Las claves se generan una sola vez y se guardan en data.json (que ya no se publica)
function getVapid() {
  const data = loadData();
  if (!data.vapid) {
    data.vapid = webpush.generateVAPIDKeys();
    saveData(data);
  }
  webpush.setVapidDetails(VAPID_SUBJECT, data.vapid.publicKey, data.vapid.privateKey);
  return data.vapid;
}

app.get('/api/push/key', (req, res) => {
  res.json({ publicKey: getVapid().publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { user, subscription } = req.body || {};
  const data = loadData();
  if (!data.users.some(u => u.name === user) || !subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'Suscripción no válida' });
  }
  if (!data.pushSubs) data.pushSubs = {};
  const list = (data.pushSubs[user] || []).filter(s => s.endpoint !== subscription.endpoint);
  list.push(subscription);
  data.pushSubs[user] = list;
  saveData(data);
  res.json({ success: true });
});

// Avisa a la pareja (no al que escribió) que llegó un mensaje nuevo
async function notifyPartner(author, text) {
  try {
    getVapid();
    const data = loadData();
    const other = data.users.find(u => u.name !== author);
    if (!other) return;
    const subs = (data.pushSubs || {})[other.name] || [];
    if (subs.length === 0) return;

    const nick = (data.nicknames || {})[author] || author;
    const body = text.length > 120 ? text.slice(0, 117) + '...' : text;
    const payload = JSON.stringify({ title: `${nick} te escribió 💌`, body, url: '/', tag: 'chat' });

    const alive = [];
    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification(s, payload);
        alive.push(s);
      } catch (err) {
        // 404/410 = suscripción vencida (el celular la revocó); se descarta
        if (err.statusCode !== 404 && err.statusCode !== 410) alive.push(s);
      }
    }));

    const fresh = loadData();
    if (!fresh.pushSubs) fresh.pushSubs = {};
    fresh.pushSubs[other.name] = alive;
    saveData(fresh);
  } catch (err) {
    console.log('No se pudo enviar la notificación:', err.message);
  }
}

app.post('/api/wishlist', (req, res) => {
  const data = loadData();
  const newItem = { id: Date.now(), ...req.body };
  data.wishlist.push(newItem);
  saveData(data);
  res.json(newItem);
});

app.delete('/api/wishlist/:id', (req, res) => {
  const { id } = req.params;
  const data = loadData();
  data.wishlist = data.wishlist.filter(item => String(item.id) !== String(id));
  saveData(data);
  res.json({ success: true, wishlist: data.wishlist });
});

app.put('/api/wishlist/:id', (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const item = data.wishlist.find(i => String(i.id) === String(id));
  if (!item) {
    return res.status(404).json({ success: false, error: 'Lugar no encontrado' });
  }
  const iconMap = { 'Restaurante': '🍝', 'Viaje': '🌊', 'Café': '☕', 'Paseo': '🌸' };
  const { title, description, category } = req.body || {};
  if (title !== undefined) item.title = title;
  if (description !== undefined) item.description = description;
  if (category !== undefined) {
    item.category = category;
    item.image = iconMap[category] || item.image;
  }
  saveData(data);
  res.json({ success: true, item, wishlist: data.wishlist });
});

// Mural de los Deseos: notitas románticas
app.post('/api/notes', (req, res) => {
  const data = loadData();
  if (!data.notes) data.notes = [];
  const { text, author, color } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, error: 'Escribe algo bonito primero' });
  }
  const note = {
    id: Date.now(),
    text: String(text).trim().slice(0, 300),
    author: author || 'Anónimo',
    color: color || '#ffd6e0',
    createdAt: new Date().toISOString()
  };
  data.notes.unshift(note);
  saveData(data);
  res.json({ success: true, note, notes: data.notes });
});

app.delete('/api/notes/:id', (req, res) => {
  const data = loadData();
  if (!data.notes) data.notes = [];
  data.notes = data.notes.filter(n => String(n.id) !== String(req.params.id));
  saveData(data);
  res.json({ success: true, notes: data.notes });
});

app.post('/api/freedays', (req, res) => {
  const data = loadData();
  const newDay = req.body;
  data.freeDays = data.freeDays.filter(d => !(d.user === newDay.user && d.date === newDay.date));
  data.freeDays.push(newDay);
  saveData(data);
  res.json(data.freeDays);
});

app.post('/api/proposals', (req, res) => {
  const data = loadData();
  const proposal = { id: Date.now(), status: 'pending', ...req.body };
  data.proposals.push(proposal);
  saveData(data);
  res.json(proposal);
});

app.post('/api/proposals/:id/respond', (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const data = loadData();
  
  const proposal = data.proposals.find(p => p.id == id);
  if (!proposal) return res.status(404).json({ error: 'Cartita no encontrada' });

  if (action === 'accept') {
    proposal.status = 'accepted';
    data.matches.push({
      id: Date.now(),
      place: proposal.place,
      date: proposal.date,
      message: proposal.message,
      sender: proposal.sender,
      receiver: proposal.receiver
    });
  } else {
    proposal.status = 'rejected';
  }
  
  saveData(data);
  res.json(proposal);
});

// Endpoint para eliminar un match (cita confirmada)
app.delete('/api/matches/:id', (req, res) => {
  const { id } = req.params;
  const data = loadData();
  data.matches = data.matches.filter(m => String(m.id) !== String(id));
  saveData(data);
  res.json({ success: true, matches: data.matches });
});

// Endpoint para gestionar la conexión de novios
app.post('/api/connection', (req, res) => {
  const { action, sender, receiver } = req.body;
  const data = loadData();
  if (action === 'request') {
    data.connection = { status: 'pending', sender, receiver };
  } else if (action === 'accept') {
    data.connection = { status: 'connected', sender: data.connection.sender || sender, receiver: data.connection.receiver || receiver };
  } else if (action === 'disconnect') {
    data.connection = { status: 'disconnected', sender: null, receiver: null };
  }
  saveData(data);
  res.json(data.connection);
});

// Endpoint para actualizar apodos cariñosos
app.post('/api/nicknames', (req, res) => {
  const { user, nickname } = req.body;
  const data = loadData();
  if (!data.nicknames) data.nicknames = {};
  data.nicknames[user] = nickname;
  saveData(data);
  res.json({ success: true, nicknames: data.nicknames });
});

app.listen(PORT, () => {
  getVapid();
  console.log(`Servidor de Nuestros Momentos corriendo en http://localhost:${PORT}`);
});
