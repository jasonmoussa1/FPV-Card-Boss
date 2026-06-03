const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  calibrateRobot: () => ipcRenderer.invoke('calibrate-robot'),
  runGoProRobot: (coords, rawPath, stabilizedPath, goProPath, goProOutputPath, meta) => ipcRenderer.invoke('run-gopro-robot', coords, rawPath, stabilizedPath, goProPath, goProOutputPath, meta),
  dashboardGetInfo: () => ipcRenderer.invoke('dashboard-get-info'),
  dashboardSetPort: (port) => ipcRenderer.invoke('dashboard-set-port', port),
  // Desktop AUTO/MANUAL button → set move mode; persisted + broadcast to the phone.
  dashboardSetMoveMode: (mode) => ipcRenderer.invoke('dashboard-set-move-mode', mode),
  // Desktop sets the simple password that gates the phone's Move Files section.
  dashboardSetMovePassword: (pw) => ipcRenderer.invoke('dashboard-set-move-password', pw),
  // Live status pushed from main (so the desktop button mirrors phone-side changes).
  onDashboardStatus: (callback) => ipcRenderer.on('dashboard-status', (_event, data) => callback(data)),
  offDashboardStatus: () => ipcRenderer.removeAllListeners('dashboard-status'),
  onDashboardMoveDone: (callback) => ipcRenderer.on('dashboard-move-done', (_event, data) => callback(data)),
  offDashboardMoveDone: () => ipcRenderer.removeAllListeners('dashboard-move-done'),
  // Phone → desktop: forwarded delivery actions (copyMedia / copyBella / dumpRaws / completeCard)
  onDashboardCommand: (callback) => ipcRenderer.on('dashboard-command', (_event, data) => callback(data)),
  offDashboardCommand: () => ipcRenderer.removeAllListeners('dashboard-command'),
  // Desktop → phone: report which delivery destinations are available + their progress
  dashboardReportState: (patch) => ipcRenderer.invoke('dashboard-report-state', patch),
  // Desktop → phone: report the shot list (CSV assignments + per-shot status) so the
  // phone can view it filtered by pilot/day.
  dashboardReportShotlist: (items) => ipcRenderer.invoke('dashboard-report-shotlist', items),
  // Phone → desktop alert (shot completed on mobile): ding + toast on the computer.
  onDashboardNotify: (callback) => ipcRenderer.on('dashboard-notify', (_event, data) => callback(data)),
  offDashboardNotify: () => ipcRenderer.removeAllListeners('dashboard-notify'),
  // Phone → desktop: mark a shot done/skipped on the computer's shot list.
  onDashboardShotlistCommand: (callback) => ipcRenderer.on('dashboard-shotlist-command', (_event, data) => callback(data)),
  offDashboardShotlistCommand: () => ipcRenderer.removeAllListeners('dashboard-shotlist-command'),
  onCopyProgress: (callback) => {
    ipcRenderer.on('robocopy-progress', (_event, pct) => callback(pct));
  },
  offCopyProgress: () => {
    ipcRenderer.removeAllListeners('robocopy-progress');
  },
  validateSetup: (config) => ipcRenderer.invoke('validate-setup', config),
  onGoProRobotStatus: (callback) => ipcRenderer.on('gopro-robot-status', (_event, data) => callback(data)),
  offGoProRobotStatus: () => ipcRenderer.removeAllListeners('gopro-robot-status'),
  onGoProExportProgress: (callback) => ipcRenderer.on('gopro-export-progress', (_event, data) => callback(data)),
  offGoProExportProgress: () => ipcRenderer.removeAllListeners('gopro-export-progress'),
  onGoProExportComplete: (callback) => ipcRenderer.on('gopro-export-complete', (_event, data) => callback(data)),
  offGoProExportComplete: () => ipcRenderer.removeAllListeners('gopro-export-complete'),
  onGoProExportError: (callback) => ipcRenderer.on('gopro-export-error', (_event, data) => callback(data)),
  offGoProExportError: () => ipcRenderer.removeAllListeners('gopro-export-error'),
  copyToMedia: (localRawPath, localStabilizedPath, mediaDrivePath) => ipcRenderer.invoke('copy-to-media', { localRawPath, localStabilizedPath, mediaDrivePath }),
  onMediaCopyProgress: (callback) => ipcRenderer.on('media-copy-progress', (_event, pct) => callback(pct)),
  offMediaCopyProgress: () => ipcRenderer.removeAllListeners('media-copy-progress'),
  copyToBella: (localStabilizedPath, bellaSocialPath) => ipcRenderer.invoke('copy-to-bella', { localStabilizedPath, bellaSocialPath }),
  onBellaCopyProgress: (callback) => ipcRenderer.on('bella-copy-progress', (_event, pct) => callback(pct)),
  offBellaCopyProgress: () => ipcRenderer.removeAllListeners('bella-copy-progress'),
  moveStabilizedFiles: (data) => ipcRenderer.invoke('move-stabilized-files', data),
  getCursorPos: () => ipcRenderer.invoke('get-cursor-pos'),
  copyToMediaDrive: (data) => ipcRenderer.invoke('copy-to-media-drive', data),
  onMediaDriveCopyProgress: (callback) => ipcRenderer.on('media-drive-copy-progress', (_event, pct) => callback(pct)),
  offMediaDriveCopyProgress: () => ipcRenderer.removeAllListeners('media-drive-copy-progress'),
  copyToBellaDrive: (data) => ipcRenderer.invoke('copy-to-bella-drive', data),
  onBellaDriveCopyProgress: (callback) => ipcRenderer.on('bella-drive-copy-progress', (_event, pct) => callback(pct)),
  offBellaDriveCopyProgress: () => ipcRenderer.removeAllListeners('bella-drive-copy-progress'),
  deleteSdRawFiles: (data) => ipcRenderer.invoke('delete-sd-raw-files', data),
  dumpRaws: (data) => ipcRenderer.invoke('dump-raws', data),
  onDumpRawsProgress: (callback) => ipcRenderer.on('dump-raws-progress', (_event, data) => callback(data)),
  offDumpRawsProgress: () => ipcRenderer.removeAllListeners('dump-raws-progress'),
  saveCalibration: (coords) => ipcRenderer.invoke('save-calibration', { coords }),
  loadCalibration: () => ipcRenderer.invoke('load-calibration'),
  onGoProRemoveComplete: (callback) => ipcRenderer.on('gopro-remove-complete', () => callback()),
  offGoProRemoveComplete: () => ipcRenderer.removeAllListeners('gopro-remove-complete'),
});
