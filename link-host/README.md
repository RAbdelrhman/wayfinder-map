# HTTPS destination host

This static host lets stock T3, email and other apps share Wayfinder destinations
as normal HTTPS links. The public site never fetches GitHub data or tokens.
Android verified App Links open the existing native resolver directly; browsers
show #373's selected A card with one explicit native launch link. The page cannot
detect installation or successful opening and never reports either as success.

The exact production origin and personal Vercel project are in `deployment.json`.
`src/httpsLinks.ts`, mobile app association settings and agent-ready prompts use
that same origin. Repository tests check their agreement. Native `wayfinder://`
links remain supported by the app.

## Build and verify

From the repository root:

```powershell
bun run build:link-host
bun run test:link-host:browser
```

The build writes `.generated/link-host/`: public HTML, CSS, bundled strict parser,
icon, association files and `vercel.json`. Its `build-manifest.json` records the
source commit, relevant working-tree changes and deployed-file checksums. Publish
only a clean committed build. The browser check loads this exact artifact in
installed Chrome, tests all destination kinds and invalid links across two themes
and four viewports, and rejects page errors, unintended requests, overflow and
automatic navigation. This does not establish OS or installed-app behavior.

## Deploy

Inspect the project in `deployment.json` before deploying. Upload the built
`public/` files and root `vercel.json` to that project with production target and
public output directory. Vercel's authenticated deployment connector supports
inline files; no token is committed here. Retain the build manifest and deployment
ID, then verify the canonical origin, headers and response bodies without a
signed-in browser. Check every deployed file against its build checksum.

`/open/*` rewrites to the static page. Its shared parser accepts only the exact
production origin, four object kinds and supported parameters; invalid links have
no launch action. All access checks still occur in Wayfinder with the viewer's
GitHub account. The page's install/update link points to the actual repository
releases page.

## Mobile associations

Android's `/.well-known/assetlinks.json` must return JSON with HTTP 200 and no
redirect. Its package and signing-certificate SHA-256 must match the installed
APK. The fingerprint currently matches the retained personal build key. A
different signing key needs an explicit association update, not an invented
fingerprint. Device acceptance includes the OS verification and the user's
supported-link preference, then a real HTTPS click from stock T3.

iOS requires an actual Apple Developer Team ID and matching signed bundle ID.
None is configured yet, so the AASA file deliberately has an empty `details`
array. iOS associated-domain configuration alone is not verified Universal Link
support. The browser's explicit native-link button is the fallback; physical iOS
acceptance remains unverified.

## Selected design

Ramon chose A, Centered card, from prototype #373 at revision
`11074255b6549d3dbfac72ef0084783c78c3936b`, page `overview`, option `A`.
Decision: https://github.com/RAbdelrhman/wayfinder-map/issues/373#issuecomment-6518144705.
