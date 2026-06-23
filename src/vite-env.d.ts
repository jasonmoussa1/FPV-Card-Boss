/// <reference types="vite/client" />

// Build timestamp injected by vite.config.ts `define`
declare const __BUILD_TIME__: string;

interface ElectronBridge {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
  selectFolder(): Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calibrateRobot(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runGoProRobot(coords: any, rawPath: string, stabilizedPath: string, goProPath: string, goProOutputPath?: string, meta?: { cardId: string; pilotName: string; artistName: string; horizonLock?: boolean; dual?: boolean }): Promise<{ success: boolean; message: string; robotStartTime?: number; dual?: boolean }>;
  dashboardGetInfo(): Promise<{ port: number; running: boolean; urls: { label: string; url: string }[]; moveMode: 'auto' | 'manual'; movePassword?: string; tailscaleHttpsUrl?: string }>;
  dashboardSetMovePassword(pw: string): Promise<{ ok: boolean; movePassword: string }>;
  dashboardSetSitemap(srcPath?: string): Promise<{ ok: boolean; canceled?: boolean; error?: string; hasSiteMap?: boolean; version?: number; ext?: string; port?: number }>;
  dashboardClearSitemap(): Promise<{ ok: boolean; error?: string; hasSiteMap?: boolean; version?: number; ext?: string; port?: number }>;
  dashboardGetSitemapInfo(): Promise<{ hasSiteMap: boolean; version: number; ext: string; port: number }>;
  dashboardSetPort(port: number): Promise<{ port: number; running: boolean; urls: { label: string; url: string }[]; moveMode: 'auto' | 'manual'; error?: string }>;
  dashboardSetMoveMode(mode: 'auto' | 'manual'): Promise<{ ok?: boolean; moveMode?: 'auto' | 'manual'; error?: string }>;
  onDashboardStatus(callback: (status: { moveMode?: 'auto' | 'manual'; [k: string]: unknown }) => void): void;
  offDashboardStatus(): void;
  onDashboardMoveDone(callback: (data: { moved: number; files: string[]; totalGB?: number; cardId?: string }) => void): void;
  offDashboardMoveDone(): void;
  onDashboardCommand(callback: (data: { action: 'copyMedia' | 'copyBella' | 'dumpRaws' | 'completeCard' | 'deliverAll' | 'deleteSd' }) => void): void;
  offDashboardCommand(): void;
  dashboardReportState(patch: {
    mode?: 'festival' | 'simple';
    state?: 'idle' | 'running' | 'complete' | 'error';
    cardId?: string; pilotName?: string; artistName?: string;
    fileCount?: number; expectedCount?: number; totalSizeMB?: number; countLabel?: string;
    lastMovedCount?: number; lastActivity?: string;
    mediaAvailable?: boolean; mediaState?: 'idle' | 'copying' | 'success' | 'error'; mediaDest?: string; mediaHint?: string;
    bellaAvailable?: boolean; bellaState?: 'idle' | 'copying' | 'success' | 'error'; bellaDest?: string; bellaHint?: string;
    dumpAvailable?: boolean; dumpState?: 'idle' | 'dumping' | 'success' | 'error'; dumpDest?: string; dumpHint?: string;
    completeAvailable?: boolean; completeHint?: string;
    deleteSdAvailable?: boolean; deleteSdState?: 'idle' | 'deleting' | 'success' | 'error'; deleteSdHint?: string; deleteSdDest?: string;
  }): Promise<{ ok: boolean }>;
  dashboardReportShotlist(items: Array<{ id: string; daySection: string; pilot: string; assignment: string; stage?: string; setTime?: string; flyTime?: string; dropTime?: string; notes?: string; status: string; takes?: string }>): Promise<{ ok: boolean }>;
  onDashboardNotify(callback: (n: { type?: string; name?: string; status?: string }) => void): void;
  offDashboardNotify(): void;
  onDashboardShotlistCommand(callback: (cmd: { id?: string; match?: { assignment?: string; pilot?: string; daySection?: string }; patch?: Record<string, string> }) => void): void;
  offDashboardShotlistCommand(): void;
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
  moveStabilizedFiles(data: { videosFolder?: string; stabilizedFolder: string; robotStartTime: number }): Promise<{ moved: number; files: string[]; totalGB?: number; success?: boolean; error?: string }>;
  copyToMediaDrive(data: { localStabilizedPath: string; mediaDrivePath: string; cardId: string }): Promise<{ success: boolean; message?: string; cardId?: string; fileCount?: number; sizeGB?: string }>;
  onMediaDriveCopyProgress(callback: (pct: number) => void): void;
  offMediaDriveCopyProgress(): void;
  copyToBellaDrive(data: { localStabilizedPath: string; bellaDestPath: string; artistName: string }): Promise<{ success: boolean; message?: string; artistName?: string; fileCount?: number; sizeGB?: string }>;
  onBellaDriveCopyProgress(callback: (pct: number) => void): void;
  offBellaDriveCopyProgress(): void;
  deleteSdRawFiles(data: { sdDrivePath: string; protectedRoots: string[] }): Promise<{ success: boolean; message?: string; deletedCount?: number; freedGB?: string; errors?: string[] }>;
  dumpRaws(data: { pilotRootPath: string; dumpFolderPath: string }): Promise<{ success: boolean; message?: string; copied?: number; skipped?: number; sizeGB?: string }>;
  onDumpRawsProgress(callback: (data: { current: number; total: number; copied: number; skipped: number }) => void): void;
  offDumpRawsProgress(): void;
  saveCalibration(coords: unknown): Promise<{ success: boolean; error?: string }>;
  loadCalibration(): Promise<{ found: true; coords: unknown; hostname: string; width: number; height: number; savedAt: string; key: string } | { found: false }>;
  onGoProRemoveComplete(callback: () => void): void;
  offGoProRemoveComplete(): void;
}

declare interface Window {
  electron?: ElectronBridge;
}
