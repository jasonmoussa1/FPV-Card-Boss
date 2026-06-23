/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  Music, 
  MapPin, 
  Zap, 
  Lock,
  Unlock,
  Sun,
  Moon,
  Plus,
  Maximize2,
  QrCode,
  X,
  HelpCircle,
  Plane,
  Minus,
  Sparkles,
  Edit3,
  Check
} from 'lucide-react';
import { GoProQR } from './components/GoProQR';
import { MagicNotepad } from './components/MagicNotepad';
import { HelpModal } from './components/HelpModal';
import { useAudioRecorder } from './hooks/useAudioRecorder';

// --- Types ---

type ThemeType = 'vibrant' | 'sunrise' | 'lime' | 'aurora' | 'laser';

interface AppTheme {
  name: string;
  id: ThemeType;
  bgClass: string;
  glowColor: string;
  accentColor: string;
  secondaryColor: string;
}

const THEMES: AppTheme[] = [
  { 
    name: 'Vibrant', 
    id: 'vibrant', 
    bgClass: 'edm-vibrant-bg', 
    glowColor: 'rgba(0, 255, 255, 0.95)', 
    accentColor: 'text-neon-cyan', 
    secondaryColor: 'bg-neon-magenta shadow-[0_0_20px_rgba(255,0,255,0.6)]' 
  },
  { 
    name: 'Aurora', 
    id: 'aurora', 
    bgClass: 'aurora-theme-bg', 
    glowColor: 'rgba(0, 255, 180, 0.95)', 
    accentColor: 'text-emerald-300', 
    secondaryColor: 'bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]' 
  },
  { 
    name: 'Sunrise', 
    id: 'sunrise', 
    bgClass: 'sunrise-theme-bg', 
    glowColor: 'rgba(255, 200, 0, 0.95)', 
    accentColor: 'text-yellow-400', 
    secondaryColor: 'bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.6)]' 
  },
  { 
    name: 'Lime', 
    id: 'lime', 
    bgClass: 'lime-theme-bg', 
    glowColor: 'rgba(100, 255, 0, 0.95)', 
    accentColor: 'text-lime-300', 
    secondaryColor: 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]' 
  },
  { 
    name: 'Laser', 
    id: 'laser', 
    bgClass: 'laser-theme-bg', 
    glowColor: 'rgba(0, 255, 100, 0.95)', 
    accentColor: 'text-green-400', 
    secondaryColor: 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)]' 
  }
];

interface FlightMetadata {
  artist: string;
  pilot: string;
  festival: string;
  location: string;
  flight: number;
}

// --- Hooks ---

function useClock() {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    let frameId: number;
    const update = () => {
      setTime(new Date());
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, []);
  
  return time;
}

function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

function ClockDisplay() {
  const now = useClock();
  
  const formatTime = (date: Date) => {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return { hh, mm, ss, ms };
  };

  const { hh, mm, ss, ms } = formatTime(now);
  const dateString = now.toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <div className="glass-panel rounded-2xl sm:rounded-[32px] p-4 sm:p-8 relative group shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-neon-cyan" />
          <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-[0.3em] opacity-50 font-bold">World Clock Master</span>
        </div>
        <div className="text-[8px] sm:text-[10px] font-mono text-neon-magenta">SYNC_OK</div>
      </div>
      <div className="flex items-baseline justify-center gap-1 font-mono text-4xl sm:text-6xl font-black tracking-tighter glow-text">
        <span>{hh}</span>
        <span className="opacity-30 group-hover:opacity-80 transition-opacity">:</span>
        <span>{mm}</span>
        <span className="opacity-30 group-hover:opacity-80 transition-opacity">:</span>
        <span>{ss}</span>
        <span className="opacity-30 group-hover:opacity-80 transition-opacity">.</span>
        <span className="text-[0.6em] text-neon-cyan/80">{ms}</span>
      </div>
      <div className="mt-2 sm:mt-4 text-center text-[10px] sm:text-xs opacity-40 font-mono tracking-widest uppercase">{dateString}</div>
    </div>
  );
}

function SlateMode({ 
  metadata, 
  isDarkMode, 
  isLocked, 
  setIsLocked, 
  setIsDisplayMode,
  activeTheme,
  setIsQREnlarged,
  handleMetadataChange,
  recorder
}: { 
  metadata: FlightMetadata; 
  isDarkMode: boolean; 
  isLocked: boolean; 
  setIsLocked: (v: boolean) => void;
  setIsDisplayMode: (v: boolean) => void;
  activeTheme: AppTheme;
  setIsQREnlarged: (v: boolean) => void;
  handleMetadataChange: (key: keyof FlightMetadata, value: any) => void;
  recorder: ReturnType<typeof useAudioRecorder>;
}) {
  const now = useClock();

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };
  
  const formatTime = (date: Date) => {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return { hh, mm, ss, ms };
  };

  const { hh, mm, ss, ms } = formatTime(now);

  return (
    <motion.div 
      key="slate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative flex h-[100dvh] w-full flex-col overflow-hidden items-center justify-center safe-area-padding p-0.5 sm:p-2
        ${isDarkMode ? `dark ${activeTheme.bgClass}` : 'light bg-white'}
      `}
    >
      <div className={`relative z-10 flex h-[94%] w-[96%] max-w-7xl flex-col rounded-[12px] sm:rounded-[48px] p-2 sm:p-6 pb-2 sm:pb-8 landscape:flex
        ${isDarkMode 
            ? `glass-panel border-white/20 bg-black/40 shadow-[0_0_50px_rgba(0,0,0,0.5)]` 
            : 'glass-panel border-black/30 bg-white/95'} 
        transition-all duration-500 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background Elements */}
        <div className={`absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none ${isDarkMode ? 'block' : 'hidden'}`}>
           <div className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,${activeTheme.glowColor}_0%,transparent_70%)]`} />
        </div>

        {/* Unified Control Bar - Bottom Center */}
        <div className="absolute bottom-2 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 sm:gap-8 z-50 px-6 py-2 rounded-full glass-panel bg-white/5 border border-white/10 shadow-2xl">
          {!isLocked && (
            <div className="flex items-center gap-2 sm:gap-4">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDisplayMode(false);
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
                className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full glass-panel bg-white/10 border-white/20 text-white opacity-60 hover:opacity-100 transition-all"
                title="Exit Slate"
              >
                <X size={16} className="sm:w-[20px] sm:h-[20px]" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    document.documentElement.requestFullscreen();
                  }
                }}
                className="hidden sm:flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full glass-panel bg-white/10 border-white/20 text-white opacity-60 hover:opacity-100 transition-all"
              >
                <Maximize2 size={16} className="sm:w-[20px] sm:h-[20px]" />
              </button>
            </div>
          )}

          {/* New Circular Record Button */}
          {!isLocked && (
            <div className="relative">
              <AnimatePresence>
                {recorder.isRecording && (
                  <>
                    <motion.div 
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full border-2 border-red-500 pointer-events-none"
                    />
                    <motion.div 
                      initial={{ scale: 1, opacity: 0.3 }}
                      animate={{ scale: 2.8, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                      className="absolute inset-0 rounded-full border-2 border-red-500 pointer-events-none"
                    />
                  </>
                )}
              </AnimatePresence>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(50);
                  }
                  if (recorder.isRecording) {
                    recorder.stopRecording();
                  } else if (!recorder.isInitializing) {
                    const safeArtist = metadata.artist.replace(/\s+/g, '_') || 'Artist';
                    const safeStage = metadata.location.replace(/\s+/g, '_') || 'Stage';
                    const fileName = `${safeArtist}_${safeStage}_Take${metadata.flight}_Audio`;
                    recorder.startRecording(fileName);
                  }
                }}
                disabled={recorder.isInitializing || !recorder.isSupported}
                className={`flex h-11 w-11 sm:h-16 sm:w-16 items-center justify-center rounded-full transition-all border-4 relative z-10
                  ${recorder.isRecording 
                    ? 'bg-red-600 border-white shadow-[0_0_30px_rgba(220,38,38,0.8)]' 
                    : recorder.isInitializing
                      ? 'bg-zinc-800 border-white/20 animate-pulse'
                      : !recorder.isSupported
                        ? 'bg-zinc-900 border-white/5 opacity-20 grayscale'
                        : 'bg-red-600 border-black/20 hover:scale-105 active:scale-95 shadow-xl'}
                `}
              >
                {recorder.isRecording ? (
                  <div className="w-4 h-4 sm:w-6 sm:h-6 bg-white rounded-sm" />
                ) : recorder.isInitializing ? (
                  <div className="w-5 h-5 sm:w-7 sm:h-7 border-2 border-white/40 border-t-white animate-spin rounded-full" />
                ) : (
                  <div className="w-5 h-5 sm:w-7 sm:h-7 bg-white/20 rounded-full border-2 border-white/40" />
                )}
              </button>
              
              {recorder.isRecording && (
                <motion.span 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-6 left-1/2 -translate-x-1/2 text-red-500 font-mono font-black text-[9px] sm:text-[10px] tracking-widest whitespace-nowrap"
                >
                  {formatSeconds(recorder.recordingTime)}
                </motion.span>
              )}
              {recorder.statusMessage ? (
                <motion.span
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-6 left-1/2 -translate-x-1/2 text-red-500 font-mono font-black text-[9px] sm:text-[10px] tracking-widest whitespace-nowrap bg-black/60 px-2 py-0.5 rounded"
                >
                  {recorder.statusMessage}
                </motion.span>
              ) : recorder.permissionState === 'denied' ? (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-red-500 font-mono font-black text-[9px] tracking-widest uppercase whitespace-nowrap">
                  Mic Blocked
                </span>
              ) : recorder.permissionState === 'prompt' ? (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-white/40 font-mono font-black text-[9px] tracking-widest uppercase whitespace-nowrap">
                  Need Access
                </span>
              ) : null}
            </div>
          )}

          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsLocked(!isLocked);
            }}
            className={`flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full border shadow-2xl transition-all ${
              isLocked ? `${activeTheme.secondaryColor} border-white/10 text-black scale-110 shadow-lg` : 'glass-panel bg-white/10 border-white/20 text-white opacity-60 hover:opacity-100'
            }`}
            style={isLocked ? { boxShadow: `0 0 30px ${activeTheme.glowColor}` } : {}}
          >
            {isLocked ? <Lock size={16} className="sm:w-[20px] sm:h-[20px]" /> : <Unlock size={16} className="sm:w-[20px] sm:h-[20px] opacity-40" />}
          </button>
        </div>

        {/* Landscape Overlay for Portrait Mode */}
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white p-6 text-center portrait:flex landscape:hidden sm:hidden">
          <Maximize2 size={48} className="text-neon-cyan animate-pulse mb-4 rotate-90" />
          <h2 className="text-2xl font-black italic tracking-tight mb-2">ROTATE DEVICE</h2>
          <p className="text-xs font-mono opacity-50 uppercase tracking-widest leading-relaxed">
            Slate mode requires landscape orientation for optimal filming conditions.
          </p>
        </div>

        {/* Pilot ID Badge - Top Left */}
        <div className="absolute top-2 left-4 sm:top-5 sm:left-8 flex flex-col items-start z-20 max-w-[45%]">
          <span className={`text-[min(1.4vh,11px)] font-mono font-black uppercase tracking-widest ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>Pilot</span>
          <span className={`font-black uppercase italic tracking-tighter leading-none pr-4 truncate w-full ${isDarkMode ? 'text-white' : 'text-black'}
            ${metadata.pilot.length > 25 ? 'text-[min(2.2vh,4vw,1rem)]' :
              metadata.pilot.length > 18 ? 'text-[min(3.2vh,5vw,1.8rem)]' : 
              metadata.pilot.length > 12 ? 'text-[min(4vh,6vw,2.5rem)]' : 
              'text-[min(5vh,7vw,3.5rem)]'}`}
          >
            {metadata.pilot || 'None'}
          </span>
        </div>

        {/* Flight ID Badge - Top Right */}
        <div className="absolute top-2 right-4 sm:top-5 sm:right-8 flex flex-col items-end z-20">
          <span className={`text-[min(1.4vh,11px)] font-mono font-black uppercase tracking-widest ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>Take</span>
          <div className="flex items-center gap-1 sm:gap-2">
            {!isLocked && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleMetadataChange('flight', Math.max(1, metadata.flight - 1));
                }}
                className={`h-9 w-9 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl active:scale-95 transition-all ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-black'}`}
              >
                <Minus size={18} strokeWidth={4} />
              </button>
            )}
            <span className={`text-[min(5vh,3.5rem)] sm:text-[min(6.5vh,5rem)] font-black uppercase italic tracking-tighter leading-none px-2 ${isDarkMode ? activeTheme.accentColor : 'text-black'}`}>
              #{metadata.flight}
            </span>
            {!isLocked && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleMetadataChange('flight', metadata.flight + 1);
                }}
                className={`h-9 w-9 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl active:scale-95 transition-all ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-black'}`}
              >
                <Plus size={18} strokeWidth={4} />
              </button>
            )}
          </div>
        </div>
        
        {/* TOP: Artist */}
        <div className={`flex flex-col items-center justify-center border-b ${isDarkMode ? 'border-white/10' : 'border-black/10'} py-1 sm:py-2 text-center shrink min-h-0 overflow-hidden`}>
          <span className={`text-[min(2vh,12px)] font-mono tracking-[0.3em] uppercase mb-0.5 font-black ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>
            Artist
          </span>
          <h1 className={`font-black leading-[0.9] uppercase tracking-tighter italic px-4 sm:px-8 truncate w-full
            ${isDarkMode ? 'text-white' : 'text-black'}
            ${metadata.artist.length > 30 ? 'text-[min(2.5vh,4vw,1.2rem)]' :
              metadata.artist.length > 20 ? 'text-[min(4vh,6vw,2.2rem)]' : 
              metadata.artist.length > 15 ? 'text-[min(5.5vh,8vw,3.2rem)]' : 
              metadata.artist.length > 10 ? 'text-[min(7.5vh,10vw,4.5rem)]' : 
              'text-[min(10vh,14vw,7rem)]'}`}
            style={isDarkMode ? { filter: `drop-shadow(0 0 30px ${activeTheme.glowColor})` } : {}}
          >
            {metadata.artist}
          </h1>
        </div>

        {/* CENTER: Master Clock */}
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-[1px] ${isDarkMode ? 'bg-gradient-to-r from-transparent via-white/20 to-transparent' : 'bg-gradient-to-r from-transparent via-black/10 to-transparent'}`} />
          <div className={`absolute bottom-0 left-0 w-full h-[1px] ${isDarkMode ? 'bg-gradient-to-r from-transparent via-white/20 to-transparent' : 'bg-gradient-to-r from-transparent via-black/10 to-transparent'}`} />

          <div className="text-center w-full h-full flex flex-col items-center justify-center px-1 py-2">
            <span className={`text-[min(1.8vh,1.1rem)] font-mono uppercase tracking-[0.4em] mb-1 sm:mb-4 block font-black ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>
              Master Clock
            </span>
            
            <div className={`font-mono text-[min(9vh,15vw,6rem)] sm:text-[min(14vh,10vw,11rem)] font-black tracking-tighter leading-[0.8] flex items-baseline justify-center w-full`}
               style={isDarkMode ? { filter: `drop-shadow(0 0 40px ${activeTheme.glowColor})` } : {}}
            >
              <span className="tabular-nums">{hh}</span>
              <span className="opacity-10 mx-[0.01em]">:</span>
              <span className="tabular-nums">{mm}</span>
              <span className="opacity-10 mx-[0.01em]">:</span>
              <span className="tabular-nums">{ss}</span>
              <span className={`tabular-nums ml-1 sm:ml-3 ${isDarkMode ? activeTheme.accentColor : 'text-cyan-700 font-bold'}`} style={{ fontSize: '0.65em' }}>
                <span className="opacity-10 mr-[0.05em]">.</span>{ms}
              </span>
            </div>
          </div>

          {/* New QR Code Position - Bottom Right of center section */}
          <div 
            className="absolute right-4 sm:right-10 bottom-4 sm:bottom-6 flex flex-col items-center gap-1 sm:gap-2 z-20 cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              setIsQREnlarged(true);
            }}
          >
            <div className={`p-1.5 rounded-lg border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} group-hover:scale-110 transition-transform`}>
              <GoProQR size={window.innerWidth < 640 ? 48 : 80} />
            </div>
            <span className={`text-[8px] sm:text-[9px] font-mono font-black ${isDarkMode ? 'opacity-30 text-white' : 'opacity-40 text-black'} uppercase tracking-widest`}>
              Sync Code
            </span>
          </div>
        </div>

        {/* BOTTOM: Stage & Event */}
        <div className={`grid grid-cols-2 items-end border-t ${isDarkMode ? 'border-white/10' : 'border-black/10'} pt-4 mt-2 pb-2 sm:pb-4 shrink-0 gap-8 sm:gap-12 w-full px-4 sm:px-12`}>
          <div className="flex flex-col text-left overflow-hidden min-w-0 pb-1 px-1">
            <span className={`text-[min(1.6vh,10px)] font-mono tracking-[0.1em] uppercase mb-1 font-black ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>Stage</span>
            <div className="text-[min(4vh,5vw,1.5rem)] font-black tracking-tighter uppercase italic truncate leading-tight w-full">
              {metadata.location}
            </div>
          </div>

          <div className="flex flex-col text-right items-end overflow-hidden min-w-0 pb-1 px-1">
            <span className={`text-[min(1.6vh,10px)] font-mono tracking-[0.1em] uppercase mb-1 font-black ${isDarkMode ? 'opacity-30 text-white' : 'text-black/30'}`}>Festival</span>
            <div className="text-[min(4vh,5vw,1.5rem)] font-black tracking-tighter uppercase italic truncate leading-tight w-full">
              {metadata.festival}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-1 w-[40%] h-1 bg-white/10 rounded-full left-1/2 -translate-x-1/2" />
      <div className="absolute top-10 left-10 text-[60px] font-black opacity-[0.03] -rotate-90 origin-left hidden lg:block select-none pointer-events-none uppercase tracking-widest">FPV MASTER SLATE</div>
    </motion.div>
  );
}

function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // (Service-worker registration removed — the slate is served by the FPV Card
    // Boss dashboard at /slate, which manages caching itself.)
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installAction = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  };

  return { canInstall, installAction };
}

// --- Main App ---

export default function App() {
  const [isDisplayMode, setIsDisplayMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isQREnlarged, setIsQREnlarged] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTheme, setActiveTheme] = useState<AppTheme>(THEMES[0]);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lineup, setLineup] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const recorder = useAudioRecorder();

  const startEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editingId || !editForm) return;
    setLineup(prev => prev.map(item => item.id === editingId ? editForm : item));
    setEditingId(null);
    setEditForm(null);
    
    // Update active metadata if we edited the currently selected item
    if (metadata.artist === editForm.artist && metadata.location === editForm.stage) {
      setMetadata(prev => ({
        ...prev,
        artist: editForm.artist,
        location: editForm.stage,
        pilot: editForm.pilot,
        festival: editForm.festival
      }));
    }
  };

  const uniqueDays = useMemo(() => {
    return Array.from(new Set(lineup.map(item => item.day || 'DAY 1'))).sort();
  }, [lineup]);

  useEffect(() => {
    if (uniqueDays.length > 0 && !selectedDay) {
      setSelectedDay(uniqueDays[0]);
    }
  }, [uniqueDays, selectedDay]);

  useEffect(() => {
    // Force background color and mobile status bar themes
    if (isDarkMode) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000000');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
    }
  }, [isDarkMode]);

  const filteredLineup = useMemo(() => {
    return lineup.filter(item => (item.day || 'DAY 1') === selectedDay);
  }, [lineup, selectedDay]);
  usePWAInstall();
  const [metadata, setMetadata] = useState<FlightMetadata>({
    artist: '',
    pilot: '',
    festival: '',
    location: '',
    flight: 1
  });

  const isOffline = useNetworkStatus();
  const handleMetadataChange = useCallback((key: keyof FlightMetadata, value: any) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── FPV Card Boss integration ──────────────────────────────────────────────
  // When opened from the phone shot list (/slate?artist=&stage=&pilot=&...&id=),
  // pre-fill the slate and remember the shot id so we can sync back.
  const [shotId, setShotId] = useState('');
  const [shotSync, setShotSync] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const artist = p.get('artist');
    const stage = p.get('stage');
    const pilot = p.get('pilot');
    const festival = p.get('festival');
    const id = p.get('id') || '';
    // Pull the saved take count for this shot (if any) so the counter continues.
    let savedTakes = 0;
    if (id) {
      try {
        const list = JSON.parse(localStorage.getItem('fpvcb_shots') || '[]');
        const shot = Array.isArray(list) ? list.find((x: any) => x && x.id === id) : null;
        if (shot && shot.takes) savedTakes = parseInt(shot.takes, 10) || 0;
      } catch { /* ignore */ }
    }
    if (artist || stage || pilot || festival) {
      setMetadata(prev => ({
        ...prev,
        artist: artist || prev.artist,
        location: stage || prev.location,
        pilot: pilot || prev.pilot,
        festival: festival || prev.festival,
        flight: savedTakes > 0 ? savedTakes : prev.flight,
      }));
    } else if (savedTakes > 0) {
      setMetadata(prev => ({ ...prev, flight: savedTakes }));
    }
    setShotId(id);
  }, []);

  // Sync this shot back to the phone's shot list. The slate and the dashboard are
  // the same origin, so they share localStorage ('fpvcb_shots') — no server needed,
  // which means this works offline too. The dashboard re-reads it when you go back.
  const saveToShot = useCallback((markDone: boolean) => {
    if (!shotId) return;
    setShotSync('saving');
    try {
      const raw = localStorage.getItem('fpvcb_shots');
      const list: any[] = raw ? JSON.parse(raw) : [];
      let found = false;
      const next = list.map((it) => {
        if (it && it.id === shotId) {
          found = true;
          return { ...it, takes: String(metadata.flight), status: markDone ? 'completed' : it.status };
        }
        return it;
      });
      if (found) localStorage.setItem('fpvcb_shots', JSON.stringify(next));
      setShotSync(found ? 'saved' : 'error');
      setTimeout(() => setShotSync('idle'), 2500);
    } catch {
      setShotSync('error');
      setTimeout(() => setShotSync('idle'), 3000);
    }
  }, [shotId, metadata.flight]);

  // Orientation management
  useEffect(() => {
    const lockOrientation = async () => {
      if (isDisplayMode && 'orientation' in screen && 'lock' in (screen.orientation as any)) {
        try {
          await (screen.orientation as any).lock('landscape');
        } catch (err) {
          console.warn('Orientation lock failed:', err);
        }
      }
    };

    const unlockOrientation = async () => {
      if (!isDisplayMode && 'orientation' in screen && 'unlock' in screen.orientation) {
        try {
          screen.orientation.unlock();
        } catch (err) {
          console.warn('Orientation unlock failed:', err);
        }
      }
    };

    if (isDisplayMode) {
      lockOrientation();
    } else {
      unlockOrientation();
    }
  }, [isDisplayMode]);

  // Auto-fullscreen on rotation to landscape while in Slate mode
  useEffect(() => {
    const handleRotation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isDisplayMode && isLandscape && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // Silently fail if blocked by browser policy without user gesture
        });
      }
    };

    window.addEventListener('resize', handleRotation);
    return () => window.removeEventListener('resize', handleRotation);
  }, [isDisplayMode]);

  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isDisplayMode) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        // Silently fail if blocked by permissions policy (common in iframes/preview environments)
        if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) {
          console.warn('Wake Lock request restricted:', err.message);
        }
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
    };
  }, [isDisplayMode]);

  return (
    <div className={`flex h-[100dvh] w-full flex-col font-sans transition-all duration-300 ${isDarkMode ? `dark ${activeTheme.bgClass} text-white` : 'light bg-white text-zinc-900'}`}>
      <AnimatePresence mode="wait">
        {!isDisplayMode ? (
          <motion.div 
            key="config"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex-1 overflow-y-auto overflow-x-hidden w-full relative custom-scrollbar flex flex-col items-center"
          >
            <div className="w-full max-w-lg landscape:max-w-6xl p-3 sm:p-8 flex flex-col px-3 box-border flex flex-col gap-3 sm:gap-6 pb-8">
              <button
                onClick={() => { window.location.href = '/'; }}
                className="self-start mb-1 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-black uppercase tracking-widest hover:bg-white/20 transition"
              >
                ‹ Back
              </button>
              <header className="mb-6 sm:mb-10 flex flex-col gap-4 sm:gap-8 shrink-0 px-2 w-full">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className={`text-[8px] sm:text-[10px] font-mono tracking-[0.4em] uppercase mb-1 font-bold ${activeTheme.accentColor}`}>
                    System v2.6
                  </h1>
                  <h2 className="text-xl sm:text-3xl font-black italic tracking-tighter drop-shadow-sm uppercase">FPV Festival Slate</h2>
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <button 
                    onClick={() => setShowHelp(true)}
                    className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full glass-panel active:scale-95 border border-white/10 group"
                    title="How to use"
                  >
                    <HelpCircle size={16} className="text-white/60 group-hover:text-neon-cyan transition-colors" />
                  </button>
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full glass-panel active:scale-95 border border-white/10"
                  >
                    {isDarkMode ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} className="text-blue-600" />}
                  </button>
                </div>
              </div>

              {/* Theme Picker */}
              <div className="flex flex-col gap-1 sm:gap-2">
                <span className="text-[8px] sm:text-[10px] font-mono tracking-[0.2em] opacity-40 uppercase font-black px-4">System theme</span>
                <div className="flex gap-1.5 p-1.5 sm:p-2 glass-panel rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar border border-white/5 w-full">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setActiveTheme(theme)}
                      className={`
                        py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl text-[9px] sm:text-[10px] font-mono font-black uppercase transition-all whitespace-nowrap
                        ${activeTheme.id === theme.id 
                          ? (isDarkMode ? 'bg-white text-black' : 'bg-black text-white') + ' shadow-lg scale-105' 
                          : (isDarkMode ? 'bg-white/5 text-white opacity-50' : 'bg-black/5 text-black opacity-50') + ' hover:opacity-100'}
                      `}
                    >
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 shrink-0">
              <button 
                onClick={() => {
                  setIsDisplayMode(true);
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                }}
                className={`w-full py-4 sm:py-6 bg-white font-black text-black text-center rounded-[24px] text-xl sm:text-2xl tracking-[0.3em] active:scale-95 transition-all uppercase hover:bg-zinc-100 ${isDarkMode ? 'shadow-[0_20px_60px_rgba(255,255,255,0.15)]' : 'shadow-[0_15px_40px_rgba(0,0,0,0.15)] border-zinc-200 border'}`}
              >
                Launch Slate
              </button>

              <button 
                onClick={() => setIsNotepadOpen(true)}
                className={`w-full py-4 sm:py-6 glass-panel font-black text-center rounded-[24px] text-xs sm:text-sm tracking-[0.2em] border border-neon-cyan/30 active:scale-95 transition-all uppercase flex items-center justify-center gap-3 ${activeTheme.accentColor}`}
              >
                <Plus size={18} strokeWidth={3} />
                Add Festival Shotlist
              </button>
            </div>

            {isOffline && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 py-2 px-4 bg-orange-500/20 border border-orange-500/40 rounded-full text-center shrink-0"
              >
                <span className="text-[10px] font-mono font-bold text-orange-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <Zap size={12} fill="currentColor" /> Offline Mode
                </span>
              </motion.div>
            )}

            <div className="grid grid-cols-1 landscape:grid-cols-2 gap-3 sm:gap-6">
                {/* Group 1: Timing & Metadata */}
                <div className="flex flex-col gap-3 sm:gap-6">
                  <ClockDisplay />
                  
                  <div className="space-y-2 sm:space-y-4">
                    <Field label="Artist Name" value={metadata.artist} icon={<Music size={24} />} onChange={(v) => handleMetadataChange('artist', v)} isDarkMode={isDarkMode} jumbo activeTheme={activeTheme} />
                    <Field label="Pilot Name" value={metadata.pilot} icon={<Plane size={24} className="text-blue-400" />} onChange={(v) => handleMetadataChange('pilot', v)} isDarkMode={isDarkMode} activeTheme={activeTheme} />
                    <Field label="Festival Event" value={metadata.festival} icon={<Zap size={24} />} onChange={(v) => handleMetadataChange('festival', v)} isDarkMode={isDarkMode} jumbo activeTheme={activeTheme} />
                    <Field label="Stage Location" value={metadata.location} icon={<MapPin size={24} />} onChange={(v) => handleMetadataChange('location', v)} isDarkMode={isDarkMode} jumbo activeTheme={activeTheme} />
                  </div>

                  {/* FPV Card Boss link: take counter + sync back to the shot list */}
                  {shotId && (
                    <div className="glass-panel rounded-2xl border border-neon-cyan/30 p-3 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-neon-cyan/80">Linked Shot · Takes</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleMetadataChange('flight', Math.max(1, metadata.flight - 1))} className="h-8 w-8 rounded-full glass-panel bg-white/10 border border-white/20 text-white flex items-center justify-center"><Minus size={16} /></button>
                          <span className="font-mono text-2xl font-black text-white w-8 text-center">{metadata.flight}</span>
                          <button onClick={() => handleMetadataChange('flight', metadata.flight + 1)} className="h-8 w-8 rounded-full glass-panel bg-white/10 border border-white/20 text-white flex items-center justify-center"><Plus size={16} /></button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveToShot(false)}
                          disabled={shotSync === 'saving'}
                          className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/10 border border-white/20 text-white hover:bg-white/20 transition disabled:opacity-50"
                        >Save Takes</button>
                        <button
                          onClick={() => saveToShot(true)}
                          disabled={shotSync === 'saving'}
                          className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500 text-black hover:bg-emerald-400 transition disabled:opacity-50"
                        >✓ Mark Done</button>
                      </div>
                      <p className={`text-[10px] font-mono text-center min-h-[14px] ${shotSync === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {shotSync === 'saving' ? 'Saving to shot list…' : shotSync === 'saved' ? '✓ Synced to shot list & computer' : shotSync === 'error' ? 'Save failed — check connection' : ''}
                      </p>
                    </div>
                  )}
                </div>

                {/* Group 2: Tools & Lineup */}
                <div className="flex flex-col gap-3 sm:gap-6 lg:h-full">
                  <div className="space-y-2 sm:space-y-4 flex flex-col h-[400px] sm:h-[500px] lg:h-auto lg:flex-1 min-h-[300px] order-first sm:order-none">
                    <div className="flex items-center justify-between px-4 shrink-0">
                      <div className="flex items-center gap-2">
                        <Sparkles size={12} className={activeTheme.accentColor} />
                        <h3 className="text-[10px] sm:text-[12px] font-mono font-black uppercase tracking-[0.2em] text-white/50">Festival Lineup</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {uniqueDays.length > 1 && (
                          <div className="flex gap-1 p-0.5 glass-panel rounded-lg border border-white/5">
                            {uniqueDays.map(day => (
                              <button
                                key={day}
                                onClick={() => setSelectedDay(day)}
                                className={`px-3 py-1 rounded-md text-[8px] font-mono font-black transition-all ${
                                  selectedDay === day 
                                    ? 'bg-neon-cyan text-black' 
                                    : 'text-white/40 hover:text-white/60'
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        )}
                        <span className="text-[8px] sm:text-[10px] font-mono opacity-30 uppercase">{filteredLineup.length} SETS</span>
                      </div>
                    </div>

                    <div className="glass-panel rounded-2xl sm:rounded-[32px] p-3 sm:p-4 border border-white/5 flex flex-col overflow-hidden flex-1">
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 overscroll-contain">
                        {filteredLineup.length === 0 ? (
                          <div className="py-20 flex flex-col items-center justify-center text-center opacity-20 transition-all">
                            <Sparkles size={32} className="mb-4" />
                            <p className="text-[10px] font-mono uppercase tracking-widest italic">
                              Import Schedule Via Magic Notepad
                            </p>
                          </div>
                        ) : (
                          filteredLineup.map((item, idx) => (
                            <div 
                              key={item.id || idx}
                              className={`
                                flex items-center justify-between p-4 rounded-2xl group transition-all cursor-pointer border
                                ${metadata.artist === item.artist && metadata.location === item.stage 
                                  ? `bg-neon-cyan border-neon-cyan text-black shadow-[0_0_20px_rgba(0,255,163,0.2)]` 
                                  : 'bg-white/5 hover:bg-white/10 border-white/5'}
                              `}
                              onClick={() => {
                                setMetadata(prev => ({
                                  ...prev,
                                  artist: item.artist,
                                  location: item.stage,
                                  pilot: item.pilot,
                                  festival: item.festival
                                }));
                              }}
                            >
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2 opacity-60 mb-1">
                                  <span className="text-[9px] font-mono font-black uppercase">{item.time}</span>
                                  <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                                  <span className="text-[9px] font-mono font-black uppercase truncate">{item.stage}</span>
                                </div>
                                <span className="text-sm font-black truncate tracking-tight uppercase italic">{item.artist}</span>
                              </div>
                              <button
                                onClick={(e) => startEdit(e, item)}
                                className={`p-2 rounded-lg transition-all ${
                                  metadata.artist === item.artist && metadata.location === item.stage
                                    ? 'hover:bg-black/10 text-black'
                                    : 'hover:bg-white/10 text-white/40 hover:text-white'
                                }`}
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* GoPro Labs QR Code Preview */}
                  <div 
                    className="flex flex-col gap-1.5 sm:gap-2 items-center p-4 sm:p-6 glass-panel rounded-2xl sm:rounded-[32px] border border-white/5 relative group shrink-0 cursor-pointer"
                    onClick={() => setIsQREnlarged(true)}
                  >
                    <div className="absolute top-2 left-4 sm:top-4 sm:left-6 flex items-center gap-2">
                      <QrCode size={12} className={activeTheme.accentColor} />
                      <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-[0.3em] opacity-50 font-bold">GoPro Labs Sync QR</span>
                    </div>
                    <div className="mt-2 sm:mt-6 transition-transform group-hover:scale-105">
                      <GoProQR size={120} />
                    </div>
                    <p className="mt-2 sm:mt-4 text-[8px] sm:text-[9px] font-mono opacity-40 uppercase text-center max-w-[200px]">
                      Touch to enlarge QR
                    </p>
                  </div>
                </div>
              </div>

              <footer className="mt-8 mb-12 flex flex-col items-center gap-2 text-[8px] sm:text-[10px] font-mono tracking-tighter opacity-20 uppercase shrink-0">
                <div className="hidden sm:block text-center">
                  FPV SLATE // LOGGING PROTOCOL // {new Date().toISOString()}
                  <br />
                  v2.6-Universal // Designed for festival conditions
                </div>
                <div className="sm:hidden text-center">
                  v2.6 MISSION CONTROL
                </div>
              </footer>
            </div>
          </motion.div>
        ) : (
          <SlateMode 
            metadata={metadata}
            isDarkMode={isDarkMode}
            isLocked={isLocked}
            setIsLocked={setIsLocked}
            setIsDisplayMode={setIsDisplayMode}
            activeTheme={activeTheme}
            setIsQREnlarged={setIsQREnlarged}
            handleMetadataChange={handleMetadataChange}
            recorder={recorder}
          />
        )}
      </AnimatePresence>

      {/* Edit Item Modal */}
      <AnimatePresence>
        {editingId && editForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => {
              setEditingId(null);
              setEditForm(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900 border border-white/10 p-6 rounded-[32px] w-full max-w-md shadow-2xl space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Edit3 size={20} className="text-neon-cyan" />
                  Edit Flight Info
                </h3>
                <button onClick={() => { setEditingId(null); setEditForm(null); }} className="text-white/30 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase opacity-40 ml-4 font-black">Artist</label>
                  <input 
                    value={editForm.artist}
                    onChange={(e) => setEditForm({ ...editForm, artist: e.target.value.toUpperCase() })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-black uppercase outline-none focus:border-neon-cyan/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase opacity-40 ml-4 font-black">Time</label>
                    <input 
                      value={editForm.time}
                      onChange={(e) => setEditForm({ ...editForm, time: e.target.value.toUpperCase() })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-mono text-xs outline-none focus:border-neon-cyan/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase opacity-40 ml-4 font-black">Day</label>
                    <input 
                      value={editForm.day}
                      onChange={(e) => setEditForm({ ...editForm, day: e.target.value.toUpperCase() })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-mono text-xs outline-none focus:border-neon-cyan/50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase opacity-40 ml-4 font-black">Stage</label>
                  <input 
                    value={editForm.stage}
                    onChange={(e) => setEditForm({ ...editForm, stage: e.target.value.toUpperCase() })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-black uppercase outline-none focus:border-neon-cyan/50"
                  />
                </div>
              </div>

              <button 
                onClick={saveEdit}
                className="w-full py-4 bg-neon-cyan text-black font-black uppercase tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Check size={20} strokeWidth={3} />
                Save Changes
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enlarged QR Modal - Shared across Mission Control and Slate Mode */}
      <AnimatePresence>
        {isQREnlarged && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsQREnlarged(false)}
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl overflow-y-auto flex items-center justify-center p-4 min-h-screen"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white p-5 sm:p-8 rounded-[32px] shadow-[0_0_100px_rgba(255,255,255,0.2)] max-w-sm landscape:max-w-xl md:landscape:max-w-md lg:landscape:max-w-sm w-full flex flex-col items-center justify-center relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setIsQREnlarged(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 text-zinc-400 hover:text-black hover:bg-zinc-100/80 p-2 rounded-full transition-all flex items-center justify-center bg-zinc-50 border border-zinc-100/50"
                aria-label="Close enlarged QR"
              >
                <X size={16} className="text-zinc-600" />
              </button>
              <div className="w-full flex items-center justify-center p-2 mb-2">
                <GoProQR 
                  size={window.innerWidth < 640 ? Math.min(window.innerWidth - 100, 240) : 280} 
                  showMetadata={true} 
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNotepadOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl max-h-[90vh] flex flex-col"
            >
              <MagicNotepad 
                isDarkMode={isDarkMode}
                onClose={() => setIsNotepadOpen(false)}
                onImport={(importedLineup) => {
                  setLineup(importedLineup);
                  if (importedLineup.length > 0) {
                    const first = importedLineup[0];
                    setMetadata(prev => ({
                      ...prev,
                      artist: first.artist,
                      location: first.stage,
                      pilot: first.pilot,
                      festival: first.festival
                    }));
                  }
                  setIsNotepadOpen(false);
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} isDarkMode={isDarkMode} />
    </div>
  );
}

function Field({ label, value, icon, onChange, disabled = false, isDarkMode, jumbo = false, activeTheme }: { 
  label: string; 
  value: string; 
  icon?: React.ReactNode; 
  onChange?: (val: string) => void;
  disabled?: boolean;
  isDarkMode: boolean;
  jumbo?: boolean;
  activeTheme: AppTheme;
}) {
  return (
    <div className="flex flex-col gap-1 sm:gap-2 w-full">
      <label className={`text-[10px] sm:text-[12px] font-mono tracking-[0.4em] uppercase px-4 font-black ${isDarkMode ? 'text-white/50' : 'text-black/60'}`}>
        {label}
      </label>
      <div className={`
        flex items-center gap-2 sm:gap-4 rounded-2xl sm:rounded-[32px] border glass-panel transition-all group w-full 
        ${jumbo ? 'p-2 sm:p-8 landscape:max-sm:p-3' : 'p-2 sm:p-5 landscape:max-sm:p-3'} 
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''} 
        ${isDarkMode 
            ? `border-white/10 focus-within:border-white/30` 
            : 'bg-white/90 border-black/40 shadow-lg focus-within:border-black/70'}
      `}>
        {icon && <div className={`shrink-0 ${isDarkMode ? `${activeTheme.accentColor} opacity-70 group-focus-within:opacity-100` : 'text-black/50 group-focus-within:text-black'}`}>{icon}</div>}
        <textarea 
          value={value} 
          onChange={(e) => onChange?.(e.target.value.toUpperCase())}
          disabled={disabled}
          rows={1}
          className={`
            w-full bg-transparent font-black placeholder:text-white/10 outline-none uppercase tracking-tighter resize-none overflow-hidden no-scrollbar
            ${jumbo ? 'text-lg sm:text-5xl landscape:max-sm:text-xl leading-[1]' : 'text-md sm:text-2xl landscape:max-sm:text-lg'}
            ${isDarkMode ? 'text-white' : 'text-black'}
          `}
          placeholder={`SET ${label.toUpperCase()}`}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
      </div>
    </div>
  );
}
