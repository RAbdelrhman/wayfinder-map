# Signing in to GitHub on the phone

The phone app reads maps from GitHub directly, so it signs in with GitHub's [OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow): the app shows a code, you approve it on github.com, and the app receives a token. There is no redirect URL and no client secret in the app.

The sign-in screens are the direction picked in #223 (S-A: welcome, code, waiting). Signing out and the Settings page are the design picked in #316 (G-a).

## One-time setup: the GitHub OAuth app

For Ramon's existing personal build, reuse [Wayfinder Map Mobile](https://github.com/settings/applications/3956110)
under the RAbdelrhman account. Device Flow was verified enabled on 2026-10-27,
and sign-in was exercised on the installed Android app. Read its public client ID
there and configure `mobile/.env.local`; do not create another registration just
because a fresh checkout lacks that ignored local file. Existing build and install
records are in [mobile-builds.md](mobile-builds.md).

You do this once, in your own GitHub account. The app needs only the client ID.

1. Open <https://github.com/settings/developers> and choose **OAuth Apps → New OAuth App**.
2. Fill in the form:
   - **Application name:** `Wayfinder` (GitHub shows it on the approval page).
   - **Homepage URL:** the repository, `https://github.com/RAbdelrhman/wayfinder-map`.
   - **Authorization callback URL:** required by the form but unused by the device flow. Use the same URL as the homepage.
3. Tick **Enable Device Flow**. Without it GitHub answers every request with `device_flow_disabled`, and the app shows "GitHub turned this down".
4. Choose **Register application**, then copy the **Client ID**. Don't generate a client secret; the device flow doesn't use one, and an app that ships no secret has none to leak.
5. Give the client ID to the app as `EXPO_PUBLIC_GITHUB_CLIENT_ID`:
   - **Running locally:** copy `mobile/.env.example` to `mobile/.env.local` and paste the ID. Restart `bun run start` so Metro picks it up.
   - **EAS builds:** add `EXPO_PUBLIC_GITHUB_CLIENT_ID` as an EAS environment variable with plain-text visibility ([EAS environment variables](https://docs.expo.dev/eas/environment-variables/)). The client ID is public and ends up in the app bundle by design. The build profiles themselves are #233.

The app asks for the `repo` scope: private repositories' issues (where maps live) need it, and a narrower scope can't read them. Any token can read the signed-in user's public profile, which is enough to show who is signed in.

If a map lives in an organization that restricts OAuth apps, an owner has to approve Wayfinder at `https://github.com/organizations/<org>/settings/oauth_application_policy`, or you can request access on the approval page.

## How the flow runs

| Step | What happens |
|---|---|
| Welcome | **Sign in with GitHub** posts the client ID and scope to `https://github.com/login/device/code`. |
| Code | GitHub returns an 8-character code, valid for 15 minutes. **Copy code and open GitHub** copies it and opens `github.com/login/device`. |
| Waiting | The app polls `https://github.com/login/oauth/access_token` every `interval` seconds (GitHub sends 5), starting right after the code appears. Every request gives up after 15 seconds and is retried on the next tick. `slow_down` adds 5 seconds (or uses the new `interval` GitHub sends). A dropped connection or a 5xx is retried the same way. |
| Approved | The app asks `https://api.github.com/user` who owns the token (login and name), writes the session to secure storage, then moves on. If GitHub can't say who it is, the app shows "Couldn't reach GitHub"; if the write fails it shows "Couldn't save the token". It never pretends to be signed in. |
| Stopped | `expired_token`, `access_denied` and GitHub rejections each show one screen with **Get a new code**. **Back** on the code screen cancels and stops polling. A request that GitHub answers with a 5xx counts as "Couldn't reach GitHub", not as a bad setup. |

## Where the token lives

`expo-secure-store` writes one JSON value under the key `wayfinder.github.session`: the token, the GitHub login and name (for Settings and the sign-out notice), and when you signed in. Keychain on iOS (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so a backup restored onto another phone doesn't carry it); Keystore-backed encrypted preferences on Android. The token is never written to AsyncStorage, logs or a URL. On launch the app reads the session back and skips sign-in when it finds one; an unreadable or malformed store counts as signed out.

## Signing out

Avatar on Maps → **Settings** → **Sign out** → the alert "Sign out? Wayfinder will forget @login's GitHub sign-in on this phone." Confirming deletes the stored session and returns to the welcome screen, which says "Signed out of @login." Signing out can't revoke the token at GitHub, because that call needs a client secret. To revoke it everywhere, remove Wayfinder at <https://github.com/settings/applications>. OAuth app tokens don't expire on their own.

## Code map

- `mobile/src/auth/deviceFlow.ts`: the state machine (`authReducer`) and the polling loop (`runDeviceFlow`), with fetch, clock and sleep injected.
- `mobile/src/auth/sessionStore.ts` and `secureStorage.ts`: the session's key and shape, and the SecureStore adapter.
- `mobile/src/auth/AuthProvider.tsx`: React wiring (`useAuth()` gives `state`, `signIn`, `cancel`, `signOut`). Later screens read the token from `state.session.token` when `state.phase` is `signedIn`.
- `mobile/src/auth/SignInScreen.tsx`: the S-A screens. `MapsScreen.tsx` (only the top bar until #229), `SettingsScreen.tsx` and `SignedIn.tsx` (the switch between them) are the signed-in side.
- Tests: `bun run test` in `mobile/`.
