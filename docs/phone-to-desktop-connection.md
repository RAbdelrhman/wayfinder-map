# How the phone reaches the desktop

Research for [#218](https://github.com/RAbdelrhman/wayfinder-map/issues/218) on the
[mobile app map](https://github.com/RAbdelrhman/wayfinder-map/issues/217). Checked on
2026-10-03 against Wayfinder 0.2.11 and T3 Code's `main` at `88744f3`.

The phone reads maps from GitHub on its own. It needs the desktop for two things only:
starting a ticket, which goes through Wayfinder's server, and watching the session it
starts, which lives in T3 Code. This doc compares the ways a phone can reach those two
servers from anywhere.

## What sits on the desktop today

**Wayfinder** listens on `127.0.0.1:4478` (`src/config.ts`). It has no login. Its only
guard is that requests must come from this machine: `hostAllowed` and `originAllowed`
in `src/server.ts` reject any Host or Origin that is not loopback. That is the right
shape for a local page and the wrong one for a phone. The same server also answers
`/api/shutdown`, `/api/auth/*` (the user's GitHub login) and `/api/updater/install`, so
it cannot simply be opened to the network as it is.

**T3 Code** runs its own HTTP and WebSocket server, by default on port 3773. Unlike
Wayfinder, it already has a full remote story
([remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md),
[remote architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md)):

- Every route authenticates with the environment's own scoped sessions, issued by
  one-time pairing links (QR or URL). Bearer and DPoP tokens are supported, and
  WebSocket upgrades use short-lived tickets so long-lived tokens stay out of URLs
  ([environment auth](https://github.com/pingdotgg/t3code/blob/main/docs/internals/environment-auth.md)).
- It can be reached over the LAN (**Network access**), over **Tailscale HTTPS**, over
  SSH, or through **T3 Connect**, its hosted relay built on Cloudflare tunnels.
- It ships its own Expo app (`apps/mobile`, Expo 58), which pairs by QR and gets push
  notifications through T3 Connect.

On this machine T3 Code's `server-runtime.json` already reports `host: 0.0.0.0` with
`serverExposureMode: network-accessible`, so LAN pairing is switched on. Neither
`tailscale` nor `cloudflared` is installed.

So T3 Code traffic already has secure routes. The open problem is Wayfinder, and
whether one route can carry both.

## The options

### 1. Direct LAN pairing (QR code)

Wayfinder would listen on the LAN address as well, show a QR code holding its address
and a one-time secret, and swap that secret for a per-device token. T3 Code already
works this way.

- **Security.** Plain HTTP on the LAN unless the desktop ships its own certificate,
  which a phone will not trust without extra setup. Android blocks cleartext HTTP by
  default for apps targeting API 28 and up
  ([Android network security config](https://developer.android.com/privacy-and-security/security-config)),
  and iOS needs App Transport Security exceptions plus the local-network permission.
  T3 Code's app turns on `NSAllowsArbitraryLoads`, `NSLocalNetworkUsageDescription`
  and an Android cleartext plugin to make this work (`apps/mobile/app.config.ts`).
  Anyone on the same Wi-Fi can see the traffic.
- **Setup.** Scan one QR code. Nothing to install.
- **Cost.** Free.
- **Offline and moving.** Works only while the phone is on the same network. It stops
  the moment the phone leaves home Wi-Fi, and a DHCP change to the desktop's address
  breaks saved pairings. PC asleep means unreachable.
- **Verdict.** Fails the "from anywhere" requirement. Useful only as a first pairing
  step.

### 2. Tailscale (private network plus Tailscale Serve)

Both devices join the user's tailnet. On the desktop, `tailscale serve` puts an HTTPS
address such as `https://pc.tailnet.ts.net` in front of a loopback port.

- **Security.** Serve is reachable only from devices on the tailnet
  ([Tailscale Serve](https://tailscale.com/kb/1312/serve)). It provisions real TLS
  certificates for the tailnet name, so the phone talks HTTPS with no ATS or cleartext
  exceptions. Serve adds `Tailscale-User-Login` and related identity headers and strips
  any copies a client sends, which gives Wayfinder a second check on who is calling.
  Tailscale recommends the service keep listening on localhost so nobody can go around
  Serve, which fits Wayfinder's loopback-only server.
- **Setup.** Install Tailscale on the PC and phone and sign in to both with the same
  account. Turn on HTTPS certificates for the tailnet. Then one `tailscale serve`
  command per server, which Wayfinder could run for the user. T3 Code already does
  this itself with its **Tailscale HTTPS** toggle or `t3 pair --tailscale`.
- **Cost.** The Personal plan is free: up to 6 users and unlimited personal devices
  ([Tailscale pricing](https://tailscale.com/pricing)).
- **Offline and moving.** Works across networks. Connections start through Tailscale's
  DERP relays, upgrade to direct when NAT allows it, and drop back to relayed when the
  network changes ([connection types](https://tailscale.com/kb/1257/connection-types)).
  The address stays the same. PC asleep means unreachable. The phone must keep the
  Tailscale VPN switched on, and iOS and Android run only one VPN at a time
  ([other VPNs](https://tailscale.com/kb/1105/other-vpns)).
- **Verdict.** Secure, free, and reachable from anywhere. One stable HTTPS address can
  front both Wayfinder and T3 Code.

### 3. Cloudflare Tunnel with Cloudflare Access

`cloudflared` on the desktop opens outbound connections to Cloudflare, which publishes
a public hostname that forwards to a loopback port
([Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)).

- **Security.** No inbound ports, real TLS. But the hostname is on the public internet:
  "accessible to anyone on the internet" until an Access application is put in front of
  it ([create a tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)).
  A native app has to send a service token in `CF-Access-Client-Id` and
  `CF-Access-Client-Secret` headers, and the token expires after its set lifetime,
  one year by default ([service tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/)).
  Cloudflare terminates TLS, so it sees the traffic in clear.
- **Setup.** A domain added to Cloudflare, a named tunnel, a published route, an Access
  application and policy, and a service token copied to the phone. Quick Tunnels skip
  the domain but get a new random hostname each time, have no uptime guarantee, cap
  in-flight requests at 200, and do not support Server-Sent Events
  ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)),
  so they are out.
- **Cost.** Tunnel and Access are free for up to 50 users
  ([Cloudflare Access](https://www.cloudflare.com/products/zero-trust/access/)), plus
  the domain.
- **Offline and moving.** The phone needs no VPN and can be on any network. PC asleep
  means the tunnel goes down and the hostname returns errors.
- **Verdict.** Works, but with the most setup and a public attack surface. It is what
  T3 Connect automates (option 5).

### 4. A Wayfinder-hosted relay

The desktop opens an outbound WebSocket to a small cloud relay (for example a
Cloudflare Worker), and the phone talks to the relay.

- **Security.** Only as good as what we build: the relay must not be able to read or
  forge commands, so it needs end-to-end encryption or signed requests between paired
  keys. T3 Code's own relay docs show how much care this takes: DPoP-bound bootstrap
  credentials, replay guards, signed responses, and an explicit note that a compromised
  relay signing key is not harmless
  ([T3 Connect](https://github.com/pingdotgg/t3code/blob/main/docs/internals/t3-connect.md)).
- **Setup.** For the user, the smoothest of all: sign in and scan once. For us, a
  hosted service to build, secure and run.
- **Cost.** Hosting is small, but it is a service with uptime and an account system to
  maintain. That runs against the map's choice to keep tickets on the desktop and
  build personal builds.
- **Offline and moving.** Works from anywhere. The relay is always up, so it can tell
  the phone "desktop offline" instead of timing out, and could queue a start until the
  PC wakes.
- **Verdict.** Best experience, heaviest build. Not justified while T3 Connect and
  Tailscale exist.

### 5. T3 Code's own remote stack (pairing, Tailscale HTTPS, T3 Connect)

The phone talks to T3 Code directly with a paired session, using whichever route T3
Code offers.

- **Security.** The strongest of the options for T3 traffic, because the environment
  enforces scoped sessions on every route and the T3 Connect relay never sees the
  session token (see above).
- **Setup.** Already done for LAN on this machine. T3 Connect is a sign-in plus a toggle
  in **Settings → Connections**.
- **Cost.** No price is published in T3 Code's docs. Its relay pays Cloudflare per
  tunnel and reclaims idle ones, and has a per-account `environment_link_limit_exceeded`
  limit ([remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md#t3-connect-troubleshooting)).
- **Offline and moving.** T3 Connect works from any network with no VPN on the phone.
  When the host sleeps, the relay removes the tunnel after five to ten minutes and
  rebuilds it on wake with the same address, so no re-pairing. It is also the only route
  that gives background push: "a direct or Tailscale connection alone does not enable
  push notifications"
  ([mobile notifications](https://github.com/pingdotgg/t3code/blob/main/docs/user/mobile-notifications.md)).
- **The catch.** It reaches T3 Code only. T3 Connect's tunnels "expose only a validated
  loopback HTTP origin", meaning T3 Code's own server, so Wayfinder cannot ride on it.
  Our app would also have to speak T3 Code's internal pairing, DPoP and WebSocket RPC
  protocol, which is not published as a stable API; its docs tell clients to check
  advertised capabilities rather than assume a version.
- **Verdict.** The right way to reach T3 Code, and the reason T3 Code needs no new
  plumbing. Not a way to reach Wayfinder.

## Side by side

| | LAN pairing | Tailscale | Cloudflare Tunnel | Own relay | T3 Code remote |
|---|---|---|---|---|---|
| Reaches Wayfinder | Yes, after changes | Yes, after changes | Yes, after changes | Yes, after building it | No |
| Reaches T3 Code | Yes, built in | Yes, built in | Yes | Yes | Yes, built in |
| Works away from home | No | Yes | Yes | Yes | Yes (T3 Connect) |
| Transport | HTTP on LAN | HTTPS, tailnet only | HTTPS, public hostname | Ours to design | HTTPS, scoped sessions |
| Phone setup | Scan QR | Tailscale app, VPN on | Paste service token | Sign in, scan | Scan QR or sign in |
| Desktop setup | None | Tailscale, one command | Domain, tunnel, Access | None for the user | Toggle in T3 Code |
| Cost | Free | Free (Personal) | Free + domain | Hosting + upkeep | Unpublished |
| PC asleep | Unreachable | Unreachable | Errors from Cloudflare | Relay says offline | Tunnel rebuilt on wake |
| Network change | Breaks | Stays connected | Stays connected | Stays connected | Stays connected |

No option makes a sleeping Windows PC do work. Every route needs the desktop awake
with Wayfinder and T3 Code running. T3 Code's background service does not run on
Windows ([background service](https://github.com/pingdotgg/t3code/blob/main/docs/user/background-service.md)),
so on this machine both are desktop apps.

## Recommendation

**Use Tailscale as the route to the desktop, with a QR pairing token on top.**

1. Wayfinder adds a small remote endpoint that stays on loopback and is published with
   `tailscale serve` on its own HTTPS port. It answers only what the phone needs:
   starting a ticket, its hand-off state, and its event stream. Never `/api/shutdown`,
   `/api/auth/*` or the updater.
2. Each phone pairs once by scanning a QR code on the desktop that holds the tailnet
   address and a one-time secret. The secret is swapped for a per-device token the
   desktop can list and revoke. Wayfinder also checks the `Tailscale-User-Login` header
   against the desktop's own tailnet login, so a token alone is not enough.
3. For T3 Code, the phone uses T3 Code's own Tailscale HTTPS pairing. The same tailnet
   carries both, with one app on the phone to set up.
4. Keep T3 Connect in reserve. It is the only route with background push and the
   cleanest sleep and wake behaviour, but it covers T3 Code alone. Whether pushes come
   from it is [#219](https://github.com/RAbdelrhman/wayfinder-map/issues/219)'s
   question, and how the phone watches a T3 thread is
   [#220](https://github.com/RAbdelrhman/wayfinder-map/issues/220)'s. The final choice
   belongs to the grilling ticket
   [#222](https://github.com/RAbdelrhman/wayfinder-map/issues/222).

Why Tailscale: it is free, the phone gets real HTTPS with no cleartext exceptions,
nothing is on the public internet, it survives network changes, and T3 Code already
supports it. Cloudflare Tunnel needs a domain and a public hostname guarded by a
long-lived secret. A relay of our own is a service to build and run. LAN pairing does
not leave the house.

## Open risks

- **The phone must keep the Tailscale VPN on.** iOS and Android allow one VPN at a
  time, so a user with a work VPN cannot run both. With the VPN off, starting and
  watching fail. The app needs a clear "can't reach your desktop" state.
- **A sleeping PC is unreachable.** Nothing in this design wakes it. Starting a ticket
  while the PC sleeps either fails or needs a queue somewhere, which this design has
  none of. The user may need a "don't sleep while plugged in" power plan.
- **Wayfinder has no auth today.** The remote endpoint is new attack surface on a
  server that runs `gh` with the user's login and drives T3 Code. It must be a narrow
  allowlist with its own tests, not the existing server with the loopback checks
  removed.
- **Push needs something else.** Tailscale gives no background push. If pushes must
  come from T3 Connect, the user ends up running both Tailscale and T3 Connect.
- **T3 Code's protocol is internal.** Watching sessions means following a protocol
  that can change between T3 Code releases. #220 should check how stable it is.
- **Not yet tried on this machine.** Tailscale is not installed here, and nothing
  above has been run end to end on Windows. The desktop ticket
  [#230](https://github.com/RAbdelrhman/wayfinder-map/issues/230) should start with a
  spike: install Tailscale, run `tailscale serve` in front of a loopback port, and open
  it from the phone.
