import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true, // 或者使用 '0.0.0.0'
    port: 5173
  },
  plugins: [react()],
});
