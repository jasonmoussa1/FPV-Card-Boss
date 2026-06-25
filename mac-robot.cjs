/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * mac-robot.cjs — macOS GoPro Player export robot.
 *
 * A 1:1 port of the Windows PowerShell robot in main.cjs (the `run-gopro-robot`
 * handler), built on @nut-tree-fork/nut-js for native mouse/keyboard control and
 * AppleScript (osascript) for window focus + opening Finder. It is driven by the
 * SAME 14 calibration points the Windows robot uses, so the only Mac-specific
 * thing the operator does is recalibrate (positions differ; the sequence is
 * identical).
 *
 * Windows → macOS equivalents:
 *   user32 SetCursorPos / mouse_event  →  nut.js mouse.setPosition / click / press/releaseButton
 *   SendKeys ^a (Ctrl+A)               →  nut.js Cmd+A  (Key.LeftSuper + Key.A)
 *   SetForegroundWindow(goProHwnd)     →  osascript: tell application "GoPro Player" to activate
 *   Shell.Explore + UIA drag origin    →  osascript: open Finder at RAW folder, then drag
 *
 * STATUS: every coordinate-driven step (clicks, the two slider drags, select-all,
 * aspect ratio, start) is complete and final — those only depend on calibration,
 * not on the Mac UI layout. The ONE step that still needs on-Mac confirmation is
 * how files get into the batch queue (`addFiles`): GoPro Player's add mechanism
 * (Finder drag vs an Add button vs File menu) and the exact drag origin. That is
 * isolated in `addFiles()` and clearly marked; everything else can run as-is.
 *
 * nut.js requires macOS Accessibility permission to move the mouse/keyboard and
 * Screen Recording to read the screen — see checkPermissions() / main.cjs.
 */

const { spawn } = require('child_process');

// ── helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run an AppleScript snippet, resolving stdout. */
function osa(script) {
  return new Promise((resolve, reject) => {
    const p = spawn('osascript', ['-e', script]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `osascript exited ${code}`))));
  });
}

// nut.js is loaded lazily so importing this module never fails on Windows / before install.
let _nut = null;
function nut() {
  if (_nut) return _nut;
  try {
    _nut = require('@nut-tree-fork/nut-js');
  } catch (e) {
    throw new Error(
      'macOS automation engine (@nut-tree-fork/nut-js) is not installed. Run `npm install` on the Mac. Original: ' + e.message,
    );
  }
  // Make movements deterministic: instant moves, small fixed key delay.
  try {
    _nut.mouse.config.mouseSpeed = 3000;
    _nut.mouse.config.autoDelayMs = 0;
    _nut.keyboard.config.autoDelayMs = 20;
  } catch { /* config shape may vary across versions */ }
  return _nut;
}

async function focusGoPro() {
  try { await osa('tell application "GoPro Player" to activate'); } catch { /* keep going */ }
  await sleep(100);
}

/** Move to (x,y) and left-click, refocusing GoPro first (mirrors Click-GoPro). */
async function clickGoPro(x, y, delayMs = 500) {
  const { mouse, Button, Point } = nut();
  await focusGoPro();
  await mouse.setPosition(new Point(Math.round(x), Math.round(y)));
  await sleep(120);
  await mouse.click(Button.LEFT);
  await sleep(delayMs);
}

/** Cmd+A (select all) — the Mac equivalent of Ctrl+A. */
async function selectAll() {
  const { keyboard, Key } = nut();
  await keyboard.pressKey(Key.LeftSuper, Key.A);
  await keyboard.releaseKey(Key.LeftSuper, Key.A);
}

/** Press-drag a slider from start→end over N interpolation steps (mirrors Windows). */
async function dragSlider(start, end, steps = 15, stepMs = 30) {
  const { mouse, Button, Point } = nut();
  await focusGoPro();
  await mouse.setPosition(new Point(Math.round(start.x), Math.round(start.y)));
  await sleep(200);
  await mouse.pressButton(Button.LEFT);
  await sleep(200);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    await mouse.setPosition(new Point(
      Math.round(start.x + (end.x - start.x) * t),
      Math.round(start.y + (end.y - start.y) * t),
    ));
    await sleep(stepMs);
  }
  await mouse.releaseButton(Button.LEFT);
  await sleep(800);
}

/**
 * Add the RAW clips to GoPro's batch queue.
 *
 * ⚠️ NEEDS ON-MAC CONFIRMATION (the only such step). Default approach mirrors the
 * Windows robot: open Finder at the RAW folder, select all, and drag onto GoPro's
 * calibrated dropZone. The drag ORIGIN is taken from an optional `finderFirstFile`
 * calibration point if present (deterministic); otherwise it falls back to the
 * centre of the positioned Finder window. If GoPro Player on Mac instead uses an
 * "Add" button + file picker, we'll swap this one function — nothing else changes.
 *
 * @param {string} rawPath  folder containing the .mp4 files
 * @param {{x:number,y:number}} dropZone  calibrated GoPro drop target
 * @param {{x:number,y:number}|null} finderFirstFile  optional calibrated drag origin
 * @param {number} ingestMs  how long to wait after the drop for GoPro to ingest
 */
async function addFiles(rawPath, dropZone, finderFirstFile, ingestMs = 4000) {
  const { mouse, Button, Point } = nut();

  // Open + position the Finder window at a known rectangle (top-left), like the
  // Windows robot does with the Explorer window.
  const FX = 0, FY = 0, FW = 640, FH = 520;
  await osa(
    'tell application "Finder"\n' +
    '  activate\n' +
    `  set targetFolder to (POSIX file "${rawPath}") as alias\n` +
    '  open targetFolder\n' +
    '  delay 0.4\n' +
    `  set bounds of front Finder window to {${FX}, ${FY}, ${FX + FW}, ${FY + FH}}\n` +
    'end tell',
  );
  await sleep(800);

  // Select all files in Finder (Finder is frontmost after the activate above).
  await selectAll();
  await sleep(500);

  // Drag origin: calibrated point if we have one, else centre of the file area.
  const origin = (finderFirstFile && typeof finderFirstFile.x === 'number')
    ? finderFirstFile
    : { x: FX + 150, y: FY + 140 };

  await mouse.setPosition(new Point(Math.round(origin.x), Math.round(origin.y)));
  await sleep(300);
  await mouse.pressButton(Button.LEFT);
  await sleep(500);
  const STEPS = 30;
  for (let s = 1; s <= STEPS; s++) {
    const t = s / STEPS;
    await mouse.setPosition(new Point(
      Math.round(origin.x + (dropZone.x - origin.x) * t),
      Math.round(origin.y + (dropZone.y - origin.y) * t),
    ));
    await sleep(50);
  }
  // Bring GoPro to the front before releasing so the drop lands in its window.
  await focusGoPro();
  await sleep(150);
  await mouse.releaseButton(Button.LEFT);
  await sleep(ingestMs);
}

// ── main sequence ─────────────────────────────────────────────────────────────

/**
 * Run the full GoPro export on macOS. Mirrors the Windows run-gopro-robot order.
 * Returns after clicking Start (file-move is handled by main.cjs, as on Windows).
 *
 * @param {object} coords  the 14 calibration points (same keys as Windows)
 * @param {object} opts    { rawPath, horizonLock?:bool, ingestMs?, onLog?:fn }
 */
async function runGoProExport(coords, opts = {}) {
  const {
    batchList, hyperSmooth, unGain, horizonLock,
    smoothnessStart, smoothnessEnd, croppingStart, croppingEnd,
    aspectRatioOpen, aspectRatio8x7, start, dropZone, removeQueue, finderFirstFile,
  } = coords;
  const log = typeof opts.onLog === 'function' ? opts.onLog : () => {};

  // Ensure GoPro Player is running and frontmost (launch if needed).
  try {
    await osa('tell application "GoPro Player" to activate');
  } catch {
    await osa('do shell script "open -a \\"GoPro Player\\""');
  }
  await sleep(1500);
  await focusGoPro();

  // Step 0 — Pre-clear the batch queue (remove stray leftovers) if calibrated.
  const canClear = removeQueue && typeof removeQueue.x === 'number' && batchList && typeof batchList.x === 'number';
  if (canClear) {
    for (let pass = 0; pass < 2; pass++) {
      await clickGoPro(batchList.x, batchList.y, 400);
      await selectAll();
      await sleep(300);
      await clickGoPro(removeQueue.x, removeQueue.y, 500);
    }
    log('Pre-clear: select-all + Remove (x2) done');
  }

  // Step 1 — Add the RAW clips. (See addFiles caveat.)
  await addFiles(opts.rawPath, dropZone, finderFirstFile, opts.ingestMs);
  log('Files added to queue');

  // Step 2 — Select all clips in the GoPro queue.
  await clickGoPro(batchList.x, batchList.y, 500);
  await selectAll();
  await sleep(500);

  // Step 3 — HyperSmooth Pro toggle (10-bit is default, NOT clicked).
  await clickGoPro(hyperSmooth.x, hyperSmooth.y, 800);

  // Step 4 — un-gain / un-link (must precede slider adjustments).
  await clickGoPro(unGain.x, unGain.y, 800);

  // Step 4.5 — Horizon Lock (only if enabled in software and calibrated).
  if (opts.horizonLock && horizonLock && typeof horizonLock.x === 'number') {
    await clickGoPro(horizonLock.x, horizonLock.y, 800);
    log('Horizon Lock toggled ON');
  }

  // Step 5 — Smoothness slider 50 → 15.
  await dragSlider(smoothnessStart, smoothnessEnd);
  log('Smoothness dragged to 15');

  // Step 6 — Cropping slider 50 → 15.
  await dragSlider(croppingStart, croppingEnd);
  log('Cropping dragged to 15');

  // Step 7 — Open aspect-ratio dropdown.
  await clickGoPro(aspectRatioOpen.x, aspectRatioOpen.y, 800);

  // Step 8 — Choose 8:7.
  await clickGoPro(aspectRatio8x7.x, aspectRatio8x7.y, 800);

  // Step 9 — Start the export.
  await clickGoPro(start.x, start.y, 1000);
  log('Start clicked — export running');

  return { success: true };
}

/**
 * Check macOS Accessibility permission via nut.js (the permission needed to send
 * synthetic mouse/keyboard events). Returns true/false; never throws.
 */
async function checkAccessibility() {
  try {
    const { mouse } = nut();
    await mouse.getPosition(); // throws / returns junk if not permitted
    return true;
  } catch {
    return false;
  }
}

module.exports = { runGoProExport, checkAccessibility, osa };
