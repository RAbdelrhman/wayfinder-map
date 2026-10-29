param(
  [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Downloads/Wayfinder-Mobile'),
  [string]$DeviceSerial,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$mobileRoot = Join-Path $repoRoot 'mobile'
if (-not $SkipBuild -and $env:OS -eq 'Windows_NT') {
  $rootItem = Get-Item -LiteralPath $repoRoot
  if ($repoRoot.Length -gt 40 -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Android native builds need a real checkout path of at most 40 characters, such as D:\wf-mobile. A junction still exposes long paths to CMake.'
  }
}
Push-Location $mobileRoot
try {
  if (-not $SkipBuild) {
    $env:CI = '1'
    $env:NODE_ENV = 'production'
    & bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'The locked mobile dependency install failed.' }
    & bunx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo Android prebuild failed.' }
    Push-Location (Join-Path $mobileRoot 'android')
    try {
      & .\gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a' --max-workers=2 --console=plain
      if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
    } finally { Pop-Location }
  }
  $apk = Join-Path $mobileRoot 'android/app/build/outputs/apk/release/app-release.apk'
  if (-not (Test-Path -LiteralPath $apk)) { throw "The APK does not exist: $apk" }
  $commit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not identify the source commit.' }
  $config = Get-Content -LiteralPath (Join-Path $mobileRoot 'app.json') -Raw | ConvertFrom-Json
  $changes = @(& git -C $repoRoot status --porcelain --untracked-files=normal -- mobile src scripts/build-mobile-android.ps1)
  $label = if ($changes.Count) { "$($commit.Substring(0, 8))-working" } else { $commit.Substring(0, 8) }
  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  $buildId = [Guid]::NewGuid().ToString('N')
  $destination = Join-Path $OutputDirectory "Wayfinder-$($config.expo.version)-$label-$buildId-arm64.apk"
  [IO.File]::Copy($apk, $destination, $false)
  # Hash through .NET so both PowerShell hosts work without module auto-loading.
  $apkStream = [IO.File]::OpenRead($destination)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    $sha256 = [BitConverter]::ToString($hasher.ComputeHash($apkStream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $hasher.Dispose()
    $apkStream.Dispose()
  }
  $manifest = [ordered]@{
    app = 'Wayfinder'; package = $config.expo.android.package; version = $config.expo.version
    versionCode = $config.expo.android.versionCode; architecture = 'arm64-v8a'
    sourceCommit = $commit; workingTreeChanges = $changes; buildId = $buildId
    apk = $destination; sha256 = $sha256
    packagedAt = [DateTimeOffset]::UtcNow.ToString('o'); signing = 'personal build using the generated Android debug signing key'
    installedDevice = $null; installedAt = $null
    installationStatus = 'not-attempted'
  }
  $manifestPath = [IO.Path]::ChangeExtension($destination, '.json')
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  if ($DeviceSerial) {
    $manifest.installationStatus = 'pending'
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    & adb -s $DeviceSerial install --user 0 -r $destination
    if ($LASTEXITCODE -ne 0) {
      $manifest.installationStatus = 'failed'
      $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
      throw 'Phone installation failed. The previous app and sign-in were retained.'
    }
    $manifest.installedDevice = $DeviceSerial
    $manifest.installedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $manifest.installationStatus = 'succeeded'
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Output "APK: $destination"
  Write-Output "Manifest: $manifestPath"
  Write-Output "SHA-256: $($manifest.sha256)"
} finally { Pop-Location }
