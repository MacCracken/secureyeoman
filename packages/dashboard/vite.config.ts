import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
  const allowedHosts = env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [];

  return {
    plugins: [micromarkResolve(), react()],
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
      https:
        env.VITE_TLS_CERT && env.VITE_TLS_KEY
          ? {
              cert: resolve(__dirname, '../..', env.VITE_TLS_CERT),
              key: resolve(__dirname, '../..', env.VITE_TLS_KEY),
            }
          : undefined,
      // Proxy API requests to the gateway
      proxy: {
        '/api': {
          target: GATEWAY_URL,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
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
