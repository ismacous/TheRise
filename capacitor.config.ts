import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ismacous.therise',
  appName: 'The Rise',
  webDir: 'dist',
  android: {
    // The game draws its own background; letting the WebView paint white first
    // causes a jarring flash on launch.
    backgroundColor: '#10161F',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#12100D',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
