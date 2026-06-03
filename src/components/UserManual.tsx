import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props { isOpen: boolean; onClose: () => void; }

/* ── tiny styled building blocks (match the app's dark / neon look) ── */
function Sec({ n, title, sub, children }: { n: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-4 pt-2">
      <div className="flex items-center gap-3">
        <span className="flex-none w-9 h-9 rounded-xl flex items-center justify-center text-base font-black text-slate-950"
          style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}>{n}</span>
        <h3 className="text-xl md:text-2xl font-black tracking-tight text-white">{title}</h3>
      </div>
      {sub && <p className="text-slate-400 text-sm mt-1 ml-12">{sub}</p>}
      <div className="mt-3 ml-0 md:ml-12 space-y-3 text-[13.5px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}
function Call({ type = 'note', title, children }: { type?: 'note' | 'tip' | 'warn' | 'danger'; title: string; children: ReactNode }) {
  const c = {
    note:   { b: 'border-cyan-400/60',   t: 'text-cyan-300' },
    tip:    { b: 'border-emerald-400/60', t: 'text-emerald-300' },
    warn:   { b: 'border-amber-400/60',  t: 'text-amber-300' },
    danger: { b: 'border-rose-400/60',   t: 'text-rose-300' },
  }[type];
  return (
    <div className={`rounded-xl border border-slate-700 ${c.b} border-l-4 bg-white/[0.04] p-3.5`}>
      <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${c.t}`}>{title}</div>
      <div className="text-[12.5px] text-slate-300 leading-relaxed">{children}</div>
    </div>
  );
}
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-none w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-slate-950"
            style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}>{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}
const K = ({ children }: { children: ReactNode }) =>
  <code className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/25 text-cyan-300">{children}</code>;

export default function UserManual({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const toc = [
    ['1', 'First-Time Setup'], ['2', 'The Core Workflow'], ['3', 'Auto Mode & Horizon Lock'],
    ['4', 'The Mobile Companion'], ['5', 'Shot List on the Phone'], ['6', 'The Festival Slate'], ['7', 'Tips & Troubleshooting'],
  ];

  return (
    <div className="fixed inset-0 z-[9000] bg-black/80 backdrop-blur-md flex items-stretch justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="bg-slate-950 rounded-3xl w-full max-w-4xl h-full flex flex-col overflow-hidden shadow-2xl border border-slate-800"
        onClick={e => e.stopPropagation()}
        style={{ backgroundImage: 'radial-gradient(ellipse at 0% 100%, rgba(0,229,255,.07) 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, rgba(180,79,255,.09) 0%, transparent 50%)' }}>

        {/* HEADER */}
        <div className="px-5 sm:px-7 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}>📖</span>
            <div>
              <h2 className="text-lg md:text-xl font-black tracking-widest text-white">USER MANUAL</h2>
              <p className="text-[11px] text-slate-500 -mt-0.5">How to set up &amp; use FPV Card Boss</p>
            </div>
          </div>
          <button onClick={onClose} className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-base font-black transition hover:bg-rose-500/30">✕</button>
        </div>

        {/* BODY */}
        <div className="flex-grow overflow-y-auto px-5 sm:px-8 py-6 space-y-8">

          {/* Contents */}
          <div className="flex flex-wrap gap-2">
            {toc.map(([n, t]) => (
              <a key={n} href={`#man-${n}`} className="text-xs font-bold px-3 py-1.5 rounded-full border border-slate-700 bg-white/[0.03] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition">
                <span className="text-cyan-400 mr-1">{n}</span>{t}
              </a>
            ))}
          </div>

          <div id="man-1"><Sec n="1" title="First-Time Setup" sub="Do this once on this computer. Open Setup.">
            <p><strong className="text-white">Folder paths.</strong> Point each path at this computer's folders: Local root, Media drive, Bella drive, Raw Dump folder, SD Card drive, GoPro output folder, and the GoPro App path.</p>
            <p><strong className="text-white">Calibrate the GoPro Robot.</strong> Run <K>🎯 Calibrate GoPro Robot</K> and follow the 14 steps — hover each control in GoPro Player and press <K>SPACE</K> to capture it, including the Horizon Lock point.</p>
            <Call type="danger" title="Calibration is per-computer">It's saved for this machine and its exact screen resolution. Re-calibrate on any new computer, or if you change display scaling/resolution.</Call>
            <p><strong className="text-white">Phone "Move Files" password.</strong> Set a simple password in Setup (shown in plain text). It only gates the Move Files section on the phone; the Shot List &amp; Slate stay open. Leave blank for none.</p>
          </Sec></div>

          <div id="man-2"><Sec n="2" title="The Core Workflow" sub="Festival mode — from card in hand to delivered & logged.">
            <Steps items={[
              <span><strong className="text-white">① Create Directory Paths.</strong> Pick the pilot/card, then the big green button makes this card's folders.</span>,
              <span><strong className="text-white">② Copy SD Card → Local RAW.</strong> The amber button beneath it copies the SD card in and verifies the file count.</span>,
              <span><strong className="text-white">Set export options.</strong> Toggle Horizon Lock on if this batch needs it (see Section 3).</span>,
              <span><strong className="text-white">🤖 Auto-Run GoPro Batch.</strong> The robot drives GoPro Player. <em className="text-rose-300">Don't touch the mouse/keyboard while it runs.</em></span>,
              <span><strong className="text-white">Move files to STABILIZED.</strong> When the export finishes, move the clips into the card's STABILIZED folder.</span>,
              <span><strong className="text-white">Deliver.</strong> Copy to Media Drive, Copy to Bella Drive, and Dump Raws as needed.</span>,
              <span><strong className="text-white">Complete Card &amp; Shift.</strong> Logs the card and advances to the next.</span>,
            ]} />
            <Call type="tip" title="From the couch">Every delivery step can also be triggered from your phone's Move Files section (Section 4).</Call>
          </Sec></div>

          <div id="man-3"><Sec n="3" title="Auto Mode & Horizon Lock" sub="Hands-free delivery and the level-horizon toggle.">
            <p><strong className="text-white">Auto Mode.</strong> Use the big AUTO / MANUAL button above "Auto-Run GoPro Batch".</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">Manual</strong> — you click Move, each delivery, and Complete yourself (the default).</li>
              <li><strong className="text-white">Auto</strong> — when an export finishes it auto-moves → Media → Bella → completes the card and advances. If any step fails it stops and alerts you, and never completes a card that didn't fully deliver.</li>
            </ul>
            <Call type="note" title="Raws are always manual">Dumping raws is never part of Auto mode (or the phone's Send to All) — it's always a deliberate click on the Dump Raws button.</Call>
            <p><strong className="text-white">Horizon Lock.</strong> Toggle it ON (turns blue 🌐) before running a batch and the robot enables Horizon Lock in the exporter so footage exports level. If it's on but not calibrated, the app warns and skips it — re-calibrate to enable.</p>
          </Sec></div>

          <div id="man-4"><Sec n="4" title="The Mobile Companion" sub="Run the shot list, slate, and deliveries from your phone.">
            <p><strong className="text-white">Connect.</strong> In Setup, under "Open on your phone", scan a QR code with your phone or tap Copy.</p>
            <Steps items={[
              <span><strong className="text-white">★ Best (offline + mic):</strong> the <strong className="text-white">Tailscale HTTPS</strong> address (<K>https://…ts.net</K>). Phone needs the Tailscale app on. Open it once online, then <strong className="text-white">Add to Home Screen</strong> — now the Shot List &amp; Slate open even with the computer OFF, and the slate mic works.</span>,
              <span><strong className="text-white">Same Wi-Fi (quick):</strong> the <K>192.168.x.x</K> address — online only, no offline/mic.</span>,
              <span><strong className="text-white">Add to Home Screen</strong> (Share menu) for a full-screen app and saved data.</span>,
            ]} />
            <Call type="note" title="Why HTTPS matters">Offline caching and microphone access are only allowed by browsers over a secure (HTTPS) address — that's the Tailscale HTTPS link. Plain <K>http://</K> addresses work online but can't go offline or record.</Call>
            <p className="font-bold text-white mt-2">The three sections:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="text-cyan-300 font-bold">📋 Shot List &amp; Slate</span> — open to anyone; works offline.</li>
              <li><span className="text-purple-300 font-bold">🎬 Simple Slate</span> — the slate on its own.</li>
              <li><span className="text-amber-300 font-bold">🔒 Move Files</span> — live status &amp; delivery; asks for your password.</li>
            </ul>
            <Call type="note" title="Delivery mode (Move Files)">Starts on <strong>Manual</strong> (tap each delivery). <strong>⚡ Auto · Send to All</strong> is one tap that moves the files and copies to every set-up drive (Media + Bella) at once — you still dump raws and complete the card yourself. After raws are backed up, a <strong>🗑 Delete SD Card</strong> button appears so you can finish the whole process from the phone.</Call>
          </Sec></div>

          <div id="man-5"><Sec n="5" title="Shot List on the Phone" sub="Build it, import it, mark it — and keep the computer in sync.">
            <p className="font-bold text-white">Three ways to add shots:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">➕ Add Shot</strong> — Artist, Stage, Festival (+ optional Pilot/Day); keep adding more.</li>
              <li><strong className="text-white">📄 Add CSV</strong> — paste rows or upload a <K>.csv/.txt</K> (columns: Artist, Stage, Festival, Pilot, Day).</li>
              <li><strong className="text-white">⤵ Import PC</strong> — pull the computer's loaded list onto the phone (each row links 1:1 to the computer).</li>
            </ul>
            <p><strong className="text-white">Mark Done / Skip.</strong> For shots imported from the computer, marking Done or Skipped updates the same row on the computer and triggers a <strong className="text-rose-300">red blinking light + ding</strong> there, so the editor knows that artist's footage is incoming.</p>
            <Call type="tip" title="Works off-network">If you mark a shot while off Wi-Fi or before Tailscale reconnects, it's queued and retried automatically — it reaches the computer when you're back. A "⏳ waiting to sync" note shows while pending.</Call>
            <p>Your selected <strong className="text-white">pilot and day are remembered</strong> — back out, open the slate, or close the app and you return to your pilot/day. The list also opens with the computer off.</p>
          </Sec></div>

          <div id="man-6"><Sec n="6" title="The Festival Slate" sub="A high-contrast digital slate with GoPro time-sync.">
            <p>Open it from any shot (🎬 <strong className="text-white">Slate</strong>, pre-filled) or from <strong className="text-white">Simple Slate</strong> on the home screen. Use <strong className="text-white">‹ Back</strong> to return where you came from.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">GoPro Labs sync QR</strong> — scan with a GoPro to sync its clock/timecode. Modes: Stable, Med, Fast, Freeze. Live TC for 24/25/30/60 fps.</li>
              <li><strong className="text-white">Take counter</strong> — bumps save back to the linked shot and are remembered.</li>
              <li><strong className="text-white">Themes</strong>, <strong className="text-white">landscape lock</strong>, and a clean <strong className="text-white">fullscreen</strong> slate for the camera.</li>
            </ul>
            <Call type="note" title="Mic & screen-wake need the HTTPS address">Audio take-recording and keeping the screen awake only work when you open the app via the <strong>Tailscale HTTPS</strong> address (Section 4). Over a plain <K>http://</K> address browsers block them. Everything else works on any address.</Call>
          </Sec></div>

          <div id="man-7"><Sec n="7" title="Tips & Troubleshooting" sub="Quick answers to common situations.">
            <ul className="space-y-2">
              <li><strong className="text-white">Phone says "Offline":</strong> make sure the app is open on the PC and you're on the same Wi-Fi (or Tailscale is on and you used the 100.x address). Shot List &amp; Slate still work offline.</li>
              <li><strong className="text-white">Marking a shot doesn't update the computer:</strong> tap <strong>⤵ Import PC</strong> once to link your shots 1:1; then Done/Skip syncs and lights up.</li>
              <li><strong className="text-white">Phone shows an old screen after an update:</strong> reload the page; the build at the very bottom should match. On a home-screen app, close and reopen it.</li>
              <li><strong className="text-white">Robot clicks the wrong spots:</strong> re-run Calibrate GoPro Robot (it's tied to this PC's resolution/scaling).</li>
              <li><strong className="text-white">Moving to a new computer:</strong> just copy the app; then redo Setup — paths, calibration, and password are per-computer.</li>
            </ul>
            <div className="text-center text-slate-500 text-xs pt-4">
              <div className="inline-block w-11 h-11 rounded-xl leading-[44px] text-2xl" style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}>🎬</div>
              <div className="mt-2 font-black tracking-widest text-white">FPV CARD BOSS</div>
              <div>Fly safe. Stabilize everything. Deliver from anywhere.</div>
            </div>
          </Sec></div>

        </div>
      </div>
    </div>
  );
}
