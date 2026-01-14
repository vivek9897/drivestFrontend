# Drivest Mobile (RouteMaster Frontend)

Drivest is the RouteMaster mobile client for driving test route discovery, practice navigation, and study tools. It connects to the NestJS backend in `../backend` and ships as an Expo / React Native app.

## Product features
- Auth with email/password, guest mode, and device ID registration.
- Onboarding with consent capture (terms, age, analytics, notifications, location).
- Explore test centres with search and "near me" location lookup.
- Route details with Mapbox previews, access gating, and offline download.
- Practice navigation with Mapbox GL; native Mapbox Navigation SDK when available; JS fallback with map matching, localization, and voice prompts.
- Maneuver practice (parallel parking) with animated steps and audio guidance.
- Road sign study cards with category filters and optional hosted images.
- Cashback tracking workflow with GPX capture and submission.
- My Routes dashboard with downloaded and active-access filters.
- Settings for profile updates, subscriptions, push opt-in, legal docs, and diagnostics log export.
- Admin dashboard (role gated) for GPX route uploads and centre stats.

## Tech stack
- Expo SDK 54, React Native 0.81, TypeScript
- React Navigation (native stack + bottom tabs)
- React Query for API state
- React Hook Form + Zod for forms
- React Native Paper UI + Expo Vector Icons
- Mapbox GL (`@rnmapbox/maps`) and Mapbox APIs
- Expo Location, Notifications, Speech, SQLite, Secure Store, File System, Sharing
- RevenueCat purchases (`react-native-purchases` + UI)
- Sentry for crash/perf monitoring
- Jest + ts-jest for tests

## Architecture
- `frontend/src/navigation`: stack + tab navigation, onboarding gate
- `frontend/src/screens`: Explore, Practice, Road Signs, Cashback, Settings, Admin, Auth
- `frontend/src/lib`: Mapbox/Google routing, RevenueCat, Sentry, notifications, logging
- `frontend/src/db`: offline storage for routes, stats, and sessions
- `frontend/src/content`: legal docs, maneuvers, road sign data
- `frontend/src/components`: shared UI and map overlays

## Maps & navigation
- Mapbox GL renders maps in Explore and Practice flows.
- If the native Mapbox Navigation SDK view (`DrivestNavigationView`) is present, practice uses it for turn-by-turn UI.
- Fallback navigation builds a nav package via Mapbox Map Matching, localizes GPS to the route, and drives banner/voice prompts with a custom instruction engine.
- Map Matching results are cached in memory and AsyncStorage to reduce API calls.
- Reroute-to-start uses Google Directions when a key is configured.
- Car puck supports a 3D model (`frontend/assets/models/car.glb`) with a 2D icon fallback (`frontend/assets/icons/car.png`).

## Offline & storage
- Downloaded routes, route stats, and queued practice sessions live in SQLite (`routemaster.db`).
- Auth tokens, guest mode, and consent state use AsyncStorage.
- Device IDs are persisted via Secure Store on mobile and AsyncStorage on web.

## Observability & diagnostics
- Sentry initializes after login to capture crashes and performance.
- `initAppLogger()` captures console output to a local log file; logs can be exported or cleared from Settings.

## Environment variables
Copy `frontend/.env.example` to `.env` and update:
- `EXPO_PUBLIC_API_URL` - backend base URL.
- `EXPO_PUBLIC_MAPBOX_TOKEN` - Mapbox public token (maps + Directions/Matching).
- `EXPO_PUBLIC_MAPBOX_DOWNLOAD_TOKEN` - Mapbox secret token (offline downloads, if enabled).
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Directions API key for reroute-to-start.
- `EXPO_PUBLIC_REVCAT_API_KEY` - RevenueCat API key.
- `EXPO_PUBLIC_ROADSIGNS_BASE_URL` - base URL for road sign images (optional; otherwise placeholders).
- `EXPO_PUBLIC_SENTRY_DSN` - Sentry DSN.
- `EXPO_PUBLIC_SENTRY_ENV` - Sentry environment label.

## Setup
1. `cd frontend`
2. `npm install`
3. `cp .env.example .env` and set values.
4. `npm start`

### Native modules
Mapbox, RevenueCat, and the custom Mapbox Navigation SDK view require a dev client or EAS build; Expo Go runs with reduced functionality.

## Scripts
- `npm start` - Expo dev server
- `npm run ios` - iOS simulator / device
- `npm run android` - Android emulator / device
- `npm run web` - web preview
- `npm test` - Jest tests

## Permissions
- Foreground location for "near me", navigation, and cashback tracking.
- Notifications for learning reminders (opt-in).
