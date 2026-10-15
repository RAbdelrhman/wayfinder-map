# Signing in to GitHub on the phone

The phone app reads maps from GitHub directly, so it signs in with GitHub's [OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow): the app shows a code, you approve it on github.com, and the app receives a token. There is no redirect URL and no client secret in the app.

The screens are the sign-in direction picked in #223 (S-A: welcome, code, waiting).

## One-time setup: the GitHub OAuth app

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
| Waiting | The app polls `https://github.com/login/oauth/access_token` every `interval` seconds (GitHub sends 5), starting right after the code appears. `slow_down` adds 5 seconds (or uses the new `interval` GitHub sends). A dropped connection is retried on the next tick. |
| Approved | The token is written to secure storage, then the app moves on. If the write fails, the app shows "Couldn't save the token" instead of pretending to be signed in. |
| Stopped | `expired_token`, `access_denied` and GitHub rejections each show one screen with **Get a new code**. **Back** on the code screen cancels and stops polling. |

## Where the token lives

`expo-secure-store` writes it under the key `wayfinder.github.token`: Keychain on iOS (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so a backup restored onto another phone doesn't carry it) and Keystore-backed encrypted preferences on Android. The token is never written to AsyncStorage, logs or the URL. On launch the app reads it back and skips sign-in when it finds one; an unreadable store counts as signed out.

Signing out deletes the stored token on this phone. It can't revoke the token at GitHub, because that call needs a client secret. To revoke it everywhere, remove Wayfinder at <https://github.com/settings/applications>. OAuth app tokens don't expire on their own.

## Code map

- `mobile/src/auth/deviceFlow.ts`: the state machine (`authReducer`) and the polling loop (`runDeviceFlow`), with fetch, clock and sleep injected.
- `mobile/src/auth/tokenStore.ts` and `secureStorage.ts`: the token's key and the SecureStore adapter.
- `mobile/src/auth/AuthProvider.tsx`: React wiring (`useAuth()` gives `state`, `signIn`, `cancel`, `signOut`). Later screens read the token from `state` when its `phase` is `signedIn`.
- `mobile/src/auth/SignInScreen.tsx`: the S-A screens.
- Tests: `bun run test` in `mobile/`.
