/// <reference types="vite/client" />

interface ElectronBridge {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
  selectFolder(): Promise<string | null>;
  launchGoProWorkflow(rawPath: string, stabilizedPath: string): Promise<{ success: boolean }>;
  automateGoPro(rawPath: string, stabilizedPath: string, goproAppPath: string): Promise<{ success: boolean; message: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calibrateRobot(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runGoProRobot(coords: any, rawPath: string, stabilizedPath: string, goProPath: string, goProOutputPath?: string): Promise<{ success: boolean; message: string; robotStartTime?: number }>;
  onCopyProgress(callback: (pct: number) => void): void;
  offCopyProgress(): void;
  onGoProRobotStatus(callback: (data: { success: boolean; exitCode: number; error?: string }) => void): void;
  offGoProRobotStatus(): void;
  onGoProExportProgress(callback: (data: { fileCount: number; expectedCount: number; totalSizeMB: number; countLabel: string }) => void): void;
  offGoProExportProgress(): void;
  onGoProExportComplete(callback: (data: { files: string[]; fileCount: number; expectedCount: number; countLabel: string }) => void): void;
  offGoProExportComplete(): void;
  onGoProExportError(callback: (data: { error: string }) => void): void;
  offGoProExportError(): void;
  copyToMedia(localRawPath: string, localStabilizedPath: string, mediaDrivePath: string): Promise<{ success: boolean; message: string }>;
  onMediaCopyProgress(callback: (pct: number) => void): void;
  offMediaCopyProgress(): void;
  copyToBella(localStabilizedPath: string, bellaSocialPath: string): Promise<{ success: boolean; message: string }>;
  onBellaCopyProgress(callback: (pct: number) => void): void;
  offBellaCopyProgress(): void;
  moveExports(data: { stabilizedPath: string; robotStartTime: number }): Promise<{ success: boolean; movedFiles?: string[]; count?: number; error?: string }>;
  moveStabilizedFiles(data: { videosFolder?: string; stabilizedFolder: string; robotStartTime: number }): Promise<{ moved: number; files: string[]; totalGB?: number; success?: boolean; error?: string }>;
  copyToMediaDrive(data: { localStabilizedPath: string; mediaDrivePath: string; cardId: string }): Promise<{ success: boolean; message?: string; cardId?: string; fileCount?: number; sizeGB?: string }>;
  onMediaDriveCopyProgress(callback: (pct: number) => void): void;
  offMediaDriveCopyProgress(): void;
  copyToBellaDrive(data: { localStabilizedPath: string; bellaDestPath: string; artistName: string }): Promise<{ success: boolean; message?: string; artistName?: string; fileCount?: number; sizeGB?: string }>;
  onBellaDriveCopyProgress(callback: (pct: number) => void): void;
  offBellaDriveCopyProgress(): void;
  saveCalibration(coords: unknown): Promise<{ success: boolean; error?: string }>;
  loadCalibration(): Promise<{ found: true; coords: unknown; hostname: string; width: number; height: number; savedAt: string; key: string } | { found: false }>;
  onGoProRemoveComplete(callback: () => void): void;
  offGoProRemoveComplete(): void;
}

declare interface Window {
  electron?: ElectronBridge;
}
