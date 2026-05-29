const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

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

  // In dev, load from Vite dev server; in production, load built index.html
  if (!app.isPackaged) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

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
  return screen.getCursorScreenPoint();
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
ipcMain.handle('run-gopro-robot', async (event, coords, rawPath, stabilizedPath, goProPath, goProOutputPath) => {
  try {
    const outputDir = goProOutputPath || 'C:\\Users\\Jason\\Videos';
    const { tenBit, hyperSmooth, smoothnessStart, smoothnessEnd, unGain, croppingStart, croppingEnd, aspectRatioOpen, aspectRatio8x7, start, dropZone, batchList, removeQueue } = coords;
    const robotStartTime = Date.now();

    // Count expected output files from RAW folder
    let expectedCount = 0;
    try {
      const rawFiles = fs.readdirSync(rawPath);
      expectedCount = rawFiles.filter(f => f.toLowerCase().endsWith('.mp4')).length;
    } catch {}

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

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$wshell = New-Object -ComObject wscript.shell
$rawPath = "${rawPath}"
$stabilizedPath = "${stabilizedPath}"
$uiaRoot = [System.Windows.Automation.AutomationElement]::RootElement

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

# 3. Open File Explorer to the correct RAW folder
$rawFolderPath = $rawPath
Write-Host "DEBUG: rawFolderPath = [$rawFolderPath]"
Add-Content "$env:TEMP\gopro_robot_log.txt" "DEBUG: rawFolderPath = [$rawFolderPath]"
if ([string]::IsNullOrWhiteSpace($rawFolderPath)) {
    Write-Error "FATAL: rawFolderPath is EMPTY"
    exit 1
}
if (-not (Test-Path -LiteralPath $rawFolderPath)) {
    Write-Error "FATAL: rawFolderPath does not exist: $rawFolderPath"
    exit 1
}
Start-Process explorer.exe -ArgumentList "\`"$rawFolderPath\`""

# 4. Find the Explorer window whose ACTUAL folder path matches the RAW path.
# We match on Shell.Application's Document.Folder.Self.Path (a real filesystem
# path, not a URI) so we can never latch onto an unrelated window like Documents.
$targetPath = (Resolve-Path -LiteralPath $rawFolderPath).Path.TrimEnd('\')
$shell = New-Object -ComObject Shell.Application
$explorerHwnd = [IntPtr]::Zero
$waited = 0
while ($waited -lt 6000 -and $explorerHwnd -eq [IntPtr]::Zero) {
    Start-Sleep -Milliseconds 400
    $waited += 400
    foreach ($w in $shell.Windows()) {
        try {
            # Only real File Explorer windows expose a filesystem folder path
            $winPath = $w.Document.Folder.Self.Path
            if ($winPath -and ($winPath.TrimEnd('\') -ieq $targetPath)) {
                $explorerHwnd = [IntPtr]$w.HWND
                break
            }
        } catch {}
    }
}

if ($explorerHwnd -eq [IntPtr]::Zero) {
    Write-Error "ERROR: Could not find File Explorer window showing $targetPath"
    Add-Content "$env:TEMP\gopro_robot_log.txt" "ERROR: no Explorer window matched [$targetPath]"
    exit 1
}
Add-Content "$env:TEMP\gopro_robot_log.txt" "MATCHED Explorer hwnd=$explorerHwnd for [$targetPath]"

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
}
"@

[WindowManager]::ShowWindow($explorerHwnd, 9) | Out-Null  # SW_RESTORE
Start-Sleep -Milliseconds 300
[WindowManager]::MoveWindow($explorerHwnd, 0, 0, 600, 500, $true) | Out-Null
Start-Sleep -Milliseconds 400

Write-Host "WINDOWS_POSITIONED"
# === END WINDOW MANAGEMENT ===

[MouseRobot]::SetForegroundWindow($explorerHwnd)
Start-Sleep -Milliseconds 400

# Click center of Explorer window (positioned at 0,0 size 600x500)
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

# POST-DROP SEQUENCE

# Step 1 — Click batch list area and Ctrl+A to select all files in GoPro queue
Click-GoPro -x ${batchList.x} -y ${batchList.y} -delayMs 500
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500

# Step 2 — Click HyperSmooth Pro toggle (10-bit is already default — NOT clicked)
Click-GoPro -x ${hyperSmooth.x} -y ${hyperSmooth.y} -delayMs 800

# Step 3 — Click unGain button (must happen before adjusting sliders)
Click-GoPro -x ${unGain.x} -y ${unGain.y} -delayMs 800

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
      } else {
        event.sender.send('gopro-robot-status', { success: true, exitCode: code });
        const exportSuccess = await waitForExportComplete(outputDir, robotStartTime, expectedCount, event.sender);
        if (exportSuccess && removeQueue && typeof removeQueue.x === 'number' && typeof removeQueue.y === 'number' && !event.sender.isDestroyed()) {
          const removeScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, int extra);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

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
    const vDir = videosFolder || 'C:\\Users\\Jason\\Videos';
    const entries = fs.readdirSync(vDir);
    const matched = entries
      .filter(f => f.toLowerCase().endsWith('.mp4'))
      .map(f => path.join(vDir, f))
      .filter(f => {
        try { return fs.statSync(f).mtimeMs >= robotStartTime; } catch { return false; }
      });

    const files = [];
    for (const src of matched) {
      const dest = path.join(stabilizedFolder, path.basename(src));
      try {
        fs.renameSync(src, dest);
      } catch {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
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
    const totalBytes = walkSize(cardFolder);
    const totalGB = parseFloat((totalBytes / (1024 ** 3)).toFixed(2));
    return { moved: files.length, files, totalGB };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

    return await new Promise((resolve, reject) => {
      const proc = spawn('robocopy', [source, targetRawPath, '/E', '/Z', '/W:5', '/R:3'], {
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
          const fileCount = countFilesRecursive(targetRawPath);
          if (fileCount === 0) {
            reject(new Error('Robocopy completed but destination folder is empty — verify SD card contents'));
          } else {
            const sizeGB = calculateFolderSizeGB(targetRawPath);
            resolve({ success: true, message: 'SD card copied successfully.', sourceFileCount, fileCount, sizeGB, matched: sourceFileCount === fileCount });
          }
        }
      });

      proc.on('error', (err) => reject(err));
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
});
