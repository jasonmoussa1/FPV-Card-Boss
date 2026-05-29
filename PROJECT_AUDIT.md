# FPV Card Boss — Complete Project Audit

**Version:** 1.2.0  
**Audit Date:** 2026-05-26  
**Stack:** Electron 42.2.0 + React 19 + TypeScript + Vite 6 + Tailwind CSS v4

---

## 1. ARCHITECTURE

### Process Structure

```
main.cjs          ← Electron main process (Node.js, CJS)
preload.cjs       ← Context bridge (CJS, runs in renderer context with Node access)
index.html        ← Renderer shell (loads Vite bundle)
  └── src/main.tsx       ← React entry point
        └── App.tsx      ← Thin wrapper, renders <Dashboard />
              └── components/Dashboard.tsx  ← Entire application UI (1700+ lines)
calibration.html  ← Standalone overlay window for robot calibration (separate BrowserWindow)
```

### Key Security Settings

- **Main app BrowserWindow**: `contextIsolation: true`, `nodeIntegration: false`
  - All Node/Electron access must go through the context bridge in `preload.cjs`
- **Calibration BrowserWindow**: `contextIsolation: false`, `nodeIntegration: true`
  - Runs `calibration.html` which uses `require('electron')` directly
  - Justified: overlay is created by main process itself, no external content

### Context Bridge (`preload.cjs`)

Exposes `window.electron` to the renderer with these methods:

| Method | IPC Channel | Direction |
|--------|-------------|-----------|
| `ipcRenderer.invoke(channel, ...args)` | any | renderer → main |
| `selectFolder()` | `select-folder` | renderer → main |
| `launchGoProWorkflow(rawPath, stabilizedPath)` | `launch-gopro-workflow` | renderer → main |
| `automateGoPro(rawPath, stabilizedPath, goproAppPath)` | `automate-gopro` | renderer → main |
| `calibrateRobot()` | `calibrate-robot` | renderer → main |
| `runGoProRobot(coords, rawPath, stabilizedPath, goProPath, goProOutputPath)` | `run-gopro-robot` | renderer → main |
| `onCopyProgress(callback)` | `robocopy-progress` | main → renderer (event) |
| `offCopyProgress()` | removes `robocopy-progress` listeners | — |
| `validateSetup(config)` | `validate-setup` | renderer → main |
| `onGoProRobotStatus(callback)` | `gopro-robot-status` | main → renderer (event) |
| `offGoProRobotStatus()` | removes listeners | — |
| `onGoProExportProgress(callback)` | `gopro-export-progress` | main → renderer (event) |
| `offGoProExportProgress()` | removes listeners | — |
| `onGoProExportComplete(callback)` | `gopro-export-complete` | main → renderer (event) |
| `offGoProExportComplete()` | removes listeners | — |
| `onGoProExportError(callback)` | `gopro-export-error` | main → renderer (event) |
| `offGoProExportError()` | removes listeners | — |
| `copyToMedia(localRawPath, localStabilizedPath, mediaDrivePath)` | `copy-to-media` | renderer → main |
| `onMediaCopyProgress(callback)` | `media-copy-progress` | main → renderer (event) |
| `offMediaCopyProgress()` | removes listeners | — |
| `copyToBella(localStabilizedPath, bellaSocialPath)` | `copy-to-bella` | renderer → main |
| `onBellaCopyProgress(callback)` | `bella-copy-progress` | main → renderer (event) |
| `offBellaCopyProgress()` | removes listeners | — |
| `moveExports(data)` | `move-exports` | renderer → main |
| `moveStabilizedFiles(data)` | `move-stabilized-files` | renderer → main |
| `getCursorPos()` | `get-cursor-pos` | renderer → main |

### File Map

| File | Role |
|------|------|
| `main.cjs` | All IPC handlers, GoPro PS script template, export polling logic, window creation |
| `preload.cjs` | Context bridge — maps `window.electron.*` to IPC channels |
| `calibration.html` | Self-contained calibration overlay UI (no Vite, raw HTML+JS) |
| `credentials.json` | Google service account key (project: fpv-card-boss) — **currently unused** |
| `index.html` | Vite renderer entry point |
| `src/main.tsx` | React root render into `#root` |
| `src/App.tsx` | Renders `<Dashboard />`, nothing else |
| `src/components/Dashboard.tsx` | Entire application — all state, all UI, all IPC calls |
| `src/utils/localServices.ts` | Thin wrappers over `window.electron.*` calls |
| `src/utils/csvParser.ts` | RFC-4180 CSV parser + FPV assignment extractor |
| `src/data/sampleCsv.ts` | Hardcoded EDC Las Vegas 2026 shot list CSV |
| `src/types.ts` | TypeScript interfaces: `FpvAssignment`, `PilotConfig`, `FpvConfig`, `ProcessedCard` |
| `src/vite-env.d.ts` | `ElectronBridge` interface declaration for `window.electron` |
| `src/index.css` | Global styles — Tailwind v4 import + glassmorphism overrides + accent remaps |
| `vite.config.ts` | Vite config: React plugin, Tailwind plugin, `base: './'`, port 3000, `@` alias |
| `tsconfig.json` | TypeScript config: ES2022, strict, noUnusedLocals, noUnusedParameters |
| `package.json` | Scripts, electron-builder config, dependencies |

---

## 2. IPC HANDLERS

All handlers are in `main.cjs` via `ipcMain.handle()` (promise-returning, invoked by renderer).

---

### `validate-setup`
**Args:** `config: { localRootPath, mediaRootPath, bellaRootPath, sdCardDrive }`  
**Returns:** `{ valid: boolean, errors: string[], warnings: string[] }`  
**Logic:** Checks `fs.existsSync()` on all four paths. Missing local/SD = hard error. Missing media/Bella = warning only.  
**Called from:** Exposed in `preload.cjs` as `validateSetup()` but **never called from Dashboard.tsx or localServices.ts** — dead code in the renderer.

---

### `select-folder`
**Args:** none  
**Returns:** `string | null` (selected path, or null if canceled)  
**Logic:** `dialog.showOpenDialog({ properties: ['openDirectory'] })`  
**Called from:** Every "📁 Browse" button in Setup panel via `selectFolder()` in `localServices.ts`.

---

### `get-cursor-pos`
**Args:** none  
**Returns:** `{ x: number, y: number }` — screen coordinates from `screen.getCursorScreenPoint()`  
**Called from:** `calibration.html` renderer (via `ipcRenderer.invoke('get-cursor-pos')`) on each SPACE keypress.

---

### `automate-gopro`
**Args:** `rawPath: string, stabilizedPath: string, goproAppPath: string`  
**Returns:** `{ success: boolean, message: string }`  
**Logic:** Launches GoPro Player via `Start-Process "shell:AppsFolder\GoPro.GoProPlayer_1h9vz9xjm6b8c!App"`, waits 4s, writes `stabilizedPath` to clipboard, runs a PowerShell SendKeys script (`Ctrl+A`, `Tab`).  
**Status:** **LEGACY / DEAD CODE** — not called from Dashboard.tsx. Superseded by the robot automation.

---

### `launch-gopro-workflow`
**Args:** `rawPath: string, stabilizedPath: string`  
**Returns:** `{ success: boolean }`  
**Logic:** Writes `stabilizedPath` to clipboard, opens `rawPath` in Explorer via `shell.openPath()`, launches GoPro Player via PowerShell.  
**Status:** **LEGACY** — was the original manual workflow. Still in `preload.cjs` and `localServices.ts` but no longer called from `Dashboard.tsx`.

---

### `create-folders`
**Args:** `{ rawPath, stabilizedPath, mediaDrivePath, bellaSocialPath }`  
**Returns:** `{ success: boolean, message: string }`  
**Logic:** `fs.mkdirSync(..., { recursive: true })` for:
- `rawPath`
- `stabilizedPath`
- `mediaDrivePath\RAW`
- `mediaDrivePath\STABILIZED`
- `bellaSocialPath`

**Called from:** "Create directory paths" button and `handleCompleteCard()` in Dashboard.tsx, via `createLocalFolders()` in `localServices.ts`.

---

### `open-folder`
**Args:** `folderPath: string`  
**Returns:** `{ success: boolean }`  
**Logic:** `shell.openPath(folderPath)` — opens in Windows Explorer.  
**Called from:** Every "OPEN" button next to path rows in Dashboard.tsx, via `openFolderInExplorer()` in `localServices.ts`.

---

### `find-gopro-path`
**Args:** none  
**Returns:** `string | null` — absolute path or null  
**Logic:** Checks `C:\Program Files\GoPro\Player\GoPro Player.exe` and `C:\Program Files (x86)\...`, then falls back to `Get-StartApps | Where-Object Name -like '*GoPro*'` in PowerShell.  
**Status:** **DEAD CODE** — not exposed in `preload.cjs`, never called from renderer.

---

### `calibrate-robot`
**Args:** none  
**Returns:** `coords object | null` — the completed calibration coordinates, or null if aborted  
**Logic:**
1. Creates a fullscreen `BrowserWindow` (width/height = primary display size, `x:0, y:0`, `frame: false`, `transparent: true`, `alwaysOnTop: true`, `nodeIntegration: true`)
2. Loads `calibration.html`
3. Calls `calibWin.setIgnoreMouseEvents(true, { forward: true })` — overlay is click-through
4. Registers `globalShortcut` for `Space` → sends `space-captured` to calibration renderer
5. Registers `globalShortcut` for `Escape` → sends `escape-captured` to calibration renderer
6. Waits for `calibration-done` IPC message from renderer (returns coords or null)
7. On finish: unregisters shortcuts, closes window

**Called from:** "🎯 CALIBRATE GOPRO ROBOT" button in Setup panel, via `calibrateRobot()` in `localServices.ts`.

---

### `run-gopro-robot`
**Args:** `coords, rawPath: string, stabilizedPath: string, goProPath: string, goProOutputPath?: string`  
**Returns (immediately):** `{ success: boolean, message: string, robotStartTime: number }`  
**Then fires events asynchronously:**
- `gopro-robot-status` → `{ success: boolean, exitCode: number, error?: string }`
- `gopro-export-progress` → `{ fileCount, expectedCount, totalSizeMB, countLabel }`
- `gopro-export-complete` → `{ files: string[], fileCount, expectedCount, countLabel }`
- `gopro-export-error` → `{ error: string }`

**Logic:**
1. Destructures coords: `tenBit, hyperSmooth, smoothnessStart, smoothnessEnd, unGain, croppingStart, croppingEnd, aspectRatioOpen, aspectRatio8x7, start, dropZone, batchList`
2. Sets `robotStartTime = Date.now()`
3. Counts `expectedCount` = number of `.mp4` files in `rawPath`
4. `outputDir = goProOutputPath || 'C:\\Users\\Jason\\Videos'`
5. Writes PowerShell script to `%TEMP%\gopro_robot.ps1`
6. Spawns: `powershell -NoProfile -ExecutionPolicy Bypass -File <tmpScript>`
7. On PS exit code 0: sends `gopro-robot-status {success: true}`, then calls `waitForExportComplete()`
8. On PS exit code ≠ 0: sends `gopro-robot-status {success: false, error: stderrOutput}`

**Note:** `goProPath` parameter is accepted but **never used** in the PS script — GoPro is found via UIA.

---

### `move-exports`
**Args:** `{ stabilizedPath: string, robotStartTime: number }`  
**Returns:** `{ success: boolean, movedFiles?: string[], count?: number, error?: string }`  
**Logic:** Scans `C:\Users\Jason\Videos` (hardcoded) for `.mp4` files with `mtimeMs > robotStartTime`, moves them to `stabilizedPath`.  
**Status:** **LEGACY** — superseded by `move-stabilized-files`. Exposed in `preload.cjs` as `moveExports()` but Dashboard.tsx calls `moveStabilizedFiles()` instead.

---

### `move-stabilized-files`
**Args:** `{ videosFolder?: string, stabilizedFolder: string, robotStartTime: number }`  
**Returns:** `{ moved: number, files: string[], totalGB: number } | { success: false, error: string }`  
**Logic:**
1. `vDir = videosFolder || 'C:\\Users\\Jason\\Videos'`
2. Scans `vDir` for `.mp4` files with `mtimeMs >= robotStartTime`
3. Moves each to `stabilizedFolder` (tries `renameSync`, falls back to `copyFileSync + unlinkSync` for cross-drive)
4. Walks `path.dirname(stabilizedFolder)` recursively with `walkSize()` to sum all bytes
5. Returns `totalGB = bytes / 1024³`

**Called from:** `handleMoveExports()` in Dashboard.tsx after export completes.

---

### `copy-to-media`
**Args:** `{ localRawPath, localStabilizedPath, mediaDrivePath }`  
**Returns:** `{ success: boolean, message: string }`  
**Events emitted:** `media-copy-progress` (0–100 float)  
**Logic:** Two sequential `robocopy` runs:
1. `robocopy {localRawPath} {mediaDrivePath}\RAW /E /Z /W:5 /R:3` — progress emitted as `0 + pct * 0.5`
2. `robocopy {localStabilizedPath} {mediaDrivePath}\STABILIZED /E /Z /W:5 /R:3` — progress emitted as `50 + pct * 0.5`

---

### `copy-to-bella`
**Args:** `{ localStabilizedPath, bellaSocialPath }`  
**Returns:** `{ success: boolean, message: string }`  
**Events emitted:** `bella-copy-progress` (0–100 float)  
**Logic:** `robocopy {localStabilizedPath} {bellaSocialPath} /LEV:1 /Z /W:5 /R:3`  
`/LEV:1` = copy only top-level files, no subdirectories created inside the artist folder.

---

### `copy-sd-to-raw`
**Args:** `{ sdDriveLetter: string, targetRawPath: string }`  
**Returns:** `{ success: boolean, message: string, fileCount: number, sizeGB: string }`  
**Events emitted:** `robocopy-progress` (0–100 float)  
**Logic:** 
1. `source = sdDriveLetter.replace(/\\+$/, '') + '\\'`
2. `robocopy {source} {targetRawPath} /E /Z /W:5 /R:3`
3. Robocopy exit codes 0–7 = success; ≥ 8 = error
4. On success: calls `calculateFolderSizeGB(targetRawPath)` (recursive byte sum)
5. Returns `fileCount` = `fs.readdirSync(targetRawPath).length` (flat, not recursive)

---

### Helper: `waitForExportComplete(outputDir, robotStartTime, expectedCount, sender)`

Not an IPC handler — an async function called internally from `run-gopro-robot` after PS exits successfully.

**Constants:** `POLL_INTERVAL = 3000ms`, `MAX_WAIT = 3,600,000ms (60min)`, `STABLE_CHECKS = 3`

**Algorithm:**
1. Every 3 seconds, scan `outputDir` for `.mp4` files with `mtimeMs > robotStartTime`
2. If no files found: reset `stableCount` and `lastTotalSize`, continue
3. If files found: emit `gopro-export-progress` event with `{ fileCount, expectedCount, totalSizeMB, countLabel }`
4. `allPresent` = `files.length >= expectedCount` (or `> 0` if `expectedCount` is 0)
5. If all present AND `totalSize === lastTotalSize`: increment `stableCount`
   - If `stableCount >= 3`: emit `gopro-export-complete` and return
6. If sizes changed: reset `stableCount`, update `lastTotalSize`
7. After 60 minutes: emit `gopro-export-error { error: 'Export timed out after 60 minutes' }`
8. Checks `sender.isDestroyed()` before each send to handle window closure gracefully

---

## 3. UI / DASHBOARD

`Dashboard.tsx` is a single-file React component (~1700 lines). There is no React Router — the entire app is one view.

### State Variables

| Variable | Type | Default | Persisted | Purpose |
|----------|------|---------|-----------|---------|
| `config` | `FpvConfig` | (see §9) | `fpv_boss_config` | All settings: paths, pilots, coords |
| `csvText` | `string` | `SAMPLE_CSV_DATA` | `fpv_boss_csv_text` | Raw CSV content |
| `selectedDaySection` | `string` | `''` | `fpv_boss_selected_day` | Active day filter |
| `selectedPilot` | `string` | `''` | `fpv_boss_selected_pilot` | Active pilot filter |
| `currentCardNum` | `number` | from config | `fpv_boss_card_num` | Next card number |
| `history` | `ProcessedCard[]` | `[]` | `fpv_boss_history` | All logged cards |
| `sizeInput` | `string` | `'45 GB'` | `fpv_boss_size_input` | Card size for Google Sheets row |
| `notesInput` | `string` | `'Media Drive verified...'` | `fpv_boss_notes_input` | Notes for Google Sheets row |
| `skippedAssignments` | `string[]` | `[]` | `fpv_boss_skipped_assignments` | Keys of skipped assignments |
| `customAssignmentOverride` | `string` | `''` | no | Manual artist name override |
| `isSetupOpen` | `boolean` | `false` | no | Setup panel expanded state |
| `copiedStates` | `Record<string, boolean>` | `{}` | no | Clipboard feedback per button |
| `dragActive` | `boolean` | `false` | no | CSV drag-and-drop active |
| `copiedRawLocal` | `boolean` | `false` | no | Checklist item A |
| `gpsSettingsApplied` | `boolean` | `false` | no | Checklist item B |
| `verifiedFileCount` | `boolean` | `false` | no | Checklist item C |
| `isPickerOpen` | `boolean` | `false` | no | Assignment picker modal |
| `historyPilotFilter` | `string` | `'ALL'` | no | History table pilot filter |
| `copyProgress` | `number \| null` | `null` | no | SD → RAW copy percentage |
| `mediaCopyProgress` | `number \| null` | `null` | no | Media drive copy percentage |
| `bellaCopyProgress` | `number \| null` | `null` | no | Bella social copy percentage |
| `goProRobotStatus` | `'idle'\|'running'\|'success'\|'error'` | `'idle'` | no | Robot PS script status |
| `robotStartTime` | `number \| null` | `null` | no | Timestamp robot was launched |
| `moveExportsStatus` | `'idle'\|'moving'\|'success'\|'error'` | `'idle'` | no | File move status |
| `moveExportsResult` | `{ files, moved, totalGB? } \| null` | `null` | no | Result of file move |
| `moveExportsError` | `string \| null` | `null` | no | File move error message |
| `goProRobotError` | `string \| null` | `null` | no | PS robot stderr output |
| `goProExportStatus` | `'idle'\|'polling'\|'complete'\|'error'` | `'idle'` | no | Export poll state |
| `goProExportProgress` | `{ fileCount, expectedCount, totalSizeMB, countLabel } \| null` | `null` | no | Live export progress |
| `goProExportError` | `string \| null` | `null` | no | Export poll error message |

### Computed Values (useMemo)

| Variable | Formula |
|----------|---------|
| `allAssignments` | `extractFpvAssignments(csvText)` |
| `daySections` | Unique `daySection` values from `allAssignments` |
| `pilots` | Unique `pilot` values from `allAssignments` |
| `activeQueue` | Assignments matching `selectedDaySection` + `selectedPilot`, not in history as Complete, not in `skippedAssignments` |
| `activeAssignmentName` | `customAssignmentOverride` OR `activeQueue[0].assignment` OR `"NO ASSIGNMENTS IN QUEUE"` |
| `activeFlyTime` | From `activeQueue[0].flyTime` or `"Custom Set Time / Direct Entry"` |
| `activeNotes` | From `activeQueue[0].notes` |
| `activePilot` | `config.pilots[config.activePilotIndex]` |
| `currentCardId` | `{prefix}_{padded3}` e.g. `L_001` |
| `sanitizedEvent/Day/Pilot/Card/Artist` | All run through `cleanFolderName()` |
| `localRawPath` | `{localRootPath}\{event}\{day}\{pilot}\{cardId}_{artist}\RAW` |
| `localStabilizedPath` | `{localRootPath}\{event}\{day}\{pilot}\{cardId}_{artist}\STABILIZED` |
| `destinationMediaDrivePath` | `{mediaRootPath}\{cardId}` |
| `destinationBellaSocialPath` | `{bellaRootPath}\{sanitizedArtist}` |
| `mediaMasterLine` | `{cardId}\t{assignment}\t{sizeInput}\t{notesInput}` (tab-separated) |
| `statistics` | `{ completedCount, skippedCount, mixedCount, totalCount }` from history |
| `filteredHistory` | `history` filtered by `historyPilotFilter` |

### `cleanFolderName(input)` — Name Sanitizer

1. `toUpperCase().trim()`
2. Replace `[ \-\/\\:|]` with `_`
3. Remove `[^A-Z0-9_]`
4. Collapse `__+` to `_`
5. Trim leading/trailing `_`

### UI Sections

**Header**
- "Load sample EDC" button → `handleLoadSampleData()` — confirms, resets csvText to `SAMPLE_CSV_DATA`, sets day to `DAY 1 - FEST GROUNDS`, pilot to `Chris Teal`
- "Import CSV" label/input → `handleManualUpload()` — reads `.csv` file, updates `csvText`
- "Setup" button → toggles `isSetupOpen`
- App supports CSV drag-and-drop onto the entire workspace div (`handleDrag`, `handleDrop`)

**Setup Panel** (visible when `isSetupOpen === true`)
- 6 text inputs with Browse buttons: Event Name, Local Working Path, Media Drive Root, Bella Social Path, SD Card Drive, GoPro Output Folder
- Each Browse button calls `selectFolder()` → `ipcRenderer.invoke('select-folder')`
- Static indicator: "✓ GoPro Player detected — Microsoft Store App"
- **Pilots section**: add/remove pilots, edit name/prefix/startingCardNumber
- **"🎯 CALIBRATE GOPRO ROBOT"** → calls `calibrateRobot()` → `ipcRenderer.invoke('calibrate-robot')` → saves result to `config.robotCoords`
- Calibration status text (green/red) based on `config.robotCoords !== null`

**Metadata Filters Bar**
- Day/Section `<select>` → updates `selectedDaySection`, clears `customAssignmentOverride`
- Pilot `<select>` → updates `selectedPilot`, clears `customAssignmentOverride`
- Queue count badge (activeQueue.length)
- "CHOOSE FROM LIST" → opens picker modal

**Active Pilot Selector**
- Pilot buttons (one per `config.pilots`) → changes `activePilotIndex`, `selectedPilot`, `currentCardNum`
- Card number `<input type="number">` → direct edit of `currentCardNum`
- Reset button → `setCurrentCardNum(activePilot.startingCardNumber)`

**Hero Card Panel**
- Large `currentCardId` display (amber, 7xl–8xl)
- Large `activeAssignmentName` display (4xl–6xl)
- `activeNotes` block (if present)
- Override artist `<input>` → sets `customAssignmentOverride`; Clear button removes it
- **Tactical Rerouting** (3 buttons):
  - "🚨 SKIP SHOT" → `handleSkipAssignment()`: logs a Skip card, adds assignment key to `skippedAssignments`
  - "🔍 SELECT MANUALLY" → opens picker modal
  - "⚠️ MESSED CARD / FLAG MIXED" → `handleMixedUnclearCard()`: logs Mixed/Unclear, increments card num

**Computed Pathways Section**
- "Create directory paths" button → `createLocalFolders()`
- **LOCAL RAW** row: path display, "SD COPY" button, "OPEN" button, "COPY" button
  - "SD COPY" → `copySDtoRAW(config.sdCardDrive, localRawPath)` → `ipcRenderer.invoke('copy-sd-to-raw', ...)`
  - Shows progress bar while `copyProgress !== null`
- **LOCAL STAB** row: path display, "OPEN", "COPY"
- **MEDIA DRIVE** row: path display, "COPY TO MEDIA" button, "OPEN", "COPY"
  - "COPY TO MEDIA" → `copyToMedia(localRawPath, localStabilizedPath, destinationMediaDrivePath)` → `ipcRenderer.invoke('copy-to-media', ...)`
  - Shows progress bar while `mediaCopyProgress !== null`
- **BELLA SOCIAL** row: path display, "COPY TO BELLA" button, "OPEN", "COPY"
  - "COPY TO BELLA" → `copyToBella(localStabilizedPath, destinationBellaSocialPath)` → `ipcRenderer.invoke('copy-to-bella', ...)`
  - Shows progress bar while `bellaCopyProgress !== null`

**GoPro Settings Card**
- **"🤖 AUTO-RUN GOPRO BATCH"** button → `handleRunRobot()`
  - Resets all robot/export state
  - Calls `runGoProRobot(coords, localRawPath, localStabilizedPath, goProAppPath, goProOutputPath)` → `ipcRenderer.invoke('run-gopro-robot', ...)`
  - Sets `goProRobotStatus = 'running'`
- Status banners (conditional render):
  - `goProRobotStatus === 'running'` → amber pulsing "ROBOT IS RUNNING"
  - `goProRobotStatus === 'success' && moveExportsStatus !== 'success'` → green "Robot clicked Start — monitoring export..." (or "complete" text when export done)
  - `goProRobotStatus === 'success' && moveExportsStatus === 'success'` → green "GoPro export sequence completed"
  - `goProRobotStatus === 'error'` → rose panel; special message if error includes `'Export Queue window not found'`
- **Export waiting panel** (visible when `goProRobotStatus === 'success' && moveExportsStatus !== 'success' && robotStartTime !== null`):
  - `goProExportStatus === 'idle' || 'polling'` → amber pulsing "⏳ EXPORTING... {countLabel} — {totalSizeMB} MB" or "WAITING FOR GOPRO EXPORT TO START..."
  - `goProExportStatus === 'complete'` → green banner + "✅ MOVE FILES TO STABILIZED FOLDER" button → `handleMoveExports()`
  - `goProExportStatus === 'error'` → rose panel with error text + "MOVE FILES MANUALLY" button
  - `moveExportsStatus === 'error'` → additional rose error panel
- **Move complete result** (visible when `moveExportsStatus === 'success'`): shows moved count, totalGB, file list
- Static settings display: HEVC 10-Bit, 8:7 view, Smoothness 15, Cropping 15

**Master Row Logs (Google Sheets Panel)**
- `sizeInput` text field — populated automatically by `handleMoveExports()` when `totalGB` is returned
- `notesInput` text field
- `mediaMasterLine` display: `{cardId}\t{assignment}\t{sizeInput}\t{notesInput}`
- "📋 COPY ROW FOR GOOGLE SHEETS" → `navigator.clipboard.writeText(mediaMasterLine)`

**Complete Card Button**
- "🚀 COMPLETE CURRENT CARD & SHIFT TO NEXT" → `handleCompleteCard()`
  - Validates `activeAssignmentName !== "NO ASSIGNMENTS IN QUEUE"`
  - Adds to `history`, calls `createLocalFolders()`, increments `currentCardNum`, resets checklist

**Session Card Log**
- Stats: completed/skipped/flagged counts
- "Clear all" → `handleResetWorkflow()` — clears history, resets card num
- Fatigue checklist (3 clickable items): A. RAW Storage Complete, B. GoPro Settings Applied, C. Deliverables Confirmed — all reset on `resetInteractiveChecklist()`
- Pilot filter pills (ALL + one per configured pilot)
- History table: Card ID, Pilot, Artist, Size, Status badge, Time, Delete button
- "📋 COPY ALL DUMP VALUES" → copies all Complete card `mediaMasterLine` values joined by `\n`

**Assignment Picker Modal** (when `isPickerOpen === true`)
- Lists all `activeQueue` assignments with flyTime
- Click → `handlePickAssignment(assignment)` → sets `customAssignmentOverride`, closes modal

### `handleRunRobot()` Full Flow

```typescript
setGoProRobotStatus('running')
setGoProRobotError(null)
setMoveExportsStatus('idle')
setMoveExportsResult(null)
setMoveExportsError(null)
setGoProExportStatus('idle')
setGoProExportProgress(null)
setGoProExportError(null)
setRobotStartTime(Date.now())
await runGoProRobot(config.robotCoords, localRawPath, localStabilizedPath, config.goProAppPath, config.goProOutputPath || 'C:\\Users\\Jason\\Videos')
```

### `handleMoveExports()` Full Flow

```typescript
setMoveExportsStatus('moving')
result = await window.electron.moveStabilizedFiles({
  videosFolder: config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
  stabilizedFolder: localStabilizedPath,
  robotStartTime,  // from React state
})
if (!result.error) → setMoveExportsResult, setSizeInput(totalGB), setMoveExportsStatus('success')
else → setMoveExportsError, setMoveExportsStatus('error')
```

---

## 4. GOPRO AUTOMATION

### Full PowerShell Robot Sequence

The script is a JavaScript template literal in `main.cjs`, written to `%TEMP%\gopro_robot.ps1` and executed via `spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript])`.

**C# class `MouseRobot` defined via `Add-Type -TypeDefinition`:**
- `SetCursorPos(int X, int Y)` — moves cursor to absolute screen coordinates
- `mouse_event(uint dwFlags, ...)` — fires raw mouse input (`0x02` = LEFTDOWN, `0x04` = LEFTUP)
- `SetForegroundWindow(IntPtr hWnd)` — brings window to foreground
- `ShowWindow(IntPtr hWnd, int nCmdShow)` — restores/maximizes window (`9` = SW_RESTORE)
- `FindWindow(string className, string windowName)` — **defined but never called in script**
- `SendMessage(IntPtr hWnd, ...)` — **defined but never called in script**
- `GetWindowRect(IntPtr hWnd, out RECT)` — **defined but never called in script**
- `GetCursorPos(out POINT)` — **defined but never called in script**
- `Click(int x, int y)` — helper: SetCursorPos + 120ms + LEFTDOWN + 60ms + LEFTUP
- `TripleClick(int x, int y)` — **defined but never called in script**

**PowerShell helper `Click-GoPro {x, y, delayMs=500}`:**
- `SetForegroundWindow($script:goProHwnd)` + 100ms sleep
- `SetCursorPos(x, y)` + 120ms
- `mouse_event(0x02)` + 60ms + `mouse_event(0x04)`
- Sleep `delayMs` ms

---

**Step 1 — Find Export Queue window (UIA)**
```powershell
# Polls up to 20 times × 500ms = 10s
$eqCondition = NameProperty == "Export Queue"
$win = $uiaRoot.FindFirst(TreeScope::Children, $eqCondition)
```
Fallback: scans all top-level windows for name matching `GoPro|Export Queue`.  
On failure: `Write-Error "Export Queue window not found..."` + `exit 1`  
On success: stores `$script:goProHwnd`, calls `ShowWindow(hwnd, 9)` + `SetForegroundWindow` + 800ms sleep.

---

**Step 2 — Define Click-GoPro helper** (see above)

---

**Step 3 — Open Explorer at RAW folder**
```powershell
Start-Process explorer.exe -ArgumentList $rawPath
Start-Sleep -Milliseconds 2000
```

---

**Step 4 — Find Explorer window via UIA**
```powershell
# Polls up to 10 times × 500ms = 5s
foreach ($w in $allWins) {
    if ($w.Current.ClassName -eq "CabinetWClass") { $explorerEl = $w; break }
}
```
On failure: `Write-Error "ERROR: Explorer window not found via UIA"` + `exit 1`  
On success: `SetForegroundWindow($explorerHwnd)` + 500ms

---

**Step 5 — Select all files in Explorer**
```powershell
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500
```

---

**Step 6 — Get drag origin from first ListItem bounding rect**
```powershell
# Finds ControlType::List descendant of Explorer window
# Then finds first ControlType::ListItem child of that list
$itemRect = $firstItem.Current.BoundingRectangle
$dragX = [int]($itemRect.X + $itemRect.Width / 2)
$dragY = [int]($itemRect.Y + $itemRect.Height / 2)
```
On failure (no List or no ListItem): `Write-Error` + `exit 1`  
Logs: `Add-Content "$env:TEMP\gopro_robot_log.txt" "Drag start: $dragX, $dragY from item $name"`

---

**Step 7-8 — Drag files to GoPro drop zone**
```powershell
$dropX = ${dropZone.x}
$dropY = ${dropZone.y}
SetCursorPos($dragX, $dragY) → sleep 300ms
mouse_event(0x02) [LEFTDOWN] → sleep 500ms
# 30-step linear interpolation over 1500ms (30 × 50ms)
for ($step = 1; $step -le 30; $step++) {
    $t = $step / 30.0
    SetCursorPos(dragX + (dropX-dragX)*t, dragY + (dropY-dragY)*t)
    sleep 50ms
}
mouse_event(0x04) [LEFTUP]
Start-Sleep -Milliseconds 18000  # Wait 18s for GoPro to ingest files
```

---

**Step 9 — Select all files in GoPro queue**
```powershell
Click-GoPro -x ${batchList.x} -y ${batchList.y} -delayMs 500
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500
```

---

**Step 10 — Enable HyperSmooth**
```powershell
Click-GoPro -x ${hyperSmooth.x} -y ${hyperSmooth.y} -delayMs 800
```
*Note: 10-Bit is already the default — `tenBit` coords are captured in calibration but intentionally not clicked here.*

---

**Step 11 — Click un-gain (unlink smoothness/cropping)**
```powershell
Click-GoPro -x ${unGain.x} -y ${unGain.y} -delayMs 800
```

---

**Step 12 — Drag smoothness slider 50→15**
```powershell
SetForegroundWindow($script:goProHwnd) → sleep 100ms
SetCursorPos(${smoothnessStart.x}, ${smoothnessStart.y}) → sleep 200ms
mouse_event(0x02) [LEFTDOWN] → sleep 200ms
# 15-step interpolation (15 × 30ms = 450ms)
for ($s = 1; $s -le 15; $s++) {
    $t = $s / 15.0
    SetCursorPos(start.x + (end.x-start.x)*t, start.y + (end.y-start.y)*t)
    sleep 30ms
}
mouse_event(0x04) [LEFTUP]
sleep 800ms
```
Logs: `"Smoothness dragged from x,y to x,y"`

---

**Step 13 — Drag cropping slider 50→15**
Same structure as Step 12 using `${croppingStart.x/y}` → `${croppingEnd.x/y}`. Logs: `"Cropping dragged from x,y to x,y"`.

---

**Step 14 — Open aspect ratio dropdown**
```powershell
Click-GoPro -x ${aspectRatioOpen.x} -y ${aspectRatioOpen.y} -delayMs 800
```

---

**Step 15 — Select 8:7**
```powershell
Click-GoPro -x ${aspectRatio8x7.x} -y ${aspectRatio8x7.y} -delayMs 800
```

---

**Step 16 — Click Start Export**
```powershell
Click-GoPro -x ${start.x} -y ${start.y} -delayMs 1000
```

Script ends. Node.js then calls `waitForExportComplete()`.

**PS script log file:** `$env:TEMP\gopro_robot_log.txt` (appended to, never cleared by the app)

---

## 5. CALIBRATION SYSTEM

### Overview

Calibration captures 12 absolute screen coordinates and stores them in `config.robotCoords` (persisted to `localStorage` via `fpv_boss_config`).

### The 12 Calibration Steps

| Index | Key | Instruction |
|-------|-----|-------------|
| 0 | `batchList` | Cursor over the Export Queue file list area |
| 1 | `tenBit` | Cursor over 10-Bit Color checkbox (**captured but never clicked by robot**) |
| 2 | `hyperSmooth` | Cursor over HyperSmooth mode toggle |
| 3 | `unGain` | Cursor over the un-gain chain button between Smoothness and Cropping |
| 4 | `smoothnessStart` | Smoothness slider thumb at **value 50** (center/default) |
| 5 | `smoothnessEnd` | Smoothness slider thumb at **value 15** (drag left from 50) |
| 6 | `croppingStart` | Cropping slider thumb at **value 50** (center/default) |
| 7 | `croppingEnd` | Cropping slider thumb at **value 15** (drag left from 50) |
| 8 | `aspectRatioOpen` | Cursor over Aspect Ratio dropdown |
| 9 | `aspectRatio8x7` | Cursor over 8:7 option in the open dropdown |
| 10 | `dropZone` | Cursor over main drop area of GoPro Player (empty batch area) |
| 11 | `start` | Cursor over Start Export button |

### Calibration Window (`calibration.html`)

- BrowserWindow: `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `nodeIntegration: true`, `contextIsolation: false`
- `setIgnoreMouseEvents(true, { forward: true })` — overlay is completely click-through; all mouse events pass to apps below
- Space presses caught via `globalShortcut.register('Space')` in main process → forwarded to renderer as `space-captured` IPC event
- On `space-captured`: calls `ipcRenderer.invoke('get-cursor-pos')` to get actual cursor position (screen coordinates), stores in `coords[steps[current].key]`, shows ripple animation at `mouseX/mouseY` (local to overlay), advances `current`
- Escape via `globalShortcut.register('Escape')` → `escape-captured` → sends `calibration-done(null)` → main resolves promise with `null`
- After step 11 (current === 12): sends `calibration-done(coords)` → main resolves with full coords object
- UI: dots progress indicator (12 dots, active = pulsing amber, done = green), step number, step label, hint text

### Coord Storage

```javascript
config.robotCoords = {
  batchList:        { x: number, y: number },
  tenBit:           { x: number, y: number },  // stored but unused
  hyperSmooth:      { x: number, y: number },
  unGain:           { x: number, y: number },
  smoothnessStart:  { x: number, y: number },
  smoothnessEnd:    { x: number, y: number },
  croppingStart:    { x: number, y: number },
  croppingEnd:      { x: number, y: number },
  aspectRatioOpen:  { x: number, y: number },
  aspectRatio8x7:   { x: number, y: number },
  dropZone:         { x: number, y: number },
  start:            { x: number, y: number },
}
```

Persisted inside `config` object to `localStorage['fpv_boss_config']` as JSON. Typed as `any` in `FpvConfig`.

---

## 6. FILE OPERATIONS

### Path Construction

All paths constructed in Dashboard.tsx via `useMemo`. All components sanitized via `cleanFolderName()`.

```
localRawPath        = {localRootPath}\{EVENT}\{DAY}\{PILOT}\{CARD}_{ARTIST}\RAW
localStabilizedPath = {localRootPath}\{EVENT}\{DAY}\{PILOT}\{CARD}_{ARTIST}\STABILIZED
destinationMediaDrivePath = {mediaRootPath}\{CARD}
destinationBellaSocialPath = {bellaRootPath}\{ARTIST}
```

**Example with defaults:**
```
D:\EDC2026\DAY_1_FEST_GROUNDS\CHRIS_TEAL\L_001_FISHER\RAW
D:\EDC2026\DAY_1_FEST_GROUNDS\CHRIS_TEAL\L_001_FISHER\STABILIZED
M:\L_001
S:\FISHER
```

### SD → RAW Copy (`copy-sd-to-raw`)

```powershell
robocopy E:\ D:\...\RAW /E /Z /W:5 /R:3
# /E = copy subdirs incl. empty
# /Z = restartable mode
# /W:5 = wait 5s between retries
# /R:3 = 3 retries on failure
```

Progress regex: `/(\d+\.?\d*)\s*%/` applied to stdout → emits `robocopy-progress` event.  
Robocopy exit codes 0–7 = success. ≥ 8 = error.  
`fileCount` is a flat `readdirSync` count (not recursive — misses files in subdirectories).  
`sizeGB` from `calculateFolderSizeGB()` — recursive byte sum divided by 1,073,741,824.

### Folder Creation (`create-folders`)

Creates exactly 5 directories:
1. `rawPath`
2. `stabilizedPath`
3. `mediaDrivePath\RAW`
4. `mediaDrivePath\STABILIZED`
5. `bellaSocialPath`

Uses `fs.mkdirSync(path, { recursive: true })`. Will silently succeed if paths already exist.

### Media Drive Copy (`copy-to-media`)

Two-phase robocopy with combined progress bar:
- Phase 1: `robocopy {localRaw} {media}\RAW /E /Z /W:5 /R:3` → progress `0 + pct * 0.5`
- Phase 2: `robocopy {localStab} {media}\STABILIZED /E /Z /W:5 /R:3` → progress `50 + pct * 0.5`

### Bella Social Copy (`copy-to-bella`)

```powershell
robocopy {localStabilizedPath} {bellaSocialPath} /LEV:1 /Z /W:5 /R:3
```

`/LEV:1` = only top-level files, no subdirectories. Ensures only `.mp4` exports land in artist folder, not any subfolders that might be in STABILIZED.

### Move Exported Files (`move-stabilized-files`)

1. Scans `videosFolder` (default `C:\Users\Jason\Videos`) for `.mp4` files with `mtimeMs >= robotStartTime`
2. For each match: tries `fs.renameSync(src, dest)` first (fast, same drive)
   - Falls back to `fs.copyFileSync(src, dest) + fs.unlinkSync(src)` (cross-drive)
3. Walks `path.dirname(stabilizedFolder)` recursively with `walkSize()` → returns `totalGB`
   - `path.dirname(stabilizedFolder)` = the card folder containing both RAW and STABILIZED

---

## 7. GOOGLE SHEETS INTEGRATION

### Current State: Manual Copy-Paste Only

There is **no live Google Sheets API integration** in the running application despite `credentials.json` being present.

### What Actually Happens

1. After `handleMoveExports()` succeeds and `totalGB` is returned, `sizeInput` is auto-populated: `setSizeInput(result.totalGB.toFixed(2) + ' GB')`
2. `mediaMasterLine` is computed: `` `${currentCardId}\t${activeAssignmentName}\t${sizeInput.trim()}\t${notesInput.trim()}` ``
3. "📋 COPY ROW FOR GOOGLE SHEETS" button → `navigator.clipboard.writeText(mediaMasterLine)`
4. Operator manually pastes this tab-separated string into Google Sheets

### Bulk Copy

"📋 COPY ALL DUMP VALUES" → joins all `Complete` history items' `mediaMasterLine` values with `\n` → copies to clipboard for multi-row paste.

### `credentials.json` Contents

- Type: Google service account
- Project ID: `fpv-card-boss`
- Service account email: `fpv-card-boss@fpv-card-boss.iam.gserviceaccount.com`
- Contains a private key (`RSA 2048`)
- **This file is NOT included in the electron-builder package** (not listed in `build.files` in `package.json`)
- **No Google API client library is installed** (`googleapis`, `google-auth-library`, etc. are absent from `package.json`)

---

## 8. CSV PARSER

### `parseCSV(text: string): string[][]`

RFC-4180 compliant state machine parser:
- Tracks `inQuotes` boolean state
- `""` inside quotes = literal quote character (escaped quote handling)
- Handles both `\r\n` and `\n` line endings
- Returns array of rows, each row is array of cell strings

### `extractFpvAssignments(rawCsvText: string): FpvAssignment[]`

**Header detection:** Scans rows for one containing `"ARTIST / CONTENT"` — this marks the true column header row.

**Column detection (by header text):**
| Column | Search string | Fallback index |
|--------|--------------|----------------|
| `artistColIndex` | `"ARTIST / CONTENT"` | 0 |
| `assigneeColIndex` | `"ASSIGNEE"` | 3 |
| `flyTimeColIndex` | `"FLY TIME"` | 4 |
| `notesColIndex` | `"NOTES"` | 8 |

**Day section detection:** Row where `row[0]` matches `/\bDAY\b/i` AND all other columns are empty AND `row[0].length > 3`.

**Stop condition:** Row where `row[0].toLowerCase() === "day 1"` AND `row[1].toLowerCase() === "day 1"` — this is the summary footer grid.

**Row filters (skipped):**
- Empty artist or empty assignee
- `artistLower === "guidelines"` or starts with `"guidelines:"`
- `artistLower === "call times"` or starts with `"call times:"`
- `artistLower === "move to main fest grounds"`

**Output shape:**
```typescript
interface FpvAssignment {
  daySection: string;  // e.g. "DAY 1 - FEST GROUNDS"
  pilot: string;       // from ASSIGNEE column
  assignment: string;  // from ARTIST/CONTENT column
  flyTime: string;     // from FLY TIME column
  notes: string;       // from NOTES column
}
```

**Sample data** (`sampleCsv.ts`) includes these day sections: `DAY 0 - CAMP EDC`, `DAY 1 - CAMP EDC`, `DAY 1 - FEST GROUNDS`, `DAY 2 - FEST GROUNDS`  
And pilots: `Michael Jennings`, `Chris Teal`, `Collin O'Malley`

---

## 9. CONFIG / STATE

### `FpvConfig` Interface

```typescript
interface FpvConfig {
  eventName: string;          // e.g. "EDC2026" → sanitized for folder names
  pilots: PilotConfig[];      // array of pilot objects
  activePilotIndex: number;   // index into pilots[]
  localRootPath: string;      // e.g. "D:"
  mediaRootPath: string;      // e.g. "M:"
  bellaRootPath: string;      // e.g. "S:"
  sdCardDrive: string;        // e.g. "E:\\"
  goProAppPath: string;       // legacy, passed to run-gopro-robot but unused
  goProOutputPath?: string;   // default "C:\\Users\\Jason\\Videos"
  robotCoords: any;           // null or { batchList, tenBit, hyperSmooth, ... }
}

interface PilotConfig {
  name: string;               // must match ASSIGNEE column in CSV
  cardPrefix: string;         // 1-2 chars, e.g. "L" → "L_001"
  startingCardNumber: number; // card counter resets to this when pilot is selected
}
```

### Default Config Values

```javascript
{
  eventName: 'EDC2026',
  pilots: [{ name: 'Pilot 1', cardPrefix: 'L', startingCardNumber: 1 }],
  activePilotIndex: 0,
  localRootPath: 'D:',
  mediaRootPath: 'M:',
  bellaRootPath: 'S:',
  sdCardDrive: 'E:\\',
  goProAppPath: '',
  goProOutputPath: 'C:\\Users\\Jason\\Videos',
  robotCoords: null,
}
```

### localStorage Keys

| Key | Value | Notes |
|-----|-------|-------|
| `fpv_boss_config` | JSON-serialized `FpvConfig` | Includes `robotCoords` — recalibrate if you change monitor layout |
| `fpv_boss_csv_text` | Raw CSV string | Can be very large for full shot lists |
| `fpv_boss_selected_day` | string | Survives app restart |
| `fpv_boss_selected_pilot` | string | Survives app restart |
| `fpv_boss_card_num` | stringified integer | Survives app restart |
| `fpv_boss_history` | JSON-serialized `ProcessedCard[]` | Full session history |
| `fpv_boss_size_input` | string e.g. `"47.23 GB"` | Survives app restart |
| `fpv_boss_notes_input` | string | Survives app restart |
| `fpv_boss_skipped_assignments` | JSON-serialized `string[]` | Format: `"{day}\|{pilot}\|{assignment}"` |

### `ProcessedCard` Interface

```typescript
interface ProcessedCard {
  id: string;              // e.g. "L_001"
  cardPrefix: string;      // e.g. "L"
  cardNumber: number;      // e.g. 1
  assignment: string;      // artist/assignment name
  daySection: string;
  pilot: string;
  flyTime: string;
  status: 'Selected' | 'Skip' | 'Mixed/Unclear' | 'Complete';
  size: string;            // e.g. "47.23 GB"
  notes: string;
  rawPath: string;         // full absolute path
  stabilizedPath: string;
  mediaDrivePath: string;
  bellaSocialPath: string;
  mediaMasterLine: string; // tab-separated Google Sheets row
  timestamp: string;       // e.g. "03:47 AM"
}
```

---

## 10. WHAT IS BROKEN OR INCOMPLETE

### Dead Code (IPC Handlers That Exist But Are Unused From Renderer)

| Handler | Status | Reason |
|---------|--------|--------|
| `automate-gopro` | Dead code | Legacy; SendKeys approach abandoned for robot |
| `launch-gopro-workflow` | Dead code | Still in `preload.cjs`/`localServices.ts` but not called from Dashboard.tsx |
| `find-gopro-path` | Dead code | Not in `preload.cjs`; never called from renderer |
| `move-exports` | Superseded | Older version of `move-stabilized-files` without `totalGB`; still in `preload.cjs` but Dashboard uses `moveStabilizedFiles` |

### Unused Calibration Data

- `tenBit` coordinate is captured in step 1 (index 1) of calibration and stored in `config.robotCoords`
- It is destructured in `run-gopro-robot`: `const { tenBit, ...} = coords`
- But `${tenBit.x}` / `${tenBit.y}` never appear in the PS script
- Comment in script: `# Step 2 — Click HyperSmooth Pro toggle (10-bit is already default — NOT clicked)`
- **Intentional**: 10-bit is already the GoPro default; the step was pre-planned but deliberately skipped

### Unused C# Methods in PS Script

These are declared in the `MouseRobot` class but never invoked:
- `FindWindow(string className, string windowName)`
- `SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam)`
- `GetWindowRect(IntPtr hWnd, out RECT lpRect)`
- `GetCursorPos(out POINT lpPoint)` — was used in old slider-click code; left in after refactor
- `TripleClick(int x, int y)`
- `Click(int x, int y)` — the `Click()` helper exists but the script uses `mouse_event(0x02/0x04)` directly via `Click-GoPro` PS function instead

### Unused Parameter

- `goProPath` is passed to `run-gopro-robot` IPC handler as the 4th argument
- It is received: `async (event, coords, rawPath, stabilizedPath, goProPath, goProOutputPath)`
- But `$goProPath` or `${goProPath}` never appears in the PS script template
- GoPro is now found via UIA (window name search), not by launching from a path

### Unused Field

- `config.goProAppPath` is part of `FpvConfig`, stored to localStorage, but its value (`''` by default) is passed as `goProPath` to `runGoProRobot()` and then ignored

### Credentials File

- `credentials.json` — Google service account with a private RSA key for project `fpv-card-boss`
- **No Google Sheets API code exists anywhere in the project**
- Not bundled in the electron-builder output (not listed in `package.json` `build.files`)
- **Security note**: This file contains a live private key and is sitting in the project root unencrypted

### `validateSetup` in Preload But Not Dashboard

- `validateSetup(config)` is exposed in `preload.cjs`
- Typed in `vite-env.d.ts`... wait, actually `validateSetup` is NOT in `vite-env.d.ts` — only exposed in `preload.cjs` raw
- Never called from Dashboard.tsx, never called from `localServices.ts`
- No setup validation UI exists

### `fileCount` Calculation in `copy-sd-to-raw`

```javascript
const files = fs.readdirSync(targetRawPath);  // flat read only
if (files.length === 0) { reject(...) }
else { resolve({ fileCount: files.length, sizeGB }) }
```
`files.length` is a flat count of entries in the root of `targetRawPath` — if GoPro stores files in subdirectories (e.g. `DCIM/GoPro/`), this will return 1 (just the `DCIM` folder) instead of the actual file count.

### Robot Log File Never Cleared

`$env:TEMP\gopro_robot_log.txt` is appended to (`Add-Content`) on every robot run. It is never cleared, truncated, or rotated. Over many runs this file grows indefinitely.

### `robotStartTime` Potential Skew

In `handleRunRobot()`, `setRobotStartTime(Date.now())` is called in the renderer BEFORE the IPC round trip to main completes. The `robotStartTime` used by `waitForExportComplete()` in main is `Date.now()` set at the START of the main-process handler. These two values will differ by the IPC round-trip time (~1–5ms). Functionally equivalent, but the `robotStartTime` stored in React state (used by `handleMoveExports`) is slightly EARLIER than the one used for polling. This means `move-stabilized-files` is slightly more inclusive in which files it picks up.

### TypeScript `any` Usage

- `config.robotCoords: any` in `FpvConfig`
- `calibrateRobot(): Promise<any>` in `localServices.ts`
- `runGoProRobot(coords: any, ...)` in `localServices.ts`
- No type safety on coord object shape — a miscalibration (wrong number of steps) would not be caught at compile time

### `CardStatus` Unused Value

```typescript
export type CardStatus = 'Selected' | 'Skip' | 'Mixed/Unclear' | 'Complete';
```
`'Selected'` is defined but never assigned in the codebase. Cards are only ever logged as `'Skip'`, `'Mixed/Unclear'`, or `'Complete'`.

---

## 11. BUILD SYSTEM

### Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts Vite dev server on port 3000 |
| `npm run dev:electron` | Runs Vite + waits for port 3000 + starts `electron .` (concurrently) |
| `npm run build` | Vite build only → `dist/` |
| `npm run lint` | `tsc --noEmit` (type check only) |
| `npm run build:exe` | `tsc --noEmit && vite build && electron-builder --win` |

### `build:exe` Pipeline

```
tsc --noEmit          → TypeScript type check (fails build on type errors)
        ↓
vite build            → Bundles renderer into dist/
  dist/index.html
  dist/assets/index-*.css   (~86 KB, ~17 KB gzip)
  dist/assets/index-*.js    (~262 KB, ~76 KB gzip)
        ↓
electron-builder --win → Packages Electron app
```

### electron-builder Configuration (`package.json` → `"build"` field)

```json
{
  "appId": "com.fpvcardboss.app",
  "productName": "FPV Card Boss",
  "directories": {
    "output": "C:/Temp/fpv-card-boss-release"
  },
  "win": {
    "target": ["portable"]
  },
  "files": [
    "dist/**/*",
    "main.cjs",
    "preload.cjs",
    "calibration.html"
  ]
}
```

### What Gets Packaged

| Included | Notes |
|----------|-------|
| `dist/**/*` | Vite-bundled renderer (HTML + CSS + JS) |
| `main.cjs` | Electron main process |
| `preload.cjs` | Context bridge |
| `calibration.html` | Calibration overlay (standalone HTML) |
| `node_modules` (Electron native) | `@esbuild/win32-x64` — electron-builder re-bundles |

| NOT Included | Notes |
|-------------|-------|
| `credentials.json` | Not listed in `build.files` — intentional or oversight? |
| `src/` | Source files not needed in production |
| `package.json` / `tsconfig.json` | Dev config only |

### Output Location

`C:\Temp\fpv-card-boss-release\`
- `FPV Card Boss 1.2.0.exe` — portable single-file executable (~150 MB)
- `win-unpacked\` — unpacked app directory (used for signing intermediate files)

### Signing

`electron-builder` calls `signtool.exe` on:
1. `win-unpacked\FPV Card Boss.exe`
2. `win-unpacked\resources\app.asar.unpacked\node_modules\@esbuild\win32-x64\esbuild.exe`
3. `win-unpacked\resources\elevate.exe`
4. `FPV Card Boss 1.2.0.exe`

This uses whatever code-signing certificate is configured in the build environment.

### Known Build Warning

```
[DEP0190] DeprecationWarning: Passing args to a child process with shell option
true can lead to security vulnerabilities, as the arguments are not escaped,
only concatenated.
```

Origin: `electron-builder` internal tooling. Not from project code. Harmless for local builds.

### Duplicate Dependency Warning

electron-builder logs many `duplicate dependency references` for `@babel/*`, `vite`, `react-dom`, etc. These are from Vite's own dependencies bundled inside `node_modules` — harmless duplicates in the ASAR, not runtime errors.

---

## APPENDIX: Key Channel Names Reference

```
IPC Invoke Channels (renderer → main):
  'validate-setup'
  'select-folder'
  'get-cursor-pos'
  'automate-gopro'          (unused from renderer)
  'launch-gopro-workflow'   (unused from renderer)
  'create-folders'
  'open-folder'
  'find-gopro-path'         (not in preload, truly dead)
  'calibrate-robot'
  'run-gopro-robot'
  'move-exports'            (superseded, unused from renderer)
  'move-stabilized-files'
  'copy-to-media'
  'copy-to-bella'
  'copy-sd-to-raw'

IPC Send Channels (main → renderer, event-style):
  'robocopy-progress'       (float 0-100)
  'media-copy-progress'     (float 0-100)
  'bella-copy-progress'     (float 0-100)
  'gopro-robot-status'      ({ success, exitCode, error? })
  'gopro-export-progress'   ({ fileCount, expectedCount, totalSizeMB, countLabel })
  'gopro-export-complete'   ({ files[], fileCount, expectedCount, countLabel })
  'gopro-export-error'      ({ error })

IPC Send Channels (renderer → main, fire-and-forget):
  'calibration-done'        (coords object or null)
```
