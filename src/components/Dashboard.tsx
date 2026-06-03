/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { extractFpvAssignments } from '../utils/csvParser';
import {
  FpvConfig,
  PilotConfig,
  ProcessedCard,
  SimpleCardLog,
} from '../types';
import { SAMPLE_CSV_DATA } from '../data/sampleCsv';
import {
  createLocalFolders,
  copySDtoRAW,
  copyToMedia,
  copyToBella,
  deleteSdRawFiles,
  dumpRaws,
  onDumpRawsProgress,
  offDumpRawsProgress,
  openFolderInExplorer,
  selectFolder,
  runGoProRobot,
  onCopyProgress,
  offCopyProgress,
  onMediaCopyProgress,
  offMediaCopyProgress,
  onBellaCopyProgress,
  offBellaCopyProgress,
} from '../utils/localServices';
import {
  Upload,
  RotateCcw,
  List,
  Folder,
  Activity,
  AlertTriangle,
  Sliders,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import ShotListPanel from './ShotListPanel';
import HelpButton from './HelpButton';
import UserManual from './UserManual';
import PhoneAccessPanel from './PhoneAccessPanel';

function cleanFolderName(input: string): string {
  if (!input) return "";
  return input
    .toUpperCase()
    .trim()
    .replace(/[\s\-\/\\:|]/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function Dashboard() {
  const [config, setConfig] = useState<FpvConfig>(() => {
    const saved = localStorage.getItem('fpv_boss_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.pilots || !Array.isArray(parsed.pilots)) {
          parsed.pilots = [];
        }
        const idx = parsed.activePilotIndex;
        if (typeof idx !== 'number' || idx < -1 || (idx >= 0 && idx >= parsed.pilots.length)) {
          parsed.activePilotIndex = -1;
        }
        if (!parsed.mode) parsed.mode = 'festival';
        if (!parsed.simpleConfig) parsed.simpleConfig = {
          showName: 'MY_SHOW',
          pilotName: 'Pilot',
          cardPrefix: 'A',
          startingCardNumber: 1,
          localRootPath: 'D:',
          mediaRootPath: 'M:',
          sdCardDrive: 'E:\\',
          goProOutputPath: 'C:\\Users\\Jason\\Videos',
          recentArtists: [],
        };
        if (!parsed.driveToggles) parsed.driveToggles = { mediaDrive: true, bellaDrive: true };
        if (!parsed.simpleConfig.driveToggles) parsed.simpleConfig.driveToggles = { mediaDrive: true };
        return parsed;
      } catch (e) {}
    }
    return {
      mode: 'festival' as const,
      eventName: 'EDC2026',
      pilots: [],
      activePilotIndex: -1,
      localRootPath: 'D:',
      mediaRootPath: 'M:',
      bellaRootPath: 'S:',
      rawDumpPath: '',
      autoDumpRaws: false,
      horizonLock: false,
      sdCardDrive: 'E:\\',
      goProAppPath: '',
      goProOutputPath: 'C:\\Users\\Jason\\Videos',
      robotCoords: null,
      driveToggles: { mediaDrive: true, bellaDrive: true },
      simpleConfig: {
        showName: 'MY_SHOW',
        pilotName: 'Pilot',
        cardPrefix: 'A',
        startingCardNumber: 1,
        localRootPath: 'D:',
        mediaRootPath: 'M:',
        sdCardDrive: 'E:\\',
        goProOutputPath: 'C:\\Users\\Jason\\Videos',
        recentArtists: [],
        driveToggles: { mediaDrive: true },
      },
    };
  });

  // One-time migration: clear sample CSV data from localStorage
  const _storedCsvForMigration = localStorage.getItem('fpv_boss_csv_text') || '';
  const _looksLikeSampleData = _storedCsvForMigration.includes('ARTIST / CONTENT')
    && _storedCsvForMigration.includes('Chris Teal')
    && _storedCsvForMigration.includes('EDC');
  if (_looksLikeSampleData) {
    localStorage.removeItem('fpv_boss_csv_text');
    localStorage.removeItem('fpv_boss_selected_day');
    localStorage.removeItem('fpv_boss_selected_pilot');
  }

  const [csvText, setCsvText] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_csv_text') || '';
  });

  const [selectedDaySection, setSelectedDaySection] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_selected_day') || '';
  });

  const [selectedPilot, setSelectedPilot] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_selected_pilot') || '';
  });

  const [currentCardNum, setCurrentCardNum] = useState<number>(() => {
    const saved = localStorage.getItem('fpv_boss_card_num');
    return saved ? parseInt(saved, 10) : (config.pilots[config.activePilotIndex]?.startingCardNumber ?? 1);
  });

  const [history, setHistory] = useState<ProcessedCard[]>(() => {
    const saved = localStorage.getItem('fpv_boss_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  const [sizeInput, setSizeInput] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_size_input') || '45 GB';
  });

  const [notesInput, setNotesInput] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_notes_input') || '';
  });

  const [skippedAssignments, setSkippedAssignments] = useState<string[]>(() => {
    const saved = localStorage.getItem('fpv_boss_skipped_assignments');
    try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });

  // A shot's status changed in the shot list (here or from the phone). Keep the
  // card queue's skip list in sync so a shot skipped in the list won't come back
  // as the "next card" — and an un-skip restores it.
  const handleShotStatusChange = useCallback((info: { assignment: string; pilot: string; daySection: string; status: string }) => {
    const key = `${info.daySection}|${info.pilot}|${info.assignment}`;
    setSkippedAssignments(prev => {
      const has = prev.includes(key);
      if (info.status === 'skipped') return has ? prev : [...prev, key];
      return has ? prev.filter(k => k !== key) : prev; // pending/completed → un-skip
    });
  }, []);

  const [customAssignmentOverride, setCustomAssignmentOverride] = useState<string>('');
  const [isSetupOpen, setIsSetupOpen] = useState<boolean>(false);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [setupTab, setSetupTab] = useState<'festival' | 'simple'>('festival');

  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isShotListOpen, setIsShotListOpen] = useState<boolean>(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [dashboardInfo, setDashboardInfo] = useState<{ port: number; running: boolean; urls: { label: string; url: string }[]; moveMode: 'auto' | 'manual'; tailscaleHttpsUrl?: string } | null>(null);
  // AUTO / MANUAL mode (mirrors main.cjs's moveMode; settable from desktop or phone).
  const [moveMode, setMoveMode] = useState<'auto' | 'manual'>('manual');
  // Auto-chain (move → media → bella → dump → complete) progress for the desktop UI.
  const [autoChainStatus, setAutoChainStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [autoChainStep, setAutoChainStep] = useState<string>('');
  // Red blinking-light alerts shown when the phone marks a shot done/skipped.
  const [mobileAlerts, setMobileAlerts] = useState<{ id: number; name: string; status: string }[]>([]);
  const [dashboardPortInput, setDashboardPortInput] = useState<string>('8723');
  const [movePasswordInput, setMovePasswordInput] = useState<string>('');
  const [historyPilotFilter, setHistoryPilotFilter] = useState<string>('ALL');
  const [copyProgress, setCopyProgress] = useState<number | null>(null);
  const [mediaCopyProgress, setMediaCopyProgress] = useState<number | null>(null);
  const [bellaCopyProgress, setBellaCopyProgress] = useState<number | null>(null);
  const [goProRobotStatus, setGoProRobotStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [robotStartTime, setRobotStartTime] = useState<number | null>(null);
  const [moveExportsStatus, setMoveExportsStatus] = useState<'idle' | 'moving' | 'success' | 'error'>('idle');
  const [moveExportsResult, setMoveExportsResult] = useState<{ files: string[]; moved: number; totalGB?: number } | null>(null);
  const [moveExportsError, setMoveExportsError] = useState<string | null>(null);
  const [goProRobotError, setGoProRobotError] = useState<string | null>(null);

  const [goProExportStatus, setGoProExportStatus] = useState<'idle' | 'polling' | 'complete' | 'error'>('idle');
  const [goProExportProgress, setGoProExportProgress] = useState<{ fileCount: number; expectedCount: number; totalSizeMB: number; countLabel: string } | null>(null);
  const [goProExportError, setGoProExportError] = useState<string | null>(null);

  const [mediaDriveCopyStatus, setMediaDriveCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [mediaDriveCopyProgress, setMediaDriveCopyProgress] = useState<number | null>(null);
  const [mediaDriveCopyResult, setMediaDriveCopyResult] = useState<{ fileCount: number; sizeGB: string } | null>(null);
  const [mediaDriveCopyError, setMediaDriveCopyError] = useState<string | null>(null);

  const [bellaDriveCopyStatus, setBellaDriveCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [bellaDriveCopyProgress, setBellaDriveCopyProgress] = useState<number | null>(null);
  const [bellaDriveCopyResult, setBellaDriveCopyResult] = useState<{ artistName: string; fileCount: number; sizeGB: string } | null>(null);
  const [bellaDriveCopyError, setBellaDriveCopyError] = useState<string | null>(null);

  const [sdDeleteStatus, setSdDeleteStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [sdDeleteResult, setSdDeleteResult] = useState<{ deletedCount: number; freedGB: string } | null>(null);
  const [sdDeleteError, setSdDeleteError] = useState<string | null>(null);

  const [foldersCreatedStatus, setFoldersCreatedStatus] = useState<'idle' | 'creating' | 'done'>('idle');

  const [dumpRawsStatus, setDumpRawsStatus] = useState<'idle' | 'dumping' | 'success' | 'error'>('idle');
  const [dumpRawsProgress, setDumpRawsProgress] = useState<{ current: number; total: number } | null>(null);
  const [dumpRawsResult, setDumpRawsResult] = useState<{ copied: number; skipped: number; sizeGB: string } | null>(null);
  const [dumpRawsError, setDumpRawsError] = useState<string | null>(null);

  const [preFlightStatus, setPreFlightStatus] = useState<'idle' | 'checking' | 'passed' | 'failed'>('idle');
  const [preFlightErrors, setPreFlightErrors] = useState<string[]>([]);
  const [preFlightWarnings, setPreFlightWarnings] = useState<string[]>([]);

  const [sdCopyResult, setSdCopyResult] = useState<{ sourceFileCount: number; fileCount: number; sizeGB: string; matched: boolean; batchSubfolder?: string } | null>(null);
  // When the same RAW folder is reused, the SD copy lands in a BATCH_NN subfolder.
  // The robot then stabilizes only that subfolder. Empty = use the base RAW path.
  const [sdBatchRawPath, setSdBatchRawPath] = useState<string>('');

  const [duplicateCardWarning, setDuplicateCardWarning] = useState<boolean>(false);
  const [duplicateCardIntent, setDuplicateCardIntent] = useState<'robot' | 'complete' | null>(null);

  const [simpleFolderName, setSimpleFolderName] = useState<string>(() => {
    return localStorage.getItem('fpv_boss_simple_folder_name') || '';
  });
  const [simpleMediaEnabled, setSimpleMediaEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('fpv_boss_simple_media_enabled');
    return saved === null ? true : saved === 'true';
  });
  const [simpleBellaEnabled, setSimpleBellaEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('fpv_boss_simple_bella_enabled');
    return saved === null ? true : saved === 'true';
  });
  const [simpleFolderNameError, setSimpleFolderNameError] = useState<string>('');
  const [simpleSessionLog, setSimpleSessionLog] = useState<SimpleCardLog[]>(() => {
    const saved = localStorage.getItem('fpv_boss_simple_log');
    if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    return [];
  });
  const [simpleFolderStatus, setSimpleFolderStatus] = useState<'idle' | 'creating' | 'done'>('idle');
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [isPilotCmdOpen, setIsPilotCmdOpen] = useState<boolean>(true);
  const [newPilotName, setNewPilotName] = useState<string>('');
  const [newPilotPrefix, setNewPilotPrefix] = useState<string>('');
  const [newPilotStartNum, setNewPilotStartNum] = useState<number>(1);
  const [cardNumberByPilot, setCardNumberByPilot] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('fpv_boss_card_by_pilot') || '{}'); } catch { return {}; }
  });
  const [availablePilots, setAvailablePilots] = useState<PilotConfig[]>(() => {
    try { return JSON.parse(localStorage.getItem('fpv_boss_available_pilots') || '[]'); } catch { return []; }
  });
  const [pilotActivateErrors, setPilotActivateErrors] = useState<string[]>([]);
  const [goProQueueCleared, setGoProQueueCleared] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('fpv_boss_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_csv_text', csvText);
  }, [csvText]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_selected_day', selectedDaySection);
  }, [selectedDaySection]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_selected_pilot', selectedPilot);
  }, [selectedPilot]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_card_num', String(currentCardNum));
  }, [currentCardNum]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_size_input', sizeInput);
  }, [sizeInput]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_notes_input', notesInput);
  }, [notesInput]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_skipped_assignments', JSON.stringify(skippedAssignments));
  }, [skippedAssignments]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_simple_folder_name', simpleFolderName);
  }, [simpleFolderName]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_simple_media_enabled', String(simpleMediaEnabled));
  }, [simpleMediaEnabled]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_simple_bella_enabled', String(simpleBellaEnabled));
  }, [simpleBellaEnabled]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_simple_log', JSON.stringify(simpleSessionLog));
  }, [simpleSessionLog]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_card_by_pilot', JSON.stringify(cardNumberByPilot));
  }, [cardNumberByPilot]);

  useEffect(() => {
    localStorage.setItem('fpv_boss_available_pilots', JSON.stringify(availablePilots));
  }, [availablePilots]);

  useEffect(() => {
    onCopyProgress((pct) => setCopyProgress(pct));
    return () => { offCopyProgress(); };
  }, []);

  useEffect(() => {
    onMediaCopyProgress((pct) => setMediaCopyProgress(pct));
    return () => { offMediaCopyProgress(); };
  }, []);

  useEffect(() => {
    onBellaCopyProgress((pct) => setBellaCopyProgress(pct));
    return () => { offBellaCopyProgress(); };
  }, []);

  useEffect(() => {
    window.electron?.onGoProRobotStatus((data) => {
      setGoProRobotStatus(data.success ? 'success' : 'error');
      setGoProRobotError(data.success ? null : (data.error ?? null));
    });
    return () => { window.electron?.offGoProRobotStatus(); };
  }, []);

  useEffect(() => {
    window.electron?.onGoProExportProgress((data) => {
      setGoProExportStatus('polling');
      setGoProExportProgress(data);
    });
    return () => { window.electron?.offGoProExportProgress(); };
  }, []);

  useEffect(() => {
    window.electron?.onGoProExportComplete((data) => {
      setGoProExportStatus('complete');
      setGoProExportProgress(prev => ({
        fileCount: data.fileCount,
        expectedCount: data.expectedCount,
        totalSizeMB: prev?.totalSizeMB ?? 0,
        countLabel: data.countLabel,
      }));
    });
    return () => { window.electron?.offGoProExportComplete(); };
  }, []);

  useEffect(() => {
    window.electron?.onGoProExportError((data) => {
      setGoProExportStatus('error');
      setGoProExportError(data.error ?? 'Export monitoring failed');
    });
    return () => { window.electron?.offGoProExportError(); };
  }, []);

  useEffect(() => {
    window.electron?.onGoProRemoveComplete(() => {
      setGoProQueueCleared(true);
      setTimeout(() => setGoProQueueCleared(false), 4000);
    });
    return () => { window.electron?.offGoProRemoveComplete(); };
  }, []);

  useEffect(() => {
    window.electron?.onMediaDriveCopyProgress((pct) => setMediaDriveCopyProgress(pct));
    return () => { window.electron?.offMediaDriveCopyProgress(); };
  }, []);

  useEffect(() => {
    window.electron?.onBellaDriveCopyProgress((pct) => setBellaDriveCopyProgress(pct));
    return () => { window.electron?.offBellaDriveCopyProgress(); };
  }, []);

  useEffect(() => {
    onDumpRawsProgress((data) => setDumpRawsProgress({ current: data.current, total: data.total }));
    return () => { offDumpRawsProgress(); };
  }, []);

  useEffect(() => {
    (async () => {
      const result = await window.electron?.loadCalibration();
      if (result && result.found) {
        // Only restore from the saved file if there is NO in-app calibration yet.
        // The in-app calibration (localStorage) is authoritative so a stale file
        // entry can never silently override a fresh calibration on reopen.
        setConfig(prev => (prev.robotCoords ? prev : { ...prev, robotCoords: result.coords }));
      }
    })();
  }, []);

  // Mobile dashboard: load server info (port + phone URLs) once on mount.
  useEffect(() => {
    (async () => {
      try {
        const info = await window.electron?.dashboardGetInfo();
        if (info) { setDashboardInfo(info); setDashboardPortInput(String(info.port ?? 8723)); setMovePasswordInput(info.movePassword ?? ''); if (info.moveMode === 'auto' || info.moveMode === 'manual') setMoveMode(info.moveMode); }
      } catch {}
    })();
  }, []);

  // Phone marked a shot done/skipped → ding + a RED blinking-light alert so the
  // operator knows that artist's footage is completed (or skipped) and coming over.
  // Alerts stay until dismissed.
  useEffect(() => {
    window.electron?.onDashboardNotify?.((n) => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const beep = (freq: number, start: number) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
          g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.45);
          o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + 0.45);
        };
        ctx.resume?.();
        beep(880, 0); beep(1175, 0.18);
      } catch { /* audio blocked — the light still shows */ }
      const name = n && n.name ? n.name : 'A shot';
      const status = n && n.status === 'skipped' ? 'skipped' : 'completed';
      setMobileAlerts(prev => [...prev, { id: Date.now() + Math.random(), name, status }]);
    });
    return () => { window.electron?.offDashboardNotify?.(); };
  }, []);
  const dismissAlert = (id: number) => setMobileAlerts(prev => prev.filter(a => a.id !== id));

  // Keep the desktop AUTO/MANUAL button in sync with live changes (e.g. toggled
  // from the phone). main.cjs pushes the full status object on every change.
  useEffect(() => {
    window.electron?.onDashboardStatus((s) => {
      if (s && (s.moveMode === 'auto' || s.moveMode === 'manual')) setMoveMode(s.moveMode);
    });
    return () => { window.electron?.offDashboardStatus(); };
  }, []);

  // Toggle handler for the big AUTO/MANUAL button (persists via main + broadcasts).
  const setMoveModeBoth = async (mode: 'auto' | 'manual') => {
    setMoveMode(mode);
    try { await window.electron?.dashboardSetMoveMode(mode); } catch {}
  };

  // When the phone (or auto-move) moves the files, reflect it in the desktop UI.
  useEffect(() => {
    window.electron?.onDashboardMoveDone((data) => {
      setMoveExportsStatus('success');
      setMoveExportsResult({ files: data.files ?? [], moved: data.moved ?? 0, totalGB: data.totalGB });
      if (data.totalGB !== undefined) setSizeInput(data.totalGB.toFixed(2) + ' GB');
    });
    return () => { window.electron?.offDashboardMoveDone(); };
  }, []);

  useEffect(() => {
    setDuplicateCardWarning(false);
    setDuplicateCardIntent(null);
  }, [currentCardNum, config.activePilotIndex]);

  useEffect(() => {
    if (!selectedPilot) return;
    setCardNumberByPilot(prev => ({ ...prev, [selectedPilot]: currentCardNum }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCardNum]);

  const allAssignments = useMemo(() => {
    if (!csvText.trim()) return [];
    return extractFpvAssignments(csvText);
  }, [csvText]);

  const daySections = useMemo(() => {
    const days = new Set<string>();
    allAssignments.forEach(a => {
      if (a.daySection) days.add(a.daySection);
    });
    return Array.from(days);
  }, [allAssignments]);

  const pilots = useMemo(() => {
    return Array.from(new Set(allAssignments.map(a => a.pilot).filter(Boolean)));
  }, [allAssignments]);

  useEffect(() => {
    if (daySections.length === 0) return;
    if (!selectedDaySection || !daySections.includes(selectedDaySection)) {
      setSelectedDaySection(daySections[0]);
    }
  }, [daySections]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeQueue = useMemo(() => {
    return allAssignments.filter(a => {
      if (a.daySection !== selectedDaySection) return false;
      if (a.pilot !== selectedPilot) return false;

      // Exclude anything already handled for this day/pilot — whether it was
      // COMPLETED or SKIPPED. (Previously only the skip-key list was checked, so a
      // skipped shot could reappear after completing the next card.)
      const isAlreadyHandled = history.some(
        h => h.assignment.toUpperCase().trim() === a.assignment.toUpperCase().trim() &&
             h.daySection === selectedDaySection &&
             h.pilot === selectedPilot &&
             (h.status === 'Complete' || h.status === 'Skip')
      );
      if (isAlreadyHandled) return false;

      const isSkipped = skippedAssignments.includes(`${a.daySection}|${a.pilot}|${a.assignment}`);
      if (isSkipped) return false;

      return true;
    });
  }, [allAssignments, selectedDaySection, selectedPilot, history, skippedAssignments]);

  // Full list of every assignment for the current day/pilot, regardless of
  // completion or skip status. Drives the "Choose from list" picker so an
  // artist can always be re-selected even after their card was completed.
  const pickerAssignments = useMemo(() => {
    return allAssignments
      .filter(a => a.daySection === selectedDaySection && a.pilot === selectedPilot)
      .map(a => ({
        ...a,
        isCompleted: history.some(
          h => h.assignment.toUpperCase() === a.assignment.toUpperCase() &&
               h.daySection === selectedDaySection &&
               h.pilot === selectedPilot &&
               h.status === 'Complete'
        ),
      }));
  }, [allAssignments, selectedDaySection, selectedPilot, history]);

  const firstAssignmentInQueue = activeQueue[0];
  const activeAssignmentName = useMemo(() => {
    if (customAssignmentOverride) return customAssignmentOverride;
    return firstAssignmentInQueue ? firstAssignmentInQueue.assignment : "NO ASSIGNMENTS IN QUEUE";
  }, [firstAssignmentInQueue, customAssignmentOverride]);

  const activeFlyTime = useMemo(() => {
    if (customAssignmentOverride) return "Custom Set Time / Direct Entry";
    return firstAssignmentInQueue ? firstAssignmentInQueue.flyTime : "--:--";
  }, [firstAssignmentInQueue, customAssignmentOverride]);

  const activeNotes = useMemo(() => {
    if (customAssignmentOverride) return "Manual custom entry.";
    return firstAssignmentInQueue ? firstAssignmentInQueue.notes : "";
  }, [firstAssignmentInQueue, customAssignmentOverride]);

  const activePilot = useMemo((): PilotConfig | null => {
    return (config.pilots || []).find(p => p.name === selectedPilot) ?? null;
  }, [config.pilots, selectedPilot]);

  const currentCardId = useMemo(() => {
    const padded = String(currentCardNum).padStart(3, '0');
    return `${(activePilot?.cardPrefix ?? '???').toUpperCase()}_${padded}`;
  }, [currentCardNum, activePilot]);

  const sanitizedEvent = useMemo(() => cleanFolderName(config.eventName), [config.eventName]);
  const sanitizedDay = useMemo(() => cleanFolderName(selectedDaySection), [selectedDaySection]);
  const sanitizedPilot = useMemo(() => cleanFolderName(selectedPilot), [selectedPilot]);
  const sanitizedCard = useMemo(() => currentCardId, [currentCardId]);
  const sanitizedArtist = useMemo(() => cleanFolderName(activeAssignmentName), [activeAssignmentName]);

  const localRawPath = useMemo(() => {
    const root = config.localRootPath.trim();
    if (activeAssignmentName === "NO ASSIGNMENTS IN QUEUE") {
      const segs = [root, sanitizedEvent, sanitizedPilot, sanitizedCard].filter(s => s && s.trim().length > 0);
      return segs.join('\\') + '\\RAW';
    }
    const segs = [root, sanitizedEvent, sanitizedPilot, sanitizedDay, sanitizedArtist].filter(s => s && s.trim().length > 0);
    return segs.join('\\') + '\\RAW';
  }, [config.localRootPath, sanitizedEvent, sanitizedPilot, sanitizedDay, sanitizedArtist, sanitizedCard, activeAssignmentName]);

  const localStabilizedPath = useMemo(() => {
    const root = config.localRootPath.trim();
    if (activeAssignmentName === "NO ASSIGNMENTS IN QUEUE") {
      const segs = [root, sanitizedEvent, sanitizedPilot, sanitizedCard].filter(s => s && s.trim().length > 0);
      return segs.join('\\') + '\\STABILIZED';
    }
    const segs = [root, sanitizedEvent, sanitizedPilot, sanitizedDay, sanitizedArtist].filter(s => s && s.trim().length > 0);
    return segs.join('\\') + '\\STABILIZED';
  }, [config.localRootPath, sanitizedEvent, sanitizedPilot, sanitizedDay, sanitizedArtist, sanitizedCard, activeAssignmentName]);

  // Reset the "Created" confirmation whenever the target folder changes (switching
  // artist/pilot/day, or after completing a card advances the queue).
  useEffect(() => {
    setFoldersCreatedStatus('idle');
  }, [localRawPath]);

  // Dump Raws is per-pilot — clear its result when the selected pilot changes.
  useEffect(() => {
    setDumpRawsStatus('idle');
    setDumpRawsResult(null);
    setDumpRawsError(null);
  }, [selectedPilot]);

  const destinationMediaDrivePath = useMemo(() => {
    const root = config.mediaRootPath.trim();
    return `${root}\\${sanitizedCard}`;
  }, [config.mediaRootPath, sanitizedCard]);

  const destinationBellaSocialPath = useMemo(() => {
    const root = config.bellaRootPath.trim();
    if (activeAssignmentName === "NO ASSIGNMENTS IN QUEUE") {
      return `${root}\\${sanitizedPilot}`;
    }
    return `${root}\\${sanitizedArtist}`;
  }, [config.bellaRootPath, sanitizedArtist, sanitizedPilot, activeAssignmentName]);

  const mediaMasterLine = useMemo(() => {
    return `${currentCardId}\t${sizeInput.trim()}\t${activeAssignmentName}\t${notesInput.trim()}`;
  }, [currentCardId, activeAssignmentName, sizeInput, notesInput]);

  const handleCopyText = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [fieldId]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [fieldId]: false }));
    }, 1500);
  };

  const handleSkipAssignment = () => {
    if (!firstAssignmentInQueue) return;
    const key = `${selectedDaySection}|${selectedPilot}|${firstAssignmentInQueue.assignment}`;
    setSkippedAssignments(prev => [...prev, key]);

    const newHistoryItem: ProcessedCard = {
      id: currentCardId,
      cardPrefix: activePilot?.cardPrefix ?? 'L',
      cardNumber: currentCardNum,
      assignment: firstAssignmentInQueue.assignment,
      daySection: selectedDaySection,
      pilot: selectedPilot,
      flyTime: firstAssignmentInQueue.flyTime,
      status: 'Skip',
      size: '0 GB',
      notes: "Assignment skipped by operator.",
      rawPath: localRawPath,
      stabilizedPath: localStabilizedPath,
      mediaDrivePath: (config.driveToggles?.mediaDrive ?? true) ? destinationMediaDrivePath : '',
      bellaSocialPath: (config.driveToggles?.bellaDrive ?? true) ? destinationBellaSocialPath : '',
      mediaMasterLine: `${currentCardId}\t0 GB\t${firstAssignmentInQueue.assignment}\tAssignment skipped by operator.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setHistory(prev => [newHistoryItem, ...prev]);
    setCustomAssignmentOverride('');
    resetInteractiveChecklist();
  };

  const handleMixedUnclearCard = () => {
    const currentArtist = activeAssignmentName;
    const newHistoryItem: ProcessedCard = {
      id: currentCardId,
      cardPrefix: activePilot?.cardPrefix ?? 'L',
      cardNumber: currentCardNum,
      assignment: currentArtist,
      daySection: selectedDaySection,
      pilot: selectedPilot,
      flyTime: activeFlyTime,
      status: 'Mixed/Unclear',
      size: sizeInput,
      notes: "FLAGGED: Card has mixed sets or unclear labels. Workflow paused.",
      rawPath: localRawPath,
      stabilizedPath: localStabilizedPath,
      mediaDrivePath: (config.driveToggles?.mediaDrive ?? true) ? destinationMediaDrivePath : '',
      bellaSocialPath: (config.driveToggles?.bellaDrive ?? true) ? destinationBellaSocialPath : '',
      mediaMasterLine: `${currentCardId}\t${sizeInput}\t${currentArtist}\tFLAGGED: Card has mixed sets or unclear labels. Workflow paused.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setHistory(prev => [newHistoryItem, ...prev]);
    setCurrentCardNum(prev => prev + 1);
    setCustomAssignmentOverride('');
    resetInteractiveChecklist();
  };

  const handleCompleteCardConfirmed = () => {
    const currentArtist = activeAssignmentName;
    const newHistoryItem: ProcessedCard = {
      id: currentCardId,
      cardPrefix: activePilot?.cardPrefix ?? 'L',
      cardNumber: currentCardNum,
      assignment: currentArtist,
      daySection: selectedDaySection,
      pilot: selectedPilot,
      flyTime: activeFlyTime,
      status: 'Complete',
      size: sizeInput,
      notes: notesInput,
      rawPath: localRawPath,
      stabilizedPath: localStabilizedPath,
      mediaDrivePath: (config.driveToggles?.mediaDrive ?? true) ? destinationMediaDrivePath : '',
      bellaSocialPath: (config.driveToggles?.bellaDrive ?? true) ? destinationBellaSocialPath : '',
      mediaMasterLine: mediaMasterLine,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setHistory(prev => [newHistoryItem, ...prev]);
    createLocalFolders({
      rawPath: localRawPath,
      stabilizedPath: localStabilizedPath,
      mediaDrivePath: (config.driveToggles?.mediaDrive ?? true) ? destinationMediaDrivePath : '',
      bellaSocialPath: (config.driveToggles?.bellaDrive ?? true) ? destinationBellaSocialPath : ''
    });

    // Reset all robot/export/delivery state for the new card
    setGoProRobotStatus('idle');
    setGoProRobotError(null);
    setMoveExportsStatus('idle');
    setMoveExportsResult(null);
    setMoveExportsError(null);
    setGoProExportStatus('idle');
    setGoProExportProgress(null);
    setGoProExportError(null);
    setRobotStartTime(null);
    setMediaDriveCopyStatus('idle');
    setMediaDriveCopyProgress(null);
    setMediaDriveCopyResult(null);
    setMediaDriveCopyError(null);
    setBellaDriveCopyStatus('idle');
    setBellaDriveCopyProgress(null);
    setBellaDriveCopyResult(null);
    setBellaDriveCopyError(null);
    setSdDeleteStatus('idle');
    setSdDeleteResult(null);
    setSdDeleteError(null);
    setPreFlightStatus('idle');
    setPreFlightErrors([]);
    setPreFlightWarnings([]);
    setSdCopyResult(null);
    setNotesInput('');
    setGoProQueueCleared(false);

    setCurrentCardNum(prev => prev + 1);
    setCustomAssignmentOverride('');
    resetInteractiveChecklist();
  };

  const handleCompleteCard = () => {
    const currentArtist = activeAssignmentName;
    if (!currentArtist || currentArtist === "NO ASSIGNMENTS IN QUEUE") {
      alert("Please enter a custom assignment or load a pilot with non-empty assignments!");
      return;
    }

    const isDuplicate = history.some(
      (card) => card.id === currentCardId && card.status === 'Complete'
    );
    if (isDuplicate) {
      setDuplicateCardIntent('complete');
      setDuplicateCardWarning(true);
      return;
    }

    setDuplicateCardWarning(false);
    handleCompleteCardConfirmed();
  };

  const runRobotConfirmed = async () => {
    // The robot stabilizes the most recent SD batch (a BATCH_NN subfolder when the
    // RAW folder was reused), falling back to the base RAW path if nothing copied.
    const robotRawPath = sdBatchRawPath || localRawPath;

    // PRE-FLIGHT CHECK — runs before any existing logic
    setPreFlightStatus('checking');
    setPreFlightErrors([]);
    setPreFlightWarnings([]);

    const preFlightResult = await window.electron?.ipcRenderer.invoke('validate-setup', {
      rawPath: robotRawPath,
      stabilizedPath: localStabilizedPath,
      mediaRootPath: config.mediaRootPath,
      bellaRootPath: config.bellaRootPath,
      goProOutputPath: config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
      coords: config.robotCoords,
    }) as { valid: boolean; errors: string[]; warnings: string[] } | undefined;

    if (!preFlightResult?.valid) {
      setPreFlightStatus('failed');
      setPreFlightErrors(preFlightResult?.errors ?? ['Unknown pre-flight error']);
      setPreFlightWarnings(preFlightResult?.warnings ?? []);
      return;
    }

    setPreFlightStatus('passed');
    setPreFlightWarnings(preFlightResult.warnings ?? []);
    if ((preFlightResult.warnings ?? []).length === 0) {
      setTimeout(() => setPreFlightStatus('idle'), 4000);
    }

    if (!config.robotCoords) {
      alert('Please run 🎯 CALIBRATE GOPRO ROBOT in Setup first!');
      return;
    }
    try {
      setGoProRobotStatus('running');
      setGoProRobotError(null);
      setMoveExportsStatus('idle');
      setMoveExportsResult(null);
      setMoveExportsError(null);
      setGoProExportStatus('idle');
      setGoProExportProgress(null);
      setGoProExportError(null);
      setRobotStartTime(Date.now());
      setMediaDriveCopyStatus('idle');
      setMediaDriveCopyProgress(null);
      setMediaDriveCopyResult(null);
      setMediaDriveCopyError(null);
      setBellaDriveCopyStatus('idle');
      setBellaDriveCopyProgress(null);
      setBellaDriveCopyResult(null);
      setBellaDriveCopyError(null);
      setGoProQueueCleared(false);
      // Clear any prior auto-chain banner for this fresh run.
      setAutoChainStatus('idle');
      setAutoChainStep('');
      await runGoProRobot(
        config.robotCoords,
        robotRawPath,
        localStabilizedPath,
        config.goProAppPath,
        config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
        { cardId: currentCardId, pilotName: selectedPilot, artistName: activeAssignmentName, horizonLock: !!config.horizonLock }
      );
    } catch (err: unknown) {
      setGoProRobotStatus('error');
      alert('GoPro robot failed: ' + String(err));
    }
  };

  const handleRunRobot = async () => {
    const isDuplicate = history.some(
      (card) => card.id === currentCardId && card.status === 'Complete'
    );
    if (isDuplicate) {
      setDuplicateCardIntent('robot');
      setDuplicateCardWarning(true);
      return;
    }
    setDuplicateCardWarning(false);
    await runRobotConfirmed();
  };

  const handleMoveExports = async (): Promise<boolean> => {
    if (!robotStartTime) return false;
    setMoveExportsStatus('moving');
    try {
      const result = await window.electron?.moveStabilizedFiles({
        videosFolder: config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
        stabilizedFolder: localStabilizedPath,
        robotStartTime,
      });
      if (result && !result.error) {
        setMoveExportsResult({ files: result.files ?? [], moved: result.moved ?? 0, totalGB: result.totalGB });
        if (result.totalGB !== undefined) {
          setSizeInput(result.totalGB.toFixed(2) + ' GB');
        }
        setMoveExportsStatus('success');
        return true;
      } else {
        setMoveExportsError(result?.error ?? 'Unknown error');
        setMoveExportsStatus('error');
        return false;
      }
    } catch (err: unknown) {
      setMoveExportsError(String(err));
      setMoveExportsStatus('error');
      return false;
    }
  };

  const handleCopyToMediaDrive = async (): Promise<boolean> => {
    setMediaDriveCopyStatus('copying');
    setMediaDriveCopyProgress(0);
    setMediaDriveCopyError(null);
    try {
      const result = await window.electron?.copyToMediaDrive({
        localStabilizedPath,
        mediaDrivePath: destinationMediaDrivePath,
        cardId: currentCardId,
      });
      if (result?.success) {
        setMediaDriveCopyResult({ fileCount: result.fileCount ?? 0, sizeGB: result.sizeGB ?? '0.00 GB' });
        setMediaDriveCopyStatus('success');
        return true;
      } else {
        setMediaDriveCopyError(result?.message ?? 'Unknown error copying to Media Drive');
        setMediaDriveCopyStatus('error');
        return false;
      }
    } catch (err: unknown) {
      setMediaDriveCopyError(String(err));
      setMediaDriveCopyStatus('error');
      return false;
    } finally {
      setMediaDriveCopyProgress(null);
    }
  };

  const handleCopyToBellaDrive = async (): Promise<boolean> => {
    if (!sanitizedArtist || activeAssignmentName === 'NO ASSIGNMENTS IN QUEUE') {
      setBellaDriveCopyError('No artist or shot name assigned to this card. Please verify the shot list assignment before copying to Bella.');
      setBellaDriveCopyStatus('error');
      return false;
    }
    setBellaDriveCopyStatus('copying');
    setBellaDriveCopyProgress(0);
    setBellaDriveCopyError(null);
    try {
      const result = await window.electron?.copyToBellaDrive({
        localStabilizedPath,
        bellaDestPath: destinationBellaSocialPath,
        artistName: sanitizedArtist,
      });
      if (result?.success) {
        setBellaDriveCopyResult({ artistName: sanitizedArtist, fileCount: result.fileCount ?? 0, sizeGB: result.sizeGB ?? '0.00 GB' });
        setBellaDriveCopyStatus('success');
        return true;
      } else {
        setBellaDriveCopyError(result?.message ?? 'Unknown error copying to Bella Drive');
        setBellaDriveCopyStatus('error');
        return false;
      }
    } catch (err: unknown) {
      setBellaDriveCopyError(String(err));
      setBellaDriveCopyStatus('error');
      return false;
    } finally {
      setBellaDriveCopyProgress(null);
    }
  };

  const handleDeleteSdFiles = async () => {
    const sdPath = config.sdCardDrive?.trim();
    if (!sdPath) {
      setSdDeleteError('No SD Card Drive is set in Setup.');
      setSdDeleteStatus('error');
      return;
    }
    const confirmed = confirm(
      `Permanently delete GoPro footage files (.MP4, .LRV, .THM, .GPR, .360) from the SD card?\n\n` +
      `SD card: ${sdPath}\n\n` +
      `This removes the video files everywhere on the card (including DCIM\\100GOPRO) but keeps the folders. ` +
      `It cannot be undone — only do this once your files are moved and delivered.`
    );
    if (!confirmed) return;

    setSdDeleteStatus('deleting');
    setSdDeleteError(null);
    setSdDeleteResult(null);
    try {
      const result = await deleteSdRawFiles({
        sdDrivePath: sdPath,
        protectedRoots: [config.localRootPath, config.mediaRootPath, config.bellaRootPath],
      });
      if (result?.success) {
        setSdDeleteResult({ deletedCount: result.deletedCount ?? 0, freedGB: result.freedGB ?? '0.00' });
        setSdDeleteStatus('success');
      } else {
        setSdDeleteError(result?.message ?? 'Unknown error deleting SD card files.');
        setSdDeleteStatus('error');
      }
    } catch (err: unknown) {
      setSdDeleteError(String(err));
      setSdDeleteStatus('error');
    }
  };

  const handleDumpRaws = async (): Promise<boolean> => {
    const dumpPath = config.rawDumpPath?.trim();
    if (!selectedPilot) {
      setDumpRawsError('Select a pilot first.');
      setDumpRawsStatus('error');
      return false;
    }
    if (!dumpPath) {
      setDumpRawsError('Set a Raw Dump Folder in Setup first.');
      setDumpRawsStatus('error');
      return false;
    }
    const pilotRootPath = `${config.localRootPath.trim()}\\${sanitizedEvent}\\${sanitizedPilot}`;
    setDumpRawsStatus('dumping');
    setDumpRawsError(null);
    setDumpRawsResult(null);
    setDumpRawsProgress(null);
    try {
      const result = await dumpRaws({ pilotRootPath, dumpFolderPath: dumpPath });
      if (result?.success) {
        setDumpRawsResult({ copied: result.copied ?? 0, skipped: result.skipped ?? 0, sizeGB: result.sizeGB ?? '0.00' });
        setDumpRawsStatus('success');
        return true;
      } else {
        setDumpRawsError(result?.message ?? 'Unknown error dumping raws.');
        setDumpRawsStatus('error');
        return false;
      }
    } catch (err: unknown) {
      setDumpRawsError(String(err));
      setDumpRawsStatus('error');
      return false;
    } finally {
      setDumpRawsProgress(null);
    }
  };

  // Copy the SD card into the local RAW folder (Step ②). Shared by the prominent
  // step button and the small inline "SD COPY" button so there's one source of truth.
  const handleCopySdToRaw = async () => {
    setSdCopyResult(null);
    setCopyProgress(0);
    try {
      const result = await copySDtoRAW(config.sdCardDrive, localRawPath);
      setCopyProgress(100);
      if (result.success && result.sourceFileCount !== undefined && result.fileCount !== undefined && result.sizeGB !== undefined && result.matched !== undefined) {
        setSdCopyResult({ sourceFileCount: result.sourceFileCount, fileCount: result.fileCount, sizeGB: result.sizeGB, matched: result.matched, batchSubfolder: result.batchSubfolder });
      }
      if (result.success) setSdBatchRawPath(result.activeRawPath ?? '');
      setTimeout(() => setCopyProgress(null), 1500);
    } catch {
      setCopyProgress(null);
    }
  };

  // ── AUTO MODE ──────────────────────────────────────────────────────────────
  // When an export completes and AUTO is on, deliver everything and finish the
  // card with no clicks: move → Media → Bella → (Raw dump if enabled) → Complete
  // Card & advance. Stops and alerts if any step fails (card stays open so you can
  // fix it and finish manually). Festival mode only.
  const autoChainRunningRef = useRef(false);
  const runAutoChain = async () => {
    if (autoChainRunningRef.current) return;
    const fail = (msg: string) => {
      setAutoChainStatus('error');
      setAutoChainStep(msg);
      try { window.electron?.dashboardReportState({ lastActivity: 'AUTO stopped: ' + msg }); } catch {}
      alert('Auto mode stopped:\n\n' + msg + '\n\nThe card was NOT completed. Fix the issue and finish manually.');
    };
    // Never auto-proceed on a short/over count export.
    if (goProExportProgress && goProExportProgress.expectedCount > 0 && goProExportProgress.fileCount !== goProExportProgress.expectedCount) {
      fail(`File count looks off (${goProExportProgress.fileCount} of ${goProExportProgress.expectedCount}). Auto stopped before moving.`);
      return;
    }
    if (activeAssignmentName === 'NO ASSIGNMENTS IN QUEUE') {
      fail('No card/shot is assigned, so the card can’t be auto-completed. Assign one, then move manually.');
      return;
    }
    autoChainRunningRef.current = true;
    setAutoChainStatus('running');
    try {
      setAutoChainStep('Moving files to STABILIZED…');
      if (!(await handleMoveExports())) { fail('Moving files to the STABILIZED folder failed.'); return; }

      if (mediaToggleOn) {
        setAutoChainStep('Copying to Media Drive…');
        if (!(await handleCopyToMediaDrive())) { fail('Copy to Media Drive failed.'); return; }
      }

      if (bellaToggleOn) {
        if (!bellaArtistOk) { fail('Bella Drive is on but no artist is assigned to this card.'); return; }
        setAutoChainStep('Copying to Bella Drive…');
        if (!(await handleCopyToBellaDrive())) { fail('Copy to Bella Drive failed.'); return; }
      }

      // NOTE: Raw dump is intentionally NOT part of Auto mode — dumping raws is
      // always a deliberate, manual click (desktop or phone "Dump Raws" button).

      setAutoChainStep('Completing card & advancing…');
      handleCompleteCardConfirmed();
      setAutoChainStatus('done');
      setAutoChainStep('Auto-complete finished — ready for the next card.');
      try { window.electron?.dashboardReportState({ lastActivity: 'AUTO: card delivered & completed.' }); } catch {}
    } catch (e: unknown) {
      fail(String(e));
    } finally {
      autoChainRunningRef.current = false;
    }
  };

  // Trigger the auto chain the moment an export finishes (only when AUTO is on).
  useEffect(() => {
    if (!isSimpleMode && moveMode === 'auto' && goProExportStatus === 'complete') {
      runAutoChain();
    }
    // Intentionally keyed on the export-complete transition only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goProExportStatus]);

  // Phone "⚡ Auto · Send to All": ONE action that moves the files and copies to
  // every ready drive (Media + Bella). NO raw dump, and it does NOT complete the
  // card — those stay deliberate. Stops + reports if a step fails.
  const deliverAllRunningRef = useRef(false);
  const runDeliverAll = async () => {
    if (deliverAllRunningRef.current) return;
    deliverAllRunningRef.current = true;
    const report = (msg: string) => { try { window.electron?.dashboardReportState({ lastActivity: msg }); } catch {} };
    try {
      report('Auto delivery: moving files…');
      if (moveExportsStatus !== 'success') {
        if (!(await handleMoveExports())) { report('Auto delivery stopped: move to STABILIZED failed.'); return; }
      }
      if (mediaToggleOn && mediaDriveCopyStatus !== 'success') {
        report('Auto delivery: copying to Media Drive…');
        if (!(await handleCopyToMediaDrive())) { report('Auto delivery stopped: Copy to Media failed.'); return; }
      }
      if (bellaToggleOn && bellaArtistOk && bellaDriveCopyStatus !== 'success') {
        report('Auto delivery: copying to Bella Drive…');
        if (!(await handleCopyToBellaDrive())) { report('Auto delivery stopped: Copy to Bella failed.'); return; }
      }
      report('Auto delivery done — files moved & copied to all drives.');
    } finally {
      deliverAllRunningRef.current = false;
    }
  };

  // Phone "Delete SD Card": same as the desktop delete but WITHOUT the desktop
  // confirm popup (the phone shows its own confirmation), so it can run remotely.
  const handleDeleteSdConfirmed = async () => {
    const sdPath = config.sdCardDrive?.trim();
    if (!sdPath) { setSdDeleteError('No SD Card Drive is set in Setup.'); setSdDeleteStatus('error'); return; }
    setSdDeleteStatus('deleting');
    setSdDeleteError(null);
    setSdDeleteResult(null);
    try {
      const result = await deleteSdRawFiles({
        sdDrivePath: sdPath,
        protectedRoots: [config.localRootPath, config.mediaRootPath, config.bellaRootPath],
      });
      if (result?.success) {
        setSdDeleteResult({ deletedCount: result.deletedCount ?? 0, freedGB: result.freedGB ?? '0.00' });
        setSdDeleteStatus('success');
      } else {
        setSdDeleteError(result?.message ?? 'Unknown error deleting SD card files.');
        setSdDeleteStatus('error');
      }
    } catch (err: unknown) {
      setSdDeleteError(String(err));
      setSdDeleteStatus('error');
    }
  };

  const applyDashboardPort = async () => {
    const p = parseInt(dashboardPortInput, 10);
    if (!Number.isInteger(p) || p < 1 || p > 65535) { alert('Enter a port between 1 and 65535.'); return; }
    try {
      const info = await window.electron?.dashboardSetPort(p);
      if (info?.error) { alert('Could not set dashboard port: ' + info.error); return; }
      if (info) { setDashboardInfo(info); setDashboardPortInput(String(info.port ?? p)); }
    } catch (e: unknown) {
      alert('Could not set dashboard port: ' + String(e));
    }
  };

  const resetInteractiveChecklist = () => {};

  const handleSimpleCreateFolders = async () => {
    if (!simpleFolderName.trim()) {
      setSimpleFolderNameError('Enter a folder name first');
      return;
    }
    setSimpleFolderNameError('');
    setSimpleFolderStatus('creating');
    await createLocalFolders({
      rawPath: simpleLocalRawPath,
      stabilizedPath: simpleLocalStabPath,
      mediaDrivePath: simpleMediaEnabled ? simpleMediaPath : '',
      bellaSocialPath: simpleBellaEnabled ? simpleBellaPath : '',
    });
    setSimpleFolderStatus('done');
    // Stays green until the folder name changes, the card is logged, or reset.
  };

  const handleSimpleRunRobot = async () => {
    if (!simpleFolderName.trim()) {
      setSimpleFolderNameError('Enter a folder name first');
      return;
    }
    setSimpleFolderNameError('');
    if (!config.robotCoords) {
      alert('Please run 🎯 CALIBRATE GOPRO ROBOT in Setup first!');
      return;
    }
    try {
      setGoProRobotStatus('running');
      setGoProRobotError(null);
      setMoveExportsStatus('idle');
      setMoveExportsResult(null);
      setMoveExportsError(null);
      setGoProExportStatus('idle');
      setGoProExportProgress(null);
      setGoProExportError(null);
      setRobotStartTime(Date.now());
      await runGoProRobot(
        config.robotCoords,
        sdBatchRawPath || simpleLocalRawPath,
        simpleLocalStabPath,
        config.goProAppPath,
        config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
        { cardId: sanitizedSimpleFolder, pilotName: '', artistName: simpleFolderName, horizonLock: !!config.horizonLock }
      );
    } catch (err: unknown) {
      setGoProRobotStatus('error');
      alert('GoPro robot failed: ' + String(err));
    }
  };

  const handleSimpleMoveExports = async () => {
    if (!robotStartTime) return;
    setMoveExportsStatus('moving');
    try {
      const result = await window.electron?.moveStabilizedFiles({
        videosFolder: config.goProOutputPath || 'C:\\Users\\Jason\\Videos',
        stabilizedFolder: simpleLocalStabPath,
        robotStartTime,
      });
      if (result && !result.error) {
        setMoveExportsResult({ files: result.files ?? [], moved: result.moved ?? 0, totalGB: result.totalGB });
        setMoveExportsStatus('success');
      } else {
        setMoveExportsError(result?.error ?? 'Unknown error');
        setMoveExportsStatus('error');
      }
    } catch (err: unknown) {
      setMoveExportsError(String(err));
      setMoveExportsStatus('error');
    }
  };

  const handleSimpleLogCard = () => {
    if (!simpleFolderName.trim()) {
      setSimpleFolderNameError('Enter a folder name first');
      return;
    }
    setSimpleFolderNameError('');
    const entry: SimpleCardLog = {
      cardId: sanitizedSimpleFolder,
      artist: sanitizedSimpleFolder,
      showName: config.eventName || '',
      pilotName: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      localRawPath: simpleLocalRawPath,
      localStabPath: simpleLocalStabPath,
      mediaPath: simpleMediaEnabled ? simpleMediaPath : '',
    };
    setSimpleSessionLog(prev => [entry, ...prev]);
    setGoProRobotStatus('idle'); setGoProRobotError(null);
    setGoProExportStatus('idle'); setGoProExportProgress(null); setGoProExportError(null);
    setMoveExportsStatus('idle'); setMoveExportsResult(null); setMoveExportsError(null);
    setRobotStartTime(null); setSimpleFolderStatus('idle');
    setMediaDriveCopyStatus('idle'); setMediaDriveCopyProgress(null); setMediaDriveCopyResult(null); setMediaDriveCopyError(null);
    setBellaDriveCopyStatus('idle'); setBellaDriveCopyProgress(null); setBellaDriveCopyResult(null); setBellaDriveCopyError(null);
    setSdDeleteStatus('idle'); setSdDeleteResult(null); setSdDeleteError(null);
    setSdCopyResult(null); setCopyProgress(null);
  };

  const handleSimpleCopyToMediaDrive = async () => {
    if (!simpleFolderName.trim()) {
      setSimpleFolderNameError('Enter a folder name first');
      return;
    }
    setSimpleFolderNameError('');
    setMediaDriveCopyStatus('copying');
    setMediaDriveCopyProgress(0);
    setMediaDriveCopyError(null);
    try {
      const result = await window.electron?.copyToMediaDrive({
        localStabilizedPath: simpleLocalStabPath,
        mediaDrivePath: simpleMediaPath,
        cardId: sanitizedSimpleFolder,
      });
      if (result?.success) {
        setMediaDriveCopyResult({ fileCount: result.fileCount ?? 0, sizeGB: result.sizeGB ?? '0.00 GB' });
        setMediaDriveCopyStatus('success');
      } else {
        setMediaDriveCopyError(result?.message ?? 'Unknown error copying to Media Drive');
        setMediaDriveCopyStatus('error');
      }
    } catch (err: unknown) {
      setMediaDriveCopyError(String(err));
      setMediaDriveCopyStatus('error');
    } finally {
      setMediaDriveCopyProgress(null);
    }
  };

  const handleSimpleCopyToBellaDrive = async () => {
    if (!simpleFolderName.trim()) {
      setSimpleFolderNameError('Enter a folder name first');
      return;
    }
    setSimpleFolderNameError('');
    setBellaDriveCopyStatus('copying');
    setBellaDriveCopyProgress(0);
    setBellaDriveCopyError(null);
    try {
      const result = await window.electron?.copyToBellaDrive({
        localStabilizedPath: simpleLocalStabPath,
        bellaDestPath: simpleBellaPath,
        artistName: sanitizedSimpleFolder,
      });
      if (result?.success) {
        setBellaDriveCopyResult({ artistName: sanitizedSimpleFolder, fileCount: result.fileCount ?? 0, sizeGB: result.sizeGB ?? '0.00 GB' });
        setBellaDriveCopyStatus('success');
      } else {
        setBellaDriveCopyError(result?.message ?? 'Unknown error copying to Bella Drive');
        setBellaDriveCopyStatus('error');
      }
    } catch (err: unknown) {
      setBellaDriveCopyError(String(err));
      setBellaDriveCopyStatus('error');
    } finally {
      setBellaDriveCopyProgress(null);
    }
  };

  const deleteHistoryItem = (card: ProcessedCard) => {
    if (confirm("Delete this history card record?")) {
      setHistory(prev => prev.filter(h => h !== card));
    }
  };

  const handleResetWorkflow = () => {
    if (confirm("Are you sure you want to completely clear history and reset card count?")) {
      setHistory([]);
      setCurrentCardNum(activePilot?.startingCardNumber ?? 1);
      setSkippedAssignments([]);
      setCustomAssignmentOverride('');
      resetInteractiveChecklist();
      localStorage.removeItem('fpv_boss_history');
      localStorage.removeItem('fpv_boss_card_num');
      localStorage.removeItem('fpv_boss_skipped_assignments');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
            setCsvText(text);
            setSelectedDaySection('');
            setSelectedPilot('');
            resetInteractiveChecklist();
            setTimeout(() => {
              const detected = extractFpvAssignments(text).map(a => a.pilot).filter(Boolean);
              const unique = Array.from(new Set(detected));
              setAvailablePilots(prev => {
                const existingNames = new Set([...prev.map(p => p.name), ...config.pilots.map(p => p.name)]);
                const toAdd = unique.filter(n => !existingNames.has(n)).map(n => ({ name: n, cardPrefix: '', startingCardNumber: 1 }));
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
              });
            }, 0);
            alert("New shift shot list CSV imported successfully!");
          }
        };
        reader.readAsText(file);
      } else {
        alert("Please load a files ending with .csv!");
      }
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setCsvText(text);
          setSelectedDaySection('');
          setSelectedPilot('');
          resetInteractiveChecklist();
          setTimeout(() => {
            const detected = extractFpvAssignments(text).map(a => a.pilot).filter(Boolean);
            const unique = Array.from(new Set(detected));
            setAvailablePilots(prev => {
              const existingNames = new Set([...prev.map(p => p.name), ...config.pilots.map(p => p.name)]);
              const toAdd = unique.filter(n => !existingNames.has(n)).map(n => ({ name: n, cardPrefix: '', startingCardNumber: 1 }));
              return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
          }, 0);
          alert("New FPV Shot List CSV imported successfully!");
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePickAssignment = (assignmentName: string) => {
    setCustomAssignmentOverride(assignmentName);
    setIsPickerOpen(false);
  };

  const statistics = useMemo(() => {
    const completedCount = history.filter(h => h.status === 'Complete').length;
    const skippedCount = history.filter(h => h.status === 'Skip').length;
    const mixedCount = history.filter(h => h.status === 'Mixed/Unclear').length;
    const totalCount = history.length;
    return { completedCount, skippedCount, mixedCount, totalCount };
  }, [history]);

  const filteredHistory = useMemo(() => {
    const safeHistory = history || [];
    if (historyPilotFilter === 'ALL') return safeHistory;
    return safeHistory.filter(h => h.pilot === historyPilotFilter);
  }, [history, historyPilotFilter]);

  const simplePathPreviews = useMemo(() => {
    const s = config.simpleConfig;
    if (!s) return null;
    const showClean = cleanFolderName(s.showName || 'MY_SHOW');
    const cardId = `${(s.cardPrefix || 'A').toUpperCase()}_${String(s.startingCardNumber || 1).padStart(3, '0')}`;
    return {
      raw: `${(s.localRootPath || 'D:').trim()}\\${showClean}\\RAW\\${cardId}`,
      stabilized: `${(s.localRootPath || 'D:').trim()}\\${showClean}\\STABILIZED\\${cardId}`,
      media: `${(s.mediaRootPath || 'M:').trim()}\\${cardId}`,
    };
  }, [config.simpleConfig]);

  const sanitizedSimpleFolder = useMemo(() => cleanFolderName(simpleFolderName), [simpleFolderName]);

  const simpleLocalRawPath = useMemo(() => {
    const root = config.localRootPath.trim();
    const folderClean = sanitizedSimpleFolder || 'FOLDER_NAME';
    return `${root}\\${sanitizedEvent}\\${folderClean}\\RAW`;
  }, [config.localRootPath, sanitizedEvent, sanitizedSimpleFolder]);

  const simpleLocalStabPath = useMemo(() => {
    const root = config.localRootPath.trim();
    const folderClean = sanitizedSimpleFolder || 'FOLDER_NAME';
    return `${root}\\${sanitizedEvent}\\${folderClean}\\STABILIZED`;
  }, [config.localRootPath, sanitizedEvent, sanitizedSimpleFolder]);

  const simpleMediaPath = useMemo(() => {
    const root = config.mediaRootPath.trim();
    const folderClean = sanitizedSimpleFolder || 'FOLDER_NAME';
    return `${root}\\${folderClean}`;
  }, [config.mediaRootPath, sanitizedSimpleFolder]);

  const simpleBellaPath = useMemo(() => {
    const root = config.bellaRootPath.trim();
    const folderClean = sanitizedSimpleFolder || 'FOLDER_NAME';
    return `${root}\\${folderClean}`;
  }, [config.bellaRootPath, sanitizedSimpleFolder]);

  // Simple mode: reset the green "Folders Created" confirmation when the target
  // folder changes (i.e. the folder name is edited) so it isn't stale.
  useEffect(() => {
    setSimpleFolderStatus('idle');
  }, [simpleLocalRawPath]);

  // Forget the active SD batch subfolder whenever the base RAW target changes
  // (new folder name / artist / day) or the mode switches, so the next SD copy
  // starts fresh and the robot falls back to the base path until a copy runs.
  useEffect(() => {
    setSdBatchRawPath('');
  }, [localRawPath, simpleLocalRawPath, config.mode]);

  // ── Mobile dashboard: remote delivery actions ──────────────────────────────
  // The phone forwards the GoPro batch player's end-of-flow actions here; we run
  // the SAME desktop handlers (mode-correct variant) and report availability +
  // progress back so the phone's buttons stay in lock-step with the desktop.
  const isSimpleMode = config.mode === 'simple';
  // Keep the latest handlers in a ref so the once-registered listener never sees
  // stale closures over React state / paths.
  const dashboardActionsRef = useRef<Record<string, () => void>>({});
  dashboardActionsRef.current = {
    copyMedia: isSimpleMode ? handleSimpleCopyToMediaDrive : handleCopyToMediaDrive,
    copyBella: isSimpleMode ? handleSimpleCopyToBellaDrive : handleCopyToBellaDrive,
    dumpRaws: handleDumpRaws,
    completeCard: handleCompleteCardConfirmed,
    deliverAll: runDeliverAll,
    deleteSd: handleDeleteSdConfirmed,
  };

  useEffect(() => {
    window.electron?.onDashboardCommand(({ action }) => {
      const fn = dashboardActionsRef.current[action];
      if (fn) { try { fn(); } catch (e) { console.error('dashboard command failed:', action, e); } }
    });
    return () => { window.electron?.offDashboardCommand(); };
  }, []);

  // Mirror the desktop's button enable/disable logic + progress for the phone.
  const moveDone = moveExportsStatus === 'success';
  const mediaToggleOn = isSimpleMode ? simpleMediaEnabled : (config.driveToggles?.mediaDrive ?? true);
  const bellaToggleOn = isSimpleMode ? simpleBellaEnabled : (config.driveToggles?.bellaDrive ?? true);
  const bellaArtistOk = isSimpleMode ? !!sanitizedSimpleFolder : (!!sanitizedArtist && activeAssignmentName !== 'NO ASSIGNMENTS IN QUEUE');
  const mediaAvailable = mediaToggleOn && moveDone;
  const bellaAvailable = bellaToggleOn && moveDone && bellaArtistOk;
  const dumpAvailable = !isSimpleMode && !!selectedPilot && !!config.rawDumpPath?.trim();
  const completeAvailable = !isSimpleMode && activeAssignmentName !== 'NO ASSIGNMENTS IN QUEUE';
  // Delete SD card is only allowed AFTER the raws have been backed up (dumped).
  const deleteSdAvailable = !isSimpleMode && dumpRawsStatus === 'success' && !!config.sdCardDrive?.trim();
  // Short reasons shown under each greyed-out button on the phone.
  const mediaHint = mediaAvailable ? '' : (!mediaToggleOn ? 'Media Drive is turned off in Setup' : 'Move files to STABILIZED first');
  const bellaHint = bellaAvailable ? '' : (!bellaToggleOn ? 'Bella Drive is turned off in Setup' : !moveDone ? 'Move files to STABILIZED first' : 'Assign an artist to this card first');
  const dumpHint = dumpAvailable ? '' : (isSimpleMode ? 'Available in Festival (GoPro batch) mode' : !selectedPilot ? 'Select a pilot first' : 'Set a Raw Dump Folder in Setup');
  const completeHint = completeAvailable ? '' : (isSimpleMode ? 'Available in Festival (GoPro batch) mode' : 'Assign a card/shot first');
  const deleteSdHint = deleteSdAvailable ? '' : (isSimpleMode ? 'Available in Festival (GoPro batch) mode' : !config.sdCardDrive?.trim() ? 'Set an SD Card Drive in Setup' : 'Dump the raws first (back them up)');
  // Derive the single workflow state the phone shows (idle / running / complete /
  // error) from the desktop's three lifecycle machines. This is the field that was
  // missing before — without it the phone's status + Move Files button never left
  // IDLE, which also kept the Deliver To buttons greyed out.
  const workflowState: 'idle' | 'running' | 'complete' | 'error' =
    (goProExportStatus === 'error' || goProRobotStatus === 'error' || moveExportsStatus === 'error') ? 'error'
    : (moveExportsStatus === 'success' || goProExportStatus === 'complete') ? 'complete'
    : (goProRobotStatus === 'running' || goProExportStatus === 'polling' || moveExportsStatus === 'moving') ? 'running'
    : 'idle';
  useEffect(() => {
    window.electron?.dashboardReportState({
      mode: isSimpleMode ? 'simple' : 'festival',
      // Top-level workflow status + context so the phone mirrors the desktop.
      state: workflowState,
      cardId: currentCardId || '',
      pilotName: selectedPilot || '',
      artistName: activeAssignmentName && activeAssignmentName !== 'NO ASSIGNMENTS IN QUEUE' ? activeAssignmentName : '',
      fileCount: goProExportProgress?.fileCount ?? 0,
      expectedCount: goProExportProgress?.expectedCount ?? 0,
      totalSizeMB: goProExportProgress?.totalSizeMB ?? 0,
      countLabel: goProExportProgress?.countLabel ?? '',
      lastMovedCount: moveExportsResult?.moved ?? 0,
      mediaAvailable,
      mediaState: mediaDriveCopyStatus,
      mediaDest: isSimpleMode ? simpleMediaPath : destinationMediaDrivePath,
      mediaHint,
      bellaAvailable,
      bellaState: bellaDriveCopyStatus,
      bellaDest: isSimpleMode ? simpleBellaPath : destinationBellaSocialPath,
      bellaHint,
      // Dump Raws + Complete Card are festival (GoPro batch player) actions only.
      dumpAvailable,
      dumpState: dumpRawsStatus,
      dumpDest: config.rawDumpPath?.trim() || '',
      dumpHint,
      completeAvailable,
      completeHint,
      // Delete SD card (festival; only after raws are backed up).
      deleteSdAvailable,
      deleteSdState: sdDeleteStatus,
      deleteSdHint,
      deleteSdDest: config.sdCardDrive?.trim() || '',
    });
  }, [
    isSimpleMode, mediaAvailable, bellaAvailable, dumpAvailable, completeAvailable,
    mediaHint, bellaHint, dumpHint, completeHint,
    mediaDriveCopyStatus, bellaDriveCopyStatus, dumpRawsStatus,
    destinationMediaDrivePath, destinationBellaSocialPath, simpleMediaPath, simpleBellaPath,
    config.rawDumpPath,
    deleteSdAvailable, deleteSdHint, sdDeleteStatus, config.sdCardDrive,
    // Workflow status + context so the phone updates the moment the desktop does.
    workflowState, currentCardId, selectedPilot, activeAssignmentName,
    goProExportProgress, moveExportsResult,
  ]);

  return (
    <div className="min-h-screen text-white flex flex-col font-sans border-none" id="fpv-boss-body">

      {/* Mobile shot done/skipped — red blinking-light alerts (stay until dismissed) */}
      {mobileAlerts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(92vw,520px)]">
          {mobileAlerts.map(a => {
            const skipped = a.status === 'skipped';
            return (
              <div
                key={a.id}
                onClick={() => dismissAlert(a.id)}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-black text-sm cursor-pointer border-2 shadow-2xl ${
                  skipped
                    ? 'bg-amber-500/95 text-slate-950 border-amber-200'
                    : 'bg-rose-600 text-white border-rose-300 animate-pulse shadow-[0_0_30px_rgba(244,63,94,0.8)]'
                }`}
                title="Click to dismiss"
              >
                <span className={`shrink-0 w-4 h-4 rounded-full ${skipped ? 'bg-slate-900' : 'bg-white animate-ping'}`} />
                <span className="flex-grow">
                  {skipped ? '⚠ ' : '🔴 '}“{a.name}” {skipped ? 'SKIPPED' : 'DONE'} on mobile{skipped ? '' : ' — footage incoming'}
                </span>
                <span className="shrink-0 text-xs opacity-70">✕</span>
              </div>
            );
          })}
        </div>
      )}

      {/* SOLID HEADER */}
      <header className="bg-slate-900 shadow-xl p-6 md:p-8 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-6 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl shadow-lg" style={{background:'linear-gradient(135deg,#00e5ff 0%,#7c3aed 100%)',boxShadow:'0 0 22px rgba(0,229,255,0.30),0 4px 16px rgba(0,0,0,0.45)'}}>
            <Activity className="w-8 h-8 animate-pulse text-slate-950" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black tracking-wider text-white">FPV CARD BOSS</h1>
            </div>
            <p className="text-[10px] font-mono text-slate-500 mt-1">build {__BUILD_TIME__}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setIsManualOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-cyan-400/40 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-300 text-base font-black transition"
            title="How to set up and use FPV Card Boss"
          >
            📖 <span>Manual</span>
          </button>
          <label className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-base font-black cursor-pointer transition">
            <Upload className="w-5 h-5" />
            <span>Import CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleManualUpload} />
          </label>
          <HelpButton id="importCsv" />

          {csvText.trim().length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear the imported shot list? This will reset the queue, day segments, and pilot filter. Your config and pilots will not be affected.")) {
                  setCsvText('');
                  localStorage.removeItem('fpv_boss_csv_text');
                  setSelectedDaySection('');
                  localStorage.removeItem('fpv_boss_selected_day');
                  setSelectedPilot('');
                  localStorage.removeItem('fpv_boss_selected_pilot');
                  setSkippedAssignments([]);
                  localStorage.removeItem('fpv_boss_skipped_assignments');
                }
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-900 text-rose-300 hover:bg-rose-800 text-base font-black transition"
            >
              🗑 Reset Shot List
            </button>
          )}

          {allAssignments.length > 0 && (
            <button
              onClick={() => setIsShotListOpen(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-base font-black transition"
            >
              📋 VIEW SHOT LIST
            </button>
          )}

          <button
            onClick={() => setIsSetupOpen(!isSetupOpen)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-base font-extrabold transition ${
              isSetupOpen ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Sliders className="w-5 h-5" />
            <span>Setup</span>
            {isSetupOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          <HelpButton id="setup" />

          <div className="flex items-center bg-slate-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => {
                if (goProRobotStatus === 'running' || copyProgress !== null) {
                  if (!confirm('An operation is in progress. Switch mode anyway?')) return;
                }
                setConfig(prev => ({ ...prev, mode: 'festival' }));
              }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${config.mode === 'festival' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Festival
            </button>
            <button
              onClick={() => {
                if (goProRobotStatus === 'running' || copyProgress !== null) {
                  if (!confirm('An operation is in progress. Switch mode anyway?')) return;
                }
                setConfig(prev => ({ ...prev, mode: 'simple' }));
              }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${config.mode === 'simple' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Simple
            </button>
          </div>
        </div>
      </header>

      {/* DETAILED ROOT WORKSPACE */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`w-full flex-grow flex flex-col p-6 md:p-10 max-w-[1700px] mx-auto gap-8 transition-all ${
          dragActive ? 'bg-amber-500/5' : ''
        }`}
      >

        {/* SETUP CONTROLS */}
        {isSetupOpen && (
          <div className="bg-slate-900 rounded-3xl p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h3 className="text-lg font-black text-amber-400 uppercase tracking-widest flex items-center gap-2.5">
                <Sliders className="w-5 h-5" /> Setup
              </h3>
              <div className="flex items-center bg-slate-800 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setSetupTab('festival')}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${setupTab === 'festival' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                >Festival Setup</button>
                <button
                  onClick={() => setSetupTab('simple')}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${setupTab === 'simple' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                >Simple Setup</button>
              </div>
            </div>
            {setupTab === 'festival' && (<>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Event Name <HelpButton id="eventName" /></label>
                <input
                  type="text"
                  value={config.eventName}
                  onChange={e => setConfig(prev => ({ ...prev, eventName: e.target.value }))}
                  className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-bold focus:ring-2 focus:ring-amber-500 uppercase border-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Local Working Path <HelpButton id="localPath" /></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.localRootPath}
                    onChange={e => setConfig(prev => ({ ...prev, localRootPath: e.target.value }))}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, localRootPath: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, driveToggles: { ...prev.driveToggles, mediaDrive: !(prev.driveToggles?.mediaDrive ?? true) } }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border transition ${(config.driveToggles?.mediaDrive ?? true) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                  >
                    {(config.driveToggles?.mediaDrive ?? true) ? 'ON' : 'OFF'}
                  </button>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Media Drive Root <HelpButton id="mediaPath" /></label>
                </div>
                <div className={`flex gap-2 transition ${(config.driveToggles?.mediaDrive ?? true) ? '' : 'opacity-40 pointer-events-none'}`}>
                  <input
                    type="text"
                    value={config.mediaRootPath}
                    onChange={e => setConfig(prev => ({ ...prev, mediaRootPath: e.target.value }))}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, mediaRootPath: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, driveToggles: { ...prev.driveToggles, bellaDrive: !(prev.driveToggles?.bellaDrive ?? true) } }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border transition ${(config.driveToggles?.bellaDrive ?? true) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                  >
                    {(config.driveToggles?.bellaDrive ?? true) ? 'ON' : 'OFF'}
                  </button>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Bella Social Path <HelpButton id="bellaPath" /></label>
                </div>
                <div className={`flex gap-2 transition ${(config.driveToggles?.bellaDrive ?? true) ? '' : 'opacity-40 pointer-events-none'}`}>
                  <input
                    type="text"
                    value={config.bellaRootPath}
                    onChange={e => setConfig(prev => ({ ...prev, bellaRootPath: e.target.value }))}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, bellaRootPath: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Raw Dump Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.rawDumpPath ?? ''}
                    placeholder="e.g. R:\\RAW_DUMP"
                    onChange={e => setConfig(prev => ({ ...prev, rawDumpPath: e.target.value }))}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, rawDumpPath: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-amber-500 uppercase tracking-widest">SD Card Drive (Source) <HelpButton id="sdCard" /></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.sdCardDrive}
                    onChange={e => setConfig(prev => ({ ...prev, sdCardDrive: e.target.value }))}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-amber-400 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, sdCardDrive: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">GoPro Output Folder <HelpButton id="goproOutput" /></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.goProOutputPath ?? 'C:\\Users\\Jason\\Videos'}
                    onChange={e => setConfig(prev => ({ ...prev, goProOutputPath: e.target.value }))}
                    placeholder="C:\Users\Jason\Videos"
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                  />
                  <button
                    onClick={async () => {
                      const p = await selectFolder();
                      if (p) setConfig(prev => ({ ...prev, goProOutputPath: p }));
                    }}
                    className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                  >
                    📁 Browse
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">GoPro exports here by default. Leave as-is unless your Videos folder is different.</p>
              </div>

              <div className="flex flex-col gap-2 justify-end">
                <label className="text-xs font-black text-indigo-400 uppercase tracking-widest">GoPro Player</label>
                <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-4 py-3">
                  <span className="text-emerald-400 text-sm font-black">✓ GoPro Player detected — Microsoft Store App</span>
                </div>
              </div>
            </div>

            {/* 🤖 GOPRO ROBOT CALIBRATION */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest">🤖 GOPRO ROBOT CALIBRATION</h4>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  disabled={isCalibrating}
                  onClick={async () => {
                    setIsCalibrating(true);
                    try {
                      const coords = await window.electron?.ipcRenderer.invoke('calibrate-robot');
                      if (coords) {
                        setConfig(prev => ({ ...prev, robotCoords: coords }));
                        // Persist to the calibration file too, so the saved copy is
                        // always the latest (keyed by machine + screen resolution).
                        await window.electron?.saveCalibration(coords);
                      }
                    } finally {
                      setIsCalibrating(false);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl uppercase tracking-widest transition shadow-lg shadow-indigo-500/20"
                >
                  {isCalibrating ? '⏳ CALIBRATING...' : '🎯 CALIBRATE GOPRO ROBOT'}
                </button>
                <HelpButton id="calibrate" size="md" />
                {config.robotCoords ? (
                  <>
                    <span className="text-xs font-black tracking-wide text-emerald-400">
                      ✓ Calibration saved — robot is ready
                    </span>
                    <button
                      onClick={async () => {
                        setConfig(prev => ({ ...prev, robotCoords: null }));
                        await window.electron?.saveCalibration(null);
                      }}
                      className="px-3 py-2 bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 text-xs font-black rounded-lg transition uppercase tracking-widest border border-rose-950/50"
                    >
                      🗑 CLEAR CALIBRATION
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-black tracking-wide text-amber-400">
                    ⚠ Not calibrated — run calibration before using GoPro robot
                  </span>
                )}
              </div>
            </div>

            {/* NEW SESSION */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  if (!confirm("Start new session? This will clear all pilots, shot list, and history. Files on disk are NOT affected.")) return;
                  localStorage.removeItem('fpv_boss_csv_text');
                  localStorage.removeItem('fpv_boss_selected_pilot');
                  localStorage.removeItem('fpv_boss_card_num');
                  localStorage.removeItem('fpv_boss_card_by_pilot');
                  localStorage.removeItem('fpv_boss_history');
                  localStorage.removeItem('fpv_boss_available_pilots');
                  setConfig(prev => ({ ...prev, pilots: [], activePilotIndex: -1 }));
                  setCsvText(SAMPLE_CSV_DATA);
                  setSelectedPilot('');
                  setCurrentCardNum(1);
                  setCardNumberByPilot({});
                  setAvailablePilots([]);
                  setHistory([]);
                  setSkippedAssignments([]);
                  setCustomAssignmentOverride('');
                }}
                className="w-full py-3 bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 font-black text-sm uppercase tracking-widest rounded-xl transition border border-rose-500/20"
              >
                🗑 NEW SESSION
              </button>
              <p className="text-[10px] text-slate-600 text-center font-mono">Clears all pilots, shot list, and history. Files on disk are NOT affected.</p>
            </div>
            </>)}
            {setupTab === 'simple' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Show Name</label>
                    <input
                      type="text"
                      value={config.simpleConfig.showName}
                      onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, showName: e.target.value } }))}
                      className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-bold focus:ring-2 focus:ring-cyan-400 uppercase border-none"
                      placeholder="COACHELLA_PRIVATE"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pilot Name</label>
                    <input
                      type="text"
                      value={config.simpleConfig.pilotName}
                      onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, pilotName: e.target.value } }))}
                      className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-bold focus:ring-2 focus:ring-cyan-400 border-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Card Prefix</label>
                    <input
                      type="text"
                      value={config.simpleConfig.cardPrefix}
                      maxLength={2}
                      onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, cardPrefix: e.target.value } }))}
                      className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-cyan-400 font-black uppercase border-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Local Working Path <HelpButton id="localPath" /></label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.simpleConfig.localRootPath}
                        onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, localRootPath: e.target.value } }))}
                        className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-cyan-400 border-none flex-grow min-w-0"
                      />
                      <button
                        onClick={async () => {
                          const p = await selectFolder();
                          if (p) setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, localRootPath: p } }));
                        }}
                        className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl text-xs font-black whitespace-nowrap"
                      >📁 Browse</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, driveToggles: { ...prev.simpleConfig.driveToggles, mediaDrive: !(prev.simpleConfig.driveToggles?.mediaDrive ?? true) } } }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border transition ${(config.simpleConfig.driveToggles?.mediaDrive ?? true) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                      >
                        {(config.simpleConfig.driveToggles?.mediaDrive ?? true) ? 'ON' : 'OFF'}
                      </button>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Media Drive Root <HelpButton id="mediaPath" /></label>
                    </div>
                    <div className={`flex gap-2 transition ${(config.simpleConfig.driveToggles?.mediaDrive ?? true) ? '' : 'opacity-40 pointer-events-none'}`}>
                      <input
                        type="text"
                        value={config.simpleConfig.mediaRootPath}
                        onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, mediaRootPath: e.target.value } }))}
                        className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-cyan-400 border-none flex-grow min-w-0"
                      />
                      <button
                        onClick={async () => {
                          const p = await selectFolder();
                          if (p) setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, mediaRootPath: p } }));
                        }}
                        className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl text-xs font-black whitespace-nowrap"
                      >📁 Browse</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-amber-500 uppercase tracking-widest">SD Card Drive (Source) <HelpButton id="sdCard" /></label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.simpleConfig.sdCardDrive}
                        onChange={e => setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, sdCardDrive: e.target.value } }))}
                        className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-amber-400 font-mono focus:ring-2 focus:ring-amber-500 border-none flex-grow min-w-0"
                      />
                      <button
                        onClick={async () => {
                          const p = await selectFolder();
                          if (p) setConfig(prev => ({ ...prev, simpleConfig: { ...prev.simpleConfig, sdCardDrive: p } }));
                        }}
                        className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-black whitespace-nowrap"
                      >📁 Browse</button>
                    </div>
                  </div>
                </div>
                {simplePathPreviews && (
                  <div className="space-y-2 bg-slate-950 rounded-xl p-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">PATH PREVIEW</p>
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono text-cyan-400">RAW: <span className="text-slate-300">{simplePathPreviews.raw}</span></p>
                      <p className="text-[10px] font-mono text-cyan-400">STAB: <span className="text-slate-300">{simplePathPreviews.stabilized}</span></p>
                      <p className="text-[10px] font-mono text-amber-400">MEDIA: <span className="text-slate-300">{simplePathPreviews.media}</span></p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 📱 MOBILE DASHBOARD (PWA) — watch progress & trigger Move from a phone */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest">📱 Mobile Dashboard (PWA)</h4>
                {dashboardInfo && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${dashboardInfo.running ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {dashboardInfo.running ? '● Serving' : '○ Stopped'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl">
                On your phone (same Wi-Fi or Tailscale), open a URL below, then “Add to Home Screen” to install it. Watch live progress and tap MOVE FILES remotely. Windows may prompt to allow network access — choose <strong className="text-slate-200">Allow</strong> (Private networks).
              </p>

              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dashboard Port</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={dashboardPortInput}
                      onChange={e => setDashboardPortInput(e.target.value)}
                      className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-amber-500 border-none w-32"
                    />
                    <button
                      onClick={applyDashboardPort}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl uppercase tracking-widest transition"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {/* Move Files password — shown in plain text. Phone needs this to open
                    the Move Files / Stabilizer section. Blank = no password needed. */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Phone “Move Files” Password</label>
                  <input
                    type="text"
                    value={movePasswordInput}
                    placeholder="(blank = no password)"
                    onChange={e => { setMovePasswordInput(e.target.value); window.electron?.dashboardSetMovePassword(e.target.value); }}
                    className="bg-slate-950 rounded-xl px-4 py-3 text-sm text-amber-300 font-mono focus:ring-2 focus:ring-amber-500 border-none w-56"
                  />
                  <span className="text-[10px] text-slate-500">Anyone can use the Shot List &amp; Slate; this only gates the Move Files section.</span>
                </div>
              </div>

              <PhoneAccessPanel httpsUrl={dashboardInfo?.tailscaleHttpsUrl} urls={dashboardInfo?.urls ?? []} />
              <p className="text-[10px] font-mono text-slate-600 mt-1 px-1">Completion mode (set here or from the phone): <span className={moveMode === 'auto' ? 'text-emerald-400' : 'text-cyan-400'}>{moveMode.toUpperCase()}</span></p>
            </div>
          </div>
        )}

        {config.mode === 'festival' ? (<>

        {/* METADATA FILTERS BAR */}
        <div className="bg-slate-900 rounded-3xl p-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 shadow-xl" id="dropdowns-panel">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 w-full md:w-auto">
            <div className="flex flex-col gap-2 flex-grow">
              <label className="text-xs font-black text-amber-500 uppercase tracking-widest leading-none">Event Segment / Day <HelpButton id="daySection" /></label>
              {daySections.length > 0 ? (
                <select
                  value={selectedDaySection}
                  onChange={e => {
                    setSelectedDaySection(e.target.value);
                    setCustomAssignmentOverride('');
                  }}
                  className="bg-slate-950 text-amber-400 rounded-xl px-5 py-3 border-none text-base font-black cursor-pointer focus:ring-2 focus:ring-amber-500"
                >
                  {daySections.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedDaySection}
                  onChange={e => {
                    setSelectedDaySection(e.target.value);
                    setCustomAssignmentOverride('');
                  }}
                  placeholder="e.g. Day 1, Corporate Show, Night Set"
                  className="bg-slate-950 text-amber-400 rounded-xl px-5 py-3 border-none text-base font-black focus:ring-2 focus:ring-amber-500 w-full"
                />
              )}
            </div>
          </div>

          <div className="bg-slate-950 rounded-2xl px-6 py-4 flex items-center justify-between gap-6 w-full lg:w-auto shadow-inner">
            <div>
              <span className="text-xs text-slate-400 uppercase font-black tracking-widest block leading-none mb-1">Queue Standpoint</span>
              <span className="text-2xl font-black text-amber-400">
                {activeQueue.length} <span className="text-xs text-slate-400 font-bold">sets remaining</span>
              </span>
            </div>
            {pickerAssignments.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPickerOpen(true)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs font-black rounded-lg transition"
                >
                  CHOOSE FROM LIST
                </button>
                <HelpButton id="chooseFromList" />
              </div>
            )}
          </div>
        </div>

        {/* ACTIVE COCKPIT MAIN CORE */}
        <div className="w-full flex flex-col gap-8 flex-grow">

          {/* PILOT COMMAND CENTER */}
          <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden">
            {/* Collapsible header */}
            <button
              onClick={() => setIsPilotCmdOpen(prev => !prev)}
              className="w-full flex items-center justify-between px-5 py-3 focus:outline-none hover:bg-slate-800/40 transition"
            >
              <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">⚡ PILOT COMMAND CENTER</span>
              {isPilotCmdOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">
                    {!selectedPilot
                      ? 'NO PILOT SELECTED'
                      : `ACTIVE: ${activePilot?.name ?? selectedPilot} · ${(activePilot?.cardPrefix ?? '???').toUpperCase()}_${String(currentCardNum).padStart(3,'0')} · ${(config.pilots||[]).length} pilots`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
              )}
            </button>

            {isPilotCmdOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-slate-800">

                {/* ZONE 1: AVAILABLE PILOTS */}
                <div className="space-y-2 pt-3">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Available Pilots <HelpButton id="pilots" /></span>
                  {availablePilots.length === 0 && config.pilots.length === 0 && (
                    <span className="text-xs text-slate-600 font-mono italic">No pilots in pool — import CSV or add below</span>
                  )}
                  {availablePilots.map((pilot, idx) => (
                    <div key={pilot.name} className="flex flex-wrap gap-2 items-center bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2">
                      <span className="text-sm font-black text-amber-200 flex-shrink-0 min-w-[80px]">{pilot.name}</span>
                      <input
                        type="text"
                        value={pilot.cardPrefix}
                        onChange={e => setAvailablePilots(prev => prev.map((p, i) => i === idx ? { ...p, cardPrefix: e.target.value.toUpperCase() } : p))}
                        placeholder="PFX"
                        maxLength={3}
                        className={`bg-slate-950 rounded-xl px-3 py-2 text-sm text-cyan-400 font-black uppercase border w-20 text-center ${pilotActivateErrors.includes(pilot.name) ? 'border-rose-500 bg-rose-950/20' : 'border-transparent'}`}
                      />
                      <input
                        type="number"
                        value={pilot.startingCardNumber}
                        min={1}
                        onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setAvailablePilots(prev => prev.map((p, i) => i === idx ? { ...p, startingCardNumber: v } : p)); }}
                        className="bg-slate-950 rounded-xl px-3 py-2 text-sm text-slate-100 font-bold border-none w-20 text-center"
                      />
                      <button
                        onClick={() => {
                          const prefix = pilot.cardPrefix.trim().toUpperCase();
                          if (!prefix) {
                            setPilotActivateErrors(prev => [...prev, pilot.name]);
                            setTimeout(() => setPilotActivateErrors(prev => prev.filter(n => n !== pilot.name)), 1500);
                            return;
                          }
                          const activatedPilot: PilotConfig = { name: pilot.name, cardPrefix: prefix, startingCardNumber: pilot.startingCardNumber };
                          if (selectedPilot) {
                            setCardNumberByPilot(prev => ({ ...prev, [selectedPilot]: currentCardNum }));
                          }
                          const newPilots = [...(config.pilots || []), activatedPilot];
                          const newIdx = newPilots.length - 1;
                          setConfig(prev => ({ ...prev, pilots: newPilots, activePilotIndex: newIdx }));
                          setAvailablePilots(prev => prev.filter((_, i) => i !== idx));
                          setSelectedPilot(pilot.name);
                          const savedNum = cardNumberByPilot[pilot.name];
                          setCurrentCardNum(savedNum !== undefined ? savedNum : pilot.startingCardNumber);
                          setCustomAssignmentOverride('');
                        }}
                        className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-black rounded-lg uppercase tracking-widest transition"
                      >→ ACTIVATE</button>
                      <button
                        onClick={() => setAvailablePilots(prev => prev.filter((_, i) => i !== idx))}
                        className="px-2 py-1 rounded-lg text-rose-500 hover:text-rose-300 hover:bg-rose-950/30 text-xs font-black transition"
                      >✕</button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 items-center pt-1">
                    <input
                      type="text"
                      value={newPilotName}
                      onChange={e => setNewPilotName(e.target.value)}
                      placeholder="Pilot Name"
                      className="bg-slate-950 rounded-xl px-3 py-2 text-sm text-slate-100 font-bold flex-grow min-w-0 border-none"
                    />
                    <input
                      type="text"
                      value={newPilotPrefix}
                      onChange={e => setNewPilotPrefix(e.target.value.toUpperCase())}
                      placeholder="PFX"
                      maxLength={3}
                      className="bg-slate-950 rounded-xl px-3 py-2 text-sm text-cyan-400 font-black uppercase border-none w-20 text-center"
                    />
                    <input
                      type="number"
                      value={newPilotStartNum}
                      min={1}
                      onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setNewPilotStartNum(v); }}
                      className="bg-slate-950 rounded-xl px-3 py-2 text-sm text-slate-100 font-bold border-none w-20 text-center"
                    />
                    <button
                      onClick={() => {
                        const name = newPilotName.trim();
                        if (!name) return;
                        const prefix = (newPilotPrefix.trim() || 'A').toUpperCase();
                        const alreadyActive = (config.pilots || []).some(p => p.name === name);
                        const alreadyInPool = availablePilots.some(p => p.name === name);
                        if (alreadyActive || alreadyInPool) return;
                        const newPilot: PilotConfig = { name, cardPrefix: prefix, startingCardNumber: newPilotStartNum };
                        setConfig(prev => ({ ...prev, pilots: [...(prev.pilots || []), newPilot] }));
                        setNewPilotName('');
                        setNewPilotPrefix('A');
                        setNewPilotStartNum(1);
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-lg uppercase tracking-widest transition"
                    >+ ADD TO POOL</button>
                  </div>
                </div>

                {/* ZONE 2: ACTIVE PILOTS */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Active Pilots <HelpButton id="activePilot" /></span>
                  <div className="flex flex-wrap gap-2">
                    {(config.pilots || []).length === 0 && (
                      <span className="text-xs text-slate-600 font-mono italic">No active pilots — activate from pool above</span>
                    )}
                    {(config.pilots || []).map((pilot, idx) => {
                      const savedCardNum = cardNumberByPilot[pilot.name] ?? pilot.startingCardNumber;
                      const paddedNum = String(savedCardNum).padStart(3, '0');
                      const completedCount = history.filter(h => h.status === 'Complete' && h.pilot === pilot.name).length;
                      const isWorking = selectedPilot === pilot.name;
                      return (
                        <div key={pilot.name} className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (selectedPilot) {
                                setCardNumberByPilot(prev => ({ ...prev, [selectedPilot]: currentCardNum }));
                              }
                              setSelectedPilot(pilot.name);
                              setConfig(prev => ({ ...prev, activePilotIndex: idx }));
                              const savedNum = cardNumberByPilot[pilot.name];
                              setCurrentCardNum(savedNum !== undefined ? savedNum : pilot.startingCardNumber);
                              setCustomAssignmentOverride('');
                            }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition border ${
                              isWorking
                                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                          >
                            <span>{pilot.name}  ·  {pilot.cardPrefix.toUpperCase()}_{paddedNum}</span>
                            {completedCount > 0 && (
                              <span className="text-[9px] font-black bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 px-1.5 py-0.5 rounded-full">
                                {completedCount}✓
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Move ${pilot.name} back to Available Pilots pool?`)) return;
                              const newPilots = (config.pilots || []).filter((_, i) => i !== idx);
                              const newActiveIdx = selectedPilot === pilot.name
                                ? -1
                                : config.activePilotIndex > idx
                                ? config.activePilotIndex - 1
                                : config.activePilotIndex;
                              setConfig(prev => ({ ...prev, pilots: newPilots, activePilotIndex: newActiveIdx }));
                              setAvailablePilots(prev => [...prev, { name: pilot.name, cardPrefix: pilot.cardPrefix, startingCardNumber: pilot.startingCardNumber }]);
                              if (selectedPilot === pilot.name) setSelectedPilot('');
                            }}
                            className="px-2 py-1 rounded-lg text-rose-500 hover:text-rose-300 hover:bg-rose-950/30 text-xs font-black transition"
                            title={`Move ${pilot.name} back to pool`}
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ZONE 3: WORKING PILOT */}
                <div className="bg-slate-950 rounded-xl p-3 space-y-2 border-t border-slate-800 pt-3">
                  {!selectedPilot ? (
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest block text-center py-2">— SELECT AN ACTIVE PILOT ABOVE —</span>
                  ) : (
                    <>
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono uppercase block">Working Pilot</span>
                          <span className="text-sm font-black text-cyan-300">{activePilot?.name ?? selectedPilot}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setCurrentCardNum(n => Math.max(1, n - 1))}
                            className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-300 font-black text-xs transition"
                          >▼</button>
                          <input
                            type="number"
                            value={currentCardNum}
                            min={1}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setCurrentCardNum(val);
                            }}
                            className="bg-slate-900 rounded-lg px-3 py-1.5 text-base text-white font-black w-20 border-none text-center"
                          />
                          <button
                            onClick={() => setCurrentCardNum(n => n + 1)}
                            className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-300 font-black text-xs transition"
                          >▲</button>
                          <button
                            onClick={() => setCurrentCardNum(activePilot?.startingCardNumber ?? 1)}
                            className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-400 transition"
                            title="Reset to pilot starting number"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setConfig(prev => ({ ...prev, activePilotIndex: -1 }));
                              setSelectedPilot('');
                              setCurrentCardNum(1);
                            }}
                            className="px-3 py-1.5 rounded-lg font-black text-xs tracking-wide transition bg-rose-950/40 text-rose-400 hover:bg-rose-950/60 border border-rose-500/20"
                          >
                            ✕ CLEAR
                          </button>
                        </div>
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        Current Card ID: <span className="text-cyan-400 font-black text-sm">{currentCardId}</span>
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-3xl p-4 md:p-6 gap-3 shadow-xl flex flex-col justify-between" id="hero-card-panel">

            <div className="bg-slate-950 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm font-mono font-black text-slate-400">
                <span className="w-3" />
                <span className="text-amber-500">MAPPING PORTAL :</span>
                <span className="text-white bg-slate-900 border border-slate-800 px-3 py-1 rounded ml-1 font-bold">{selectedPilot.toUpperCase()}</span>
              </div>
              <span className="text-xs font-bold text-slate-400 font-mono">SET FLY TIME: {activeFlyTime}</span>
            </div>

            {/* Huge Card Identifier Display */}
            <div className="py-2 flex flex-col justify-center items-center text-center gap-2 flex-grow">

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-full font-black">
                  CURRENT SLOT ID
                </span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setCurrentCardNum(n => Math.max(1, n - 1))}
                    className="text-3xl text-cyan-400 hover:text-white transition font-black leading-none select-none"
                  >▼</button>
                  <div className="card-id-glow text-4xl tracking-tighter select-all leading-none">
                    {currentCardId}
                  </div>
                  <button
                    onClick={() => setCurrentCardNum(n => n + 1)}
                    className="text-3xl text-cyan-400 hover:text-white transition font-black leading-none select-none"
                  >▲</button>
                </div>
              </div>

              <div className="text-slate-500 font-black tracking-widest flex items-center gap-3 bg-slate-950 px-6 py-2 rounded-full text-xs">
                <span>MAPPED DIRECTLY TO SHOT</span>
                <ArrowRight className="w-4 h-4 text-amber-500" />
              </div>

              <div className="flex flex-col items-center gap-1 max-w-4xl w-full">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-400/10 px-2 py-0.5 rounded-full font-black">
                  ARTIST / TARGET LABEL <HelpButton id="artistName" />
                </span>
                <h2 className={`${activeAssignmentName.length > 40 ? 'text-xl' : 'text-2xl'} font-black text-white tracking-tight leading-tight select-all uppercase overflow-hidden line-clamp-2`}>
                  {activeAssignmentName}
                </h2>
                {activeNotes && (
                  <p className="text-sm font-bold text-slate-400 bg-slate-950 p-2 rounded-xl border border-slate-800 max-w-2xl mt-1 leading-relaxed max-h-20 overflow-y-auto">
                    <strong className="text-amber-400 block font-mono">GRID NOTE:</strong> {activeNotes}
                  </p>
                )}

                {/* Overwrite Assignment Override Input */}
                <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xl bg-slate-950 p-3 rounded-2xl border border-amber-500/10">
                  <span className="text-xs text-amber-500 font-mono uppercase font-black shrink-0 px-2">OVERRIDE ARTIST: <HelpButton id="overrideArtist" /></span>
                  <input
                    type="text"
                    value={customAssignmentOverride}
                    onChange={e => setCustomAssignmentOverride(e.target.value)}
                    placeholder="Type customized artist name instead..."
                    className="bg-slate-900 text-xs text-slate-100 rounded-xl px-4 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-amber-500 font-black tracking-wide"
                  />
                  {customAssignmentOverride && (
                    <button
                      onClick={() => setCustomAssignmentOverride('')}
                      className="text-xs text-rose-400 hover:text-white px-3 py-2 bg-slate-800 rounded-xl"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Card Notes */}
                <div className="mt-1 flex flex-col gap-2 w-full max-w-xl">
                  <span className="text-xs text-slate-500 font-mono uppercase font-black">CARD NOTES: <HelpButton id="notesInput" /></span>
                  <textarea
                    rows={2}
                    value={notesInput}
                    onChange={e => setNotesInput(e.target.value)}
                    placeholder="Corrupt file at 00:12:06, pilot landed early, battery swap mid-card, etc."
                    className="bg-slate-900 text-xs text-slate-100 rounded-xl px-4 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold tracking-wide resize-none border border-amber-500/10"
                  />
                </div>
              </div>

            </div>

            {/* Tactical Rerouting Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 bg-slate-950 p-3 rounded-xl gap-3">
              <button
                onClick={handleSkipAssignment}
                className="py-2 px-6 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider text-center"
              >
                🚨 SKIP SHOT
              </button>

              <button
                onClick={() => setIsPickerOpen(true)}
                className="py-2 px-6 bg-amber-500 text-slate-950 hover:bg-amber-400 font-black text-xs uppercase tracking-wider text-center rounded-lg"
              >
                🔍 SELECT MANUALLY
              </button>

              <button
                onClick={handleMixedUnclearCard}
                className="py-2 px-6 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 font-bold text-xs uppercase tracking-wider text-center"
              >
                ⚠️ MESSED CARD / FLAG MIXED
              </button>
            </div>

            {/* COMPUTED PATHWAYS SECTION */}
            <div className="bg-slate-950 rounded-2xl p-6 space-y-4" id="paths-block">

              {/* CURRENT CARD ID control */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">CURRENT CARD ID <HelpButton id="cardId" /></span>
                  <span className="card-id-glow text-3xl font-black text-amber-400 font-mono tracking-tight">{currentCardId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentCardNum(n => Math.max(1, n - 1))}
                    className="bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg text-slate-300 font-black text-xs transition"
                  >▼</button>
                  <input
                    type="number"
                    value={currentCardNum}
                    min={1}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) setCurrentCardNum(val);
                    }}
                    className="bg-slate-900 rounded-lg px-3 py-1.5 text-base text-white font-black w-20 border-none text-center"
                  />
                  <button
                    onClick={() => setCurrentCardNum(n => n + 1)}
                    className="bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg text-slate-300 font-black text-xs transition"
                  >▲</button>
                  <button
                    onClick={() => setCurrentCardNum(activePilot?.startingCardNumber ?? 1)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black text-xs rounded-lg transition uppercase tracking-widest"
                  >
                    RESET
                  </button>
                  <HelpButton id="resetCardNumber" />
                  <HelpButton id="cardNumber" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pb-2">
                <span className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                  <Folder className="w-5 h-5 text-cyan-400" /> COPIER WORKSPACE DIRECTORIES
                </span>
                <HelpButton id="createFolders" size="md" />
              </div>

              {/* STEP 1 — prominent, hard-to-miss "create the folders" action. Green
                  outline by default; fills solid green once the folders are created. */}
              <button
                disabled={foldersCreatedStatus === 'creating'}
                onClick={async () => {
                  setFoldersCreatedStatus('creating');
                  try {
                    await createLocalFolders({
                      rawPath: localRawPath,
                      stabilizedPath: localStabilizedPath,
                      mediaDrivePath: (config.driveToggles?.mediaDrive ?? true) ? destinationMediaDrivePath : '',
                      bellaSocialPath: (config.driveToggles?.bellaDrive ?? true) ? destinationBellaSocialPath : ''
                    });
                    setFoldersCreatedStatus('done');
                  } catch {
                    setFoldersCreatedStatus('idle');
                  }
                }}
                className={`w-full py-4 px-6 rounded-xl text-sm font-black uppercase tracking-widest transition border-2 flex items-center justify-center gap-2 disabled:cursor-not-allowed active:scale-[.99] ${
                  foldersCreatedStatus === 'done'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                    : foldersCreatedStatus === 'creating'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/60'
                    : 'bg-emerald-500/5 text-emerald-400 border-emerald-500 hover:bg-emerald-500/15 shadow-[0_0_18px_rgba(16,185,129,0.25)] animate-pulse'
                }`}
              >
                {foldersCreatedStatus === 'creating'
                  ? '⏳ Creating Directories...'
                  : foldersCreatedStatus === 'done'
                  ? '✓ Directories Created'
                  : '① Start Here — Create Directory Paths'}
              </button>

              {/* STEP 2 — copy the SD card into the local RAW folder. The obvious
                  next action after creating directories: prominent (a touch smaller
                  than Step ①), amber, and pulses once the directories are made. */}
              <button
                disabled={copyProgress !== null}
                onClick={handleCopySdToRaw}
                className={`w-full py-3.5 px-6 rounded-xl text-sm font-black uppercase tracking-widest transition border-2 flex items-center justify-center gap-2 disabled:cursor-not-allowed active:scale-[.99] ${
                  sdCopyResult?.matched
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                    : copyProgress !== null
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/60'
                    : foldersCreatedStatus === 'done' && sdCopyResult === null
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500 hover:bg-amber-500/20 shadow-[0_0_18px_rgba(245,158,11,0.30)] animate-pulse'
                    : 'bg-amber-500/5 text-amber-400 border-amber-500/70 hover:bg-amber-500/15'
                }`}
              >
                {copyProgress !== null
                  ? `⏳ Copying SD Card... ${Math.round(copyProgress)}%`
                  : sdCopyResult?.matched
                  ? '✓ SD Card Copied to RAW'
                  : `② Copy SD Card → Local RAW  (SRC: ${config.sdCardDrive})`}
              </button>
              <div className="border-b border-slate-900 pb-1" />

              {/* DUMP RAWS — consolidate this pilot's raw files into the flat Raw Dump folder */}
              <div className="space-y-1.5 pb-3 border-b border-slate-900">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    RAW DUMP → <span className="font-mono text-slate-400">{config.rawDumpPath?.trim() || '— set in Setup —'}</span>
                  </span>
                  <button
                    disabled={dumpRawsStatus === 'dumping' || !selectedPilot || !(config.rawDumpPath?.trim())}
                    onClick={handleDumpRaws}
                    className={`px-3.5 py-1.5 rounded text-xs font-black uppercase tracking-wider transition border disabled:opacity-40 disabled:cursor-not-allowed ${
                      dumpRawsStatus === 'success'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/20'
                    }`}
                  >
                    {dumpRawsStatus === 'dumping'
                      ? (dumpRawsProgress ? `⏳ DUMPING ${dumpRawsProgress.current}/${dumpRawsProgress.total}...` : '⏳ DUMPING...')
                      : dumpRawsStatus === 'success'
                      ? '✓ RAWS DUMPED — RUN AGAIN'
                      : `⬇ DUMP RAWS (${selectedPilot || 'NO PILOT'})`}
                  </button>
                </div>
                {dumpRawsStatus === 'dumping' && dumpRawsProgress && dumpRawsProgress.total > 0 && (
                  <div className="relative bg-slate-950 rounded-xl h-7 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out" style={{ width: `${(dumpRawsProgress.current / dumpRawsProgress.total) * 100}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-cyan-300">
                      {dumpRawsProgress.current} / {dumpRawsProgress.total}
                    </span>
                  </div>
                )}
                {dumpRawsStatus === 'success' && dumpRawsResult && (
                  <p className="text-[10px] font-mono text-emerald-400">
                    Copied {dumpRawsResult.copied} new file{dumpRawsResult.copied !== 1 ? 's' : ''} ({dumpRawsResult.sizeGB} GB) · skipped {dumpRawsResult.skipped} already dumped
                  </p>
                )}
                {dumpRawsStatus === 'error' && dumpRawsError && (
                  <p className="text-[10px] font-mono text-rose-400 break-all">✗ {dumpRawsError}</p>
                )}
              </div>

              <div className="space-y-4">
                {/* LOCAL RAW */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">1. LOCAL RAW PATH (DRAG SOURCE TARGET) <HelpButton id="rawVsStabilized" /></span>
                  <div className="flex flex-col sm:flex-row items-stretch bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between sm:justify-start flex-grow">
                      <span className="bg-slate-800 font-black text-xs text-slate-500 px-4 py-2 border-r border-slate-950">RAW</span>
                      <code className="px-4 py-2.5 text-xs font-mono text-cyan-400 break-all select-all flex-grow">
                        {localRawPath}
                      </code>
                    </div>

                    <div className="flex items-center bg-slate-950 px-3 border-t sm:border-t-0 sm:border-l border-slate-950 gap-2 shrink-0">
                      <span className="text-[10px] font-black text-amber-500 font-mono uppercase tracking-wider whitespace-nowrap">
                        SRC: {config.sdCardDrive}
                      </span>
                      <button
                        disabled={copyProgress !== null}
                        onClick={handleCopySdToRaw}
                        className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-amber-500 rounded text-[10px] font-black uppercase tracking-wider"
                      >
                        {copyProgress !== null ? 'COPYING…' : 'SD COPY'}
                      </button>
                      <HelpButton id="copySdToRaw" size="md" />
                    </div>

                    <div className="flex items-stretch shrink-0 border-t sm:border-t-0 border-slate-950 text-xs">
                      <button onClick={() => openFolderInExplorer(localRawPath)} className="px-4 py-2 sm:py-0 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-black">OPEN</button>
                      <button onClick={() => handleCopyText(localRawPath, 'raw')} className={`px-4 py-2 sm:py-0 font-black ${copiedStates['raw'] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-cyan-400'}`}>
                        {copiedStates['raw'] ? '✓' : 'COPY'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SD COPY PROGRESS BAR */}
                {copyProgress !== null && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block">
                      SD CARD COPY IN PROGRESS
                    </span>
                    <div className="relative bg-slate-950 rounded-xl h-9 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                        style={{ width: `${copyProgress}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-amber-400 tracking-widest">
                        {Math.round(copyProgress)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* SD COPY VERIFICATION PANEL */}
                {sdCopyResult !== null && (
                  sdCopyResult.matched ? (
                    <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 space-y-0.5">
                      <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">✓ COPY VERIFIED</p>
                      <p className="text-xs font-bold text-emerald-300">SD Card: {sdCopyResult.sourceFileCount} files</p>
                      <p className="text-xs font-bold text-emerald-300">Local RAW: {sdCopyResult.fileCount} files — {sdCopyResult.sizeGB}</p>
                      <p className="text-xs font-bold text-emerald-400">Source and destination file counts match ✓</p>
                    </div>
                  ) : (
                    <div className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40 space-y-0.5">
                      <p className="text-xs font-black text-rose-400 uppercase tracking-widest">⚠ FILE COUNT MISMATCH — Verify before continuing</p>
                      <p className="text-xs font-bold text-rose-300">SD Card: {sdCopyResult.sourceFileCount} files</p>
                      <p className="text-xs font-bold text-rose-300">Local RAW: {sdCopyResult.fileCount} files — {sdCopyResult.sizeGB}</p>
                      <p className="text-xs font-bold text-rose-400">Counts do not match. Check for copy errors before running GoPro robot.</p>
                    </div>
                  )
                )}
                {sdCopyResult?.batchSubfolder && (
                  <div className="w-full py-2 px-4 rounded-xl bg-cyan-400/10 border border-cyan-500/20">
                    <p className="text-[11px] font-bold text-cyan-300">
                      ↳ Folder already had files — new card copied into subfolder <span className="font-black">{sdCopyResult.batchSubfolder}</span>. The robot will stabilize only these new files.
                    </p>
                  </div>
                )}

                {/* LOCAL STAB */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">2. LOCAL STABILIZED EXPORT TARGET</span>
                  <div className="flex flex-col sm:flex-row items-stretch bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between sm:justify-start flex-grow">
                      <span className="bg-slate-800 font-black text-xs text-slate-500 px-4 py-2 border-r border-slate-950">STAB</span>
                      <code className="px-4 py-2.5 text-xs font-mono text-cyan-400 break-all select-all flex-grow">
                        {localStabilizedPath}
                      </code>
                    </div>
                    <div className="flex items-stretch shrink-0 text-xs">
                      <button onClick={() => openFolderInExplorer(localStabilizedPath)} className="px-4 py-2 sm:py-0 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-black">OPEN</button>
                      <button onClick={() => handleCopyText(localStabilizedPath, 'stabilized')} className={`px-4 py-2 sm:py-0 font-black ${copiedStates['stabilized'] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-cyan-400'}`}>
                        {copiedStates['stabilized'] ? '✓' : 'COPY'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* MEDIA DRIVE */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block">3. MASTER MEDIA DRIVE DESTINATION (SOP: LETTER + CARD ONLY)</span>
                  <div className="flex flex-col sm:flex-row items-stretch bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between sm:justify-start flex-grow">
                      <span className="bg-slate-800 font-black text-xs text-amber-500 px-4 py-2 border-r border-slate-950">MEDIA</span>
                      {(config.driveToggles?.mediaDrive ?? true) ? (
                        <code className="px-4 py-2.5 text-xs font-mono text-amber-300 break-all select-all flex-grow">
                          {destinationMediaDrivePath}
                        </code>
                      ) : (
                        <span className="px-4 py-2.5 text-xs font-black text-slate-600 uppercase tracking-widest flex-grow">— DISABLED —</span>
                      )}
                    </div>

                    {(config.driveToggles?.mediaDrive ?? true) && (
                      <div className="flex items-center bg-slate-950 px-3 border-t sm:border-t-0 sm:border-l border-slate-950 gap-2 shrink-0">
                        <button
                          disabled={mediaCopyProgress !== null}
                          onClick={async () => {
                            setMediaCopyProgress(0);
                            try {
                              await copyToMedia(localRawPath, localStabilizedPath, destinationMediaDrivePath);
                              setMediaCopyProgress(100);
                              setTimeout(() => setMediaCopyProgress(null), 1500);
                            } catch {
                              setMediaCopyProgress(null);
                            }
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-amber-500 rounded text-[10px] font-black uppercase tracking-wider"
                        >
                          {mediaCopyProgress !== null ? 'COPYING…' : 'COPY TO MEDIA'}
                        </button>
                      </div>
                    )}

                    <div className="flex items-stretch shrink-0 text-xs">
                      <button onClick={() => openFolderInExplorer(destinationMediaDrivePath)} className="px-4 py-2 sm:py-0 bg-slate-800 hover:bg-slate-700 text-amber-400 font-black">OPEN</button>
                      <button onClick={() => handleCopyText(destinationMediaDrivePath, 'media')} className={`px-4 py-2 sm:py-0 font-black ${copiedStates['media'] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-amber-400'}`}>
                        {copiedStates['media'] ? '✓' : 'COPY'}
                      </button>
                    </div>
                  </div>

                  {mediaCopyProgress !== null && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block">
                        MEDIA DRIVE COPY IN PROGRESS
                      </span>
                      <div className="relative bg-slate-950 rounded-xl h-9 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                          style={{ width: `${mediaCopyProgress}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-amber-400 tracking-widest">
                          {Math.round(mediaCopyProgress)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* BELLA SOCIAL */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-violet-400 uppercase tracking-wider block">4. BELLA SOCIAL DROPBOX DESTINATION (STAB ONLY)</span>
                  <div className="flex flex-col sm:flex-row items-stretch bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between sm:justify-start flex-grow">
                      <span className="bg-slate-800 font-black text-xs text-violet-400 px-4 py-2 border-r border-slate-950">SOCIAL</span>
                      {(config.driveToggles?.bellaDrive ?? true) ? (
                        <code className="px-4 py-2.5 text-xs font-mono text-violet-300 break-all select-all flex-grow">
                          {destinationBellaSocialPath}
                        </code>
                      ) : (
                        <span className="px-4 py-2.5 text-xs font-black text-slate-600 uppercase tracking-widest flex-grow">— DISABLED —</span>
                      )}
                    </div>

                    {(config.driveToggles?.bellaDrive ?? true) && (
                      <div className="flex items-center bg-slate-950 px-3 border-t sm:border-t-0 sm:border-l border-slate-950 gap-2 shrink-0">
                        <button
                          disabled={bellaCopyProgress !== null}
                          onClick={async () => {
                            setBellaCopyProgress(0);
                            try {
                              await copyToBella(localStabilizedPath, destinationBellaSocialPath);
                              setBellaCopyProgress(100);
                              setTimeout(() => setBellaCopyProgress(null), 1500);
                            } catch {
                              setBellaCopyProgress(null);
                            }
                          }}
                          className="px-2.5 py-1 bg-violet-500/10 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-violet-400 rounded text-[10px] font-black uppercase tracking-wider"
                        >
                          {bellaCopyProgress !== null ? 'COPYING…' : 'COPY TO BELLA'}
                        </button>
                      </div>
                    )}

                    <div className="flex items-stretch shrink-0 text-xs">
                      <button onClick={() => openFolderInExplorer(destinationBellaSocialPath)} className="px-4 py-2 sm:py-0 bg-slate-800 hover:bg-slate-700 text-violet-400 font-black">OPEN</button>
                      <button onClick={() => handleCopyText(destinationBellaSocialPath, 'social')} className={`px-4 py-2 sm:py-0 font-black ${copiedStates['social'] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-violet-400'}`}>
                        {copiedStates['social'] ? '✓' : 'COPY'}
                      </button>
                    </div>
                  </div>

                  {bellaCopyProgress !== null && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-violet-400 uppercase tracking-wider block">
                        BELLA SOCIAL COPY IN PROGRESS
                      </span>
                      <div className="relative bg-slate-950 rounded-xl h-9 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                          style={{ width: `${bellaCopyProgress}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-violet-300 tracking-widest">
                          {Math.round(bellaCopyProgress)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* LOWER OPERATIONAL NESTING SHARDS */}

          {/* GOPRO SETTINGS CARD */}
          <div className="bg-slate-900 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-500" /> GoPro Player Setup Manual
                </h3>
                <span className="text-[10px] bg-rose-500/10 text-rose-400 px-3 py-1 rounded font-black uppercase">REQUIRED SOP</span>
              </div>

              <div className="flex gap-6 items-start">
              <div className="flex-[55] min-w-0 space-y-2">

                {/* PRE-FLIGHT STATUS */}
                {preFlightStatus === 'checking' && (
                  <div className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 border border-amber-500/30 animate-pulse">
                    <p className="text-center text-xs font-black text-amber-400 uppercase tracking-widest">
                      ⏳ RUNNING PRE-FLIGHT CHECKS...
                    </p>
                  </div>
                )}
                {preFlightStatus === 'passed' && preFlightWarnings.length === 0 && (
                  <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                    <p className="text-center text-xs font-black text-emerald-400 uppercase tracking-widest">
                      ✓ PRE-FLIGHT PASSED — All systems go
                    </p>
                  </div>
                )}
                {preFlightStatus === 'passed' && preFlightWarnings.length > 0 && (
                  <div className="space-y-1">
                    <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                      <p className="text-center text-xs font-black text-emerald-400 uppercase tracking-widest">
                        ✓ PRE-FLIGHT PASSED — Robot starting
                      </p>
                    </div>
                    {preFlightWarnings.map((w, i) => (
                      <div key={i} className="w-full py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs font-bold text-amber-400">⚠ {w}</p>
                      </div>
                    ))}
                  </div>
                )}
                {preFlightStatus === 'failed' && (
                  <div className="space-y-1.5">
                    <div className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40">
                      <p className="text-center text-xs font-black text-rose-400 uppercase tracking-widest">
                        🚫 PRE-FLIGHT FAILED — Robot blocked
                      </p>
                    </div>
                    {preFlightErrors.map((e, i) => (
                      <div key={i} className="w-full py-2 px-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <p className="text-xs font-bold text-rose-400 whitespace-pre-line">✗ {e}</p>
                      </div>
                    ))}
                    {preFlightWarnings.map((w, i) => (
                      <div key={i} className="w-full py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs font-bold text-amber-400">⚠ {w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── COMPLETION MODE: big AUTO / MANUAL toggle ── */}
                <div className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Completion Mode</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setMoveModeBoth('manual')}
                      className={`py-5 rounded-xl text-base font-black uppercase tracking-widest transition-colors ${moveMode === 'manual' ? 'bg-cyan-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      🖐️ Manual
                    </button>
                    <button
                      onClick={() => setMoveModeBoth('auto')}
                      className={`py-5 rounded-xl text-base font-black uppercase tracking-widest transition-colors ${moveMode === 'auto' ? 'bg-emerald-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      ⚡ Auto
                    </button>
                  </div>
                  {moveMode === 'auto' ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                        When an export finishes, files auto-move to STABILIZED{mediaToggleOn ? ', Media' : ''}{bellaToggleOn ? ', Bella' : ''}, then the card auto-completes and advances — no clicks. Stops &amp; alerts if any step fails (card stays open). <span className="text-slate-400">Dumping raws is always a separate, manual click.</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Manual: you click Move / Copy / Complete yourself. Switch to Auto to deliver &amp; complete each card hands-free.
                    </p>
                  )}
                  {moveMode === 'auto' && autoChainStatus !== 'idle' && (
                    <div className={`rounded-xl px-3 py-2 text-xs font-bold ${autoChainStatus === 'error' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : autoChainStatus === 'done' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse'}`}>
                      {autoChainStatus === 'running' ? '⚙️ ' : autoChainStatus === 'done' ? '✓ ' : '✗ '}{autoChainStep}
                    </div>
                  )}
                </div>

                {/* ── HORIZON LOCK — GoPro export setting toggled by the robot ── */}
                <div className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-slate-300">Horizon Lock</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">When ON, the robot turns on Horizon Lock in the GoPro batch exporter before exporting.</p>
                    </div>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, horizonLock: !prev.horizonLock }))}
                      className={`shrink-0 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition border-2 ${
                        config.horizonLock
                          ? 'bg-sky-500 text-slate-950 border-sky-500 shadow-[0_0_18px_rgba(14,165,233,0.4)]'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {config.horizonLock ? '🌐 ON' : 'OFF'}
                    </button>
                  </div>
                  {config.horizonLock && !config.robotCoords?.horizonLock && (
                    <p className="text-[11px] font-bold text-amber-400">
                      ⚠ Re-run 🎯 Calibrate GoPro Robot in Setup to capture the Horizon Lock click point — it won’t toggle until then.
                    </p>
                  )}
                </div>

                <button
                  onClick={handleRunRobot}
                  disabled={goProRobotStatus === 'running'}
                  className="btn-run-robot w-full py-4 text-lg uppercase tracking-widest rounded-2xl transition-colors"
                >
                  🤖 AUTO-RUN GOPRO BATCH
                </button>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <HelpButton id="goproRobot" size="md" />
                  <HelpButton id="unGain" />
                </div>
                <p className="text-center text-[10px] text-rose-400 font-black leading-relaxed">
                  ⚠️ WARNING: Takes over mouse/keyboard. Do not touch your computer while running!
                </p>

                {goProRobotStatus === 'running' && (
                  <div className="w-full py-3 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 animate-pulse">
                    <p className="text-center text-sm font-black text-amber-400 uppercase tracking-widest">
                      🤖 ROBOT IS RUNNING — DO NOT TOUCH MOUSE OR KEYBOARD
                    </p>
                  </div>
                )}
                {goProRobotStatus === 'success' && moveExportsStatus !== 'success' && (
                  <div className="w-full py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                    <p className="text-center text-sm font-black text-emerald-400 uppercase tracking-widest">
                      {goProExportStatus === 'complete'
                        ? '✓ GoPro export complete — move files below'
                        : '✓ Robot clicked Start — monitoring export...'}
                    </p>
                  </div>
                )}
                {goProRobotStatus === 'success' && moveExportsStatus === 'success' && (
                  <div className="w-full py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                    <p className="text-center text-sm font-black text-emerald-400 uppercase tracking-widest">
                      ✓ GoPro export sequence completed
                    </p>
                  </div>
                )}
                {goProRobotStatus === 'error' && (
                  <div className="w-full py-3 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40 space-y-1">
                    {goProRobotError?.includes('Export Queue window not found') ? (
                      <>
                        <p className="text-center text-sm font-black text-rose-400 uppercase tracking-widest">
                          ✗ GoPro Batch Exporter is not open
                        </p>
                        <p className="text-center text-xs font-bold text-rose-300">
                          Open GoPro Player → Batch Exporter manually, then run the robot again
                        </p>
                      </>
                    ) : (
                      <p className="text-center text-sm font-black text-rose-400 uppercase tracking-widest">
                        ✗ Robot failed — check GoPro Player and recalibrate
                      </p>
                    )}
                  </div>
                )}

                {/* EXPORT WAITING / PROGRESS PANEL */}
                {goProRobotStatus === 'success' && moveExportsStatus !== 'success' && robotStartTime !== null && (
                  <div className="space-y-3 pt-2">

                    {/* Polling in progress */}
                    {(goProExportStatus === 'idle' || goProExportStatus === 'polling') && (
                      <div className="w-full py-3 px-4 rounded-xl bg-amber-500/15 border border-amber-500/30 animate-pulse">
                        <p className="text-center text-sm font-black text-amber-400 uppercase tracking-widest">
                          {goProExportProgress
                            ? `⏳ EXPORTING... ${goProExportProgress.countLabel} — ${goProExportProgress.totalSizeMB.toLocaleString()} MB`
                            : '⏳ WAITING FOR GOPRO EXPORT TO START...'}
                        </p>
                        <p className="text-center text-[10px] text-slate-400 mt-1 font-mono truncate">
                          Monitoring: {config.goProOutputPath || 'C:\\Users\\Jason\\Videos'}
                        </p>
                      </div>
                    )}

                    {/* Export complete — show move button */}
                    {goProExportStatus === 'complete' && (
                      <>
                        <div className="w-full py-3 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                          <p className="text-center text-sm font-black text-emerald-400 uppercase tracking-widest">
                            ✅ EXPORT COMPLETE — {goProExportProgress?.countLabel ?? 'files ready'}
                          </p>
                          <p className="text-center text-[10px] text-slate-400 mt-1 font-mono truncate">
                            {goProExportProgress && goProExportProgress.totalSizeMB > 0
                              ? `${goProExportProgress.totalSizeMB.toLocaleString()} MB detected`
                              : 'Files are stable and ready to move'}
                          </p>
                        </div>
                        <button
                          onClick={handleMoveExports}
                          disabled={moveExportsStatus === 'moving'}
                          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-colors"
                        >
                          {moveExportsStatus === 'moving' ? '⏳ MOVING FILES...' : '✅ MOVE FILES TO STABILIZED FOLDER'}
                        </button>
                        <div className="flex justify-center mt-1"><HelpButton id="moveExports" size="md" /></div>
                      </>
                    )}

                    {/* Export monitoring timed out or errored */}
                    {goProExportStatus === 'error' && (
                      <div className="w-full py-3 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40 space-y-2">
                        <p className="text-center text-sm font-black text-rose-400 uppercase tracking-widest">
                          ✗ EXPORT MONITORING FAILED
                        </p>
                        <p className="text-center text-xs text-rose-300 font-mono">{goProExportError}</p>
                        <button
                          onClick={handleMoveExports}
                          disabled={moveExportsStatus === 'moving'}
                          className="w-full py-3 bg-rose-900/40 hover:bg-rose-900/60 disabled:opacity-50 text-rose-300 font-black text-sm uppercase tracking-widest rounded-xl transition-colors"
                        >
                          {moveExportsStatus === 'moving' ? '⏳ MOVING FILES...' : 'MOVE FILES MANUALLY'}
                        </button>
                      </div>
                    )}

                    {moveExportsStatus === 'error' && (
                      <div className="w-full py-2 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40">
                        <p className="text-center text-xs font-black text-rose-400">✗ {moveExportsError}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* MOVE COMPLETE RESULT */}
                {moveExportsStatus === 'success' && moveExportsResult && (
                  <div className="space-y-2 pt-2">
                    <div className="w-full py-2 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                      <p className="text-center text-sm font-black text-emerald-400 uppercase tracking-widest">
                        ✓ Moved {moveExportsResult.moved} file{moveExportsResult.moved !== 1 ? 's' : ''} to STABILIZED folder
                      </p>
                      {moveExportsResult.totalGB !== undefined && (
                        <p className="text-center text-xs font-black text-cyan-400 mt-1">
                          Card folder total: {moveExportsResult.totalGB.toFixed(2)} GB → Size field updated
                        </p>
                      )}
                    </div>
                    {moveExportsResult.files.length > 0 && (
                      <div className="bg-slate-950 rounded-xl p-3 max-h-28 overflow-y-auto">
                        {moveExportsResult.files.map((f, i) => (
                          <p key={i} className="text-[10px] font-mono text-slate-400 truncate">{f}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* DELIVERY BUTTONS — Copy to Media Drive + Copy to Bella Drive */}
                {goProRobotStatus === 'success' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                      DELIVER TO DRIVES
                    </p>

                    {/* COPY TO MEDIA DRIVE */}
                    {(config.driveToggles?.mediaDrive ?? true) && (
                    <div className="space-y-1.5">
                      <button
                        disabled={moveExportsStatus !== 'success' || mediaDriveCopyStatus === 'copying'}
                        onClick={handleCopyToMediaDrive}
                        className={`w-full py-3 px-6 rounded-full font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          mediaDriveCopyStatus === 'success'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white text-slate-950 hover:bg-slate-100'
                        }`}
                      >
                        {mediaDriveCopyStatus === 'copying'
                          ? '⏳ COPYING TO MEDIA...'
                          : mediaDriveCopyStatus === 'success'
                          ? '✓ COPIED TO MEDIA DRIVE'
                          : 'COPY TO MEDIA DRIVE'}
                      </button>
                      <div className="flex justify-center"><HelpButton id="copyToMedia" size="md" /></div>
                      {mediaDriveCopyStatus === 'copying' && mediaDriveCopyProgress !== null && (
                        <div className="relative bg-slate-950 rounded-xl h-7 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                            style={{ width: `${mediaDriveCopyProgress}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-amber-400">
                            {Math.round(mediaDriveCopyProgress)}%
                          </span>
                        </div>
                      )}
                      {mediaDriveCopyStatus === 'success' && mediaDriveCopyResult && (
                        <p className="text-center text-[10px] font-mono text-emerald-400">
                          {currentCardId} copied to Media Drive ✓ — RAW + STABILIZED — {mediaDriveCopyResult.fileCount} files / {mediaDriveCopyResult.sizeGB}
                        </p>
                      )}
                      {mediaDriveCopyStatus === 'error' && mediaDriveCopyError && (
                        <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {mediaDriveCopyError}</p>
                      )}
                    </div>
                    )}

                    {/* COPY TO BELLA DRIVE */}
                    {(config.driveToggles?.bellaDrive ?? true) && (
                    <div className="space-y-1.5">
                      <button
                        disabled={moveExportsStatus !== 'success' || bellaDriveCopyStatus === 'copying'}
                        onClick={handleCopyToBellaDrive}
                        className={`w-full py-3 px-6 rounded-full font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          bellaDriveCopyStatus === 'success'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white text-slate-950 hover:bg-slate-100'
                        }`}
                      >
                        {bellaDriveCopyStatus === 'copying'
                          ? '⏳ COPYING TO BELLA...'
                          : bellaDriveCopyStatus === 'success'
                          ? '✓ COPIED TO BELLA DRIVE'
                          : 'COPY TO BELLA DRIVE'}
                      </button>
                      <div className="flex justify-center"><HelpButton id="copyToBella" size="md" /></div>
                      {bellaDriveCopyStatus === 'copying' && bellaDriveCopyProgress !== null && (
                        <div className="relative bg-slate-950 rounded-xl h-7 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                            style={{ width: `${bellaDriveCopyProgress}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-violet-300">
                            {Math.round(bellaDriveCopyProgress)}%
                          </span>
                        </div>
                      )}
                      {bellaDriveCopyStatus === 'success' && bellaDriveCopyResult && (
                        <p className="text-center text-[10px] font-mono text-emerald-400">
                          STABILIZED → Bella Drive ✓ — Folder: {bellaDriveCopyResult.artistName} — {bellaDriveCopyResult.fileCount} files / {bellaDriveCopyResult.sizeGB}
                        </p>
                      )}
                      {bellaDriveCopyStatus === 'error' && bellaDriveCopyError && (
                        <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {bellaDriveCopyError}</p>
                      )}
                    </div>
                    )}
                  </div>
                )}

                {/* CLEAR SD CARD — only after footage is safely moved to STABILIZED */}
                {moveExportsStatus === 'success' && (
                  <div className="space-y-1.5 pt-3 border-t border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                      SD CARD
                    </p>
                    <button
                      disabled={sdDeleteStatus === 'deleting'}
                      onClick={handleDeleteSdFiles}
                      className={`w-full py-3 px-6 rounded-full font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                        sdDeleteStatus === 'success'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-rose-900 text-rose-200 hover:bg-rose-800'
                      }`}
                    >
                      {sdDeleteStatus === 'deleting'
                        ? '⏳ DELETING SD FILES...'
                        : sdDeleteStatus === 'success'
                        ? '✓ SD CARD CLEARED'
                        : `🗑 DELETE RAW FILES FROM SD (${config.sdCardDrive})`}
                    </button>
                    {sdDeleteStatus === 'success' && sdDeleteResult && (
                      <p className="text-center text-[10px] font-mono text-rose-300">
                        Deleted {sdDeleteResult.deletedCount} file{sdDeleteResult.deletedCount !== 1 ? 's' : ''} — freed {sdDeleteResult.freedGB} GB
                      </p>
                    )}
                    {sdDeleteStatus === 'error' && sdDeleteError && (
                      <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {sdDeleteError}</p>
                    )}
                  </div>
                )}

                {goProQueueCleared && (
                  <div className="w-full py-2 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                    <p className="text-center text-xs font-black text-emerald-400 uppercase tracking-widest">
                      ✓ Queue cleared — ready for next batch
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setGoProRobotStatus('idle');
                      setGoProRobotError(null);
                      setGoProExportStatus('idle');
                      setGoProExportProgress(null);
                      setGoProExportError(null);
                      setMoveExportsStatus('idle');
                      setMoveExportsResult(null);
                      setMoveExportsError(null);
                      setRobotStartTime(null);
                      setSdDeleteStatus('idle');
                      setSdDeleteResult(null);
                      setSdDeleteError(null);
                      setPreFlightStatus('idle');
                      setPreFlightErrors([]);
                      setPreFlightWarnings([]);
                    }}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-sm uppercase tracking-widest rounded-xl transition"
                  >
                    🔄 RESET MODULE
                  </button>
                </div>

              </div>

              <div className="flex-[45] min-w-0 shrink-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-4 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-black">CODEC</span>
                    <strong className="text-white text-base">HEVC 10-Bit</strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-black">ASPECT RATIO</span>
                    <strong className="text-white text-base">8:7 view</strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-black">SMOOTHNESS</span>
                    <strong className="text-white text-base">15</strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl text-center">
                    <span className="text-[10px] text-slate-500 block uppercase font-black">CROPPING</span>
                    <strong className="text-white text-base">15</strong>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Stabilization Settings</span>
                  <HelpButton id="goproSettings" />
                </div>
              </div>
              </div>

              <div className="bg-amber-400/5 rounded-xl p-4 text-amber-200 text-xs font-semibold leading-relaxed">
                📢 <strong className="text-amber-400">BATCH WARNING:</strong> Select all tracks before modifying defaults! Highlight files and hit <kbd className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-[10px] font-black">Ctrl + A</kbd> inside export window first.
              </div>
            </div>

          {/* MASTER CARD PROGRESS TRIGGER */}
          <button
            onClick={handleCompleteCard}
            disabled={activeAssignmentName === "NO ASSIGNMENTS IN QUEUE"}
            className="btn-complete-card w-full py-6 text-xl tracking-widest font-black uppercase text-center flex flex-col items-center justify-center gap-1 transition active:scale-95"
          >
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">SOP DELY METRICS CHECKED & VERIFIED ACCURATE</span>
            <span className="flex items-center gap-2">🚀 COMPLETE CURRENT CARD & SHIFT TO NEXT</span>
          </button>
          <div className="flex justify-center"><HelpButton id="completeCard" size="md" /></div>

          {/* SESSION DATABASE LOG */}
          <div className="bg-slate-900 rounded-3xl p-6 shadow-xl space-y-5">

            {/* Header: title + session counters + reset */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <List className="w-4 h-4 text-cyan-400" /> Session Card Log
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2 text-[10px] font-black font-mono">
                  <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-emerald-400">{statistics.completedCount} DONE</span>
                  <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-slate-400">{statistics.skippedCount} SKIP</span>
                  <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-rose-400">{statistics.mixedCount} FLAGGED</span>
                </div>
                <button
                  onClick={() => {
                    const lines = history.filter(h => h.status === 'Complete').map(h => h.mediaMasterLine).join('\n');
                    handleCopyText(lines, 'copy_all_complete');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition border ${copiedStates['copy_all_complete'] ? 'bg-emerald-500 text-slate-950 border-emerald-500' : 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10'}`}
                >
                  {copiedStates['copy_all_complete'] ? '✓ COPIED' : '📋 COPY ALL'}
                </button>
                <button
                  onClick={handleResetWorkflow}
                  className="px-3 py-1.5 bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 font-extrabold rounded-lg text-[10px] border border-rose-950/50 uppercase tracking-wider"
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Pilot filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">Filter:</span>
              <button
                onClick={() => setHistoryPilotFilter('ALL')}
                className={`px-4 py-1.5 rounded-full text-xs font-black transition ${historyPilotFilter === 'ALL' ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                ALL
              </button>
              {(config.pilots || []).map((pilot, idx) => (
                <button
                  key={idx}
                  onClick={() => setHistoryPilotFilter(pilot.name)}
                  className={`px-4 py-1.5 rounded-full text-xs font-black transition ${historyPilotFilter === pilot.name ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {pilot.cardPrefix.toUpperCase()} — {pilot.name}
                </button>
              ))}
              {historyPilotFilter !== 'ALL' && (
                <button
                  onClick={() => setHistoryPilotFilter('ALL')}
                  className="px-3 py-1 rounded-full text-[10px] font-black text-slate-500 hover:text-slate-300 border border-slate-700 transition"
                >
                  ✕ Clear Filter
                </button>
              )}
            </div>

            {/* Table */}
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 bg-slate-950 rounded-xl">
                <p className="font-extrabold text-sm mb-1 text-slate-400">
                  {history.length === 0 ? 'No cards logged yet' : 'No cards match this filter'}
                </p>
                <p>{history.length === 0 ? 'Complete card transitions above to automatically log entries here' : 'Select ALL or a different pilot'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-slate-950 rounded-xl">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                      <th className="p-3">Card ID</th>
                      <th className="p-3">Pilot</th>
                      <th className="p-3">Artist</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Notes</th>
                      <th className="p-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {filteredHistory.map((card, idx) => (
                      <tr key={`${card.id}-${idx}`} className="hover:bg-slate-900/40 font-mono">
                        <td className="p-3 text-amber-400 font-black">{card.id}</td>
                        <td className="p-3 text-slate-300 font-bold">{card.pilot}</td>
                        <td className="p-3 text-slate-100 font-bold truncate max-w-[180px] select-all">{card.assignment}</td>
                        <td className="p-3 text-cyan-400 font-extrabold">{card.size}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-black tracking-widest ${
                            card.status === 'Complete' ? 'bg-emerald-500/10 text-emerald-400' :
                            card.status === 'Skip' ? 'bg-slate-800 text-slate-400' :
                            'bg-red-500/10 text-rose-400'
                          }`}>
                            {card.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">{card.timestamp}</td>
                        <td className="p-3 text-slate-500 font-mono max-w-[130px] truncate" title={card.notes || ''}>
                          {card.notes ? (card.notes.length > 40 ? card.notes.slice(0, 40) + '…' : card.notes) : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Copy Google Sheets row"
                              onClick={() => {
                                const rowLine = card.mediaMasterLine || `${card.id}\t${card.size}\t${card.assignment}\t${card.notes}`;
                                navigator.clipboard.writeText(rowLine);
                                setCopiedStates(prev => ({ ...prev, [`row_${card.id}_${idx}`]: true }));
                                setTimeout(() => setCopiedStates(prev => ({ ...prev, [`row_${card.id}_${idx}`]: false })), 1500);
                              }}
                              className="text-cyan-600 hover:text-white cursor-pointer px-2 py-1 bg-slate-900 rounded transition text-xs"
                            >
                              {copiedStates[`row_${card.id}_${idx}`] ? '✓' : '📋'}
                            </button>
                            <button onClick={() => deleteHistoryItem(card)} className="text-rose-500 hover:text-rose-300 font-extrabold px-2 py-1 bg-slate-900 rounded">
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}



          </div>

        </div>

        </>) : (
          <div className="w-full flex flex-col gap-8 flex-grow">

            {/* Simple Mode — Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* LEFT: Card Setup */}
              <div className="bg-slate-900 rounded-3xl p-8 space-y-6 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest">1. CARD SETUP</h3>
                    <span className="text-[10px] bg-cyan-400/10 text-cyan-400 px-3 py-1 rounded font-black uppercase border border-cyan-400/20">
                      {config.eventName || 'EVENT'}
                    </span>
                  </div>

                  {/* Folder Name Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Folder Name</label>
                    <input
                      type="text"
                      value={simpleFolderName}
                      onChange={e => { setSimpleFolderName(e.target.value); setSimpleFolderNameError(''); }}
                      placeholder="Type folder name... (e.g. Tiesto, FPV_Day2, 07-18-2025)"
                      className="w-full bg-slate-950 rounded-xl px-4 py-4 text-lg text-cyan-300 font-mono font-black focus:ring-2 focus:ring-cyan-400 border-none"
                    />
                    {simpleFolderNameError && (
                      <p className="text-xs font-black text-rose-400">{simpleFolderNameError}</p>
                    )}
                  </div>

                  {/* Drive Toggles */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSimpleMediaEnabled(v => !v)}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider border transition ${simpleMediaEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                      >
                        {simpleMediaEnabled ? 'ON' : 'OFF'}
                      </button>
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Media Drive — RAW + STABILIZED → <span className="text-slate-500 font-mono">{config.mediaRootPath || 'M:'}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSimpleBellaEnabled(v => !v)}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider border transition ${simpleBellaEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                      >
                        {simpleBellaEnabled ? 'ON' : 'OFF'}
                      </button>
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Bella Drive — STABILIZED only → <span className="text-slate-500 font-mono">{config.bellaRootPath || 'S:'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Live Path Preview */}
                  <div className="space-y-1.5 bg-slate-950 rounded-xl p-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">LIVE PATH PREVIEW</p>
                    <p className="text-[10px] font-mono text-cyan-400 break-all">RAW: <span className="text-slate-300">{simpleLocalRawPath}</span></p>
                    <p className="text-[10px] font-mono text-cyan-400 break-all">STAB: <span className="text-slate-300">{simpleLocalStabPath}</span></p>
                    {simpleMediaEnabled && (
                      <p className="text-[10px] font-mono text-amber-400 break-all">MEDIA: <span className="text-slate-300">{simpleMediaPath}</span></p>
                    )}
                    {simpleBellaEnabled && (
                      <p className="text-[10px] font-mono text-violet-400 break-all">BELLA: <span className="text-slate-300">{simpleBellaPath}</span></p>
                    )}
                  </div>

                  {/* Clear Folder Name */}
                  <button
                    onClick={() => {
                      setSimpleFolderName('');
                      setSimpleFolderNameError('');
                      localStorage.removeItem('fpv_boss_simple_folder_name');
                    }}
                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-xs uppercase tracking-widest rounded-xl transition"
                  >
                    ✕ CLEAR FOLDER NAME
                  </button>
              </div>

              {/* 2. WORKFLOW — right cell, everything in one place */}
              <div className="bg-slate-900 rounded-3xl p-8 space-y-4 shadow-xl">
                  <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest border-b border-slate-800 pb-4">
                    2. WORKFLOW
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={handleSimpleCreateFolders}
                      disabled={simpleFolderStatus === 'creating'}
                      className={`w-full py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 ${
                        simpleFolderStatus === 'done'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200'
                      }`}
                    >
                      {simpleFolderStatus === 'creating' ? '⏳ CREATING...' : simpleFolderStatus === 'done' ? '✓ FOLDERS CREATED' : '📁 CREATE FOLDERS'}
                    </button>
                    <div className="flex justify-center"><HelpButton id="createFolders" /></div>

                    <button
                      disabled={copyProgress !== null}
                      onClick={async () => {
                        if (!simpleFolderName.trim()) { setSimpleFolderNameError('Enter a folder name first'); return; }
                        setSimpleFolderNameError('');
                        setSdCopyResult(null);
                        setCopyProgress(0);
                        try {
                          const result = await copySDtoRAW(config.sdCardDrive, simpleLocalRawPath);
                          setCopyProgress(100);
                          if (result.success && result.sourceFileCount !== undefined && result.fileCount !== undefined && result.sizeGB !== undefined && result.matched !== undefined) {
                            setSdCopyResult({ sourceFileCount: result.sourceFileCount, fileCount: result.fileCount, sizeGB: result.sizeGB, matched: result.matched, batchSubfolder: result.batchSubfolder });
                          }
                          if (result.success) setSdBatchRawPath(result.activeRawPath ?? '');
                          setTimeout(() => setCopyProgress(null), 1500);
                        } catch { setCopyProgress(null); }
                      }}
                      className="w-full py-4 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2"
                    >
                      {copyProgress !== null ? `💾 COPYING SD... ${Math.round(copyProgress)}%` : '💾 COPY SD CARD'}
                    </button>
                    <div className="flex justify-center"><HelpButton id="copySdToRaw" /></div>

                    {/* SD COPY PROGRESS BAR (matches festival) */}
                    {copyProgress !== null && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block">
                          SD CARD COPY IN PROGRESS
                        </span>
                        <div className="relative bg-slate-950 rounded-xl h-9 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out"
                            style={{ width: `${copyProgress}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-amber-400 tracking-widest">
                            {Math.round(copyProgress)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* SD COPY VERIFICATION PANEL (matches festival) */}
                    {sdCopyResult !== null && (
                      sdCopyResult.matched ? (
                        <div className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 space-y-0.5">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">✓ COPY VERIFIED</p>
                          <p className="text-xs font-bold text-emerald-300">SD Card: {sdCopyResult.sourceFileCount} files</p>
                          <p className="text-xs font-bold text-emerald-300">Local RAW: {sdCopyResult.fileCount} files — {sdCopyResult.sizeGB}</p>
                          <p className="text-xs font-bold text-emerald-400">Source and destination counts match ✓</p>
                        </div>
                      ) : (
                        <div className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40 space-y-0.5">
                          <p className="text-xs font-black text-rose-400 uppercase tracking-widest">⚠ FILE COUNT MISMATCH</p>
                          <p className="text-xs font-bold text-rose-300">SD Card: {sdCopyResult.sourceFileCount} files</p>
                          <p className="text-xs font-bold text-rose-300">Local RAW: {sdCopyResult.fileCount} files — {sdCopyResult.sizeGB}</p>
                          <p className="text-xs font-bold text-rose-400">Counts do not match. Check for copy errors before running the robot.</p>
                        </div>
                      )
                    )}
                    {sdCopyResult?.batchSubfolder && (
                      <div className="w-full py-2 px-4 rounded-xl bg-cyan-400/10 border border-cyan-500/20">
                        <p className="text-[11px] font-bold text-cyan-300">
                          ↳ Folder already had files — copied into subfolder <span className="font-black">{sdCopyResult.batchSubfolder}</span>. Only these new files will stabilize.
                        </p>
                      </div>
                    )}

                    <button
                      onClick={handleSimpleRunRobot}
                      disabled={goProRobotStatus === 'running'}
                      className="btn-run-robot w-full py-4 text-sm uppercase tracking-widest rounded-2xl transition-colors"
                    >
                      {goProRobotStatus === 'running' ? '🤖 ROBOT RUNNING...' : '🤖 RUN GOPRO ROBOT'}
                    </button>
                    <div className="flex justify-center"><HelpButton id="goproRobot" /></div>

                    {/* GoPro export tracker (inline) */}
                    {goProRobotStatus === 'running' && (
                      <div className="w-full py-2 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 animate-pulse">
                        <p className="text-center text-xs font-black text-amber-400 uppercase tracking-widest">
                          🤖 ROBOT RUNNING — DO NOT TOUCH MOUSE OR KEYBOARD
                        </p>
                      </div>
                    )}
                    {goProRobotStatus === 'error' && (
                      <div className="w-full py-2 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40">
                        <p className="text-center text-xs font-black text-rose-400 uppercase tracking-widest">
                          ✗ Robot failed — check GoPro Player and recalibrate
                        </p>
                      </div>
                    )}
                    {goProRobotStatus === 'success' && moveExportsStatus !== 'success' && robotStartTime !== null && (
                      <>
                        {(goProExportStatus === 'idle' || goProExportStatus === 'polling') && (
                          <div className="w-full py-2 px-4 rounded-xl bg-amber-500/15 border border-amber-500/30 animate-pulse">
                            <p className="text-center text-xs font-black text-amber-400 uppercase tracking-widest">
                              {goProExportProgress
                                ? `⏳ EXPORTING... ${goProExportProgress.countLabel} — ${goProExportProgress.totalSizeMB.toLocaleString()} MB`
                                : '⏳ WAITING FOR GOPRO EXPORT TO START...'}
                            </p>
                          </div>
                        )}
                        {goProExportStatus === 'complete' && (
                          <div className="w-full py-2 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                            <p className="text-center text-xs font-black text-emerald-400 uppercase tracking-widest">
                              ✅ EXPORT COMPLETE — {goProExportProgress?.countLabel ?? 'files ready'}
                            </p>
                          </div>
                        )}
                        {goProExportStatus === 'error' && (
                          <div className="w-full py-2 px-4 rounded-xl bg-rose-500/20 border border-rose-500/40">
                            <p className="text-center text-xs font-black text-rose-400 uppercase tracking-widest">✗ EXPORT MONITORING FAILED</p>
                            {goProExportError && <p className="text-center text-[10px] text-rose-300 font-mono">{goProExportError}</p>}
                          </div>
                        )}
                      </>
                    )}

                    <button
                      onClick={handleSimpleMoveExports}
                      disabled={moveExportsStatus === 'moving' || goProRobotStatus !== 'success' || !robotStartTime}
                      className={`w-full py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                        moveExportsStatus === 'success'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {moveExportsStatus === 'moving' ? '⏳ MOVING FILES...' : moveExportsStatus === 'success' ? '✓ FILES MOVED' : '📦 MOVE FILES'}
                    </button>
                    <div className="flex justify-center"><HelpButton id="moveExports" /></div>

                    {simpleMediaEnabled && (
                      <div className="space-y-1.5">
                        <button
                          disabled={moveExportsStatus !== 'success' || mediaDriveCopyStatus === 'copying'}
                          onClick={handleSimpleCopyToMediaDrive}
                          className={`w-full py-3 px-6 rounded-full font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${mediaDriveCopyStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white text-slate-950 hover:bg-slate-100'}`}
                        >
                          {mediaDriveCopyStatus === 'copying' ? '⏳ COPYING TO MEDIA...' : mediaDriveCopyStatus === 'success' ? '✓ COPIED TO MEDIA DRIVE' : 'COPY TO MEDIA DRIVE'}
                        </button>
                        {mediaDriveCopyStatus === 'copying' && mediaDriveCopyProgress !== null && (
                          <div className="relative bg-slate-950 rounded-xl h-7 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out" style={{ width: `${mediaDriveCopyProgress}%` }} />
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-amber-400">{Math.round(mediaDriveCopyProgress)}%</span>
                          </div>
                        )}
                        {mediaDriveCopyStatus === 'success' && mediaDriveCopyResult && (
                          <p className="text-center text-[10px] font-mono text-emerald-400">{sanitizedSimpleFolder} → Media Drive ✓ — {mediaDriveCopyResult.fileCount} files / {mediaDriveCopyResult.sizeGB}</p>
                        )}
                        {mediaDriveCopyStatus === 'error' && mediaDriveCopyError && (
                          <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {mediaDriveCopyError}</p>
                        )}
                      </div>
                    )}

                    {simpleBellaEnabled && (
                      <div className="space-y-1.5">
                        <button
                          disabled={moveExportsStatus !== 'success' || bellaDriveCopyStatus === 'copying'}
                          onClick={handleSimpleCopyToBellaDrive}
                          className={`w-full py-3 px-6 rounded-full font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${bellaDriveCopyStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white text-slate-950 hover:bg-slate-100'}`}
                        >
                          {bellaDriveCopyStatus === 'copying' ? '⏳ COPYING TO BELLA...' : bellaDriveCopyStatus === 'success' ? '✓ COPIED TO BELLA DRIVE' : 'COPY TO BELLA DRIVE'}
                        </button>
                        {bellaDriveCopyStatus === 'copying' && bellaDriveCopyProgress !== null && (
                          <div className="relative bg-slate-950 rounded-xl h-7 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 progress-gradient transition-all duration-300 ease-out" style={{ width: `${bellaDriveCopyProgress}%` }} />
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-violet-300">{Math.round(bellaDriveCopyProgress)}%</span>
                          </div>
                        )}
                        {bellaDriveCopyStatus === 'success' && bellaDriveCopyResult && (
                          <p className="text-center text-[10px] font-mono text-emerald-400">STABILIZED → Bella Drive ✓ — {bellaDriveCopyResult.artistName} — {bellaDriveCopyResult.fileCount} files / {bellaDriveCopyResult.sizeGB}</p>
                        )}
                        {bellaDriveCopyStatus === 'error' && bellaDriveCopyError && (
                          <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {bellaDriveCopyError}</p>
                        )}
                      </div>
                    )}

                    {/* CLEAR SD CARD — only after footage is moved to STABILIZED */}
                    {moveExportsStatus === 'success' && (
                      <div className="space-y-1.5 pt-1">
                        <button
                          disabled={sdDeleteStatus === 'deleting'}
                          onClick={handleDeleteSdFiles}
                          className={`w-full py-3 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                            sdDeleteStatus === 'success'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-rose-900 text-rose-200 hover:bg-rose-800'
                          }`}
                        >
                          {sdDeleteStatus === 'deleting'
                            ? '⏳ DELETING SD FILES...'
                            : sdDeleteStatus === 'success'
                            ? '✓ SD CARD CLEARED'
                            : `🗑 DELETE RAW FILES FROM SD (${config.sdCardDrive})`}
                        </button>
                        {sdDeleteStatus === 'success' && sdDeleteResult && (
                          <p className="text-center text-[10px] font-mono text-rose-300">
                            Deleted {sdDeleteResult.deletedCount} file{sdDeleteResult.deletedCount !== 1 ? 's' : ''} — freed {sdDeleteResult.freedGB} GB
                          </p>
                        )}
                        {sdDeleteStatus === 'error' && sdDeleteError && (
                          <p className="text-center text-[10px] font-mono text-rose-400 break-all">✗ {sdDeleteError}</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleSimpleLogCard}
                      className="w-full py-5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm uppercase tracking-widest rounded-2xl transition flex items-center justify-center gap-2 active:scale-95"
                    >
                      ✅ LOG CARD + NEXT
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setGoProRobotStatus('idle'); setGoProRobotError(null);
                        setGoProExportStatus('idle'); setGoProExportProgress(null); setGoProExportError(null);
                        setMoveExportsStatus('idle'); setMoveExportsResult(null); setMoveExportsError(null);
                        setRobotStartTime(null); setSimpleFolderStatus('idle');
                        setMediaDriveCopyStatus('idle'); setMediaDriveCopyProgress(null); setMediaDriveCopyResult(null); setMediaDriveCopyError(null);
                        setBellaDriveCopyStatus('idle'); setBellaDriveCopyProgress(null); setBellaDriveCopyResult(null); setBellaDriveCopyError(null);
                        setSdDeleteStatus('idle'); setSdDeleteResult(null); setSdDeleteError(null);
                        setSdCopyResult(null); setCopyProgress(null);
                      }}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-xs uppercase tracking-widest rounded-xl transition"
                    >
                      🔄 RESET MODULE
                    </button>
                  </div>
                </div>
            </div>

            {/* 4. SESSION LOG */}
            <div className="bg-slate-900 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                  <List className="w-4 h-4 text-cyan-400" /> 3. SESSION LOG
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-black text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg font-mono">
                    {simpleSessionLog.length} CARDS
                  </span>
                  {simpleSessionLog.length > 0 && (
                    <button
                      onClick={() => {
                        const summary = simpleSessionLog
                          .map(e => `${e.timestamp}\t${e.cardId}\t${e.artist}\t${e.showName}`)
                          .join('\n');
                        handleCopyText(summary, 'simple_summary');
                      }}
                      className={`px-4 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition ${
                        copiedStates['simple_summary'] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {copiedStates['simple_summary'] ? '✓ COPIED' : '📋 COPY SUMMARY'}
                    </button>
                  )}
                  {simpleSessionLog.length > 0 && (
                    <button
                      onClick={() => { if (confirm('Clear entire session log?')) { setSimpleSessionLog([]); localStorage.removeItem('fpv_boss_simple_log'); } }}
                      className="px-4 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 border border-rose-950/50 transition"
                    >
                      🗑 CLEAR LOG
                    </button>
                  )}
                </div>
              </div>

              {simpleSessionLog.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 bg-slate-950 rounded-xl">
                  <p className="font-extrabold text-sm mb-1 text-slate-400">No cards logged yet</p>
                  <p>Use LOG CARD above to add entries</p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-slate-950 rounded-xl">
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                        <th className="p-3">Time</th>
                        <th className="p-3">Card ID</th>
                        <th className="p-3">Artist</th>
                        <th className="p-3">Show</th>
                        <th className="p-3">Pilot</th>
                        <th className="p-3 text-right">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {simpleSessionLog.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40 font-mono">
                          <td className="p-3 text-slate-500">{entry.timestamp}</td>
                          <td className="p-3 text-cyan-400 font-black">{entry.cardId}</td>
                          <td className="p-3 text-slate-100 font-bold truncate max-w-[200px] select-all">{entry.artist}</td>
                          <td className="p-3 text-slate-400">{entry.showName}</td>
                          <td className="p-3 text-slate-400">{entry.pilotName}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setSimpleSessionLog(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-300 font-extrabold px-2 py-1 bg-slate-900 rounded"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* COMPACT FOOTER */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-5 text-center text-[10px] text-slate-500 font-mono tracking-wider">
        FPV CARD BOSS APPLET • Built for Late-Night Stabilizer & Social Media Operations • EDC 2026 Shift Prototype
      </footer>

      {/* DUPLICATE CARD WARNING MODAL */}
      {duplicateCardWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-rose-500/30 p-8 space-y-6">
            <div className="space-y-3">
              <h2 className="text-xl font-black text-rose-400 uppercase tracking-widest">⚠ DUPLICATE CARD DETECTED</h2>
              <p className="text-sm font-bold text-slate-200">{currentCardId} has already been marked as Complete in this session.</p>
              <p className="text-sm text-slate-400">Processing this card again may overwrite existing files.</p>
              <p className="text-sm text-slate-400">Check your card log below before continuing.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setDuplicateCardWarning(false); setDuplicateCardIntent(null); }}
                className="w-full py-3 px-6 rounded-xl bg-slate-100 text-slate-900 font-black text-sm uppercase tracking-widest hover:bg-white transition"
              >
                GO BACK — I'll check the log
              </button>
              <button
                onClick={() => {
                  const intent = duplicateCardIntent;
                  setDuplicateCardWarning(false);
                  setDuplicateCardIntent(null);
                  if (intent === 'robot') void runRobotConfirmed();
                  if (intent === 'complete') handleCompleteCardConfirmed();
                }}
                className="w-full py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm uppercase tracking-widest transition"
              >
                PROCESS ANYWAY — I know what I'm doing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MANUAL LIST SELECTOR */}
      {isPickerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" id="picker-modal">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black uppercase text-amber-500">Pick Active Segment Shot</h3>
                <p className="text-[10px] text-slate-400">{selectedPilot} • {selectedDaySection}</p>
              </div>
              <button onClick={() => setIsPickerOpen(false)} className="text-slate-400 hover:text-white text-xs bg-slate-900 px-3 py-1.5 rounded-lg border-none">
                Close
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-2 flex-grow">
              {pickerAssignments.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">No assignments for this pilot / day.</p>
              ) : (
                <div className="space-y-2">
                  {pickerAssignments.map((item, idx) => (
                    <div
                      key={`${item.assignment}-${idx}`}
                      onClick={() => handlePickAssignment(item.assignment)}
                      className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl cursor-pointer transition flex items-center justify-between text-left gap-3"
                    >
                      <div>
                        <strong className="text-slate-200 block text-xs tracking-wider">{item.assignment}</strong>
                        {item.notes && <span className="text-[10px] text-slate-500 line-clamp-1 italic mt-0.5">{item.notes}</span>}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {item.isCompleted && (
                          <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/15 px-2 py-1 rounded uppercase tracking-wider">
                            ✓ Done
                          </span>
                        )}
                        <span className="text-[9px] font-mono font-black text-slate-400 bg-slate-900 px-2 py-1 rounded">
                          ⏱️ {item.flyTime || 'ANY'}
                        </span>
                        <span className="text-[10px] font-bold text-amber-400">
                          Select →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-950 p-4 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800">
              <span>Filter day or pilot on dashboard to change lists</span>
              <button onClick={() => setIsPickerOpen(false)} className="px-3 py-1.5 bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold rounded">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ShotListPanel
        isOpen={isShotListOpen}
        onClose={() => setIsShotListOpen(false)}
        assignments={allAssignments}
        pilots={pilots}
        onShotStatusChange={handleShotStatusChange}
      />

      <UserManual isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />

    </div>
  );
}
