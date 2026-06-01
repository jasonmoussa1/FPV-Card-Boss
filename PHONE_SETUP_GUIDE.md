# Setting Up the Phone Player — Step‑by‑Step Guide

This guide walks you through connecting your **phone** to **FPV Card Boss** running on
your **computer**, so you can watch live progress and run all the delivery actions
(Move to STABILIZED, Copy to Media Drive, Copy to Bella Drive, Dump Raws, and Complete
Card & Shift to Next) from your phone.

There are **two ways** to connect:

| Method | When to use it | Difficulty |
|--------|----------------|------------|
| **Wi‑Fi (same network)** | Phone and computer are on the **same Wi‑Fi** | Easiest — start here |
| **Tailscale** | You want it to work from **anywhere** (different Wi‑Fi, cellular, another building) | A little more setup, done once |

👉 **Do the Wi‑Fi method first.** It proves everything works. Then add Tailscale if you
want to use the phone away from your home/studio Wi‑Fi.

---

## Part 1 — Turn it on (on the computer)

You do this **once**, and it's the same no matter which connection method you use.

1. Open **FPV Card Boss** on the computer.
2. Go to the **Setup** screen.
3. Scroll to the box titled **📱 Mobile Dashboard (PWA)**.
4. Make sure it shows a green **● Serving** badge. (If it says **○ Stopped**, close and
   reopen the app — the server starts automatically when the app launches.)
5. Note the **Port** number. The default is **8723**. Leave it as‑is unless you have a
   reason to change it.
6. Underneath, you'll see one or more **URLs** (web addresses). These are what you type
   on the phone. They look like:
   - `http://192.168.x.x:8723`  ← a **Wi‑Fi (LAN)** address
   - `http://100.x.x.x:8723`  ← a **Tailscale** address (only appears after Part 3)

> 💡 If it says *"No LAN/Tailscale address detected yet"* — connect the computer to
> Wi‑Fi (or start Tailscale) and reopen the Setup screen.

### Allow it through Windows Firewall (first time only)

The **first time** the server starts, Windows usually pops up a window asking whether to
allow network access. **Click *Allow*** — and make sure **Private networks** is checked.

If you missed that pop‑up (or it never appeared), set the rule manually:

1. Click Start, type **PowerShell**, right‑click **Windows PowerShell**, choose
   **Run as administrator**.
2. Paste this and press Enter (change `8723` if you changed the port):

   ```powershell
   New-NetFirewallRule -DisplayName "FPV Card Boss Dashboard" -Direction Inbound `
     -Action Allow -Protocol TCP -LocalPort 8723 -Profile Private
   ```

You only ever have to do this once.

---

## Part 2 — Connect over Wi‑Fi (start here)

**Goal:** phone and computer on the **same Wi‑Fi network**, talking directly.

1. On your **phone**, connect to the **same Wi‑Fi** the computer is on.
   (Not guest Wi‑Fi — it must be the same network. If your router has separate "2.4G" and
   "5G" names, either one is usually fine as long as the computer is reachable.)
2. On the computer's **Setup → 📱 Mobile Dashboard** box, find the URL labeled **LAN
   (Wi‑Fi/Ethernet)** — something like `http://192.168.1.50:8723`.
3. On the **phone**, open your browser (Safari on iPhone, Chrome on Android) and type
   that **exact** address into the address bar, including the `:8723` at the end. Go.
4. You should see the **CARD BOSS** dashboard. In the top‑right, the dot turns **green**
   and says **Live** when it's connected. 🎉

If it loads and shows **Live**, Wi‑Fi is working. Skip to **Part 4 — Install it like an
app** and **Part 5 — How to use it**. (Come back to Part 3 only if you also want it to
work away from this Wi‑Fi.)

> ⚠️ The Wi‑Fi address (`192.168.x.x`) can **change** when devices reconnect, and it only
> works while you're on that same Wi‑Fi. If you want a link that's stable and works from
> anywhere, set up **Tailscale** (Part 3).

---

## Part 3 — Connect from anywhere with Tailscale

**What is Tailscale?** It's a free app that builds a tiny, private, secure network
between *your own devices* (your computer and your phone). Once both are signed in to the
**same Tailscale account**, they can reach each other **from anywhere** — home Wi‑Fi, the
field on cellular, a hotel — as if they were on the same Wi‑Fi. Nothing is exposed to the
public internet; only your devices can connect.

You set this up **once**. After that it just works in the background.

### 3a. Install Tailscale on the **computer**

1. On the computer, open a browser and go to **https://tailscale.com/download**.
2. Download and install **Tailscale for Windows**.
3. After installing, look in the **system tray** (bottom‑right, near the clock — you may
   need to click the little **^** arrow). Click the **Tailscale** icon.
4. Choose **Log in**. A browser opens. **Create an account** (Google, Microsoft, GitHub,
   or email all work). Remember which one you pick — you'll use the **same** one on the
   phone.
5. When it says you're **Connected**, the computer is on your Tailscale network.

### 3b. Install Tailscale on the **phone**

1. **iPhone:** App Store → search **Tailscale** → install.
   **Android:** Google Play → search **Tailscale** → install.
2. Open the Tailscale app and **Sign in with the SAME account** you used on the computer.
   (This is the most important step — both devices must be on the same account.)
3. Toggle Tailscale **ON**. On iPhone it will ask to add a "VPN configuration" — tap
   **Allow**. (It's not a real VPN to the internet; it's just how phones make this kind of
   private connection. Your normal internet keeps working.)
4. Tailscale can stay **on** all the time in the background. It uses almost no battery.

### 3c. Get the computer's Tailscale address

1. Back in **FPV Card Boss → Setup → 📱 Mobile Dashboard**, you should now see a **second**
   URL labeled **Tailscale**, like `http://100.101.102.103:8723`.
   - If it's not there yet, make sure Tailscale shows **Connected** on the computer, then
     close and reopen the Setup screen.
2. That `http://100.x.x.x:8723` address is your **forever link**. It does **not** change,
   and it works whether you're on Wi‑Fi or cellular, near or far.

> 💡 You can also find the computer's Tailscale address in the phone's Tailscale app under
> the list of your **machines** (your computer will be listed by its name with a
> `100.x.x.x` address). The one shown in FPV Card Boss is the easiest, though.

### 3d. Open it on the phone

1. Make sure Tailscale is **ON** on the phone (and signed in).
2. Open the browser and type the **Tailscale** URL (`http://100.x.x.x:8723`). Go.
3. You should see **CARD BOSS** with a green **Live** dot — now reachable from anywhere.

---

## Part 4 — Install it like an app (Add to Home Screen)

This turns the web page into a real, full‑screen app icon on your phone. Optional but
recommended.

- **iPhone (Safari):** open the dashboard URL → tap the **Share** button (the square with
  an up‑arrow) → scroll down → **Add to Home Screen** → **Add**.
- **Android (Chrome):** open the dashboard URL → tap the **⋮** menu (top‑right) →
  **Add to Home screen** / **Install app** → **Add**.

Now you have a **Card Boss** icon. Tapping it opens straight to the live dashboard.

> Tip: whichever URL you had open when you "Add to Home Screen" is the one the icon uses.
> If you set up Tailscale, install the icon from the **Tailscale** URL so it works
> everywhere.

---

## Part 5 — How to use it

Once the phone shows the green **Live** dot:

- **Current Card** card at the top shows the card ID, pilot, and artist for the job the
  computer is running.
- **Status** shows IDLE / RUNNING / COMPLETE / ERROR with a progress bar and file count.
- **Move Mode** toggle:
  - **Auto** — the computer moves the files automatically as soon as the export count
    matches.
  - **Manual** — nothing moves until you tap a button.
- **Move Files** — moves the finished exports into the local **STABILIZED** folder. This
  is the first step; the delivery buttons below light up after this is done.
- **Deliver To** — the same end‑of‑flow actions as the desktop GoPro batch player:
  - **Copy to Media Drive** — copies RAW + STABILIZED to the master Media drive.
  - **Copy to Bella Drive** — copies STABILIZED to the Bella social folder.
  - **Dump Raws** — flattens the raws into the Rod dump folder.
  - **🚀 Complete Card & Shift to Next** — logs the card and advances the computer to the
    next card. The phone asks you to confirm first.

Each button **enables/disables and shows progress in step with the computer**, so the
phone always reflects what the desktop is doing. Buttons that don't apply to the current
mode (for example Dump Raws / Complete in Simple mode) stay greyed out.

> The actions actually run **on the computer** — the phone is a remote control. The
> computer must be on, with FPV Card Boss open, for the buttons to work.

---

## Troubleshooting

**The page won't load at all / browser says it can't connect.**
- Double‑check you typed the address **exactly**, including `:8723` at the end and no
  `https` (it's plain `http`).
- Make sure the **computer's app is open** and the Setup box shows **● Serving**.
- **Wi‑Fi method:** confirm the phone is on the **same** Wi‑Fi as the computer.
- **Tailscale method:** confirm Tailscale is **ON** and **signed in to the same account**
  on both devices.
- Re‑check the **firewall** rule (Part 1).

**It loads but the dot stays red / says "Offline".**
- The page reached the computer but the live connection dropped. Pull down to refresh, or
  close and reopen the app icon. It auto‑reconnects when the phone wakes up.

**The Tailscale URL never appears in Setup.**
- Make sure the Tailscale tray icon on the computer says **Connected**, then close and
  reopen the FPV Card Boss **Setup** screen (the addresses are detected when Setup opens).

**The Wi‑Fi address changed and the icon stopped working.**
- Home Wi‑Fi addresses can shift. Either re‑open the current LAN address from Setup, or
  switch to the **Tailscale** address, which never changes.

**Delivery buttons are greyed out.**
- **Move Files** must finish first (Media/Bella light up after files are in STABILIZED).
- **Copy to Bella** also needs an artist/shot assigned to the card.
- **Dump Raws** needs a pilot selected and a Raw Dump Folder set in Setup.
- **Dump Raws** and **Complete Card** only apply in the GoPro batch player (Festival)
  mode, not Simple mode.

---

## Quick reference

| | Wi‑Fi | Tailscale |
|---|---|---|
| Works away from home Wi‑Fi? | ❌ No | ✅ Yes (anywhere) |
| Address stays the same? | ⚠️ Can change | ✅ Never changes |
| Setup effort | Type a URL | Install app + sign in once |
| Address looks like | `http://192.168.x.x:8723` | `http://100.x.x.x:8723` |

**Default port:** `8723` (changeable in Setup → Mobile Dashboard).
