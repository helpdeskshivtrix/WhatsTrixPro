# WhatsTrix 2.1

Private, end-to-end encrypted rooms for chat, voice/video calls, screen sharing, voice notes and files.
Serverless by design: a static site, peer to peer, with everything cached on your own device. An optional small push server adds background alerts.
One app, three ways to use it: **website / installable web app**, **Android APK**, **Windows EXE**.
Look: the locked ShivTrix style (OLED black, royal blue, cyan, gold) with the PdfTrix start-up.

## What is new in 2.1
- **Presence:** green dot = online, gray = offline, phone badge = in a call, "typing…", last seen. Heartbeat detects crashes; brief network drops do not flip anyone offline (6 s grace and automatic reconnect). One tab per identity: a second tab is told to use the first or take over.
- **Photos only while online:** a contact's photo is shown only while that person is online. Offline shows a default silhouette everywhere (lists, header, member cards, popups). Other people's photos are kept in memory only, never saved on your device, and re-sent when they reconnect. Your own photo is saved in your profile.
- **Profile:** tap your name or photo. Preview, choose/remove photo (JPEG/PNG/WebP/GIF up to 8 MB, resized to 192 px and compressed), edit display name.
- **Messages:** clock → ✓ sent → ✓✓ delivered → blue ✓✓ read. A message to someone offline waits in your outbox and is sent once when they reconnect, never twice. Switches for read receipts and typing indicator.
- **Calls:** caller photo and name, Answer / Decline, busy / declined / cancelled / no answer / failed handling, call history with a **Calls** tab and a missed-call badge, toast on return. Calling an offline contact keeps ringing for 45 s and alerts them by push.
- **Background push (optional):** new message, incoming call (with Answer / Decline buttons where the device allows) and missed call, even when the app is closed. Needs the push server below.
- The earlier 2.0 features remain: reply, reactions, edit, delete for everyone, search, pins, Saved messages, links, image viewer, export, Windows and Android apps.

## Files
| Path | Purpose |
| --- | --- |
| `index.html` | The whole app |
| `config.js` | **The few settings you may edit:** push server address, fixed access code, credit link |
| `manifest.json`, `sw.js` | Install as an app, offline cache, push receiver |
| `logo.png`, `icon-*.png`, `icon.svg`, `apple-touch-icon.png` | Logo and icons |
| `vapid.html` | Makes your push keys in the browser |
| `push-server/` | The optional push server (Node), see `push-server/README.md` |
| `render.yaml` | One-click setup of the push server on Render |
| `desktop/`, `tools/`, `.github/workflows/build.yml` | Windows EXE and Android APK builds |
| `TESTING.md` | What was tested and what you should check on real devices |

## Update your site (GitHub web only)
1. In your repository: **Add file → Upload files**, drag in everything from this folder (keep the folders), **Commit changes**. Uploading a file with the same name replaces it.
2. Pages rebuilds in about a minute. Open the site and reload twice (the service worker version changed to `whatstrix-v3`). Update everyone in your rooms: 2.0 devices still connect, but they do not send presence, receipts or call results, and 1.x devices cannot connect at all.
3. To rebuild the Android and Windows apps: **Actions → Build WhatsTrix apps → Run workflow**. Download from **Releases**.

## Turn on background alerts (optional)
Follow `push-server/README.md` (about 10 minutes, free). In short: make keys with `vapid.html`, create a free Upstash database, deploy `render.yaml` on Render, put the server address in `config.js`, then each person opens the bell menu and turns on **Background alerts**.

What works where
- **Android Chrome / installed web app, desktop Chrome, Edge, Firefox:** yes.
- **iPhone / iPad:** only after Share → **Add to Home Screen** and opening it from there (iOS 16.4 or newer).
- **Android APK and Windows EXE:** alert while the app is running. Alerts when fully closed need the installed web app, because those wrappers cannot receive Web Push.
- A browser cannot force a full-screen call screen, play a ringtone in every background state, or wake every device. The call alert stays on screen with Answer / Decline buttons where the system supports them; elsewhere it is a normal notification. A truly native call screen on Android would need a native app with Firebase and Android's call APIs, which is not included.

## Access code
The 4-digit code is the current time as HHMM on your own device clock (24 h), for example `1250` at 12:50; one minute either side is accepted and `12:50` works too. For a fixed code put it in `config.js` (`ACCESS_FIXED: '1250'`). It is a front-door check in client-side code, a deterrent and not real protection.

## Privacy and limits (read this)
- Messages, files and call media are end to end between the two devices. The push server never sees them. A push alert contains only: type, sender number, sender name, chat id.
- **Both people must be online for a message to arrive.** There is no server mailbox. If the recipient is offline your message waits on your device, they get an alert (if push is on), and it is delivered when both of you are online at the same time.
- **No multi-device accounts.** Your identity is created in one browser and cannot be copied out, so there is no sign-in and no sync of profile or history between your own devices. Doing that honestly needs accounts and a server database, which would end the serverless design. Profile, history and call log are stored on the device (use **Export** in the bell menu for a backup).
- Edits, deletes and reactions only reach people who are online at that moment.
- Offline is shown about 6 s after someone closes the app and about 30 s after a crash or lost connection.
- Signaling uses the free public PeerJS server and a free public TURN relay. For reliable use enter your own under status line → Connection details.
- Clearing site data or uninstalling deletes your identity (Connection details has **Reset identity**).
