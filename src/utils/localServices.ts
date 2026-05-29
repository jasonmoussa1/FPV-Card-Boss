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

export async function copySDtoRAW(sdDriveLetter: string, targetRawPath: string): Promise<{ success: boolean; message: string; sourceFileCount?: number; fileCount?: number; sizeGB?: string; matched?: boolean }> {
  if (window.electron) {
    return window.electron.ipcRenderer.invoke('copy-sd-to-raw', { sdDriveLetter, targetRawPath }) as Promise<{ success: boolean; message: string; sourceFileCount?: number; fileCount?: number; sizeGB?: string; matched?: boolean }>;
  }
  console.log('Mock: Robocopy started', { sdDriveLetter, targetRawPath });
  return { success: true, message: 'Mock copy', sourceFileCount: 0, fileCount: 0, sizeGB: '0.00 GB', matched: true };
}

export async function openFolderInExplorer(folderPath: string): Promise<void> {
  if (window.electron) {
    await window.electron.ipcRenderer.invoke('open-folder', folderPath);
  } else {
    console.log('Mock: Opened folder', folderPath);
  }
}

export async function launchGoProWorkflow(rawPath: string, stabilizedPath: string): Promise<void> {
  if (window.electron) {
    await window.electron.launchGoProWorkflow(rawPath, stabilizedPath);
  } else {
    console.log('Mock: GoPro workflow launched', { rawPath, stabilizedPath });
  }
}

export async function automateGoPro(rawPath: string, stabilizedPath: string, goproAppPath: string): Promise<{ success: boolean; message: string }> {
  if (window.electron) {
    return window.electron.automateGoPro(rawPath, stabilizedPath, goproAppPath);
  }
  console.log('Mock: GoPro automation', { rawPath, stabilizedPath, goproAppPath });
  return { success: true, message: 'Mock automation' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function calibrateRobot(): Promise<any> {
  if (window.electron) {
    return window.electron.calibrateRobot();
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runGoProRobot(coords: any, rawPath: string, stabilizedPath: string, goProPath: string, goProOutputPath?: string): Promise<{ success: boolean; message: string; robotStartTime?: number }> {
  if (window.electron) {
    return window.electron.runGoProRobot(coords, rawPath, stabilizedPath, goProPath, goProOutputPath) as Promise<{ success: boolean; message: string; robotStartTime?: number }>;
  }
  console.log('Mock: GoPro robot', { coords, rawPath, stabilizedPath, goProPath, goProOutputPath });
  return { success: true, message: 'Mock robot', robotStartTime: Date.now() };
}

export async function moveExports(stabilizedPath: string, robotStartTime: number): Promise<{ success: boolean; movedFiles?: string[]; count?: number; error?: string }> {
  if (window.electron) {
    return window.electron.moveExports({ stabilizedPath, robotStartTime });
  }
  console.log('Mock: moveExports', { stabilizedPath, robotStartTime });
  return { success: true, movedFiles: [], count: 0 };
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
