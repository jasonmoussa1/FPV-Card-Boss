// Renders docs/manual.html to a polished PDF using the Electron engine that ships
// with this project (so the dark theme, gradients and neon colors print exactly).
// Usage:  npx electron docs/make-manual-pdf.cjs "C:\\path\\to\\output.pdf"
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');

const HTML = path.join(__dirname, 'manual.html');
const OUT = process.argv[2] || path.join(__dirname, 'FPV Card Boss — User Manual.pdf');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 816, height: 1056, webPreferences: { offscreen: true } });
  try {
    await win.loadFile(HTML);
    // Give fonts/layout a beat to settle before printing.
    await new Promise((r) => setTimeout(r, 700));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      landscape: false,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    });
    fs.writeFileSync(OUT, pdf);
    console.log('PDF written: ' + OUT + ' (' + Math.round(pdf.length / 1024) + ' KB)');
  } catch (e) {
    console.error('PDF generation failed:', e && e.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
