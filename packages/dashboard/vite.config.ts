import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../..'), '');
  const GATEWAY_URL = env.VITE_GATEWAY_URL || 'http://127.0.0.1:18789';
  const allowedHosts = env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [];

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      include: ['monaco-editor'],
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
      https: env.VITE_TLS_CERT && env.VITE_TLS_KEY ? {
        cert: resolve(__dirname, '../..', env.VITE_TLS_CERT),
        key: resolve(__dirname, '../..', env.VITE_TLS_KEY),
      } : undefined,
      // Proxy API requests to the gateway
      proxy: {
        '/api': {
          target: GATEWAY_URL,
          changeOrigin: true,
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
          rewrite: (path) => path.replace(/^\/terminal/, ''),
        },
        '/health': {
          target: GATEWAY_URL,
          changeOrigin: true,
        },
        '/prom': {
          target: GATEWAY_URL,
          changeOrigin: true,
        },
        '/ws': {
          target: GATEWAY_URL.replace('http', 'ws'),
          ws: true,
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
            'chart-vendor': ['reactflow', 'recharts'],
          },
        },
      },
    },
  };
});
