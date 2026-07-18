import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // ローカル開発時は wrangler dev (8787) の API へプロキシする
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
