import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the FPV Festival Slate (from the Slate-App repo) into a SINGLE self-
// contained HTML file (dist-slate/index.html). The dashboard server serves it at
// /slate, matching how the phone dashboard page is already served as one string.
export default defineConfig({
  root: 'slate',
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: '../dist-slate',
    emptyOutDir: true,
    // Inline everything so there are no separate asset requests.
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
  },
});
