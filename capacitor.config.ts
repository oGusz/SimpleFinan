import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.simplefinan.app',
  appName: 'SimpleFinan',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
