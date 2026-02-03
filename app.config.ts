import 'dotenv/config';
import { ExpoConfig } from '@expo/config-types';

const sentryUrl = process.env.SENTRY_URL || 'https://sentry.io/';
const sentryOrg = process.env.SENTRY_ORG || 'drivest';
const sentryProject = process.env.SENTRY_PROJECT || 'react-native';

const config: ExpoConfig = {
  name: 'Drivest',
  slug: 'drivest-app',
  owner: 'vivek921921',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'drivest',
  icon: './assets/applogo.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/applogo.png',
    resizeMode: 'cover',
    backgroundColor: '#f2f6ff',
  },
  ios: {
    bundleIdentifier: 'com.drivest.app',
    supportsTablet: true,
    splash: {
      image: './assets/applogo.png',
      resizeMode: 'cover',
      backgroundColor: '#f2f6ff',
    },
  },
  android: {
    package: 'com.drivest.app',
    adaptiveIcon: {
      foregroundImage: './assets/applogo.png',
      backgroundColor: '#f5f7ff',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    splash: {
      image: './assets/applogo.png',
      resizeMode: 'cover',
      backgroundColor: '#f2f6ff',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
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
        "projectId": "43f1f6c8-d45d-447c-bb1d-6d1138449496"
      },
   
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
    mapboxDownloadToken: process.env.EXPO_PUBLIC_MAPBOX_DOWNLOAD_TOKEN,
    revcatKey: process.env.EXPO_PUBLIC_REVCAT_API_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    sentryEnv: process.env.EXPO_PUBLIC_SENTRY_ENV,
  },
};

export default config;
