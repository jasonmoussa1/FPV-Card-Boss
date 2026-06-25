/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * platform.cjs — Cross-platform OS automation layer for FPV Card Boss.
 *
 * PURPOSE
 *   FPV Card Boss began as a Windows-only tool: the GoPro "robot", the SD-card
 *   copy, and window focusing are all implemented in main.cjs using PowerShell,
 *   user32.dll, Robocopy and `shell:AppsFolder`. None of that exists on macOS.
 *
 *   This module is the seam that lets the same app run on both. It provides:
 *     • platform detection + a persisted user override (the in-app PC/Mac picker)
 *     • a macOS automation implementation (`macAutomation`) that mirrors what the
 *       Windows code does, using native macOS facilities.
 *
 * STATUS (Phase 1 — foundation)
 *   Detection + override + the macOS module are in place and SAFE to require on
 *   Windows: nut.js is lazy-required *inside* the click functions, so importing
 *   this file never fails even though nut.js is not installed yet.
 *
 *   The existing Windows IPC handlers in main.cjs are deliberately UNCHANGED.
 *   Phase 2 wires main.cjs's robot/copy handlers to call `macAutomation.*` when
 *   the resolved platform is 'mac'. Until then, the Mac robot path is gated off
 *   and the UI shows a "macOS automation in progress" notice.
 *
 * MAC CLICK ENGINE
 *   @nut-tree-fork/nut-js — the maintained MIT community fork of nut.js. It drives
 *   the mouse/keyboard via native CGEvents (real hardware-style events), the same
 *   model as the Windows user32.dll robot. Install in Phase 2:
 *       npm i @nut-tree-fork/nut-js
 *   and rebuild the native binding for Electron (electron-rebuild) + asarUnpack.
 *   macOS will also require Accessibility + Screen Recording permissions.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ── Platform detection + persisted override ─────────────────────────────────

/** Auto-detected platform from the OS. */
function detectPlatform() {
  return process.platform === 'darwin' ? 'mac' : 'win';
}

function overridePath(userDataDir) {
  return path.join(userDataDir, 'platform.json');
}

/** The platform the user explicitly picked, or null if they never chose. */
function getStoredPlatform(userDataDir) {
  try {
    const p = overridePath(userDataDir);
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && (j.platform === 'mac' || j.platform === 'win')) return j.platform;
    }
  } catch { /* ignore */ }
  return null;
}

/** Persist the user's PC/Mac choice. */
function setStoredPlatform(userDataDir, platform) {
  if (platform !== 'mac' && platform !== 'win') {
    throw new Error(`invalid platform: ${platform}`);
  }
  fs.writeFileSync(
    overridePath(userDataDir),
    JSON.stringify({ platform, savedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  return platform;
}

/** The platform the app should actually behave as: explicit choice, else detected. */
function resolvePlatform(userDataDir) {
  return getStoredPlatform(userDataDir) || detectPlatform();
}

// ── macOS automation (mirrors the Windows robot/copy/launch surface) ─────────
//
// nut.js is required lazily so this file imports cleanly before the dependency
// is installed (Phase 1) and on Windows (where it is never used).
let _nut = null;
function nut() {
  if (_nut) return _nut;
  _nut = require('@nut-tree-fork/nut-js'); // installed in Phase 2
  return _nut;
}

const macAutomation = {
  /** Launch GoPro Player (the Mac App Store app is just "GoPro Player"). */
  launchGoProPlayer() {
    return new Promise((resolve, reject) => {
      const p = spawn('open', ['-a', 'GoPro Player']);
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve(true) : reject(new Error(`open exited ${code}`))));
    });
  },

  /** GoPro Player's default export location on macOS. */
  getDefaultExportDir() {
    return path.join(os.homedir(), 'Movies');
  },

  /** rsync replacement for Robocopy. Preserves metadata; reports overall %. */
  async copyTree(src, dest, onProgress) {
    await fs.promises.mkdir(dest, { recursive: true });
    return new Promise((resolve, reject) => {
      const proc = spawn('rsync', [
        '-a', '--info=progress2',
        src.replace(/\/?$/, '/'),   // trailing slash = copy contents
        dest.replace(/\/?$/, '/'),
      ]);
      proc.stdout.on('data', (d) => {
        const m = String(d).match(/(\d+)%/);
        if (m && typeof onProgress === 'function') onProgress(Number(m[1]));
      });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve(true) : reject(new Error(`rsync exited ${code}`))));
    });
  },

  /** Read the cursor position (Phase 2; main uses Electron's screen API today). */
  async getCursorPos() {
    const { mouse } = nut();
    const pt = await mouse.getPosition();
    return { x: pt.x, y: pt.y };
  },

  /** Move the mouse to absolute screen coordinates. */
  async moveMouse(x, y) {
    const { mouse, Point } = nut();
    await mouse.setPosition(new Point(x, y));
  },

  /** Move to (x,y) and left-click. */
  async click(x, y) {
    const { mouse, Point, Button } = nut();
    await mouse.setPosition(new Point(x, y));
    await mouse.click(Button.LEFT);
  },

  /** Press a single key by its nut.js Key name (e.g. 'Space'). */
  async pressKey(keyName) {
    const { keyboard, Key } = nut();
    await keyboard.pressKey(Key[keyName]);
    await keyboard.releaseKey(Key[keyName]);
  },

  /** Press a key combo, e.g. ['LeftSuper','A'] for Cmd+A (select all). */
  async keyCombo(keyNames) {
    const { keyboard, Key } = nut();
    const keys = keyNames.map((k) => Key[k]);
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
  },

  /** Bring an app to the foreground (macOS equivalent of SetForegroundWindow). */
  focusWindow(appName) {
    return new Promise((resolve) => {
      const p = spawn('osascript', ['-e', `tell application "${appName}" to activate`]);
      p.on('close', () => resolve(true));
      p.on('error', () => resolve(false));
    });
  },
};

module.exports = {
  detectPlatform,
  resolvePlatform,
  getStoredPlatform,
  setStoredPlatform,
  macAutomation,
};
