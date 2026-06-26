# FPV Card Boss — Taking It to a New Computer

Two ways to run it on a fresh machine: the **portable .exe** (Windows, no dev tools) or **from source** (Windows or Mac). Pick the path for your test machine.

---

## A) Windows test machine — portable .exe (simplest)

**On the build PC (this one):**
1. Build the app:
   ```
   npm run build:server
   npm run build:exe
   ```
   This produces the portable exe in `C:\Temp\fpv-card-boss-release\` and copies it to `OneDrive\Desktop\fpv-card-boss-release\`.
2. Assemble the hand-off zip (exe + manuals + this guide):
   ```
   powershell -ExecutionPolicy Bypass -File docs\make-distribution.ps1
   ```
   It writes `dist-package\FPV-Card-Boss-<date>.zip`.

**On the new Windows PC:**
1. Copy the zip over, extract it anywhere (e.g. Desktop).
2. **Add a Windows Defender exclusion** for that folder (Defender can quarantine an unsigned portable exe): Windows Security → Virus & threat protection → Manage settings → Exclusions → Add → Folder.
3. Install **GoPro Player + HyperSmooth Pro** and sign in / unlock it.
4. Double-click the `.exe`. On first launch, pick **Windows PC** at the platform prompt.
5. Open **Setup**: set the drive paths, add pilots, and **Calibrate the GoPro Robot** (14 points — calibration is per-machine, so it must be done here).
6. If you use the Google Sheets "Media Master" automation, place your `credentials.json` next to the exe. (It's deliberately not bundled — it's a secret.)

> The exe is self-contained (the mobile companion server and slate are inside it). Nothing else to install besides GoPro Player.

---

## B) Mac test machine — run from source

The `.exe` can't run on a Mac. Clone the repo and run it.

1. **Clone + install:**
   ```
   git clone https://github.com/jasonmoussa1/FPV-Card-Boss.git
   cd FPV-Card-Boss
   npm install
   ```
   `npm install` pulls the Mac click engine (`@nut-tree-fork/nut-js`) automatically.
2. **Sanity check the files parse:**
   ```
   node --check main.cjs
   node --check platform.cjs
   node --check mac-robot.cjs
   node --check mac-fs.cjs
   ```
3. **Grant two macOS permissions** — System Settings ▸ Privacy & Security:
   - **Accessibility** → add **Terminal** (and Electron if listed) — lets the robot move the mouse/keyboard.
   - **Screen Recording** → same — lets calibration read the screen.
4. **Run it:**
   ```
   npm run build:server
   npm run dev:electron
   ```
   Pick **Mac** at the platform prompt, then calibrate against GoPro Player on the Mac.
5. Install **GoPro Player + HyperSmooth Pro** on the Mac and sign in.

> **Known open item (Mac):** how clips get *added* into GoPro's queue (`addFiles` in `mac-robot.cjs`) still needs confirming against the Mac UI — see `SATURDAY_MAC_RUNBOOK.md`. Everything else (copies, calibration, the settings sequence) is wired.
> For a packaged Mac `.app` later: `npm run build:mac` (needs an Apple Developer ID to sign/notarize so Gatekeeper allows the Accessibility permission).

---

## What every fresh machine needs
- **GoPro Player + HyperSmooth Pro** installed and unlocked.
- **Setup** filled in (drive paths, pilots) and **calibration done on that machine** (it's per-computer and per-resolution).
- For the phone companion: **Tailscale** on both the computer and phone for the offline/mic HTTPS address (see the User Manual, "The Mobile Companion").
- `credentials.json` only if you use the Google Sheets automation (kept out of git and the build as a secret).

## Versioning
- Source of truth: GitHub `jasonmoussa1/FPV-Card-Boss` (branch `master`).
- Manuals: `docs/FPV Card Boss - Operator Manual.pdf`, `docs/FPV Card Boss - Quick Reference.pdf` (regenerate with `python docs/make-standalone-pdf.py .`), and the branded `docs/manual.html`.
