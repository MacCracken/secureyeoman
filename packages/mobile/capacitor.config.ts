import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.secureyeoman.app',
  appName: 'SecureYeoman',
  webDir: '../dashboard/dist',
  server: {
    // Uncomment for live-reload during development (replace IP with your machine's LAN address):
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
  },
};

export default config;
