import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vaanavil.reader',
  appName: 'Vaanavil Tamil Reader',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
