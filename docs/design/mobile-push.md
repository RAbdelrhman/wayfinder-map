# Push notifications for the mobile app: delivery path and trigger

Research for [#219](https://github.com/RAbdelrhman/wayfinder-map/issues/219) on map [#217](https://github.com/RAbdelrhman/wayfinder-map/issues/217). Sources were read on 2026-10-03.

Short answer: Expo Push, sent by the desktop. See [Recommendation](#recommendation) at the end.

## Push services

### Expo Push Service

- Endpoint `POST https://exp.host/--/api/v2/push/send`, up to 100 messages per request, 600 notifications per second per project. Receipts come from `/push/getReceipts`. Check them about 15 minutes after sending; they're cleared after 24 hours. ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/))
- A `DeviceNotRegistered` receipt means the token is dead and should be dropped. ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/))
- `ttl` defaults to "each provider's own default - 4 weeks". `collapseId`, `tag` and `threadId` control coalescing, replacement and grouping. `priority: 'high'` maps to APNs priority 10. ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/))
- Enhanced security: "You can require any push requests to be sent with a valid access token". Requests without it get `UNAUTHORIZED`. ([Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/))
- "There is no cost associated with sending notifications through Expo push notification service." Expo "doesn't store the contents of push notifications any longer than it takes to deliver them." ([FAQ](https://docs.expo.dev/push-notifications/faq/))
- Tokens stay the same across app upgrades, and on iOS across reinstall. On Android a reinstall may change the token, so the app should re-register its token on every launch. `getDevicePushTokenAsync` returns the native token if we ever leave Expo's service. ([FAQ](https://docs.expo.dev/push-notifications/faq/))
- Setup needs a paid Apple Developer account for iOS credentials, FCM V1 credentials for Android, and `projectId` for the token. ([Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/))

### FCM and APNs directly

- FCM HTTP v1: `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`, authorised with "a short-lived OAuth 2.0 access token derived from a service account". ([FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api)) The desktop would need the service account key and the Google auth library to mint tokens.
- APNs: HTTP/2 requests to `api.push.apple.com`, authorised with a JWT signed by the `.p8` key, one request per device token. ([Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns))
- Going direct buys independence from Expo and finer-grained control over each platform's options. ([Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)) Needs-you alerts don't need that control. Going direct costs two credential sets on every desktop, two clients, and our own handling of per-platform tokens and errors. For one user with a couple of devices that's a bad trade.

### Phone offline or asleep

Both services may hold an alert for a phone that is off, subject to expiry and replacement:

- FCM keeps a message for an offline device until it reconnects, then discards it once its lifetime runs out. The default and maximum lifetime is 4 weeks (2,419,200 s); a `ttl` of 0 is never stored. ([Set the lifespan of a message](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan))
- APNs "may store the notification for 30 days or less, depending on the date you specify in the `apns-expiration` header". It "stores only one notification per bundle ID" on each device, usually the latest. ([Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns))

So an iPhone that was off for a while gets **at most one** stored alert, usually the newest, and an expired one may never arrive. The app has to rebuild the full list from its own inbox and GitHub when it opens. It can't treat pushes as the record.

## Who sends: the trigger options

### What each alert kind needs

The desktop's alert kinds (`src/notificationTypes.ts`) and where their facts live:

| Kind | Source | Visible to a GitHub webhook? |
| --- | --- | --- |
| `threadWaiting` (T3 Code needs you) | T3 Code thread state (`handOffTransitionNotifications`, `src/ui/notifications.ts`) | No |
| `handOffError` | T3 Code / hand-off status (`src/autoMapService.ts`, `src/ui/notifications.ts`) | No |
| `unblocked` | Map diff (`ticket-next` from `diffMap`) | Partly. `issues.closed` arrives, but no event says "your dependent is now unblocked". The service would have to read the closed issue's `blocking` list with a stored token. |
| `failingCi` | PR checks | Yes: `check_suite` / `check_run` `completed`, `workflow_run` |
| `reviewReady` | PR state + checks + review | Yes, by combining `pull_request`, `pull_request_review` and check events, which means keeping PR state on the server |
| `prototypeReady` | Prototype branch push or hand-off branch | Partly: `push` to a prototype branch |
| `stalled` | N days with no commit, PR, issue activity or live hand-off on a claimed ticket, or a failed hand-off with no retry (`src/stalled.ts`) | No. It's the absence of events, so it needs a scheduled job, and dead hand-offs are desktop state. |

Webhook facts: `issue_dependencies` (`blocked_by_added`, `blocked_by_removed`, …) and `sub_issues` events exist. Repository webhooks get only `completed` for check suites and `created`/`completed` for check runs. ([Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)) Deliveries are signed with `X-Hub-Signature-256` ([Validating deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)). "GitHub does not automatically redeliver failed webhook deliveries", and a reply slower than 10 seconds counts as a failure ([Handling failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)). Recent deliveries can be redelivered for 3 days in the UI ([Redelivering webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)).

### Option A: the desktop sends (recommended)

The desktop already derives every alert kind and already shows a native notification for each one (`showDesktopNotification`, `src/desktop/main.ts`). Sending a push is one more `fetch` to `exp.host` at the same point, gated by the same per-kind settings (`NotificationSettingsStore`).

Today's code has two gaps the push task (#234) must close:

1. **Most alerts are derived in the page.** `publishNotification` (`src/ui/app.ts`) runs in the renderer, so `threadWaiting`, `failingCi`, `reviewReady`, `prototypeReady` and `stalled` reach the user only while a Wayfinder page is loaded. The Electron window hides rather than closes (`src/desktop/main.ts`), so this mostly holds while the app runs. `MapWatcher` polls a map only while it has a listener. A page is one listener; `AutoMapService` is the other, and it watches maps with Auto on without a page (`src/autoMapService.ts`, `init` and `watch`). Maps with neither aren't watched. Pushes need the derivation, and a listener for every map the user wants alerts from, in the server or main process.
2. **Deduplication.** With one sender, send each inbox ID (`map:…`, `handoff:…:waiting:…`) once. Don't pass the raw ID as Expo's `collapseId`: APNs caps `apns-collapse-id` at 64 bytes, and `handoff:` and `prototype:` IDs can be longer. Use a short hash of the ID instead.

Cost: no hosting, no new GitHub token, and the alert logic stays in one place.

### Option B: a GitHub webhook to a small hosted service

A service (for example a Convex HTTP action at `https://<deployment>.convex.site`, which Convex documents for "receiving webhooks from external applications" ([HTTP actions](https://docs.convex.dev/functions/http-actions))) receives repository webhooks, rebuilds map state, and pushes through Expo.

What it would need: hosting, a webhook and secret on every repository with maps (or a GitHub App), a stored GitHub token to read dependency lists and PR state, the Expo access token, the phone's push token, and a second implementation of `diffMap` and the CI/review rules. Because GitHub doesn't retry failed deliveries, the service also has to reconcile against the API now and then to avoid missing alerts during its own downtime.

And it still can't send `threadWaiting` or `handOffError`, the alerts the user most needs on the phone.

### Option C: both

The desktop sends T3 Code alerts, and the service sends GitHub alerts. Like B, it sends GitHub alerts on time while the PC is off, and unlike B it keeps the T3 Code alerts. If both senders can see GitHub events, they need a dedupe key both can compute from the event itself. Today's map inbox IDs won't do: they contain the watcher's own event number and the time it noticed the change. The simpler rule is that GitHub alerts come only from the service. Worth doing only if Option A's late GitHub alerts become a real problem.

## While the PC is asleep or off

- On Modern Standby PCs, "Desktop apps are stopped by the Desktop Activity Moderator (DAM)" while the system sleeps. Only Store-app background tasks keep running. ([Modern Standby vs S3](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/modern-standby-vs-s3)) S3 sleep and shutdown stop everything. Wayfinder and T3 Code are both desktop apps, so neither polls nor runs sessions while the PC sleeps.
- Electron emits `powerMonitor` `suspend` and `resume` on all platforms ([powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)). Nothing in `src/` listens for them yet. The existing `MapWatcher.catchUp` won't help as is: it only reads maps restored from disk (`needsCatchUp`), not maps that were running when the PC slept. Without a hook, the watcher's normal timers pick changes up after wake, normally within one interval (2 min), longer when it is backing off after failures or rate limits. A `resume` hook that reads every watched map at once is a small addition for #234.

What that means for each option:

| Alert | Option A (desktop) while PC sleeps | Option B/C (webhook) while PC sleeps |
| --- | --- | --- |
| T3 Code needs you / hand-off failed | Can't happen: sessions are paused too | Can't happen, and B could never send it anyway |
| CI failed, review ready, prototype pushed | Sent late, on wake | Sent on time |
| Ticket unblocked by a close made elsewhere | Sent late, on wake | Sent on time, if the service reads dependencies |
| Stalled | Can cross its N-day threshold while the PC sleeps; sent late, on wake | Needs a scheduled job, and can't see dead hand-offs |

Following maps on the phone still works with the PC off, because the phone reads GitHub directly (map #217 decision). The user can open the app and see current state even when no push came.

## Open points for #222 and #234

- Where the Expo access token lives on the desktop (OS keychain vs. Wayfinder's settings file).
- Whether to keep watching every open map in the background (GitHub budget per #122: about 0 points an hour when nothing changes) or only maps with live hand-offs.
- Whether the desktop should push while the user is at the desk, or only after its window has been hidden or idle for a while.

## Recommendation

Send pushes through the **Expo Push Service**, and have the **desktop** send them. Don't build a hosted GitHub-webhook service for v1.

- Expo Push gives one token format and one HTTPS call for both iOS and Android, costs nothing, and still uses APNs and FCM underneath. That means the Apple and Google credentials are needed either way. Going straight to FCM and APNs adds two auth schemes and a token store on our side and saves nothing.
- The desktop is the only place that can see the most important needs-you alert. `threadWaiting` ("T3 Code needs you") and `handOffError` come from T3 Code's local thread state. GitHub never sees them, so a webhook service could never send them.
- While the PC is asleep, T3 Code isn't running, so no session can start waiting on you. The alerts a sleeping PC misses are the GitHub-side ones: CI finishing, a review landing, a blocker closed from another device. The desktop can catch these up on wake and send them as late pushes. That needs a `powerMonitor` `resume` hook, which doesn't exist yet (see [While the PC is asleep or off](#while-the-pc-is-asleep-or-off)). A webhook service would deliver them on time, but it costs hosting, a webhook per repository, a stored GitHub token and a second copy of the alert logic. That can be a later ticket if late pushes turn out to hurt.

### What it needs

| Need | For | Notes |
| --- | --- | --- |
| Apple Developer Program membership (paid) | iOS push at all | Free accounts don't get the Push Notifications capability. Already on the map's fog ("Setting up the Apple developer account"). |
| APNs auth key (`.p8`) | iOS | EAS generates and stores it during the first iOS development build. |
| Firebase project (free) + `google-services.json` | Android | Referenced from `app.json` via `googleServicesFile`. |
| FCM V1 service account key (JSON) | Android | Uploaded to EAS, not shipped to the desktop. |
| Expo account + EAS project ID | Both | `getExpoPushTokenAsync({ projectId })` ties tokens to the project. |
| Expo access token with "enhanced security for push" turned on | Desktop sender | Without it, anyone holding a phone's push token can push to it. The desktop keeps the token next to its other secrets and sends it as `Authorization: Bearer …`. |
| A development build (EAS Build), not Expo Go | Testing | Expo's setup guide builds with EAS. Personal builds are already planned (#233). |
| Hosting | None | The desktop calls `exp.host` directly. |

The phone sends its Expo push token to the desktop during pairing. Pairing is #218 and #230; this ticket assumes that channel exists.
