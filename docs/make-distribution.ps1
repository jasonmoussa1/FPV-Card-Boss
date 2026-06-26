# Assembles a portable distribution zip for a fresh Windows test machine.
# Run AFTER building:   npm run build:server ; npm run build:exe
# Usage:                powershell -ExecutionPolicy Bypass -File docs\make-distribution.ps1
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot        # project root (this script lives in docs\)
$stamp = Get-Date -Format 'yyyy-MM-dd'
$name  = "FPV-Card-Boss-$stamp"
$out   = Join-Path $root "dist-package\$name"

New-Item -ItemType Directory -Force -Path $out | Out-Null

# 1) The portable .exe — prefer the electron-builder output, fall back to the deployed copy.
$exe = Get-ChildItem 'C:\Temp\fpv-card-boss-release\*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
  $exe = Get-ChildItem 'C:\Users\Jason\OneDrive\Desktop\fpv-card-boss-release\*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $exe) { throw "No .exe found. Run 'npm run build:exe' first." }
Copy-Item $exe.FullName (Join-Path $out $exe.Name)
Write-Host "  + $($exe.Name)"

# 2) Manuals + setup guide.
foreach ($f in @(
  'docs\FPV Card Boss - Operator Manual.pdf',
  'docs\FPV Card Boss - Quick Reference.pdf',
  'docs\NEW_COMPUTER_SETUP.md'
)) {
  $p = Join-Path $root $f
  if (Test-Path $p) { Copy-Item $p $out; Write-Host "  + $(Split-Path $f -Leaf)" }
}

# 3) A short read-me-first note at the top of the package.
@"
FPV CARD BOSS — portable build ($stamp)

1. Add a Windows Defender FOLDER exclusion for this folder (unsigned portable exe).
2. Install GoPro Player + HyperSmooth Pro and sign in.
3. Run the .exe. Pick 'Windows PC' on first launch.
4. Open Setup: set drive paths, add pilots, and Calibrate the GoPro Robot (per-machine).
5. Read 'FPV Card Boss - Operator Manual.pdf' (or the Quick Reference) for the full workflow.
   Full setup details: NEW_COMPUTER_SETUP.md.
"@ | Set-Content -Path (Join-Path $out 'READ ME FIRST.txt') -Encoding UTF8

# 4) Zip it.
$zip = Join-Path $root "dist-package\$name.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$out\*" -DestinationPath $zip
Write-Host ""
Write-Host "Distribution ready:"
Write-Host "  Folder: $out"
Write-Host "  Zip:    $zip"
