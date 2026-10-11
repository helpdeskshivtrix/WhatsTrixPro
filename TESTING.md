# WhatsTrix 2.1 testing checklist

"Auto" = verified by automated tests with real browsers (two or three separate browser profiles talking to each other through a local PeerJS server, real WebRTC with fake microphone/camera). "Manual" = needs real devices and the real push services; please try these after deploying.

## 1. Presence
| Check | Result |
| --- | --- |
| Check | Result |
| --- | --- |
| Two users join and see each other online (green dot) | Auto, pass |
| Online contact's saved photo is visible | Auto, pass |
| Contact closes the app: gray dot and default silhouette, photo gone from every list, header, member card and from the page itself | Auto, pass (about 6 s after a normal close; about 30 s after a crash or force-kill, found by heartbeat) |
| Photo is not kept anywhere on the other device while the person is offline (not even in saved contacts) | Auto, pass |
| Contact returns: green dot and the saved photo reappear | Auto, pass |
| "Last seen" shown for offline contacts | Auto, pass |
| Typing indicator (list and header) | Auto, pass |
| Phone indicator while in a call | Auto, pass (model state; call screen covers the lists while talking) |
| Brief network drop does not flip a contact to offline (6 s grace and automatic reconnect) | Auto, pass for the mechanism; exact timing depends on your network |
| Same identity opened in two tabs: second tab refuses to go online, "Use this tab" hands over cleanly | Auto, pass |
| Presence across two real devices | Manual |

## 2. Profile
| Check | Result |
| --- | --- |
| Upload, preview before saving, save | Auto, pass |
| Wrong file type rejected with a message | Auto, pass |
| Photo resized to 192 px and compressed, name editable, remove photo | Auto/code, pass |
| Photo and name persist after refresh and browser restart | Auto, pass |
| Sync across your own devices | Not possible without accounts and a server (see limits) |

## 3. Messaging
| Check | Result |
| --- | --- |
| Real-time delivery, reply, reactions, edit, delete-for-everyone | Auto, pass |
| Sent / delivered / read ticks (clock while waiting) | Auto, pass |
| Message written while the other person is offline is queued, sent once on reconnect, never duplicated | Auto, pass |
| Read receipts and typing indicator can be switched off | Code, switch present (Auto: default on works) |
| Unread badges, history after refresh | Auto, pass |

## 4. Calls
| Check | Result |
| --- | --- |
| Outgoing and incoming voice call, real audio track both ways | Auto, pass |
| Caller name and avatar on the incoming screen, Answer and Decline | Auto, pass |
| Declined: caller is told and it is logged on both sides | Auto, pass |
| Caller hangs up while ringing: ringing screen closes, missed call logged with badge | Auto, pass |
| Missed-call list with times, badge clears when viewed, toast when you return | Auto, pass |
| Offline callee gets an incoming-call push, the caller keeps ringing up to 45 s, then a missed-call push replaces it | Auto up to the push service (see 5) |
| Busy handling | Code written, not exercised in a test |
| Video call and screen share | Existing features, camera path works with the fake camera; screen share was checked on the Windows app |

## 5. Push notifications
| Check | Result |
| --- | --- |
| Signed registration accepted, forged/edited/replayed/impersonated requests refused | Auto, pass |
| Only contacts can alert you (allow-list) | Auto, pass |
| Encrypted payload reaches the push service with VAPID auth, TTL, urgency, topic; no message text inside | Auto, pass (mock push service that decrypts it) |
| Duplicate alerts suppressed, expired subscriptions deleted, retries | Auto/code, pass |
| Subscriptions survive server restarts with Redis storage | Auto, pass |
| Service worker: call notification with Answer/Decline, missed call replaces it, message shows sender only, no double alert when the app is open, tap opens the right chat | Auto, pass (what is handed to the notification API) |
| Real delivery through Google/Mozilla/Apple push services to a closed app | **Manual** |
| Notification actions, vibration and wake-up on real Android / iPhone / desktop | **Manual** |

## 6. Existing features
| Check | Result |
| --- | --- |
| QR/link/number join, groups, group invite, saved messages, search, pins, files, voice notes | Auto, pass (QR scanning with a real camera: manual) |
| Windows app (Electron) boots, encrypts, saves identity | Auto, pass |
| APK and EXE build on GitHub | Built before; rebuild after uploading these files |

## 7. Security
| Check | Result |
| --- | --- |
| Unauthorized people cannot read rooms or messages | Messages are accepted only from members over an authenticated, encrypted channel (existing design, re-checked in tests). Anyone who knows your number can send a join request, like adding a contact. |
