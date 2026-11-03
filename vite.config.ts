import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3000',
            changeOrigin: true,
            // If they are not running vercel dev, this will fail. We'll handle it in the UI.
          }
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1600
      }
    };
});