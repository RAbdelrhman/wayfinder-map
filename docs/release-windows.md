# Windows desktop releases

Wayfinder targets Windows 10 and Windows 11 on x64 and ARM64. Each architecture
gets its own NSIS installer and update channel from the same version and source tag.

## Local unsigned test package

```powershell
bun install --ignore-scripts
bun run package:win -- x64
```

The output is under `release/x64/`. It is intentionally unsigned and may trigger a
Windows warning. Use the ARM64 argument to cross-package that architecture; an ARM64
artifact is not considered verified until it has been installed and exercised on a
real Windows ARM64 machine.

## Stable release

Push a tag that exactly matches the root package version, such as `v0.1.0`. The
Windows workflow builds x64 and ARM64, writes SHA-256 checksum files, and attaches
the signed artifacts and update metadata to the GitHub release.

Stable tags fail closed unless these repository secrets exist:

- `WIN_CSC_LINK`: the PFX/P12 file, HTTPS URL, or base64 certificate accepted by
  electron-builder.
- `WIN_CSC_KEY_PASSWORD`: the certificate password.

Azure Artifact Signing Basic remains the preferred future signing route if the
release owner is eligible. The workflow does not create Azure resources or weaken
the stable signing gate while those external credentials are unavailable.

Signed stable builds check the architecture-specific GitHub Releases channel at
launch and every 24 hours. They download in the background and ask before restart.
Unsigned local builds and prerelease versions do not check for updates.

## Release gates

Source and unsigned packaging do not prove the public support matrix. Before a
stable release is announced, record all of the following:

- Authenticode signature and publisher verification.
- Windows 10 install, launch, tray, update, and uninstall.
- Windows 11 install, launch, tray, update, and uninstall.
- Real Windows ARM64 install, launch, tray, update, T3 hand-off or copy fallback,
  and uninstall.

Until those checks are performed, they remain `Not Verified` and a stable public
release must not be claimed complete.
