# FPV Card Boss — Mobile Dashboard (PWA)

The desktop app runs a small web server so a **phone** can watch live progress and
trigger actions (Move Files, Auto/Manual mode) remotely — over Wi‑Fi or Tailscale.
No cloud, no Telegram; everything stays on your network.

## How to use it
1. On the desktop, open **Setup → 📱 Mobile Dashboard (PWA)**. It shows the port
   (default **8723**) and the URL(s) to type on the phone:
   - **LAN** — e.g. `http://192.168.1.50:8723` (phone must be on the same Wi‑Fi).
   - **Tailscale** — e.g. `http://100.x.y.z:8723` (works from anywhere on your tailnet).
2. On the phone, open the URL in the browser, then **Add to Home Screen**. It
   installs as a fullscreen, icon’d app (works on iPhone and Android).
3. Use the toggle to pick **Auto** (auto‑move when the export count matches) or
   **Manual**, and tap **Move Files** when complete.

## Site Map
Share the venue/site map with the phone so everyone can pull it up in one place:
1. On the desktop, open **Setup → 📱 Mobile Dashboard (PWA) → 🗺️ Site Map** and
   click **Add Site Map**. Pick a PNG/JPG (WEBP, GIF, BMP and SVG also work). A
   preview appears; use **Replace** or **Remove** anytime.
2. On the phone, tap the **🗺️ Site Map** card on the home screen to view it. Tap
   the image to open it full‑screen and pinch‑zoom.

The image is stored on the computer and served at `/sitemap`; replacing it updates
every connected phone live (the home card shows when a map is available). It
persists across restarts, and the phone keeps the last‑loaded map cached so it
opens even with the computer off.

## Windows Firewall
The first time the server starts, Windows may prompt to allow network access —
choose **Allow** (at least **Private networks**). If you dismissed it or it never
appeared, add a rule manually (PowerShell as Administrator), matching the port you
set in Setup (default 8723):

```powershell
New-NetFirewallRule -DisplayName "FPV Card Boss Dashboard" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 8723 -Profile Private
```

To use a different port, change it in Setup and update `-LocalPort` to match.

## Notes
- The server listens on `0.0.0.0:<port>` so both LAN and Tailscale can reach it.
- The PWA only caches its app shell; **live status is never cached** (it streams
  over a WebSocket).
- The server starts when the app launches and stops when it quits.
