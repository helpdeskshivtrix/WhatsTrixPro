/* WhatsTrix for Windows (Electron). Serves the same index.html from a secure custom origin,
   so encryption, camera, microphone, notifications and screen sharing all work offline-first. */
const { app, BrowserWindow, protocol, net, session, shell, desktopCapturer, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const WWW = path.join(__dirname, 'www');
let win = null;

// Only one copy may run: the identity (and its network address) is the same for every window.
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (!p || p === '/') p = '/index.html';
      const file = path.normalize(path.join(WWW, p));
      if (!file.startsWith(WWW)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });

    const ses = session.defaultSession;
    const OK = ['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'];
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(OK.includes(permission)));
    ses.setPermissionCheckHandler((wc, permission) => OK.includes(permission));
    // Screen sharing in calls: share the primary screen.
    ses.setDisplayMediaRequestHandler(async (req, cb) => {
      try { const s = await desktopCapturer.getSources({ types: ['screen'] }); cb(s[0] ? { video: s[0] } : {}); }
      catch (e) { cb({}); }
    });

    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1200, height: 800, minWidth: 360, minHeight: 520,
      backgroundColor: '#000000', title: 'WhatsTrix', autoHideMenuBar: true,
      icon: path.join(WWW, 'icon-512.png'),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    win.loadURL('app://whatstrix/index.html');
    const external = (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); };
    win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); external(url); } });
    win.on('closed', () => { win = null; });
  });

  app.on('window-all-closed', () => app.quit());
}
