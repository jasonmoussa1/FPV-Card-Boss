import { useEffect, useState } from 'react';
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

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/[0.06] border border-slate-700 text-slate-200">{children}</span>;
}

export default function UserManual({ isOpen, onClose }: Props) {
  const [mode, setMode] = useState<'full' | 'quick'>('full');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const toc = [
    ['1', 'The Job & The SOP'], ['2', 'First-Time Setup'], ['3', 'Windows & Mac'],
    ['4', 'The Core Workflow'], ['5', 'Stabilization & Calibration'],
    ['6', 'Auto · Horizon Lock · Dual'], ['7', 'The Mobile Companion'],
    ['8', 'Shot List'], ['9', 'The Festival Slate'], ['10', 'Site Map & Connecting'],
    ['11', 'Simple Mode'], ['12', 'Tips & Troubleshooting'],
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
              <p className="text-[11px] text-slate-500 -mt-0.5">Everything about the app, the job &amp; the stabilization SOP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Full ↔ Quick toggle */}
            <div className="flex rounded-xl border border-slate-700 overflow-hidden text-[11px] font-black">
              <button onClick={() => setMode('full')}
                className={`px-3 py-2 transition ${mode === 'full' ? 'bg-cyan-400/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
                FULL ONBOARDING
              </button>
              <button onClick={() => setMode('quick')}
                className={`px-3 py-2 transition ${mode === 'quick' ? 'bg-cyan-400/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>
                QUICK REFERENCE
              </button>
            </div>
            <button onClick={onClose} className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-base font-black transition hover:bg-rose-500/30">✕</button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-grow overflow-y-auto px-5 sm:px-8 py-6 space-y-8">

          {mode === 'quick' ? <QuickReference /> : (
          <>
          {/* Contents */}
          <div className="flex flex-wrap gap-2">
            {toc.map(([n, t]) => (
              <a key={n} href={`#man-${n}`} className="text-xs font-bold px-3 py-1.5 rounded-full border border-slate-700 bg-white/[0.03] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition">
                <span className="text-cyan-400 mr-1">{n}</span>{t}
              </a>
            ))}
          </div>
          <p className="text-[12px] text-slate-500">New here? Read top to bottom. Done it before? Flip to <button onClick={() => setMode('quick')} className="text-cyan-300 font-bold underline">Quick Reference</button> for the one-page cheat sheet.</p>

          <div id="man-1"><Sec n="1" title="The Job & The SOP" sub="What you're actually doing out here.">
            <p>You are the <strong className="text-white">stabilizer operator</strong> for an FPV drone team at a music festival (EDC Las Vegas, Beyond Wonderland, and the like). Pilots fly all night and hand you SD cards — often at 3&nbsp;AM, out of order, several at once. Your job: get every card's footage <strong className="text-white">copied, stabilized, and delivered</strong> to the right places before the editors need it, and logged so nothing gets lost.</p>
            <p><strong className="text-white">The non-negotiable rule:</strong> never destroy the originals. Footage always lives in two halves — <Pill>RAW</Pill> the untouched clips straight off the card, and <Pill>STABILIZED</Pill> the smoothed exports. If anything goes wrong later, you can always re-export from RAW.</p>
            <p><strong className="text-white">Why stabilize at all.</strong> FPV drones are tiny and twitchy; raw footage is unusably shaky. GoPro Player&apos;s HyperSmooth&nbsp;Pro (ReelSteady) flattens that motion. Every clip from every pilot must use the <em>same</em> settings so the footage cuts together cleanly in the edit — that consistency is the entire reason this app exists. The app drives GoPro Player for you (a &quot;robot&quot;) so the settings are identical every single time and you&apos;re not hand-clicking sliders at 3&nbsp;AM.</p>
            <p><strong className="text-white">Where footage goes:</strong> your fast <strong className="text-white">Local</strong> drive (where you work), the <strong className="text-white">Media Drive</strong> (the master archive — RAW + STABILIZED together, named by card ID), and the <strong className="text-white">Bella / Social drive</strong> (stabilized only, named by artist — the social team must never get raws). Then the card is logged in the shared <strong className="text-white">Media Master</strong> sheet.</p>
            <Call type="tip" title="The whole loop in one breath">Card in hand → make folders → copy card to RAW → robot stabilizes → move exports to STABILIZED → copy to Media + Bella → log it → wipe the card → next.</Call>
          </Sec></div>

          <div id="man-2"><Sec n="2" title="First-Time Setup" sub="Do this once on each computer. Open Setup.">
            <Steps items={[
              <span><strong className="text-white">Pick your platform.</strong> On first launch the app asks <em>&quot;Which computer is this — Windows PC or Mac?&quot;</em> Choose the one you&apos;re on (it pre-selects the detected OS). You can change it later from the badge in the corner.</span>,
              <span><strong className="text-white">Set the folder paths.</strong> Point each at this computer&apos;s locations: Local root, Media drive, Bella drive, Raw Dump folder, SD Card drive/volume, and the GoPro output folder.</span>,
              <span><strong className="text-white">Add your pilots.</strong> Each pilot gets a card prefix and starting number (e.g. <K>L</K> from 1 → <K>L_001</K>, <K>L_002</K>…).</span>,
              <span><strong className="text-white">Calibrate the GoPro robot.</strong> Run <K>🎯 Calibrate GoPro Robot</K> and follow the 14 steps — hover each control in GoPro Player and press <K>SPACE</K> (Section 5).</span>,
              <span><strong className="text-white">Set the phone password</strong> (optional). Gates only the Move Files section on the phone; the Shot List &amp; Slate stay open. Blank = no gate.</span>,
            ]} />
            <Call type="danger" title="Calibration is per-computer and per-resolution">It&apos;s saved for this machine at its exact screen resolution. Re-calibrate on a new computer, or if you change display scaling/resolution, or move/resize the GoPro window.</Call>
          </Sec></div>

          <div id="man-3"><Sec n="3" title="Windows & Mac — One App, Both" sub="The app runs identically on a PC and a Mac.">
            <p>FPV Card Boss is <strong className="text-white">one-to-one across platforms</strong>: same workflow, same buttons, same settings, same mobile companion. The app picks the right engine based on the platform you chose at launch.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">What&apos;s identical:</strong> the whole UI, the shot list, the slate, deliveries, the Google Sheet log, and the GoPro export settings.</li>
              <li><strong className="text-white">What differs under the hood:</strong> file copying uses Robocopy on Windows and <K>rsync</K> on Mac; the robot uses a Windows mouse engine vs. a native Mac one; GoPro exports land in <K>Videos</K> on Windows and <K>~/Movies</K> on Mac. You don&apos;t have to think about any of that.</li>
            </ul>
            <Call type="warn" title="Mac: grant two permissions once">On a Mac, the first time you run the robot, macOS will ask for <strong className="text-white">Accessibility</strong> (so the app can move the mouse/keyboard) and <strong className="text-white">Screen Recording</strong> (so calibration can read the screen). Approve both in System&nbsp;Settings ▸ Privacy &amp; Security. One-time, like the Windows firewall prompt.</Call>
            <Call type="note" title="Calibration is separate per machine">Your Windows calibration and your Mac calibration are stored independently, so calibrating on the Mac never touches your PC setup. Calibrate once on each.</Call>
          </Sec></div>

          <div id="man-4"><Sec n="4" title="The Core Workflow" sub="Festival mode — from card in hand to delivered & logged.">
            <Steps items={[
              <span><strong className="text-white">① Pick the card&apos;s assignment.</strong> Confirm the active pilot and day, then pick the artist/shot (use <K>Choose From List</K> if cards came in out of order). This sets the card ID and folder names.</span>,
              <span><strong className="text-white">② Create Directory Paths.</strong> The big green button makes this card&apos;s RAW &amp; STABILIZED folders locally, on the Media Drive, and the artist folder on Bella.</span>,
              <span><strong className="text-white">③ Copy SD Card → Local RAW.</strong> Copies the card in and verifies the file count and size. (If RAW already has files, it copies into a fresh <K>BATCH_02</K> subfolder so the robot only stabilizes the new clips.)</span>,
              <span><strong className="text-white">④ Set export options.</strong> Toggle Horizon Lock or Dual Mode if this batch needs them (Section 6).</span>,
              <span><strong className="text-white">⑤ 🤖 Auto-Run GoPro Batch.</strong> The robot drives GoPro Player. <em className="text-rose-300">Hands off the mouse &amp; keyboard until it finishes.</em></span>,
              <span><strong className="text-white">⑥ Move Files → STABILIZED.</strong> When the export finishes, move the new clips into the card&apos;s STABILIZED folder (it only grabs files created after the robot started).</span>,
              <span><strong className="text-white">⑦ Deliver.</strong> Copy to Media Drive, Copy to Bella, and Dump Raws as needed.</span>,
              <span><strong className="text-white">⑧ Complete Card.</strong> Logs the card to history, advances the number, and clears for the next. Then update the Media Master sheet.</span>,
            ]} />
            <Call type="tip" title="From the couch">Every step from ⑥ on can also be triggered from your phone&apos;s Move Files section (Section 7) — or run hands-free with Auto mode (Section 6).</Call>
          </Sec></div>

          <div id="man-5"><Sec n="5" title="Stabilization Settings & Calibration" sub="The locked-in look, and teaching the robot your screen.">
            <p className="font-bold text-white">The SOP export settings (every clip, every pilot):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Codec <Pill>HEVC (H.265) 10-bit</Pill></li>
              <li><Pill>HyperSmooth Pro ON</Pill></li>
              <li>Smoothness <Pill>15</Pill> · Cropping <Pill>15</Pill></li>
              <li>Aspect Ratio <Pill>8:7</Pill> (widest field of view)</li>
            </ul>
            <Call type="note" title="Why un-gain matters">Smoothness and Cropping are linked by default — moving one drags the other. The robot first clicks the <strong className="text-white">un-gain / chain-link</strong> button to unlink them, so it can set each to 15 independently. That&apos;s why it&apos;s a calibration point.</Call>
            <p><strong className="text-white">Calibration (14 points).</strong> GoPro Player can&apos;t be driven normally, so the app physically moves the mouse. It needs to know where each control sits. Hover each and press <K>SPACE</K>, in order: batch list, 10-bit, HyperSmooth, un-gain, Horizon Lock, Smoothness start &amp; end, Cropping start &amp; end, aspect-ratio open, 8:7 option, drop zone, Start, and Remove.</p>
            <Call type="danger" title="Re-calibrate when the window moves">The robot clicks fixed screen positions. If you move or resize the GoPro window, change resolution, or switch computers, re-calibrate or it clicks the wrong spots.</Call>
          </Sec></div>

          <div id="man-6"><Sec n="6" title="Auto Mode · Horizon Lock · Dual" sub="Hands-free delivery, level horizon, and both-versions export.">
            <p><strong className="text-white">Auto vs Manual (the big button above Auto-Run).</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">Manual</strong> (default) — you click Move, each delivery, and Complete yourself.</li>
              <li><strong className="text-white">Auto</strong> — when an export finishes it auto-moves → Media → Bella → completes the card and advances. If any step fails it stops and alerts you, and never completes a card that didn&apos;t fully deliver.</li>
            </ul>
            <Call type="note" title="Raws are always manual">Dumping raws is never part of Auto mode or the phone&apos;s &quot;Send to All&quot; — it&apos;s always a deliberate click (unless you turn on Auto-Dump in Setup).</Call>
            <p><strong className="text-white">Horizon Lock.</strong> Toggle it ON (turns blue 🌐) before running a batch and the robot enables Horizon Lock in the exporter so footage exports level. If it&apos;s on but not calibrated, the app warns and skips it — re-calibrate to enable.</p>
            <p><strong className="text-white">Dual Mode — both versions in one run.</strong> Turn on Dual Mode and the robot exports every clip <strong className="text-white">twice</strong>: first a normal pass (lands in <K>STABILIZED</K>), then a second pass with Horizon Lock on (lands in a <K>STABILIZED\HORIZON LOCK</K> subfolder). Editors get both the regular and the level-horizon version with no filename collisions. It takes roughly twice as long and also needs the Horizon Lock calibration point.</p>
            <Call type="tip" title="When to use Dual">Use it when the team hasn&apos;t decided whether they want locked or unlocked horizon for a set — you deliver both and they choose in the edit.</Call>
          </Sec></div>

          <div id="man-7"><Sec n="7" title="The Mobile Companion" sub="Run the shot list, slate, and deliveries from your phone.">
            <p><strong className="text-white">Connect.</strong> In Setup, under &quot;Open on your phone&quot;, scan a QR code or tap Copy (Section 10 covers the addresses). Then <strong className="text-white">Add to Home Screen</strong> for a full-screen app.</p>
            <p className="font-bold text-white mt-2">The sections on the phone:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="text-cyan-300 font-bold">📋 Shot List &amp; Slate</span> — open to anyone; works offline.</li>
              <li><span className="text-purple-300 font-bold">🎬 Simple Slate</span> — the slate on its own.</li>
              <li><span className="text-emerald-300 font-bold">🗺️ Site Map</span> — the venue map image (Section 10).</li>
              <li><span className="text-amber-300 font-bold">🔒 Move Files</span> — live status &amp; delivery; asks for your password.</li>
            </ul>
            <Call type="note" title="Delivery from the phone">Move Files shows the live card status and progress. <strong>⚡ Auto · Send to All</strong> is one tap that moves the files and copies to every set-up drive (Media + Bella) at once. After raws are backed up, a <strong>🗑 Delete SD Card</strong> button appears so you can finish the whole card from your phone.</Call>
          </Sec></div>

          <div id="man-8"><Sec n="8" title="The Shot List" sub="Build it, import it, mark it — synced both ways.">
            <p className="font-bold text-white">Three ways to fill it:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">Load Sample EDC</strong> — the built-in EDC 2026 list for practice.</li>
              <li><strong className="text-white">Import CSV</strong> — the production&apos;s real list (drag a <K>.csv</K> onto the window). Columns: Artist, Stage, Festival, Pilot, Day.</li>
              <li><strong className="text-white">Add by hand</strong> — on the desktop panel or the phone.</li>
            </ul>
            <p><strong className="text-white">Status &amp; sync.</strong> Each shot is <Pill>pending</Pill>, <Pill>completed</Pill>, or <Pill>skipped</Pill>. Marking Done/Skip on the phone updates the same row on the computer and fires a <strong className="text-rose-300">red blink + ding</strong> there, so the editor knows that artist&apos;s footage is incoming. Skipped shots drop out of the &quot;next card&quot; queue. Off-network changes queue and retry automatically.</p>
            <p>The phone keeps the list <strong className="text-white">in sync with the computer automatically</strong> — change the shot list on the PC and the phones update within a few seconds, with no &quot;Import&quot; step. Anything already marked completed or skipped stays that way; only new or future shots change.</p>
            <p>Take counts captured on the slate sync back onto the matching shot.</p>
          </Sec></div>

          <div id="man-9"><Sec n="9" title="The Festival Slate" sub="A high-contrast digital slate with GoPro time-sync.">
            <p>Open it from any shot (🎬 <strong className="text-white">Slate</strong>, pre-filled) or from <strong className="text-white">Simple Slate</strong> on the home screen.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">GoPro Labs sync QR</strong> — scan with a GoPro to sync its clock/timecode. Modes: Stable, Med, Fast, Freeze. Live TC for 24/25/30/60 fps.</li>
              <li><strong className="text-white">Take counter</strong> — bumps save back to the linked shot.</li>
              <li><strong className="text-white">Themes</strong>, <strong className="text-white">landscape lock</strong>, and a clean <strong className="text-white">fullscreen</strong> slate for the camera.</li>
            </ul>
            <Call type="note" title="Mic & screen-wake need the HTTPS address">Audio take-recording and keeping the screen awake only work when you open the app via the <strong>Tailscale HTTPS</strong> address (Section 10). Over plain <K>http://</K> browsers block them.</Call>
          </Sec></div>

          <div id="man-10"><Sec n="10" title="Site Map & Connecting the Phone" sub="The venue map, and the three ways to reach the app.">
            <p><strong className="text-white">Site Map.</strong> In Setup ▸ Mobile Dashboard, add a venue map image (PNG/JPG/WEBP/GIF/BMP/SVG). It shows full-screen on the phone, works offline once cached, and updates on every phone instantly when you replace it.</p>
            <p className="font-bold text-white mt-2">Three addresses (shown as QR codes in Setup):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-emerald-300">★ Tailscale (HTTPS)</strong> — <K>https://…ts.net</K>. The best one: works anywhere with Tailscale on, opens the Shot List &amp; Slate even with the computer OFF, and enables the slate mic. Add it to the Home Screen.</li>
              <li><strong className="text-white">Tailscale (HTTP)</strong> — works anywhere with Tailscale on, but online-only (no offline, no mic).</li>
              <li><strong className="text-white">Same Wi-Fi (LAN, 192.168…)</strong> — quick access on the same Wi-Fi. Online-only.</li>
            </ul>
            <Call type="note" title="Why HTTPS is special">Browsers only allow offline caching and microphone access over a secure (HTTPS) address — that&apos;s the Tailscale HTTPS link. Open it once while the computer is running (Tailscale on) so the phone saves a copy; after that it works offline.</Call>
          </Sec></div>

          <div id="man-11"><Sec n="11" title="Simple Mode" sub="A lighter flow when there's no shot list.">
            <p>Switch to <strong className="text-white">Simple mode</strong> for one-off or non-assignment work. Instead of picking an artist from a shot list, you just type a folder name; the app makes RAW/STABILIZED under <K>Local\[Show]\[Folder]</K>, runs the same SD-copy and robot, and copies to Media/Bella by toggle. There&apos;s no shot-list queue, no Dump Raws, and no Complete-and-advance — it&apos;s the fast path for simple jobs.</p>
          </Sec></div>

          <div id="man-12"><Sec n="12" title="Tips & Troubleshooting" sub="Quick answers to common situations.">
            <ul className="space-y-2">
              <li><strong className="text-white">Robot clicks the wrong spots:</strong> re-run Calibrate GoPro Robot (it&apos;s tied to this computer&apos;s resolution/scaling and the GoPro window position).</li>
              <li><strong className="text-white">Mac robot does nothing / errors:</strong> grant Accessibility + Screen Recording in System Settings ▸ Privacy &amp; Security, then re-run.</li>
              <li><strong className="text-white">File count doesn&apos;t match:</strong> the export may have missed a clip — re-run rather than delivering an incomplete card. You can override the move if you&apos;re sure.</li>
              <li><strong className="text-white">Phone says &quot;Offline&quot;:</strong> make sure the app is open on the computer and you&apos;re on the same Wi-Fi (or Tailscale is on). Shot List &amp; Slate still work offline.</li>
              <li><strong className="text-white">Marking a shot doesn&apos;t update the computer:</strong> make sure the phone is connected (Tailscale on or same Wi-Fi). The list auto-syncs every few seconds and your Done/Skip marks queue and retry until they land — there&apos;s no import step anymore.</li>
              <li><strong className="text-white">Phone shows an old screen after an update:</strong> reload the page; the build at the very bottom should match. On a home-screen app, close and reopen.</li>
              <li><strong className="text-white">Moving to a new computer:</strong> copy the app, then redo Setup — paths, calibration, and password are per-computer.</li>
            </ul>
            <div className="text-center text-slate-500 text-xs pt-4">
              <div className="inline-block w-11 h-11 rounded-xl leading-[44px] text-2xl" style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}>🎬</div>
              <div className="mt-2 font-black tracking-widest text-white">FPV CARD BOSS</div>
              <div>Fly safe. Stabilize everything. Deliver from anywhere.</div>
            </div>
          </Sec></div>
          </>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Quick Reference: one-page cheat sheet for someone who's done it before ── */
function QuickReference() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-black text-white">Quick Reference</h3>
        <p className="text-slate-400 text-sm">The whole job on one screen. Need the why? Flip back to Full Onboarding.</p>
      </div>

      <Call type="note" title="The loop">
        Pick assignment → <strong>Create Folders</strong> → <strong>Copy SD → RAW</strong> → set Horizon/Dual → <strong>🤖 Auto-Run GoPro</strong> (hands off) → <strong>Move Files</strong> → <strong>Copy Media</strong> + <strong>Copy Bella</strong> → <strong>Dump Raws</strong> → <strong>Complete Card</strong> → update Media Master → wipe card.
      </Call>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Export settings (every clip)</div>
          <ul className="text-[13px] text-slate-300 space-y-1">
            <li>Codec: <Pill>HEVC 10-bit</Pill></li>
            <li>HyperSmooth Pro: <Pill>ON</Pill></li>
            <li>Smoothness <Pill>15</Pill> · Cropping <Pill>15</Pill></li>
            <li>Aspect: <Pill>8:7</Pill></li>
            <li>Un-gain unlinks the sliders first.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Folder map</div>
          <ul className="text-[13px] text-slate-300 space-y-1">
            <li><strong className="text-white">Local:</strong> Event\Pilot\Day\Artist\RAW + STABILIZED</li>
            <li><strong className="text-white">Media:</strong> [CardID]\ (RAW + STABILIZED)</li>
            <li><strong className="text-white">Bella:</strong> [Artist]\ (STABILIZED only)</li>
            <li><strong className="text-white">Dual:</strong> STABILIZED\HORIZON LOCK\ (2nd pass)</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Calibration order (14, press SPACE)</div>
          <p className="text-[12.5px] text-slate-300">batch list · 10-bit · HyperSmooth · un-gain · Horizon Lock · Smoothness start/end · Cropping start/end · aspect open · 8:7 · drop zone · Start · Remove</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Modes</div>
          <ul className="text-[13px] text-slate-300 space-y-1">
            <li><strong className="text-white">Horizon Lock:</strong> one level-horizon export.</li>
            <li><strong className="text-white">Dual:</strong> regular + Horizon Lock (2× time).</li>
            <li><strong className="text-white">Auto:</strong> move→Media→Bella→complete; raws stay manual.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Phone connect</div>
          <ul className="text-[13px] text-slate-300 space-y-1">
            <li>★ Tailscale <strong className="text-white">HTTPS</strong> = offline + mic. Add to Home Screen.</li>
            <li>Tailscale HTTP / LAN = online only.</li>
            <li>Open once online so it caches.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300 mb-2">Media Master sheet</div>
          <ul className="text-[13px] text-slate-300 space-y-1">
            <li>Tab: <strong className="text-white">FILM CREW</strong></li>
            <li>B = Card ID · C = Size GB</li>
            <li>I = Artist · J = COMPLETED</li>
            <li>Update only after Media has the full folder.</li>
          </ul>
        </div>
      </div>

      <Call type="warn" title="Mac one-time">Grant Accessibility + Screen Recording (System Settings ▸ Privacy &amp; Security). Calibration is separate from Windows.</Call>
      <Call type="danger" title="If the robot misses">Re-calibrate (per computer + resolution + window position). Never deliver a card whose file count doesn&apos;t match.</Call>
    </div>
  );
}
