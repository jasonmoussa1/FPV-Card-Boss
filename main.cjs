const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
// In production the server is bundled (express + ws inlined) so node_modules is
// not needed in the asar; in dev we fall back to the raw source.
let createDashboard;
try { ({ createDashboard } = require('./dashboardServer.bundled.cjs')); }
catch { ({ createDashboard } = require('./dashboardServer.cjs')); }

// ── Live mobile dashboard: shared state ──────────────────────────────────────
let mainWindow = null;
let dashboard = null;
let dashboardPort = 8723;

// Status object broadcast to all connected phones.
const status = {
  state: 'idle',          // 'idle' | 'running' | 'complete' | 'error'
  cardId: '',
  pilotName: '',
  artistName: '',
  fileCount: 0,
  expectedCount: 0,
  totalSizeMB: 0,
  countLabel: '',
  moveMode: 'manual',     // 'auto' | 'manual'  (default manual = existing behavior)
  lastMovedCount: 0,
  lastActivity: '',
  // ── Per-destination delivery state (reported live by the desktop renderer) ──
  // Lets the phone show the same end-of-flow actions as the GoPro batch player:
  // Copy to Media Drive, Copy to Bella Drive, Dump Raws, Complete Card & Shift.
  mode: 'festival',       // 'festival' (GoPro batch player) | 'simple'
  mediaAvailable: false,  // media toggle on AND files moved to STABILIZED
  mediaState: 'idle',     // 'idle' | 'copying' | 'success' | 'error'
  mediaDest: '',
  mediaHint: '',          // why it's disabled (shown on the phone when unavailable)
  bellaAvailable: false,  // bella toggle on AND files moved AND artist assigned
  bellaState: 'idle',
  bellaDest: '',
  bellaHint: '',
  dumpAvailable: false,   // a pilot is selected AND a Raw Dump Folder is configured
  dumpState: 'idle',      // 'idle' | 'dumping' | 'success' | 'error'
  dumpDest: '',
  dumpHint: '',
  completeAvailable: false, // a real assignment is in the queue
  completeHint: '',
};

// Fields the desktop renderer is allowed to push into `status` via
// 'dashboard-report-state'. Keeps the phone's delivery buttons in lock-step with
// the desktop without letting the renderer overwrite transport/job fields.
const REPORTABLE_FIELDS = new Set([
  'mode',
  // Top-level workflow status + card context. The desktop renderer owns the real
  // lifecycle (robot → export → move), so it reports these and the phone mirrors
  // exactly what the operator sees — even for flows main's robot path never saw.
  'state',
  'cardId', 'pilotName', 'artistName',
  'fileCount', 'expectedCount', 'totalSizeMB', 'countLabel',
  'lastMovedCount', 'lastActivity',
  'mediaAvailable', 'mediaState', 'mediaDest', 'mediaHint',
  'bellaAvailable', 'bellaState', 'bellaDest', 'bellaHint',
  'dumpAvailable', 'dumpState', 'dumpDest', 'dumpHint',
  'completeAvailable', 'completeHint',
]);

// Shot list (CSV assignments + per-shot status) reported by the desktop renderer
// and served to the phone at GET /shotlist for view-only browsing.
let shotlist = [];

// Active job context — main keeps its OWN copy so it can move files (auto / from
// the phone) without depending on the renderer's React state.
let activeJob = null;     // { stabilizedFolder, videosFolder, robotStartTime, expectedCount, cardId, pilotName, artistName }

function dashboardConfigPath() {
  try { return path.join(app.getPath('userData'), 'dashboard-config.json'); } catch { return null; }
}
function loadDashboardConfig() {
  try {
    const p = dashboardConfigPath();
    if (p && fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (typeof cfg.port === 'number' && cfg.port > 0 && cfg.port < 65536) dashboardPort = cfg.port;
      if (cfg.moveMode === 'auto' || cfg.moveMode === 'manual') status.moveMode = cfg.moveMode;
    }
  } catch {}
}
function saveDashboardConfig() {
  try {
    const p = dashboardConfigPath();
    if (p) fs.writeFileSync(p, JSON.stringify({ port: dashboardPort, moveMode: status.moveMode }, null, 2), 'utf8');
  } catch {}
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function broadcastStatus() {
  try { if (dashboard) dashboard.broadcast(status); } catch {}
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('dashboard-status', status); } catch {}
}
function setStatus(patch) {
  Object.assign(status, patch);
  // Log every status transition so we can confirm main is the single source of
  // truth and is firing at each workflow step (visible in the app's console).
  console.log(`[dashboard] status → state=${status.state} files=${status.fileCount}/${status.expectedCount} mode=${status.moveMode} (changed: ${Object.keys(patch).join(', ')})`);
  broadcastStatus();
}

// Forward a phone-issued delivery action to the desktop renderer, which owns the
// active mode, the destination paths and the existing handlers (Copy to Media /
// Bella, Dump Raws, Complete Card). Keeps ONE source of truth across desktop+phone.
function forwardToRenderer(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('dashboard-command', { action }); return true; } catch {}
  }
  setStatus({ lastActivity: `Couldn't reach the desktop app to run "${action}" at ${nowTime()}` });
  return false;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  // In dev, load from Vite dev server; in production, load built index.html
  if (!app.isPackaged) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  loadDashboardConfig();
  createWindow();

  // Start the live mobile dashboard (HTTP + WebSocket PWA on the LAN / Tailscale).
  dashboard = createDashboard({
    onMove: () => moveNow(),
    onSetMode: (mode) => {
      setStatus({ moveMode: mode, lastActivity: `Move mode set to ${mode.toUpperCase()} at ${nowTime()}` });
      saveDashboardConfig();
    },
    // New per-destination actions are run by the desktop renderer's existing handlers.
    onCommand: (cmd) => forwardToRenderer(cmd),
    getSnapshot: () => status,
    getShotlist: () => shotlist,
    // Phone shot-list edit → desktop ShotListPanel (which owns the data + localStorage).
    onShotlistCommand: (cmd) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('dashboard-shotlist-command', cmd); } catch {}
      }
    },
  });
  try { dashboard.start(dashboardPort); } catch (e) { console.error('[dashboard] failed to start:', e && e.message); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  try { if (dashboard) dashboard.stop(); } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Shared move logic + the dashboard's own move ─────────────────────────────
// Moves the freshly-exported .mp4s (created at/after robotStartTime) from the
// GoPro Videos folder into the card's STABILIZED folder. ONE implementation,
// used by the move-stabilized-files IPC handler AND moveNow().
function performMove({ videosFolder, stabilizedFolder, robotStartTime }) {
  const vDir = videosFolder || 'C:\\Users\\Jason\\Videos';
  const entries = fs.readdirSync(vDir);
  const matched = entries
    .filter(f => f.toLowerCase().endsWith('.mp4'))
    .map(f => path.join(vDir, f))
    .filter(f => { try { return fs.statSync(f).mtimeMs >= robotStartTime; } catch { return false; } });

  const files = [];
  for (const src of matched) {
    const dest = path.join(stabilizedFolder, path.basename(src));
    try { fs.renameSync(src, dest); }
    catch { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
    files.push(path.basename(src));
  }

  function walkSize(dir) {
    let total = 0;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) total += walkSize(full);
        else { try { total += fs.statSync(full).size; } catch {} }
      }
    } catch {}
    return total;
  }
  const cardFolder = path.dirname(stabilizedFolder);
  const totalGB = parseFloat((walkSize(cardFolder) / (1024 ** 3)).toFixed(2));
  return { moved: files.length, files, totalGB };
}

// Triggered by the phone ('move' command) or by the auto-move rule.
async function moveNow() {
  if (!activeJob) {
    setStatus({ lastActivity: 'Move requested, but there is no active job yet.' });
    return { moved: 0, files: [] };
  }
  try {
    const r = performMove({
      videosFolder: activeJob.videosFolder,
      stabilizedFolder: activeJob.stabilizedFolder,
      robotStartTime: activeJob.robotStartTime,
    });
    setStatus({
      state: 'complete',
      lastMovedCount: r.moved || 0,
      lastActivity: `Moved ${r.moved || 0} file(s) → STABILIZED at ${nowTime()}`,
    });
    // Reflect the remote/auto move on the desktop UI too.
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('dashboard-move-done', { ...r, cardId: activeJob.cardId }); } catch {}
    return r;
  } catch (err) {
    setStatus({ state: 'error', lastActivity: 'Move failed: ' + (err && err.message) });
    return { moved: 0, files: [], error: err && err.message };
  }
}

function calculateFolderSizeGB(folderPath) {
  let totalBytes = 0;
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else {
        totalBytes += fs.statSync(entryPath).size;
      }
    }
  }
  walk(folderPath);
  return (totalBytes / 1073741824).toFixed(2) + ' GB';
}

function countFilesRecursive(dir) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countFilesRecursive(path.join(dir, entry.name));
      else count++;
    }
  } catch {}
  return count;
}

async function waitForExportComplete(outputDir, robotStartTime, expectedCount, sender) {
  const POLL_INTERVAL = 3000;
  const MAX_WAIT = 60 * 60 * 1000;
  const STABLE_CHECKS = 3;
  const deadline = Date.now() + MAX_WAIT;

  let stableCount = 0;
  let lastTotalSize = -1;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    if (sender.isDestroyed()) return false;

    let files = [];
    try {
      const entries = fs.readdirSync(outputDir);
      for (const entry of entries) {
        const fullPath = path.join(outputDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (entry.toLowerCase().endsWith('.mp4') && stat.mtimeMs > robotStartTime) {
            files.push({ path: fullPath, size: stat.size });
          }
        } catch {}
      }
    } catch {
      continue;
    }

    if (files.length === 0) {
      stableCount = 0;
      lastTotalSize = -1;
      continue;
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const countLabel = expectedCount > 0
      ? `${files.length} of ${expectedCount} files`
      : `${files.length} file(s)`;

    try {
      sender.send('gopro-export-progress', {
        fileCount: files.length,
        expectedCount,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        countLabel,
      });
    } catch {}

    // Bridge → phone dashboard
    setStatus({
      state: 'running',
      fileCount: files.length,
      expectedCount,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      countLabel,
    });

    const allPresent = expectedCount > 0 ? files.length >= expectedCount : files.length > 0;

    if (allPresent) {
      if (totalSize === lastTotalSize) {
        stableCount++;
        if (stableCount >= STABLE_CHECKS) {
          try {
            sender.send('gopro-export-complete', {
              files: files.map(f => f.path),
              fileCount: files.length,
              expectedCount,
              countLabel,
            });
          } catch {}

          // Bridge → phone dashboard. The desktop renderer owns the AUTO chain
          // (move → media → bella → dump → complete) because it has all the paths
          // and handlers; it triggers off this 'complete' state. Main only flags a
          // count mismatch so auto never proceeds on a bad export.
          setStatus({
            state: 'complete',
            fileCount: files.length,
            expectedCount,
            countLabel,
            lastActivity: `Export complete (${countLabel}) at ${nowTime()}`,
          });
          if (expectedCount > 0 && files.length !== expectedCount) {
            // Count mismatch → flag as error so the phone shows the problem and
            // offers a manual "Move Files Anyway"; the renderer's auto chain also
            // refuses to run on a mismatch.
            setStatus({ state: 'error', lastActivity: `Count mismatch: ${files.length} of ${expectedCount}. Manual move required.` });
          }
          return true;
        }
      } else {
        stableCount = 0;
        lastTotalSize = totalSize;
      }
    } else {
      stableCount = 0;
      lastTotalSize = totalSize;
    }
  }

  try {
    if (!sender.isDestroyed()) {
      sender.send('gopro-export-error', { error: 'Export timed out after 60 minutes' });
    }
  } catch {}
  setStatus({ state: 'error', lastActivity: 'Export timed out after 60 minutes.' });
  return false;
}

// --- IPC Handlers ---

ipcMain.handle('validate-setup', (_event, config) => {
  const { rawPath, stabilizedPath, mediaRootPath, bellaRootPath, goProOutputPath, coords } = config;
  const errors = [];
  const warnings = [];

  // CHECK 1 — Local RAW folder exists and has files (recursive)
  if (!fs.existsSync(rawPath)) {
    errors.push(`RAW folder is empty or does not exist: ${rawPath}`);
  } else {
    const fileCount = countFilesRecursive(rawPath);
    if (fileCount === 0) {
      errors.push(`RAW folder is empty or does not exist: ${rawPath}`);
    }
  }

  // CHECK 2 — Local STABILIZED folder exists (can be empty)
  if (!fs.existsSync(stabilizedPath)) {
    errors.push(`STABILIZED folder does not exist: ${stabilizedPath}`);
  }

  // CHECK 3 — Media Drive root reachable (warning only)
  if (!fs.existsSync(mediaRootPath)) {
    warnings.push(`Media Drive not reachable: ${mediaRootPath}`);
  }

  // CHECK 4 — Bella Social Drive root reachable (warning only)
  if (!fs.existsSync(bellaRootPath)) {
    warnings.push(`Bella Social Drive not reachable: ${bellaRootPath}`);
  }

  // CHECK 5 — GoPro output folder exists (hard error — robot cannot export without it)
  if (!fs.existsSync(goProOutputPath)) {
    errors.push(`GoPro output folder not found: ${goProOutputPath}\nThis is where GoPro exports files before they are moved.`);
  }

  // CHECK 6 — Calibration coords present and complete
  const REQUIRED_COORD_KEYS = [
    'batchList', 'tenBit', 'hyperSmooth', 'unGain',
    'smoothnessStart', 'smoothnessEnd', 'croppingStart', 'croppingEnd',
    'aspectRatioOpen', 'aspectRatio8x7', 'dropZone', 'start',
  ];
  if (!coords || typeof coords !== 'object') {
    errors.push('Calibration is incomplete or missing. Please run calibration before starting the robot.');
  } else {
    const missingOrInvalid = REQUIRED_COORD_KEYS.filter(k => {
      const val = coords[k];
      return !val || typeof val.x !== 'number' || typeof val.y !== 'number';
    });
    if (missingOrInvalid.length > 0) {
      errors.push('Calibration is incomplete or missing. Please run calibration before starting the robot.');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
});

ipcMain.handle('select-folder', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0];
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-cursor-pos', () => {
  // Capture in PHYSICAL pixels (not logical/DIP). The robot is made DPI-aware and
  // moves the mouse in physical pixels, so storing physical coordinates makes the
  // calibration accurate on any display scaling (100% / 125% / 150%).
  const dip = screen.getCursorScreenPoint();
  try {
    return screen.dipToScreenPoint(dip);
  } catch {
    return dip;
  }
});

ipcMain.handle('create-folders', async (_event, paths) => {
  try {
    const { rawPath, stabilizedPath, mediaDrivePath, bellaSocialPath } = paths;
    // Local working folders
    fs.mkdirSync(rawPath, { recursive: true });
    fs.mkdirSync(stabilizedPath, { recursive: true });
    // Media Drive: flat card-ID folder with RAW and STABILIZED subfolders only
    fs.mkdirSync(path.join(mediaDrivePath, 'RAW'), { recursive: true });
    fs.mkdirSync(path.join(mediaDrivePath, 'STABILIZED'), { recursive: true });
    // Bella Social
    fs.mkdirSync(bellaSocialPath, { recursive: true });
    return { success: true, message: 'All folders created successfully.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('open-folder', async (_event, folderPath) => {
  try {
    const errorMsg = await shell.openPath(folderPath);
    if (errorMsg) {
      throw new Error(errorMsg);
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('find-gopro-path', async () => {
  const knownPaths = [
    'C:\\Program Files\\GoPro\\Player\\GoPro Player.exe',
    'C:\\Program Files (x86)\\GoPro\\Player\\GoPro Player.exe',
  ];

  for (const p of knownPaths) {
    if (fs.existsSync(p)) return p;
  }

  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-StartApps | Where-Object Name -like \'*GoPro*\' | Select-Object -First 1 -ExpandProperty AppID"',
      { shell: true },
      (_err, stdout) => {
        const appId = stdout.trim();
        resolve(appId || null);
      }
    );
  });
});

ipcMain.handle('calibrate-robot', async () => {
  try {
    return await new Promise((resolve) => {
      const { width, height } = screen.getPrimaryDisplay().size;
      let resolved = false;

      const calibWin = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      calibWin.loadFile(path.join(__dirname, 'calibration.html'));
      calibWin.setIgnoreMouseEvents(true, { forward: true });

      globalShortcut.register('Space', () => {
        if (!calibWin.isDestroyed()) calibWin.webContents.send('space-captured');
      });
      globalShortcut.register('Escape', () => {
        if (!calibWin.isDestroyed()) calibWin.webContents.send('escape-captured');
      });

      function finish(coords) {
        if (resolved) return;
        resolved = true;
        globalShortcut.unregister('Space');
        globalShortcut.unregister('Escape');
        ipcMain.removeAllListeners('calibration-done');
        if (!calibWin.isDestroyed()) calibWin.close();
        resolve(coords);
      }

      ipcMain.once('calibration-done', (_event, coords) => finish(coords));
      calibWin.on('closed', () => finish(null));
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// PS script template must be unindented so PowerShell's @'...'@ closing marker lands at column 0
ipcMain.handle('run-gopro-robot', async (event, coords, rawPath, stabilizedPath, goProPath, goProOutputPath, meta) => {
  try {
    const outputDir = goProOutputPath || 'C:\\Users\\Jason\\Videos';
    const { tenBit, hyperSmooth, smoothnessStart, smoothnessEnd, unGain, croppingStart, croppingEnd, aspectRatioOpen, aspectRatio8x7, start, dropZone, batchList, removeQueue, horizonLock } = coords;

    // Horizon Lock is OPTIONAL: only clicked when the software toggle is on AND a
    // calibration point exists for it. Built as a script fragment injected below.
    const wantHorizonLock = !!(meta && meta.horizonLock) && horizonLock && typeof horizonLock.x === 'number' && typeof horizonLock.y === 'number';
    const horizonLockStep = wantHorizonLock
      ? `\n# Step 3.5 — Toggle Horizon Lock ON (enabled in software)\nClick-GoPro -x ${horizonLock.x} -y ${horizonLock.y} -delayMs 800\n`
      : '\n# Step 3.5 — Horizon Lock skipped (off in software or not calibrated)\n';
    const robotStartTime = Date.now();

    // Count expected output files from RAW folder
    let expectedCount = 0;
    try {
      const rawFiles = fs.readdirSync(rawPath);
      expectedCount = rawFiles.filter(f => f.toLowerCase().endsWith('.mp4')).length;
    } catch {}

    // Store main's own job context so it can move files without the renderer.
    activeJob = {
      stabilizedFolder: stabilizedPath,
      videosFolder: outputDir,
      robotStartTime,
      expectedCount,
      cardId: (meta && meta.cardId) || '',
      pilotName: (meta && meta.pilotName) || '',
      artistName: (meta && meta.artistName) || '',
    };
    setStatus({
      state: 'running',
      cardId: activeJob.cardId,
      pilotName: activeJob.pilotName,
      artistName: activeJob.artistName,
      fileCount: 0,
      expectedCount,
      totalSizeMB: 0,
      countLabel: expectedCount > 0 ? `0 of ${expectedCount} files` : 'starting…',
      lastMovedCount: 0,
      lastActivity: `Robot started for ${activeJob.cardId || 'card'} at ${nowTime()}`,
    });

const psScript = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }
[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int X, Y; }
public class MouseRobot {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(120);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        System.Threading.Thread.Sleep(60);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
    public static void TripleClick(int x, int y) {
        Click(x, y); System.Threading.Thread.Sleep(80);
        Click(x, y); System.Threading.Thread.Sleep(80);
        Click(x, y);
    }
}
'@ -Language CSharp

# Make this process DPI-aware (Per-Monitor v2, falling back to System) BEFORE any
# WinForms / UIA / window calls. This forces SetCursorPos, MoveWindow and the UIA
# bounding rectangles to all use PHYSICAL pixels — matching the physical-pixel
# coordinates captured during calibration. Without this the robot lands off on
# displays scaled to 125% / 150% (e.g. most laptops).
$dpiOk = $false
try { $dpiOk = [MouseRobot]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}
if (-not $dpiOk) { try { [MouseRobot]::SetProcessDPIAware() | Out-Null } catch {} }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$wshell = New-Object -ComObject wscript.shell
$rawPath = "${rawPath}"
$stabilizedPath = "${stabilizedPath}"
$uiaRoot = [System.Windows.Automation.AutomationElement]::RootElement

# Log file — forward slashes avoid JS-template-literal backslash-escaping issues.
$logFile = "$env:TEMP/gopro_robot_log.txt"
Add-Content $logFile "===== ROBOT START $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="

# 1. GoPro Player is already open — just bring it to foreground
$goProProc = Get-Process | Where-Object {
    $_.MainWindowTitle -like "*GoPro*"
} | Select-Object -First 1

if ($goProProc) {
    $script:goProHwnd = $goProProc.MainWindowHandle
    [MouseRobot]::SetForegroundWindow($script:goProHwnd) | Out-Null
    Start-Sleep -Milliseconds 400
} else {
    # Fallback: GoPro not found open — launch it and wait for it to be ready
    Start-Process "shell:AppsFolder\GoPro.GoProPlayer_1h9vz9xjm6b8c!App"
    $waited = 0
    $goProReady = $false
    while ($waited -lt 20000 -and -not $goProReady) {
        Start-Sleep -Milliseconds 500
        $waited += 500
        $goProProc = Get-Process | Where-Object {
            $_.MainWindowTitle -like "*GoPro*"
        } | Select-Object -First 1
        if ($goProProc -and $goProProc.MainWindowHandle -ne [IntPtr]::Zero) {
            $goProReady = $true
        }
    }
    if ($goProProc) {
        $script:goProHwnd = $goProProc.MainWindowHandle
        [MouseRobot]::SetForegroundWindow($script:goProHwnd) | Out-Null
        Start-Sleep -Milliseconds 800
    } else {
        Write-Error "GoPro Player could not be found or launched. Please open GoPro Player and try again."
        exit 1
    }
}

# Define Click-GoPro helper — brings Export Queue to foreground before every click
function Click-GoPro {
    param([int]$x, [int]$y, [int]$delayMs = 500)
    [MouseRobot]::SetForegroundWindow($script:goProHwnd)
    Start-Sleep -Milliseconds 100
    [MouseRobot]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 120
    [MouseRobot]::mouse_event(0x02, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 60
    [MouseRobot]::mouse_event(0x04, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $delayMs
}

# 3. Open File Explorer to the correct RAW folder.
# Use the Shell.Application COM object's Explore() — it takes a plain path
# string, so there are NO command-line quoting issues (the cause of explorer
# falling back to Documents). It also handles spaces in paths natively.
$rawFolderPath = $rawPath
Write-Host "DEBUG: rawFolderPath = [$rawFolderPath]"
Add-Content $logFile "DEBUG: rawFolderPath = [$rawFolderPath]"
if ([string]::IsNullOrWhiteSpace($rawFolderPath)) {
    Write-Error "FATAL: rawFolderPath is EMPTY"
    Add-Content $logFile "FATAL: rawFolderPath is EMPTY"
    exit 1
}
if (-not (Test-Path -LiteralPath $rawFolderPath)) {
    Write-Error "FATAL: rawFolderPath does not exist: $rawFolderPath"
    Add-Content $logFile "FATAL: does not exist: $rawFolderPath"
    exit 1
}
$targetPath = (Resolve-Path -LiteralPath $rawFolderPath).Path.TrimEnd('\\')
$shell = New-Object -ComObject Shell.Application
$shell.Explore($targetPath)
Add-Content $logFile "Explore() called for [$targetPath]"

# 4. Find the Explorer window whose ACTUAL folder path matches the RAW path.
# We match on Shell.Application's Document.Folder.Self.Path (a real filesystem
# path, not a URI) so we can never latch onto an unrelated window like Documents.
$explorerHwnd = [IntPtr]::Zero
$waited = 0
while ($waited -lt 6000 -and $explorerHwnd -eq [IntPtr]::Zero) {
    Start-Sleep -Milliseconds 400
    $waited += 400
    foreach ($w in $shell.Windows()) {
        try {
            # Only real File Explorer windows expose a filesystem folder path
            $winPath = $w.Document.Folder.Self.Path
            if ($winPath -and ($winPath.TrimEnd('\\') -ieq $targetPath)) {
                $explorerHwnd = [IntPtr]$w.HWND
                break
            }
        } catch {}
    }
}

if ($explorerHwnd -eq [IntPtr]::Zero) {
    Write-Error "ERROR: Could not find File Explorer window showing $targetPath"
    Add-Content $logFile "ERROR: no Explorer window matched [$targetPath]"
    exit 1
}
Add-Content $logFile "MATCHED Explorer hwnd=$explorerHwnd for [$targetPath]"

$explorerEl = [System.Windows.Automation.AutomationElement]::FromHandle($explorerHwnd)
if ($explorerEl -eq $null) {
    Write-Error "ERROR: UIA could not attach to Explorer window"
    exit 1
}

# === WINDOW MANAGEMENT: Reposition File Explorer only — do NOT touch GoPro Player ===

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WindowManager {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
}
"@

# Restore + position the Explorer window at top-left
[WindowManager]::ShowWindow($explorerHwnd, 9) | Out-Null  # SW_RESTORE
Start-Sleep -Milliseconds 300
[WindowManager]::MoveWindow($explorerHwnd, 0, 0, 600, 500, $true) | Out-Null
Start-Sleep -Milliseconds 300

# Force the Explorer window ABOVE this app and give it real keyboard focus.
# SetForegroundWindow alone is blocked by Windows' foreground lock, so we:
#  (1) pin it TOPMOST so it is guaranteed to draw on top of the app, and
#  (2) AttachThreadInput to the current foreground thread so the focus change
#      is allowed. Without this, Ctrl+A and the click land on the app instead.
$HWND_TOPMOST = [IntPtr](-1)
$HWND_NOTOPMOST = [IntPtr](-2)
$SWP_FLAGS = 0x0043  # SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW
[WindowManager]::SetWindowPos($explorerHwnd, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_FLAGS) | Out-Null

$fgWin = [WindowManager]::GetForegroundWindow()
$fgThread = [WindowManager]::GetWindowThreadProcessId($fgWin, [IntPtr]::Zero)
$thisThread = [WindowManager]::GetCurrentThreadId()
[WindowManager]::AttachThreadInput($thisThread, $fgThread, $true) | Out-Null
[WindowManager]::BringWindowToTop($explorerHwnd) | Out-Null
[WindowManager]::SetForegroundWindow($explorerHwnd) | Out-Null
[WindowManager]::AttachThreadInput($thisThread, $fgThread, $false) | Out-Null
Start-Sleep -Milliseconds 400
Add-Content $logFile "Explorer forced topmost+focus at 0,0 600x500"

Write-Host "WINDOWS_POSITIONED"
# === END WINDOW MANAGEMENT ===

# Physically click inside the (now top-most) Explorer window to lock focus there
[MouseRobot]::Click(300, 250)
Start-Sleep -Milliseconds 300

# 5. Ctrl+A to select all files in Explorer
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500

# 6. Get bounding rect of first file ListItem via UIA ControlType (avoids landing on column header)
$listCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::List)
$listPane = $explorerEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $listCondition)
if (-not $listPane) {
    Write-Error "ERROR: List pane not found in Explorer window"
    exit 1
}
$itemCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::ListItem)
$firstItem = $listPane.FindFirst([System.Windows.Automation.TreeScope]::Children, $itemCondition)
if (-not $firstItem) {
    Write-Error "Could not find file items in Explorer window via UIA. Make sure the RAW folder is not empty and Explorer is showing files in list/detail view."
    exit 1
}
$itemRect = $firstItem.Current.BoundingRectangle
$dragX = [int]($itemRect.X + $itemRect.Width / 2)
$dragY = [int]($itemRect.Y + $itemRect.Height / 2)
Add-Content "$env:TEMP\\gopro_robot_log.txt" "Drag start: $dragX, $dragY from item $($firstItem.Current.Name)"

# 7. Get dropZone coords from calibration
$dropX = ${dropZone.x}
$dropY = ${dropZone.y}

# 8. Drag: move to origin, LEFTDOWN, 30-step interpolation over 1500ms, LEFTUP, wait 18s for ingest
[MouseRobot]::SetCursorPos($dragX, $dragY)
Start-Sleep -Milliseconds 300
[MouseRobot]::mouse_event(0x02, 0, 0, 0, 0)
Start-Sleep -Milliseconds 500
for ($step = 1; $step -le 30; $step++) {
    $t = $step / 30.0
    $curX = [int]($dragX + ($dropX - $dragX) * $t)
    $curY = [int]($dragY + ($dropY - $dragY) * $t)
    [MouseRobot]::SetCursorPos($curX, $curY)
    Start-Sleep -Milliseconds 50
}
# STEP 4 — Bring GoPro to foreground before releasing so Windows routes the drop correctly
[MouseRobot]::SetForegroundWindow($script:goProHwnd)
Start-Sleep -Milliseconds 150
[MouseRobot]::mouse_event(0x04, 0, 0, 0, 0)
Start-Sleep -Milliseconds 1200

# Files are now in GoPro — un-pin the Explorer window so it no longer sits on
# top of GoPro's controls during the post-drop clicks.
[WindowManager]::SetWindowPos($explorerHwnd, $HWND_NOTOPMOST, 0, 0, 0, 0, $SWP_FLAGS) | Out-Null

# POST-DROP SEQUENCE

# Step 1 — Click batch list area and Ctrl+A to select all files in GoPro queue
Click-GoPro -x ${batchList.x} -y ${batchList.y} -delayMs 500
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500

# Step 2 — Click HyperSmooth Pro toggle (10-bit is already default — NOT clicked)
Click-GoPro -x ${hyperSmooth.x} -y ${hyperSmooth.y} -delayMs 800

# Step 3 — Click unGain button (must happen before adjusting sliders)
Click-GoPro -x ${unGain.x} -y ${unGain.y} -delayMs 800
${horizonLockStep}
# Step 4 — Drag smoothness slider from value 50 (start) to value 15 (end)
[MouseRobot]::SetForegroundWindow($script:goProHwnd)
Start-Sleep -Milliseconds 100
[MouseRobot]::SetCursorPos(${smoothnessStart.x}, ${smoothnessStart.y})
Start-Sleep -Milliseconds 200
[MouseRobot]::mouse_event(0x02, 0, 0, 0, 0)
Start-Sleep -Milliseconds 200
for ($s = 1; $s -le 15; $s++) {
    $t = $s / 15.0
    [MouseRobot]::SetCursorPos([int](${smoothnessStart.x} + (${smoothnessEnd.x} - ${smoothnessStart.x}) * $t), [int](${smoothnessStart.y} + (${smoothnessEnd.y} - ${smoothnessStart.y}) * $t))
    Start-Sleep -Milliseconds 30
}
[MouseRobot]::mouse_event(0x04, 0, 0, 0, 0)
Add-Content "$env:TEMP\\gopro_robot_log.txt" "Smoothness dragged from ${smoothnessStart.x},${smoothnessStart.y} to ${smoothnessEnd.x},${smoothnessEnd.y}"
Start-Sleep -Milliseconds 800

# Step 5 — Drag cropping slider from value 50 (start) to value 15 (end)
[MouseRobot]::SetForegroundWindow($script:goProHwnd)
Start-Sleep -Milliseconds 100
[MouseRobot]::SetCursorPos(${croppingStart.x}, ${croppingStart.y})
Start-Sleep -Milliseconds 200
[MouseRobot]::mouse_event(0x02, 0, 0, 0, 0)
Start-Sleep -Milliseconds 200
for ($s = 1; $s -le 15; $s++) {
    $t = $s / 15.0
    [MouseRobot]::SetCursorPos([int](${croppingStart.x} + (${croppingEnd.x} - ${croppingStart.x}) * $t), [int](${croppingStart.y} + (${croppingEnd.y} - ${croppingStart.y}) * $t))
    Start-Sleep -Milliseconds 30
}
[MouseRobot]::mouse_event(0x04, 0, 0, 0, 0)
Add-Content "$env:TEMP\\gopro_robot_log.txt" "Cropping dragged from ${croppingStart.x},${croppingStart.y} to ${croppingEnd.x},${croppingEnd.y}"
Start-Sleep -Milliseconds 800

# Step 6 — Open aspect ratio dropdown
Click-GoPro -x ${aspectRatioOpen.x} -y ${aspectRatioOpen.y} -delayMs 800

# Step 7 — Select 8:7 from dropdown
Click-GoPro -x ${aspectRatio8x7.x} -y ${aspectRatio8x7.y} -delayMs 800

# Step 8 — Click Start export
Click-GoPro -x ${start.x} -y ${start.y} -delayMs 1000
`;

    const tmpScript = require('os').tmpdir() + '\\gopro_robot.ps1';
    fs.writeFileSync(tmpScript, psScript, 'utf8');

    const robot = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript], {
      stdio: 'pipe',
    });

    let stderrOutput = '';
    let stdoutOutput = '';
    robot.stdout.on('data', (data) => { stdoutOutput += data.toString(); });
    robot.stderr.on('data', (data) => { stderrOutput += data.toString(); });

    robot.on('close', async (code) => {
      fs.unlink(tmpScript, () => {});
      if (code !== 0) {
        event.sender.send('gopro-robot-status', {
          success: false,
          exitCode: code,
          error: [stdoutOutput, stderrOutput].filter(Boolean).join('\n').trim(),
        });
        setStatus({ state: 'error', lastActivity: `Robot failed (exit ${code}) at ${nowTime()}` });
      } else {
        event.sender.send('gopro-robot-status', { success: true, exitCode: code });
        setStatus({ lastActivity: `Robot finished — monitoring export at ${nowTime()}` });
        const exportSuccess = await waitForExportComplete(outputDir, robotStartTime, expectedCount, event.sender);
        if (exportSuccess && removeQueue && typeof removeQueue.x === 'number' && typeof removeQueue.y === 'number' && !event.sender.isDestroyed()) {
          const removeScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, int extra);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

# DPI-aware so the remove-queue click uses physical pixels (matches calibration).
$dpiOk = $false
try { $dpiOk = [WinAPI]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}
if (-not $dpiOk) { try { [WinAPI]::SetProcessDPIAware() | Out-Null } catch {} }

$goProProcess = Get-Process | Where-Object { $_.MainWindowTitle -like "*GoPro*" } | Select-Object -First 1
if ($goProProcess) {
    [WinAPI]::SetForegroundWindow($goProProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 800
}

[WinAPI]::SetCursorPos(${removeQueue.x}, ${removeQueue.y}) | Out-Null
Start-Sleep -Milliseconds 300
[WinAPI]::mouse_event(0x0002, 0, 0, 0, 0)
Start-Sleep -Milliseconds 80
[WinAPI]::mouse_event(0x0004, 0, 0, 0, 0)
Start-Sleep -Milliseconds 500

Write-Host "REMOVE_COMPLETE"
`;
          const removeTmpPath = require('os').tmpdir() + '\\gopro_remove_queue.ps1';
          fs.writeFileSync(removeTmpPath, removeScript, 'utf8');
          await new Promise((resolve) => {
            const removeProc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', removeTmpPath], { stdio: 'pipe' });
            removeProc.on('close', () => { fs.unlink(removeTmpPath, () => {}); resolve(); });
            removeProc.on('error', () => { fs.unlink(removeTmpPath, () => {}); resolve(); });
          });
          if (!event.sender.isDestroyed()) {
            event.sender.send('gopro-remove-complete');
          }
        }
      }
    });

    return { success: true, message: 'Robot launched — do not touch mouse or keyboard.', robotStartTime };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('move-stabilized-files', async (_event, { videosFolder, stabilizedFolder, robotStartTime }) => {
  try {
    const r = performMove({ videosFolder, stabilizedFolder, robotStartTime });
    // Reflect the desktop move on the phone dashboard too.
    setStatus({
      state: 'complete',
      lastMovedCount: r.moved || 0,
      lastActivity: `Moved ${r.moved || 0} file(s) → STABILIZED (desktop) at ${nowTime()}`,
    });
    return { moved: r.moved, files: r.files, totalGB: r.totalGB };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Dashboard control IPC (desktop Setup panel) ──────────────────────────────
ipcMain.handle('dashboard-get-info', () => {
  const info = dashboard ? dashboard.getInfo() : { port: dashboardPort, running: false, urls: [] };
  return { ...info, moveMode: status.moveMode };
});
// The desktop renderer pushes its live delivery state (which destinations are
// available + their copy/dump progress) so the phone's buttons mirror the desktop.
ipcMain.handle('dashboard-report-state', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return { ok: false };
  const clean = {};
  for (const k of Object.keys(patch)) {
    if (REPORTABLE_FIELDS.has(k)) clean[k] = patch[k];
  }
  setStatus(clean);
  return { ok: true };
});

// The desktop renderer pushes the shot list (CSV assignments + per-shot status) so
// the phone can view it filtered by pilot/day. Kept lightweight (display fields only).
ipcMain.handle('dashboard-report-shotlist', (_event, items) => {
  if (!Array.isArray(items)) { shotlist = []; return { ok: true }; }
  shotlist = items.map((it) => ({
    id: String(it.id || ''),
    daySection: String(it.daySection || ''),
    pilot: String(it.pilot || ''),
    assignment: String(it.assignment || ''),
    stage: String(it.stage || ''),
    setTime: String(it.setTime || ''),
    flyTime: String(it.flyTime || ''),
    dropTime: String(it.dropTime || ''),
    notes: String(it.notes || ''),
    status: String(it.status || 'pending'),
  }));
  return { ok: true };
});

// Desktop big AUTO/MANUAL button → set the move mode (persisted + broadcast to
// the phone). Same field the phone's Auto/Manual toggle controls.
ipcMain.handle('dashboard-set-move-mode', (_event, mode) => {
  if (mode !== 'auto' && mode !== 'manual') return { error: 'Mode must be auto or manual.' };
  setStatus({ moveMode: mode, lastActivity: `Move mode set to ${mode.toUpperCase()} (desktop) at ${nowTime()}` });
  saveDashboardConfig();
  return { ok: true, moveMode: mode };
});

ipcMain.handle('dashboard-set-port', (_event, port) => {
  const p = parseInt(port, 10);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { error: 'Port must be between 1 and 65535.' };
  dashboardPort = p;
  saveDashboardConfig();
  try { if (dashboard) dashboard.start(p); } catch (e) { return { error: e && e.message }; }
  const info = dashboard ? dashboard.getInfo() : { port: p, running: false, urls: [] };
  return { ...info, moveMode: status.moveMode };
});

ipcMain.handle('copy-to-media', async (event, { localRawPath, localStabilizedPath, mediaDrivePath }) => {
  try {
    const progressRe = /(\d+\.?\d*)\s*%/;

    const runRobocopy = (src, dst, phaseOffset, phaseScale) => new Promise((resolve, reject) => {
      const proc = spawn('robocopy', [src, dst, '/E', '/Z', '/W:5', '/R:3'], { windowsHide: true });
      proc.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(progressRe);
        if (match) {
          event.sender.send('media-copy-progress', phaseOffset + parseFloat(match[1]) * phaseScale);
        }
      });
      proc.on('close', (code) => {
        if (code !== null && code >= 8) reject(new Error(`Robocopy failed with exit code ${code}`));
        else resolve(code);
      });
      proc.on('error', reject);
    });

    await runRobocopy(localRawPath, path.join(mediaDrivePath, 'RAW'), 0, 0.5);
    await runRobocopy(localStabilizedPath, path.join(mediaDrivePath, 'STABILIZED'), 50, 0.5);

    return { success: true, message: 'Media drive copy complete.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('copy-to-bella', async (event, { localStabilizedPath, bellaSocialPath }) => {
  try {
    fs.mkdirSync(bellaSocialPath, { recursive: true });

    return await new Promise((resolve, reject) => {
      const progressRe = /(\d+\.?\d*)\s*%/;
      // /LEV:1 copies only top-level files — no subfolders created inside the artist folder
      const proc = spawn('robocopy', [localStabilizedPath, bellaSocialPath, '/LEV:1', '/Z', '/W:5', '/R:3'], { windowsHide: true });

      proc.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(progressRe);
        if (match) event.sender.send('bella-copy-progress', parseFloat(match[1]));
      });

      proc.on('close', (code) => {
        if (code !== null && code >= 8) reject(new Error(`Robocopy failed with exit code ${code}`));
        else resolve({ success: true, message: 'Bella social copy complete.' });
      });

      proc.on('error', reject);
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('copy-to-media-drive', async (event, { localStabilizedPath, mediaDrivePath, cardId }) => {
  try {
    const localCardPath = path.dirname(localStabilizedPath);
    const progressRe = /(\d+\.?\d*)\s*%/;

    await new Promise((resolve, reject) => {
      const proc = spawn('robocopy', [localCardPath, mediaDrivePath, '/E', '/Z', '/W:5', '/R:3'], { windowsHide: true });
      proc.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(progressRe);
        if (match) event.sender.send('media-drive-copy-progress', parseFloat(match[1]));
      });
      proc.on('close', (code) => {
        if (code !== null && code >= 8) {
          const driveLetter = mediaDrivePath.split('\\')[0] || mediaDrivePath.split(':')[0] + ':';
          reject(new Error(`Robocopy failed with exit code ${code} — check that ${driveLetter} is connected and accessible`));
        } else resolve(code);
      });
      proc.on('error', reject);
    });

    const fileCount = countFilesRecursive(mediaDrivePath);
    const sizeGB = calculateFolderSizeGB(mediaDrivePath);
    return { success: true, cardId, fileCount, sizeGB };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('copy-to-bella-drive', async (event, { localStabilizedPath, bellaDestPath, artistName }) => {
  try {
    if (!artistName || !artistName.trim()) {
      return {
        success: false,
        message: 'No artist or shot name assigned to this card. Please verify the shot list assignment before copying to Bella.',
      };
    }

    fs.mkdirSync(bellaDestPath, { recursive: true });
    const progressRe = /(\d+\.?\d*)\s*%/;

    await new Promise((resolve, reject) => {
      const proc = spawn('robocopy', [localStabilizedPath, bellaDestPath, '/E', '/Z', '/W:5', '/R:3'], { windowsHide: true });
      proc.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(progressRe);
        if (match) event.sender.send('bella-drive-copy-progress', parseFloat(match[1]));
      });
      proc.on('close', (code) => {
        if (code !== null && code >= 8) {
          const driveLetter = bellaDestPath.split('\\')[0] || bellaDestPath.split(':')[0] + ':';
          reject(new Error(`Robocopy failed with exit code ${code} — check that ${driveLetter} is connected and accessible`));
        } else resolve(code);
      });
      proc.on('error', reject);
    });

    const fileCount = countFilesRecursive(bellaDestPath);
    const sizeGB = calculateFolderSizeGB(bellaDestPath);
    return { success: true, artistName, fileCount, sizeGB };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('save-calibration', async (_event, { coords }) => {
  try {
    const os = require('os');
    const hostname = os.hostname();
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const key = `${hostname}__${width}x${height}`;
    const savePath = path.join(app.getPath('userData'), 'calibrations.json');
    let calibrations = {};
    try {
      if (fs.existsSync(savePath)) {
        calibrations = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      }
    } catch {}
    calibrations[key] = { coords, hostname, width, height, savedAt: new Date().toISOString() };
    fs.writeFileSync(savePath, JSON.stringify(calibrations, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-calibration', async () => {
  try {
    const os = require('os');
    const hostname = os.hostname();
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const key = `${hostname}__${width}x${height}`;
    const savePath = path.join(app.getPath('userData'), 'calibrations.json');
    if (!fs.existsSync(savePath)) return { found: false };
    const calibrations = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    if (!calibrations[key]) return { found: false };
    return { found: true, ...calibrations[key], key };
  } catch {
    return { found: false };
  }
});

ipcMain.handle('copy-sd-to-raw', async (event, { sdDriveLetter, targetRawPath }) => {
  try {
    const source = sdDriveLetter.replace(/\\+$/, '') + '\\';
    // Count source files BEFORE robocopy runs
    const sourceFileCount = countFilesRecursive(source);

    // If the RAW folder already has files from a previous card, copy this card
    // into a fresh BATCH_NN subfolder so the robot only ever stabilizes the NEW
    // files (it points Explorer at this subfolder), instead of re-grabbing every
    // already-stabilized file in the shared folder.
    let dest = targetRawPath;
    let batchSubfolder = '';
    const alreadyHasFiles = fs.existsSync(targetRawPath) && countFilesRecursive(targetRawPath) > 0;
    if (alreadyHasFiles) {
      let n = 2;
      while (fs.existsSync(path.join(targetRawPath, `BATCH_${String(n).padStart(2, '0')}`))) n++;
      batchSubfolder = `BATCH_${String(n).padStart(2, '0')}`;
      dest = path.join(targetRawPath, batchSubfolder);
    }
    fs.mkdirSync(dest, { recursive: true });

    return await new Promise((resolve, reject) => {
      const proc = spawn('robocopy', [source, dest, '/E', '/Z', '/W:5', '/R:3'], {
        windowsHide: true,
      });

      const progressRe = /(\d+\.?\d*)\s*%/;

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const match = text.match(progressRe);
        if (match) {
          const pct = parseFloat(match[1]);
          event.sender.send('robocopy-progress', pct);
        }
      });

      proc.on('close', (code) => {
        // Robocopy exit codes 0-7 are all successful on Windows
        if (code !== null && code >= 8) {
          reject(new Error(`Robocopy failed with exit code ${code}`));
        } else {
          // Count only THIS batch's files (the subfolder, or the base on first copy).
          const fileCount = countFilesRecursive(dest);
          if (fileCount === 0) {
            reject(new Error('Robocopy completed but destination folder is empty — verify SD card contents'));
          } else {
            const sizeGB = calculateFolderSizeGB(dest);
            resolve({
              success: true,
              message: batchSubfolder
                ? `SD card copied into new subfolder ${batchSubfolder} (folder already had files).`
                : 'SD card copied successfully.',
              sourceFileCount,
              fileCount,
              sizeGB,
              matched: sourceFileCount === fileCount,
              activeRawPath: dest,
              batchSubfolder,
            });
          }
        }
      });

      proc.on('error', (err) => reject(err));
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Deletes GoPro footage files from the SD card only. Recursive (incl. DCIM\100GOPRO),
// keeps the folder structure, and only removes known GoPro media extensions.
// Hard safety guards refuse the system drive and any configured working drive.
ipcMain.handle('delete-sd-raw-files', async (_event, { sdDrivePath, protectedRoots }) => {
  try {
    const driveLetter = (p) => {
      const m = String(p || '').trim().match(/^([A-Za-z]):/);
      return m ? (m[1].toUpperCase() + ':') : '';
    };

    const sdRaw = String(sdDrivePath || '').trim();
    if (!sdRaw) return { success: false, message: 'No SD Card Drive is set in Setup.' };

    const sdDrive = driveLetter(sdRaw);
    if (!sdDrive) return { success: false, message: `SD Card Drive is not a valid drive path: ${sdRaw}` };

    // Safety 1 — never the system drive
    const systemDrive = (process.env.SystemDrive || 'C:').toUpperCase();
    if (sdDrive === systemDrive) {
      return { success: false, message: `Refusing to delete from the system drive (${systemDrive}). Check the SD Card Drive setting.` };
    }

    // Safety 2 — never a configured working / media / Bella drive
    const protectedDrives = (protectedRoots || []).map(driveLetter).filter(Boolean);
    if (protectedDrives.includes(sdDrive)) {
      return { success: false, message: `Refusing to delete: ${sdDrive} is one of your working/media/Bella drives, not an SD card. Check the SD Card Drive setting.` };
    }

    if (!fs.existsSync(sdRaw)) {
      return { success: false, message: `SD card not found at ${sdRaw} — is it inserted?` };
    }

    const VIDEO_EXTS = new Set(['.mp4', '.lrv', '.thm', '.gpr', '.360']);
    let deletedCount = 0;
    let freedBytes = 0;
    const errors = [];

    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full); // recurse but keep the folder itself
        } else if (entry.isFile() && VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
          try {
            const sz = fs.statSync(full).size;
            fs.unlinkSync(full);
            deletedCount++;
            freedBytes += sz;
          } catch (e) {
            errors.push(`${entry.name}: ${e.message}`);
          }
        }
      }
    };
    walk(sdRaw);

    return { success: true, deletedCount, freedGB: (freedBytes / (1024 ** 3)).toFixed(2), errors };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Copies every file found inside any RAW folder under the selected pilot's local
// tree into ONE flat dump folder. Local RAW files are left intact (copy, not move).
// Dedup: a source file is skipped if the dump folder already holds a file with the
// same base name and the same size (incl. a previously-uniquified _N variant), so
// re-running through the night only copies newly-added raws.
ipcMain.handle('dump-raws', async (event, { pilotRootPath, dumpFolderPath }) => {
  try {
    const src = String(pilotRootPath || '').trim();
    const dst = String(dumpFolderPath || '').trim();
    if (!src) return { success: false, message: 'No pilot selected (local pilot folder is empty).' };
    if (!dst) return { success: false, message: 'No Raw Dump Folder is set in Setup.' };
    if (!fs.existsSync(src)) return { success: false, message: `Pilot folder not found: ${src}` };

    // Collect every file that lives inside a folder named RAW (at any depth).
    const rawFiles = [];
    const walk = (dir, insideRaw) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, insideRaw || entry.name.toUpperCase() === 'RAW');
        } else if (entry.isFile() && insideRaw) {
          rawFiles.push(full);
        }
      }
    };
    walk(src, false);

    if (rawFiles.length === 0) {
      return { success: true, copied: 0, skipped: 0, sizeGB: '0.00', message: 'No raw files found for this pilot.' };
    }

    fs.mkdirSync(dst, { recursive: true });

    // Index the dump folder once: name -> size.
    const destIndex = new Map();
    try {
      for (const entry of fs.readdirSync(dst, { withFileTypes: true })) {
        if (entry.isFile()) {
          try { destIndex.set(entry.name, fs.statSync(path.join(dst, entry.name)).size); } catch {}
        }
      }
    } catch {}

    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let copied = 0;
    let skipped = 0;
    let copiedBytes = 0;
    const total = rawFiles.length;

    for (let i = 0; i < rawFiles.length; i++) {
      const srcFile = rawFiles[i];
      let size;
      try { size = fs.statSync(srcFile).size; } catch { continue; }
      const ext = path.extname(srcFile);
      const base = path.basename(srcFile, ext);

      // Match dump files named base.ext or base_N.ext (same base, optional numeric suffix).
      const variantRe = new RegExp('^' + escapeRe(base) + '(_(\\d+))?' + escapeRe(ext) + '$', 'i');
      let alreadyDumped = false;
      let maxSuffix = 0;
      for (const [name, sz] of destIndex) {
        if (variantRe.test(name)) {
          if (sz === size) { alreadyDumped = true; break; }
          const m = name.match(new RegExp('_(\\d+)' + escapeRe(ext) + '$', 'i'));
          if (m) maxSuffix = Math.max(maxSuffix, parseInt(m[1], 10));
        }
      }
      if (alreadyDumped) { skipped++; continue; }

      // Pick a non-colliding destination name.
      let destName = base + ext;
      if (destIndex.has(destName)) destName = `${base}_${maxSuffix + 1}${ext}`;

      try {
        await fs.promises.copyFile(srcFile, path.join(dst, destName));
        destIndex.set(destName, size);
        copied++;
        copiedBytes += size;
      } catch (e) {
        // skip individual file errors, keep going
      }

      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('dump-raws-progress', { current: i + 1, total, copied, skipped });
        }
      } catch {}
    }

    return { success: true, copied, skipped, sizeGB: (copiedBytes / (1024 ** 3)).toFixed(2) };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
