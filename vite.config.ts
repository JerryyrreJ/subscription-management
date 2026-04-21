import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true, // 或者使用 '0.0.0.0'
    port: 5173
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('recharts')) {
            return 'charts';
          }

          if (id.includes('@supabase/supabase-js')) {
            return 'supabase';
          }

          if (id.includes('i18next') || id.includes('react-i18next')) {
            return 'i18n';
          }

          if (id.includes('lucide-react')) {
            return 'icons';
          }

          if (id.includes('react-dom') || id.includes('react/')) {
            return 'react-vendor';
          }
        }
      }
    }
  }
});
