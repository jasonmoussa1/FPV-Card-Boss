/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PlatformGate — first-run "Which computer is this?" picker.
 *
 * Wraps the Dashboard. On first launch it asks whether the app is running on a
 * Windows PC or a Mac, pre-selecting whatever the OS auto-detected, and saves the
 * choice (via window.electron.setPlatform → platform.json in userData). That
 * choice is what the main process uses to decide which automation path to run.
 *
 * It also shows a small badge (with a "Change" action) once chosen, and — while
 * the macOS robot is still being built (Phase 2) — a slim banner making clear
 * that Mac automation isn't wired up yet, so nobody expects the robot to click.
 *
 * Fully additive: if window.electron is unavailable (e.g. browser dev), it
 * simply renders the children without gating.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Monitor, Laptop, Check } from 'lucide-react';

type Platform = 'win' | 'mac';

export default function PlatformGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [chosen, setChosen] = useState<Platform | null>(null);
  const [detected, setDetected] = useState<Platform>('win');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlight, setHighlight] = useState<Platform>('win');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bridge = window.electron;
      // No Electron bridge (browser dev): don't gate.
      if (!bridge?.getPlatform) {
        if (!cancelled) { setChosen('win'); setReady(true); }
        return;
      }
      try {
        const info = await bridge.getPlatform();
        if (cancelled) return;
        setDetected(info.detected);
        setHighlight(info.stored ?? info.detected);
        if (info.stored) {
          setChosen(info.stored);
        } else {
          setPickerOpen(true);
        }
      } catch {
        if (!cancelled) setPickerOpen(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function choose(p: Platform) {
    try { await window.electron?.setPlatform?.(p); } catch { /* persisted best-effort */ }
    setChosen(p);
    setPickerOpen(false);
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    );
  }

  const showPicker = pickerOpen || !chosen;

  return (
    <>
      {/* Mac automation not-yet-wired banner (removed once Phase 2 lands) */}
      {chosen === 'mac' && !showPicker && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-sm px-4 py-2 text-center">
          macOS automation is being set up (Phase 2). File tools and the UI work; the GoPro robot
          and SD copy are not wired for Mac yet.
        </div>
      )}

      {!showPicker && children}

      {/* Small platform badge with a Change action */}
      {!showPicker && (
        <button
          onClick={() => { setHighlight(chosen ?? detected); setPickerOpen(true); }}
          className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full
                     bg-zinc-900/90 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300
                     hover:bg-zinc-800 hover:text-white shadow-lg backdrop-blur transition"
          title="Change platform"
        >
          {chosen === 'mac' ? <Laptop size={14} /> : <Monitor size={14} />}
          {chosen === 'mac' ? 'Mac' : 'Windows PC'}
          <span className="text-zinc-500">· Change</span>
        </button>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 backdrop-blur p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-white text-center">Which computer is this?</h1>
            <p className="mt-2 text-center text-zinc-400">
              FPV Card Boss runs on both. Pick the operating system you're using so the app drives
              GoPro Player and your drives the right way.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['win', 'mac'] as Platform[]).map((p) => {
                const selected = highlight === p;
                return (
                  <button
                    key={p}
                    onClick={() => setHighlight(p)}
                    onDoubleClick={() => choose(p)}
                    className={[
                      'relative flex flex-col items-center gap-3 rounded-xl border p-6 transition',
                      selected
                        ? 'border-transparent bg-gradient-to-br from-fuchsia-500/20 to-violet-600/20 ring-2 ring-fuchsia-500'
                        : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-500',
                    ].join(' ')}
                  >
                    {selected && (
                      <span className="absolute top-3 right-3 text-fuchsia-400"><Check size={18} /></span>
                    )}
                    {p === 'mac' ? <Laptop size={40} className="text-zinc-200" />
                                 : <Monitor size={40} className="text-zinc-200" />}
                    <span className="text-lg font-semibold text-white">
                      {p === 'mac' ? 'Mac' : 'Windows PC'}
                    </span>
                    {detected === p && (
                      <span className="text-xs text-fuchsia-300">Detected on this machine</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => choose(highlight)}
              className="mt-8 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600
                         px-6 py-3 text-base font-semibold text-white hover:opacity-90 transition"
            >
              Continue as {highlight === 'mac' ? 'Mac' : 'Windows PC'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
