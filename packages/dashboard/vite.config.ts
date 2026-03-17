import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import type { Plugin as EsbuildPlugin } from 'esbuild';

/**
 * Vite plugin: resolve micromark deep imports (e.g. micromark/lib/parse.js)
 * that are blocked by micromark@4's strict `exports` field.
 * Mermaid (via excalidraw) imports these sub-modules, but the hoisted
 * micromark@4 only exposes "." and "./stream" in its exports map.
 */
function micromarkResolve(): Plugin {
  const prefix = 'micromark/';
  return {
    name: 'micromark-deep-resolve',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith(prefix) && source !== 'micromark/stream') {
        const subpath = source.slice('micromark'.length); // e.g. /lib/parse.js
        return resolve(__dirname, `../../node_modules/micromark${subpath}`);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, resolve(__dirname, '../..'), ''), ...process.env };
  const GATEWAY_URL = env.VITE_GATEWAY_URL || 'http://127.0.0.1:18789';

  // Derive allowed hosts from SECUREYEOMAN_EXTERNAL_URL if VITE_ALLOWED_HOSTS not set
  let allowedHosts: string[] = [];
  if (env.VITE_ALLOWED_HOSTS) {
    allowedHosts = env.VITE_ALLOWED_HOSTS.split(',');
  } else if (env.SECUREYEOMAN_EXTERNAL_URL) {
    try {
      allowedHosts = [new URL(env.SECUREYEOMAN_EXTERNAL_URL).hostname];
    } catch {
      // Invalid URL — skip
    }
  }

  return {
    plugins: [
      micromarkResolve(),
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: false, // Use public/manifest.webmanifest
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB — Monaco workers are ~7 MB
          runtimeCaching: [
            {
              urlPattern: /^\/api\/v1\/(conversations|settings|personalities)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxEntries: 100, maxAgeSeconds: 300 },
                networkTimeoutSeconds: 5,
              },
            },
            {
              urlPattern: /^\/api\//,
              handler: 'NetworkOnly',
            },
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/health/, /^\/prom/],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom', '@tanstack/react-virtual'],
    },
    optimizeDeps: {
      include: [
        'monaco-editor',
        '@tanstack/react-virtual',
        '@tanstack/virtual-core',
        '@excalidraw/excalidraw',
      ],
      esbuildOptions: {
        define: {
          global: 'global',
        },
        plugins: [
          {
            name: 'micromark-deep-resolve',
            setup(build) {
              build.onResolve({ filter: /^micromark\/lib\// }, (args) => {
                const subpath = args.path.slice('micromark'.length);
                return { path: resolve(__dirname, `../../node_modules/micromark${subpath}`) };
              });
            },
          } satisfies EsbuildPlugin,
        ],
      },
    },
    server: {
      // Bind to all interfaces for external access
      host: env.VITE_HOST || '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts,
      watch: {
        // Required for file change detection inside Docker containers
        usePolling: true,
        interval: 300,
      },
      https: (() => {
        // Explicit VITE_TLS_* vars take precedence, then derive from TLS_CERT_PATH (strip /app/ container prefix)
        const cert = env.VITE_TLS_CERT || (env.TLS_CERT_PATH ?? '').replace(/^\/app\//, '');
        const key = env.VITE_TLS_KEY || (env.TLS_KEY_PATH ?? '').replace(/^\/app\//, '');
        return cert && key
          ? { cert: resolve(__dirname, '../..', cert), key: resolve(__dirname, '../..', key) }
          : undefined;
      })(),
      // Proxy API requests to the gateway
      proxy: {
        '/api': {
          target: GATEWAY_URL,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              // eslint-disable-next-line no-console
              console.error('[vite proxy /api] error:', err.message);
              if ('writeHead' in res && !res.headersSent) {
                res.writeHead(502, {
                  'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
              }
            });
          },
        },
        '/terminal': {
          target: `${GATEWAY_URL}/api/v1/terminal`,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/terminal/, ''),
        },
        '/health': {
          target: GATEWAY_URL,
          changeOrigin: true,
          secure: false,
        },
        '/prom': {
          target: GATEWAY_URL,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: GATEWAY_URL.replace('https', 'wss').replace('http', 'ws'),
          ws: true,
          secure: false,
          configure: (proxy) => {
            // Suppress transient ECONNREFUSED / ENOTFOUND errors that occur while
            // the core container is starting up or being recreated.  Any other
            // error (unexpected protocol issues, etc.) is still logged.
            proxy.on('error', (err) => {
              const code = (err as NodeJS.ErrnoException).code ?? '';
              if (!['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(code)) {
                // eslint-disable-next-line no-console
                console.error('[vite proxy /ws] error:', err.message);
              }
            });
          },
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 3000,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'query-vendor': ['@tanstack/react-query'],
            'charts-vendor': ['recharts'],
            'flow-vendor': ['reactflow'],
            'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            mermaid: ['mermaid'],
            excalidraw: ['@excalidraw/excalidraw'],
          },
        },
      },
    },
  };
});
