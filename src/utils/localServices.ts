/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FolderPaths {
  rawPath: string;
  stabilizedPath: string;
  mediaDrivePath: string;
  bellaSocialPath: string;
}

export async function createLocalFolders(pathsObject: FolderPaths): Promise<void> {
  if (window.electron) {
    await window.electron.ipcRenderer.invoke('create-folders', pathsObject);
  } else {
    console.log('Mock: Folders created', pathsObject);
  }
}

export async function copySDtoRAW(sdDriveLetter: string, targetRawPath: string): Promise<{ success: boolean; message: string; sourceFileCount?: number; fileCount?: number; sizeGB?: string; matched?: boolean; activeRawPath?: string; batchSubfolder?: string }> {
  if (window.electron) {
    return window.electron.ipcRenderer.invoke('copy-sd-to-raw', { sdDriveLetter, targetRawPath }) as Promise<{ success: boolean; message: string; sourceFileCount?: number; fileCount?: number; sizeGB?: string; matched?: boolean; activeRawPath?: string; batchSubfolder?: string }>;
  }
  console.log('Mock: Robocopy started', { sdDriveLetter, targetRawPath });
  return { success: true, message: 'Mock copy', sourceFileCount: 0, fileCount: 0, sizeGB: '0.00 GB', matched: true, activeRawPath: targetRawPath, batchSubfolder: '' };
}

export async function openFolderInExplorer(folderPath: string): Promise<void> {
  if (window.electron) {
    await window.electron.ipcRenderer.invoke('open-folder', folderPath);
  } else {
    console.log('Mock: Opened folder', folderPath);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function calibrateRobot(): Promise<any> {
  if (window.electron) {
    return window.electron.calibrateRobot();
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runGoProRobot(coords: any, rawPath: string, stabilizedPath: string, goProPath: string, goProOutputPath?: string, meta?: { cardId: string; pilotName: string; artistName: string; horizonLock?: boolean }): Promise<{ success: boolean; message: string; robotStartTime?: number }> {
  if (window.electron) {
    return window.electron.runGoProRobot(coords, rawPath, stabilizedPath, goProPath, goProOutputPath, meta) as Promise<{ success: boolean; message: string; robotStartTime?: number }>;
  }
  console.log('Mock: GoPro robot', { coords, rawPath, stabilizedPath, goProPath, goProOutputPath, meta });
  return { success: true, message: 'Mock robot', robotStartTime: Date.now() };
}

export async function deleteSdRawFiles(data: { sdDrivePath: string; protectedRoots: string[] }): Promise<{ success: boolean; message?: string; deletedCount?: number; freedGB?: string; errors?: string[] }> {
  if (window.electron) {
    return window.electron.deleteSdRawFiles(data);
  }
  console.log('Mock: deleteSdRawFiles', data);
  return { success: true, deletedCount: 0, freedGB: '0.00' };
}

export async function dumpRaws(data: { pilotRootPath: string; dumpFolderPath: string }): Promise<{ success: boolean; message?: string; copied?: number; skipped?: number; sizeGB?: string }> {
  if (window.electron) {
    return window.electron.dumpRaws(data);
  }
  console.log('Mock: dumpRaws', data);
  return { success: true, copied: 0, skipped: 0, sizeGB: '0.00' };
}

export function onDumpRawsProgress(callback: (data: { current: number; total: number; copied: number; skipped: number }) => void): void {
  if (window.electron) window.electron.onDumpRawsProgress(callback);
}

export function offDumpRawsProgress(): void {
  if (window.electron) window.electron.offDumpRawsProgress();
}

export async function selectFolder(): Promise<string | null> {
  if (window.electron) {
    return window.electron.selectFolder();
  }
  return null;
}

export function onCopyProgress(callback: (pct: number) => void): void {
  if (window.electron) {
    window.electron.onCopyProgress(callback);
  }
}

export function offCopyProgress(): void {
  if (window.electron) {
    window.electron.offCopyProgress();
  }
}

export async function copyToMedia(localRawPath: string, localStabilizedPath: string, mediaDrivePath: string): Promise<{ success: boolean; message: string }> {
  if (window.electron) {
    return window.electron.copyToMedia(localRawPath, localStabilizedPath, mediaDrivePath);
  }
  console.log('Mock: copyToMedia', { localRawPath, localStabilizedPath, mediaDrivePath });
  return { success: true, message: 'Mock copy' };
}

export function onMediaCopyProgress(callback: (pct: number) => void): void {
  if (window.electron) {
    window.electron.onMediaCopyProgress(callback);
  }
}

export function offMediaCopyProgress(): void {
  if (window.electron) {
    window.electron.offMediaCopyProgress();
  }
}

export async function copyToBella(localStabilizedPath: string, bellaSocialPath: string): Promise<{ success: boolean; message: string }> {
  if (window.electron) {
    return window.electron.copyToBella(localStabilizedPath, bellaSocialPath);
  }
  console.log('Mock: copyToBella', { localStabilizedPath, bellaSocialPath });
  return { success: true, message: 'Mock copy' };
}

export function onBellaCopyProgress(callback: (pct: number) => void): void {
  if (window.electron) {
    window.electron.onBellaCopyProgress(callback);
  }
}

export function offBellaCopyProgress(): void {
  if (window.electron) {
    window.electron.offBellaCopyProgress();
  }
}
