/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * mac-fs.cjs — macOS equivalents of the Windows (Robocopy / drive-letter) file
 * operations in main.cjs. Each function mirrors the matching IPC handler's
 * arguments AND return shape exactly, so main.cjs can delegate with a one-line
 * gated branch and the renderer sees identical results on both platforms.
 *
 * Copies use `rsync` (the macOS Robocopy equivalent). Flags chosen for external
 * media: -rt (recursive + keep mtimes), --no-perms/--no-owner/--no-group so
 * copying onto exFAT/FAT drives doesn't fail trying to preserve POSIX ownership.
 * `--info=progress2` gives an overall percentage we forward to the same progress
 * channels the Windows handlers use.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// ── shared helpers (mirror the cross-platform ones in main.cjs) ──────────────

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

function calculateFolderSizeGB(folderPath) {
  let totalBytes = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else { try { totalBytes += fs.statSync(entryPath).size; } catch {} }
    }
  }
  try { walk(folderPath); } catch {}
  return (totalBytes / 1073741824).toFixed(2) + ' GB';
}

/**
 * Core rsync copy of the CONTENTS of src into dest (matches Robocopy `src dst /E`).
 * onPct(0..100) is called as progress is parsed. Resolves on success, rejects on
 * a non-zero/non-trivial rsync exit (24 = "some files vanished", treated as OK).
 */
function rsyncCopy(src, dest, onPct) {
  return new Promise((resolve, reject) => {
    try { fs.mkdirSync(dest, { recursive: true }); } catch {}
    const args = [
      '-rt', '--info=progress2', '--no-perms', '--no-owner', '--no-group',
      src.replace(/\/?$/, '/'),
      dest.replace(/\/?$/, '/'),
    ];
    const proc = spawn('rsync', args);
    proc.stdout.on('data', (chunk) => {
      const m = String(chunk).match(/(\d+)%/g);
      if (m && m.length && typeof onPct === 'function') {
        const last = parseInt(m[m.length - 1], 10);
        if (!Number.isNaN(last)) onPct(last);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 || code === 24) resolve(code);
      else reject(new Error(`rsync failed with exit code ${code}`));
    });
  });
}

// ── high-level operations (1:1 with the Windows handlers) ────────────────────

// copy-to-media: RAW → media/RAW (0–50%), STABILIZED → media/STABILIZED (50–100%)
async function copyToMedia(localRawPath, localStabilizedPath, mediaDrivePath, onPct) {
  await rsyncCopy(localRawPath, path.join(mediaDrivePath, 'RAW'), (p) => onPct(p * 0.5));
  await rsyncCopy(localStabilizedPath, path.join(mediaDrivePath, 'STABILIZED'), (p) => onPct(50 + p * 0.5));
  return { success: true, message: 'Media drive copy complete.' };
}

// copy-to-bella: STABILIZED (recursive, incl. HORIZON LOCK subfolder) → bella
async function copyToBella(localStabilizedPath, bellaSocialPath, onPct) {
  await rsyncCopy(localStabilizedPath, bellaSocialPath, onPct);
  return { success: true, message: 'Bella social copy complete.' };
}

// copy-to-media-drive: RAW + STABILIZED → media drive card folder.
// STABILIZED is copied FIRST so the deliverable (stabilized) clips reach the media
// drive fastest during a live show, then RAW. (Was a single whole-folder copy, which
// sent RAW first alphabetically.)
async function copyToMediaDrive(localStabilizedPath, mediaDrivePath, cardId, onPct) {
  const localCardPath = path.dirname(localStabilizedPath);
  const localRawPath = path.join(localCardPath, 'RAW');
  if (fs.existsSync(localStabilizedPath)) {
    await rsyncCopy(localStabilizedPath, path.join(mediaDrivePath, 'STABILIZED'), (p) => { if (onPct) onPct(p * 0.5); });
  }
  if (fs.existsSync(localRawPath)) {
    await rsyncCopy(localRawPath, path.join(mediaDrivePath, 'RAW'), (p) => { if (onPct) onPct(50 + p * 0.5); });
  }
  return {
    success: true,
    cardId,
    fileCount: countFilesRecursive(mediaDrivePath),
    sizeGB: calculateFolderSizeGB(mediaDrivePath),
  };
}

// copy-to-bella-drive: STABILIZED → bella artist folder (artist name required)
async function copyToBellaDrive(localStabilizedPath, bellaDestPath, artistName, onPct) {
  if (!artistName || !artistName.trim()) {
    return {
      success: false,
      message: 'No artist or shot name assigned to this card. Please verify the shot list assignment before copying to Bella.',
    };
  }
  await rsyncCopy(localStabilizedPath, bellaDestPath, onPct);
  return {
    success: true,
    artistName,
    fileCount: countFilesRecursive(bellaDestPath),
    sizeGB: calculateFolderSizeGB(bellaDestPath),
  };
}

// copy-sd-to-raw: SD card → RAW, with the same BATCH_NN-subfolder behaviour.
async function copySdToRaw(sdPath, targetRawPath, onPct) {
  const source = String(sdPath || '').replace(/\/+$/, '');
  const sourceFileCount = countFilesRecursive(source);

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

  await rsyncCopy(source, dest, onPct);

  const fileCount = countFilesRecursive(dest);
  if (fileCount === 0) throw new Error('Copy completed but destination folder is empty — verify SD card contents');
  return {
    success: true,
    message: batchSubfolder
      ? `SD card copied into new subfolder ${batchSubfolder} (folder already had files).`
      : 'SD card copied successfully.',
    sourceFileCount,
    fileCount,
    sizeGB: calculateFolderSizeGB(dest),
    matched: sourceFileCount === fileCount,
    activeRawPath: dest,
    batchSubfolder,
  };
}

// delete-sd-raw-files: macOS-safe variant (no drive letters). Refuses the system
// volume / home, and any path that overlaps a configured working/media/Bella root.
function deleteSdRawFiles(sdDrivePath, protectedRoots) {
  const sdRaw = String(sdDrivePath || '').trim();
  if (!sdRaw) return { success: false, message: 'No SD Card path is set in Setup.' };

  let resolved;
  try { resolved = fs.realpathSync(sdRaw); } catch { resolved = path.resolve(sdRaw); }

  // Safety 1 — never the root, system areas, or the home folder.
  const forbidden = ['/', '/System', '/Library', '/Applications', '/private', os.homedir(), '/Users'];
  if (forbidden.some((f) => resolved === f)) {
    return { success: false, message: `Refusing to delete from a protected location (${resolved}). Check the SD Card path setting.` };
  }
  // SD cards normally mount under /Volumes — anything else is suspicious.
  if (!resolved.startsWith('/Volumes/')) {
    return { success: false, message: `SD card path should be under /Volumes (got ${resolved}). Check the SD Card path setting.` };
  }

  // Safety 2 — never overlap a configured working/media/Bella root (same volume tree).
  const overlaps = (protectedRoots || [])
    .map((p) => { try { return fs.realpathSync(String(p)); } catch { return path.resolve(String(p || '')); } })
    .filter(Boolean)
    .some((pr) => pr === resolved || pr.startsWith(resolved + path.sep) || resolved.startsWith(pr + path.sep));
  if (overlaps) {
    return { success: false, message: `Refusing to delete: ${resolved} overlaps one of your working/media/Bella folders, not an SD card. Check the SD Card path.` };
  }

  if (!fs.existsSync(sdRaw)) return { success: false, message: `SD card not found at ${sdRaw} — is it inserted?` };

  const VIDEO_EXTS = new Set(['.mp4', '.lrv', '.thm', '.gpr', '.360']);
  let deletedCount = 0;
  let freedBytes = 0;
  const errors = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try { const sz = fs.statSync(full).size; fs.unlinkSync(full); deletedCount++; freedBytes += sz; }
        catch (e) { errors.push(`${entry.name}: ${e.message}`); }
      }
    }
  };
  walk(sdRaw);
  return { success: true, deletedCount, freedGB: (freedBytes / (1024 ** 3)).toFixed(2), errors };
}

// find-gopro-path: GoPro Player lives in /Applications on macOS.
function findGoProPath() {
  const candidate = '/Applications/GoPro Player.app';
  return fs.existsSync(candidate) ? candidate : 'GoPro Player';
}

// Default GoPro export folder on macOS (Windows uses C:\Users\<user>\Videos).
function defaultExportDir() {
  return path.join(os.homedir(), 'Movies');
}

module.exports = {
  copyToMedia,
  copyToBella,
  copyToMediaDrive,
  copyToBellaDrive,
  copySdToRaw,
  deleteSdRawFiles,
  findGoProPath,
  defaultExportDir,
};
