import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, StyleSheet, View, useColorScheme, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, IconButton } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RouteDto, apiRoutes } from '../../api';
import { getRouteCoords } from '../../utils';
import { spacing, colors } from '../../styles/theme';
import { upsertRouteStat } from '../../db';
import MapboxGL from '../../lib/mapbox';
import MapboxNavigationSdkView, { 
  isMapboxNavSdkReady,
  MapboxNavSdkEvent 
} from '../../components/MapboxNavigationSdkView';
import { calculateDistance } from '../../utils/mapbox';
import { getDirections, NavStep } from '../../lib/mapboxNavigation';
import { getDirectionsRoute } from '../../utils/mapboxMatching';
import { logNav, logSessionStart, logSessionEnd } from '../../utils/navigationLogger';
import { getCachedWaypoints } from '../../utils/waypointSampling';

type Props = NativeStackScreenProps<any>;
type NavigationState = 'PREVIEW' | 'NAVIGATING' | 'COMPLETED';
type NavigationPhase = 'TO_START' | 'ON_ROUTE';
type MapCoord = [number, number];
type LatLng = { latitude: number; longitude: number };

type NavInstruction = {
  text: string;
  secondary?: string;
  distanceM: number;
  maneuverType?: string;
  maneuverModifier?: string;
  roundaboutExit?: number;
};

type TransientNotice = {
  title: string;
  message: string;
  tone: 'success' | 'info';
};

type NativeUiStatus = {
  bannerVisible: boolean;
  bannerActuallyVisible: boolean;
  fallbackBannerVisible: boolean;
  bannerWidth: number;
  bannerHeight: number;
  bannerChildCount: number;
  tripVisible: boolean;
  tripActuallyVisible: boolean;
  tripWidth: number;
  tripHeight: number;
  maneuverCount: number;
  mode: string;
  lastUpdateMs: number;
};

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

const formatDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return '--';

  // Keep short maneuver distances readable in imperial units.
  if (meters < 0.1 * METERS_PER_MILE) {
    return `${Math.round(meters * FEET_PER_METER)}ft`;
  }

  const miles = meters / METERS_PER_MILE;
  if (miles < 10) return `${miles.toFixed(1)}mi`;
  return `${Math.round(miles)}mi`;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}min`;
};

const buildManeuverInstruction = (
  maneuverType?: string,
  maneuverModifier?: string,
  roundaboutExit?: number,
): string | null => {
  if (typeof roundaboutExit === 'number') return `Take exit ${roundaboutExit} at roundabout`;
  if (maneuverType === 'turn' && maneuverModifier) return `Turn ${maneuverModifier}`;
  if (maneuverType === 'depart') return 'Depart';
  if (maneuverType === 'arrive') return 'Arrive at destination';
  if (maneuverType === 'merge') return 'Merge';
  if (maneuverType) return maneuverType.replace(/_/g, ' ');
  return null;
};

const toStartArrivalText = 'You have arrived at your starting point. You are starting the test route practice now.';

const formatOrdinal = (n?: number): string => {
  if (!n || n <= 0) return '';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const buildRoundaboutExitText = (exit?: number): string | undefined => {
  if (!exit || exit <= 0) return undefined;
  return `Take the ${formatOrdinal(exit)} exit`;
};

const mapLaneDirectionToken = (token: string): string => {
  const normalized = token.toLowerCase();
  if (normalized.includes('slight left')) return '↖';
  if (normalized.includes('slight right')) return '↗';
  if (normalized.includes('sharp left')) return '⬅';
  if (normalized.includes('sharp right')) return '➡';
  if (normalized.includes('left')) return '←';
  if (normalized.includes('right')) return '→';
  if (normalized.includes('straight')) return '↑';
  if (normalized.includes('uturn')) return '↩';
  return token;
};

const buildLaneGuidanceFromStep = (step: NavStep): string | undefined => {
  const banners = step.bannerInstructions || (step.banner ? [step.banner] : []);
  for (const banner of banners) {
    const laneComponents = (banner?.primary?.components || []).filter(
      (component) => component.type === 'lane'
    );
    if (!laneComponents.length) continue;

    const lanes = laneComponents.map((lane) => {
      const directionToken =
        lane.active_direction || lane.directions?.[0] || '';
      const symbol = mapLaneDirectionToken(directionToken);
      return lane.active ? `[${symbol}]` : symbol;
    });

    const laneText = lanes.filter(Boolean).join(' ');
    if (laneText) return `Use lane${lanes.length > 1 ? 's' : ''}: ${laneText}`;
  }
  return undefined;
};

const combineInstructionSecondary = (
  baseSecondary?: string,
  roundaboutText?: string,
  laneText?: string
): string | undefined => {
  const parts = [baseSecondary, roundaboutText, laneText]
    .map((part) => (part || '').trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  return Array.from(new Set(parts)).join(' • ');
};

/**
 * Strip SSML tags from text (e.g., from voice announcements)
 * Removes all XML-style tags and normalizes whitespace
 */
const stripSsml = (text: string): string => {
  // Remove all XML tags like <...>
  let stripped = text.replace(/<[^>]*>/g, '');
  // Replace multiple spaces with single space
  stripped = stripped.replace(/\s+/g, ' ');
  // Trim leading/trailing whitespace
  return stripped.trim();
};

const normalizeInstructionText = (value?: string): string =>
  (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const isDestinationArrivalInstruction = (
  instruction?: string,
  maneuverType?: string
): boolean => {
  if (maneuverType === 'arrive') return true;
  const normalized = normalizeInstructionText(instruction);
  return (
    normalized.includes('destination') ||
    normalized.includes('arrive') ||
    normalized.includes('arrived')
  );
};

const getCameraCenterAhead = (
  lng: number,
  lat: number,
  headingDeg: number,
  distanceMeters = 40
): [number, number] => {
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = (distanceMeters / 111111) * Math.cos(rad);
  const dLng =
    (distanceMeters / (111111 * Math.cos((lat * Math.PI) / 180))) *
    Math.sin(rad);

  return [lng + dLng, lat + dLat];
};

const normalizeHeading = (heading: number): number => ((heading % 360) + 360) % 360;

const shortestHeadingDelta = (fromDeg: number, toDeg: number): number => {
  const from = normalizeHeading(fromDeg);
  const to = normalizeHeading(toDeg);
  return ((to - from + 540) % 360) - 180;
};

const computeRemainingDistance = (
  coords: MapCoord[],
  fromIndex: number
): number => {
  let distance = 0;
  for (let i = fromIndex; i < coords.length - 1; i++) {
    distance += calculateDistance(
      coords[i][0], coords[i][1],
      coords[i + 1][0], coords[i + 1][1]
    ) * 1000;
  }
  return distance;
};

const MAX_FALLBACK_ON_ROUTE_WAYPOINTS = 12;

const buildOnRouteFallbackWaypoints = (
  coords: MapCoord[],
  currentIndex: number
): LatLng[] => {
  if (coords.length < 4) return [];

  const startIndex = Math.max(0, Math.min(coords.length - 2, currentIndex + 1));
  const endIndex = coords.length - 1;
  const availablePoints = endIndex - startIndex - 1;
  if (availablePoints <= 0) return [];

  const waypointCount = Math.min(MAX_FALLBACK_ON_ROUTE_WAYPOINTS, availablePoints);
  const step = Math.max(1, Math.floor((endIndex - startIndex) / (waypointCount + 1)));
  const waypoints: LatLng[] = [];

  for (let i = startIndex + step; i < endIndex && waypoints.length < waypointCount; i += step) {
    waypoints.push({ latitude: coords[i][1], longitude: coords[i][0] });
  }

  return waypoints;
};

const buildFallbackStepSignature = (steps: NavStep[]): string =>
  steps
    .map((step) => {
      const lat = step.location?.latitude?.toFixed(5) ?? 'na';
      const lng = step.location?.longitude?.toFixed(5) ?? 'na';
      return `${step.maneuverType || 'none'}:${lat}:${lng}:${step.instruction || ''}`;
    })
    .join('|');

const PROGRESS_BACKTRACK_POINTS = 10;
const PROGRESS_LOOKAHEAD_POINTS = 150;
const ROUTE_POINT_PROXIMITY_M = 20;
const MAX_PROXIMITY_SKIP_POINTS = 5;
const MAX_SEQUENTIAL_ADVANCE_PER_UPDATE = 150;
const CAMERA_AHEAD_DISTANCE_M = 65;
const VISUAL_ROUTE_SNAP_THRESHOLD_M = 35;
const HEADING_UPDATE_MIN_SPEED_MPS = 1.2;
const CAMERA_ROTATE_MIN_SPEED_MPS = 1.2;
const CAMERA_HEADING_DEADBAND_DEG = 3;
const CAMERA_HEADING_STEP_LIMIT_DEG = 14;
const FALLBACK_SPEECH_REPEAT_COOLDOWN_MS = 18000;

const findClosestRouteIndexInWindow = (
  coords: MapCoord[],
  userCoord: MapCoord,
  anchorIndex: number
): { closestIndex: number; minDistanceM: number } => {
  const startIndex = Math.max(0, anchorIndex - PROGRESS_BACKTRACK_POINTS);
  const endIndex = Math.min(coords.length - 1, anchorIndex + PROGRESS_LOOKAHEAD_POINTS);
  let closestIndex = anchorIndex;
  let minDistanceM = Infinity;

  for (let i = startIndex; i <= endIndex; i++) {
    const distM =
      calculateDistance(
        userCoord[0],
        userCoord[1],
        coords[i][0],
        coords[i][1]
      ) * 1000;

    if (distM < minDistanceM) {
      minDistanceM = distM;
      closestIndex = i;
    }
  }

  return { closestIndex, minDistanceM };
};

const getRouteBearingAtIndex = (coords: MapCoord[], index: number): number | null => {
  if (coords.length < 2) return null;
  const prevIndex = Math.max(0, index - 1);
  const nextIndex = Math.min(coords.length - 1, index + 1);
  const prev = coords[prevIndex];
  const next = coords[nextIndex];
  if (!prev || !next) return null;
  const dLng = next[0] - prev[0];
  const dLat = next[1] - prev[1];
  if (dLng === 0 && dLat === 0) return null;
  return normalizeHeading((Math.atan2(dLng, dLat) * 180) / Math.PI);
};

const getVisualRouteSnap = (
  coords: MapCoord[],
  userCoord: MapCoord,
  anchorIndex: number
): { snapped: boolean; coord: MapCoord; index: number; minDistanceM: number; routeBearing: number | null } => {
  const { closestIndex, minDistanceM } = findClosestRouteIndexInWindow(coords, userCoord, anchorIndex);
  const routeBearing = getRouteBearingAtIndex(coords, closestIndex);
  if (minDistanceM <= VISUAL_ROUTE_SNAP_THRESHOLD_M) {
    return {
      snapped: true,
      coord: coords[closestIndex],
      index: closestIndex,
      minDistanceM,
      routeBearing,
    };
  }
  return {
    snapped: false,
    coord: userCoord,
    index: closestIndex,
    minDistanceM,
    routeBearing,
  };
};

const advanceProgressIndexSequentially = (
  coords: MapCoord[],
  userCoord: MapCoord,
  currentIndex: number
): number => {
  let nextIndex = currentIndex;
  let advancedCount = 0;
  let distanceToCurrentPointM =
    calculateDistance(
      userCoord[0],
      userCoord[1],
      coords[nextIndex][0],
      coords[nextIndex][1]
    ) * 1000;

  while (nextIndex < coords.length - 1 && advancedCount < MAX_SEQUENTIAL_ADVANCE_PER_UPDATE) {
    const nextCoord = coords[nextIndex + 1];
    const distanceToNextPointM =
      calculateDistance(
        userCoord[0],
        userCoord[1],
        nextCoord[0],
        nextCoord[1]
      ) * 1000;

    const isNearNextPoint = distanceToNextPointM <= ROUTE_POINT_PROXIMITY_M;
    // Only move forward if user is getting closer to the next sequential point.
    // This prevents jumping through overlapping loop segments.
    const isAdvancingForward = distanceToNextPointM <= distanceToCurrentPointM;

    if (!isNearNextPoint || !isAdvancingForward) {
      // Tolerate missing a single sampled coordinate:
      // if a nearby forward point (within a short window) is inside the same 20m proximity,
      // advance to that point so one missed coordinate doesn't block completion.
      let skippedForward = false;
      const skipToIndex = Math.min(coords.length - 1, nextIndex + MAX_PROXIMITY_SKIP_POINTS);
      for (let i = nextIndex + 2; i <= skipToIndex; i++) {
        const candidateDistanceM =
          calculateDistance(
            userCoord[0],
            userCoord[1],
            coords[i][0],
            coords[i][1]
          ) * 1000;

        if (candidateDistanceM <= ROUTE_POINT_PROXIMITY_M) {
          advancedCount += i - nextIndex;
          nextIndex = i;
          distanceToCurrentPointM = candidateDistanceM;
          skippedForward = true;
          break;
        }
      }

      if (skippedForward) {
        continue;
      }
      break;
    }

    nextIndex += 1;
    advancedCount += 1;
    distanceToCurrentPointM = distanceToNextPointM;
  }

  return nextIndex;
};

const TO_START_ARRIVAL_THRESHOLD_M = 18;
const TO_START_SDK_REMAINING_THRESHOLD_M = 25;
const TO_START_GPS_HARD_ARRIVAL_THRESHOLD_M = 10;
const TO_START_ARRIVAL_HOLD_MS = 1500;
const OFF_ROUTE_THRESHOLD_M = 80; // Strict 80m off-route threshold
const LOOP_ENDPOINT_THRESHOLD_M = 25;
const COMPLETION_TAIL_POINTS = 5;
const SDK_COMPLETION_DISTANCE_THRESHOLD_M = 20;
const SDK_COMPLETION_FRACTION_THRESHOLD = 0.995;
const SDK_ONLY_NAVIGATION_MODE = true;
const MAX_SDK_WAYPOINTS = 23;
const NATIVE_UI_FRESHNESS_MS = 15000;
const INITIAL_NATIVE_UI_STATUS: NativeUiStatus = {
  bannerVisible: false,
  bannerActuallyVisible: false,
  fallbackBannerVisible: false,
  bannerWidth: 0,
  bannerHeight: 0,
  bannerChildCount: 0,
  tripVisible: false,
  tripActuallyVisible: false,
  tripWidth: 0,
  tripHeight: 0,
  maneuverCount: 0,
  mode: 'UNKNOWN',
  lastUpdateMs: 0,
};

const PracticeScreen: React.FC<Props> = ({ route: routeNav, navigation }) => {
  const colorScheme = useColorScheme();
  const initialRoute = routeNav?.params?.route as RouteDto | undefined;
  const mapboxNavSdkAvailable = isMapboxNavSdkReady();

  const [routeDto, setRouteDto] = useState<RouteDto | undefined>(initialRoute);
  const [navState, setNavState] = useState<NavigationState>('PREVIEW');
  const [navPhase, setNavPhase] = useState<NavigationPhase | null>(null);
  const [userLocation, setUserLocation] = useState<MapCoord | null>(null);
  const [userHeading, setUserHeading] = useState<number>(0);
  const smoothHeadingRef = useRef<number>(0);  // Smoothed heading to reduce jitter
  const [userSpeedMps, setUserSpeedMps] = useState<number | null>(null);
  const [cameraMode, setCameraMode] = useState<'FOLLOW' | 'OVERVIEW'>('OVERVIEW');
  const [elapsed, setElapsed] = useState(0);
  const [fallbackSteps, setFallbackSteps] = useState<NavStep[]>([]);
  const [currentInstruction, setCurrentInstruction] = useState<NavInstruction | null>(null);
  const [, setCompletedCoords] = useState<MapCoord[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [distanceRemaining, setDistanceRemaining] = useState<number | null>(null);
  const [mapboxRouteMetrics, setMapboxRouteMetrics] = useState<{ distanceM: number; durationS: number } | null>(null);
  const [sdkDurationRemaining, setSdkDurationRemaining] = useState<number | null>(null);
  const [sdkFractionTraveled, setSdkFractionTraveled] = useState<number>(0);
  const [onRouteOrigin, setOnRouteOrigin] = useState<MapCoord | null>(null);
  const [visualProgressIndex, setVisualProgressIndex] = useState<number>(0);
  const [transientNotice, setTransientNotice] = useState<TransientNotice | null>(null);
  const [distanceOffRoute, setDistanceOffRoute] = useState<number>(0);
  const [matchedToStartRoute, setMatchedToStartRoute] = useState<any>(null);
  const [isNorthLocked, setIsNorthLocked] = useState<boolean>(false);
  const [nativeUiStatus, setNativeUiStatus] = useState<NativeUiStatus>(INITIAL_NATIVE_UI_STATUS);
  const cameraRef = useRef<any>(null);

  // Strict progress tracking - monotonic maxIndexReached (only increases)
  const maxIndexReachedRef = useRef<number>(0);
  const visualProgressIndexRef = useRef<number>(0);
  const lastAtEndTimeRef = useRef<number | null>(null); // Timestamp when user reached 30m of end

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const offRouteAlertRef = useRef<boolean>(false);
  const lastSpokenStepRef = useRef<number | null>(null);
  const spokenInstructionsRef = useRef<Set<string>>(new Set());
  const recentSpeechByTextRef = useRef<Record<string, number>>({});
  const lastSpeechTimeRef = useRef<number>(0);
  const lastGpsLogTime = useRef<number>(0);
  const lastDistLogRef = useRef<number>(0);
  const toStartArrivalCandidateAtRef = useRef<number | null>(null);
  const hasStartedMovingRef = useRef(false);
  const lastCameraUpdateRef = useRef<number>(0);
  const cameraHeadingRef = useRef<number>(0);
  const transientNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackBuildInFlightRef = useRef<boolean>(false);
  const fallbackBuildRequestSeqRef = useRef<number>(0);
  const fallbackStepSignatureRef = useRef<string>('');
  
  // Fallback navigation step tracking
  const currentStepIndexRef = useRef<number>(0);
  const spokenDistancesRef = useRef<{ [key: string]: boolean }>({});
  const sdkLogStateRef = useRef<{
    lastInstructionKey: string;
    lastInstructionAt: number;
    lastProgressDistance: number | null;
    lastProgressFraction: number | null;
    lastProgressAt: number;
    lastNativeLayoutKey: string;
    lastNativeLayoutAt: number;
  }>({
    lastInstructionKey: '',
    lastInstructionAt: 0,
    lastProgressDistance: null,
    lastProgressFraction: null,
    lastProgressAt: 0,
    lastNativeLayoutKey: '',
    lastNativeLayoutAt: 0,
  });

  useEffect(() => {
    if (routeDto && !routeDto.coordinates && routeDto.id) {
      apiRoutes
        .detail(routeDto.id)
        .then((res) => {
          const data = res.data.data || res.data;
          setRouteDto({ ...routeDto, ...data });
        })
        .catch((err: unknown) => {
          console.warn('Failed to fetch route details:', err);
        });
    }
  }, [routeDto?.id, routeDto?.coordinates]);

  useEffect(() => {
    if (navState === 'NAVIGATING') {
      activateKeepAwake('navigation');
    } else {
      deactivateKeepAwake('navigation');
    }

    return () => {
      deactivateKeepAwake('navigation');
    };
  }, [navState]);

  // Cleanup on component unmount - stop everything
  useEffect(() => {
    return () => {
      // Stop any ongoing speech
      Speech.stop();
      logNav.info('PRACTICE', 'Component unmounting - stopping all navigation');
      
      // Clear timers
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Remove location watch
      locationWatchRef.current?.remove();
      
      // Deactivate keep awake
      deactivateKeepAwake('navigation');

      if (transientNoticeTimerRef.current) {
        clearTimeout(transientNoticeTimerRef.current);
      }
      if (completionExitTimerRef.current) {
        clearTimeout(completionExitTimerRef.current);
      }
    };
  }, []);

  const showTransientNotice = (
    title: string,
    message: string,
    tone: 'success' | 'info' = 'info',
    durationMs = 2600
  ) => {
    setTransientNotice({ title, message, tone });
    if (transientNoticeTimerRef.current) {
      clearTimeout(transientNoticeTimerRef.current);
    }
    transientNoticeTimerRef.current = setTimeout(() => {
      setTransientNotice(null);
      transientNoticeTimerRef.current = null;
    }, durationMs);
  };

  // Log session end separately when navigation completes or exits
  const logNavigationExit = (reason: 'completed' | 'cancelled') => {
    if (navState === 'NAVIGATING' && navPhase === 'ON_ROUTE') {
      logSessionEnd(routeDto?.id || 'unknown', reason === 'completed', elapsed);
    }
  };

  // Location tracking - Use High accuracy for fast GPS lock
  // BestForNavigation was too slow (10+ seconds), High gives ~2-3 second lock with good accuracy
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        logNav.gpsPermissionDenied();
        Alert.alert('Permission Denied', 'Location permission is required for navigation');
        return;
      }

      // Use High accuracy for balance of speed and precision
      // High: ~2-3s lock, ±5-10m accuracy (vs BestForNavigation: ~10-15s lock, ±1-2m)
      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 3,  // Update every 3 meters
          timeInterval: 1000,   // Update every 1 second
        },
        (loc: Location.LocationObject) => {
          // Log GPS updates every 10 seconds to avoid log spam
          const now = Date.now();
          if (!lastGpsLogTime.current || now - lastGpsLogTime.current > 10000) {
            logNav.gpsUpdate(
              loc.coords.latitude,
              loc.coords.longitude,
              loc.coords.accuracy || 0,
              loc.coords.speed
            );
            lastGpsLogTime.current = now;
          }
          
          // Batch location updates to prevent race conditions with fast GPS lock
          setUserLocation([loc.coords.longitude, loc.coords.latitude]);
          
          const speed = loc.coords.speed ?? null;
          if (!hasStartedMovingRef.current && typeof speed === 'number' && speed > 1.5) {
            hasStartedMovingRef.current = true;
          }

          // Smooth heading only when the device is actually moving.
          // This avoids low-speed sensor jitter rotating the camera at junctions.
          if (
            loc.coords.heading !== null &&
            loc.coords.heading !== undefined &&
            loc.coords.heading >= 0
          ) {
            const rawHeading = normalizeHeading(loc.coords.heading);
            const speedForHeading = typeof speed === 'number' ? speed : 0;
            if (speedForHeading > HEADING_UPDATE_MIN_SPEED_MPS) {
              const current = smoothHeadingRef.current;
              const delta = shortestHeadingDelta(current, rawHeading);
              const smoothed = normalizeHeading(current + delta * 0.22);
              smoothHeadingRef.current = smoothed;
              setUserHeading(Math.round(smoothed));
            }
          }

          setUserSpeedMps(speed);
        },
      );
    })().catch(e => logNav.gpsError(e));

    return () => {
      locationWatchRef.current?.remove();
    };
  }, []);

  // Reset speech state when phase changes
  useEffect(() => {
    spokenInstructionsRef.current.clear();
    recentSpeechByTextRef.current = {};
    lastSpeechTimeRef.current = 0;
    lastSpokenStepRef.current = null;
  }, [navPhase]);

  useEffect(() => {
    if (navState === 'NAVIGATING' && navPhase === 'ON_ROUTE') {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [navState, navPhase]);

  const routeCoords = useMemo(() => {
    const coords = routeDto ? getRouteCoords(routeDto) : [];
    return coords.map((c: LatLng): MapCoord => [c.longitude, c.latitude]);
  }, [routeDto]);

  /**
   * CACHED SAMPLED WAYPOINTS - Computed ONCE per route
   * 
   * Uses Douglas-Peucker + heading change detection to intelligently sample
   * waypoints that preserve the exact test route shape.
   * 
   * This ensures Mapbox Directions API follows the STORED route, not an optimized path.
   * Addresses the critical issue: "Mapbox calculates ITS optimal route, not YOUR stored route"
   * 
   * Cached to avoid recomputation on every GPS update.
   */
  const sampledRouteWaypoints = useMemo<MapCoord[]>(() => {
    if (!routeDto?.id || routeCoords.length < 3) return routeCoords;
    
    const sampled = getCachedWaypoints(routeDto.id, routeCoords, {
      maxWaypoints: 23, // Mapbox limit: 25 total (origin + 23 + destination)
      dpTolerance: 8,   // 8m Douglas-Peucker tolerance
      minHeadingChange: 30, // 30° turn detection
      minSpacing: 50,   // 50m minimum between waypoints
    });
    
    logNav.info('ROUTE_TRACKING', `Sampled ${sampled.length} waypoints from ${routeCoords.length} coords (route: ${routeDto.name})`);
    return sampled;
  }, [routeDto?.id, routeCoords]);

  useEffect(() => {
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token || routeCoords.length < 2) {
      setMapboxRouteMetrics(null);
      return;
    }

    let cancelled = false;
    const coordsForMetrics =
      sampledRouteWaypoints.length >= 2 ? sampledRouteWaypoints : routeCoords;

    const fetchMapboxMetrics = async () => {
      const routed = await getDirectionsRoute(coordsForMetrics, token);
      if (cancelled) return;
      if (routed?.distanceM && routed?.durationS) {
        setMapboxRouteMetrics({
          distanceM: routed.distanceM,
          durationS: routed.durationS,
        });
      } else {
        setMapboxRouteMetrics(null);
      }
    };

    fetchMapboxMetrics();
    return () => {
      cancelled = true;
    };
  }, [routeCoords, sampledRouteWaypoints]);

  // Fit camera to route bounds in OVERVIEW mode
  useEffect(() => {
    if (cameraMode === 'OVERVIEW' && routeCoords.length > 0 && cameraRef.current) {
      // Calculate bounds from route coordinates
      let minLng = routeCoords[0][0];
      let maxLng = routeCoords[0][0];
      let minLat = routeCoords[0][1];
      let maxLat = routeCoords[0][1];

      for (const [lng, lat] of routeCoords) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }

      // Fit camera to bounds with padding
      const bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ] as [[number, number], [number, number]];

      try {
        cameraRef.current?.fitBounds(bounds, [100, 100, 100, 100], 500);
        logNav.info('PRACTICE', `OVERVIEW: fitting ${routeCoords.length} coords to bounds`);
      } catch (e) {
        logNav.warn('PRACTICE', 'fitBounds failed', e);
      }
    }
  }, [cameraMode, routeCoords.length]);

  // Get proper driving route to start using Directions API
  useEffect(() => {
    if (
      !userLocation ||
      navPhase !== 'TO_START' ||
      !routeDto ||
      (mapboxNavSdkAvailable && navState === 'NAVIGATING')
    ) {
      return;
    }

    const getToStartRoute = async () => {
      try {
        const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
          logNav.error('PRACTICE', 'No Mapbox token for TO_START route');
          return;
        }
        
        // Get the first coordinate from the route
        const routeCoordinates = routeDto.coordinates || [];
        if (routeCoordinates.length === 0) return;
        
        // Handle both coordinate formats: {lat, lon} or [lng, lat]
        const firstCoord = routeCoordinates[0];
        let firstMapCoord: [number, number];
        if (Array.isArray(firstCoord)) {
          firstMapCoord = firstCoord as [number, number];
        } else {
          firstMapCoord = [firstCoord.lon, firstCoord.lat];
        }
        
        const toStartCoords: Array<[number, number]> = [
          [userLocation[0], userLocation[1]],
          firstMapCoord,
        ];
        
        logNav.toStartRequest(toStartCoords[0], toStartCoords[1]);
        const routed = await getDirectionsRoute(toStartCoords, token);
        if (routed) {
          logNav.toStartSuccess(routed.geometry.coordinates.length);
          setMatchedToStartRoute(routed);
        } else {
          logNav.toStartFailed('API returned null');
        }
      } catch (e) {
        logNav.toStartFailed(String(e));
      }
    };
    
    getToStartRoute();
  }, [userLocation, navPhase, routeDto, mapboxNavSdkAvailable, navState]);

  // NOTE: Removed getMainRoute() that sent thousands of points to getDirectionsRoute.
  // The stored routeCoords are rendered directly as the route line.
  // No need to call Mapbox Map Matching API with the full route - it would fail/degrade with thousands of points.

  const navDestination = useMemo<MapCoord | null>(() => {
    if (!routeCoords.length) return null;
    if (navPhase === 'ON_ROUTE') return routeCoords[routeCoords.length - 1];
    if (navPhase === 'TO_START') return routeCoords[0];
    return null;
  }, [navPhase, routeCoords]);

  const mapStyleUrl = useMemo(
    () => (colorScheme === 'dark' ? 'mapbox://styles/mapbox/navigation-night-v1' : 'mapbox://styles/mapbox/navigation-day-v1'),
    [colorScheme],
  );

  const loopSafeDestinationIndex = useMemo(() => {
    if (navPhase !== 'ON_ROUTE' || sampledRouteWaypoints.length < 2) {
      return sampledRouteWaypoints.length - 1;
    }

    const start = sampledRouteWaypoints[0];
    const end = sampledRouteWaypoints[sampledRouteWaypoints.length - 1];
    const endpointsDistanceM =
      calculateDistance(start[0], start[1], end[0], end[1]) * 1000;
    const isLoopRoute = endpointsDistanceM <= LOOP_ENDPOINT_THRESHOLD_M;

    if (!isLoopRoute) {
      return sampledRouteWaypoints.length - 1;
    }

    // Prevent immediate SDK arrival on closed loops (start ≈ end):
    // choose the last waypoint that is still outside the loop-end threshold.
    for (let i = sampledRouteWaypoints.length - 1; i > 0; i--) {
      const distFromStartM =
        calculateDistance(
          start[0],
          start[1],
          sampledRouteWaypoints[i][0],
          sampledRouteWaypoints[i][1]
        ) * 1000;
      if (distFromStartM > LOOP_ENDPOINT_THRESHOLD_M) {
        return i;
      }
    }

    return sampledRouteWaypoints.length - 1;
  }, [navPhase, sampledRouteWaypoints]);

  /**
   * SDK WAYPOINTS - Intermediate points only (no origin/destination)
   */
  const sdkWaypoints = useMemo<MapCoord[]>(() => {
    if (navState !== 'NAVIGATING' || !navPhase) {
      return [];
    }

    if (sampledRouteWaypoints.length <= 2) {
      return []; // Only start and end, no intermediates
    }

    if (navPhase === 'TO_START') {
      // TO_START must remain direct to the stored start point.
      return [];
    }

    // ON_ROUTE phase: Use intermediate waypoints only (exclude first and loop-safe destination)
    if (navPhase !== 'ON_ROUTE') return [];

    const intermediates = sampledRouteWaypoints.slice(1, Math.max(1, loopSafeDestinationIndex));
    logNav.info('ROUTE_TRACKING', `SDK waypoints: ${intermediates.length} intermediates (total sampled: ${sampledRouteWaypoints.length})`);
    
    return intermediates;
  }, [loopSafeDestinationIndex, navPhase, navState, sampledRouteWaypoints]);

  /**
   * SDK ORIGIN
   * TO_START: live user location
   * ON_ROUTE: route start, so Mapbox route sequencing always begins from stored start coordinate.
   */
  const sdkOrigin = useMemo<MapCoord | null>(() => {
    if (navPhase === 'ON_ROUTE') {
      if (onRouteOrigin) return onRouteOrigin;
      if (sampledRouteWaypoints.length > 0) return sampledRouteWaypoints[0];
    }
    return userLocation || null;
  }, [navPhase, onRouteOrigin, sampledRouteWaypoints, userLocation]);

  /**
   * SDK DESTINATION
   * Always use the correct end point based on phase
   */
  const sdkDestination = useMemo<MapCoord | null>(() => {
    if (navPhase === 'TO_START') {
      return routeCoords[0]; // Navigate to route start
    }
    if (navPhase === 'ON_ROUTE' && sampledRouteWaypoints.length > 0) {
      return sampledRouteWaypoints[Math.max(0, loopSafeDestinationIndex)];
    }
    return navDestination;
  }, [loopSafeDestinationIndex, navDestination, navPhase, routeCoords, sampledRouteWaypoints]);

  const onRouteSdkCoordinates = useMemo<MapCoord[]>(() => {
    if (navPhase !== 'ON_ROUTE' || routeCoords.length < 2) {
      return routeCoords;
    }

    const loopSafeDestination = sampledRouteWaypoints[Math.max(0, loopSafeDestinationIndex)];
    if (!loopSafeDestination) {
      return routeCoords;
    }

    let closestRouteIndex = routeCoords.length - 1;
    let minDistanceM = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const distM =
        calculateDistance(
          routeCoords[i][0],
          routeCoords[i][1],
          loopSafeDestination[0],
          loopSafeDestination[1]
        ) * 1000;

      if (distM < minDistanceM) {
        minDistanceM = distM;
        closestRouteIndex = i;
      }
    }

    const endIndex = Math.max(1, closestRouteIndex);
    return routeCoords.slice(0, endIndex + 1);
  }, [loopSafeDestinationIndex, navPhase, routeCoords, sampledRouteWaypoints]);

  const sdkDestinationName = useMemo(() => {
    if (navPhase === 'TO_START') return 'starting point';
    return undefined;
  }, [navPhase]);

  const previewSdkOrigin = useMemo<MapCoord | null>(() => {
    if (routeCoords.length < 2) return null;
    return routeCoords[0];
  }, [routeCoords]);

  const previewSdkDestination = useMemo<MapCoord | null>(() => {
    if (routeCoords.length < 2) return null;
    return routeCoords[routeCoords.length - 1];
  }, [routeCoords]);

  const etaSeconds = useMemo<number | null>(() => {
    if (
      navState === 'NAVIGATING' &&
      navPhase === 'ON_ROUTE' &&
      mapboxNavSdkAvailable &&
      sdkDurationRemaining !== null &&
      sdkDurationRemaining >= 0
    ) {
      return Math.round(sdkDurationRemaining);
    }

    if (distanceRemaining === null || distanceRemaining <= 0) {
      return null;
    }

    // Use live speed when moving; otherwise fallback to route average speed for stable ETA.
    const routeAvgSpeedMps =
      mapboxRouteMetrics?.durationS && mapboxRouteMetrics.durationS > 0
        ? mapboxRouteMetrics.distanceM / mapboxRouteMetrics.durationS
        : 6.7;
    const liveSpeedMps = userSpeedMps !== null && userSpeedMps > 1.5 ? userSpeedMps : routeAvgSpeedMps;
    const effectiveSpeedMps = Math.max(liveSpeedMps, 1.5);

    return Math.round(distanceRemaining / effectiveSpeedMps);
  }, [
    distanceRemaining,
    mapboxNavSdkAvailable,
    navPhase,
    navState,
    mapboxRouteMetrics?.distanceM,
    mapboxRouteMetrics?.durationS,
    sdkDurationRemaining,
    userSpeedMps,
  ]);

  // Route progress display:
  // - SDK ON_ROUTE: Mapbox fractionTraveled
  // - Non-SDK / fallback: app monotonic index
  const routeProgress = useMemo(() => {
    if (routeCoords.length === 0) {
      return { percent: 0, completed: 0, total: 0 };
    }

    const sdkControlsOnRoute = navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && mapboxNavSdkAvailable;
    if (sdkControlsOnRoute) {
      const clampedFraction = Math.max(0, Math.min(1, sdkFractionTraveled));
      const completed = Math.min(routeCoords.length, Math.round(clampedFraction * routeCoords.length));
      return {
        percent: Math.round(clampedFraction * 100),
        completed,
        total: routeCoords.length,
      };
    }

    const progressIndex = Math.max(0, Math.min(visualProgressIndex, routeCoords.length - 1));
    const percent = Math.round((progressIndex / routeCoords.length) * 100);
    return { percent, completed: progressIndex, total: routeCoords.length };
  }, [mapboxNavSdkAvailable, navPhase, navState, routeCoords, sdkFractionTraveled, visualProgressIndex]);

  const getVisualUserLocation = useCallback(
    (coord: MapCoord | null): MapCoord | null => {
      if (!coord) return null;
      if (
        navState === 'NAVIGATING' &&
        navPhase === 'ON_ROUTE' &&
        !mapboxNavSdkAvailable &&
        routeCoords.length > 0
      ) {
        const snapped = getVisualRouteSnap(routeCoords, coord, maxIndexReachedRef.current);
        return snapped.coord;
      }
      return coord;
    },
    [mapboxNavSdkAvailable, navPhase, navState, routeCoords]
  );

  const visualUserLocation = useMemo(
    () => getVisualUserLocation(userLocation),
    [getVisualUserLocation, userLocation]
  );

  const remainingRouteCoords = useMemo<MapCoord[]>(() => {
    if (routeCoords.length === 0) return [];
    const sdkControlsOnRoute = navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && mapboxNavSdkAvailable;

    // In preview / non-ON_ROUTE states, show full route as remaining.
    if (navState !== 'NAVIGATING' || navPhase !== 'ON_ROUTE' || sdkControlsOnRoute) {
      return routeCoords;
    }

    const clampedProgressIndex = Math.max(0, Math.min(routeProgress.completed, routeCoords.length - 1));
    const remainingStartIndex = Math.min(routeCoords.length - 1, clampedProgressIndex + 1);
    const remainingTail = routeCoords.slice(remainingStartIndex);

    if (!remainingTail.length) return visualUserLocation ? [visualUserLocation] : [];

    // Keep split anchored at live puck for precise visual transition.
    return visualUserLocation
      ? [visualUserLocation, ...remainingTail]
      : [routeCoords[clampedProgressIndex], ...remainingTail];
  }, [routeCoords, navState, navPhase, routeProgress.completed, visualUserLocation]);

  const remainingRouteColor = useMemo(() => {
    if (navPhase === 'ON_ROUTE' && distanceOffRoute > OFF_ROUTE_THRESHOLD_M) return '#FF4D4F';
    return '#3483FA';
  }, [distanceOffRoute, navPhase]);

  // Handler functions - defined before usage in effects
  const handleComplete = async () => {
    const durationS = elapsed;
    logNav.routeCompleted(durationS);
    logNavigationExit('completed');
    
    setNavState('COMPLETED');
    setNavPhase(null);

    const completed = true;

    if (routeDto?.id) {
      try {
        await apiRoutes.finishPractice(routeDto.id, {
          completed,
          distanceM: mapboxRouteMetrics?.distanceM || routeDto.distanceM,
          durationS,
        });

        await upsertRouteStat(routeDto.id, {
          timesCompleted: 1,
          lastCompletedAt: Date.now(),
        });
      } catch (err) {
        logNav.error('API', 'finishPractice failed', err);
      }
    }

    showTransientNotice(
      'Route Completed',
      `Time ${formatDuration(durationS)} • Distance ${formatDistance(mapboxRouteMetrics?.distanceM || routeDto?.distanceM || 0)}`,
      'success',
      2600
    );
    if (completionExitTimerRef.current) {
      clearTimeout(completionExitTimerRef.current);
    }
    completionExitTimerRef.current = setTimeout(() => {
      navigation.goBack();
      completionExitTimerRef.current = null;
    }, 2700);
  };

  const handleStart = () => {
    if (SDK_ONLY_NAVIGATION_MODE && !mapboxNavSdkAvailable) {
      logNav.warn('NAVIGATION_SDK', 'SDK-only mode blocked start: native Mapbox SDK unavailable');
      showTransientNotice(
        'Navigation Unavailable',
        'Mapbox Navigation SDK is unavailable in this build. Please install the latest native preview build.',
        'info',
        3200
      );
      return;
    }

    if (!userLocation) {
      showTransientNotice('No Location', 'Waiting for GPS signal...', 'info', 2200);
      return;
    }

    logNav.info('PRACTICE', `▶ Starting practice - location: ${userLocation[0].toFixed(4)},${userLocation[1].toFixed(4)}`);
    logNav.info('PRACTICE', `Route: ${routeDto?.name} | Distance: ${Math.round(mapboxRouteMetrics?.distanceM || routeDto?.distanceM || 0)}m | Coords: ${routeCoords.length}`);
    logSessionStart(routeDto?.id || 'unknown', routeDto?.name || 'Unknown Route');

    startTimeRef.current = null;
    setElapsed(0);
    setNavState('NAVIGATING');
    setNavPhase('TO_START');  // First navigate to start point
    setCameraMode('FOLLOW');
    setCompletedCoords([]);
    setVisualProgressIndex(0);
    visualProgressIndexRef.current = 0;
    setDistanceRemaining(null);
    setSdkDurationRemaining(null);
    setSdkFractionTraveled(0);
    setOnRouteOrigin(null);
    hasStartedMovingRef.current = false;
    smoothHeadingRef.current = 0;
    cameraHeadingRef.current = 0;
    setIsNorthLocked(false);
    offRouteAlertRef.current = false;
    lastSpokenStepRef.current = null;

    showTransientNotice(
      'Go To Route Start',
      'Reach the start point of the test route first. Follow the map guidance.',
      'info',
      4200
    );
  };

  const toggleCamera = () => {
    setCameraMode((prev) => (prev === 'FOLLOW' ? 'OVERVIEW' : 'FOLLOW'));
  };

  const handleCompassReset = () => {
    if (!cameraRef.current) return;
    setIsNorthLocked((prev) => {
      const nextLocked = !prev;
      try {
        const targetHeading = nextLocked ? 0 : userHeading;
        cameraHeadingRef.current = targetHeading;
        cameraRef.current?.setCamera({
          heading: targetHeading,
          animationDuration: 450,
          animationMode: 'easeTo',
        });
      } catch (err) {
        logNav.warn('PRACTICE', 'Compass reset failed', err);
      }
      return nextLocked;
    });
  };

  const handleBackPress = () => {
    // Stop speech immediately
    Speech.stop();
    
    // Log navigation exit if in progress
    if (navState === 'NAVIGATING') {
      logNav.info('PRACTICE', `User exited navigation (phase: ${navPhase}, elapsed: ${elapsed}s)`);
      logNavigationExit('cancelled');
    }
    
    // Navigate back
    navigation.goBack();
  };

  const resolvedSdkOrigin = useMemo<MapCoord | null>(() => {
    if (navState === 'PREVIEW') return previewSdkOrigin;
    return sdkOrigin || userLocation || previewSdkOrigin;
  }, [navState, previewSdkOrigin, sdkOrigin, userLocation]);

  const resolvedSdkDestination = useMemo<MapCoord | null>(() => {
    if (navState === 'PREVIEW') return previewSdkDestination;
    return sdkDestination || routeCoords[0] || previewSdkDestination;
  }, [navState, previewSdkDestination, routeCoords, sdkDestination]);

  const shouldRenderSdkView =
    mapboxNavSdkAvailable &&
    (navState === 'PREVIEW' || navState === 'NAVIGATING') &&
    !!resolvedSdkOrigin &&
    !!resolvedSdkDestination;

  useEffect(() => {
    if (navState !== 'NAVIGATING') return;
    if (!mapboxNavSdkAvailable) return;
    if (!resolvedSdkOrigin || !resolvedSdkDestination) return;
    if (sdkOrigin && sdkDestination) return;
    logNav.warn(
      'SDK_NAVIGATION',
      `Using fallback SDK endpoints while props settle (originReady=${!!sdkOrigin}, destinationReady=${!!sdkDestination})`
    );
  }, [
    mapboxNavSdkAvailable,
    navState,
    resolvedSdkDestination,
    resolvedSdkOrigin,
    sdkDestination,
    sdkOrigin,
  ]);

  useEffect(() => {
    if (navState === 'NAVIGATING' && shouldRenderSdkView) return;
    setNativeUiStatus(INITIAL_NATIVE_UI_STATUS);
  }, [navState, shouldRenderSdkView]);

  // SINGLE-AUTHORITY RENDERING: SDK controls PREVIEW/TO_START/ON_ROUTE map visuals when available.
  const sdkIsInControl = shouldRenderSdkView;
  const showLocalMap = !sdkIsInControl;
  const isNativeUiFresh =
    nativeUiStatus.lastUpdateMs > 0 && Date.now() - nativeUiStatus.lastUpdateMs <= NATIVE_UI_FRESHNESS_MS;
  const nativeTopBannerAvailable =
    sdkIsInControl &&
    isNativeUiFresh &&
    nativeUiStatus.bannerVisible &&
    nativeUiStatus.bannerActuallyVisible &&
    !nativeUiStatus.fallbackBannerVisible &&
    (nativeUiStatus.bannerChildCount > 0 || nativeUiStatus.maneuverCount > 0);
  const nativeBottomBannerAvailable =
    sdkIsInControl &&
    isNativeUiFresh &&
    nativeUiStatus.tripVisible &&
    nativeUiStatus.tripActuallyVisible;

  useEffect(() => {
    if (
      !sdkIsInControl &&
      navState === 'NAVIGATING' &&
      cameraMode === 'FOLLOW' &&
      hasStartedMovingRef.current &&
      visualUserLocation &&
      cameraRef.current
    ) {
      const now = Date.now();
      if (now - lastCameraUpdateRef.current < 250) {
        return;
      }
      lastCameraUpdateRef.current = now;

      const speed = typeof userSpeedMps === 'number' ? userSpeedMps : 0;
      const shouldRotate = speed > CAMERA_ROTATE_MIN_SPEED_MPS && !isNorthLocked;
      let targetHeading = isNorthLocked ? 0 : userHeading;
      let anchorCoord: MapCoord = visualUserLocation;

      if (navPhase === 'ON_ROUTE' && routeCoords.length > 0 && userLocation) {
        const snapped = getVisualRouteSnap(routeCoords, userLocation, maxIndexReachedRef.current);
        anchorCoord = snapped.coord;
        if (!isNorthLocked && snapped.routeBearing !== null) {
          targetHeading = snapped.routeBearing;
        }
      }

      if (shouldRotate) {
        const delta = shortestHeadingDelta(cameraHeadingRef.current, targetHeading);
        if (Math.abs(delta) >= CAMERA_HEADING_DEADBAND_DEG) {
          const limitedStep = Math.max(
            -CAMERA_HEADING_STEP_LIMIT_DEG,
            Math.min(CAMERA_HEADING_STEP_LIMIT_DEG, delta)
          );
          cameraHeadingRef.current = normalizeHeading(cameraHeadingRef.current + limitedStep);
        }
      }

      const headingForCamera = cameraHeadingRef.current;
      const aheadDistance = shouldRotate ? CAMERA_AHEAD_DISTANCE_M : 50;

      cameraRef.current.setCamera({
        centerCoordinate: getCameraCenterAhead(
          anchorCoord[0],
          anchorCoord[1],
          headingForCamera,
          aheadDistance
        ),
        heading: headingForCamera,
        zoomLevel: 16.2,
        pitch: 60,
        animationDuration: 280,
        animationMode: 'easeTo',
      });
    }
  }, [cameraMode, isNorthLocked, navPhase, navState, routeCoords, sdkIsInControl, userLocation, userHeading, userSpeedMps, visualUserLocation]);

  // Arrival detection at start point
  useEffect(() => {
    if (navPhase !== 'TO_START' || navState !== 'NAVIGATING') {
      toStartArrivalCandidateAtRef.current = null;
    }
  }, [navPhase, navState]);

  useEffect(() => {
    if (!userLocation || navState !== 'NAVIGATING' || navPhase !== 'TO_START' || routeCoords.length === 0) {
      return;
    }

    const start = routeCoords[0];
    const distanceM = calculateDistance(userLocation[0], userLocation[1], start[0], start[1]) * 1000;
    const sdkRemainingM = typeof distanceRemaining === 'number' && Number.isFinite(distanceRemaining)
      ? distanceRemaining
      : null;
    const hasReachedStartByGps = distanceM <= TO_START_ARRIVAL_THRESHOLD_M;
    const hasReachedStartByGpsHard = distanceM <= TO_START_GPS_HARD_ARRIVAL_THRESHOLD_M;
    // Require TO_START SDK route remaining to be near-zero as a second guard.
    // This prevents an early ON_ROUTE switch while the user is still approaching start.
    const hasReachedStartBySdk = mapboxNavSdkAvailable
      ? (sdkRemainingM != null && sdkRemainingM <= TO_START_SDK_REMAINING_THRESHOLD_M)
      : true;
    const canSwitchToOnRoute = hasReachedStartByGps && (hasReachedStartBySdk || hasReachedStartByGpsHard);

    if (canSwitchToOnRoute) {
      const now = Date.now();
      const arrivalGate = hasReachedStartBySdk ? 'gps+sdk' : 'gps-hard';
      if (toStartArrivalCandidateAtRef.current === null) {
        toStartArrivalCandidateAtRef.current = now;
        logNav.info(
          'ROUTE_TRACKING',
          `Start arrival candidate detected (${arrivalGate}, gps=${distanceM.toFixed(1)}m, sdk=${sdkRemainingM?.toFixed(1) ?? 'n/a'}m). Holding ${TO_START_ARRIVAL_HOLD_MS}ms before ON_ROUTE switch.`
        );
        return;
      }
      if (now - toStartArrivalCandidateAtRef.current < TO_START_ARRIVAL_HOLD_MS) {
        return;
      }

      logNav.arrivedAtStart();
      logNav.navigationPhaseChange('TO_START', 'ON_ROUTE');
      logSessionStart(routeDto?.id || 'unknown', routeDto?.name || 'Unnamed Route');
      
      // Set fixed ON_ROUTE origin first so the first native ON_ROUTE request
      // does not briefly fall back to sampled route start.
      setOnRouteOrigin(userLocation);
      setNavPhase('ON_ROUTE');
      startTimeRef.current = Date.now();
      setElapsed(0);
      setCameraMode('FOLLOW');
      setCompletedCoords([]);
      setVisualProgressIndex(0);
      visualProgressIndexRef.current = 0;
      setFallbackSteps([]);
      fallbackStepSignatureRef.current = '';
      setCurrentInstruction(null);
      setSdkFractionTraveled(0);
      lastSpokenStepRef.current = null;
      offRouteAlertRef.current = false;
      spokenDistancesRef.current = {};
      spokenInstructionsRef.current.clear(); // Clear spoken instructions for ON_ROUTE phase

      if (routeDto?.id) {
        apiRoutes.startPractice(routeDto.id).catch((err: unknown) => logNav.error('API', 'startPractice failed', err));
      }

      showTransientNotice(
        'Test Route Started',
        'You reached the start point. Your test route practice is now active.',
        'success',
        3200
      );
    } else {
      toStartArrivalCandidateAtRef.current = null;
      // Log distance to start every 10 seconds while in TO_START phase
      const now = Date.now();
      if (now - lastDistLogRef.current > 10000) {
        logNav.distanceToStart(distanceM);
        if (sdkRemainingM != null) {
          logNav.info('ROUTE_TRACKING', `TO_START sdk remaining: ${sdkRemainingM.toFixed(1)}m`);
        } else if (mapboxNavSdkAvailable) {
          logNav.info('ROUTE_TRACKING', 'TO_START sdk remaining: unavailable');
        }
        lastDistLogRef.current = now;
      }
    }
  }, [distanceRemaining, mapboxNavSdkAvailable, navPhase, navState, routeCoords, routeDto?.id, userLocation]);

  /**
   * STRICT PROGRESS TRACKING: On-Route Phase
   * 
   * Updates maxIndexReached (monotonic) and completedCoords for visual display.
   * Tracks completion: 97% + within 30m of end for 10 consecutive seconds.
   * Handles loop routes correctly (start ≈ end).
   * 
   * DOES NOT use Directions API - uses stored routeCoords only.
   */
  useEffect(() => {
    if (navState !== 'NAVIGATING' || navPhase !== 'ON_ROUTE' || !userLocation || routeCoords.length === 0) {
      return;
    }

    const currentProgressIndex = maxIndexReachedRef.current;
    const { minDistanceM: minDistToRoute } = findClosestRouteIndexInWindow(
      routeCoords,
      userLocation,
      currentProgressIndex
    );

    // Off-route detection must run even when SDK controls ON_ROUTE.
    if (minDistToRoute > OFF_ROUTE_THRESHOLD_M) {
      if (!offRouteAlertRef.current) {
        logNav.warn('PRACTICE', `User is ${minDistToRoute.toFixed(0)}m from route`);
        offRouteAlertRef.current = true;
        showTransientNotice(
          'Off Route',
          `You're going off route. You are ${minDistToRoute.toFixed(0)}m from the test route.`,
          'info',
          2400
        );
      }
    } else {
      offRouteAlertRef.current = false;
    }

    // Update UI state with current distance off route
    setDistanceOffRoute(minDistToRoute);

    // Keep SDK as guidance authority; only run local progression when SDK is not controlling.
    if (sdkIsInControl) {
      return;
    }

    // Monotonic progress: maxIndexReached only increases
    const sequentialIndex = advanceProgressIndexSequentially(
      routeCoords,
      userLocation,
      currentProgressIndex
    );
    if (sequentialIndex > maxIndexReachedRef.current) {
      maxIndexReachedRef.current = sequentialIndex;
      const progressIndex = maxIndexReachedRef.current;
      logNav.info('PRACTICE', `Advanced to index ${progressIndex}/${routeCoords.length} (${((progressIndex / routeCoords.length) * 100).toFixed(1)}%)`);
    }
    const progressIndex = maxIndexReachedRef.current;

    // Visual progress index is clamped to nearby geometry so green/amber split does not run ahead of the puck.
    const displayStartIndex = Math.max(0, progressIndex - 80);
    const displayEndIndex = Math.min(routeCoords.length - 1, progressIndex + 25);
    let displayClosestIndex = progressIndex;
    let displayClosestDist = Infinity;
    for (let i = displayStartIndex; i <= displayEndIndex; i++) {
      const distM =
        calculateDistance(
          userLocation[0],
          userLocation[1],
          routeCoords[i][0],
          routeCoords[i][1]
        ) * 1000;
      if (distM < displayClosestDist) {
        displayClosestDist = distM;
        displayClosestIndex = i;
      }
    }
    const displayProgressIndex = Math.max(0, Math.min(progressIndex, displayClosestIndex));
    const nextVisualIndex = Math.max(visualProgressIndexRef.current, displayProgressIndex);
    if (nextVisualIndex !== visualProgressIndexRef.current) {
      visualProgressIndexRef.current = nextVisualIndex;
      setVisualProgressIndex(nextVisualIndex);
    }

    const completedSlice = routeCoords.slice(0, Math.min(routeCoords.length, nextVisualIndex + 1));
    setCompletedCoords(completedSlice.length > 0 ? [...completedSlice, userLocation] : completedSlice);

    // Distance remaining from monotonic progress index only
    const remainingDistance = computeRemainingDistance(routeCoords, progressIndex);
    setDistanceRemaining(remainingDistance);

    // Completion logic: must be near end of the sequential GeoJSON index order + near end point for 10s
    const routeLength = routeCoords.length;
    const progressRatio = routeLength > 0 ? progressIndex / routeLength : 0;
    const progressPercent = progressRatio * 100;
    const hasReachedRouteTail = progressIndex >= Math.max(0, routeLength - 1 - COMPLETION_TAIL_POINTS);
    const routeEnd = routeCoords[routeCoords.length - 1];
    const distToEnd = calculateDistance(userLocation[0], userLocation[1], routeEnd[0], routeEnd[1]) * 1000;
    const isNearEnd = distToEnd <= 30;

    const now = Date.now();

    if (hasReachedRouteTail && isNearEnd) {
      // User reached the tail of route index order AND is within 30m of end
      if (lastAtEndTimeRef.current === null) {
        lastAtEndTimeRef.current = now; // Start the 10-second timer
        logNav.info('PRACTICE', `User reached route tail index + 30m from end. Starting 10s hold timer...`);
      }

      const holdTime = now - lastAtEndTimeRef.current;
      if (holdTime >= 10000) {
        // 10 seconds have passed - complete!
        logNav.info('PRACTICE', `✓ Completed - sequential tail reached (${(progressPercent).toFixed(1)}%) + 10s hold at end`);
        handleComplete();
      }
    } else {
      // User moved away from end or has not reached required sequential tail - reset timer
      if (lastAtEndTimeRef.current !== null) {
        logNav.info('PRACTICE', `User moved away or not yet at sequential tail. Resetting timer.`);
      }
      lastAtEndTimeRef.current = null;
    }
  }, [navPhase, navState, routeCoords, userLocation, sdkIsInControl]);

  /**
   * FALLBACK NAVIGATION - TO_START Phase
   * 
   * Builds directions from user location to route start.
   * 
   * OPTIMIZATION: Only rebuilds when:
   * - Entering TO_START phase (phase transition)
   * - User is >150m off current route line (major deviation)
   * - At most every 15 seconds (throttle to reduce API spam)
   */
  const lastToStartBuildRef = useRef<number>(0);
  const lastToStartLocationRef = useRef<MapCoord | null>(null);
  
  useEffect(() => {
    const needsFallbackDirections =
      !SDK_ONLY_NAVIGATION_MODE &&
      navState === 'NAVIGATING' && 
      (navPhase === 'TO_START' || navPhase === 'ON_ROUTE') &&
      !mapboxNavSdkAvailable;

    if (!needsFallbackDirections || !userLocation || !navDestination) {
      if (navState !== 'NAVIGATING') {
        setFallbackSteps([]);
        fallbackStepSignatureRef.current = '';
        lastToStartLocationRef.current = null;
      }
      fallbackBuildInFlightRef.current = false;
      return;
    }

    const now = Date.now();
    const timeSinceLastBuild = now - lastToStartBuildRef.current;
    
    // Rebuild conditions:
    // 1. First build (no previous build)
    // 2. User has moved significantly from last build location (phase-specific threshold)
    // 3. At least 15s since last build (periodic refresh)
    // A minimum cooldown is applied even on major deviation to prevent rebuild spam.
    const isFirstBuild = lastToStartBuildRef.current === 0;
    const deviationThresholdM = navPhase === 'ON_ROUTE' ? 220 : 150;
    const lastLocDist = lastToStartLocationRef.current 
      ? calculateDistance(
          userLocation[0], userLocation[1],
          lastToStartLocationRef.current[0], lastToStartLocationRef.current[1]
        ) * 1000
      : Infinity;
    const isMajorDeviation = lastLocDist > deviationThresholdM;
    const isThrottleExpired = timeSinceLastBuild >= 15000;
    const isCooldownElapsed = timeSinceLastBuild >= 8000;
    
    const shouldRebuild =
      isFirstBuild ||
      isThrottleExpired ||
      (isMajorDeviation && isCooldownElapsed);
    
    if (!shouldRebuild || fallbackBuildInFlightRef.current) {
      return;
    }

    const buildFallbackNav = async () => {
      const start: LatLng = { latitude: userLocation[1], longitude: userLocation[0] };
      const end: LatLng = { latitude: navDestination[1], longitude: navDestination[0] };
      const onRouteWaypoints =
        navPhase === 'ON_ROUTE'
          ? buildOnRouteFallbackWaypoints(routeCoords, maxIndexReachedRef.current)
          : [];
      
      const reason = isFirstBuild ? 'first' : isMajorDeviation ? `deviation ${Math.round(lastLocDist)}m` : 'throttle';
      const phaseLabel = navPhase === 'ON_ROUTE' ? 'ON_ROUTE' : 'TO_START';
      logNav.info(
        'DIRECTIONS_API',
        `${phaseLabel} directions rebuild (${reason}): ${start.latitude.toFixed(4)},${start.longitude.toFixed(4)} → ${end.latitude.toFixed(4)},${end.longitude.toFixed(4)}`
      );

      fallbackBuildInFlightRef.current = true;
      const requestSeq = ++fallbackBuildRequestSeqRef.current;
      lastToStartBuildRef.current = now;
      lastToStartLocationRef.current = userLocation;
      
      const res = await getDirections(start, end, onRouteWaypoints, {
        language: 'en',
        voiceUnits: 'imperial',
        waypointNames: navPhase === 'TO_START' ? ['', 'starting point'] : undefined,
      });
      if (requestSeq !== fallbackBuildRequestSeqRef.current) {
        return;
      }
      if (!res?.coords?.length) {
        logNav.warn('DIRECTIONS_API', `No ${phaseLabel} directions returned`);
        setFallbackSteps([]);
        fallbackStepSignatureRef.current = '';
        return;
      }
      
      logNav.info('DIRECTIONS_API', `✓ ${phaseLabel} directions: ${res.coords.length} coords, ${res.steps?.length ?? 0} steps`);
      
      // Fallback directions used only when SDK is unavailable.
      setFallbackSteps(res.steps || []);
      lastSpokenStepRef.current = null;
    };

    buildFallbackNav()
      .catch((err: unknown) => logNav.error('DIRECTIONS_API', `${navPhase || 'UNKNOWN'} failed: ${String(err)}`))
      .finally(() => {
        fallbackBuildInFlightRef.current = false;
      });
  }, [navState, navPhase, mapboxNavSdkAvailable, userLocation, navDestination, routeCoords]);

  /**
   * ON_ROUTE PHASE: Use stored route geometry only
   * 
   * NO Directions API for ON_ROUTE.
   * Rendered via routeSource/baseSource in blue.
   * GPS tracking still updates progress indices for completion logic.
   */
  useEffect(() => {
    // If entering ON_ROUTE phase, reset maxIndexReached
    if (navPhase === 'ON_ROUTE' && navState === 'NAVIGATING') {
      maxIndexReachedRef.current = 0;
      setVisualProgressIndex(0);
      visualProgressIndexRef.current = 0;
      lastAtEndTimeRef.current = null;
    }
  }, [navPhase, navState]);

  /**
   * Reset step tracking when fallback route changes
   */
  useEffect(() => {
    if (fallbackSteps.length === 0) {
      fallbackStepSignatureRef.current = '';
      return;
    }

    const nextSignature = buildFallbackStepSignature(fallbackSteps);
    if (nextSignature === fallbackStepSignatureRef.current) {
      return;
    }

    fallbackStepSignatureRef.current = nextSignature;
    currentStepIndexRef.current = 0;
    spokenDistancesRef.current = {};
    // Keep spokenInstructionsRef across route rebuilds to avoid repeating
    // long-distance prompts after every fallback refresh.
    logNav.info('INSTRUCTION', `🔄 Reset fallback navigation: ${fallbackSteps.length} steps loaded`);
  }, [fallbackSteps]);

  /**
   * Update instructions from fallback steps - ONLY for non-SDK devices or TO_START phase
   * SDK handles all instructions automatically for ON_ROUTE
   */
  useEffect(() => {
    if (sdkIsInControl) {
      return;
    }

    if (
      navState !== 'NAVIGATING' ||
      !userLocation ||
      fallbackSteps.length === 0
    ) {
      return;
    }

    // Get current step index
    const i = currentStepIndexRef.current;
    
    // Compute distance to current step's maneuver location
    const currentStep = fallbackSteps[i];
    if (!currentStep) {
      logNav.warn('INSTRUCTION', `Current step index ${i} out of bounds (${fallbackSteps.length} steps)`);
      return;
    }

    const distToManeuver =
      calculateDistance(
        userLocation[0],
        userLocation[1],
        currentStep.location.longitude,
        currentStep.location.latitude,
      ) * 1000;

    const isArrivalLikeStep = isDestinationArrivalInstruction(
      currentStep.instruction,
      currentStep.maneuverType
    );
    const routeEnd = routeCoords[routeCoords.length - 1];
    const distToRouteEndM =
      navPhase === 'ON_ROUTE' && routeEnd
        ? calculateDistance(
            userLocation[0],
            userLocation[1],
            routeEnd[0],
            routeEnd[1]
          ) * 1000
        : Infinity;
    const hasReachedSequentialTail =
      routeCoords.length > 0 &&
      maxIndexReachedRef.current >= Math.max(0, routeCoords.length - 1 - COMPLETION_TAIL_POINTS);
    const isNearTrueRouteEnd =
      navPhase === 'ON_ROUTE' && hasReachedSequentialTail && distToRouteEndM <= 45;

    // Mapbox fallback directions include many waypoint-leg "arrive at destination"
    // instructions on loop routes. Skip these mid-route to prevent repetitive/incorrect prompts.
    if (navPhase === 'ON_ROUTE' && isArrivalLikeStep && !isNearTrueRouteEnd) {
      if (i < fallbackSteps.length - 1) {
        currentStepIndexRef.current = i + 1;
        spokenDistancesRef.current = {};
      }
      logNav.info(
        'INSTRUCTION',
        `↷ Skipped waypoint-arrival step ${i}/${fallbackSteps.length} (${Math.round(distToManeuver)}m from maneuver)`
      );
      return;
    }

    logNav.info('INSTRUCTION', `Step ${i}/${fallbackSteps.length}: "${currentStep.instruction}" | distance: ${distToManeuver.toFixed(0)}m`);

    // Advance to next step if within 20m of current maneuver
    if (distToManeuver < 20 && i < fallbackSteps.length - 1) {
      currentStepIndexRef.current = i + 1;
      spokenDistancesRef.current = {}; // Clear distance triggers for new step
      logNav.info('INSTRUCTION', `✓ Advanced to step ${i + 1} (within 20m of step ${i})`);
      return; // Re-render next iteration with new step
    }

    // Update display instruction
    const fallbackRoundaboutText = buildRoundaboutExitText(currentStep.roundaboutExit);
    const fallbackLaneText = buildLaneGuidanceFromStep(currentStep);
    const isToStartArrivalStep =
      navPhase === 'TO_START' &&
      isDestinationArrivalInstruction(currentStep.instruction, currentStep.maneuverType);
    const fallbackInstructionText =
      isToStartArrivalStep && distToManeuver > TO_START_ARRIVAL_THRESHOLD_M
        ? 'Continue to starting point'
        : isToStartArrivalStep
          ? toStartArrivalText
          : currentStep.instruction;

    setCurrentInstruction({
      text: fallbackInstructionText,
      secondary: combineInstructionSecondary(undefined, fallbackRoundaboutText, fallbackLaneText),
      distanceM: distToManeuver,
      maneuverType: currentStep.maneuverType,
      maneuverModifier: currentStep.maneuverModifier,
      roundaboutExit: currentStep.roundaboutExit,
    });

    // Handle speech for fallback mode (SDK has its own voice guidance)
    // Trigger speech from Mapbox voice_instructions distances (default Mapbox behavior),
    // instead of fixed custom start/100m gates.
    const activeStep = currentStep;
    if (!isMuted) {
      const voiceInstructions = activeStep.voiceInstructions || [];

      const normalizeForMatch = (value: string): string =>
        normalizeInstructionText(value);

      const containsRoadName = (text: string, roadName?: string): boolean => {
        if (!roadName) return false;
        return normalizeForMatch(text).includes(normalizeForMatch(roadName));
      };

      const selectRoadAwareSpeechText = (
        mapboxAnnouncement: string | undefined,
        mapboxInstruction: string,
        roadName?: string
      ): string => {
        if (!mapboxAnnouncement) return mapboxInstruction;

        // Prefer explicit Mapbox voice announcement, but if it omits the
        // road name/number and Mapbox instruction includes it, use instruction.
        if (
          roadName &&
          containsRoadName(mapboxInstruction, roadName) &&
          !containsRoadName(mapboxAnnouncement, roadName)
        ) {
          return mapboxInstruction;
        }

        return mapboxAnnouncement;
      };

      const speakOnce = (rawText: string, label: string) => {
        const spokenText = stripSsml(rawText);
        if (!spokenText) return;
        if (
          navPhase === 'ON_ROUTE' &&
          isDestinationArrivalInstruction(spokenText, activeStep.maneuverType) &&
          !isNearTrueRouteEnd
        ) {
          // Suppress mid-route "arrived at destination" spam from fallback directions.
          return;
        }
        const normalizedText = normalizeForMatch(spokenText);
        if (!normalizedText) return;
        const now = Date.now();
        const lastSpokenAt = recentSpeechByTextRef.current[normalizedText] || 0;
        if (now - lastSpokenAt < FALLBACK_SPEECH_REPEAT_COOLDOWN_MS) return;

        const maneuverKey = `${activeStep.location.latitude.toFixed(5)}:${activeStep.location.longitude.toFixed(5)}`;
        const instructionKey = [
          navPhase || 'none',
          maneuverKey,
          label,
          normalizeForMatch(spokenText),
        ].join('|');
        if (spokenInstructionsRef.current.has(instructionKey)) return;

        if (now - lastSpeechTimeRef.current < 4000) return;

        try {
          Speech.speak(spokenText, { rate: 0.95 });
          logNav.info('SPEECH', `✓ Fallback Mapbox voice call (${label}, step ${i}): "${spokenText}"`);
          spokenInstructionsRef.current.add(instructionKey);
          recentSpeechByTextRef.current[normalizedText] = now;
          lastSpeechTimeRef.current = now;
        } catch (err: unknown) {
          logNav.error('SPEECH', `Speech.speak() failed: ${String(err)}`);
        }
      };

      if (isToStartArrivalStep) {
        const arrivalKey = `${i}-arrival`;
        if (distToManeuver <= TO_START_ARRIVAL_THRESHOLD_M && !spokenDistancesRef.current[arrivalKey]) {
          speakOnce(toStartArrivalText, 'arrival');
          spokenDistancesRef.current[arrivalKey] = true;
        }
        return;
      }

      // Speak when user reaches a Mapbox-provided distanceAlongGeometry trigger.
      // Process one trigger per location update for calmer TTS pacing.
      const sortedVoiceInstructions = [...voiceInstructions]
        .filter((instruction) => Number.isFinite(instruction.distanceAlongGeometry))
        .sort((a, b) => a.distanceAlongGeometry - b.distanceAlongGeometry);

      let matchedInstruction:
        | { triggerM: number; rawText: string; key: string }
        | null = null;

      for (const instruction of sortedVoiceInstructions) {
        const triggerM = Math.max(0, Math.round(instruction.distanceAlongGeometry));
        const activationM = triggerM === 0 ? 20 : triggerM;
        const triggerKey = `${i}-mapbox-${triggerM}`;
        if (spokenDistancesRef.current[triggerKey]) continue;
        if (distToManeuver > activationM) continue;

        const rawText = selectRoadAwareSpeechText(
          instruction.announcement || instruction.ssmlAnnouncement,
          activeStep.instruction,
          activeStep.roadName
        );
        matchedInstruction = { triggerM, rawText, key: triggerKey };
        break;
      }

      if (matchedInstruction) {
        speakOnce(matchedInstruction.rawText, `${matchedInstruction.triggerM}m`);
        spokenDistancesRef.current[matchedInstruction.key] = true;
      } else if (!sortedVoiceInstructions.length) {
        // If Mapbox doesn't provide voice instructions for a step, speak step text once.
        const fallbackKey = `${i}-fallback-step`;
        if (!spokenDistancesRef.current[fallbackKey]) {
          speakOnce(activeStep.instruction, 'fallback');
          spokenDistancesRef.current[fallbackKey] = true;
        }
      }
    }
  }, [fallbackSteps, isMuted, navPhase, navState, routeCoords, sdkIsInControl, userLocation]);

  /**
   * SDK PROGRESS HANDLER (Mapbox-first):
   * Completion is derived from Mapbox route metrics only for SDK-controlled ON_ROUTE.
   */
  const handleSDKProgress = (event: MapboxNavSdkEvent) => {
    if (!sdkIsInControl) {
      // SDK telemetry is only authoritative while native ON_ROUTE view is in control.
      return;
    }

    const { nativeEvent } = event;
    const nativeUiFlags = {
      bannerVisible: nativeEvent.nativeBannerVisible,
      bannerActuallyVisible: nativeEvent.nativeBannerActuallyVisible,
      fallbackBannerVisible: nativeEvent.nativeFallbackBannerVisible,
      bannerWidth: nativeEvent.nativeBannerWidth,
      bannerHeight: nativeEvent.nativeBannerHeight,
      bannerChildCount: nativeEvent.nativeBannerChildCount,
      rootWidth: nativeEvent.nativeRootWidth,
      rootHeight: nativeEvent.nativeRootHeight,
      tripVisible: nativeEvent.nativeTripVisible,
      tripActuallyVisible: nativeEvent.nativeTripActuallyVisible,
      tripWidth: nativeEvent.nativeTripWidth,
      tripHeight: nativeEvent.nativeTripHeight,
      mode: nativeEvent.nativeMode,
      maneuverCount: nativeEvent.nativeManeuverCount,
    };
    setNativeUiStatus((prev) => {
      const next: NativeUiStatus = {
        bannerVisible: !!nativeUiFlags.bannerVisible,
        bannerActuallyVisible: !!nativeUiFlags.bannerActuallyVisible,
        fallbackBannerVisible: !!nativeUiFlags.fallbackBannerVisible,
        bannerWidth: nativeUiFlags.bannerWidth ?? 0,
        bannerHeight: nativeUiFlags.bannerHeight ?? 0,
        bannerChildCount: nativeUiFlags.bannerChildCount ?? 0,
        tripVisible: !!nativeUiFlags.tripVisible,
        tripActuallyVisible: !!nativeUiFlags.tripActuallyVisible,
        tripWidth: nativeUiFlags.tripWidth ?? 0,
        tripHeight: nativeUiFlags.tripHeight ?? 0,
        maneuverCount: nativeUiFlags.maneuverCount ?? 0,
        mode: nativeUiFlags.mode || 'UNKNOWN',
        lastUpdateMs: Date.now(),
      };
      if (
        prev.bannerVisible === next.bannerVisible &&
        prev.bannerActuallyVisible === next.bannerActuallyVisible &&
        prev.fallbackBannerVisible === next.fallbackBannerVisible &&
        prev.bannerWidth === next.bannerWidth &&
        prev.bannerHeight === next.bannerHeight &&
        prev.bannerChildCount === next.bannerChildCount &&
        prev.tripVisible === next.tripVisible &&
        prev.tripActuallyVisible === next.tripActuallyVisible &&
        prev.tripWidth === next.tripWidth &&
        prev.tripHeight === next.tripHeight &&
        prev.maneuverCount === next.maneuverCount &&
        prev.mode === next.mode
      ) {
        if (next.lastUpdateMs - prev.lastUpdateMs < 3000) {
          return prev;
        }
      }
      return next;
    });
    const hasInstructionPayload =
      typeof nativeEvent.instruction === 'string' ||
      typeof nativeEvent.instructionSecondary === 'string' ||
      typeof nativeEvent.maneuverType === 'string';
    const hasProgressPayload =
      typeof nativeEvent.distanceRemaining === 'number' ||
      typeof nativeEvent.durationRemaining === 'number' ||
      typeof nativeEvent.fractionTraveled === 'number';

    if (!hasInstructionPayload && !hasProgressPayload) {
      // Voice-only callback payload; do not reset instruction/progress state from it.
      logNav.info(
        'SDK_NAVIGATION',
        `Native UI - banner:${String(nativeUiFlags.bannerVisible)} actual:${String(nativeUiFlags.bannerActuallyVisible)} fallback:${String(nativeUiFlags.fallbackBannerVisible)} size:${nativeUiFlags.bannerWidth ?? 0}x${nativeUiFlags.bannerHeight ?? 0} children:${nativeUiFlags.bannerChildCount ?? 0} trip:${String(nativeUiFlags.tripVisible)} tripActual:${String(nativeUiFlags.tripActuallyVisible)} mode:${nativeUiFlags.mode || 'unknown'} maneuvers:${nativeUiFlags.maneuverCount ?? 0}`
      );
      return;
    }

    const now = Date.now();
    const roundedInstructionDistance =
      typeof nativeEvent.distanceToInstruction === 'number'
        ? Math.round(nativeEvent.distanceToInstruction)
        : -1;
    const instructionKey = [
      nativeEvent.instruction || '',
      nativeEvent.instructionSecondary || '',
      nativeEvent.maneuverType || '',
      nativeEvent.maneuverModifier || '',
      roundedInstructionDistance.toString(),
    ].join('|');
    const shouldLogInstruction =
      instructionKey !== sdkLogStateRef.current.lastInstructionKey ||
      now - sdkLogStateRef.current.lastInstructionAt > 10000;
    if (shouldLogInstruction) {
      sdkLogStateRef.current.lastInstructionKey = instructionKey;
      sdkLogStateRef.current.lastInstructionAt = now;
      logNav.info('SDK_INSTRUCTION', `Raw SDK event - instruction: "${nativeEvent.instruction}" | secondary: "${nativeEvent.instructionSecondary}" | distance: ${nativeEvent.distanceToInstruction}m | maneuver: ${nativeEvent.maneuverType} ${nativeEvent.maneuverModifier}`);
    }

    // SDK provides all instruction data - sanitize it for UI before rendering.
    const fallbackText = buildManeuverInstruction(
      nativeEvent.maneuverType,
      nativeEvent.maneuverModifier,
      nativeEvent.roundaboutExit,
    );
    const primaryInstruction = stripSsml(nativeEvent.instruction || '');
    const fallbackInstruction = stripSsml(fallbackText || '');
    const secondaryInstruction = stripSsml(nativeEvent.instructionSecondary || '');
    const roundaboutText = buildRoundaboutExitText(nativeEvent.roundaboutExit);
    const voiceInstructionFallback = stripSsml(
      nativeEvent.voiceInstructionText || nativeEvent.voiceInstruction || nativeEvent.voiceInstructionSsml || ''
    );

    setCurrentInstruction((prev) => {
      const nextText =
        primaryInstruction || fallbackInstruction || prev?.text || voiceInstructionFallback || 'Continue';
      const nextSecondary = combineInstructionSecondary(
        secondaryInstruction || undefined,
        roundaboutText,
        undefined
      );
      const nextDistance = typeof nativeEvent.distanceToInstruction === 'number'
        ? nativeEvent.distanceToInstruction
        : (prev?.distanceM ?? 0);

      if (
        prev &&
        prev.text === nextText &&
        (prev.secondary || '') === (nextSecondary || '') &&
        prev.distanceM === nextDistance &&
        prev.maneuverType === nativeEvent.maneuverType &&
        prev.maneuverModifier === nativeEvent.maneuverModifier &&
        prev.roundaboutExit === nativeEvent.roundaboutExit
      ) {
        return prev;
      }

      return {
        text: nextText,
        secondary: nextSecondary,
        distanceM: nextDistance,
        maneuverType: nativeEvent.maneuverType,
        maneuverModifier: nativeEvent.maneuverModifier,
        roundaboutExit: nativeEvent.roundaboutExit,
      };
    });

    // SDK provides distance remaining and progress fraction
    const distRemaining = nativeEvent.distanceRemaining;
    const durationRemaining = nativeEvent.durationRemaining;
    const fraction = nativeEvent.fractionTraveled ?? 0;
    const isOnRoutePhase = navPhase === 'ON_ROUTE';

    if (typeof distRemaining === 'number') {
      setDistanceRemaining(distRemaining);
    }
    if (typeof durationRemaining === 'number') {
      setSdkDurationRemaining(durationRemaining);
    }
    if (isOnRoutePhase && typeof nativeEvent.fractionTraveled === 'number') {
      setSdkFractionTraveled(fraction);
    } else if (!isOnRoutePhase) {
      // Keep visual progress at 0 until ON_ROUTE starts.
      setSdkFractionTraveled(0);
    }
    
    if (hasProgressPayload) {
      const lastDistance = sdkLogStateRef.current.lastProgressDistance;
      const lastFraction = sdkLogStateRef.current.lastProgressFraction;
      const minDistanceDeltaForLog = isOnRoutePhase ? 5 : 50;
      const distanceChanged =
        typeof distRemaining === 'number' &&
        (lastDistance === null || Math.abs(distRemaining - lastDistance) >= minDistanceDeltaForLog);
      const fractionChanged =
        typeof nativeEvent.fractionTraveled === 'number' &&
        (lastFraction === null || Math.abs(fraction - lastFraction) >= 0.002);
      const periodicLog = now - sdkLogStateRef.current.lastProgressAt > 10000;
      if (distanceChanged || fractionChanged || periodicLog) {
        sdkLogStateRef.current.lastProgressAt = now;
        sdkLogStateRef.current.lastProgressDistance =
          typeof distRemaining === 'number' ? distRemaining : lastDistance;
        sdkLogStateRef.current.lastProgressFraction =
          typeof nativeEvent.fractionTraveled === 'number' ? fraction : lastFraction;
        if (isOnRoutePhase) {
          logNav.info('SDK_NAVIGATION', `Progress: ${(fraction * 100).toFixed(1)}% | Distance remaining: ${distRemaining}m`);
        } else {
          logNav.info('SDK_NAVIGATION', `TO_START remaining: ${distRemaining}m`);
        }
        logNav.info(
          'SDK_NAVIGATION',
          `Native UI - banner:${String(nativeUiFlags.bannerVisible)} actual:${String(nativeUiFlags.bannerActuallyVisible)} fallback:${String(nativeUiFlags.fallbackBannerVisible)} size:${nativeUiFlags.bannerWidth ?? 0}x${nativeUiFlags.bannerHeight ?? 0} children:${nativeUiFlags.bannerChildCount ?? 0} trip:${String(nativeUiFlags.tripVisible)} tripActual:${String(nativeUiFlags.tripActuallyVisible)} tripSize:${nativeUiFlags.tripWidth ?? 0}x${nativeUiFlags.tripHeight ?? 0} root:${nativeUiFlags.rootWidth ?? 0}x${nativeUiFlags.rootHeight ?? 0} mode:${nativeUiFlags.mode || 'unknown'} maneuvers:${nativeUiFlags.maneuverCount ?? 0}`
        );
      }
    }

    // Mapbox-controlled completion: require both high route fraction and low remaining distance, then 10s hold.
    if (navPhase === 'ON_ROUTE') {
      const hasMapboxDistance = typeof distRemaining === 'number';
      const hasMapboxCompletionSignal =
        fraction >= SDK_COMPLETION_FRACTION_THRESHOLD &&
        hasMapboxDistance &&
        distRemaining <= SDK_COMPLETION_DISTANCE_THRESHOLD_M;
      const now = Date.now();

      if (hasMapboxCompletionSignal) {
        if (lastAtEndTimeRef.current === null) {
          lastAtEndTimeRef.current = now;
          logNav.info(
            'SDK_COMPLETION',
            `Mapbox completion signal detected (${(fraction * 100).toFixed(1)}%, ${Math.round(distRemaining || 0)}m). Starting 10s hold timer.`
          );
        }

        if (now - lastAtEndTimeRef.current >= 10000) {
          logNav.info(
            'SDK_COMPLETION',
            `✓ Completed by Mapbox route progress (${(fraction * 100).toFixed(1)}%, ${Math.round(distRemaining || 0)}m)`
          );
          handleComplete();
        }
      } else {
        if (lastAtEndTimeRef.current !== null) {
          logNav.info('SDK_COMPLETION', 'Mapbox completion signal dropped. Resetting hold timer.');
        }
        lastAtEndTimeRef.current = null;
      }
    }
  };

  if (!routeDto || routeCoords.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Card style={styles.loadingCard}>
          <Card.Content>
            <Text>Loading route...</Text>
          </Card.Content>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {showLocalMap && (
        <>
          {/* Background Map */}
          <MapboxGL.MapView
            style={styles.map}
            styleURL={mapStyleUrl}
            scaleBarEnabled={false}
            compassEnabled={false}
            scrollEnabled={navState === 'NAVIGATING' && cameraMode === 'FOLLOW' ? false : cameraMode === 'OVERVIEW'}  // All gestures disabled during FOLLOW
            zoomEnabled={navState === 'NAVIGATING' && cameraMode === 'FOLLOW' ? false : cameraMode === 'OVERVIEW'}
            pitchEnabled={navState === 'NAVIGATING' && cameraMode === 'FOLLOW' ? false : cameraMode === 'FOLLOW'}
            rotateEnabled={navState === 'NAVIGATING' && cameraMode === 'FOLLOW' ? false : true}  // Disable rotation during active navigation
          >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: routeCoords.length > 0 ? routeCoords[0] : [0, 0],
            zoomLevel: 14,
          }}
          // GOOGLE MAPS STYLE: Only use followUserLocation in compass mode
          // This keeps user as fixed point at bottom-center, map moves/rotates underneath
          // DISABLED when SDK is in control (ON_ROUTE) to prevent dual-map conflicts
          followUserLocation={false}
          // During navigation: don't set centerCoordinate (let followUserLocation handle it)
          // In overview: no followUserLocation, camera can be panned freely
          centerCoordinate={
            cameraMode === 'OVERVIEW' 
              ? undefined  // Allows free panning in overview
              : (navState === 'NAVIGATING' 
                  ? undefined  // Let followUserLocation manage it
                  : routeCoords.length > 0 ? routeCoords[0] : [0, 0])
          }
          heading={
            !sdkIsInControl &&
            cameraMode === 'FOLLOW' && 
            navState === 'NAVIGATING'
              ? undefined
              : 0
          }
          // IMPORTANT: Don't use followOffset - it doesn't pin the marker to screen
          // Instead: we'll render marker as fixed overlay (screen-space) below
          animationDuration={300}
          animationMode="easeTo"
        />

        {/* DO NOT show built-in UserLocation during navigation */}
        {/* It's world-space rendered, causes marker to appear moving */}
        {navState !== 'NAVIGATING' && (
          <MapboxGL.UserLocation 
            visible={true}
            renderMode={MapboxGL.UserLocationRenderMode.Normal}
            minDisplacement={1}
          />
        )}

        {/* Guidance path to start (TO_START phase only) - Green dots on road */}
        {!sdkIsInControl && userLocation && navState === 'NAVIGATING' && navPhase === 'TO_START' && (
          <MapboxGL.ShapeSource
            id="toStartSource"
            shape={
              matchedToStartRoute || {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [userLocation, routeCoords[0]],
                },
              }
            }
          >
            <MapboxGL.LineLayer
              id="toStartLine"
              style={{
                lineColor: '#00FF66',
                lineWidth: 10,
                lineDasharray: [0.5, 3],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Full route baseline for context */}
        <MapboxGL.ShapeSource
          id="routeBaseSource"
          shape={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeCoords,
            },
          }}
        >
            <MapboxGL.LineLayer
              id="routeBaseLine"
              style={{
                lineColor: '#3483FA',
                lineWidth: 16,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.55,
              }}
          />
        </MapboxGL.ShapeSource>

        {/* Remaining route overlay */}
        <MapboxGL.ShapeSource
          id="routeSource"
          shape={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: remainingRouteCoords,
            },
          }}
        >
          <MapboxGL.LineLayer
            id="routeOutline"
            style={{
              lineColor: remainingRouteColor,
              lineWidth: 16,
              lineDasharray:
                navState === 'NAVIGATING' &&
                navPhase === 'ON_ROUTE' &&
                distanceOffRoute > OFF_ROUTE_THRESHOLD_M
                  ? [1, 1.6]
                  : undefined,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </MapboxGL.ShapeSource>

        {/* ON_ROUTE uses stored routeCoords only - no Directions API geometry */}

        {/* Start and End markers */}
        <MapboxGL.PointAnnotation id="startPoint" coordinate={routeCoords[0]}>
          <View style={styles.startMarker}>
            <Text style={styles.markerText}>START</Text>
          </View>
        </MapboxGL.PointAnnotation>

        <MapboxGL.PointAnnotation id="endPoint" coordinate={routeCoords[routeCoords.length - 1]}>
          <View style={styles.endMarker}>
            <Text style={styles.markerText}>END</Text>
          </View>
        </MapboxGL.PointAnnotation>

        {/* Car marker at live GPS location (overview mode only) */}
        {!sdkIsInControl && navState === 'NAVIGATING' && visualUserLocation && cameraMode !== 'FOLLOW' && (
          <MapboxGL.PointAnnotation id="carMarker" coordinate={visualUserLocation}>
            <View style={styles.carMarkerOuter}>
              <View
                style={[
                  styles.carMarkerInner,
                  {
                    transform: [
                      {
                        rotate: `${userHeading}deg`,
                      },
                    ],
                  },
                ]}
              >
                <Svg width={18} height={22} viewBox="0 0 40 46">
                  <Path
                    d="M20 2 L35 38 Q36 40 34 41.2 L22.8 35.8 Q21.2 35 20 35 Q18.8 35 17.2 35.8 L6 41.2 Q4 40 5 38 Z"
                    fill="#FFFFFF"
                  />
                </Svg>
              </View>
            </View>
          </MapboxGL.PointAnnotation>
        )}

          </MapboxGL.MapView>

          {/* Fixed screen-space navigation puck (Google-style) */}
          {navState === 'NAVIGATING' && cameraMode === 'FOLLOW' && (
            <View pointerEvents="none" style={styles.followPuckOverlay}>
              <View style={styles.followPuckOuter}>
                <View style={styles.followPuckInner}>
                  <Svg width={38} height={44} viewBox="0 0 40 46">
                    <Path
                      d="M20 2 L35 38 Q36 40 34 41.2 L22.8 35.8 Q21.2 35 20 35 Q18.8 35 17.2 35.8 L6 41.2 Q4 40 5 38 Z"
                      fill="#FFFFFF"
                    />
                  </Svg>
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {/* Native Mapbox SDK - PREVIEW + TO_START + ON_ROUTE */}
      {shouldRenderSdkView && (
        <View
          style={[StyleSheet.absoluteFillObject, styles.sdkNavigationHost]}
          collapsable={false}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            const hasSize = width > 0 && height > 0;
            const now = Date.now();
            const key = `${Math.round(width)}x${Math.round(height)}`;
            if (
              key !== sdkLogStateRef.current.lastNativeLayoutKey ||
              now - sdkLogStateRef.current.lastNativeLayoutAt > 10000
            ) {
              sdkLogStateRef.current.lastNativeLayoutKey = key;
              sdkLogStateRef.current.lastNativeLayoutAt = now;
              logNav.info('SDK_NAVIGATION', `RN host layout: ${key}`);
            }
            if (!hasSize) {
              logNav.warn('SDK_NAVIGATION', 'RN host layout is zero-sized; native banner cannot render');
            }
          }}
        >
          <MapboxNavigationSdkView
            key={`sdk-${routeDto.id || 'route'}`}
            style={[StyleSheet.absoluteFillObject, styles.sdkNavigationView]}
            collapsable={false}
            accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
            styleURL={mapStyleUrl}
            navigationMode={navState === 'PREVIEW' ? 'PREVIEW' : navPhase || undefined}
            origin={resolvedSdkOrigin!}
            destination={resolvedSdkDestination!}
            destinationName={sdkDestinationName}
            routeCoordinates={
              navState === 'PREVIEW'
                ? routeCoords
                : navPhase === 'ON_ROUTE'
                  ? onRouteSdkCoordinates
                  : []
            }
            waypoints={navPhase === 'ON_ROUTE' && sdkWaypoints.length ? sdkWaypoints : []}
            shouldSimulateRoute={false}
            rerouteEnabled={false}
            isMuted={isMuted}
            onProgressChange={handleSDKProgress}
          />
        </View>
      )}

      {sdkIsInControl && navState === 'PREVIEW' && routeCoords.length > 1 && (
        <SafeAreaView style={styles.previewLegendContainer} pointerEvents="none">
          <View style={styles.previewLegendCard}>
            <View style={[styles.previewLegendDot, { backgroundColor: '#16C25C' }]} />
            <Text style={styles.previewLegendText}>START</Text>
            <View style={[styles.previewLegendDot, { backgroundColor: '#E53935' }]} />
            <Text style={styles.previewLegendText}>STOP</Text>
          </View>
        </SafeAreaView>
      )}

      {/* Compact Top HUD.
          Hide local stats while SDK is in control so native Mapbox UI is the source of truth. */}
      {!sdkIsInControl && (
        <SafeAreaView style={styles.topContainer} pointerEvents="box-none">
          <View style={styles.topHudStack}>
            <View
              style={[
                styles.routeNameBadge,
                {
                  backgroundColor:
                    navState === 'NAVIGATING' && navPhase === 'ON_ROUTE'
                      ? 'rgba(22, 194, 92, 0.92)'
                      : 'rgba(255, 184, 0, 0.92)',
                },
              ]}
            >
              <Text style={styles.routeNameBadgeText} numberOfLines={1}>
                {routeDto.name}
              </Text>
            </View>

            <View style={styles.topStatsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>Distance</Text>
                <Text style={styles.statChipValue}>
                  {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && distanceRemaining !== null
                    ? formatDistance(distanceRemaining)
                    : mapboxRouteMetrics?.distanceM
                      ? formatDistance(mapboxRouteMetrics.distanceM)
                      : '--'}
                </Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>ETA</Text>
                <Text style={styles.statChipValue}>
                  {etaSeconds !== null
                    ? formatDuration(etaSeconds)
                    : mapboxRouteMetrics?.durationS
                      ? formatDuration(mapboxRouteMetrics.durationS)
                      : '--'}
                </Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>Elapsed</Text>
                <Text style={styles.statChipValue}>
                  {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE'
                    ? formatDuration(elapsed)
                    : '--'}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* Compact auto-dismiss status prompt (no tap required while driving) */}
      {transientNotice && (
        <SafeAreaView style={styles.noticeContainer} pointerEvents="none">
          <View
            style={[
              styles.noticeCard,
              transientNotice.tone === 'success' ? styles.noticeCardSuccess : styles.noticeCardInfo,
            ]}
          >
            <Text style={styles.noticeTitle}>{transientNotice.title}</Text>
            <Text style={styles.noticeText}>{transientNotice.message}</Text>
          </View>
        </SafeAreaView>
      )}

      {/* Left vertical dock (custom UI only when SDK is not in control). */}
      {navState === 'NAVIGATING' && !sdkIsInControl && (
        <SafeAreaView style={styles.leftVerticalDockSafeArea} pointerEvents="box-none">
          <View style={styles.leftVerticalDock}>
            <View style={styles.leftProgressRail}>
              {navPhase === 'ON_ROUTE' ? (
                <>
                  <Text style={styles.leftProgressPercent}>{routeProgress.percent}%</Text>
                  <View style={styles.leftProgressTrack}>
                    <View
                      style={[
                        styles.leftProgressFill,
                        { height: `${Math.max(4, Math.min(100, routeProgress.percent))}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.leftProgressMeta}>
                    {distanceRemaining !== null ? formatDistance(distanceRemaining) : '--'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.leftProgressPercent}>--</Text>
                  <View style={styles.leftProgressTrack} />
                  <Text style={styles.leftProgressMeta}>--</Text>
                </>
              )}
            </View>

            <View style={styles.leftControlStack}>
              <IconButton
                icon="compass-outline"
                iconColor="white"
                size={22}
                style={[
                  styles.leftControlButton,
                  isNorthLocked ? styles.leftControlButtonActive : null,
                ]}
                onPress={handleCompassReset}
              />
              <IconButton
                icon={cameraMode === 'FOLLOW' ? 'layers-outline' : 'crosshairs-gps'}
                iconColor="white"
                size={22}
                style={styles.leftControlButton}
                onPress={toggleCamera}
              />
              <IconButton
                icon={isMuted ? 'volume-mute' : 'volume-high'}
                iconColor="white"
                size={22}
                style={styles.leftControlButton}
                onPress={() => setIsMuted(!isMuted)}
              />
              <IconButton
                icon="flag-checkered"
                iconColor={navPhase === 'ON_ROUTE' ? 'white' : 'rgba(255, 255, 255, 0.7)'}
                size={22}
                style={[
                  styles.leftControlButton,
                  styles.leftFinishButton,
                  navPhase !== 'ON_ROUTE' ? styles.leftControlButtonDisabled : null,
                ]}
                disabled={navPhase !== 'ON_ROUTE'}
                onPress={handleComplete}
              />
            </View>

            <View style={styles.speedometerCard}>
              <Text style={styles.speedometerValue}>
                {userSpeedMps !== null && !Number.isNaN(userSpeedMps)
                  ? Math.max(0, Math.round(userSpeedMps * 2.236936))
                  : '--'}
              </Text>
              <Text style={styles.speedometerUnit}>mph</Text>
              <Text style={styles.speedometerLimit}>Limit --</Text>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* SDK mode ON_ROUTE: keep only the left progress rail overlay. */}
      {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && sdkIsInControl && (
        <SafeAreaView style={styles.sdkProgressOverlaySafeArea} pointerEvents="none">
          <View style={styles.sdkProgressRail}>
            <Text style={styles.leftProgressPercent}>{routeProgress.percent}%</Text>
            <View style={[styles.leftProgressTrack, styles.sdkProgressTrack]}>
              <View
                style={[
                  styles.leftProgressFill,
                  { height: `${Math.max(4, Math.min(100, routeProgress.percent))}%` },
                ]}
              />
            </View>
            <Text style={styles.leftProgressMeta}>
              {distanceRemaining !== null ? formatDistance(distanceRemaining) : '--'}
            </Text>
          </View>
        </SafeAreaView>
      )}

      {navState === 'NAVIGATING' && sdkIsInControl && !nativeBottomBannerAvailable && (
        <SafeAreaView style={styles.sdkBottomBannerSafeArea} pointerEvents="none">
          <View style={styles.sdkBottomBanner}>
            <View style={styles.sdkBottomBannerItem}>
              <Text style={styles.sdkBottomBannerLabel}>
                {navPhase === 'TO_START' ? 'To Start' : 'On Route'}
              </Text>
              <Text style={styles.sdkBottomBannerValue}>
                {distanceRemaining !== null ? formatDistance(distanceRemaining) : '--'}
              </Text>
            </View>
            <View style={styles.sdkBottomBannerDivider} />
            <View style={styles.sdkBottomBannerItem}>
              <Text style={styles.sdkBottomBannerLabel}>ETA</Text>
              <Text style={styles.sdkBottomBannerValue}>
                {etaSeconds !== null ? formatDuration(etaSeconds) : '--'}
              </Text>
            </View>
            <View style={styles.sdkBottomBannerDivider} />
            <View style={styles.sdkBottomBannerItem}>
              <Text style={styles.sdkBottomBannerLabel}>Elapsed</Text>
              <Text style={styles.sdkBottomBannerValue}>{formatDuration(elapsed)}</Text>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* Instruction Banner (fallback overlay). */}
      {navState === 'NAVIGATING' &&
        (navPhase === 'TO_START' || navPhase === 'ON_ROUTE') &&
        !nativeTopBannerAvailable &&
        currentInstruction &&
        (
          <View style={styles.instructionBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              {/* Visual direction icon */}
              <View style={{ marginRight: spacing(1.5) }}>
                {currentInstruction.roundaboutExit ? (
                  <View style={styles.roundaboutIcon}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFB800' }}>
                      {currentInstruction.roundaboutExit}
                    </Text>
                  </View>
                ) : (
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#FFB800',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 24 }}>
                      {currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'left' ? '↰' :
                       currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'right' ? '↱' :
                       currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'sharp left' ? '⬅️' :
                       currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'sharp right' ? '➡️' :
                       currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'slight left' ? '↖️' :
                       currentInstruction.maneuverType === 'turn' && currentInstruction.maneuverModifier === 'slight right' ? '↗️' :
                       currentInstruction.maneuverModifier === 'straight' ? '⬆️' :
                       currentInstruction.maneuverModifier === 'uturn' ? '↩️' :
                       currentInstruction.maneuverType === 'arrive' ? '🏁' :
                       currentInstruction.maneuverType === 'depart' ? '▶️' :
                       '⬆️'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Instruction text */}
              <View style={{ flex: 1 }}>
                <Text style={styles.instructionMain}>
                  {currentInstruction.text}
                </Text>
                {currentInstruction.secondary && (
                  <Text style={styles.instructionSecondary}>
                    {currentInstruction.secondary}
                  </Text>
                )}
              </View>
            </View>

            {/* Distance badge */}
            <Text style={styles.instructionDistance}>
              {formatDistance(currentInstruction.distanceM)}
            </Text>
          </View>
        )}

      {/* Bottom Controls */}
      <SafeAreaView style={styles.bottomContainer}>
        {(navState === 'PREVIEW' || navState === 'COMPLETED') && (
          <View style={styles.controls}>
            {navState === 'PREVIEW' && (
              <Button
                mode="contained"
                onPress={handleStart}
                disabled={!userLocation || (SDK_ONLY_NAVIGATION_MODE && !mapboxNavSdkAvailable)}
                loading={!userLocation}
                style={[styles.button, styles.primaryPill]}
                labelStyle={{ fontSize: 15, fontWeight: '700' }}
              >
                {!userLocation
                  ? 'Acquiring GPS...'
                  : SDK_ONLY_NAVIGATION_MODE && !mapboxNavSdkAvailable
                    ? 'Mapbox SDK Unavailable'
                    : 'Start Navigation'}
              </Button>
            )}

            {navState === 'COMPLETED' && (
              <Button
                mode="contained"
                onPress={handleBackPress}
                style={[styles.button, styles.primaryPill]}
                labelStyle={{ fontSize: 15, fontWeight: '700' }}
              >
                Done
              </Button>
            )}
          </View>
        )}

        <IconButton
          icon="close"
          size={28}
          onPress={handleBackPress}
          style={styles.closeButton}
          iconColor="white"
        />
      </SafeAreaView>
    </View>
  );
};

const SPACING_SM = spacing(2);
const SPACING_MD = spacing(3);
const WINDOW = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sdkNavigationView: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: Math.max(WINDOW.width, 1),
    minHeight: Math.max(WINDOW.height, 1),
  },
  sdkNavigationHost: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: Math.max(WINDOW.width, 1),
    minHeight: Math.max(WINDOW.height, 1),
  },
  map: {
    flex: 1,
  },
  topContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  noticeContainer: {
    position: 'absolute',
    left: SPACING_SM,
    right: SPACING_SM,
    top: spacing(24),
    zIndex: 16,
    alignItems: 'center',
  },
  previewLegendContainer: {
    position: 'absolute',
    left: SPACING_SM,
    right: SPACING_SM,
    bottom: spacing(12),
    zIndex: 14,
    alignItems: 'center',
  },
  previewLegendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.6),
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing(1.3),
    paddingVertical: spacing(0.55),
  },
  previewLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  previewLegendText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    marginRight: spacing(0.65),
  },
  noticeCard: {
    maxWidth: 380,
    width: '92%',
    borderRadius: 14,
    paddingVertical: spacing(1.1),
    paddingHorizontal: spacing(1.5),
    borderWidth: 1,
  },
  noticeCardSuccess: {
    backgroundColor: 'rgba(16, 128, 76, 0.9)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  noticeCardInfo: {
    backgroundColor: 'rgba(22, 28, 39, 0.9)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  noticeTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  noticeText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  topHudStack: {
    paddingHorizontal: SPACING_SM,
    paddingTop: spacing(0.5),
    gap: spacing(0.75),
  },
  topHudWithSdkBanner: {
    marginTop: spacing(8),
  },
  routeNameBadge: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingVertical: spacing(0.6),
    paddingHorizontal: spacing(1.25),
    maxWidth: '88%',
  },
  routeNameBadgeText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  topStatsRow: {
    flexDirection: 'row',
    gap: spacing(0.75),
  },
  statChip: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(1),
  },
  statChipLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 1,
  },
  statChipValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  loadingCard: {
    margin: SPACING_MD,
    borderRadius: 16,
    elevation: 2,
  },
  instructionBanner: {
    position: 'absolute',
    top: spacing(2.5),
    left: SPACING_SM,
    right: SPACING_SM,
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    paddingVertical: spacing(1.5),
    paddingHorizontal: SPACING_SM,
    elevation: 8,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    minHeight: 56,
  },
  instructionMain: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    flex: 1,
  },
  instructionSecondary: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 3,
  },
  instructionDistance: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB800',
    marginLeft: spacing(1.5),
    backgroundColor: 'rgba(255, 184, 0, 0.2)',
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(1.5),
    borderRadius: 8,
  },
  roundaboutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FFB800',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  controls: {
    flexDirection: 'row',
    gap: SPACING_SM,
    paddingHorizontal: SPACING_SM,
    paddingBottom: spacing(1.25),
    paddingTop: spacing(0.5),
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 3,
  },
  controlContent: {
    height: 46,
    paddingHorizontal: spacing(0.75),
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
  },
  overviewPill: {
    minWidth: 128,
    backgroundColor: 'rgba(22, 28, 39, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
  },
  finishPill: {
    minWidth: 168,
    backgroundColor: '#16C25C',
  },
  primaryPill: {
    flex: 1,
    backgroundColor: '#16C25C',
  },
  controlIconButton: {
    width: 46,
    height: 46,
    margin: 0,
    borderRadius: 23,
    backgroundColor: 'rgba(22, 28, 39, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
  },
  closeButton: {
    position: 'absolute',
    right: SPACING_SM,
    bottom: spacing(4),
    backgroundColor: 'rgba(22, 28, 39, 0.82)',
    borderRadius: 24,
    elevation: 6,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  leftVerticalDockSafeArea: {
    position: 'absolute',
    left: spacing(0.85),
    top: 0,
    bottom: 0,
    zIndex: 12,
  },
  leftVerticalDock: {
    flex: 1,
    width: 84,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing(23),
    paddingBottom: spacing(8.5),
  },
  leftProgressRail: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing(0.6),
  },
  sdkProgressOverlaySafeArea: {
    position: 'absolute',
    left: spacing(1),
    top: 0,
    zIndex: 13,
  },
  sdkBottomBannerSafeArea: {
    position: 'absolute',
    left: spacing(2),
    right: spacing(2),
    bottom: spacing(1.5),
    zIndex: 13,
  },
  sdkBottomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingVertical: spacing(1.1),
    paddingHorizontal: spacing(1.4),
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  sdkBottomBannerItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  sdkBottomBannerLabel: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  sdkBottomBannerValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sdkBottomBannerDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing(0.8),
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  sdkProgressRail: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing(0.6),
    paddingTop: spacing(9),
    width: 46,
  },
  sdkProgressTrack: {
    height: 190,
  },
  leftProgressPercent: {
    color: '#16C25C',
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderRadius: 10,
    paddingHorizontal: spacing(0.75),
    paddingVertical: spacing(0.25),
  },
  leftProgressTrack: {
    width: 14,
    height: 270,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  leftProgressFill: {
    width: '100%',
    backgroundColor: '#16C25C',
    borderRadius: 999,
  },
  leftProgressMeta: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderRadius: 10,
    paddingHorizontal: spacing(0.75),
    paddingVertical: spacing(0.25),
  },
  leftControlStack: {
    width: '100%',
    alignItems: 'center',
    gap: spacing(0.85),
  },
  leftControlButton: {
    width: 46,
    height: 46,
    margin: 0,
    borderRadius: 23,
    backgroundColor: 'rgba(22, 28, 39, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  leftControlButtonActive: {
    borderColor: '#2F80F7',
    backgroundColor: 'rgba(47, 128, 247, 0.28)',
  },
  leftControlButtonDisabled: {
    opacity: 0.6,
  },
  leftFinishButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  speedometerCard: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  speedometerValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  speedometerUnit: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: -1,
    textTransform: 'uppercase',
  },
  speedometerLimit: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  startMarker: {
    backgroundColor: colors.success,
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(1),
    borderRadius: 6,
  },
  endMarker: {
    backgroundColor: colors.error,
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(1),
    borderRadius: 6,
  },
  markerText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  carMarkerOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52, 131, 250, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3483FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followPuckOverlay: {
    position: 'absolute',
    left: '50%',
    marginLeft: -42,
    bottom: '25%',
    zIndex: 14,
  },
  followPuckOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(52, 131, 250, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followPuckInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2F80F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
});

export default PracticeScreen;
