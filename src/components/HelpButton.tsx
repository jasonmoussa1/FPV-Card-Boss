import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HELP_CONTENT } from '../data/helpContent';

type Size = 'sm' | 'md';

interface HelpButtonProps {
  id: string;
  size?: Size;
  className?: string;
}

interface PopPos {
  top: number;
  left: number;
  width: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
}

export default function HelpButton({ id, size = 'sm', className = '' }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<PopPos>({ top: -9999, left: -9999, width: 320, arrowLeft: 160, placement: 'bottom' });

  const entry = HELP_CONTENT[id];

  const computePosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const margin = 12;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(320, vw - margin * 2);
    const rect = btn.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, vw - width - margin));

    const popHeight = popRef.current?.offsetHeight ?? 220;

    let placement: 'top' | 'bottom' = 'bottom';
    let top = rect.bottom + gap;
    const fitsBelow = top + popHeight <= vh - margin;
    const fitsAbove = rect.top - popHeight - gap >= margin;
    if (!fitsBelow && fitsAbove) {
      placement = 'top';
      top = rect.top - popHeight - gap;
    }

    const arrowLeft = Math.max(16, Math.min(width - 16, rect.left + rect.width / 2 - left));
    setPos({ top, left, width, arrowLeft, placement });
  }, []);

  useLayoutEffect(() => {
    if (open) computePosition();
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => computePosition();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, computePosition]);

  const dims = size === 'md' ? 'w-5 h-5 text-xs' : 'w-4 h-4 text-[10px]';

  const arrowStyle: CSSProperties = { left: pos.arrowLeft - 6 };
  if (pos.placement === 'bottom') arrowStyle.top = -6; else arrowStyle.bottom = -6;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={entry ? `Help: ${entry.title}` : 'Help'}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`inline-flex items-center justify-center ${dims} rounded-full font-bold leading-none align-middle border border-amber-400/40 text-amber-300/90 bg-amber-400/10 hover:bg-amber-400/25 hover:text-amber-200 transition-colors cursor-help select-none ${open ? 'ring-2 ring-amber-400/50' : ''} ${className}`}
      >
        ?
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[10000] rounded-xl border border-amber-400/30 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-4 text-sm text-zinc-200"
        >
          <div
            className={`absolute w-3 h-3 rotate-45 bg-zinc-900 border-amber-400/30 ${pos.placement === 'bottom' ? 'border-l border-t' : 'border-r border-b'}`}
            style={arrowStyle}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            className="absolute top-1.5 right-2 text-lg leading-none text-zinc-500 hover:text-zinc-200"
          >
            ×
          </button>

          {entry ? (
            <>
              <div className="font-bold text-amber-300 text-[15px] mb-2 pr-5">{entry.title}</div>
              <p className="text-zinc-300 leading-relaxed">{entry.what}</p>
              {entry.why && (
                <div className="mt-3 rounded-lg bg-amber-400/10 border border-amber-400/20 p-2.5">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-amber-400/80 mb-1">Why it matters</div>
                  <p className="text-zinc-300 leading-relaxed text-[13px]">{entry.why}</p>
                </div>
              )}
              {entry.tips && entry.tips.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {entry.tips.map((t, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-zinc-300">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-zinc-400 italic">No help text found for "{id}". Add it to src/data/helpContent.ts.</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
