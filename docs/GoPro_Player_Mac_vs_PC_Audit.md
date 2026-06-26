# GoPro Player — Mac vs Windows: Stabilization & Export Audit
### Plus feasibility of porting the FPV Card Boss "GoPro robot" to macOS
*Prepared June 25, 2026*

---

## 1. The headline answer to your three questions

**1. Are Mac and PC GoPro Player different?**
Same product, same name (**GoPro Player + HyperSmooth Pro**, formerly ReelSteady), same $99.99 one‑time unlock, shipped for both Mac and Windows since April 2022. But they are built on **two completely different app frameworks** (Mac App Store AppKit app vs. a Microsoft Store **UWP** app), and that difference — not the features — is what matters for your robot.

**2. Is there a denoise button (and other extra options) on the Mac?**
GoPro's *official* HyperSmooth Pro documentation lists the **same** stabilization controls for both platforms: **Smoothness, Cropping Speed, Lens Correction, Advanced Lens**, plus the title‑bar toggles (Auto‑Apply on Open, Auto‑Apply Last Settings, Hide Control). I could **not** find any official documentation of a Mac‑only "Denoise" button in GoPro Player. "Denoise" in GoPro's vocabulary normally refers to an **in‑camera Protune** setting, not a Player export control. **This one needs to be confirmed by looking at the actual Mac app side‑by‑side with your PC** — see §6. It's plausible a newer Mac build added it, but it is not documented.

**3. On the Mac, can you select all files in the Batch Exporter and apply settings once — like Ctrl+A on the PC?**
GoPro's official Batch Exporter article says, for the **Send‑to‑Queue Batch Exporter** (both platforms): *"Highlight a clip, then click Edit… **You can only modify one clip's settings at a time.**"* So in the **export queue itself**, settings are per‑clip on **both** Mac and Windows. Your Windows "Ctrl+A → apply to all" step is almost certainly happening at the **stabilization/HyperSmooth stage** (where you can set defaults to auto‑apply to every clip), not in the export queue. What your colleague reported — *"on the Mac you have to do each one individually"* — is consistent with the documented per‑clip queue behavior, but whether the **multi‑select / select‑all shortcut** truly differs between the two platforms is the second item that **must be verified hands‑on** (§6).

> Bottom line: the two genuinely confirmed differences that affect you are **(a) the underlying app framework** and **(b) the per‑clip queue behavior**. "Denoise" and "select‑all on Mac" are unconfirmed and need a side‑by‑side look. The robot **is** portable to Mac — details in §5.

---

## 2. Side‑by‑side: the apps

| | **Windows GoPro Player** | **Mac GoPro Player** |
|---|---|---|
| Distribution | Microsoft Store — **UWP / packaged app** | Mac App Store — **AppKit (.app)** |
| App ID | `GoPro.GoProPlayer_1h9vz9xjm6b8c!App` | `com.gopro.GoProPlayer` (bundle ID) |
| Launch command | `shell:AppsFolder\GoPro.GoProPlayer_1h9vz9xjm6b8c!App` | `open -a "GoPro Player"` |
| Min OS | Windows 10 or later | macOS 10.14 Mojave or later |
| Hardware need | GPU with HEVC decode | GPU with HEVC decode |
| UI automation exposure | **UIA does NOT expose** sliders/checkboxes/dropdowns (your finding). Title bar + menu only. Hardware clicks required. | macOS **Accessibility (AX) API** *may* expose more of an AppKit app — **but** GoPro's controls are custom‑drawn, so they will likely be just as opaque. Assume hardware clicks required until proven otherwise. |
| Public automation API / CLI | **None.** GoPro confirmed (by years of silence on the request) there is no shell/CLI/API to drive Batch Export. | **None** — same. |

The single most important takeaway: **there is no API on either platform.** Both versions can only be driven the way you already drive Windows — by a UI‑automation robot that moves the mouse and clicks. That is *good news* for your project, because it means the architecture you already built is the correct one; it just needs a macOS automation back end.

---

## 3. Side‑by‑side: stabilization (HyperSmooth Pro) controls

Per GoPro's official "How To Use HyperSmooth Pro" article, these are identical across Mac and Windows:

| Control | What it does | Mac | Windows |
|---|---|---|---|
| **Smoothness** | Degree of stabilization (more = more crop) | ✅ | ✅ |
| **Cropping Speed** | How fast the animated crop zooms in/out | ✅ | ✅ |
| **Lens Correction** | Fisheye amount; default **Linear** | ✅ | ✅ |
| **Advanced Lens** | Adds pincushion distortion option | ✅ | ✅ |
| **Auto‑Apply Stabilization on Open** (title‑bar menu) | Stabilizes every file as it opens | ✅ | ✅ |
| **Auto‑Apply Last Settings to New Video** (title‑bar menu) | Re‑uses your last settings on every new clip — **this is the real "apply to all" mechanism** | ✅ | ✅ |
| **Denoise** | *Not documented as a Player control on either platform.* Needs hands‑on check. | ❓ | ❓ |

> ⚠️ **Note on your SOP wording.** Your project notes mention a separate **"Cropping" slider set to 15** and an **"Un‑gain" button**, plus **Aspect Ratio 8:7**. GoPro's current public docs describe **"Cropping Speed"** (not a plain "Cropping" amount) and do **not** mention an "Un‑gain" button at all. That strongly suggests your Windows build's UI differs from — or is a different version than — the one GoPro documents publicly. This is exactly why a **version‑for‑version, side‑by‑side screenshot comparison** is worth doing before you build the Mac robot: the Mac build may lay these controls out differently, label them differently, or omit/add some (possibly including the denoise option you remember).

---

## 4. Side‑by‑side: export & Batch Exporter

| | Windows | Mac |
|---|---|---|
| Open the queue | `File ▸ Send To Queue` | `File ▸ Send To Queue` |
| Per‑clip settings | "**You can only modify one clip's settings at a time**" (Edit a highlighted clip) | Same per official docs |
| Save / reuse presets | Yes (presets, different settings per export) | Yes |
| Output codecs | HEVC, H.264, H.265, **CineForm** | HEVC, H.264, H.265, **Apple ProRes** |
| Known codec gotcha | 5.6K exports have been reported to come out **corrupted with CineForm** (the only option at that res on some builds) | **ProRes** path historically more reliable on Mac |
| Vision Pro export (APMP) | Not available | **Mac‑only** — requires Player v3.3+, macOS 26, VisionOS 26 |
| Select‑all / multi‑select in queue | You believe Ctrl+A works | Reported by your colleague to be unavailable — **verify** |

**How to reconcile the "select all" confusion:** GoPro's design intent is that you set your stabilization once and turn on **"Auto‑Apply Last Settings to New Video,"** so every clip you send to the queue inherits the same HyperSmooth settings automatically. The *export* queue then only needs unique filenames per clip. If that auto‑apply path works the same on Mac (it is documented to), then **you don't actually need a select‑all in the queue** — you need the robot to set HyperSmooth once and let auto‑apply carry it to every clip. That may make the Mac robot **simpler**, not harder, than the Windows one.

---

## 5. Can the FPV Card Boss robot run on Mac? — Yes. Here's the porting map.

Your app is Electron + React + TypeScript. **Electron runs natively on macOS**, so the entire UI, the React dashboard, `preload.cjs`/`contextBridge`, the Google Sheets integration, the local DB, and your festival theme **port with zero or near‑zero change.** What has to be rewritten is the OS‑specific layer in `main.cjs` — the file copy, the window control, and the "robot" clicks. Here is each Windows mechanism and its macOS replacement:

| Function | Windows (current) | macOS replacement |
|---|---|---|
| Copy RAW from SD card | **Robocopy** `/E /Z /W:5 /R:3` | **`rsync -a --info=progress2`** or `ditto` (both preserve metadata; rsync gives progress) |
| Launch GoPro Player | `shell:AppsFolder\…!App` | `open -a "GoPro Player"` |
| Hardware mouse clicks | PowerShell + `user32.dll` C# interop | **`cliclick`** (brew tool) or native **CGEvent** (Core Graphics) calls via a small Swift/ObjC helper |
| Read cursor position | PowerShell `GetCursorPos` | `cliclick p` or CGEvent location read |
| Bring window to front / focus | `SetForegroundWindow` | **AppleScript / System Events** (`tell application "GoPro Player" to activate`) |
| Find window position for drag‑drop | UIA on Explorer (`CabinetWClass`) | **AppleScript System Events** to read window bounds; Finder is AX‑accessible |
| Screenshots (for calibration overlay) | PowerShell capture | `screencapture` CLI |
| Move exported files after render | `fs` move from `C:\Users\Jason\Videos` | `fs` move from `~/Movies` (GoPro default on Mac) |
| Google Sheets (Media Master) | googleapis + service account | **Identical — no change** |

**The three macOS‑specific things to plan for:**

1. **Permissions (TCC).** macOS will require the app to be granted **Accessibility** (to send synthetic clicks) and **Screen Recording** (to read the screen for calibration) in System Settings ▸ Privacy & Security. This is a one‑time per‑machine setup, similar in spirit to the Windows Defender exclusion you already document. The operator will see permission prompts the first time.

2. **The calibration model still applies.** Because GoPro Player on Mac is very likely just as opaque to the accessibility API as it is on Windows, your **hover + SPACE calibration** approach is the right design for Mac too. The 10 calibration points carry over, *minus* any controls that turn out not to exist on Mac (e.g., if "Un‑gain" is Windows‑only) and *plus* any Mac‑only control (e.g., denoise, if it's real).

3. **Code signing / notarization.** To distribute a Mac build that can request Accessibility permission without Gatekeeper friction, the `.app` should be **signed and notarized** with an Apple Developer ID ($99/yr Apple Developer account). This is the Mac equivalent of your portable `.exe` + Defender exclusion step.

**Net assessment:** porting is **feasible and moderate effort.** The risk is *not* the architecture (it's sound and reusable) — it's the **per‑control calibration**, which can only be locked down by sitting in front of an actual Mac running GoPro Player and mapping each control's screen position, exactly as you did on Windows.

---

## 6. Two things to confirm hands‑on before building the Mac robot

These are the only open questions, and both need eyes on a real Mac running GoPro Player:

1. **Denoise (and any other extra Mac control).** Open HyperSmooth Pro ▸ Controls ▸ Advanced Settings on the Mac and compare the full control list to your Windows SOP (Smoothness, Cropping, Un‑gain, Aspect Ratio 8:7). Confirm whether a Denoise control exists, where it sits, and whether it's a slider or a toggle.

2. **Batch select / apply‑to‑all.** In the Mac export queue, test whether ⌘A (or shift‑click) selects multiple clips and whether settings can be applied to the selection — or whether "Auto‑Apply Last Settings to New Video" is the intended path. This determines whether the Mac robot loops settings per file (slower, more fragile) or sets them once (simpler).

> If you can get me onto a Mac — or send screenshots of the Mac app's HyperSmooth Advanced Settings panel and the Batch Exporter queue — I can finish this audit with exact, confirmed control lists and turn it straight into a macOS calibration plan and the `main.cjs` macOS handlers.

---

## Sources
- [GoPro Player product page (specs, codecs, compatibility, APMP/Vision Pro)](https://gopro.com/en/us/info/gopro-player)
- [GoPro Player + ReelSteady launch — batch export, presets, lens correction (Apr 2022)](https://gopro.com/en/us/news/gopro-player-reelsteady-desktop-app-update)
- [GoPro Player: How To Use HyperSmooth Pro — Advanced Settings list](https://community.gopro.com/s/article/GoPro-Player-How-To-Use-HyperSmooth-Pro?language=en_US)
- [GoPro Player: Batch Exporter — "you can only modify one clip's settings at a time"](https://community.gopro.com/s/article/GoPro-Player-Batch-Exporter?language=en_US)
- [Community thread: launching Batch Exporter from shell — confirms no public API](https://community.gopro.com/s/question/0D53b00008R5NJaCAN/is-it-possible-to-launch-the-gopro-player-batch-exporter-from-shell?language=en_US)
