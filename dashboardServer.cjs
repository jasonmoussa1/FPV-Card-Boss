/**
 * Live mobile dashboard server for FPV Card Boss.
 *
 * Embeds an HTTP (Express) + WebSocket ('ws') server that serves an installable,
 * self-contained PWA. Phones on the same LAN or Tailscale tailnet open the URL,
 * "Add to Home Screen", and watch live robot/export progress + trigger actions
 * (Move Files, Auto/Manual mode) over the WebSocket.
 *
 * This module owns transport + the PWA assets only. The app's state, the active
 * job context, the shared move function and the auto-move rule live in main.cjs,
 * which wires in via the { onMove, onSetMode, getSnapshot } callbacks and pushes
 * updates through broadcast().
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');

// ── LAN / Tailscale URL detection ────────────────────────────────────────────
function detectUrls(port) {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      // Node 18+ may report family as 'IPv4' or 4
      const isV4 = ni.family === 'IPv4' || ni.family === 4;
      if (!isV4 || ni.internal) continue;
      const ip = ni.address;
      const o = ip.split('.').map(Number);
      let label = null;
      if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) label = 'Tailscale';
      else if (o[0] === 192 && o[1] === 168) label = 'LAN (Wi-Fi/Ethernet)';
      else if (o[0] === 10) label = 'LAN (Wi-Fi/Ethernet)';
      else if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) label = 'LAN (Wi-Fi/Ethernet)';
      if (label) urls.push({ label, url: `http://${ip}:${port}` });
    }
  }
  // Tailscale first (stable across networks), then LAN.
  urls.sort((a, b) => (a.label.startsWith('Tailscale') ? -1 : 1) - (b.label.startsWith('Tailscale') ? -1 : 1));
  return urls;
}

// ── Static PWA assets (served inline; icons read from /assets) ────────────────
const ICON_DIR = path.join(__dirname, 'assets');
let _iconCache = {};
function readIcon(file) {
  if (_iconCache[file]) return _iconCache[file];
  try { _iconCache[file] = fs.readFileSync(path.join(ICON_DIR, file)); } catch { _iconCache[file] = Buffer.alloc(0); }
  return _iconCache[file];
}

const MANIFEST = JSON.stringify({
  name: 'FPV Card Boss',
  short_name: 'Card Boss',
  description: 'Live FPV stabilizer dashboard',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#050508',
  theme_color: '#00e5ff',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

const SERVICE_WORKER = `
const SHELL = 'fpvcb-shell-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache live data / non-GET. Only the static app shell is cached.
  if (e.request.method !== 'GET') return;
  if (ASSETS.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
    );
  }
});
`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<title>FPV Card Boss</title>
<meta name="theme-color" content="#00e5ff" />
<link rel="manifest" href="/manifest.webmanifest" />
<!-- iOS Add to Home Screen -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Card Boss" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<link rel="icon" href="/icon-192.png" />
<style>
  :root{
    --cyan:#00e5ff; --purple:#b44fff; --green:#00ff88; --red:#ff5c7c; --amber:#ffb020;
    --bg:#050508; --panel:rgba(255,255,255,.05); --line:rgba(255,255,255,.10); --muted:rgba(255,255,255,.5);
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  html,body{margin:0;height:100%;}
  body{
    background:
      radial-gradient(ellipse at 0% 100%, rgba(10,42,42,.9) 0%, transparent 52%),
      radial-gradient(ellipse at 100% 0%, rgba(42,10,58,.9) 0%, transparent 52%),
      var(--bg);
    color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    min-height:100%;padding:env(safe-area-inset-top) 16px calc(env(safe-area-inset-bottom) + 16px);
    -webkit-user-select:none;user-select:none;
  }
  .wrap{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-top:14px;}
  header{display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .brand{display:flex;align-items:center;gap:10px;}
  .brand img{width:38px;height:38px;border-radius:9px;}
  .brand h1{font-size:17px;letter-spacing:2px;margin:0;font-weight:900;}
  .conn{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .dot{width:10px;height:10px;border-radius:50%;background:var(--red);box-shadow:0 0 10px var(--red);}
  .dot.on{background:var(--green);box-shadow:0 0 10px var(--green);}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;backdrop-filter:blur(16px);}
  .label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:800;}
  .big{font-size:30px;font-weight:900;letter-spacing:1px;margin-top:2px;word-break:break-word;}
  .row{display:flex;justify-content:space-between;gap:12px;}
  .kv{flex:1;min-width:0;}
  .kv .v{font-size:16px;font-weight:800;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .state{text-align:center;padding:20px 14px;border-radius:18px;border:1px solid var(--line);}
  .state .st{font-size:26px;font-weight:900;letter-spacing:1px;}
  .state.idle{background:rgba(255,255,255,.04);} .state.idle .st{color:var(--muted);}
  .state.running{background:rgba(0,229,255,.10);border-color:rgba(0,229,255,.4);} .state.running .st{color:var(--cyan);}
  .state.complete{background:rgba(0,255,136,.10);border-color:rgba(0,255,136,.4);} .state.complete .st{color:var(--green);}
  .state.error{background:rgba(255,92,124,.12);border-color:rgba(255,92,124,.45);} .state.error .st{color:var(--red);}
  .bar{height:14px;border-radius:8px;background:rgba(0,0,0,.4);overflow:hidden;margin-top:12px;border:1px solid var(--line);}
  .bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--cyan),var(--purple));transition:width .3s ease;}
  .sub{font-size:13px;color:var(--muted);margin-top:8px;font-variant-numeric:tabular-nums;}
  .toggle{display:flex;border:1px solid var(--line);border-radius:14px;overflow:hidden;}
  .toggle button{flex:1;padding:14px;background:transparent;color:var(--muted);font-weight:900;font-size:13px;letter-spacing:1px;border:0;text-transform:uppercase;}
  .toggle button.active{background:linear-gradient(135deg,var(--cyan),var(--purple));color:#050508;}
  .move{width:100%;padding:22px;border:0;border-radius:18px;font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase;
    background:linear-gradient(135deg,var(--green),#00cc6a);color:#04210f;box-shadow:0 8px 30px rgba(0,255,136,.3);}
  .move:disabled{background:rgba(255,255,255,.06);color:rgba(255,255,255,.25);box-shadow:none;}
  .move.warn{background:linear-gradient(135deg,var(--red),#c8324c);color:#fff;box-shadow:0 8px 30px rgba(255,92,124,.3);}
  .activity{font-size:12px;color:var(--muted);text-align:center;min-height:16px;}
  .hint{font-size:11px;color:rgba(255,255,255,.35);text-align:center;}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand"><img src="/icon-192.png" alt=""/><h1>CARD BOSS</h1></div>
      <div class="conn"><span class="dot" id="dot"></span><span id="connTxt">Connecting</span></div>
    </header>

    <div class="card">
      <div class="label">Current Card</div>
      <div class="big" id="cardId">—</div>
      <div class="row" style="margin-top:12px">
        <div class="kv"><div class="label">Pilot</div><div class="v" id="pilot">—</div></div>
        <div class="kv"><div class="label">Artist</div><div class="v" id="artist">—</div></div>
      </div>
    </div>

    <div class="state idle" id="stateBox">
      <div class="label">Status</div>
      <div class="st" id="stateTxt">IDLE</div>
      <div class="bar"><i id="barFill"></i></div>
      <div class="sub" id="progress">Waiting for a job…</div>
    </div>

    <div>
      <div class="label" style="margin-bottom:6px">Move Mode</div>
      <div class="toggle">
        <button id="mAuto" onclick="setMode('auto')">Auto</button>
        <button id="mManual" onclick="setMode('manual')">Manual</button>
      </div>
    </div>

    <button class="move" id="moveBtn" disabled onclick="doMove()">Move Files</button>
    <div class="activity" id="activity"></div>
    <div class="hint">Live over Wi-Fi / Tailscale · pull to refresh if disconnected</div>
  </div>

<script>
  var ws=null, retry=null, status={};
  function el(id){return document.getElementById(id);}
  function fmtMB(mb){ if(!mb) return '0 MB'; if(mb>=1024) return (mb/1024).toFixed(2)+' GB'; return mb+' MB'; }

  function connect(){
    try{ if(ws){ws.close();} }catch(e){}
    var proto = location.protocol==='https:'?'wss':'ws';
    ws = new WebSocket(proto+'://'+location.host+'/');
    ws.onopen=function(){ el('dot').classList.add('on'); el('connTxt').textContent='Live'; };
    ws.onclose=function(){ el('dot').classList.remove('on'); el('connTxt').textContent='Offline'; scheduleRetry(); };
    ws.onerror=function(){ try{ws.close();}catch(e){} };
    ws.onmessage=function(ev){ try{ var m=JSON.parse(ev.data); if(m.type==='status'){ status=m.status||{}; render(); } }catch(e){} };
  }
  function scheduleRetry(){ if(retry) return; retry=setTimeout(function(){ retry=null; connect(); },2000); }

  function send(obj){ try{ if(ws&&ws.readyState===1) ws.send(JSON.stringify(obj)); }catch(e){} }
  function setMode(mode){ send({cmd:'setMode',mode:mode}); }
  function doMove(){
    var s=status.state;
    if(s==='error' || mismatch()){ if(!confirm('File count looks off or the export errored. Move the files anyway?')) return; }
    send({cmd:'move'});
  }
  function mismatch(){ return status.state==='complete' && status.expectedCount>0 && status.fileCount!==status.expectedCount; }

  function render(){
    el('cardId').textContent = status.cardId || '—';
    el('pilot').textContent  = status.pilotName || '—';
    el('artist').textContent = status.artistName || '—';

    var st = status.state || 'idle';
    var box = el('stateBox');
    box.className = 'state '+st;
    var label = {idle:'IDLE',running:'RUNNING',complete:'COMPLETE',error:'ERROR'}[st]||st.toUpperCase();
    if(mismatch()) label='CHECK COUNT';
    el('stateTxt').textContent = label;

    var fc=status.fileCount||0, ec=status.expectedCount||0;
    var pct = ec>0 ? Math.min(100, Math.round(fc/ec*100)) : (st==='complete'?100:(st==='running'?6:0));
    el('barFill').style.width = pct+'%';
    var cl = status.countLabel || (ec>0? (fc+' of '+ec+' files') : (fc?fc+' file(s)':'—'));
    el('progress').textContent = cl + ' · ' + fmtMB(status.totalSizeMB||0);

    // Mode toggle
    el('mAuto').classList.toggle('active', status.moveMode==='auto');
    el('mManual').classList.toggle('active', status.moveMode!=='auto');

    // Move button: enabled when complete or on error/mismatch (with confirm)
    var btn=el('moveBtn');
    var canMove = (st==='complete' || st==='error');
    btn.disabled = !canMove;
    var warn = (st==='error' || mismatch());
    btn.classList.toggle('warn', warn);
    btn.textContent = warn ? 'Move Files Anyway' : (status.lastMovedCount>0 && st==='complete' ? 'Files Moved ('+status.lastMovedCount+')' : 'Move Files');

    el('activity').textContent = status.lastActivity || '';
  }

  connect();
  // Reconnect when the phone wakes / returns to the app
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && (!ws||ws.readyState!==1)) connect(); });
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }
</script>
</body>
</html>`;

// ── Server factory ───────────────────────────────────────────────────────────
function createDashboard({ onMove, onSetMode, getSnapshot }) {
  const app = express();
  let server = null;
  let wss = null;
  let currentPort = null;
  const clients = new Set();

  app.get('/', (_req, res) => res.type('html').send(PAGE));
  app.get('/manifest.webmanifest', (_req, res) => res.type('application/manifest+json').send(MANIFEST));
  app.get('/sw.js', (_req, res) => res.type('application/javascript').send(SERVICE_WORKER));
  app.get('/icon-192.png', (_req, res) => res.type('png').send(readIcon('icon-192.png')));
  app.get('/icon-512.png', (_req, res) => res.type('png').send(readIcon('icon-512.png')));
  app.get('/apple-touch-icon.png', (_req, res) => res.type('png').send(readIcon('icon-192.png')));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  function broadcast(status) {
    const msg = JSON.stringify({ type: 'status', status });
    for (const ws of clients) {
      try { if (ws.readyState === 1) ws.send(msg); } catch {}
    }
  }

  function start(port) {
    stop();
    currentPort = port;
    server = http.createServer(app);
    wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
      clients.add(ws);
      try { ws.send(JSON.stringify({ type: 'status', status: getSnapshot() })); } catch {}
      ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (msg && msg.cmd === 'move') {
          Promise.resolve(onMove()).catch(() => {});
        } else if (msg && msg.cmd === 'setMode' && (msg.mode === 'auto' || msg.mode === 'manual')) {
          try { onSetMode(msg.mode); } catch {}
        }
      });
      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
    });
    server.on('error', (e) => { console.error('[dashboard] server error:', e && e.message); });
    server.listen(port, '0.0.0.0', () => {
      console.log('[dashboard] listening on 0.0.0.0:' + port);
    });
  }

  function stop() {
    for (const ws of clients) { try { ws.close(); } catch {} }
    clients.clear();
    try { if (wss) wss.close(); } catch {}
    try { if (server) server.close(); } catch {}
    wss = null;
    server = null;
  }

  function getInfo() {
    return { port: currentPort, running: !!server, urls: currentPort ? detectUrls(currentPort) : [] };
  }

  return { start, stop, broadcast, getInfo };
}

module.exports = { createDashboard, detectUrls };
