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

// Bump this whenever the PWA page/SW changes. It is shown in the page footer and
// returned by /state so we can confirm the phone is loading the FRESH page (not a
// stale service-worker cache). If the phone footer shows an older stamp, its PWA
// cache is stale → remove/re-add the app or clear site data.
const PAGE_BUILD = 'pwa-2026-06-02-p-clean';
// When this server process started — proves the phone is talking to a fresh run.
const SERVER_STARTED = new Date().toISOString();

// ── Static PWA assets (served inline; icons read from /assets) ────────────────
const ICON_DIR = path.join(__dirname, 'assets');
let _iconCache = {};
function readIcon(file) {
  if (_iconCache[file]) return _iconCache[file];
  try { _iconCache[file] = fs.readFileSync(path.join(ICON_DIR, file)); } catch { _iconCache[file] = Buffer.alloc(0); }
  return _iconCache[file];
}

// The slate is built as one self-contained HTML file at dist-slate/index.html.
const SLATE_PATH = path.join(__dirname, 'dist-slate', 'index.html');
let _slateHtml = null;
function readSlate() {
  if (_slateHtml != null) return _slateHtml;
  try { _slateHtml = fs.readFileSync(SLATE_PATH, 'utf8'); }
  catch { _slateHtml = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#050505;color:#fff;padding:24px">Slate not built yet.</body>'; }
  return _slateHtml;
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

// Offline-capable service worker so the Shot List & Slate open even when the
// computer is OFF. It is NETWORK-FIRST for the shell pages (always fresh when the
// computer is reachable, cache only as offline fallback) and does NOT touch the
// live data endpoints (/state, /shotlist, /cmd, /unlock, …) — those are network-
// only, so there is never a stale-data trap. Cache name is tied to PAGE_BUILD so a
// new build replaces the old cache.
const SERVICE_WORKER = `
const SHELL = 'fpvcb-${PAGE_BUILD}';
const SHELL_ASSETS = ['/', '/slate', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isShell = url.pathname === '/' || url.pathname === '/slate' || SHELL_ASSETS.includes(url.pathname);
  if (!isShell) return; // live endpoints: straight to network, never cached
  // Network-first: fresh when online, cached copy only when the network fails.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
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
  /* Per-destination delivery actions — mirror the GoPro batch player's end buttons */
  .deliv{display:flex;flex-direction:column;gap:10px;}
  .act{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:15px 16px;border:1px solid var(--line);border-radius:14px;
    background:var(--panel);color:#fff;text-align:left;}
  .act .t{font-size:14px;font-weight:900;letter-spacing:.5px;}
  .act .d{font-size:10px;color:var(--muted);font-family:ui-monospace,Menlo,monospace;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .act:disabled{opacity:.4;}
  .act.media{border-color:rgba(255,176,32,.35);} .act.media .t{color:var(--amber);}
  .act.bella{border-color:rgba(180,79,255,.35);} .act.bella .t{color:var(--purple);}
  .act.dump{border-color:rgba(0,229,255,.30);} .act.dump .t{color:var(--cyan);}
  .act.busy{box-shadow:0 0 0 1px var(--cyan) inset;}
  .act.done{border-color:rgba(0,255,136,.4);} .act.done .t{color:var(--green);}
  .act.complete{align-items:center;padding:20px;border:0;background:linear-gradient(135deg,var(--green),#00cc6a);color:#04210f;box-shadow:0 8px 30px rgba(0,255,136,.25);}
  .act.complete .t{color:#04210f;font-size:16px;letter-spacing:1.5px;text-transform:uppercase;}
  .act.complete:disabled{background:rgba(255,255,255,.06);color:rgba(255,255,255,.25);box-shadow:none;}
  .bhint{font-size:11px;color:var(--amber);text-align:center;margin-top:-4px;min-height:14px;}
  /* Shot list (view-only) */
  .slbtn{width:100%;padding:15px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:#fff;font-weight:900;font-size:14px;letter-spacing:1px;text-transform:uppercase;}
  /* Home cards */
  #home{display:flex;flex-direction:column;gap:14px;}
  .homecard{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:20px 18px;border-radius:18px;border:1px solid var(--line);background:var(--panel);color:#fff;}
  .homecard.shots{border-color:rgba(0,229,255,.35);box-shadow:0 0 18px rgba(0,229,255,.10);}
  .homecard.slate{border-color:rgba(180,79,255,.35);box-shadow:0 0 18px rgba(180,79,255,.10);}
  .homecard.move{border-color:rgba(255,176,32,.35);box-shadow:0 0 18px rgba(255,176,32,.10);}
  .slmini.csv{border-color:rgba(180,79,255,.35);color:var(--purple);}
  .hc-ic{font-size:30px;line-height:1;}
  .hc-tx{display:flex;flex-direction:column;}
  .hc-t{font-size:17px;font-weight:900;letter-spacing:.5px;}
  .hc-d{font-size:11px;color:var(--muted);margin-top:3px;}
  /* Section headers / shot-list controls */
  .slhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
  .slhead h2{font-size:16px;font-weight:900;letter-spacing:2px;margin:0;}
  .slrow2{display:flex;gap:8px;}
  .slmini{flex:1;padding:12px;border-radius:12px;border:1px solid var(--line);background:#11131a;color:#fff;font-weight:800;font-size:12px;}
  .slmini.add{border-color:rgba(0,229,255,.4);color:var(--cyan);}
  .slmini.imp{border-color:rgba(180,79,255,.35);color:var(--purple);}
  .slclose{background:rgba(255,92,124,.15);color:var(--red);border:1px solid rgba(255,92,124,.3);border-radius:10px;padding:9px 16px;font-weight:800;font-size:13px;}
  .slsel{flex:1;min-width:0;padding:12px;border-radius:12px;background:#11131a;color:#fff;border:1px solid var(--line);font-weight:700;font-size:14px;}
  .slitem{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:8px;}
  .slitem .a{font-size:15px;font-weight:900;line-height:1.25;}
  .slitem .m{font-size:11px;color:var(--muted);margin-top:4px;font-family:ui-monospace,Menlo,monospace;word-break:break-word;}
  .slitem.done{border-color:rgba(0,255,136,.4);} .slitem.done .a{color:var(--green);text-decoration:line-through;}
  .slitem.skip{border-color:rgba(255,92,124,.35);opacity:.78;} .slitem.skip .a{color:var(--red);}
  .slbadge{display:inline-block;font-size:9px;font-weight:900;padding:2px 7px;border-radius:6px;text-transform:uppercase;letter-spacing:1px;margin-left:6px;vertical-align:middle;}
  .slday{font-size:11px;font-weight:900;color:var(--amber);text-transform:uppercase;letter-spacing:2px;margin:18px 0 2px;}
  .slactions{display:flex;gap:6px;margin-top:11px;flex-wrap:wrap;}
  .slact{flex:1;min-width:72px;padding:10px 8px;border-radius:10px;border:1px solid var(--line);background:#11131a;color:#fff;font-weight:800;font-size:12px;}
  .slact.done.on{background:rgba(0,255,136,.18);color:var(--green);border-color:rgba(0,255,136,.45);}
  .slact.skip.on{background:rgba(255,92,124,.18);color:var(--red);border-color:rgba(255,92,124,.45);}
  .slact.save{background:var(--green);color:#04210f;border:0;}
  .slact.del{flex:0 0 auto;min-width:0;background:rgba(255,92,124,.15);color:var(--red);}
  .slact.slate{background:linear-gradient(135deg,rgba(0,229,255,.18),rgba(180,79,255,.18));color:var(--cyan);border-color:rgba(0,229,255,.4);}
  .sled{display:block;font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:8px;flex:1;}
  .sled input,.sled textarea{width:100%;margin-top:4px;padding:10px;border-radius:10px;background:#11131a;color:#fff;border:1px solid var(--line);font-size:14px;font-weight:600;font-family:inherit;}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand"><img src="/icon-192.png" alt=""/><h1>CARD BOSS</h1></div>
      <div class="conn"><span class="dot" id="dot"></span><span id="connTxt">Connecting</span></div>
    </header>

    <!-- HOME: pick a section -->
    <div id="home">
      <button class="homecard shots" onclick="openShotList()">
        <span class="hc-ic">📋</span>
        <span class="hc-tx"><span class="hc-t">Shot List &amp; Slate</span><span class="hc-d">Build your shot list &amp; run the festival slate. Works offline.</span></span>
      </button>
      <button class="homecard slate" onclick="openSimpleSlate()">
        <span class="hc-ic">🎬</span>
        <span class="hc-tx"><span class="hc-t">Simple Slate</span><span class="hc-d">Open the festival slate on its own — type artist/stage and go.</span></span>
      </button>
      <button class="homecard move" onclick="openMove()">
        <span class="hc-ic">🔒</span>
        <span class="hc-tx"><span class="hc-t">Move Files / Stabilizer</span><span class="hc-d">Live status &amp; file delivery. Password required.</span></span>
      </button>
    </div>

    <!-- MOVE FILES (password-gated live dashboard) -->
    <div id="movePanel" style="display:none">
      <div class="slhead"><h2>🗂 MOVE FILES</h2><button class="slclose" onclick="showHome()">‹ Back</button></div>
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
        <div class="label" style="margin:10px 0 6px">Move Mode</div>
        <div class="toggle">
          <button id="mAuto" onclick="setMode('auto')">Auto</button>
          <button id="mManual" onclick="setMode('manual')">Manual</button>
        </div>
      </div>
      <button class="move" id="moveBtn" disabled onclick="doMove()" style="margin-top:12px">Move Files</button>
      <div class="bhint" id="moveHint"></div>
      <div class="label" style="margin-top:6px">Deliver To</div>
      <div class="deliv">
        <button class="act media" id="mediaBtn" disabled onclick="send({cmd:'copyMedia'})">
          <span class="t" id="mediaT">Copy to Media Drive</span><span class="d" id="mediaD">RAW + STABILIZED</span>
        </button>
        <button class="act bella" id="bellaBtn" disabled onclick="send({cmd:'copyBella'})">
          <span class="t" id="bellaT">Copy to Bella Drive</span><span class="d" id="bellaD">STABILIZED only</span>
        </button>
        <button class="act dump" id="dumpBtn" disabled onclick="send({cmd:'dumpRaws'})">
          <span class="t" id="dumpT">Dump Raws</span><span class="d" id="dumpD">Rod dump folder</span>
        </button>
        <button class="act complete" id="completeBtn" disabled onclick="doComplete()">
          <span class="t" id="completeT">🚀 Complete Card &amp; Shift to Next</span><span class="d" id="completeD"></span>
        </button>
      </div>
      <div class="activity" id="activity"></div>
    </div>

    <!-- SHOT LIST & SLATE (open to all; phone-owned, works offline) -->
    <div id="slPanel" style="display:none">
      <div class="slhead"><h2>📋 SHOT LIST</h2><button class="slclose" onclick="showHome()">‹ Back</button></div>
      <div class="slrow2">
        <button class="slmini add" onclick="slToggleAdd()">➕ Add Shot</button>
        <button class="slmini csv" onclick="slCsvToggle()">📄 Add CSV</button>
        <button class="slmini imp" onclick="slImport()">⤵ Import PC</button>
      </div>
      <div id="slAddForm" style="display:none"></div>
      <div id="slCsvForm" style="display:none"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <select id="slPilot" class="slsel" onchange="renderShotlist()"></select>
        <select id="slDay" class="slsel" onchange="renderShotlist()"></select>
      </div>
      <div class="sub" id="slSummary" style="margin-top:10px"></div>
      <div id="slList"></div>
    </div>
    <div class="hint" id="buildStamp">build ${PAGE_BUILD}</div>
  </div>

<script>
  // NOTE: do NOT name this 'status' — window.status is a built-in that coerces any
  // assigned value to a string, so 'status = {...}' silently became "[object Object]"
  // and every field read back undefined (rendered as '—'). That was the root cause.
  var ws=null, retry=null, appStatus={}, lastOk=0;
  function el(id){return document.getElementById(id);}
  function fmtMB(mb){ if(!mb) return '0 MB'; if(mb>=1024) return (mb/1024).toFixed(2)+' GB'; return mb+' MB'; }

  function setConn(on){ if(on){ el('dot').classList.add('on'); el('connTxt').textContent='Live'; } else { el('dot').classList.remove('on'); el('connTxt').textContent='Offline'; } }
  function applyStatus(s){ appStatus=s||{}; lastOk=Date.now(); setConn(true); try{ render(); }catch(e){ try{ console.error('render', e); }catch(_){} } }

  // ── PRIMARY data path: poll /state over plain HTTP (the path that works on this
  // network even when WebSocket frames don't arrive on the phone). ──
  function poll(){
    fetch('/state',{cache:'no-store'}).then(function(r){ return r.json(); })
      .then(function(d){ applyStatus(d.status); })
      .catch(function(){ if(Date.now()-lastOk>5000) setConn(false); });
  }

  // ── Optional accelerator: WebSocket for instant pushes. Not required — if it
  // never delivers messages, polling keeps everything live. ──
  function connect(){
    try{ if(ws){ws.close();} }catch(e){}
    try{
      var proto = location.protocol==='https:'?'wss':'ws';
      ws = new WebSocket(proto+'://'+location.host+'/');
      ws.onopen=function(){ lastOk=Date.now(); setConn(true); };
      ws.onclose=function(){ scheduleRetry(); };
      ws.onerror=function(){ try{ws.close();}catch(e){} };
      ws.onmessage=function(ev){ try{ var m=JSON.parse(ev.data); if(m.type==='status'){ applyStatus(m.status); } }catch(e){} };
    }catch(e){}
  }
  function scheduleRetry(){ if(retry) return; retry=setTimeout(function(){ retry=null; connect(); },4000); }

  // ── Commands: POST over HTTP so buttons work even without a usable WebSocket. ──
  function send(obj){
    fetch('/cmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)})
      .then(function(){ setTimeout(poll,150); })
      .catch(function(){});
  }
  function setMode(mode){ send({cmd:'setMode',mode:mode}); }
  function doMove(){
    var s=appStatus.state;
    if(s==='error' || mismatch()){ if(!confirm('File count looks off or the export errored. Move the files anyway?')) return; }
    send({cmd:'move'});
  }
  function mismatch(){ return appStatus.state==='complete' && appStatus.expectedCount>0 && appStatus.fileCount!==appStatus.expectedCount; }
  function doComplete(){
    if(!confirm('Complete the current card and shift to the next one?')) return;
    send({cmd:'completeCard'});
  }

  // Wire one delivery button to its reported availability + progress state.
  // Sub-label shows WHY it's greyed out when unavailable, else the destination.
  function renderAct(btnId, txtId, descId, available, st, dest, hint, labels){
    var btn=el(btnId);
    btn.disabled = !available || st==='copying' || st==='dumping';
    btn.classList.toggle('busy', st==='copying'||st==='dumping');
    btn.classList.toggle('done', st==='success');
    el(txtId).textContent = labels[st] || labels.idle;
    if(descId) el(descId).textContent = available ? (dest || '') : (hint || '');
  }

  function render(){
    el('cardId').textContent = appStatus.cardId || '—';
    el('pilot').textContent  = appStatus.pilotName || '—';
    el('artist').textContent = appStatus.artistName || '—';

    var st = appStatus.state || 'idle';
    var box = el('stateBox');
    box.className = 'state '+st;
    var label = {idle:'IDLE',running:'RUNNING',complete:'COMPLETE',error:'ERROR'}[st]||st.toUpperCase();
    if(mismatch()) label='CHECK COUNT';
    el('stateTxt').textContent = label;

    var fc=appStatus.fileCount||0, ec=appStatus.expectedCount||0;
    var pct = ec>0 ? Math.min(100, Math.round(fc/ec*100)) : (st==='complete'?100:(st==='running'?6:0));
    el('barFill').style.width = pct+'%';
    var cl = appStatus.countLabel || (ec>0? (fc+' of '+ec+' files') : (fc?fc+' file(s)':'—'));
    el('progress').textContent = cl + ' · ' + fmtMB(appStatus.totalSizeMB||0);

    // Mode toggle
    el('mAuto').classList.toggle('active', appStatus.moveMode==='auto');
    el('mManual').classList.toggle('active', appStatus.moveMode!=='auto');

    // Move button: enabled when complete or on error/mismatch (with confirm)
    var btn=el('moveBtn');
    var canMove = (st==='complete' || st==='error');
    btn.disabled = !canMove;
    var warn = (st==='error' || mismatch());
    btn.classList.toggle('warn', warn);
    btn.textContent = warn ? 'Move Files Anyway' : (appStatus.lastMovedCount>0 && st==='complete' ? 'Files Moved ('+appStatus.lastMovedCount+')' : 'Move Files');
    el('moveHint').textContent = canMove ? '' : (st==='running' ? 'Waiting for export to finish…' : 'Run a card on the computer to begin');

    // Per-destination delivery actions (mirror the desktop GoPro batch player)
    renderAct('mediaBtn','mediaT','mediaD', appStatus.mediaAvailable, appStatus.mediaState, appStatus.mediaDest, appStatus.mediaHint,
      {idle:'Copy to Media Drive', copying:'Copying to Media…', success:'✓ Copied to Media Drive', error:'Media copy failed — tap to retry'});
    renderAct('bellaBtn','bellaT','bellaD', appStatus.bellaAvailable, appStatus.bellaState, appStatus.bellaDest, appStatus.bellaHint,
      {idle:'Copy to Bella Drive', copying:'Copying to Bella…', success:'✓ Copied to Bella Drive', error:'Bella copy failed — tap to retry'});
    renderAct('dumpBtn','dumpT','dumpD', appStatus.dumpAvailable, appStatus.dumpState, appStatus.dumpDest, appStatus.dumpHint,
      {idle:'Dump Raws', dumping:'Dumping raws…', success:'✓ Raws dumped', error:'Dump failed — tap to retry'});
    el('completeBtn').disabled = !appStatus.completeAvailable;
    el('completeD').textContent = appStatus.completeAvailable ? '' : (appStatus.completeHint || '');

    el('activity').textContent = appStatus.lastActivity || '';
  }

  // ── NAVIGATION: Home / Shot List & Slate / Move Files ──
  // Remember the current view so returning from the slate (or a reload) lands you
  // back where you were instead of always on Home.
  function setView(v){ try{ sessionStorage.setItem('fpvcb_view', v); }catch(e){} }
  function showHome(){ el('home').style.display='flex'; el('slPanel').style.display='none'; el('movePanel').style.display='none'; slEditId=null; setView('home'); }
  function openShotList(){ el('home').style.display='none'; el('movePanel').style.display='none'; el('slPanel').style.display='block'; setView('shots'); loadShots(); renderShotlist(); }
  // Move Files is password-gated; the password is set on the computer.
  function revealMove(){ el('home').style.display='none'; el('slPanel').style.display='none'; el('movePanel').style.display='block'; setView('move'); poll(); }
  function openMove(){
    if(sessionStorage.getItem('fpvcb_unlocked')==='1'){ revealMove(); return; }
    fetch('/lock',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
      if(!d.locked){ revealMove(); return; }
      var pw=prompt('Enter the Move Files password (set on the computer):');
      if(pw===null) return;
      fetch('/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pw:pw})}).then(function(r){return r.json();}).then(function(u){
        if(u.ok){ sessionStorage.setItem('fpvcb_unlocked','1'); revealMove(); } else alert('Wrong password.');
      }).catch(function(){ alert('Could not reach the computer to check the password.'); });
    }).catch(function(){ alert('The computer isn’t reachable. The Move Files section needs the computer running and on the same network.'); });
  }

  // Simple Slate: open the festival slate on its own (no shot context).
  function openSimpleSlate(){ window.location.href='/slate'; }

  // ── SHOT LIST — phone-owned, stored on THIS device (works offline) ──
  var SHOT_KEY='fpvcb_shots';
  var shotItems=[], slEditId=null, slAddOpen=false, slCsvOpen=false;
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escA(s){ return esc(s).replace(/"/g,'&quot;'); }
  function slFind(id){ for(var i=0;i<shotItems.length;i++){ if(shotItems[i].id===id) return shotItems[i]; } return null; }
  function uid(){ return 'shot-'+Date.now()+'-'+Math.random().toString(36).slice(2,7); }
  function loadShots(){ try{ shotItems=JSON.parse(localStorage.getItem(SHOT_KEY)||'[]')||[]; }catch(e){ shotItems=[]; } populateShotFilters(); }
  function saveShots(){ try{ localStorage.setItem(SHOT_KEY, JSON.stringify(shotItems)); }catch(e){} }

  function populateShotFilters(){
    var pilots=[], days=[];
    shotItems.forEach(function(it){ if(it.pilot&&pilots.indexOf(it.pilot)<0)pilots.push(it.pilot); var dd=it.day||''; if(dd&&days.indexOf(dd)<0)days.push(dd); });
    var ps=el('slPilot'), ds=el('slDay'); var pv=ps.value, dv=ds.value;
    ps.style.display = pilots.length>0?'block':'none';
    ds.style.display = days.length>1?'block':'none';
    ps.innerHTML='<option value="ALL">All pilots</option>'+pilots.map(function(p){return '<option value="'+escA(p)+'">'+esc(p)+'</option>';}).join('');
    ds.innerHTML='<option value="ALL">All days</option>'+days.map(function(dd){return '<option value="'+escA(dd)+'">'+esc(dd)+'</option>';}).join('');
    if(pv) ps.value=pv; if(dv) ds.value=dv;
  }

  // Add-shot form (artist, stage, festival + optional pilot/day). Keeps stage &
  // festival filled so you can add many shots in a row quickly.
  function slToggleAdd(){ slAddOpen=!slAddOpen; renderAddForm(); }
  function renderAddForm(){
    var box=el('slAddForm');
    if(!slAddOpen){ box.style.display='none'; box.innerHTML=''; return; }
    box.style.display='block';
    box.innerHTML='<div class="slitem" style="border-color:rgba(0,229,255,.45)">'
      + '<label class="sled">Artist / Act<input id="add_artist" placeholder="e.g. MEDUZA"></label>'
      + '<label class="sled">Stage<input id="add_stage" placeholder="e.g. MAIN STAGE"></label>'
      + '<label class="sled">Festival<input id="add_festival" placeholder="e.g. EDC 2026"></label>'
      + '<div style="display:flex;gap:6px"><label class="sled">Pilot<input id="add_pilot"></label><label class="sled">Day<input id="add_day" placeholder="DAY 1"></label></div>'
      + '<div class="slactions"><button class="slact save" data-act="addsave">➕ Add</button><button class="slact" data-act="addclose">Done</button></div>'
      + '</div>';
    var a=document.getElementById('add_artist'); if(a) a.focus();
  }
  function slAddSave(){
    var g=function(f){ var e=document.getElementById('add_'+f); return e?e.value.trim():''; };
    var artist=g('artist');
    if(!artist){ alert('Enter an artist / act name.'); return; }
    shotItems.push({ id:uid(), artist:artist, stage:g('stage'), festival:g('festival'), pilot:g('pilot'), day:g('day'), notes:'', status:'pending', takes:'' });
    saveShots(); populateShotFilters();
    var aEl=document.getElementById('add_artist'); if(aEl){ aEl.value=''; aEl.focus(); }
    renderShotlist();
  }

  // Pull the computer's CSV shots into this phone's list (when connected). These
  // are tagged src:'pc' so marking them complete dings the computer.
  function slImport(){
    fetch('/shotlist',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
      var items=(d&&d.items)||[];
      if(!items.length){ alert('No shots found on the computer (load a CSV there first).'); return; }
      var added=0;
      items.forEach(function(it){
        var artist=it.assignment||'', stage=it.stage||'', day=it.daySection||'';
        var key=(artist+'|'+stage+'|'+day).toUpperCase();
        if(shotItems.some(function(x){ return ((x.artist||'')+'|'+(x.stage||'')+'|'+(x.day||'')).toUpperCase()===key; })) return;
        shotItems.push({ id:uid(), artist:artist, stage:stage, festival:'', pilot:it.pilot||'', day:day, notes:it.notes||'', status:it.status||'pending', takes:it.takes||'', src:'pc' });
        added++;
      });
      saveShots(); populateShotFilters(); renderShotlist();
      alert(added+' shot(s) imported from the computer.');
    }).catch(function(){ alert('Couldn’t reach the computer. Make sure the software is open and you’re on the same network.'); });
  }

  // CSV / paste importer — add shots from a different show right on the phone.
  // Columns: Artist, Stage, Festival, Pilot, Day (comma or tab separated).
  function slCsvToggle(){ slCsvOpen=!slCsvOpen; renderCsvForm(); }
  function renderCsvForm(){
    var box=el('slCsvForm');
    if(!slCsvOpen){ box.style.display='none'; box.innerHTML=''; return; }
    box.style.display='block';
    box.innerHTML='<div class="slitem" style="border-color:rgba(180,79,255,.45)">'
      +'<div class="m" style="margin-bottom:6px">Columns: <b>Artist, Stage, Festival, Pilot, Day</b> (comma or tab separated). A header row is skipped automatically.</div>'
      +'<input type="file" id="csv_file" accept=".csv,.txt" class="sled" style="padding:8px">'
      +'<label class="sled">Or paste rows<textarea id="csv_text" rows="5" placeholder="MEDUZA, Main Stage, EDC 2026, Rod, Day 1"></textarea></label>'
      +'<div class="slactions"><button class="slact save" data-act="csvadd">➕ Add Rows</button><button class="slact" data-act="csvclose">Done</button></div>'
      +'</div>';
    var fileEl=document.getElementById('csv_file');
    if(fileEl) fileEl.addEventListener('change', function(e){ var f=e.target.files&&e.target.files[0]; if(!f) return; var rd=new FileReader(); rd.onload=function(ev){ var t=document.getElementById('csv_text'); if(t) t.value=ev.target.result; }; rd.readAsText(f); });
  }
  function parseCsv(text){
    var lines=String(text||'').split(/\\r?\\n/), out=[];
    lines.forEach(function(line, idx){
      if(!line.trim()) return;
      var parts=line.split(/\\t|,/).map(function(p){ return p.trim().replace(/^"|"$/g,''); });
      if(idx===0 && /artist|stage|festival|pilot|day/i.test(line) && !/\\d/.test(parts[0]||'')) return; // header
      var artist=parts[0]||''; if(!artist) return;
      out.push({ id:uid(), artist:artist, stage:parts[1]||'', festival:parts[2]||'', pilot:parts[3]||'', day:parts[4]||'', notes:'', status:'pending', takes:'' });
    });
    return out;
  }
  function slCsvAdd(){
    var t=document.getElementById('csv_text'); var rows=parseCsv(t?t.value:'');
    if(!rows.length){ alert('No rows found. Use: Artist, Stage, Festival, Pilot, Day'); return; }
    shotItems=shotItems.concat(rows); saveShots(); populateShotFilters(); renderShotlist();
    slCsvOpen=false; renderCsvForm();
    alert(rows.length+' shot(s) added from CSV.');
  }
  // Tell the computer a shot was completed on mobile (ding + toast there).
  function slNotify(name){ fetch('/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'shotComplete',name:name||''})}).catch(function(){}); }

  function slApply(id, patch){ shotItems=shotItems.map(function(it){ return it.id===id?Object.assign({},it,patch):it; }); saveShots(); }
  function slToggleDone(id){ var it=slFind(id); if(!it)return; var done=it.status!=='completed'; slApply(id,{status:done?'completed':'pending'}); if(done && it.src==='pc') slNotify(it.artist); renderShotlist(); }
  function slToggleSkip(id){ var it=slFind(id); if(!it)return; slApply(id,{status:it.status==='skipped'?'pending':'skipped'}); renderShotlist(); }
  function slStartEdit(id){ slEditId=id; renderShotlist(); }
  function slCancelEdit(){ slEditId=null; renderShotlist(); }
  function slSaveEdit(id){
    var g=function(f){ var e=document.getElementById('sle_'+f); return e?e.value:''; };
    slApply(id,{ artist:g('artist'), stage:g('stage'), festival:g('festival'), pilot:g('pilot'), day:g('day'), notes:g('notes') });
    slEditId=null; populateShotFilters(); renderShotlist();
  }
  function slDeleteItem(id){ if(!confirm('Delete this shot?')) return; shotItems=shotItems.filter(function(it){return it.id!==id;}); saveShots(); slEditId=null; populateShotFilters(); renderShotlist(); }
  function slOpenSlate(id){ var it=slFind(id); if(!it) return; var q='?artist='+encodeURIComponent(it.artist||'')+'&stage='+encodeURIComponent(it.stage||'')+'&pilot='+encodeURIComponent(it.pilot||'')+'&festival='+encodeURIComponent(it.festival||'')+'&day='+encodeURIComponent(it.day||'')+'&id='+encodeURIComponent(it.id||''); window.location.href='/slate'+q; }

  function slEditForm(it){
    var fld=function(label,field,val){ return '<label class="sled">'+label+'<input id="sle_'+field+'" value="'+escA(val||'')+'"></label>'; };
    return '<div class="slitem" style="border-color:rgba(0,229,255,.45)">'
      + fld('Artist / Act','artist',it.artist)
      + fld('Stage','stage',it.stage)
      + fld('Festival','festival',it.festival)
      + '<div style="display:flex;gap:6px">'+fld('Pilot','pilot',it.pilot)+fld('Day','day',it.day)+'</div>'
      + '<label class="sled">Notes<textarea id="sle_notes" rows="2">'+esc(it.notes||'')+'</textarea></label>'
      + '<div class="slactions">'
        + '<button class="slact save" data-act="save" data-id="'+escA(it.id)+'">✓ Save</button>'
        + '<button class="slact" data-act="cancel" data-id="'+escA(it.id)+'">Cancel</button>'
        + '<button class="slact del" data-act="delete" data-id="'+escA(it.id)+'">🗑</button>'
      + '</div></div>';
  }

  function renderShotlist(){
    if(!el('slPilot')) return;
    var p=el('slPilot').value||'ALL', dsel=el('slDay').value||'ALL';
    var rows=shotItems.filter(function(it){ return (p==='ALL'||it.pilot===p) && (dsel==='ALL'||(it.day||'')===dsel); });
    var done=0,skip=0; rows.forEach(function(r){ if(r.status==='completed')done++; else if(r.status==='skipped')skip++; });
    el('slSummary').textContent = shotItems.length ? (rows.length+' shots · '+done+' done · '+skip+' skipped · '+(rows.length-done-skip)+' pending') : '';
    var html='', curDay=null;
    rows.forEach(function(it){
      var day=it.day||'';
      if(day!==curDay){ curDay=day; if(day) html+='<div class="slday">'+esc(day)+'</div>'; }
      if(it.id===slEditId){ html+=slEditForm(it); return; }
      var cls=it.status==='completed'?'slitem done':it.status==='skipped'?'slitem skip':'slitem';
      var badge=it.status==='completed'?'<span class="slbadge" style="background:rgba(0,255,136,.15);color:var(--green)">✓ done</span>':it.status==='skipped'?'<span class="slbadge" style="background:rgba(255,92,124,.2);color:var(--red)">skipped</span>':'<span class="slbadge" style="background:rgba(255,255,255,.08);color:var(--muted)">pending</span>';
      var meta=[it.stage, it.festival].filter(Boolean).map(esc).join(' · ');
      html+='<div class="'+cls+'"><div class="a">'+esc(it.artist||'(unnamed shot)')+badge+'</div>';
      if(meta) html+='<div class="m">'+meta+'</div>';
      if(it.pilot) html+='<div class="m">🧑‍✈️ '+esc(it.pilot)+'</div>';
      if(it.takes) html+='<div class="m">🎬 '+esc(it.takes)+' take(s)</div>';
      if(it.notes) html+='<div class="m">📝 '+esc(it.notes)+'</div>';
      html+='<div class="slactions">'
        + '<button class="slact done'+(it.status==='completed'?' on':'')+'" data-act="done" data-id="'+escA(it.id)+'">'+(it.status==='completed'?'✓ Done':'Mark Done')+'</button>'
        + '<button class="slact skip'+(it.status==='skipped'?' on':'')+'" data-act="skip" data-id="'+escA(it.id)+'">'+(it.status==='skipped'?'Skipped':'Skip')+'</button>'
        + '<button class="slact" data-act="edit" data-id="'+escA(it.id)+'">✏️ Edit</button>'
        + '<button class="slact slate" data-act="slate" data-id="'+escA(it.id)+'">🎬 Slate</button>'
      + '</div></div>';
    });
    el('slList').innerHTML = html || '<p class="sub" style="margin-top:12px">No shots yet. Tap ➕ Add Shot to create one, or ⤵ Import from Computer.</p>';
  }

  // One delegated click handler for all shot-list + add-form buttons.
  function slListClick(e){
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if(!btn) return;
    var id=btn.getAttribute('data-id'), act=btn.getAttribute('data-act');
    if(act==='done') slToggleDone(id);
    else if(act==='skip') slToggleSkip(id);
    else if(act==='edit') slStartEdit(id);
    else if(act==='save') slSaveEdit(id);
    else if(act==='cancel') slCancelEdit();
    else if(act==='delete') slDeleteItem(id);
    else if(act==='slate') slOpenSlate(id);
    else if(act==='addsave') slAddSave();
    else if(act==='addclose') slToggleAdd();
    else if(act==='csvadd') slCsvAdd();
    else if(act==='csvclose') slCsvToggle();
  }

  // Start polling immediately + on an interval; try the WS accelerator too.
  el('slPanel').addEventListener('click', slListClick);
  poll();
  setInterval(poll, 1500);
  connect();
  // Restore the last view so returning from the slate (or a reload) lands you back
  // on the screen you were on (e.g. the shot list), not always Home.
  (function(){
    var v=null; try{ v=sessionStorage.getItem('fpvcb_view'); }catch(e){}
    var unlocked=false; try{ unlocked=sessionStorage.getItem('fpvcb_unlocked')==='1'; }catch(e){}
    if(v==='shots') openShotList();
    else if(v==='move' && unlocked) revealMove();
    else showHome();
  })();
  // Re-poll / reconnect when the phone wakes or returns to the app.
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ poll(); if(!ws||ws.readyState!==1) connect(); } });
  // Register the offline service worker so Shot List & Slate open with the computer off.
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }
</script>
</body>
</html>`;

// ── Server factory ───────────────────────────────────────────────────────────
function createDashboard({ onMove, onSetMode, onCommand, getSnapshot, getShotlist, isMoveLocked, checkMovePassword, onNotify }) {
  const app = express();
  let server = null;
  let wss = null;
  let currentPort = null;
  const clients = new Set();

  // Never let the browser/PWA cache the live page, status, or service worker.
  const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  app.get('/', (_req, res) => { noStore(res); res.type('html').send(PAGE); });
  app.get('/manifest.webmanifest', (_req, res) => { noStore(res); res.type('application/manifest+json').send(MANIFEST); });
  app.get('/sw.js', (_req, res) => { noStore(res); res.type('application/javascript').send(SERVICE_WORKER); });
  app.get('/icon-192.png', (_req, res) => res.type('png').send(readIcon('icon-192.png')));
  app.get('/icon-512.png', (_req, res) => res.type('png').send(readIcon('icon-512.png')));
  app.get('/apple-touch-icon.png', (_req, res) => res.type('png').send(readIcon('icon-192.png')));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Move Files section gate: does it need a password? + validate an attempt.
  app.get('/lock', (_req, res) => { noStore(res); res.json({ locked: isMoveLocked ? !!isMoveLocked() : false }); });
  app.post('/unlock', express.json(), (req, res) => {
    noStore(res);
    const pw = req.body && typeof req.body.pw === 'string' ? req.body.pw : '';
    const ok = checkMovePassword ? !!checkMovePassword(pw) : true;
    res.json({ ok });
  });
  // Phone → computer alert (e.g. a shot was marked complete on mobile). The desktop
  // dings + shows a toast so the operator knows footage is coming.
  app.post('/notify', express.json(), (req, res) => {
    noStore(res);
    try { if (onNotify && req.body) onNotify(req.body); } catch {}
    res.json({ ok: true });
  });
  // FPV Festival Slate (single self-contained HTML built from the Slate-App repo).
  // Opened from the shot list at /slate?artist=&stage=&pilot=&day=&id=…
  app.get('/slate', (_req, res) => { noStore(res); res.type('html').send(readSlate()); });
  // Live status as plain JSON — open this URL directly on the phone to confirm the
  // phone can reach THIS server and see the real data, independent of the PWA page
  // / service-worker cache. If this shows the right pilot/state but the app screen
  // doesn't, the app's cached page is stale (remove & re-add the PWA).
  app.get('/state', (_req, res) => { noStore(res); res.json({ pageBuild: PAGE_BUILD, serverStarted: SERVER_STARTED, status: getSnapshot() }); });
  // Shot list: the desktop's CSV assignments (the phone's "Import from Computer").
  app.get('/shotlist', (_req, res) => { noStore(res); res.json({ items: (getShotlist ? getShotlist() : []) || [] }); });

  // ONE place that dispatches a phone command — used by BOTH the WebSocket and the
  // HTTP POST /cmd path so the buttons work even when WebSockets don't.
  function handleCommand(msg) {
    if (!msg || !msg.cmd) return;
    if (msg.cmd === 'move') {
      Promise.resolve(onMove()).catch(() => {});
    } else if (msg.cmd === 'setMode' && (msg.mode === 'auto' || msg.mode === 'manual')) {
      try { onSetMode(msg.mode); } catch {}
    } else if (msg.cmd === 'copyMedia' || msg.cmd === 'copyBella' || msg.cmd === 'dumpRaws' || msg.cmd === 'completeCard') {
      try { if (onCommand) onCommand(msg.cmd); } catch {}
    }
  }

  // Phone → desktop commands over plain HTTP (reliable fallback for the WebSocket).
  app.post('/cmd', express.json(), (req, res) => {
    try { handleCommand(req.body || {}); } catch {}
    res.json({ ok: true });
  });

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
        handleCommand(msg);
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
