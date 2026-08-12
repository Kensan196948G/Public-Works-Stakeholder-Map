import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // MapLibre は遅延読込の地図専用チャンク（初期ロードに含まれない）。
    // vendor を分離し、チャンク警告を運用上の許容値として明示する（2026-08-12）
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          'map-vendor': ['maplibre-gl'],
        },
      },
    },
  },
  server: {
    // ローカル開発時は wrangler dev (8787) の API へプロキシする
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
