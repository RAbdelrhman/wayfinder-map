# Mobile builds and phone installation

Read this file before telling Ramon that a mobile build does not exist. Design
prototypes, native implementation, and an APK installed on a phone are separate
deliverables. A closed prototype ticket does not mean its native screens shipped.

## Build history

| Version | Source | Installed proof | Included behavior |
| --- | --- | --- | --- |
| 1.0.0 / 1 | PR #351, source `30ad162`, merged as `63a598a` | Samsung SM-S936U, 2026-10-27. APK installation succeeded; compass launcher icon and GitHub sign-in as RAbdelrhman verified. | Sign-in and account settings. Maps was a placeholder. |
| 1.1.0 / 2 | `fb3be672cce1d2acbbedfcaf6dacd5b9727ac082`, #229 implementation | Samsung SM-S936U, 2026-10-27 15:56 UTC. Install succeeded, existing sign-in retained; repository filtering, map tabs, ticket tabs and issue-link navigation exercised. | Approved #223 R-C2, M-C, and T-C with live GitHub data. |

Latest installed APK:
`C:/Users/supie/Downloads/Wayfinder-Mobile/Wayfinder-1.1.0-fb3be672-arm64.apk`.
The adjacent `.json` manifest identifies the exact source, an empty working-tree
change list, checksum and installation time. SHA-256:
`91619200fa3e876984050c1da462cbe615083fc7e017562c920eca27dec58414`.

GitHub retains the same APK, `SHA256SUMS.txt`, and a public-safe build manifest in
the draft prerelease `mobile-v1.1.0`. Find it with
`gh release view mobile-v1.1.0 --repo RAbdelrhman/wayfinder-map`.
The draft is visible to repository collaborators and stays unpublished while
[PR #352](https://github.com/RAbdelrhman/wayfinder-map/pull/352) completes review
and CI. Mobile tags use `mobile-v*` so they do not trigger the desktop `v*`
release workflow. Preserve the exact APK source SHA even after a squash merge.

Physical-phone checks used RAbdelrhman: 13 live maps across three repositories,
including map #217 with 21 tickets. Repository filtering and Path / Tickets /
Brief work, including state filtering and the complete Destination text. Ticket
#230's Overview / Links / Activity show its live blocker, dependencies/dependents
and GitHub comment; a comment's #335 reference opens the linked issue. Settings
and back navigation work. Sign-in and cached data persisted through the APK
upgrade. Local screenshots are in `C:/wf229/.audit/phone/`, including
`maps.png`, `map-path.png`, `map-tickets-blocked.png`, `ticket-overview.png`,
`ticket-links.png`, `ticket-activity.png`, and `map-brief-final.png`.

Source gates: root typecheck, lint, 1,818 tests across 135 files, and build passed;
mobile typecheck, 82 tests across six files, and Android/iOS exports passed. The
Android ARM64 native release build and release lint passed. Public-follow
inclusion, private-map exclusion, pagination, fallback links/blockers, unknown
blockers, API failures, corrupt cache handling, account separation and serialized
cache writes have automated coverage.

Not verified on the physical phone: airplane-mode recovery, a followed map from
another author, screen-reader speech, light theme and iOS. There is no claim of
automatic desktop follow synchronization, canvas viewing, pairing, session
watching or pushes in this APK.

The previous 1.0.0 APK is at
`C:/wf-phone/artifacts/Wayfinder-Mobile-1.0.0-30ad162-arm64.apk`.
Its launcher evidence is `C:/wf-phone/artifacts/phone-wayfinder-icon.png`.

## Rebuild and retain an Android APK

Use the repository's locked Bun dependencies. Install the Android SDK, build
tools, NDK and JDK required by Expo SDK 57, and configure `ANDROID_HOME` and
`JAVA_HOME`. Keep this checkout's path short on Windows, for example `C:/wf229`,
because generated C++ object paths can exceed Windows' filename limit.

Set `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `mobile/.env.local` using the existing
GitHub OAuth app with Device Flow enabled. See [mobile-sign-in.md](mobile-sign-in.md).
The client ID is public. Never put an OAuth token or client secret in a build,
manifest, command-line argument, or this document.

From PowerShell at the repository root:

```powershell
./scripts/build-mobile-android.ps1
# Build, retain the APK and manifest, then update a connected phone without clearing its sign-in:
./scripts/build-mobile-android.ps1 -DeviceSerial '<adb serial>'
```

The default archive is `%USERPROFILE%/Downloads/Wayfinder-Mobile/`. Each APK has a
JSON manifest with the version, source SHA, working-tree changes, checksum and
installation timestamp. `-SkipBuild` packages an already-completed local build;
use it only immediately after building the same source. A `-working` filename
means there were source changes beyond the recorded commit. Preserve that
qualification when reporting provenance.

These are personal ARM64 standalone release-mode builds using Expo's generated
debug signing key. They contain the JS bundle and need neither Metro nor a
connected PC to run. They are not Play Store builds. Preserve signing credentials
for upgrades; do not uninstall the phone app to bypass a signature mismatch,
because uninstalling discards its secure sign-in and local cache.

The `withSharedSources` Expo config plugin registers repository `src/` as an
Android JS-bundle task input. Metro's watch folder alone is insufficient for
incremental release builds; without this Gradle can reuse a stale embedded bundle
after shared map logic changes. Keep this plugin when regenerating native code.

## Data and implementation boundaries

The phone reads GitHub directly using its own SecureStore sign-in. The approved
Maps screen opens on all of the account's maps, latest first, with a repository
filter. Map detail has Path / Tickets / Brief. Ticket detail has Overview /
Links / Activity. Native sub-issues, body-linked tickets, dependency state,
outside dependency links and comments come from GitHub; these are not prototype
fixtures. The last successful account-scoped data is retained on the phone.

Desktop follows are currently a local file, not a GitHub subscription or a cloud
service. An optional `EXPO_PUBLIC_FOLLOWED_MAPS` value can seed public references
using the desktop `follows.json` structure, for example
`{"your-login":{"owner/public-repo":[123]}}`. The native adapter checks the live
map author and public visibility before including any followed map. Local mobile
follows use the same format in AsyncStorage key `wayfinder.follows.v1`. Automatic
desktop-to-phone follow synchronization has not been implemented; do not claim it.

Pairing, start/watch sessions, pushes and the mobile canvas viewer retain their
own implementation tickets. #229 does not add prototype-only placeholders for
those controls. #224's unresolved start/watch choices do not require Ramon to
reselect the approved #223 browsing screens.

## Verification required for a new build

Run root `bun run typecheck`, `bun run lint`, `bun run test --maxWorkers=2`, and
`bun run build`. From `mobile/`, run `bun run typecheck`, `bun run test`, and
`bun run check:bundle`. Build the APK, retain its manifest, and exercise the actual
phone flow. Record the source, build and device evidence separately. An Android
export or a browser-shaped phone frame is not native device proof.
