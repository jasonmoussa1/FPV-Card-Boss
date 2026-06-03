import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import HelpButton from './HelpButton';

interface UrlItem { label: string; url: string; }
interface Props {
  httpsUrl?: string;                 // Tailscale HTTPS (recommended — offline + mic)
  urls: UrlItem[];                   // LAN / Tailscale http addresses
}

/* One scannable, copyable address card. */
function UrlCard({ url, title, blurb, accent, big }: { url: string; title: string; blurb: string; accent: 'green' | 'cyan' | 'slate'; big?: boolean }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { width: big ? 280 : 200, margin: 1, color: { dark: '#0a0c12', light: '#ffffff' } })
      .then(d => { if (live) setQr(d); }).catch(() => {});
    return () => { live = false; };
  }, [url, big]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const ring = accent === 'green' ? 'border-emerald-400/50' : accent === 'cyan' ? 'border-cyan-400/40' : 'border-slate-700';
  const titleColor = accent === 'green' ? 'text-emerald-300' : accent === 'cyan' ? 'text-cyan-300' : 'text-slate-300';

  return (
    <div className={`rounded-2xl border ${ring} bg-white/[0.04] p-4 flex gap-4 items-center ${big ? 'flex-col sm:flex-row' : ''}`}>
      <div className="shrink-0 bg-white rounded-xl p-2" style={{ width: big ? 132 : 92, height: big ? 132 : 92 }}>
        {qr && <img src={qr} alt="QR code" className="w-full h-full" />}
      </div>
      <div className="flex-grow min-w-0 w-full">
        <div className={`text-xs font-black uppercase tracking-widest ${titleColor}`}>{title}</div>
        <p className="text-[11px] text-slate-400 mt-0.5 mb-2 leading-snug">{blurb}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[12px] font-mono text-slate-200 bg-black/30 border border-slate-700 rounded-lg px-2.5 py-1.5 break-all select-all flex-grow min-w-0">{url}</code>
          <button onClick={copy}
            className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition ${copied ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PhoneAccessPanel({ httpsUrl, urls }: Props) {
  const lan = urls.filter(u => u.label.startsWith('LAN'));
  const tsHttp = urls.filter(u => u.label.startsWith('Tailscale'));

  return (
    <div className="space-y-3 bg-slate-950 rounded-2xl p-4 border border-slate-800">
      <div className="flex items-center gap-2">
        <span className="text-base">📱</span>
        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Open on your phone</p>
        <HelpButton id="phoneAccess" size="md" />
      </div>
      <p className="text-[11px] text-slate-500 -mt-1">Scan the QR with your phone's camera, or tap Copy and paste the link. Then use <strong className="text-slate-300">Add to Home Screen</strong>.</p>

      {httpsUrl ? (
        <UrlCard
          url={httpsUrl}
          title="★ Recommended — Tailscale (HTTPS)"
          blurb="Works anywhere (Tailscale on). Add to Home Screen and the Shot List & Slate open even with the computer OFF — and the slate mic works. Best for the field."
          accent="green"
          big
        />
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            For an offline-capable app + slate mic, set up the Tailscale HTTPS address (it needs the Tailscale app installed and Serve enabled on your tailnet). The LAN address below works on the same Wi-Fi.
          </p>
        </div>
      )}

      {tsHttp.map((u, i) => (
        <UrlCard key={`ts-${i}`} url={u.url} title="Tailscale (HTTP)" blurb="Works anywhere with Tailscale on, but does NOT support offline or the slate mic (no HTTPS)." accent="cyan" />
      ))}
      {lan.map((u, i) => (
        <UrlCard key={`lan-${i}`} url={u.url} title="Same Wi-Fi (LAN)" blurb="Quick access on the same Wi-Fi network. Online only." accent="slate" />
      ))}

      {urls.length === 0 && !httpsUrl && (
        <p className="text-xs text-slate-500 italic">No address detected yet — connect to Wi-Fi (or start Tailscale) and reopen Setup.</p>
      )}
    </div>
  );
}
