// Copies the freshly built portable .exe from the electron-builder output
// directory to the OneDrive Desktop folder, so a build can never go stale
// in the place it might be launched from. Runs automatically after build:exe.
const fs = require('fs');
const path = require('path');

const srcDir = 'C:/Temp/fpv-card-boss-release';
const dstDir = 'C:/Users/Jason/OneDrive/Desktop/fpv-card-boss-release';

const exe = fs.readdirSync(srcDir).find((f) => f.toLowerCase().endsWith('.exe'));
if (!exe) {
  console.error('deploy: no .exe found in ' + srcDir);
  process.exit(1);
}

fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, exe), path.join(dstDir, exe));
console.log('deploy: copied "' + exe + '" -> ' + dstDir);
