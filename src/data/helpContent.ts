export interface HelpEntry {
  title: string;
  what: string;
  why?: string;
  tips?: string[];
}

export const HELP_CONTENT: Record<string, HelpEntry> = {
  loadSample: {
    title: "Load Sample EDC",
    what: "Loads the built-in EDC Las Vegas 2026 shot list so you can practice the entire workflow without a real SD card or CSV. It fills the shot list, sets the day to Day 1 – Fest Grounds, and picks a sample pilot.",
    why: "Use this to learn the app safely. For a real show, use Import CSV instead so folder names match the production's actual shot list.",
  },
  importCsv: {
    title: "Import CSV",
    what: "Loads the real shot list for the show from a .csv file the production team gives you. You can also just drag a .csv file anywhere onto the window.",
    why: "The shot list tells the app which artist or performance each card belongs to, so every folder gets named correctly and lands in the right place.",
  },
  setup: {
    title: "Setup",
    what: "Opens the one-time configuration for this show: the three drive locations, the SD card drive, your pilots, and GoPro robot calibration.",
    why: "Set this up once when you arrive on site. Every folder path and copy operation in the app depends on these being correct.",
  },
  eventName: {
    title: "Event Name",
    what: "The name of the show, e.g. EDC2026. This becomes the top-level folder: Local\\[Event]\\[Day]\\[Pilot]\\[Card]_[Artist].",
    why: "Keep it short and consistent — it's used to build every single folder path, so changing it mid-show splits your footage across two folder trees.",
  },
  localPath: {
    title: "Local Working Path",
    what: "Your fast working drive where footage is copied first and stabilized. The app builds the RAW and STABILIZED folders here.",
    why: "Working locally keeps copying and exporting fast. RAW holds untouched clips straight off the card; STABILIZED holds the finished exports. You deliver to the network drives afterward.",
  },
  mediaPath: {
    title: "Media Drive Root (Insomniac Media Drive)",
    what: "The app copies the ENTIRE card folder here — both RAW and STABILIZED — into a flat folder named after the card ID (e.g. L_001).",
    why: "The Media Drive is the master archive editors pull from, so it needs the originals AND the stabilized versions kept together.",
  },
  bellaPath: {
    title: "Bella Social Path",
    what: "The Bella Network social-media drive. The app copies ONLY the stabilized clips here, into a folder named after the artist.",
    why: "The social team should never receive raw footage — only finished, stabilized clips — so raw is deliberately left out of this copy.",
  },
  sdCard: {
    title: "SD Card Drive",
    what: "The drive letter Windows assigns to the pilot's SD card when you plug it in (e.g. E:\\). Everything here is copied into the RAW folder.",
    why: "This letter can change between cards. Double-check it for every card, or you risk copying from the wrong card.",
    tips: ["Open File Explorer to confirm the exact drive letter before copying."],
  },
  goproOutput: {
    title: "GoPro Output Folder",
    what: "Where GoPro Player drops finished exports — usually C:\\Users\\[you]\\Videos. After export, the MOVE FILES button pulls the new clips into the correct STABILIZED folder for you.",
    why: "The app deliberately doesn't fight GoPro's export dialog. It lets GoPro export to its default folder, then moves the files, which is far more reliable.",
  },
  pilots: {
    title: "Pilots",
    what: "Each FPV pilot gets a card prefix and a starting card number (e.g. L starting at 1 produces L_001, L_002...). The active pilot sets the next card ID and filters the shot list.",
    why: "Add one entry per pilot you're wrangling for this show so card IDs stay unique and traceable to the right pilot.",
  },
  calibrate: {
    title: "Calibrate GoPro Robot",
    what: "Teaches the app exactly where GoPro Player's buttons and sliders sit on YOUR screen. Hover over each control and press SPACE.",
    why: "GoPro Player can't be controlled normally by Windows, so the app physically moves the mouse and clicks. That only works if it knows the on-screen positions. If you move or resize the GoPro window, recalibrate — otherwise the robot clicks the wrong spot.",
    tips: ["Recalibrate any time the GoPro window moves or changes size."],
  },
  daySection: {
    title: "Day / Section Filter",
    what: "Filters the shot list to one shooting day or festival section.",
    why: "Folders are organized by day (Day1, Day2...). Picking the right day makes sure each card lands in the correct day folder.",
  },
  pilotFilter: {
    title: "Pilot Filter",
    what: "Shows only the selected pilot's assignments so you're matching the card in your hand to the right artist.",
  },
  chooseFromList: {
    title: "Choose From List",
    what: "Opens the full shot list so you can manually pick which artist or performance this card is for, instead of the auto-suggested next assignment.",
    why: "Cards often come in out of order at 3 AM. Use this to grab the exact assignment that matches the card you're holding.",
  },
  activePilot: {
    title: "Active Pilot",
    what: "Switches which pilot you're processing. This changes the card prefix (e.g. L_ vs R_), the next card number, and the shot-list filter.",
    why: "Always confirm the active pilot matches the physical card you're holding before you start, or the card ID and folders will be wrong.",
  },
  cardNumber: {
    title: "Card Number",
    what: "The number for the next card. Combined with the pilot's prefix it forms the card ID, like L_001. The app auto-increments it as you complete cards.",
    why: "Only edit this if you need to correct a number or skip one — the count should normally advance by itself.",
  },
  resetCardNumber: {
    title: "Reset Card Number",
    what: "Resets the card number back to this pilot's configured starting number.",
    why: "Use it if the count drifts or you're starting a fresh day.",
  },
  cardId: {
    title: "Card ID",
    what: "The unique name for this card (prefix + number, e.g. L_001). It names the folder on the Media Drive and is logged in column B of the Media Master sheet.",
    why: "Each physical SD card equals one card ID. This is how every drive and the tracking sheet stay in sync.",
  },
  artistName: {
    title: "Artist / Performance",
    what: "The artist this card's footage is for, pulled from the shot list. It names the local shot folder (Card_Artist) and the Bella folder, and goes in column I of the Media Master.",
    why: "If this is wrong, the social team's folder gets the wrong name. Use Override if the shot list doesn't match what's on the card.",
  },
  overrideArtist: {
    title: "Override Artist",
    what: "Manually set the artist name for this card when the shot list doesn't match what's actually on the card.",
    why: "Overriding changes the folder names for THIS card only, so a one-off mismatch doesn't break your naming everywhere else.",
  },
  createFolders: {
    title: "Create Directory Paths",
    what: "Creates every folder this card needs in one click: RAW and STABILIZED locally, RAW and STABILIZED on the Media Drive, and the artist folder on Bella.",
    why: "Keeping RAW (untouched) and STABILIZED (exported) in separate subfolders for every shot is the core of the SOP. It prevents mixing originals with processed clips and keeps the camera card structure untouched.",
  },
  copySdToRaw: {
    title: "Copy SD to RAW",
    what: "Copies everything off the SD card into the local RAW folder using Robocopy (/E /Z /W:5 /R:3 — all subfolders, resumable, retries on errors). It also measures the card size in GB for your log.",
    why: "Always preserve the untouched originals in RAW before doing anything else. If a later step fails, you can always re-export from RAW.",
  },
  goproSettings: {
    title: "GoPro Export Settings",
    what: "The locked-in ReelSteady V2 settings for every clip: Codec HEVC (H.265) 10-bit, HyperSmooth Pro ON, Smoothness 15, Cropping 15, Aspect Ratio 8:7.",
    why: "These exact values give consistent, smooth stabilization across all pilots and the widest field of view (8:7), so footage cuts together cleanly in the edit. The consistency is the whole point — every clip must match.",
  },
  unGain: {
    title: "Un-Gain (Unlink Sliders)",
    what: "Before adjusting Smoothness and Cropping, the robot clicks the un-gain / chain-link button to UNLINK the two sliders.",
    why: "When linked, moving one slider drags the other with it, so you could never set Smoothness 15 and Cropping 15 independently. Unlinking first is what lets each be set correctly.",
  },
  goproRobot: {
    title: "Start GoPro Robot",
    what: "Runs the full automation: opens GoPro Player, drops in the RAW clips, selects ALL of them, applies the SOP settings, and starts the batch export.",
    why: "It presses Ctrl+A to select every clip before applying settings — this is critical, because if all clips aren't selected the settings only hit one file. Keep your hands off the mouse while it runs.",
    tips: ["Don't touch the mouse or keyboard until the robot finishes."],
  },
  moveExports: {
    title: "Move Files",
    what: "After GoPro finishes exporting, this moves the freshly exported .mp4s from GoPro's Videos folder into this card's STABILIZED folder.",
    why: "It only grabs files created after the export started, so it won't touch older clips. Run it once the export is fully complete.",
  },
  copyToMedia: {
    title: "Copy to Media Drive",
    what: "Copies the whole card folder — RAW + STABILIZED — to the Insomniac Media Drive under the card ID (e.g. L_001).",
    why: "The Media Drive is the master archive editors pull from, so it keeps originals and stabilized clips together.",
  },
  copyToBella: {
    title: "Copy to Bella",
    what: "Copies ONLY the stabilized clips to the Bella social drive under the artist's name (top-level files only, no subfolders).",
    why: "The social team should never get raw footage — only finished, stabilized clips.",
  },
  checklistRawLocal: {
    title: "Verify: RAW Copied Locally",
    what: "Confirm the RAW footage actually landed in the local RAW folder before moving on.",
    why: "A quick sanity check that the card copied fully — catching a short copy here saves you from a half-stabilized delivery later.",
  },
  checklistGpsSettings: {
    title: "Verify: GoPro Settings Applied",
    what: "Confirm GoPro applied the correct settings — HEVC 10-bit, HyperSmooth Pro on, Smoothness 15, Cropping 15, 8:7 — before you trust the export.",
    why: "If any value is off, recalibrate and re-run rather than delivering inconsistent footage that won't cut together with the other pilots' clips.",
  },
  checklistFileCount: {
    title: "Verify: File Count Matches",
    what: "Confirm the number of stabilized clips matches the number of raw clips — every clip exported.",
    why: "Catching a missing file here prevents an incomplete delivery to the editors.",
  },
  completeCard: {
    title: "Complete Card",
    what: "Marks this card done: logs it to your local history, advances the card number, and clears the card for the next one.",
    why: "Only do this after both drives have the files and you've verified the counts, so your history reflects truly finished cards.",
  },
  sizeInput: {
    title: "Card Size (GB)",
    what: "The card's size in GB, auto-filled after the move. Goes in column C of the Media Master sheet.",
    why: "Lets the team track data volume per card across the show.",
  },
  notesInput: {
    title: "Notes",
    what: "Notes for this card's row in the Media Master, e.g. 'Media Drive verified'.",
    why: "Use it to flag anything the post team should know about this card.",
  },
  googleSheets: {
    title: "Media Master Log",
    what: "The shared tracking sheet (the FILM CREW tab). Card ID goes in column B, size in C, artist in I, and 'COMPLETED' in J.",
    why: "Update it ONLY after the full folder (RAW + STABILIZED) is confirmed on the Media Drive — never while a copy is still running — so the sheet only ever shows truly completed cards.",
  },
  rawVsStabilized: {
    title: "RAW vs STABILIZED",
    what: "RAW = the untouched original clips straight off the SD card. STABILIZED = the clips after GoPro/ReelSteady smooths them.",
    why: "The SOP keeps these in separate subfolders for every shot so originals are never overwritten and you can always re-export if something goes wrong.",
  },
  phoneAccess: {
    title: "Open on your phone",
    what: "These are the web addresses for the phone companion. Scan a QR code with your phone's camera, or tap Copy and paste the link into the phone's browser. Then use 'Add to Home Screen' for an app icon.",
    why: "There are different addresses because phones treat them differently. The HTTPS (Tailscale) one is special: only a secure HTTPS address is allowed by browsers to work offline and use the microphone.",
    tips: [
      "★ Recommended — Tailscale (HTTPS): use this one. Works anywhere with Tailscale on, opens the Shot List & Slate even with the computer OFF, and enables the slate mic. Add it to the Home Screen.",
      "Tailscale (HTTP): works anywhere with Tailscale on, but online-only — no offline and no mic.",
      "Same Wi-Fi (LAN, 192.168…): quick access when the phone is on the same Wi-Fi as the computer. Online-only.",
      "First time: open the address once while the computer is running (and Tailscale on) so the phone can save a copy — after that the HTTPS one works offline.",
    ],
  },
};
