# -*- coding: utf-8 -*-
"""Build the standalone FPV Card Boss PDFs (Full Operator Manual + Quick Reference),
dark/neon branded, with ReportLab. Self-contained — no HTML/browser needed."""
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, NextPageTemplate, PageBreak)
from reportlab.lib.styles import ParagraphStyle

BG=colors.HexColor("#070912"); PANEL=colors.HexColor("#121627"); INK=colors.HexColor("#eef2f7")
MUTED=colors.HexColor("#9aa6bd"); CYAN=colors.HexColor("#00e5ff"); PURPLE=colors.HexColor("#b44fff")
GREEN=colors.HexColor("#00ff88"); AMBER=colors.HexColor("#ffb020"); RED=colors.HexColor("#ff5c7c")
LINE=colors.HexColor("#2a3148")
PW,PH=letter; MARGIN=0.7*inch

def bg_paint(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG); canvas.rect(0,0,PW,PH,fill=1,stroke=0)
    canvas.setFillColor(CYAN); canvas.rect(0,PH-10,PW,10,fill=1,stroke=0)
    canvas.setFillColor(PURPLE); canvas.rect(PW/2,PH-10,PW/2,10,fill=1,stroke=0)
    canvas.setFont("Helvetica-Bold",7); canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN,0.42*inch,"FPV CARD BOSS  -  OPERATOR MANUAL")
    canvas.drawRightString(PW-MARGIN,0.42*inch,"PAGE %d"%canvas.getPageNumber())
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5); canvas.line(MARGIN,0.56*inch,PW-MARGIN,0.56*inch)
    canvas.restoreState()

def cover_paint(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG); canvas.rect(0,0,PW,PH,fill=1,stroke=0)
    canvas.setFillColor(CYAN); canvas.rect(0,PH-14,PW,14,fill=1,stroke=0)
    canvas.setFillColor(PURPLE); canvas.rect(PW/2,PH-14,PW/2,14,fill=1,stroke=0)
    canvas.setFillColor(PURPLE); canvas.rect(0,0,PW,14,fill=1,stroke=0)
    canvas.setFillColor(CYAN); canvas.rect(0,0,PW/2,14,fill=1,stroke=0)
    canvas.restoreState()

def P(name, **kw):
    base=dict(fontName="Helvetica",fontSize=10.2,leading=14.5,textColor=INK,spaceAfter=7,alignment=TA_LEFT)
    base.update(kw); return ParagraphStyle(name,**base)

st_body=P("body"); st_lead=P("lead",fontSize=11.5,leading=16,textColor=colors.HexColor("#d7deea"))
st_h2=P("h2",fontName="Helvetica-Bold",fontSize=19,leading=22,textColor=colors.white,spaceBefore=4,spaceAfter=2)
st_h2sub=P("h2sub",fontSize=10,textColor=MUTED,spaceAfter=10)
st_h3=P("h3",fontName="Helvetica-Bold",fontSize=12.5,leading=15,textColor=CYAN,spaceBefore=8,spaceAfter=3)
st_li=P("li",leftIndent=12,spaceAfter=4)
st_call_t=P("callt",fontName="Helvetica-Bold",fontSize=8.5,textColor=CYAN,spaceAfter=2)
st_call_b=P("callb",fontSize=9.8,leading=13.5,textColor=colors.HexColor("#d7deea"),spaceAfter=0)
st_cover_h=P("ch",fontName="Helvetica-Bold",fontSize=52,leading=50,textColor=colors.white,spaceAfter=8)
st_cover_t=P("ct",fontSize=15,leading=21,textColor=MUTED,spaceAfter=6)
st_step=P("step",leftIndent=2,spaceAfter=5,leading=14)
st_qr=P("qr",fontSize=9,leading=12.5,textColor=colors.HexColor("#d7deea"))
st_qrh=P("qrh",fontName="Helvetica-Bold",fontSize=9.5,textColor=CYAN,spaceAfter=3)
CALL_COLORS={"note":CYAN,"tip":GREEN,"warn":AMBER,"danger":RED}

def callout(kind,title,body):
    c=CALL_COLORS[kind]
    inner=[[Paragraph(title.upper(),ParagraphStyle("ct2",parent=st_call_t,textColor=c))],[Paragraph(body,st_call_b)]]
    t=Table([[Table(inner,colWidths=[PW-2*MARGIN-30])]],colWidths=[PW-2*MARGIN-8])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),PANEL),("LINEBEFORE",(0,0),(0,-1),3,c),
        ("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9),("BOX",(0,0),(-1,-1),0.5,LINE)]))
    return t

def section(num,title,sub):
    badge=Table([[Paragraph("<b>%s</b>"%num,ParagraphStyle("bn",fontName="Helvetica-Bold",fontSize=15,textColor=colors.HexColor("#04060a"),alignment=1))]],colWidths=[28],rowHeights=[28])
    badge.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),CYAN),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ROUNDEDCORNERS",[6,6,6,6])]))
    head=Table([[badge,Paragraph(title,st_h2)]],colWidths=[36,PW-2*MARGIN-36])
    head.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
    out=[Spacer(1,6),head]
    if sub: out.append(Paragraph(sub,st_h2sub))
    return out

def bullets(items): return [Paragraph("<font color='#00e5ff'>&gt;</font>&nbsp;&nbsp;"+x,st_li) for x in items]
def steps(items): return [Paragraph("<font color='#00e5ff'><b>%d.</b></font>&nbsp;&nbsp;%s"%(i,x),st_step) for i,x in enumerate(items,1)]

def data_table(rows,col0w=0.34):
    w0=(PW-2*MARGIN)*col0w; w1=(PW-2*MARGIN)-w0
    data=[[Paragraph(a,ParagraphStyle("th",fontName="Helvetica-Bold",fontSize=8.5,textColor=MUTED)),
           Paragraph(b,ParagraphStyle("th2",fontName="Helvetica-Bold",fontSize=8.5,textColor=MUTED))] if i==0
          else [Paragraph(a,ParagraphStyle("td",fontName="Helvetica-Bold",fontSize=9.5,textColor=colors.white)),
                Paragraph(b,ParagraphStyle("td2",fontSize=9.5,textColor=colors.HexColor("#d7deea"),leading=12.5))]
          for i,(a,b) in enumerate(rows)]
    t=Table(data,colWidths=[w0,w1])
    t.setStyle(TableStyle([("LINEBELOW",(0,0),(-1,-1),0.5,LINE),("TOPPADDING",(0,0),(-1,-1),6),
        ("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),8),("VALIGN",(0,0),(-1,-1),"TOP")]))
    return t

def build_full(path):
    doc=BaseDocTemplate(path,pagesize=letter,leftMargin=MARGIN,rightMargin=MARGIN,topMargin=0.8*inch,bottomMargin=0.8*inch,title="FPV Card Boss - Operator Manual")
    doc.addPageTemplates([
        PageTemplate(id="cover",frames=[Frame(MARGIN,1.2*inch,PW-2*MARGIN,PH-2.4*inch)],onPage=cover_paint),
        PageTemplate(id="body",frames=[Frame(MARGIN,0.7*inch,PW-2*MARGIN,PH-1.55*inch,id="main")],onPage=bg_paint),
    ])
    s=[Spacer(1,1.7*inch),Paragraph("FPV CARD BOSS",st_cover_h),
       Paragraph("The festival FPV stabilizing, delivery &amp; slate command center - on Windows <b><font color='#00e5ff'>and</font></b> Mac, with a live mobile companion for the field.",st_cover_t),
       Spacer(1,18),
       Paragraph("<font color='#00e5ff'><b>Operator Manual - Setup Guide - SOP</b></font>",P("cm",fontSize=12,textColor=CYAN)),
       Paragraph("Version 1.2.0 - Windows &amp; macOS",P("cm2",fontSize=10,textColor=MUTED)),
       Spacer(1,26),
       callout("note","Two ways to read this","<b>New to the job?</b> Read straight through - Section 1 explains the work before the buttons. <b>Done it before?</b> Jump to the Quick Reference at the back.")]
    s.append(NextPageTemplate("body")); s.append(PageBreak())

    s+=section("1","The Job &amp; The SOP","What you're actually doing out here, and why.")
    s+=[Paragraph("You are the <b>stabilizer operator</b> for an FPV drone team at a music festival (EDC Las Vegas, Beyond Wonderland, and the like). Pilots fly all night and hand you SD cards - often at 3 AM, out of order, several at once. Your job: get every card's footage <b>copied, stabilized, and delivered</b> to the right places before the editors need it, and logged so nothing is lost.",st_lead),
        Paragraph("The one rule that never breaks",st_h3),
        Paragraph("Never destroy the originals. Footage always lives in two halves: <b>RAW</b> (untouched clips straight off the card) and <b>STABILIZED</b> (the smoothed exports), in separate subfolders per shot - so originals are never overwritten and you can always re-export from RAW.",st_body),
        Paragraph("Why stabilize, and why a robot",st_h3),
        Paragraph("FPV drones are tiny and twitchy; raw footage is unusably shaky. GoPro Player's HyperSmooth Pro (ReelSteady) flattens that motion. Every clip from every pilot must use the SAME settings so footage cuts together cleanly - that consistency is the whole reason this app exists. The app physically drives GoPro Player (a robot) so the settings are identical every time.",st_body),
        callout("note","Where footage goes","<b>Local</b> - your fast working drive. <b>Media Drive</b> - the master archive (RAW + STABILIZED together, named by card ID). <b>Bella / Social</b> - stabilized clips only, named by artist (social never gets raws). Then it's logged in the shared <b>Media Master</b> sheet."),
        callout("tip","The whole loop in one breath","Card in hand - make folders - copy card to RAW - robot stabilizes - move exports to STABILIZED - copy to Media + Bella - log it - wipe the card - next.")]
    s.append(PageBreak())

    s+=section("2","Requirements, Install &amp; Platform","What you need, and telling the app which computer it's on.")
    s+=[data_table([("Requirement","Detail"),
        ("Computer","A Windows 10/11 PC or a Mac (Apple Silicon or Intel, macOS 10.14+), with a GPU that decodes HEVC."),
        ("GoPro Player","GoPro Player + HyperSmooth Pro (ReelSteady) installed, with the HyperSmooth Pro unlock."),
        ("Drives","A fast local drive, plus the Media and Bella/Social drives or network volumes."),
        ("Phone","iPhone or Android for the mobile companion (optional). Tailscale app for field use.")]),
        Paragraph("Choosing your platform",st_h3),
        Paragraph("On first launch the app asks <b>Which computer is this - Windows PC or Mac?</b> and pre-selects what it detects. Your choice decides which engine drives GoPro Player and your drives. Change it any time from the platform badge in the corner.",st_body),
        callout("warn","Mac: two one-time permissions","The first time the robot runs on a Mac, macOS asks for <b>Accessibility</b> (to move the mouse/keyboard) and <b>Screen Recording</b> (so calibration can read the screen). Approve both in System Settings &gt; Privacy &amp; Security."),
        callout("note","What differs between Windows &amp; Mac","Nothing you can see: same workflow, buttons, settings, slate, and companion. Under the hood, copying uses Robocopy on Windows and rsync on Mac, the robot uses a different click engine, and GoPro exports land in Videos (Windows) vs ~/Movies (Mac). Calibration is saved separately per computer.")]
    s.append(PageBreak())

    s+=section("3","First-Time Setup","Do this once on each computer. Open Setup.")
    s+=steps(["<b>Set the folder paths.</b> Local root, Media drive, Bella drive, Raw Dump folder, SD Card drive/volume, and the GoPro output folder.",
        "<b>Add your pilots.</b> Each gets a card prefix + starting number (e.g. L from 1 produces L_001, L_002). The active pilot sets the next card ID and filters the shot list.",
        "<b>Calibrate the GoPro robot.</b> Run Calibrate GoPro Robot and follow the 14 steps - hover each control and press SPACE (Section 5).",
        "<b>Set the phone password</b> (optional). Gates only the Move Files section on the phone; Shot List &amp; Slate stay open."])
    s+=[callout("danger","Calibration is per-computer &amp; per-resolution","Saved for this machine at its exact resolution. Re-calibrate on a new computer, if you change scaling/resolution, or if you move/resize the GoPro window. Windows and Mac calibrations are independent."),
        Paragraph("Folder structure the app builds",st_h3),
        Paragraph("Local:&nbsp; [Local]\\[Event]\\[Pilot]\\Day[N]\\[Artist]\\RAW + \\STABILIZED<br/>Media:&nbsp; [Media]\\[CardID]\\ (RAW + STABILIZED together)<br/>Bella:&nbsp; [Bella]\\[Artist]\\ (STABILIZED clips only)<br/>Dual:&nbsp;&nbsp; ...\\STABILIZED\\HORIZON LOCK\\ (2nd pass, Dual Mode)",P("code",fontName="Courier",fontSize=9,textColor=CYAN,leading=15))]
    s.append(PageBreak())

    s+=section("4","The Core Workflow","Festival mode - from card in hand to delivered &amp; logged.")
    s+=steps(["<b>Pick the card's assignment.</b> Confirm pilot + day, pick the artist/shot (Choose From List when cards arrive out of order). Sets the card ID and folder names.",
        "<b>Create Directory Paths.</b> Makes RAW &amp; STABILIZED locally, on the Media Drive, and the artist folder on Bella.",
        "<b>Copy SD Card to Local RAW.</b> Copies the card in and verifies count + size. If RAW already has files, it uses a fresh BATCH_02 subfolder so the robot only stabilizes new clips.",
        "<b>Set export options.</b> Toggle Horizon Lock or Dual Mode if needed (Section 6).",
        "<b>Auto-Run GoPro Batch.</b> The robot drives GoPro Player. <b>Hands off the mouse and keyboard until it finishes.</b>",
        "<b>Move Files to STABILIZED.</b> When the export finishes, move the new clips in (only files created after the robot started).",
        "<b>Deliver.</b> Copy to Media Drive, Copy to Bella, Dump Raws as needed.",
        "<b>Complete Card.</b> Logs it, advances the number, clears for the next. Then update the Media Master sheet."])
    s+=[callout("tip","From the couch","Every step from Move Files on can be triggered from your phone, or run hands-free with Auto mode (Section 6).")]
    s.append(PageBreak())

    s+=section("5","Stabilization &amp; Calibration","The locked-in look, and teaching the robot your screen.")
    s+=[Paragraph("The SOP export settings - every clip, every pilot",st_h3),
        data_table([("Setting","Value"),("Codec","HEVC (H.265) 10-bit"),("HyperSmooth Pro","ON"),("Smoothness","15"),("Cropping","15"),("Aspect Ratio","8:7  (widest field of view)")]),
        callout("note","Why un-gain matters","Smoothness and Cropping are linked by default - moving one drags the other. The robot first clicks the un-gain / chain-link button to unlink them, so it can set each to 15 independently. That's why it's a calibration point."),
        Paragraph("Calibration - 14 points (hover each, press SPACE)",st_h3)]
    s+=bullets(["batch list - 10-bit - HyperSmooth - un-gain - Horizon Lock","Smoothness start &amp; end - Cropping start &amp; end","aspect-ratio open - 8:7 option - drop zone - Start - Remove"])
    s+=[callout("danger","Re-calibrate when the window moves","The robot clicks fixed screen positions. Move/resize the GoPro window, change resolution, or switch computers - re-calibrate or it misses.")]
    s.append(PageBreak())

    s+=section("6","Auto - Horizon Lock - Dual Mode","Hands-free delivery, a level horizon, and both versions at once.")
    s+=[Paragraph("Auto vs Manual",st_h3)]
    s+=bullets(["<b>Manual</b> (default) - you click Move, each delivery, and Complete yourself.","<b>Auto</b> - on export finish it auto-moves to Media to Bella, completes the card and advances. Stops and alerts on any failure; never completes a card that didn't fully deliver."])
    s+=[callout("note","Raws are always manual","Dumping raws is never part of Auto mode or the phone's Send to All - a deliberate click, unless you enable Auto-Dump. Always dump raws before wiping a card."),
        Paragraph("Horizon Lock",st_h3),
        Paragraph("Toggle ON (turns blue) before running a batch and the robot enables Horizon Lock so footage exports level. If on but not calibrated, the app warns and skips it - re-calibrate to enable.",st_body),
        Paragraph("Dual Mode - both versions in one run",st_h3),
        Paragraph("The robot exports every clip <b>twice</b>: a normal pass into STABILIZED, then a second pass with Horizon Lock into a STABILIZED\\HORIZON LOCK subfolder. Editors get the regular and the level-horizon version with no filename collisions. About twice as long; needs the Horizon Lock calibration point.",st_body),
        callout("tip","When to use Dual","Use it when the team hasn't decided between locked or unlocked horizon for a set - deliver both and let them choose in the edit.")]
    s.append(PageBreak())

    s+=section("7","The Mobile Companion","Run the shot list, slate, and deliveries from your phone.")
    s+=[Paragraph("Connecting - three addresses",st_h3),
        Paragraph("In Setup, under Open on your phone, scan a QR code or tap Copy, then Add to Home Screen.",st_body)]
    s+=bullets(["<b>* Tailscale (HTTPS)</b> - https://...ts.net. The best one: works anywhere with Tailscale on, opens Shot List &amp; Slate even with the computer OFF, and enables the slate mic.",
        "<b>Tailscale (HTTP)</b> - works anywhere with Tailscale on, but online-only.",
        "<b>Same Wi-Fi (LAN, 192.168...)</b> - quick access on the same Wi-Fi. Online-only."])
    s+=[callout("note","Why HTTPS is special","Browsers only allow offline caching and microphone access over a secure (HTTPS) address - the Tailscale HTTPS link. Open it once while the computer is running (Tailscale on) so the phone caches a copy; after that it works offline."),
        Paragraph("The sections &amp; delivery",st_h3)]
    s+=bullets(["<b>Shot List &amp; Slate</b> - open to anyone; works offline.","<b>Simple Slate</b> - the slate on its own.","<b>Site Map</b> - the venue map image (works offline once cached).","<b>Move Files</b> - live status &amp; delivery; needs the password."])
    s+=[callout("tip","Delivery from the phone","Auto - Send to All is one tap that moves files and copies to every set-up drive (Media + Bella). After raws are backed up, a Delete SD Card button appears so you can finish a card entirely from your phone.")]
    s.append(PageBreak())

    s+=section("8","Shot List, Slate &amp; Site Map","Plan the night, slate the shots, find your way around.")
    s+=[Paragraph("The shot list",st_h3),
        Paragraph("Fill it three ways: <b>Load Sample EDC</b> (practice), <b>Import CSV</b> (the production's real list - drag a .csv onto the window; columns Artist, Stage, Festival, Pilot, Day), or <b>add by hand</b>. Each shot is pending, completed, or skipped. Marking Done/Skip on the phone updates the same row on the computer and fires a red blink + ding there. Skipped shots drop out of the next-card queue.",st_body),
        callout("tip","Live auto-sync - no import step","The phone keeps the shot list in sync with the computer automatically. Change the list on the PC and connected phones update within a few seconds. Anything already marked completed or skipped stays that way - only new or future shots change."),
        Paragraph("The festival slate",st_h3)]
    s+=bullets(["<b>GoPro Labs sync QR</b> - scan with a GoPro to sync clock/timecode (Stable, Med, Fast, Freeze; live TC for 24/25/30/60 fps).","<b>Take counter</b> - bumps save back to the linked shot.","<b>Themes</b>, <b>landscape lock</b>, and a clean <b>fullscreen</b> slate for the camera."])
    s+=[callout("note","Mic &amp; screen-wake need HTTPS","Audio take-recording and keeping the screen awake only work over the Tailscale HTTPS address. Plain http:// blocks them."),
        Paragraph("Site map",st_h3),
        Paragraph("In Setup &gt; Mobile Dashboard, add a venue map image (PNG/JPG/WEBP/GIF/BMP/SVG). It shows full-screen on the phone, works offline once cached, and updates on every phone instantly when you replace it.",st_body)]
    s.append(PageBreak())

    s+=section("9","Simple Mode &amp; Troubleshooting","The lighter flow, and quick fixes.")
    s+=[Paragraph("Simple Mode",st_h3),
        Paragraph("Switch to Simple mode for one-off or non-assignment work. Instead of picking an artist from a shot list, you type a folder name; the app makes RAW/STABILIZED under Local\\[Show]\\[Folder], runs the same SD-copy and robot, and copies to Media/Bella by toggle. No shot-list queue, no Dump Raws, no Complete-and-advance.",st_body),
        Paragraph("Troubleshooting",st_h3),
        data_table([("Symptom","Fix"),
            ("Robot clicks the wrong spots","Re-run Calibrate GoPro Robot (tied to this computer's resolution/scaling and the GoPro window position)."),
            ("Mac robot does nothing / errors","Grant Accessibility + Screen Recording in System Settings &gt; Privacy &amp; Security, then re-run."),
            ("File count doesn't match","A clip may have been missed - re-run rather than delivering an incomplete card."),
            ("Phone says Offline","App must be open on the computer; same Wi-Fi or Tailscale on. Shot List &amp; Slate still work offline."),
            ("Phone marks don't reach the PC","Make sure the phone is connected (Tailscale / same Wi-Fi). The list auto-syncs every few seconds; marks queue and retry. No import step."),
            ("New computer","Copy the app, redo Setup - paths, calibration &amp; password are per-computer.")],col0w=0.40)]
    s.append(PageBreak())

    s+=section("*","Quick Reference","The whole job on one page, for when you've done it before.")
    s+=[callout("note","The loop","Pick assignment - <b>Create Folders</b> - <b>Copy SD to RAW</b> - set Horizon/Dual - <b>Auto-Run GoPro</b> (hands off) - <b>Move Files</b> - <b>Copy Media</b> + <b>Copy Bella</b> - <b>Dump Raws</b> - <b>Complete Card</b> - update Media Master - wipe card.")]
    qbox=[("Export settings","HEVC 10-bit - HyperSmooth Pro ON - Smoothness 15 - Cropping 15 - Aspect 8:7. Un-gain unlinks the sliders first."),
        ("Calibration (14)","batch - 10-bit - HyperSmooth - un-gain - Horizon Lock - Smooth start/end - Crop start/end - aspect open - 8:7 - drop zone - Start - Remove."),
        ("Folder map","Local: Event\\Pilot\\Day\\Artist\\RAW+STABILIZED - Media: [CardID]\\ - Bella: [Artist]\\ (STAB only) - Dual: STABILIZED\\HORIZON LOCK\\"),
        ("Modes","Horizon Lock = one level export - Dual = regular + Horizon (2x time) - Auto = move to Media to Bella to complete (raws manual)."),
        ("Phone connect","Tailscale HTTPS = offline + mic (Add to Home Screen) - Tailscale HTTP / LAN = online only - open once online to cache."),
        ("Media Master sheet","Tab FILM CREW - B = Card ID - C = Size GB - I = Artist - J = COMPLETED. Update only after Media has the full folder.")]
    cells=[]
    for title,body in qbox:
        inner=Table([[Paragraph(title,st_qrh)],[Paragraph(body,st_qr)]],colWidths=[(PW-2*MARGIN-12)/2])
        inner.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),PANEL),("BOX",(0,0),(-1,-1),0.5,LINE),
            ("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
        cells.append(inner)
    grid=Table([[cells[0],cells[1]],[cells[2],cells[3]],[cells[4],cells[5]]],colWidths=[(PW-2*MARGIN)/2]*2)
    grid.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),("LEFTPADDING",(0,0),(0,-1),0),("RIGHTPADDING",(0,0),(0,-1),6)]))
    s+=[grid,Spacer(1,8),
        callout("warn","Mac one-time","Grant Accessibility + Screen Recording. Calibration is separate from Windows."),
        callout("danger","Never deliver short","If the file count doesn't match, re-run. Re-calibrate whenever the GoPro window moves.")]
    doc.build(s); print("WROTE",path)

def build_quick(path):
    doc=BaseDocTemplate(path,pagesize=letter,leftMargin=MARGIN,rightMargin=MARGIN,topMargin=0.8*inch,bottomMargin=0.8*inch,title="FPV Card Boss - Quick Reference")
    doc.addPageTemplates([PageTemplate(id="body",frames=[Frame(MARGIN,0.7*inch,PW-2*MARGIN,PH-1.55*inch)],onPage=bg_paint)])
    s=section("*","FPV Card Boss - Quick Reference","Festival FPV stabilizer - the whole job on one card.")
    s+=[callout("note","The loop","Pick assignment - <b>Create Folders</b> - <b>Copy SD to RAW</b> - set Horizon/Dual - <b>Auto-Run GoPro</b> (hands off) - <b>Move Files</b> - <b>Copy Media</b> + <b>Copy Bella</b> - <b>Dump Raws</b> - <b>Complete Card</b> - update Media Master - wipe card."),
        Paragraph("Export settings (every clip)",st_h3)]
    s+=bullets(["Codec <b>HEVC 10-bit</b> - HyperSmooth Pro <b>ON</b>","Smoothness <b>15</b> - Cropping <b>15</b> - Aspect <b>8:7</b>","Un-gain unlinks the sliders before setting them."])
    s+=[Paragraph("Calibration order (14 - hover, press SPACE)",st_h3),
        Paragraph("batch list - 10-bit - HyperSmooth - un-gain - Horizon Lock - Smoothness start/end - Cropping start/end - aspect open - 8:7 - drop zone - Start - Remove",st_body),
        Paragraph("Folder map",st_h3)]
    s+=bullets(["<b>Local:</b> Event\\Pilot\\Day\\Artist\\RAW + STABILIZED","<b>Media:</b> [CardID]\\ (RAW + STABILIZED) - <b>Bella:</b> [Artist]\\ (STABILIZED only)","<b>Dual:</b> 2nd pass to STABILIZED\\HORIZON LOCK\\"])
    s+=[Paragraph("Modes &amp; connect",st_h3)]
    s+=bullets(["<b>Horizon Lock</b> = one level export - <b>Dual</b> = regular + Horizon (2x time)","<b>Auto</b> = move to Media to Bella to complete (raws stay manual)","<b>Tailscale HTTPS</b> = offline + mic; HTTP/LAN = online only"])
    s+=[Paragraph("Shot list &amp; Media Master",st_h3),
        Paragraph("The phone auto-syncs the computer's shot list (no import; completed shots stay completed). Media Master (FILM CREW tab): B = Card ID, C = Size GB, I = Artist, J = COMPLETED - update only after the full folder is on the Media Drive.",st_body),
        callout("warn","Mac one-time","Grant Accessibility + Screen Recording (System Settings &gt; Privacy &amp; Security). Calibration is separate from Windows."),
        callout("danger","Golden rules","Never deliver a card whose file count doesn't match. Re-calibrate whenever the GoPro window moves. Always dump raws before wiping a card.")]
    doc.build(s); print("WROTE",path)

if __name__=="__main__":
    out=sys.argv[1] if len(sys.argv)>1 else "."
    build_full(out+"/FPV Card Boss - Operator Manual.pdf")
    build_quick(out+"/FPV Card Boss - Quick Reference.pdf")
