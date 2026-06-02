import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, HelpCircle, User, Music, Monitor, Mic, Zap, Camera } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const HelpGuide = [
  {
    icon: Music,
    title: "Artist Shot List",
    description: "Import or manually search for artists performing at the festival. This is the primary way to populate your slate with the current act and stage information."
  },
  {
    icon: User,
    title: "Choose Your Pilot",
    description: "If your shot list includes multiple team members, select your handle from the 'Pilot' section to attribute your flights and recordings correctly."
  },
  {
    icon: Monitor,
    title: "Launch the Slate",
    description: "Tap 'Launch Slate' to enter the full-screen production view. This view is designed to be recorded by your camera at the start of a flight."
  },
  {
    icon: Camera,
    title: "QR Sync Code",
    description: "The QR code on the Slate is a GoPro Labs 'Visual Sync' code. Point your GoPro at it while in Slate mode to perfectly sync your camera's internal clock with the master timecode."
  },
  {
    icon: Zap,
    title: "Flight Tracking",
    description: "In Slate Mode, use the '+' button to increment the flight number. This allows you to track multiple 'takes' or flights for the same artist without leaving the view."
  },
  {
    icon: Mic,
    title: "Record Audio",
    description: "Tap the red 'Record' circle to capture ambient audio or pilot notes directly into the app. Recordings are saved locally named by artist and flight."
  }
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div id="help-modal-root" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 backdrop-blur-sm ${isDarkMode ? 'bg-black/80' : 'bg-white/80'}`}
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`relative w-full max-w-2xl border rounded-3xl overflow-hidden shadow-2xl ${isDarkMode ? 'bg-zinc-900 border-white/10' : 'bg-white border-black/10'}`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b bg-white/5 ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}>
              <div className="flex items-center gap-3">
                <HelpCircle className={isDarkMode ? "text-neon-cyan" : "text-cyan-600"} size={24} />
                <h2 className={`text-xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>How to Use the Slate</h2>
              </div>
              <button 
                onClick={onClose}
                className={`h-10 w-10 flex items-center justify-center rounded-full transition-colors ${isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}
                id="close-help-button"
              >
                <X className={isDarkMode ? "text-white/60" : "text-black/60"} size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {HelpGuide.map((item, index) => (
                  <motion.div 
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all group ${isDarkMode ? 'bg-white/5 border-white/5 hover:border-white/10 text-white' : 'bg-black/5 border-black/5 hover:border-black/10 text-zinc-900'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-2 rounded-lg group-hover:scale-110 transition-transform ${isDarkMode ? 'bg-zinc-800 text-neon-magenta' : 'bg-zinc-100 text-neon-magenta'}`}>
                        <item.icon size={18} />
                      </div>
                      <h3 className={`font-bold uppercase tracking-tight text-sm ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>{item.title}</h3>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/50' : 'text-zinc-600'}`}>
                      {item.description}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className={`mt-8 p-4 rounded-2xl border ${isDarkMode ? 'bg-neon-cyan/10 border-neon-cyan/20' : 'bg-cyan-50 border-cyan-200'}`}>
                <div className="flex gap-3">
                  <div className={`shrink-0 mt-0.5 ${isDarkMode ? 'text-neon-cyan' : 'text-cyan-600'}`}>
                    <Zap size={20} />
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold uppercase mb-1 ${isDarkMode ? 'text-neon-cyan' : 'text-cyan-700'}`}>Expert Tip: Lock Mode</h4>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/70' : 'text-zinc-700'}`}>
                      In Slate mode, use the 'Lock' button to prevent accidental touches. This is crucial when mounting the tablet near flight gear or handing it to assistants.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t text-center ${isDarkMode ? 'bg-black/40 border-white/5' : 'bg-zinc-50 border-black/5'}`}>
              <button 
                onClick={onClose}
                className={`px-8 py-2 rounded-full font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
