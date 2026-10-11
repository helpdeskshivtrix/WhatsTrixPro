/* WhatsTrix service worker: offline app shell. The QR and network libraries are
   built into index.html, so nothing else needs to be cached. Bump VERSION whenever
   you change any file. Chat traffic (WebRTC and the PeerJS signaling socket) never
   goes through the cache. */
const VERSION = 'whatstrix-v3';
const SHELL = ['./', './index.html', './manifest.json', './config.js', './icon.svg', './logo.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // one missing file must not break the install
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // never touch other sites

  // Pages: network first (with a timeout) so updates arrive immediately; cache when offline or slow.
  if (req.mode === 'navigate') {
    e.respondWith(
      new Promise((resolve, reject) => {
        const t = setTimeout(() => caches.match('./index.html').then(h => h && resolve(h)), 6000);
        fetch(req).then(res => {
          clearTimeout(t);
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
          resolve(res);
        }).catch(() => { clearTimeout(t); caches.match('./index.html').then(h => h ? resolve(h) : reject()); });
      })
    );
    return;
  }

  // Own static files: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

/* ---------- Web Push (needs the push server; see push-server/README.md) ---------- */
const INBOX = 'wt-inbox';
function inboxPut(rec) {
  return new Promise(res => {
    try {
      const rq = indexedDB.open(INBOX, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('missed', { keyPath: 'cid' });
      rq.onerror = () => res();
      rq.onsuccess = () => {
        const db = rq.result, t = db.transaction('missed', 'readwrite');
        t.objectStore('missed').put(rec);
        t.oncomplete = () => { db.close(); res(); };
        t.onerror = () => { db.close(); res(); };
      };
    } catch (e) { res(); }
  });
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* ignore */ }
  e.waitUntil(onPush(d));
});

async function onPush(d) {
  const k = d.k;
  if (k !== 'msg' && k !== 'call' && k !== 'missed') return;
  const name = String(d.n || 'Someone').slice(0, 24), from = String(d.f || ''), g = String(d.g || '');
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // A real missed call is saved for the app to merge into its call history when it opens.
  if (k === 'missed' && d.cid) {
    await inboxPut({ cid: String(d.cid), from, g, k: d.v === 'video' ? 'video' : 'voice', ts: d.ts || Date.now() });
    list.forEach(c => c.postMessage({ t: 'inbox' }));
  }
  // The open app already shows its own alert.
  if (list.some(c => c.visibilityState === 'visible')) return;
  const base = { icon: './icon-192.png', badge: './icon-192.png', data: { g, from, k, cid: d.cid || '' }, timestamp: d.ts || Date.now() };
  if (k === 'call') {
    return self.registration.showNotification(name, Object.assign({}, base, {
      body: 'Incoming ' + (d.v === 'video' ? 'video' : 'voice') + ' call',
      tag: 'call-' + from, renotify: true, requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400, 200, 400],
      actions: [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }]
    }));
  }
  if (k === 'missed') {
    return self.registration.showNotification('Missed call', Object.assign({}, base, { body: name, tag: 'call-' + from, renotify: true }));
  }
  // Message text never travels through the push server, so the alert cannot show it.
  return self.registration.showNotification(name, Object.assign({}, base, { body: 'New message', tag: 'msg-' + g, renotify: true, vibrate: [200, 100, 200] }));
}

// Tapping a notification focuses the app and opens the right chat. "Answer" also answers the call when it connects.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {}, g = data.g, answer = e.action === 'answer';
  if (e.action === 'decline') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const w = list.find(c => 'focus' in c);
      if (w) { w.postMessage({ g, a: answer ? 'answer' : '' }); return w.focus(); }
      return self.clients.openWindow('./' + (g ? '#open=' + encodeURIComponent(g) + (answer ? '&a=answer' : '') : ''));
    })
  );
});
