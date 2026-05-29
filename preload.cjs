const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  calibrateRobot: () => ipcRenderer.invoke('calibrate-robot'),
  runGoProRobot: (coords, rawPath, stabilizedPath, goProPath, goProOutputPath) => ipcRenderer.invoke('run-gopro-robot', coords, rawPath, stabilizedPath, goProPath, goProOutputPath),
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
  saveCalibration: (coords) => ipcRenderer.invoke('save-calibration', { coords }),
  loadCalibration: () => ipcRenderer.invoke('load-calibration'),
  onGoProRemoveComplete: (callback) => ipcRenderer.on('gopro-remove-complete', () => callback()),
  offGoProRemoveComplete: () => ipcRenderer.removeAllListeners('gopro-remove-complete'),
});
