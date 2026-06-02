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
const PAGE_BUILD = 'pwa-2026-06-01-k-shotedit';
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

// SELF-DESTRUCT service worker. Earlier versions cached the app shell, which led
// to phones showing a stale screen even though the server had fresh data. Caching
// adds nothing for a LAN-only live dashboard, so this SW now deletes every cache,
// unregisters itself, and reloads any open clients so they get the live page. It
// installs no fetch handler, so all requests always go straight to the network.
const SERVICE_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Clean up any old caches and remove ourselves. We do NOT force-navigate the
    // open clients — doing so caused an endless reload loop on some mobile browsers
    // (the page kept reloading before it could render or accept taps). The live
    // page is served no-store, so it is already fresh without a forced reload.
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
  })());
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
  #slPanel{position:fixed;inset:0;background:var(--bg);overflow-y:auto;z-index:50;padding:calc(env(safe-area-inset-top) + 12px) 14px calc(env(safe-area-inset-bottom) + 20px);}
  #slPanel .slhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
  #slPanel .slhead h2{font-size:16px;font-weight:900;letter-spacing:2px;margin:0;}
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

    <div class="card">
      <div class="label">Current Card</div>
      <div class="big" id="cardId">—</div>
      <div class="row" style="margin-top:12px">
        <div class="kv"><div class="label">Pilot</div><div class="v" id="pilot">—</div></div>
        <div class="kv"><div class="label">Artist</div><div class="v" id="artist">—</div></div>
      </div>
    </div>

    <button class="slbtn" onclick="openShotList()">📋 View Shot List</button>

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
    <div class="bhint" id="moveHint"></div>

    <div class="label" style="margin-top:4px">Deliver To</div>
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
    <div class="hint">Live over Wi-Fi / Tailscale · pull to refresh if disconnected</div>

  <!-- SHOT LIST (view-only) overlay -->
  <div id="slPanel">
    <div class="slhead">
      <h2>📋 SHOT LIST</h2>
      <button class="slclose" onclick="closeShotList()">✕ Close</button>
    </div>
    <div style="display:flex;gap:8px;">
      <select id="slPilot" class="slsel" onchange="renderShotlist()"></select>
      <select id="slDay" class="slsel" onchange="renderShotlist()"></select>
    </div>
    <div class="sub" id="slSummary" style="margin-top:10px"></div>
    <div id="slList"></div>
  </div>
    <div class="hint" id="dbg">connecting…</div>
    <div class="hint" id="dbgErr" style="color:var(--red)"></div>
    <div class="hint" id="buildStamp">build ${PAGE_BUILD}</div>
  </div>

<script>
  // NOTE: do NOT name this 'status' — window.status is a built-in that coerces any
  // assigned value to a string, so 'status = {...}' silently became "[object Object]"
  // and every field read back undefined (rendered as '—'). That was the root cause.
  var ws=null, retry=null, appStatus={}, lastOk=0, lastSrc='—';
  function el(id){return document.getElementById(id);}
  function fmtMB(mb){ if(!mb) return '0 MB'; if(mb>=1024) return (mb/1024).toFixed(2)+' GB'; return mb+' MB'; }

  function setConn(on){ if(on){ el('dot').classList.add('on'); el('connTxt').textContent='Live'; } else { el('dot').classList.remove('on'); el('connTxt').textContent='Offline'; } }
  var lastRenderErr='';
  function applyStatus(s, src){ appStatus=s||{}; lastOk=Date.now(); lastSrc=src; setConn(true); try{ render(); lastRenderErr=''; el('dbgErr').textContent=''; }catch(e){ lastRenderErr=String(e&&e.message||e); el('dbgErr').textContent='render error: '+lastRenderErr; } }
  function setDbg(){ var ago = lastOk? Math.round((Date.now()-lastOk)/1000)+'s ago':'never'; el('dbg').textContent='data via '+lastSrc+' · updated '+ago; }

  // ── Remote debug: report what the phone actually sees back to the PC so it can
  // be read from the desktop (throttled). ──
  var lastClog=0;
  function clog(obj){ try{ var now=Date.now(); if(now-lastClog<2500 && obj.ev==='poll') return; lastClog=now; fetch('/clientlog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)}).catch(function(){}); }catch(e){} }

  // ── PRIMARY data path: poll /state over plain HTTP. This is the path that works
  // on this network even when WebSocket frames don't arrive on the phone. ──
  function poll(){
    fetch('/state',{cache:'no-store'}).then(function(r){ return r.text().then(function(t){ return {ok:r.ok, st:r.status, t:t}; }); })
      .then(function(resp){
        var d;
        try{ d=JSON.parse(resp.t); }catch(e){ clog({ev:'parsefail', httpStatus:resp.st, rawlen:resp.t.length, raw:resp.t.slice(0,300)}); return; }
        applyStatus(d.status,'http');
        var ce=document.getElementById('cardId'), pe=document.getElementById('pilot');
        clog({ev:'poll', httpStatus:resp.st, dataCard:(d.status&&d.status.cardId)||'(none)', domCard: ce?ce.textContent:'NO_EL', domPilot: pe?pe.textContent:'NO_EL', nCardEls:document.querySelectorAll('#cardId').length, renderErr:lastRenderErr, vis:document.visibilityState});
      })
      .catch(function(e){ clog({ev:'fetchfail', msg:String(e&&e.message||e)}); if(Date.now()-lastOk>5000) setConn(false); });
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
      ws.onmessage=function(ev){ try{ var m=JSON.parse(ev.data); if(m.type==='status'){ applyStatus(m.status,'ws'); } }catch(e){} };
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

  // ── SHOT LIST (interactive): fetch /shotlist, filter by pilot + day, edit & sync ──
  var shotItems=[], slEditId=null;
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escA(s){ return esc(s).replace(/"/g,'&quot;'); }
  function slFind(id){ for(var i=0;i<shotItems.length;i++){ if(shotItems[i].id===id) return shotItems[i]; } return null; }
  function openShotList(){ el('slPanel').style.display='block'; loadShotlist(); }
  function closeShotList(){ el('slPanel').style.display='none'; slEditId=null; }
  function loadShotlist(){
    if(!shotItems.length) el('slList').innerHTML='<p class="sub" style="margin-top:12px">Loading…</p>';
    fetch('/shotlist',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
      shotItems=(d&&d.items)||[];
      populateShotFilters();
      renderShotlist();
    }).catch(function(){ el('slList').innerHTML='<p class="sub" style="margin-top:12px">Couldn\\'t load the shot list. Make sure a CSV is loaded on the computer.</p>'; });
  }
  function populateShotFilters(){
    var pilots=[], days=[];
    shotItems.forEach(function(it){ if(it.pilot&&pilots.indexOf(it.pilot)<0)pilots.push(it.pilot); var dd=it.daySection||'—'; if(days.indexOf(dd)<0)days.push(dd); });
    var ps=el('slPilot'), ds=el('slDay'); var pv=ps.value, dv=ds.value;
    ps.innerHTML='<option value="ALL">All pilots</option>'+pilots.map(function(p){return '<option value="'+escA(p)+'">'+esc(p)+'</option>';}).join('');
    ds.innerHTML='<option value="ALL">All days</option>'+days.map(function(dd){return '<option value="'+escA(dd)+'">'+esc(dd)+'</option>';}).join('');
    if(pv) ps.value=pv; if(dv) ds.value=dv;
  }

  // Send an edit to the desktop (which owns the data + re-reports it).
  function slCmd(id, body){ body.id=id; fetch('/shotlist-cmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(function(){}); }
  function slApply(id, patch){ shotItems=shotItems.map(function(it){ return it.id===id?Object.assign({},it,patch):it; }); }
  function slReconcile(){ if(el('slPanel').style.display!=='none' && slEditId===null) setTimeout(loadShotlist, 800); }
  function slToggleDone(id){ var it=slFind(id); if(!it)return; var ns=it.status==='completed'?'pending':'completed'; slApply(id,{status:ns}); slCmd(id,{patch:{status:ns}}); renderShotlist(); slReconcile(); }
  function slToggleSkip(id){ var it=slFind(id); if(!it)return; var ns=it.status==='skipped'?'pending':'skipped'; slApply(id,{status:ns}); slCmd(id,{patch:{status:ns}}); renderShotlist(); slReconcile(); }
  function slStartEdit(id){ slEditId=id; renderShotlist(); }
  function slCancelEdit(){ slEditId=null; renderShotlist(); }
  function slSaveEdit(id){
    var g=function(f){ var e=document.getElementById('sle_'+f); return e?e.value:''; };
    var patch={ assignment:g('assignment'), pilot:g('pilot'), daySection:g('daySection'), stage:g('stage'), setTime:g('setTime'), flyTime:g('flyTime'), dropTime:g('dropTime'), notes:g('notes') };
    slApply(id,patch); slCmd(id,{patch:patch}); slEditId=null; populateShotFilters(); renderShotlist(); slReconcile();
  }
  function slDeleteItem(id){ if(!confirm('Delete this shot? This also removes it on the computer.')) return; shotItems=shotItems.filter(function(it){return it.id!==id;}); slCmd(id,{action:'delete'}); slEditId=null; renderShotlist(); }

  function slEditForm(it){
    var fld=function(label,field,val){ return '<label class="sled">'+label+'<input id="sle_'+field+'" value="'+escA(val||'')+'"></label>'; };
    return '<div class="slitem" style="border-color:rgba(0,229,255,.45)">'
      + fld('Assignment','assignment',it.assignment)
      + fld('Pilot','pilot',it.pilot)
      + fld('Day / Section','daySection',it.daySection)
      + fld('Stage','stage',it.stage)
      + '<div style="display:flex;gap:6px">'+fld('Set','setTime',it.setTime)+fld('Fly','flyTime',it.flyTime)+fld('Drop','dropTime',it.dropTime)+'</div>'
      + '<label class="sled">Notes<textarea id="sle_notes" rows="2">'+esc(it.notes||'')+'</textarea></label>'
      + '<div class="slactions">'
        + '<button class="slact save" data-act="save" data-id="'+escA(it.id)+'">✓ Save</button>'
        + '<button class="slact" data-act="cancel" data-id="'+escA(it.id)+'">Cancel</button>'
        + '<button class="slact del" data-act="delete" data-id="'+escA(it.id)+'">🗑</button>'
      + '</div></div>';
  }

  function renderShotlist(){
    var p=el('slPilot').value||'ALL', dsel=el('slDay').value||'ALL';
    var rows=shotItems.filter(function(it){ return (p==='ALL'||it.pilot===p) && (dsel==='ALL'||(it.daySection||'—')===dsel); });
    var done=0,skip=0; rows.forEach(function(r){ if(r.status==='completed')done++; else if(r.status==='skipped')skip++; });
    el('slSummary').textContent = rows.length+' shots · '+done+' done · '+skip+' skipped · '+(rows.length-done-skip)+' pending';
    var html='', curDay=null;
    rows.forEach(function(it){
      var day=it.daySection||'—';
      if(day!==curDay){ curDay=day; html+='<div class="slday">'+esc(day)+'</div>'; }
      if(it.id===slEditId){ html+=slEditForm(it); return; }
      var cls=it.status==='completed'?'slitem done':it.status==='skipped'?'slitem skip':'slitem';
      var badge=it.status==='completed'?'<span class="slbadge" style="background:rgba(0,255,136,.15);color:var(--green)">✓ done</span>':it.status==='skipped'?'<span class="slbadge" style="background:rgba(255,92,124,.2);color:var(--red)">skipped</span>':'<span class="slbadge" style="background:rgba(255,255,255,.08);color:var(--muted)">pending</span>';
      var meta=[it.stage, it.setTime&&('Set '+it.setTime), it.flyTime&&('Fly '+it.flyTime), it.dropTime&&('Drop '+it.dropTime)].filter(Boolean).map(esc).join(' · ');
      html+='<div class="'+cls+'"><div class="a">'+esc(it.assignment||'(unnamed shot)')+badge+'</div>';
      if(meta) html+='<div class="m">'+meta+'</div>';
      if(p==='ALL') html+='<div class="m">🧑‍✈️ '+esc(it.pilot||'—')+'</div>';
      if(it.notes) html+='<div class="m">📝 '+esc(it.notes)+'</div>';
      html+='<div class="slactions">'
        + '<button class="slact done'+(it.status==='completed'?' on':'')+'" data-act="done" data-id="'+escA(it.id)+'">'+(it.status==='completed'?'✓ Done':'Mark Done')+'</button>'
        + '<button class="slact skip'+(it.status==='skipped'?' on':'')+'" data-act="skip" data-id="'+escA(it.id)+'">'+(it.status==='skipped'?'Skipped':'Skip')+'</button>'
        + '<button class="slact" data-act="edit" data-id="'+escA(it.id)+'">✏️ Edit</button>'
      + '</div>';
      html+='</div>';
    });
    el('slList').innerHTML = html || '<p class="sub" style="margin-top:12px">No shots for this selection.</p>';
  }

  // One delegated click handler for all shot-list buttons (ids may contain quotes).
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
  }

  // Start polling immediately + on an interval; try the WS accelerator too.
  el('slList').addEventListener('click', slListClick);
  clog({ev:'load', href:location.href, host:location.host, proto:location.protocol, ua:(navigator.userAgent||'').slice(0,120)});
  poll();
  setInterval(poll, 1500);
  setInterval(setDbg, 1000);
  connect();
  // Re-poll / reconnect when the phone wakes or returns to the app.
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ poll(); if(!ws||ws.readyState!==1) connect(); } });
  // Kill any previously-installed service worker + caches so the phone can never
  // be stuck on a stale screen again. We do NOT register a new SW (no offline
  // caching needed for a live LAN dashboard).
  try{
    if('serviceWorker' in navigator){ navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ try{ r.unregister(); }catch(e){} }); }).catch(function(){}); }
    if(window.caches && caches.keys){ caches.keys().then(function(ks){ ks.forEach(function(k){ try{ caches.delete(k); }catch(e){} }); }).catch(function(){}); }
  }catch(e){}
</script>
</body>
</html>`;

// ── Server factory ───────────────────────────────────────────────────────────
function createDashboard({ onMove, onSetMode, onCommand, getSnapshot, getShotlist, onShotlistCommand }) {
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
  // Live status as plain JSON — open this URL directly on the phone to confirm the
  // phone can reach THIS server and see the real data, independent of the PWA page
  // / service-worker cache. If this shows the right pilot/state but the app screen
  // doesn't, the app's cached page is stale (remove & re-add the PWA).
  app.get('/state', (_req, res) => { noStore(res); res.json({ pageBuild: PAGE_BUILD, serverStarted: SERVER_STARTED, status: getSnapshot() }); });
  // Shot list: CSV assignments + per-shot status (the phone reads this).
  app.get('/shotlist', (_req, res) => { noStore(res); res.json({ items: (getShotlist ? getShotlist() : []) || [] }); });
  // Phone → desktop shot-list edit: { id, patch:{...} } to change fields/status, or
  // { id, action:'delete' }. The desktop applies it and re-reports the updated list.
  app.post('/shotlist-cmd', express.json(), (req, res) => {
    try { if (onShotlistCommand && req.body && req.body.id) onShotlistCommand(req.body); } catch {}
    res.json({ ok: true });
  });

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

  // Remote debug log from the phone — lets us read on the PC exactly what the
  // phone's page received/rendered. GET /clientlog returns the recent entries.
  const clientLogs = [];
  app.post('/clientlog', express.json(), (req, res) => {
    try {
      clientLogs.push({ t: new Date().toISOString(), ip: req.ip, ...(req.body || {}) });
      while (clientLogs.length > 100) clientLogs.shift();
    } catch {}
    res.json({ ok: true });
  });
  app.get('/clientlog', (_req, res) => { noStore(res); res.json(clientLogs); });

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
