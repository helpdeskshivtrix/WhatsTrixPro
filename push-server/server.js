'use strict';
/* WhatsTrix push relay.
   - Keeps each person's Web Push subscription, linked to their WhatsTrix number (12 digits).
   - A number is only accepted if the request is signed with the private key that number was made from.
   - You may only alert someone who put your number on their allow list (their contacts).
   - Message text, call audio and photos never pass through here. Alerts carry only: kind, sender number, sender name, room id. */
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const webpush = require('web-push');

const PORT = +process.env.PORT || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

/* ---------- storage ----------
   Free hosts wipe the disk when the server sleeps or restarts, which would delete every subscription.
   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (free database at upstash.com) to keep them safe.
   Without it the server uses a JSON file, which is fine on a host with a persistent disk. */
const REST = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, ''), RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || '', RKEY = process.env.STORE_KEY || 'whatstrix-push';
let db = { keys: null, subs: {} };
async function redis(cmd) {
  const r = await fetch(REST, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}
async function load() {
  try {
    const raw = REST ? await redis(['GET', RKEY]) : fs.readFileSync(DATA_FILE, 'utf8');
    if (raw) db = Object.assign(db, JSON.parse(raw));
  } catch (e) { if (REST) console.error('could not load from Redis:', e.message); }
}
let saveT = null;
const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => {
  try { if (REST) await redis(['SET', RKEY, JSON.stringify(db)]); else fs.writeFileSync(DATA_FILE, JSON.stringify(db)); }
  catch (e) { console.error('save failed', e.message); }
}, 500); };

/* ---------- VAPID keys: from the environment, else generated once and stored ---------- */
let pub = process.env.VAPID_PUBLIC, priv = process.env.VAPID_PRIVATE;
function initVapid() {
  if (!pub || !priv) {
    if (!db.keys) { db.keys = webpush.generateVAPIDKeys(); save(); console.warn('No VAPID_PUBLIC/VAPID_PRIVATE set: generated keys. Set them in the environment so they survive restarts.'); }
    pub = db.keys.publicKey; priv = db.keys.privateKey;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
}

/* ---------- identity check (same derivation as the app) ---------- */
const B64U = /^[A-Za-z0-9_-]{43}$/;
function numberFor(sp, ep) {
  const h = crypto.createHash('sha256').update([sp.x, sp.y, ep.x, ep.y].join('.')).digest();
  const n = h.readBigUInt64BE(0);
  return String(100000000000n + n % 900000000000n);
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const seenNonce = new Map();
function verify(body, route) {
  const { p, sig, sp, ep } = body || {};
  if (typeof p !== 'string' || p.length > 8192 || typeof sig !== 'string' || !sp || !ep) throw new HttpError(400, 'bad request');
  for (const k of [sp, ep]) if (!k || !B64U.test(k.x || '') || !B64U.test(k.y || '')) throw new HttpError(400, 'bad key');
  let m; try { m = JSON.parse(p); } catch { throw new HttpError(400, 'bad json'); }
  if (m.path !== route) throw new HttpError(400, 'wrong route');
  if (numberFor(sp, ep) !== m.id) throw new HttpError(401, 'number does not match keys');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: sp.x, y: sp.y }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(p), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64'));
  if (!ok) throw new HttpError(401, 'bad signature');
  if (!Number.isFinite(m.ts) || Math.abs(Date.now() - m.ts) > 120000) throw new HttpError(401, 'clock too far off');
  if (typeof m.nonce !== 'string' || m.nonce.length < 8 || m.nonce.length > 64) throw new HttpError(400, 'bad nonce');
  const nk = m.id + m.nonce; if (seenNonce.has(nk)) throw new HttpError(401, 'replay');
  seenNonce.set(nk, Date.now() + 300000);
  return m;
}
setInterval(() => { const n = Date.now(); for (const [k, t] of seenNonce) if (t < n) seenNonce.delete(k); for (const [k, v] of rate) if (v.t < n) rate.delete(k); }, 60000).unref();

/* ---------- rate limits ---------- */
const rate = new Map();
function limited(key, max, ms) { const n = Date.now(), r = rate.get(key); if (!r || r.t < n) { rate.set(key, { t: n + ms, c: 1 }); return false; } return ++r.c > max; }

/* ---------- sending with retries and cleanup ---------- */
const KINDS = { msg: { ttl: 86400, urgency: 'normal' }, call: { ttl: 45, urgency: 'high' }, missed: { ttl: 604800, urgency: 'normal' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sendOne(rec, sub, payload, opt) {
  for (let a = 0; a < 3; a++) {
    try { await webpush.sendNotification(sub, payload, opt); return true; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { rec.subs = rec.subs.filter(s => s.endpoint !== sub.endpoint); save(); return false; }   // subscription expired
      if (e.statusCode === 429 || e.statusCode >= 500 || !e.statusCode) { const ra = +(e.headers && e.headers['retry-after']) || 0; await sleep(Math.min(ra ? ra * 1000 : 800 * 2 ** a, 5000)); continue; }
      console.warn('push rejected', e.statusCode); return false;
    }
  }
  return false;
}
const recent = new Map();

/* ---------- routes ---------- */
async function route(req, body) {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/health') return { ok: true };
  if (req.method === 'GET' && url === '/vapid') return { key: pub };
  if (req.method !== 'POST') throw new HttpError(404, 'not found');

  if (url === '/register') {
    const m = verify(body, '/register');
    const s = m.sub;
    if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1024 || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') throw new HttpError(400, 'bad subscription');
    const allow = Array.isArray(m.allow) ? m.allow.filter(x => /^\d{12}$/.test(x)).slice(0, 500) : [];
    const rec = db.subs[m.id] || (db.subs[m.id] = { subs: [], allow: [], name: '' });
    rec.subs = rec.subs.filter(x => x.endpoint !== s.endpoint);
    rec.subs.unshift({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
    rec.subs = rec.subs.slice(0, 5);
    rec.allow = allow; rec.name = String(m.name || '').slice(0, 24); rec.upd = Date.now();
    save(); return { ok: true, devices: rec.subs.length };
  }
  if (url === '/unregister') {
    const m = verify(body, '/unregister'), rec = db.subs[m.id];
    if (rec) { rec.subs = rec.subs.filter(x => x.endpoint !== m.endpoint); if (!rec.subs.length) delete db.subs[m.id]; save(); }
    return { ok: true };
  }
  if (url === '/notify') {
    const m = verify(body, '/notify');
    if (!/^\d{12}$/.test(m.to || '') || !KINDS[m.kind]) throw new HttpError(400, 'bad notify');
    if (limited('s' + m.id, 40, 60000) || limited('r' + m.to, 120, 60000)) throw new HttpError(429, 'slow down');
    const rec = db.subs[m.to];
    if (!rec || !rec.allow.includes(m.id) || !rec.subs.length) return { ok: true, sent: 0 };   // same answer either way, so numbers cannot be probed
    const dk = [m.id, m.to, m.kind, m.cid || m.g || ''].join('|'), now = Date.now();
    if (recent.get(dk) > now - 8000) return { ok: true, sent: 0, dup: true };
    recent.set(dk, now); if (recent.size > 5000) for (const [k, t] of recent) if (t < now - 8000) recent.delete(k);
    const g = typeof m.g === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(m.g) ? m.g : '';
    const cid = typeof m.cid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(m.cid) ? m.cid : '';
    const payload = JSON.stringify({ k: m.kind, f: m.id, n: String(m.name || 'Someone').slice(0, 24), g, cid, v: m.v === 'video' ? 'video' : 'voice', ts: now });
    const topic = crypto.createHash('sha1').update(m.kind === 'msg' ? 'm' + m.id + g : 'c' + m.id).digest('base64url').slice(0, 22);
    const k = KINDS[m.kind];
    const res = await Promise.all(rec.subs.slice().map(s => sendOne(rec, s, payload, { TTL: k.ttl, urgency: k.urgency, topic })));
    return { ok: true, sent: res.filter(Boolean).length };
  }
  throw new HttpError(404, 'not found');
}

function cors(req, res) {
  const o = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (o && ORIGINS.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 16384) { res.writeHead(413); res.end(); req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    if (res.writableEnded) return;
    try {
      let body = null; if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'bad json'); } }
      const out = await route(req, body);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) {
      const code = e instanceof HttpError ? e.code : 500; if (code === 500) console.error(e);
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: code === 500 ? 'server error' : e.message }));
    }
  });
});
load().then(() => { initVapid(); server.listen(PORT, () => console.log('WhatsTrix push relay on :' + PORT + (REST ? ' (Redis storage)' : ' (file storage)'))); });
