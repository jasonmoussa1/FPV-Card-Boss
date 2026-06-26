# FPV Card Boss — Project Handoff & Working State

**Read this first when picking the project up on a new machine.** It captures where
the work stands so any Cowork/Claude on any computer can continue seamlessly.

- **Repo:** https://github.com/jasonmoussa1/FPV-Card-Boss  · branch **master**
- **App:** Electron + React (Vite) desktop app + a bundled mobile-companion web server.
- **What it does:** automates festival FPV card processing — drives GoPro Player to
  stabilize footage, copies to Local/Media/Bella drives, dumps raws, logs cards, with
  a phone companion (shot list, slate, deliveries, site map) over Wi-Fi/Tailscale.

---

## How to move between machines (the golden rule)

**GitHub is the single source of truth.** There is no other sync.

- **Before leaving a computer:** commit and push everything.
  ```
  git add -A
  git commit -m "wip: <what you changed>"
  git push origin master
  ```
- **When arriving at a computer:** pull first.
  ```
  git pull origin master
  ```
- `credentials.json` (Google service-account key) is **deliberately NOT in git**. Copy
  it over separately on any machine that uses the Sheets automation.
- Calibration is **per-machine** (stored in the OS user-data folder, not git), so each
  computer (and Windows vs Mac) calibrates the GoPro robot once on its own.

> If two machines might both touch the project, always push before switching and pull on
> arrival to avoid divergence. If they ever diverge, `git status` / `git log` on each and
> reconcile before continuing.

---

## Operating notes for Claude/Cowork (learned the hard way)

- **The Cowork bash sandbox mount can lag** behind files written by the Read/Write/Edit
  tools — it sometimes serves **stale or truncated** copies of just-edited files. So:
  - Verify file contents with the **Read/Grep tools** (host truth), not `cat`/`node --check`
    via bash on freshly-edited files.
  - **Do NOT run `git add/commit/push` from the sandbox** — it can stage truncated files.
    Always hand the user the git/build commands to run in their **real terminal**.
- **Run the app:** `npm install` once, then `npm run build:server` (bundles the companion
  server) and `npm run dev:electron`. Vite hot-reloads UI edits.
- **Builds:** Windows portable exe → `npm run build:exe` (output in `C:\Temp\fpv-card-boss-release`,
  copied to Desktop by `deploy.cjs`). Mac → `npm run build:mac` (needs Apple Developer ID
  signing for the Accessibility permission) or just run dev for testing.
- After changing the phone PWA (`dashboardServer.cjs`), bump `PAGE_BUILD` so phones
  pick up new code, and re-run `npm run build:server`.

---

## What's DONE (committed / in progress on master)

1. **Cross-platform foundation (Phase 1).** App asks "Windows PC or Mac?" on first launch
   (`src/components/PlatformGate.tsx`), persists the choice, and routes OS-specific work
   through a seam. `platform.cjs` = detection + macOS automation primitives.
2. **macOS GoPro robot (Phase 2).** `mac-robot.cjs` — a 1:1 port of the Windows PowerShell
   robot using **@nut-tree-fork/nut-js** (native mouse/keyboard), driven by the SAME 14
   calibration points. Same sequence: pre-clear queue, add files, Cmd+A, HyperSmooth,
   un-gain, Smoothness/Cropping slider drags (50→15), aspect 8:7, Start.
3. **Full Mac file workflow.** `mac-fs.cjs` — rsync equivalents of every Windows Robocopy
   op (SD→RAW with BATCH_NN, copy-to-Media/Bella/MediaDrive/BellaDrive, volume-safe SD
   delete, GoPro path). `main.cjs` delegates via gated `if (isMacPlatform())` branches;
   Windows code paths are untouched.
4. **Mac build config.** `package.json` mac target + `build/entitlements.mac.plist` +
   nut.js optionalDependency + asarUnpack for the native module.
5. **Live shot-list auto-sync on the phone.** `dashboardServer.cjs` — the phone now
   auto-pulls the PC's shot list (on load, every 4s, on open, on wake); the old "Import PC"
   button is gone. Merge is **status-preserving**: never downgrades a completed/skipped
   shot to pending; adopts a PC completion only when the phone still shows pending; new
   shots added; removed-but-pending dropped; removed-but-completed kept as history;
   re-links by PC id then natural key (artist+stage+day); guards in-flight phone edits.
6. **Manual overhaul.** In-app `UserManual.tsx` (Full ↔ Quick Reference toggle) +
   `helpContent.ts` tooltips; branded `docs/manual.html`; standalone PDFs
   (`docs/FPV Card Boss - Operator Manual.pdf`, `... Quick Reference.pdf`) +
   `docs/make-standalone-pdf.py`. All cover Windows + Mac, Dual Mode, auto-sync.

## What's PENDING / next

1. **Mac `addFiles()` in `mac-robot.cjs`** — the ONE step needing confirmation against
   GoPro Player's Mac UI: how clips are added to the queue (Finder drag vs an Add button +
   file picker). Needs screenshots / a real Mac. Everything else is wired. See
   **`SATURDAY_MAC_RUNBOOK.md`** and **`docs/GoPro_Player_Mac_vs_PC_Audit.md`**.
2. **Calibrate on the actual Mac** (per-machine) and validate the nut.js coordinate space
   on Retina (the cursor capture returns logical points on Mac to match nut.js).
3. **Optional:** signed/notarized Mac `.app` (`build:mac` + Developer ID); a phone
   "clear old/ completed shots per event" action; a GitHub release tag per build.

## Key files map
- `main.cjs` — Electron main; IPC handlers; `isMacPlatform()` gates; `runMacRobot`.
- `platform.cjs` — platform detect/override + macAutomation (nut.js, rsync, osascript).
- `mac-robot.cjs` — macOS GoPro export robot (nut.js).  · `mac-fs.cjs` — macOS rsync file ops.
- `dashboardServer.cjs` — mobile companion (PWA, shot list, slate, site map, deliveries).
- `src/components/Dashboard.tsx` — main UI.  · `ShotListPanel.tsx` — desktop shot list.
- `src/components/UserManual.tsx`, `src/data/helpContent.ts` — in-app manual + tooltips.
- `docs/` — manuals (HTML + PDFs), this handoff, the Mac audit, architecture roadmap,
  `NEW_COMPUTER_SETUP.md`, `make-distribution.ps1`, `make-standalone-pdf.py`.
- `SATURDAY_MAC_RUNBOOK.md` (repo root) — the Mac bring-up checklist.

## Reference docs in this repo
- `docs/CrossPlatform_Architecture_and_Roadmap.md` — the platform-layer design + phases.
- `docs/GoPro_Player_Mac_vs_PC_Audit.md` — GoPro Player Mac vs Windows findings.
- `docs/NEW_COMPUTER_SETUP.md` — fresh-machine setup (Windows exe + Mac from source).
- `SATURDAY_MAC_RUNBOOK.md` — step-by-step Mac test plan.
