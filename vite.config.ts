import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    define: {
      // Injected at build time so the running app can show exactly which build it is.
      __BUILD_TIME__: JSON.stringify(
        new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
      ),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000
    }
  };
});
