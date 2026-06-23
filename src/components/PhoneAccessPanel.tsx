import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import HelpButton from './HelpButton';

interface UrlItem { label: string; url: string; }
interface Props {
  httpsUrl?: string;                 // Tailscale HTTPS (recommended — offline + mic)
  urls: UrlItem[];                   // LAN / Tailscale http addresses
}

type Accent = 'green' | 'cyan' | 'slate';

/* One collapsible, scannable, copyable address card.
   Collapsed by default: shows only the label + description (NO QR), so a phone
   camera can never lock onto the wrong code. Tap the header to reveal its QR. */
function UrlCard({ url, title, blurb, accent, big, open, onToggle }: {
  url: string; title: string; blurb: string; accent: Accent; big?: boolean;
  open: boolean; onToggle: () => void;
}) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  // Only build (and therefore render) the QR while this card is expanded.
  useEffect(() => {
    if (!open) { setQr(''); return; }
    let live = true;
    QRCode.toDataURL(url, { width: big ? 280 : 200, margin: 1, color: { dark: '#0a0c12', light: '#ffffff' } })
      .then(d => { if (live) setQr(d); }).catch(() => {});
    return () => { live = false; };
  }, [url, big, open]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const ring = accent === 'green' ? 'border-emerald-400/50' : accent === 'cyan' ? 'border-cyan-400/40' : 'border-slate-700';
  const titleColor = accent === 'green' ? 'text-emerald-300' : accent === 'cyan' ? 'text-cyan-300' : 'text-slate-300';
  const dot = accent === 'green' ? 'bg-emerald-400' : accent === 'cyan' ? 'bg-cyan-400' : 'bg-slate-500';

  return (
    <div className={`rounded-2xl border ${ring} bg-white/[0.04] overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.03] transition"
      >
        <span className={`shrink-0 mt-1 h-2.5 w-2.5 rounded-full ${dot}`} />
        <div className="flex-grow min-w-0">
          <div className={`text-xs font-black uppercase tracking-widest ${titleColor}`}>{title}</div>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{blurb}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-black text-slate-500 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className={`px-4 pb-4 flex gap-4 items-center ${big ? 'flex-col sm:flex-row' : ''}`}>
          <div className="shrink-0 bg-white rounded-xl p-2" style={{ width: big ? 132 : 92, height: big ? 132 : 92 }}>
            {qr && <img src={qr} alt="QR code" className="w-full h-full" />}
          </div>
          <div className="flex-grow min-w-0 w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-[12px] font-mono text-slate-200 bg-black/30 border border-slate-700 rounded-lg px-2.5 py-1.5 break-all select-all flex-grow min-w-0">{url}</code>
              <button onClick={copy}
                className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition ${copied ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardDef { key: string; url: string; title: string; blurb: string; accent: Accent; big?: boolean; }

export default function PhoneAccessPanel({ httpsUrl, urls }: Props) {
  const lan = urls.filter(u => u.label.startsWith('LAN'));
  const tsHttp = urls.filter(u => u.label.startsWith('Tailscale'));

  const cards: CardDef[] = [];
  if (httpsUrl) {
    cards.push({
      key: 'https',
      url: httpsUrl,
      title: '★ Recommended — Tailscale (HTTPS)',
      blurb: 'Works anywhere (Tailscale on). Add to Home Screen and the Shot List & Slate open even with the computer OFF — and the slate mic works. Best for the field.',
      accent: 'green',
      big: true,
    });
  }
  tsHttp.forEach((u, i) => cards.push({
    key: `ts-${i}`,
    url: u.url,
    title: 'Tailscale (HTTP)',
    blurb: 'Works anywhere with Tailscale on, but does NOT support offline or the slate mic (no HTTPS).',
    accent: 'cyan',
  }));
  lan.forEach((u, i) => cards.push({
    key: `lan-${i}`,
    url: u.url,
    title: 'Same Wi-Fi (LAN)',
    blurb: 'Quick access on the same Wi-Fi network. Online only.',
    accent: 'slate',
  }));

  // All collapsed by default; tapping one opens it and closes any other.
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="space-y-3 bg-slate-950 rounded-2xl p-4 border border-slate-800">
      <div className="flex items-center gap-2">
        <span className="text-base">📱</span>
        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Open on your phone</p>
        <HelpButton id="phoneAccess" size="md" />
      </div>
      <p className="text-[11px] text-slate-500 -mt-1">Tap a connection below to reveal its QR code, then scan it with your phone's camera (or tap Copy and paste the link). Then use <strong className="text-slate-300">Add to Home Screen</strong>. Only one code shows at a time, so your camera won't grab the wrong one.</p>

      {!httpsUrl && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            For an offline-capable app + slate mic, set up the Tailscale HTTPS address (it needs the Tailscale app installed and Serve enabled on your tailnet). The LAN address below works on the same Wi-Fi.
          </p>
        </div>
      )}

      {cards.map(c => (
        <UrlCard
          key={c.key}
          url={c.url}
          title={c.title}
          blurb={c.blurb}
          accent={c.accent}
          big={c.big}
          open={openKey === c.key}
          onToggle={() => setOpenKey(prev => (prev === c.key ? null : c.key))}
        />
      ))}

      {urls.length === 0 && !httpsUrl && (
        <p className="text-xs text-slate-500 italic">No address detected yet — connect to Wi-Fi (or start Tailscale) and reopen Setup.</p>
      )}
    </div>
  );
}
