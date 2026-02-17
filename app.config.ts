import 'dotenv/config';
import { ExpoConfig } from '@expo/config-types';

const sentryUrl = process.env.SENTRY_URL || 'https://sentry.io/';
const sentryOrg = process.env.SENTRY_ORG || 'drivest';
const sentryProject = process.env.SENTRY_PROJECT || 'react-native';

const config: ExpoConfig = {
  name: 'Drivest',
  slug: 'drivestu',
  owner: 'pprriiyyaa',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'drivest',
  icon: './assets/app-icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-logo.png',
    resizeMode: 'contain',
    backgroundColor: '#f2f6ff',
  },
  ios: {
    bundleIdentifier: 'com.drivest.app',
    supportsTablet: true,
    splash: {
      image: './assets/splash-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f6ff',
    },
  },
  android: {
    package: 'com.drivest.app',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-foreground.png',
      backgroundColor: '#f2f6ff',
    },
    splash: {
      image: './assets/splash-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f6ff',
    },
  },
  web: {
    favicon: './assets/app-icon.png',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/splash-logo.png',
        imageWidth: 260,
        resizeMode: 'contain',
        backgroundColor: '#f2f6ff',
      },
    ],
    ['@sentry/react-native/expo', { url: sentryUrl, organization: sentryOrg, project: sentryProject }],
    'expo-font',
    'expo-location',
    'expo-notifications',
    'expo-secure-store',
    'expo-sqlite',
    ['@rnmapbox/maps', { RNMapboxMapsImpl: 'mapbox' }],
  ],
  extra: {
      "eas": {
        "projectId": "59222022-29be-4c8c-ae9a-ac639faf2a25"
       
      },
   
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
    revcatKey: process.env.EXPO_PUBLIC_REVCAT_API_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    sentryEnv: process.env.EXPO_PUBLIC_SENTRY_ENV,
  },
};

export default config;
