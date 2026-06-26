# FPV Card Boss — Cross-Platform (Windows + macOS) Architecture & Roadmap
*Prepared June 25, 2026*

This is the plan for making FPV Card Boss run — and run the GoPro robot — on **both Windows and Mac**, with the app deciding which engine to use based on a platform choice you make when you open it.

---

## Guiding principles

1. **Don't break what works.** The Windows robot (PowerShell + `user32.dll` clicks, Robocopy, the existing calibration) stays exactly as it is. We *relocate* that code behind an abstraction layer — we do not rewrite it.
2. **One app, two engines.** The React UI, Google Sheets logic, local database, and festival theme are already cross-platform (Electron runs on Mac). Only the OS‑specific layer changes per platform.
3. **The app picks the engine.** On launch, the app asks "Which computer is this — Windows PC or Mac?" (pre‑selecting the auto‑detected answer), saves it, and routes every OS‑specific action to the matching implementation.
4. **Separate calibration per platform.** Mac and Windows store their own 10‑point calibration maps, so calibrating on a Mac never wipes your PC calibration, and vice‑versa.

---

## The core design: a platform abstraction layer

Today, `main.cjs` calls Windows things directly (Robocopy, PowerShell, `SetForegroundWindow`). We introduce a thin layer so every OS‑specific action goes through one common interface:

```
main.cjs  ──►  getAutomation(config.platform)  ──►  windows.cjs   (existing PowerShell/Robocopy code, relocated)
                                               └──►  mac.cjs       (new — nut.js + rsync + AppleScript)
```

**The interface** (`electron/platform/`), one method per OS‑specific thing the robot needs:

| Method | Windows impl | macOS impl |
|---|---|---|
| `copyFootage(src, dest, onProgress)` | Robocopy `/E /Z /W:5 /R:3` | `rsync -a --info=progress2` |
| `launchGoProPlayer()` | `shell:AppsFolder\…!App` | `open -a "GoPro Player"` |
| `getCursorPos()` | PowerShell `GetCursorPos` | nut.js `mouse.getPosition()` |
| `moveMouse(x, y)` | PowerShell | nut.js `mouse.setPosition()` |
| `click(x, y)` | PowerShell / user32 | nut.js `mouse.click()` |
| `pressKey(key)` / `keyCombo([...])` | PowerShell SendInput | nut.js `keyboard` |
| `focusWindow(target)` | `SetForegroundWindow` | AppleScript `activate` |
| `getWindowBounds(target)` | UIA (Explorer `CabinetWClass`) | AppleScript System Events bounds |
| `moveExportedFiles(sinceMs, destDir)` | from `C:\Users\<user>\Videos` | from `~/Movies` |
| `getDefaultExportDir()` | `…\Videos` | `~/Movies` |

Because Windows keeps calling the same code (just relocated into `windows.cjs`), there is **zero behavior change on PC**. Mac gets real implementations phase by phase.

---

## Engineering decision: how the Mac robot clicks

**Chosen: `@nut-tree-fork/nut-js`** — the maintained, MIT‑licensed community fork of nut.js.

Why this over the alternatives:

- **It's a real "take over the mouse" engine**, just like your Windows robot. nut.js drives mouse and keyboard through native OS events (CGEvent on macOS), so GoPro Player can't tell the difference from a human — which is the whole point, since GoPro exposes no API and (confirmed in the earlier audit) no controls to accessibility tools.
- **In‑process, not spawned.** It runs inside Electron's main process, so no launching PowerShell‑style child processes per click. Faster and more reliable, with precise absolute‑coordinate clicks.
- **Keyboard included** — needed for Cmd+A (select), SPACE (your hover‑capture calibration), and any shortcuts.
- **It knows about macOS permissions.** Recent nut.js detects/asks for the **Accessibility** permission your app must have to send synthetic events.
- **Maintained & Apple‑Silicon‑safe.** RobotJS (the older choice) is effectively abandoned and breaks on modern Node/Electron and M‑series Macs. cliclick (a CLI tool) works but needs a Homebrew install on every Mac and is slower (process per click) — I'll keep it only as an emergency fallback for early testing.

**Trade‑off to manage (Phase 2/5):** nut.js is a *native module*, so it must be rebuilt against the app's Electron version (`electron-rebuild`), unpacked from the asar archive in the packaged build (`asarUnpack`), and the Mac build must be code‑signed with the right entitlements. This is a one‑time build‑pipeline setup, handled in Phase 2 and Phase 5.

---

## Phased roadmap

**Phase 1 — Platform foundation (building now).**
Platform picker on launch + saved `config.platform`; the abstraction layer with Windows code relocated and Mac handlers stubbed; calibration storage made per‑platform; UI badge + "change platform". Windows behavior unchanged. *Deliverable: `Phase1_ClaudeCode_Prompt.md`.*

**Phase 2 — macOS automation engine.**
Add `@nut-tree-fork/nut-js`; implement the Mac `getCursorPos / moveMouse / click / pressKey / keyCombo / focusWindow / getWindowBounds`; wire `rsync` copy (done in Phase 1 as it's safe) and `open -a`; add Accessibility + Screen Recording permission detection with a friendly "grant access" screen; set up `electron-rebuild` + `asarUnpack`.

**Phase 3 — macOS calibration tool.**
A separate calibration overlay tuned for the Mac: click‑through overlay + hover‑and‑SPACE capture, the 10 points, and — critically — **Retina coordinate scaling** (macOS reports points, not pixels; we must store/scale correctly) and the macOS menu‑bar offset. Saved into `config.calibration.mac`.

**Phase 4 — macOS GoPro Player control flow.**
Drive HyperSmooth + export on Mac. **The control set is identical to Windows** — same buttons (HyperSmooth 10‑bit, un‑link/un‑gain, smoothness, cropping, aspect ratio, start, export); only their screen positions differ, which the Mac calibration handles. No denoise. One open question to confirm on a real Mac: whether the export queue needs per‑file settings or whether "Auto‑Apply Last Settings to New Video" carries them. Move exported files from `~/Movies`.

**Phase 5 — Mac build, sign & distribute.**
Produce a signed/notarized `.app`/`.dmg` (Apple Developer ID, hardened runtime + entitlements for Accessibility/automation, native module packaged). This is the Mac equivalent of your portable `.exe` + Defender‑exclusion step.

---

## Key macOS gotchas to remember

- **Permissions (TCC):** the app needs **Accessibility** (to click) and **Screen Recording** (to read the screen for calibration), granted once per Mac in System Settings ▸ Privacy & Security. nut.js can prompt for Accessibility.
- **Retina scaling:** screen coordinates on Mac are in *points*; a Retina display has 2× pixels. Calibration must record and replay in the same coordinate space nut.js uses, or clicks land in the wrong spot. This is the #1 thing to get right in Phase 3.
- **Menu bar:** macOS has a global top menu bar; window‑relative offsets differ from Windows.
- **GoPro default export folder:** `~/Movies`, not `Videos`.
- **No API still:** confirmed both platforms — UI automation is the only path, so this architecture is correct, not a workaround.
