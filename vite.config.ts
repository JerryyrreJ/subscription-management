import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { blogPlugin } from './scripts/blog/plugin';
import { agentAssetsPlugin } from './scripts/agent-assets';
import {
  CANONICAL_ORIGIN,
  DEFAULT_SITE_ORIGIN,
  configurePublicSite,
} from './scripts/blog/site';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  configurePublicSite(env.VITE_SITE_URL, env.VITE_APP_URL);
  return {
    server: {
      host: true, // 或者使用 '0.0.0.0'
      port: 5173,
    },
    plugins: [
      react(),
      blogPlugin(),
      agentAssetsPlugin(),
      {
        name: 'landing-site-metadata',
        transformIndexHtml(html) {
          return html.replaceAll(DEFAULT_SITE_ORIGIN, CANONICAL_ORIGIN);
        },
      },
    ],
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
          },
        },
      },
    },
  };
});
