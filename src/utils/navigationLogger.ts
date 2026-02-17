/**
 * Comprehensive logging utility for navigation, route rendering, and Mapbox operations
 * All logs are captured by appLogger and exported via Settings > Export Logs
 */

// Structured log categories
const LOG_PREFIX = {
  ROUTE_DETAIL: '[RouteDetail]',
  PRACTICE: '[Practice]',
  DIRECTIONS_API: '[Directions]',
  MAP_MATCHING: '[MapMatching]',
  NAVIGATION_SDK: '[NavSDK]',
  MAPBOX_NAV: '[MapboxNav]',
  GPS: '[GPS]',
  ROUTE_TRACKING: '[RouteTracking]',
  AUDIO: '[Audio]',
  API: '[API]',
  // Real-time navigation categories for debugging instruction/speech issues
  INSTRUCTION: '[Instruction]',
  SPEECH: '[Speech]',
  SDK_INSTRUCTION: '[SDK_Instruction]',
  SDK_NAVIGATION: '[SDK_Navigation]',
  SDK_COMPLETION: '[SDK_Completion]',
} as const;

type LogCategory = keyof typeof LOG_PREFIX;

// Enhanced console wrappers that add structure
export const logNav = {
  // Route Detail Screen
  routeDetailStart: (routeId: string, coordCount: number) => {
    console.log(`${LOG_PREFIX.ROUTE_DETAIL} Loading route ${routeId} with ${coordCount} waypoints`);
  },
  routeDetailDirectionsSuccess: (inputPoints: number, outputPoints: number) => {
    console.log(`${LOG_PREFIX.ROUTE_DETAIL} ✅ Directions API: ${inputPoints} waypoints → ${outputPoints} road points`);
  },
  routeDetailDirectionsFailed: (reason: string) => {
    console.error(`${LOG_PREFIX.ROUTE_DETAIL} ❌ Directions API failed: ${reason}`);
  },
  routeDetailFallback: () => {
    console.warn(`${LOG_PREFIX.ROUTE_DETAIL} ⚠️ Using raw coordinates (API failed)`);
  },

  // Practice Screen - Main Route
  practiceRouteStart: (coordCount: number) => {
    console.log(`${LOG_PREFIX.PRACTICE} Requesting main route with ${coordCount} waypoints`);
  },
  practiceRouteSuccess: (inputPoints: number, outputPoints: number) => {
    console.log(`${LOG_PREFIX.PRACTICE} ✅ Main route: ${inputPoints} waypoints → ${outputPoints} road points`);
  },
  practiceRouteFailed: (reason: string) => {
    console.error(`${LOG_PREFIX.PRACTICE} ❌ Main route failed: ${reason}`);
  },

  // Practice Screen - TO_START Guidance
  toStartRequest: (from: [number, number], to: [number, number]) => {
    console.log(`${LOG_PREFIX.PRACTICE} TO_START: Routing from [${from[0].toFixed(5)}, ${from[1].toFixed(5)}] to [${to[0].toFixed(5)}, ${to[1].toFixed(5)}]`);
  },
  toStartSuccess: (pointCount: number) => {
    console.log(`${LOG_PREFIX.PRACTICE} ✅ TO_START route: ${pointCount} road points`);
  },
  toStartFailed: (reason: string) => {
    console.error(`${LOG_PREFIX.PRACTICE} ❌ TO_START failed: ${reason}`);
  },

  // Directions API Detailed
  directionsRequest: (waypointCount: number, sampled: boolean, sampledCount?: number) => {
    if (sampled) {
      console.log(`${LOG_PREFIX.DIRECTIONS_API} 📤 Request: ${waypointCount} waypoints → sampled to ${sampledCount}`);
    } else {
      console.log(`${LOG_PREFIX.DIRECTIONS_API} 📤 Request: ${waypointCount} waypoints`);
    }
  },
  directionsCoords: (coordString: string) => {
    console.log(`${LOG_PREFIX.DIRECTIONS_API} Coordinates: ${coordString.substring(0, 150)}...`);
  },
  directionsResponse: (statusCode: number, responseCode?: string) => {
    if (statusCode === 200) {
      console.log(`${LOG_PREFIX.DIRECTIONS_API} 📥 Response: HTTP ${statusCode}, code: ${responseCode}`);
    } else {
      console.error(`${LOG_PREFIX.DIRECTIONS_API} 📥 Response: HTTP ${statusCode}, code: ${responseCode}`);
    }
  },
  directionsError: (error: any) => {
    console.error(`${LOG_PREFIX.DIRECTIONS_API} ❌ Error:`, error);
  },
  directionsResult: (routeCount: number, firstRoutePoints?: number) => {
    console.log(`${LOG_PREFIX.DIRECTIONS_API} Result: ${routeCount} routes, ${firstRoutePoints || 0} points in first route`);
  },

  // Map Matching (if used)
  mapMatchingRequest: (pointCount: number) => {
    console.log(`${LOG_PREFIX.MAP_MATCHING} 📤 Request: ${pointCount} GPS points`);
  },
  mapMatchingSuccess: (outputPoints: number) => {
    console.log(`${LOG_PREFIX.MAP_MATCHING} ✅ Matched to ${outputPoints} road points`);
  },
  mapMatchingFailed: (reason: string) => {
    console.error(`${LOG_PREFIX.MAP_MATCHING} ❌ Failed: ${reason}`);
  },

  // GPS / Location Updates
  gpsUpdate: (lat: number, lng: number, accuracy: number, speed: number | null) => {
    console.log(`${LOG_PREFIX.GPS} Position: [${lng.toFixed(6)}, ${lat.toFixed(6)}], accuracy: ${accuracy.toFixed(1)}m, speed: ${speed !== null ? (speed * 3.6).toFixed(1) : '--'} km/h`);
  },
  gpsPermissionDenied: () => {
    console.error(`${LOG_PREFIX.GPS} ❌ Location permission denied`);
  },
  gpsError: (error: any) => {
    console.error(`${LOG_PREFIX.GPS} ❌ Error:`, error);
  },

  // Navigation Phase
  navigationPhaseChange: (oldPhase: string, newPhase: string) => {
    console.log(`${LOG_PREFIX.PRACTICE} 🔄 Phase: ${oldPhase} → ${newPhase}`);
  },
  navigationStateChange: (oldState: string, newState: string) => {
    console.log(`${LOG_PREFIX.PRACTICE} 🔄 State: ${oldState} → ${newState}`);
  },

  // Route Tracking
  distanceToStart: (meters: number) => {
    console.log(`${LOG_PREFIX.ROUTE_TRACKING} Distance to start: ${meters.toFixed(1)}m`);
  },
  arrivedAtStart: () => {
    console.log(`${LOG_PREFIX.ROUTE_TRACKING} ✅ Arrived at start point`);
  },
  distanceOffRoute: (meters: number) => {
    console.warn(`${LOG_PREFIX.ROUTE_TRACKING} ⚠️ Off route: ${meters.toFixed(1)}m`);
  },
  progressUpdate: (completedPercent: number, remainingMeters: number) => {
    console.log(`${LOG_PREFIX.ROUTE_TRACKING} Progress: ${completedPercent.toFixed(1)}%, ${remainingMeters.toFixed(0)}m remaining`);
  },
  routeCompleted: (durationSeconds: number) => {
    console.log(`${LOG_PREFIX.ROUTE_TRACKING} ✅ Route completed in ${durationSeconds}s`);
  },

  // Turn-by-turn Instructions
  instructionSpoken: (instruction: string, distance: number) => {
    console.log(`${LOG_PREFIX.AUDIO} 🔊 "${instruction}" (in ${distance.toFixed(0)}m)`);
  },
  instructionUpdate: (instruction: string, distance: number) => {
    console.log(`${LOG_PREFIX.MAPBOX_NAV} Instruction: "${instruction}" in ${distance.toFixed(0)}m`);
  },

  // Navigation SDK Events
  navSdkEvent: (eventType: string, data?: any) => {
    console.log(`${LOG_PREFIX.NAVIGATION_SDK} Event: ${eventType}`, data || '');
  },
  navSdkError: (error: any) => {
    console.error(`${LOG_PREFIX.NAVIGATION_SDK} ❌ Error:`, error);
  },

  // API Calls
  apiRequest: (endpoint: string, method: string) => {
    console.log(`${LOG_PREFIX.API} ${method} ${endpoint}`);
  },
  apiSuccess: (endpoint: string, statusCode: number) => {
    console.log(`${LOG_PREFIX.API} ✅ ${endpoint}: ${statusCode}`);
  },
  apiError: (endpoint: string, statusCode: number, error: any) => {
    console.error(`${LOG_PREFIX.API} ❌ ${endpoint}: ${statusCode}`, error);
  },

  // General Errors
  error: (category: LogCategory, message: string, error?: any) => {
    console.error(`${LOG_PREFIX[category]} ❌ ${message}`, error || '');
  },
  warn: (category: LogCategory, message: string, data?: any) => {
    console.warn(`${LOG_PREFIX[category]} ⚠️ ${message}`, data || '');
  },
  info: (category: LogCategory, message: string, data?: any) => {
    console.log(`${LOG_PREFIX[category]} ${message}`, data || '');
  },
};

// Session metadata logging
export const logSessionStart = (routeId: string, routeName: string) => {
  console.log('═══════════════════════════════════════════════════');
  console.log(`🚗 NAVIGATION SESSION START`);
  console.log(`Route: ${routeName} (${routeId})`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════');
};

export const logSessionEnd = (routeId: string, completed: boolean, duration: number) => {
  console.log('═══════════════════════════════════════════════════');
  console.log(`🏁 NAVIGATION SESSION END`);
  console.log(`Route: ${routeId}`);
  console.log(`Status: ${completed ? '✅ COMPLETED' : '❌ CANCELLED'}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════');
};

// Device & Environment Info (call once at app start)
export const logDeviceInfo = (info: {
  platform: string;
  osVersion: string;
  appVersion: string;
  mapboxToken: boolean;
  hasNavSDK: boolean;
}) => {
  console.log('═══════════════════════════════════════════════════');
  console.log('📱 DEVICE & ENVIRONMENT INFO');
  console.log(`Platform: ${info.platform} ${info.osVersion}`);
  console.log(`App Version: ${info.appVersion}`);
  console.log(`Mapbox Token: ${info.mapboxToken ? '✅ Present' : '❌ Missing'}`);
  console.log(`Navigation SDK: ${info.hasNavSDK ? '✅ Available' : '❌ Not Available'}`);
  console.log('═══════════════════════════════════════════════════');
};
