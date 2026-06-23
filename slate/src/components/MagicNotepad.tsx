import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  File,
  Upload,
  ClipboardPaste, 
  Trash2, 
  X,
  Sparkles
} from 'lucide-react';

interface ParsedFlight {
  id: string;
  artist: string;
  stage: string;
  pilot: string;
  time: string;
  festival: string;
  day?: string;
}

interface MagicNotepadProps {
  onImport: (lineup: ParsedFlight[]) => void;
  isDarkMode: boolean;
  onClose: () => void;
}

export const MagicNotepad: React.FC<MagicNotepadProps> = ({ 
  onImport, 
  isDarkMode,
  onClose 
}) => {
  const [pastedText, setPastedText] = useState('');
  const [flights, setFlights] = useState<ParsedFlight[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const parsePastedText = (text: string) => {
    const lines = text.split('\n');
    const parsed: ParsedFlight[] = [];
    let detectedFestival = 'FESTIVAL';
    let currentDay = 'DAY 1';

    // Heuristic for festival name: look for likely header lines
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes('SCHEDULE') || upper.includes('TIMETABLE') || upper.includes('202')) {
        detectedFestival = line.replace(/schedule|timetable/gi, '').trim() || detectedFestival;
        break;
      }
    }

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.split(/\t|,/).map(p => p.trim().replace(/^"|"$/g, ''));
      const upper = line.toUpperCase();
      
      // Look for Day marker
      const dayMatch = upper.match(/DAY\s*([0-9]|ZERO|ONE|TWO|THREE|FOUR|FIVE)/i);
      // If it's a day marker line (usually mostly empty columns or just a simple header)
      if (dayMatch && (parts.length < 3 || (!parts[3] && !parts[4]))) {
        let val = dayMatch[1].toUpperCase();
        if (val === 'ZERO') val = '0';
        if (val === 'ONE') val = '1';
        if (val === 'TWO') val = '2';
        if (val === 'THREE') val = '3';
        currentDay = `DAY ${val}`;
        return; 
      }
      
      if (parts.length < 2) return;

      // Artist (0), Stage (2), Pilot (3), Time (4)
      let artist = parts[0] || '';
      let stage = parts[2] || parts[1] || 'MAIN STAGE'; 
      let pilot = parts[3] || '';
      let time = parts[4] || parts[1] || ''; 

      // If parts[0] looks like a time (e.g. 18:00), swap
      if (artist.match(/^\d{1,2}:\d{2}/) || artist.match(/^\d{1,2}[ap]m/i)) {
        time = parts[0];
        artist = parts[1] || '';
        stage = parts[2] || stage;
      }

      const artistUpper = artist.toUpperCase();
      const pilotUpper = pilot.toUpperCase();

      // Skip headers or common non-data rows
      const blacklist = ['ARTIST / CONTENT', 'BREAK', 'ACT', 'FIREWORKS', 'INTERMEZZO', 'CEREMONY', 'DAY ', 'MICHAEL JENNINGS ONLY', 'MEDVZA3', 'OPENING', 'CLOSING'];
      if (blacklist.some(term => artistUpper.includes(term) || pilotUpper.includes(term))) return;
      
      // If pilot is empty or looks like a stage/time
      if (!pilot || pilot.length < 2) return;
      if (pilotUpper.includes('FIELD') || pilotUpper.includes('STAGE') || pilotUpper.includes('GROUNDS') || pilotUpper.includes('BASSPOD') || pilotUpper.includes('GARDEN')) return;
      
      if (!artist || artist.length < 3) return;

      parsed.push({
        id: `${index}-${artist}-${pilot}`,
        artist: artist.toUpperCase(),
        stage: stage.toUpperCase(),
        pilot: pilot.toUpperCase() || 'UNASSIGNED',
        time: time.toUpperCase(),
        festival: detectedFestival.toUpperCase(),
        day: currentDay.toUpperCase()
      });
    });

    setFlights(parsed);
    
    // Auto-select first pilot if only one found
    const uniquePilots = Array.from(new Set(parsed.map(f => f.pilot)));
    if (uniquePilots.length === 1) {
      const pilotLineup = parsed.filter(f => f.pilot === uniquePilots[0]);
      onImport(pilotLineup);
    }
  };

  const handleFileUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPastedText(text);
      parsePastedText(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPastedText(text);
    parsePastedText(text);
  };

  const pilots = useMemo(() => {
    return Array.from(new Set(flights.map(f => f.pilot))).sort();
  }, [flights]);

  const selectPilot = (pilot: string) => {
    const pilotLineup = flights.filter(f => f.pilot === pilot);
    onImport(pilotLineup);
  };

  const clear = () => {
    setPastedText('');
    setFlights([]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col h-full w-full max-w-2xl mx-auto rounded-3xl overflow-hidden border ${
        isDarkMode ? 'bg-zinc-900 border-white/10' : 'bg-white border-black/10 shadow-2xl'
      }`}
    >
      <div className={`p-4 border-b flex justify-between items-center ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-neon-cyan" />
          <h2 className={`font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-black'}`}>Magic Notepad Importer</h2>
        </div>
        <button onClick={onClose} className={`p-2 rounded-full hover:bg-black/10 ${isDarkMode ? 'text-white/50' : 'text-black/50'}`}>
          <X size={20} />
        </button>
      </div>

      <div 
        className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {flights.length === 0 ? (
          <div className="space-y-4">
            <div className={`text-sm font-mono uppercase tracking-widest opacity-50 mb-2 ${isDarkMode ? 'text-white' : 'text-black'}`}>
              1. Import Schedule
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={`
                flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all
                ${isDragging ? 'border-neon-cyan bg-neon-cyan/5' : isDarkMode ? 'border-white/10 hover:border-white/20' : 'border-black/10 hover:border-black/20'}
              `}>
                <Upload size={32} className="mb-2 opacity-50" />
                <span className="text-sm font-bold">Upload CSV / TXT</span>
                <span className="text-[10px] opacity-40 uppercase mt-1">or drag & drop</span>
                <input type="file" className="hidden" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
              </label>

              <div className={`
                flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed
                ${isDarkMode ? 'border-white/10' : 'border-black/10'}
              `}>
                <File size={32} className="mb-2 opacity-50" />
                <span className="text-sm font-bold text-center">Paste from Google Sheets / Docs</span>
                <span className="text-[10px] opacity-40 uppercase mt-1">Use text area below</span>
              </div>
            </div>

            <div className="relative group">
              <textarea
                value={pastedText}
                onChange={handlePaste}
                placeholder="Paste your schedule here...&#10;&#10;Format: Artist [tab] Stage [tab] Pilot [tab] Time"
                className={`w-full h-48 p-6 rounded-2xl font-mono text-sm resize-none outline-none transition-all border-2 ${
                  isDarkMode 
                    ? 'bg-black/50 border-white/10 focus:border-neon-cyan text-white' 
                    : 'bg-zinc-50 border-black/10 focus:border-black text-black'
                }`}
              />
              <div className="absolute top-4 right-4 pointer-events-none opacity-20 group-focus-within:opacity-0 transition-opacity">
                <ClipboardPaste size={40} />
              </div>
            </div>
            <div className={`text-[10px] sm:text-xs opacity-50 italic ${isDarkMode ? 'text-white' : 'text-black'}`}>
              Note: Artist (0), Stage (2), Pilot (3), Time (4) is our primary target format.
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className={`text-sm font-mono uppercase tracking-widest opacity-50 ${isDarkMode ? 'text-white' : 'text-black'}`}>
                  2. Identify Yourself
                </div>
                <button onClick={clear} className="text-xs flex items-center gap-1 text-red-500 hover:underline">
                  <Trash2 size={12} /> Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {pilots.map(pilot => (
                  <button
                    key={pilot}
                    onClick={() => selectPilot(pilot)}
                    className={`px-6 py-3 rounded-xl font-black transition-all active:scale-95 ${
                      isDarkMode 
                        ? 'bg-white/5 text-white/60 hover:bg-neon-cyan hover:text-black hover:scale-105' 
                        : 'bg-black/5 text-black/60 hover:bg-black hover:text-white hover:scale-105'
                    }`}
                  >
                    {pilot}
                  </button>
                ))}
              </div>
              <div className={`text-xs opacity-40 ${isDarkMode ? 'text-white' : 'text-black'}`}>
                Click on your pilot name to import your entire lineup to Mission Control.
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
