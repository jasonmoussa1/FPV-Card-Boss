# FPV Card Boss — Project Status Report

**Date:** 2026-06-01
**Version:** 1.2.0
**Stack:** Electron 42 + React 19 + TypeScript 5.8 + Vite 6 + Tailwind v4 · Express 5 + ws 8 (mobile server)
**Build status:** ✅ `tsc --noEmit` clean · ✅ `vite build` clean · ✅ `npm run build:exe` produces & signs the portable `.exe`
**Purpose of this doc:** A current, accurate snapshot to hand to a cloud project so it understands exactly how the app is built and what it includes today.

> This supersedes the older `PROJECT_AUDIT.md` (dated 2026-05-26), which is now **stale** in several places (it predates the mobile dashboard, the Shot List panel, festival/simple modes, dump-raws, and the SD-batch logic, and it lists Dashboard.tsx at ~1700 lines — it is now 3,716). Where the two disagree, trust this report.

---

## 1. What the app is

A Windows desktop tool for an FPV drone-footage pipeline at live events (e.g. EDC). It turns a memory-card-to-delivery workflow into a guided, mostly-automated process:

1. **Assignments** — parse a shot-list CSV into per-pilot/per-day assignments.
2. **Ingest** — robocopy footage from the SD card into a structured local RAW folder.
3. **Stabilize** — drive **GoPro Player** via a screen-coordinate robot (PowerShell + Win32 mouse events) to batch-export stabilized clips.
4. **Move** — move the finished exports into the card's STABILIZED folder.
5. **Deliver** — robocopy to the Media drive (RAW + STABILIZED) and the Bella social dropbox (STABILIZED only); optionally flatten raws into a "Rod dump" folder.
6. **Log** — produce a tab-separated row for Google Sheets (manual paste; no live API) and advance to the next card.
7. **Mobile** — a phone PWA mirrors live status and can trigger every delivery action remotely over Wi-Fi or Tailscale.

---

## 2. Architecture

### Process model
```
main.cjs            Electron main (Node, CJS) — all IPC handlers, the GoPro robot
                    PowerShell script, export polling, AND the mobile-dashboard
                    status object (single source of truth) + command forwarding
preload.cjs         contextBridge → window.electron.* (contextIsolation ON)
index.html → src/main.tsx → App.tsx → components/Dashboard.tsx   (entire UI)
calibration.html    separate frameless click-through overlay window (nodeIntegration ON)
dashboardServer.cjs Express + ws server + the self-contained installable PWA page
  └─ dashboardServer.bundled.cjs   esbuild bundle that main.cjs actually loads
```

### Security posture
- Main window: `contextIsolation: true`, `nodeIntegration: false` — renderer reaches Node only through `preload.cjs`. Good.
- Calibration overlay: `nodeIntegration: true`, `contextIsolation: false` — acceptable because it loads only local `calibration.html` with no external content.
- Mobile server binds `0.0.0.0` (LAN + Tailscale). No auth — anyone who can reach the port can drive the actions. Acceptable on a trusted LAN / private tailnet; **not** safe to expose publicly. (See Findings.)

### Source map (current)
| File | Lines | Role |
|---|---|---|
| `main.cjs` | 1,409 | IPC handlers, GoPro robot PS template, export polling, mobile status + forwarding |
| `dashboardServer.cjs` | 394 | PWA HTML/JS/CSS + Express/ws transport (`createDashboard`) |
| `preload.cjs` | 56 | context bridge |
| `src/components/Dashboard.tsx` | 3,716 | **entire** UI + state + IPC orchestration (festival & simple modes) |
| `src/components/ShotListPanel.tsx` | 654 | shot-list viewer/editor/tracker |
| `src/components/HelpButton.tsx` | 150 | contextual `?` help popovers |
| `src/utils/csvParser.ts` | 178 | RFC-4180 parser + FPV assignment extractor |
| `src/utils/localServices.ts` | 135 | thin `window.electron.*` wrappers |
| `src/data/helpContent.ts` | 191 | help copy |
| `src/data/sampleCsv.ts` | 59 | bundled EDC sample shot list |
| `src/types.ts` | 110 | `FpvAssignment`, `PilotConfig`, `FpvConfig`, `ProcessedCard` |
| `src/vite-env.d.ts` | 63 | `ElectronBridge` typings for `window.electron` |
| `calibration.html` | — | calibration overlay |
| `deploy.cjs` | 18 | copies built `.exe` → OneDrive Desktop folder |

---

## 3. Feature inventory

### 3a. Two operating modes (`config.mode`)
- **`festival`** — the full GoPro batch-player workflow (pilots, day sections, card IDs, robot, dump-raws, complete-and-shift). This is the primary mode.
- **`simple`** — a lighter folder-name-driven flow (event + folder name) with its own media/bella copy handlers (`handleSimpleCopyToMediaDrive` / `handleSimpleCopyToBellaDrive`).

### 3b. GoPro stabilization robot
- Calibration captures **12 absolute physical-pixel coordinates** via a click-through overlay (`calibration.html`); stored in `config.robotCoords` and also persisted per-machine/per-resolution in `calibrations.json` (`save-/load-calibration`). DPI-aware (`dipToScreenPoint`).
- `run-gopro-robot` writes a PowerShell script to `%TEMP%\gopro_robot.ps1` that: finds the Export Queue window via UI Automation, opens Explorer at the RAW folder, selects all, drags files to the GoPro drop zone, sets HyperSmooth + un-gain + smoothness 50→15 + cropping 50→15 + 8:7 aspect, and clicks Start Export.
- After the script exits, `waitForExportComplete()` polls the output folder (default `C:\Users\Jason\Videos`) every 3 s, requires 3 stable size checks, then declares complete.

### 3c. SD ingest with batch subfolders
- `copy-sd-to-raw` robocopies the SD card into the card's RAW folder. **If RAW already has files** (same RAW reused across cards), it copies into a fresh `BATCH_NN` subfolder so the robot only stabilizes the *new* files. Returns `activeRawPath`/`batchSubfolder`, recursive `fileCount`, `sizeGB`, and a source/dest `matched` flag.

### 3d. Delivery + cleanup
- `copy-to-media-drive` (RAW+STABILIZED → Media), `copy-to-bella-drive` (STABILIZED → Bella), each robocopy with progress events.
- `dump-raws` flattens every file under any `RAW` folder in the pilot tree into one dump folder, with size-aware dedupe (skips files already dumped, uniquifies name collisions with `_N`).
- `delete-sd-raw-files` removes only GoPro media extensions from the SD card, with **hard safety guards**: refuses the system drive and any configured working/media/Bella drive.

### 3e. Shot List panel + Google Sheets
- CSV → assignments; per-pilot scoping, day filters, skip/flag, completion tracking.
- No live Sheets API — produces a tab-separated `mediaMasterLine` for manual paste; bulk "copy all dump values" too.

### 3f. Mobile dashboard (PWA) — most recent work
See §4 — this is where the latest development focused.

---

## 4. Mobile dashboard (current design)

**Goal:** a phone watches live progress and triggers the same end-of-flow actions as the desktop GoPro batch player, over Wi-Fi or Tailscale, with no cloud.

**Transport:** `dashboardServer.cjs` embeds Express + `ws`, serves a self-contained installable PWA (manifest + service worker + iOS meta) on `0.0.0.0:<port>` (default **8723**). LAN + Tailscale URLs are auto-detected and shown in **Setup → 📱 Mobile Dashboard**.

**Single source of truth:** `main.cjs` owns a `status` object and is the only writer. It is updated and broadcast at every real transition:
- `run-gopro-robot` start → `state:'running'` + captures `activeJob { stabilizedFolder, videosFolder, robotStartTime, expectedCount, cardId, pilotName, artistName }`.
- export progress → `fileCount/expectedCount/totalSizeMB/countLabel`.
- export complete → `state:'complete'`; **auto-move** runs if `moveMode==='auto'` and counts match.
- robot failure / export timeout / **count mismatch** → `state:'error'`.
- Every change runs through `setStatus()`, which **`console.log`s the transition** and broadcasts to all WebSocket clients + the desktop renderer. New clients get a full snapshot on connect.

**Commands (phone → main, WebSocket):** `move` (run by main via `moveNow()`), `setMode`, and `copyMedia` / `copyBella` / `dumpRaws` / `completeCard`. The four delivery commands are **forwarded to the desktop renderer** (`dashboard-command` IPC), which runs the existing, mode-correct handler — keeping one source of truth and avoiding logic duplication. `completeCard` requires a confirm tap on the phone.

**Availability + hints (renderer → main):** the renderer reports per-action `available` / `state` / `dest` / `hint` via `dashboard-report-state` (whitelisted fields). The phone **always renders the full control set** (Move, Media, Bella, Dump, Complete) and greys out what isn't usable yet, showing a short reason ("Move files to STABILIZED first", "Assign an artist first", "Available in Festival mode", etc.). Buttons enable exactly when their desktop equivalents would.

**Important behavioral note (caused earlier confusion):** `status` is **in-memory** and resets to `IDLE` when the desktop app restarts. The phone is a *live mirror* — it only has something to act on while a card is actively in flight. This is by design, now documented in `PHONE_SETUP_GUIDE.md`.

**Docs:** `PHONE_SETUP_GUIDE.md` (beginner walkthrough incl. Tailscale) and `MOBILE_DASHBOARD.md` (short technical note).

---

## 5. Data, config & storage

- **Renderer config/state** → `localStorage` (`fpv_boss_config`, `fpv_boss_csv_text`, history, day/pilot/card selections, size/notes, skipped assignments, simple-mode toggles).
- **`config.robotCoords`** → calibration coordinates (also mirrored to `calibrations.json` in userData, keyed by hostname + resolution).
- **`dashboard-config.json`** (userData) → mobile port + move mode.
- **Paths** (festival): `…\{EVENT}\{DAY}\{PILOT}\{CARD}_{ARTIST}\{RAW|STABILIZED}`, Media `{mediaRoot}\{CARD}`, Bella `{bellaRoot}\{ARTIST}`. All segments run through `cleanFolderName()`.
- **`credentials.json`** — a Google service-account key. **No Google API code exists** and the file is **gitignored + untracked** (not committed, not packaged). It still sits unencrypted in the working tree locally.

---

## 6. IPC / command reference (current)

**Invoke (renderer → main):** `validate-setup` (now used as pre-flight), `select-folder`, `get-cursor-pos`, `create-folders`, `open-folder`, `find-gopro-path` *(dead — not in preload)*, `calibrate-robot`, `run-gopro-robot`, `move-stabilized-files`, `copy-to-media`, `copy-to-bella`, `copy-to-media-drive`, `copy-to-bella-drive`, `copy-sd-to-raw`, `delete-sd-raw-files`, `dump-raws`, `save-calibration`, `load-calibration`, `dashboard-get-info`, `dashboard-set-port`, **`dashboard-report-state`** (new).

**Send (main → renderer):** `dashboard-status`, `dashboard-move-done`, **`dashboard-command`** (new), `robocopy-progress`, `media-copy-progress`, `bella-copy-progress`, `media-drive-copy-progress`, `bella-drive-copy-progress`, `gopro-robot-status`, `gopro-export-progress`, `gopro-export-complete`, `gopro-export-error`, `gopro-remove-complete`, `dump-raws-progress`.

**WebSocket (phone → main):** `move`, `setMode`, `copyMedia`, `copyBella`, `dumpRaws`, `completeCard`.

> Removed since the old audit: the legacy `automate-gopro`, `launch-gopro-workflow`, and `move-exports` handlers no longer exist.

---

## 7. Build & deploy

| Command | Does |
|---|---|
| `npm run dev` / `dev:electron` | Vite dev server / Vite + Electron |
| `npm run lint` | `tsc --noEmit` |
| `npm run build:server` | esbuild → `dashboardServer.bundled.cjs` |
| `npm run build:exe` | `tsc --noEmit && vite build && build:server && electron-builder --win && node deploy.cjs` |

- Output: `C:\Temp\fpv-card-boss-release\FPV Card Boss 1.2.0.exe` (portable, signed), then `deploy.cjs` copies it to `C:\Users\Jason\OneDrive\Desktop\fpv-card-boss-release\`.
- **Gotcha:** `main.cjs` loads `dashboardServer.bundled.cjs` first (falls back to raw only on error), so **any edit to `dashboardServer.cjs` requires `build:server`** to take effect — even in dev. `build:exe` does this automatically.
- **Gotcha:** the portable target can fail with `Can't open output file` if the previous `.exe` is running or antivirus is mid-scan; re-running succeeds. When scripting the build, capture the real exit code (don't pipe through `tail`, which masks npm's exit status).

---

## 8. Health check — what's verified working

- ✅ Type-checks clean; renderer builds; exe packages, signs, and deploys.
- ✅ Mobile server serves the PWA; WebSocket connects; status broadcasts; snapshot-on-connect works (smoke-tested standalone).
- ✅ Delivery buttons render always, gated by reported availability + hints (smoke-tested).
- ✅ Status transitions log to the main console at each step.
- ✅ SD-delete and dump-raws have sane safety guards.

No bugs were found that break the core flows. The findings below are hygiene, robustness, and maintainability items.

---

## 9. Findings (prioritized)

### Medium
1. **No automated tests anywhere.** All verification is manual + smoke tests. The robot and file-moving logic are exactly the kind of thing that benefits from unit tests around `performMove`, `cleanFolderName`, `extractFpvAssignments`, and the dump-raws dedupe.
2. **All recent work is uncommitted.** `git status` shows `main.cjs`, `dashboardServer.cjs`, `preload.cjs`, `Dashboard.tsx`, `vite-env.d.ts` modified and `PHONE_SETUP_GUIDE.md` untracked — i.e. the entire mobile dashboard + the "Create directory paths" button fix exist only in the working tree. One bad reset and it's gone. Recommend committing.
3. **Mobile server has no authentication.** Fine on a trusted LAN/tailnet, but anyone who can reach `:8723` can move/copy/dump/complete. Don't port-forward it; consider a simple shared token if it ever leaves a trusted network.

### Low
4. **GoPro robot is inherently fragile.** It drives a third-party UI by absolute screen coordinates; GoPro Player updates, DPI/monitor changes, or window repositioning will break it and require recalibration. This is structural, not a bug — worth stating plainly to any new contributor.
5. **`gopro_robot_log.txt` grows unbounded** in `%TEMP%` (appended every run, never rotated). Trivial cleanup.
6. **`credentials.json`** still physically present unencrypted in the working tree (though gitignored/untracked and unused). Safe to delete until/unless a real Sheets integration is built.
7. **`find-gopro-path`** remains as dead code (not exposed in preload).
8. **`config.robotCoords` is typed `any`** — a miscalibration wouldn't be caught at compile time. The pre-flight `validate-setup` does check coord completeness at runtime, which mitigates this.
9. **`Dashboard.tsx` is a single 3,716-line component.** It works, but it's the main maintainability risk; extracting the festival/simple panels and the delivery section would help future changes.
10. **Count-mismatch semantics:** when more `.mp4`s than expected appear in the output folder, status is flagged `error` (intended). The phone's older "CHECK COUNT" label path is now effectively unreachable for that case — cosmetic only; Move still offers "Move Files Anyway".

---

## 10. Recommended next steps
1. **Commit** the current working tree (mobile dashboard + button fix + docs) so the progress is durable.
2. Add a tiny test harness around the pure functions (`cleanFolderName`, CSV extractor, dump-raws dedupe, `performMove` against a temp dir).
3. Decide `credentials.json`: delete it, or build the real Sheets integration. Leaving a key on disk with no consumer is the worst of both.
4. Add log rotation/truncation for `gopro_robot_log.txt`.
5. If the phone will ever be used off a trusted network, add a shared-secret token to the WebSocket handshake.
6. (Optional, larger) Break `Dashboard.tsx` into mode-specific subcomponents.
```
