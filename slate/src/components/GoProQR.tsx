import React, { useState, useEffect, useRef, memo } from 'react';
import QRCode from 'qrcode';

interface GoProQRProps {
  size?: number;
  showMetadata?: boolean;
}

type SyncMode = 'fast' | 'medium' | 'slow' | 'freeze';

const GoProQRComponent: React.FC<GoProQRProps> = ({ size = 200, showMetadata = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<SyncMode>('slow'); // Default to 'slow' (1s update) as it's the most stable for phones
  const [qrString, setQrString] = useState<string>('');
  const [tc24, setTc24] = useState<string>('');
  const [tc25, setTc25] = useState<string>('');
  const [tc30, setTc30] = useState<string>('');
  const [tc60, setTc60] = useState<string>('');
  const [isLandscapeShort, setIsLandscapeShort] = useState(false);
  
  // Keep track of the frozen moment for freeze mode
  const frozenDateRef = useRef<Date | null>(null);

  useEffect(() => {
    const checkViewport = () => {
      setIsLandscapeShort(window.innerWidth > window.innerHeight && window.innerHeight < 580);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    window.addEventListener('orientationchange', checkViewport);
    return () => {
      window.removeEventListener('resize', checkViewport);
      window.removeEventListener('orientationchange', checkViewport);
    };
  }, []);

  const finalSize = isLandscapeShort ? Math.min(size, 160) : size;

  useEffect(() => {
    let isMounted = true;
    let timerId: any;

    const updateQR = async () => {
      if (!isMounted) return;

      let now: Date;
      if (mode === 'freeze') {
        if (!frozenDateRef.current) {
          frozenDateRef.current = new Date();
        }
        now = frozenDateRef.current;
      } else {
        frozenDateRef.current = null;
        now = new Date();
      }

      const yy = String(now.getFullYear()).slice(-2);
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = now.getMilliseconds();
      const mmm = String(milliseconds).padStart(3, '0');
      
      const getIsDst = (date: Date): number => {
        const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
        const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        return date.getTimezoneOffset() < Math.max(jan, jul) ? 1 : 0;
      };

      const isDst = getIsDst(now);
      const tzOffset = now.getTimezoneOffset();
      const tzHours = -(tzOffset / 60);
      const baseTzHours = isDst ? tzHours - 1 : tzHours; // Standard base timezone hours (without DST applied)
      
      // Precision Time Command: oT[YYMMDDHHmmss.mmm]oTD[DST_ACTIVE]oTZ[BASE_TZ_OFFSET]oTI0
      // Example: oT260529154245.229oTD1oTZ-8oTI0
      const currentQrString = `oT${yy}${MM}${dd}${HH}${mm}${ss}.${mmm}oTD${isDst}oTZ${baseTzHours}oTI0`;
      
      // Calculate Timecodes for live display
      const fps24 = Math.floor((milliseconds / 1000) * 24);
      const fps25 = Math.floor((milliseconds / 1000) * 25);
      const fps30 = Math.floor((milliseconds / 1000) * 30);
      const fps60 = Math.floor((milliseconds / 1000) * 60);

      setTc24(`${HH}:${mm}:${ss}:${String(fps24).padStart(2, '0')}`);
      setTc25(`${HH}:${mm}:${ss}:${String(fps25).padStart(2, '0')}`);
      setTc30(`${HH}:${mm}:${ss}:${String(fps30).padStart(2, '0')}`);
      setTc60(`${HH}:${mm}:${ss}:${String(fps60).padStart(2, '0')}`);
      setQrString(currentQrString);

      if (canvasRef.current) {
        try {
          await QRCode.toCanvas(canvasRef.current, currentQrString, {
            width: finalSize,
            margin: 4, // Clean high contrast quiet border around the QR data
            color: {
              dark: '#000000',
              light: '#ffffff'
            },
            errorCorrectionLevel: 'M' // Level 'M' (Medium) is GoPro standard, keeping modules large and easy to scan
          });
        } catch (err) {
          console.error('GoProQR: Canvas render failed', err);
        }
      }

      if (isMounted && mode !== 'freeze') {
        const delay = mode === 'fast' ? 100 : mode === 'medium' ? 250 : 1000;
        timerId = setTimeout(updateQR, delay);
      }
    };

    updateQR();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [finalSize, mode]);

  // Handle forcing a new freeze moment
  const handleFreezeToggle = () => {
    if (mode === 'freeze') {
      // Unfreeze
      setMode('slow');
    } else {
      // Freeze right now
      frozenDateRef.current = new Date();
      setMode('freeze');
    }
  };

  return (
    <div className={`flex ${isLandscapeShort ? 'flex-row items-center justify-center gap-6 p-1 max-w-2xl' : 'flex-col items-center'}`}>
      <div className="flex flex-col items-center shrink-0">
        <div 
          className="bg-white p-3.5 flex items-center justify-center rounded-2xl overflow-hidden shrink-0 border border-zinc-100"
          style={{ 
            width: finalSize + 28, 
            height: finalSize + 28,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)'
          }}
        >
          <canvas 
            ref={canvasRef} 
            className="block"
            style={{ 
              width: finalSize, 
              height: finalSize, 
            }}
          />
        </div>
      </div>

      {showMetadata && (
        <div className={`w-full font-mono text-center shrink overflow-hidden ${isLandscapeShort ? 'mt-0 max-w-[280px] space-y-2' : 'mt-4 max-w-sm space-y-3.5'}`}>
          {/* Mode Selector Buttons */}
          <div className="bg-zinc-100/80 p-0.5 sm:p-1 rounded-[16px] grid grid-cols-4 gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] font-sans font-bold text-zinc-600">
            <button
              onClick={() => setMode('slow')}
              className={`py-1 sm:py-1.5 rounded-[12px] transition-all ${mode === 'slow' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/40'}`}
              title="1-Second Interval - Recommended"
            >
              Stable
            </button>
            <button
              onClick={() => setMode('medium')}
              className={`py-1 sm:py-1.5 rounded-[12px] transition-all ${mode === 'medium' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/40'}`}
              title="250ms Interval"
            >
              Med
            </button>
            <button
              onClick={() => setMode('fast')}
              className={`py-1 sm:py-1.5 rounded-[12px] transition-all ${mode === 'fast' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/40'}`}
              title="100ms High Speed"
            >
              Fast
            </button>
            <button
              onClick={handleFreezeToggle}
              className={`py-1 sm:py-1.5 rounded-[12px] transition-all ${mode === 'freeze' ? 'bg-red-500 text-white shadow-sm' : 'hover:bg-white/40'}`}
              title="Freeze snapshot moment"
            >
              {mode === 'freeze' ? 'Frozen' : 'Freeze'}
            </button>
          </div>

          <div className={`grid grid-cols-2 gap-x-4 text-left max-w-xs mx-auto text-zinc-400 border-b border-zinc-100 pb-2 ${isLandscapeShort ? 'text-[9px] pb-1' : 'text-[10px] pb-2'}`}>
            <div>TC 24: <span className="text-zinc-800 font-bold">{tc24}</span></div>
            <div>TC 25: <span className="text-zinc-800 font-bold">{tc25}</span></div>
            <div>TC 30: <span className="text-zinc-800 font-bold">{tc30}</span></div>
            <div>TC 60: <span className="text-zinc-800 font-bold">{tc60}</span></div>
          </div>
          
          <div className="px-2 mt-1">
            <p className="text-[9.5px] sm:text-[10px] text-zinc-500 break-all bg-zinc-50 border border-zinc-100 rounded-lg p-1.5 leading-relaxed text-left select-all">
              <span className="text-zinc-400 font-medium block text-[8px] uppercase tracking-wider mb-0.5">GoPro Labs Command</span>
              <span className="text-zinc-700 font-black">{qrString}</span>
            </p>
          </div>

          {!isLandscapeShort ? (
            <div className="text-[10px] bg-cyan-50/50 border border-cyan-100/60 text-cyan-800 rounded-[14px] p-3 text-left font-sans leading-relaxed">
              <span className="font-bold block text-cyan-950 mb-1">💡 Scan optimization steps:</span>
              <ul className="list-disc pl-3.5 space-y-1 text-cyan-900">
                <li>Turn phone screen brightness to <span className="font-bold">100%</span>.</li>
                <li>Use <span className="font-bold text-cyan-950">Stable</span> or <span className="font-bold text-cyan-950">Freeze</span> mode to completely stop fast screen-flicker blurs.</li>
                <li>Keep phone perpendicular to camera lens (avoid glare reflections from lights).</li>
              </ul>
            </div>
          ) : (
            <div className="text-[8.5px] bg-cyan-50/50 border border-cyan-100/50 text-cyan-850 rounded-[10px] p-1.5 px-2 text-left font-sans leading-normal">
              <span className="font-black text-cyan-950">💡 Tips:</span> Max screen brightness, use Stable/Freeze mode to stop blurs, avoid lens reflection.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const GoProQR = memo(GoProQRComponent);
