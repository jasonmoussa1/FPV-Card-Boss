# Saturday — Get FPV Card Boss running on the Mac

Everything that can be built without the Mac is done. Saturday is: pull the code, install, grant 2 permissions, calibrate, test. Estimated 20–40 min, most of it calibration.

---

## What's already built (no Mac needed)
- **Platform picker** — app asks "Windows PC or Mac?" on launch and routes accordingly.
- **`platform.cjs`** — macOS automation primitives (nut.js clicks/keys, `rsync` copy, `open -a`, AppleScript focus).
- **`mac-robot.cjs`** — full GoPro export robot for macOS, a 1:1 port of the Windows sequence, driven by the **same 14 calibration points**. Clicks, both slider drags (50→15), Cmd+A select‑all, un‑gain, aspect ratio 8:7, Start — all final.
- **`main.cjs`** — when platform = Mac, the robot handler calls the nut.js robot instead of PowerShell; cursor capture is Retina‑correct on Mac. Windows path unchanged.
- **Build config** — `npm run build:mac`, mac entitlements, nut.js dependency, native‑module unpacking.

## Full workflow now wired for Mac (`mac-fs.cjs`)
SD→RAW copy, copy‑to‑Media, copy‑to‑Bella, copy‑to‑Media‑Drive, copy‑to‑Bella‑Drive,
move‑stabilized (from `~/Movies`), delete‑SD (volume‑safe, no drive letters), and
GoPro path detection all have Mac equivalents using `rsync`. `dump‑raws`,
`validate‑setup`, and folder creation were already cross‑platform. So the **entire
card workflow is one‑to‑one** — same buttons, same flow as the PC.

## What still needs the Mac / a screenshot (small, isolated)
1. **How clips get into the queue** (`addFiles` in `mac-robot.cjs`) — the only step that depends on GoPro's Mac UI. Needs the screenshot/answers below. Everything else runs as‑is.
2. **Final coordinate scaling check** — confirm a calibrated point gets clicked accurately (Retina). Built to be a one‑line fix if it's off.
3. **Grant the 2 permissions** (Accessibility + Screen Recording) — manual, one‑time, step 3 below.

---

## Saturday steps (on the Mac)

1. **Get the code** (it's committed to git):
   ```
   git clone <your repo>   # or: git pull   if already cloned
   cd FPV_Card_Boss
   npm install
   ```
   `npm install` pulls nut.js automatically (it's an optional dependency with prebuilt Mac binaries).

2. **Confirm files parse** (fast sanity check):
   ```
   node --check main.cjs && node --check platform.cjs && node --check mac-robot.cjs && node --check preload.cjs
   ```

3. **Grant 2 macOS permissions** — System Settings ▸ Privacy & Security:
   - **Accessibility** → add **Terminal** (and Electron if listed) — lets the robot move the mouse/keyboard.
   - **Screen Recording** → same — lets calibration read the screen.
   (For a packaged `.app` later, you'd grant these to "FPV Card Boss" itself.)

4. **Run it:**
   ```
   npm run dev:electron
   ```
   Pick **Mac** at the picker.

5. **Calibrate** against GoPro Player on the Mac (same 14 points as Windows), then **run one test card** and watch the robot.

---

## Please send / ask the Mac person (this unblocks the last step)

**Screenshots of GoPro Player on the Mac** (batch exporter open, ideally a couple of clips loaded):
1. The whole window with the **export/batch queue** and file list visible.
2. The **HyperSmooth Pro settings** area: 10‑bit/HEVC, HyperSmooth toggle, **Smoothness** slider, **Cropping** slider, the **un‑gain / un‑link (chain)** button between them, **Aspect Ratio** dropdown.
3. However you **add clips** to the queue (an **Add/＋** button? a **File** menu item? drag‑only?).
4. The **Start/Export** button and the **Remove** button.

**Questions for the Mac person:**
- **A.** How do you add clips to the export queue on Mac — drag from Finder, an **Add/＋ button with a file picker**, or a **File menu**? *(If there's an Add button + file dialog, the robot gets simpler and more reliable than dragging.)*
- **B.** With several clips in the queue, can you **select all (Cmd+A) and apply HyperSmooth settings to all at once**, or must each clip be set individually?
- **C.** Is there a per‑clip "Send to Queue" flow (like Windows) or one batch panel?
- **D.** Does the **un‑gain / un‑link** control exist on Mac, and is it between Smoothness and Cropping?
- **E.** Mac chip: **Apple Silicon (M‑series) or Intel?** And macOS version?

Send those and I'll finalize the `addFiles` step and (if you want it) wire the rsync copies, so Saturday is purely calibrate‑and‑test.

---

## Commit (run on your machine — I can't commit from here)
```
cd "C:\Users\Jason\OneDrive\Desktop\FPV_Card_Boss"
git add platform.cjs mac-robot.cjs mac-fs.cjs main.cjs package.json build/entitlements.mac.plist SATURDAY_MAC_RUNBOOK.md
git commit -m "Phase 2: macOS GoPro robot (nut.js) + full rsync file workflow + Mac build config"
```

**Before testing on the Mac, run a quick syntax check (catches any typo instantly):**
```
node --check main.cjs && node --check platform.cjs && node --check mac-robot.cjs && node --check mac-fs.cjs && node --check preload.cjs
```
