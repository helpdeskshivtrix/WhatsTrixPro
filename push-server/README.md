# WhatsTrix push server

Small relay that lets WhatsTrix alert people whose app is closed (new message, incoming call, missed call).
It keeps each person's push subscription and forwards alerts. It never sees message text, photos or call audio.

What it knows: a person's 12-digit number, display name, the numbers on their contact allow-list, and their browser's push address.
What an alert carries: type (message / call / missed), sender number, sender name, chat id. Nothing else.

## Security model
- Every request is signed with the private key behind the sender's WhatsTrix number. The server recomputes the number from the public keys, so nobody can act as someone else.
- Requests older than 2 minutes or reused are refused (replay protection). Rate limits: 40 per minute per sender, 120 per minute per recipient.
- You can only alert someone who put your number on their allow-list (their contacts). Strangers get the same silent "0 sent" answer as unknown numbers, so numbers cannot be probed.
- Dead subscriptions (HTTP 404/410 from the browser's push service) are deleted automatically. Temporary errors are retried up to 3 times with backoff.

## Deploy on Render (web only, free plan)
1. Make two free accounts if you do not have them: **render.com** (sign in with GitHub) and **upstash.com**.
2. **Keys:** open `https://YOURNAME.github.io/WhatsTrix/vapid.html`, press **Generate new keys**, keep that tab open.
3. **Database:** on Upstash create a **Redis** database (any region, free). On its page copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   Why: free hosts wipe their disk whenever the server sleeps, which would delete every subscription. Redis keeps them.
4. **Server:** on Render choose **New → Blueprint**, select your WhatsTrix repository, then **Apply**. When it asks, paste the four values (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). Change `ALLOWED_ORIGINS` to your own `https://YOURNAME.github.io` if different.
5. When it says **Live**, open `https://YOUR-SERVICE.onrender.com/health`. You should see `{"ok":true}`.
6. In GitHub edit `config.js`: set `PUSH_URL: 'https://YOUR-SERVICE.onrender.com'`. Then edit `sw.js` and change `whatstrix-v3` to `whatstrix-v4`. Commit both.
7. Open the site, reload twice. Tap the bell, then **Background alerts → Turn on**, and allow notifications. Every person who wants alerts does this once on their own device.

Render's free plan puts the server to sleep after 15 minutes without traffic. The first alert after a quiet spell can arrive up to about a minute late while it wakes up. A paid plan, or Fly.io / Railway running the same code (`npm install`, `node server.js`), removes that.

## Settings (environment variables)
| Name | Purpose |
| --- | --- |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | Your push keys (from `vapid.html`). Changing them makes everyone re-subscribe by opening the app once. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Persistent storage (recommended). |
| `ALLOWED_ORIGINS` | Comma-separated list of websites allowed to call the server. Default `*`. |
| `VAPID_SUBJECT` | `mailto:` address push services can contact. |
| `DATA_FILE` | JSON file used when Redis is not set (needs a persistent disk). |
| `PORT` | Set by the host. |

## Run it yourself
```
cd push-server
npm install
VAPID_PUBLIC=... VAPID_PRIVATE=... node server.js
```
