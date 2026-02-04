import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View, Dimensions, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, IconButton, Text } from 'react-native-paper';
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
  isMapboxNavSdkAvailable,
  MapboxNavSdkEvent 
} from '../../components/MapboxNavigationSdkView';
import { calculateDistance } from '../../utils/mapbox';
import { getDirections, NavStep } from '../../lib/mapboxNavigation';

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

const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}min`;
};

const formatSpeedKmh = (speedMps: number | null): string => {
  if (speedMps === null || Number.isNaN(speedMps)) return '--';
  const speed = Math.max(0, speedMps);
  return `${Math.round(speed * 3.6)} km/h`;
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

const sampleWaypoints = (coords: MapCoord[], maxCount: number): MapCoord[] => {
  if (coords.length <= maxCount) return coords;
  const step = Math.ceil(coords.length / maxCount);
  const sampled: MapCoord[] = [];
  for (let i = 0; i < coords.length && sampled.length < maxCount; i += step) {
    sampled.push(coords[i]);
  }
  return sampled;
};

const ARRIVAL_THRESHOLD_M = 40;
const OFF_ROUTE_THRESHOLD_M = 100;

const PracticeScreen: React.FC<Props> = ({ route: routeNav, navigation }) => {
  const colorScheme = useColorScheme();
  const initialRoute = routeNav?.params?.route as RouteDto | undefined;

  const [routeDto, setRouteDto] = useState<RouteDto | undefined>(initialRoute);
  const [navState, setNavState] = useState<NavigationState>('PREVIEW');
  const [navPhase, setNavPhase] = useState<NavigationPhase | null>(null);
  const [userLocation, setUserLocation] = useState<MapCoord | null>(null);
  const [userHeading, setUserHeading] = useState<number>(0);
  const [userSpeedMps, setUserSpeedMps] = useState<number | null>(null);
  const [cameraMode, setCameraMode] = useState<'FOLLOW' | 'OVERVIEW'>('OVERVIEW');
  const [elapsed, setElapsed] = useState(0);
  const [navLineCoords, setNavLineCoords] = useState<MapCoord[]>([]);
  const [fallbackSteps, setFallbackSteps] = useState<NavStep[]>([]);
  const [currentInstruction, setCurrentInstruction] = useState<NavInstruction | null>(null);
  const [distanceOffRoute, setDistanceOffRoute] = useState<number>(0);
  const [completedCoords, setCompletedCoords] = useState<MapCoord[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [distanceRemaining, setDistanceRemaining] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const offRouteAlertRef = useRef<boolean>(false);
  const lastSpokenStepRef = useRef<number | null>(null);
  const spokenInstructionsRef = useRef<Set<string>>(new Set());
  const lastSpeechTimeRef = useRef<number>(0);

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

  // Location tracking
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for navigation');
        return;
      }

      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,  // Update every 5 meters
          timeInterval: 500,    // Update every 500ms (not 1000)
        },
        (loc: Location.LocationObject) => {
          setUserLocation([loc.coords.longitude, loc.coords.latitude]);
          if (loc.coords.heading !== null) {
            setUserHeading(loc.coords.heading);
          }
          if (typeof loc.coords.speed === 'number') {
            setUserSpeedMps(loc.coords.speed);
          }
        },
      );
    })();

    return () => {
      locationWatchRef.current?.remove();
    };
  }, []);

  // Reset speech state when phase changes
  useEffect(() => {
    spokenInstructionsRef.current.clear();
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

  const sdkWaypoints = useMemo<MapCoord[]>(() => {
    // TO_START phase: navigate user to route start, then we'll follow the whole route
    if (navPhase === 'TO_START') {
      return []; // No waypoints for TO_START, just destination (route start)
    }

    // ON_ROUTE phase: sample from current position onwards
    if (!userLocation || navState !== 'NAVIGATING' || navPhase !== 'ON_ROUTE' || routeCoords.length < 2) {
      return [];
    }

    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const dist =
        calculateDistance(userLocation[0], userLocation[1], routeCoords[i][0], routeCoords[i][1]) * 1000;
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    // Return remaining waypoints after current position
    const remaining = routeCoords.slice(closestIndex + 1);
    return sampleWaypoints(remaining, 23);
  }, [navPhase, navState, routeCoords, userLocation]);

  // Arrival detection at start point
  useEffect(() => {
    if (!userLocation || navState !== 'NAVIGATING' || navPhase !== 'TO_START' || routeCoords.length === 0) {
      return;
    }

    const start = routeCoords[0];
    const distanceM = calculateDistance(userLocation[0], userLocation[1], start[0], start[1]) * 1000;

    if (distanceM <= ARRIVAL_THRESHOLD_M) {
      setNavPhase('ON_ROUTE');
      startTimeRef.current = Date.now();
      setElapsed(0);
      setCameraMode('FOLLOW');
      setCompletedCoords([]);
      lastSpokenStepRef.current = null;
      offRouteAlertRef.current = false;

      if (routeDto?.id) {
        apiRoutes.startPractice(routeDto.id).catch((err: unknown) => console.warn(err));
      }

      Alert.alert(
        'Route Started! 🎉',
        'You have reached the start point. Your test route has started.',
        [{ text: 'OK', onPress: () => {} }]
      );
    }
  }, [navPhase, navState, routeCoords, routeDto?.id, userLocation]);

  // Track completed route portion and detect arrival at end
  useEffect(() => {
    if (navState !== 'NAVIGATING' || navPhase !== 'ON_ROUTE' || !userLocation || routeCoords.length === 0) {
      return;
    }

    // Find closest point on route to user
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const dist = calculateDistance(
        userLocation[0],
        userLocation[1],
        routeCoords[i][0],
        routeCoords[i][1]
      ) * 1000;

      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    // Mark portion of route from start to current position as completed
    setCompletedCoords(routeCoords.slice(0, closestIndex + 1));

    // Check if user has reached the END of the route (last 5% of route coords)
    const routeLength = routeCoords.length;
    const finalSegmentStart = Math.floor(routeLength * 0.95);
    const isNearEnd = closestIndex >= finalSegmentStart;
    const endPoint = routeCoords[routeLength - 1];
    const distToEnd = calculateDistance(userLocation[0], userLocation[1], endPoint[0], endPoint[1]) * 1000;

    if (isNearEnd && distToEnd <= ARRIVAL_THRESHOLD_M && navState === 'NAVIGATING' && navPhase === 'ON_ROUTE') {
      handleComplete();
      return;
    }

    // Check if off-route
    if (minDistance > OFF_ROUTE_THRESHOLD_M && !offRouteAlertRef.current) {
      offRouteAlertRef.current = true;
      Alert.alert(
        'You\'re Off Route!',
        `${Math.round(minDistance)}m away from the route. Please get back on track.`,
        [{ text: 'OK', onPress: () => { offRouteAlertRef.current = false; } }]
      );
    } else if (minDistance <= OFF_ROUTE_THRESHOLD_M) {
      offRouteAlertRef.current = false;
    }

    setDistanceOffRoute(minDistance);
  }, [navState, navPhase, userLocation, routeCoords]);

  useEffect(() => {
    // Fallback navigation always needed during TO_START (to guide user to start with instructions)
    // During ON_ROUTE with SDK available: skip fallback, use SDK
    // During ON_ROUTE without SDK: use fallback
    const shouldUseFallback = navState === 'NAVIGATING' && (navPhase === 'TO_START' || !isMapboxNavSdkAvailable);

    if (!shouldUseFallback || !userLocation || !navDestination) {
      setNavLineCoords([]);
      setFallbackSteps([]);
      return;
    }

    const buildFallbackNav = async () => {
      const start: LatLng = { latitude: userLocation[1], longitude: userLocation[0] };
      const end: LatLng = { latitude: navDestination[1], longitude: navDestination[0] };
      const res = await getDirections(start, end, [], { language: 'en', voiceUnits: 'metric' });
      if (!res?.coords?.length) {
        setNavLineCoords([]);
        setFallbackSteps([]);
        return;
      }
      setNavLineCoords(res.coords.map((c) => [c.longitude, c.latitude] as MapCoord));
      setFallbackSteps(res.steps || []);
      lastSpokenStepRef.current = null;
    };

    buildFallbackNav().catch((err: unknown) => console.warn('Failed to build nav route', err));
  }, [navDestination, navState, navPhase, userLocation, isMapboxNavSdkAvailable]);

  useEffect(() => {
    if (
      navState !== 'NAVIGATING' ||
      navPhase !== 'ON_ROUTE' ||
      !userLocation ||
      isMapboxNavSdkAvailable ||
      fallbackSteps.length === 0
    ) {
      return;
    }

    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < fallbackSteps.length; i++) {
      const step = fallbackSteps[i];
      const dist =
        calculateDistance(
          userLocation[0],
          userLocation[1],
          step.location.longitude,
          step.location.latitude,
        ) * 1000;
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    const activeStep = fallbackSteps[closestIndex];
    if (activeStep) {
      setCurrentInstruction({
        text: activeStep.instruction,
        distanceM: minDistance,
        maneuverType: activeStep.maneuverType,
        maneuverModifier: activeStep.maneuverModifier,
        roundaboutExit: activeStep.roundaboutExit,
      });

      // Only speak once per instruction, with cooldown and distance threshold
      const now = Date.now();
      const timeSinceLastSpeech = now - lastSpeechTimeRef.current;
      const instruction = activeStep.voiceInstructions?.[0]?.announcement || activeStep.instruction;
      const instructionKey = `${closestIndex}-${instruction}`;

      // Speak if: not muted, user is close (80m), new instruction, and 3+ seconds since last speech
      const shouldSpeak =
        !isMuted &&
        minDistance <= 80 &&
        !spokenInstructionsRef.current.has(instructionKey) &&
        timeSinceLastSpeech >= 3000;

      if (shouldSpeak && instruction) {
        Speech.speak(instruction, { rate: 0.95 });
        spokenInstructionsRef.current.add(instructionKey);
        lastSpeechTimeRef.current = now;
        lastSpokenStepRef.current = closestIndex;
      }
    }
  }, [fallbackSteps, isMapboxNavSdkAvailable, isMuted, navPhase, navState, userLocation]);

  // Handle SDK progress events
  const handleSDKProgress = (event: MapboxNavSdkEvent) => {
    const { nativeEvent } = event;

    // Update instruction
    const fallbackText = buildManeuverInstruction(
      nativeEvent.maneuverType,
      nativeEvent.maneuverModifier,
      nativeEvent.roundaboutExit,
    );

    if (nativeEvent.instruction || fallbackText) {
      setCurrentInstruction({
        text: nativeEvent.instruction || fallbackText || 'Continue',
        secondary: nativeEvent.instructionSecondary,
        distanceM: nativeEvent.distanceToInstruction ?? 0,
        maneuverType: nativeEvent.maneuverType,
        maneuverModifier: nativeEvent.maneuverModifier,
        roundaboutExit: nativeEvent.roundaboutExit,
      });

      // Handle speech deduplication (SDK automatically speaks, but prevent double speech)
      const now = Date.now();
      const instruction = nativeEvent.instruction || fallbackText;
      const instructionKey = `sdk-${instruction}`;

      // If SDK has voice enabled and we haven't spoken this instruction recently, track it
      if (instruction && !spokenInstructionsRef.current.has(instructionKey)) {
        spokenInstructionsRef.current.add(instructionKey);
        lastSpeechTimeRef.current = now;
      }
    }

    setDistanceRemaining(nativeEvent.distanceRemaining);
  };

  const handleStart = () => {
    if (!userLocation) {
      Alert.alert('No Location', 'Waiting for GPS signal...');
      return;
    }

    startTimeRef.current = null;
    setElapsed(0);
    setNavState('NAVIGATING');
    setNavPhase('TO_START');  // First navigate to start point
    setCameraMode('FOLLOW');
    setCompletedCoords([]);
    offRouteAlertRef.current = false;
    lastSpokenStepRef.current = null;
  };

  const handleComplete = async () => {
    setNavState('COMPLETED');
    setNavPhase(null);

    const durationS = elapsed;
    const completed = true;

    if (routeDto?.id) {
      try {
        await apiRoutes.finishPractice(routeDto.id, {
          completed,
          distanceM: routeDto.distanceM,
          durationS,
        });

        await upsertRouteStat(routeDto.id, {
          timesCompleted: 1,
          lastCompletedAt: Date.now(),
        });
      } catch (err) {
        console.error('Failed to save practice:', err);
      }
    }

    Alert.alert(
      'Route Completed!',
      `Time: ${formatDuration(durationS)}\nDistance: ${formatDistance(routeDto?.distanceM || 0)}`,
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  const toggleCamera = () => {
    setCameraMode((prev) => (prev === 'FOLLOW' ? 'OVERVIEW' : 'FOLLOW'));
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
      {/* Background Map */}
      <MapboxGL.MapView
        style={styles.map}
        styleURL={mapStyleUrl}
      >
        <MapboxGL.Camera
          defaultSettings={{
            centerCoordinate: routeCoords[0],
            zoomLevel: 14,
          }}
          centerCoordinate={
            cameraMode === 'FOLLOW' && navState === 'NAVIGATING' && userLocation
              ? userLocation
              : routeCoords[0]
          }
          followUserLocation={cameraMode === 'FOLLOW' && navState === 'NAVIGATING'}
          followZoomLevel={16}
          followHeading={cameraMode === 'FOLLOW' && navState === 'NAVIGATING' ? userHeading : 0}
          animationDuration={1000}
        />

        <MapboxGL.UserLocation visible />

        {/* Guidance path to start (TO_START phase only) */}
        {userLocation && navState === 'NAVIGATING' && navPhase === 'TO_START' && (
          <MapboxGL.ShapeSource
            id="toStartSource"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [userLocation, routeCoords[0]],
              },
            }}
          >
            <MapboxGL.LineLayer
              id="toStartLine"
              style={{
                lineColor: '#00cc44',
                lineWidth: 8,
                lineDasharray: [2, 4],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Completed route portion (grey) */}
        {completedCoords.length > 1 && (
          <MapboxGL.ShapeSource
            id="completedRouteSource"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: completedCoords,
              },
            }}
          >
            <MapboxGL.LineLayer
              id="completedRouteLine"
              style={{
                lineColor: '#999999',
                lineWidth: 14,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Full route outline (for contrast) */}
        <MapboxGL.ShapeSource
          id="routeSource"
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
            id="routeOutline"
            style={{
              lineColor: navState === 'NAVIGATING' ? '#0b6cfb' : '#666666',
              lineWidth: 14,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </MapboxGL.ShapeSource>

        {/* Fallback navigation route (for non-SDK devices) */}
        {navLineCoords.length > 0 && (
          <MapboxGL.ShapeSource
            id="navRouteSource"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: navLineCoords,
              },
            }}
          >
            <MapboxGL.LineLayer
              id="navRouteLine"
              style={{
                lineColor: colors.secondary,
                lineWidth: 12,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

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

        {/* User location marker - single marker that updates position */}
        {userLocation && navState !== 'COMPLETED' && (
          <MapboxGL.PointAnnotation id="userLocation" coordinate={userLocation}>
            <View style={styles.userMarker} />
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* Native Mapbox SDK - Full screen navigation with auto-follow, voice, banners, etc */}
      {navState === 'NAVIGATING' && userLocation && navDestination && isMapboxNavSdkAvailable && (
        <MapboxNavigationSdkView
          key={`${navPhase}-${routeDto.id || 'route'}`}
          style={StyleSheet.absoluteFill}
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
          origin={userLocation}
          destination={navDestination}
          waypoints={sdkWaypoints.length && navPhase === 'ON_ROUTE' ? sdkWaypoints : undefined}
          shouldSimulateRoute={false}
          rerouteEnabled={true}
          isMuted={isMuted}
          onProgressChange={handleSDKProgress}
        />
      )}

      {/* Top Info Card */}
      <SafeAreaView style={styles.topContainer}>
        <Card style={styles.infoCard}>
          <Card.Content style={{ paddingVertical: spacing(2), paddingHorizontal: spacing(2.5) }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.text,
                marginBottom: spacing(0.5),
              }}
            >
              {routeDto.name}
            </Text>

            {/* Route stats */}
            <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(1) }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                  Distance
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                  {formatDistance(routeDto.distanceM)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                  Est. Time
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                  {formatDuration(routeDto.durationEstS)}
                </Text>
              </View>
            </View>

            {/* Navigation status */}
            {navState === 'NAVIGATING' && navPhase === 'TO_START' && userLocation && routeCoords.length > 0 && (
              <View
                style={{
                  marginTop: spacing(1),
                  paddingTop: spacing(1),
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.warning }}>
                  📍 Navigating to start point
                </Text>
                <View style={{ marginTop: spacing(0.5) }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Distance to start: {formatDistance(
                      calculateDistance(userLocation[0], userLocation[1], routeCoords[0][0], routeCoords[0][1]) * 1000
                    )}
                  </Text>
                </View>
              </View>
            )}

            {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && (
              <View
                style={{
                  marginTop: spacing(1),
                  paddingTop: spacing(1),
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.success }}>
                  ✓ Test route started
                </Text>
              </View>
            )}

            {/* Elapsed time */}
            {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && (
              <View style={styles.progressContainer}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Elapsed
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                    {formatDuration(elapsed)}
                  </Text>
                </View>
              </View>
            )}

            {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && (
              <View style={styles.progressContainer}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Speed
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                    {formatSpeedKmh(userSpeedMps)}
                  </Text>
                </View>
              </View>
            )}

            {/* Distance remaining (from SDK) */}
            {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && distanceRemaining !== null && (
              <View style={styles.progressContainer}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    Remaining
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                    {formatDistance(distanceRemaining)}
                  </Text>
                </View>
              </View>
            )}

            {/* Off-route warning */}
            {distanceOffRoute > OFF_ROUTE_THRESHOLD_M && (
              <View
                style={{
                  marginTop: spacing(1),
                  paddingTop: spacing(1),
                  borderTopColor: colors.error,
                  borderTopWidth: 1,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.error }}>
                  ⚠️ Off route: {Math.round(distanceOffRoute)}m away
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      </SafeAreaView>

      {/* Instruction Banner (from SDK or fallback) - Compact Toast-style with visual icons */}
      {navState === 'NAVIGATING' &&
        (navPhase === 'TO_START' || navPhase === 'ON_ROUTE') &&
        currentInstruction && (
          <View style={styles.instructionBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              {/* Visual direction icon */}
              <View style={{ marginRight: spacing(1) }}>
                {currentInstruction.roundaboutExit && (
                  <View style={styles.roundaboutIcon}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.primary }}>
                      {currentInstruction.roundaboutExit}
                    </Text>
                  </View>
                )}
                {!currentInstruction.roundaboutExit && currentInstruction.maneuverModifier && (
                  <Text style={{ fontSize: 20 }}>
                    {currentInstruction.maneuverModifier === 'left'
                      ? '↙️'
                      : currentInstruction.maneuverModifier === 'right'
                        ? '↘️'
                        : currentInstruction.maneuverModifier === 'straight'
                          ? '⬆️'
                          : currentInstruction.maneuverModifier === 'uturn'
                            ? '↩️'
                            : '➡️'}
                  </Text>
                )}
                {!currentInstruction.roundaboutExit && !currentInstruction.maneuverModifier && (
                  <Text style={{ fontSize: 20 }}>➡️</Text>
                )}
              </View>

              {/* Instruction text */}
              <Text style={[styles.instructionMain, { flex: 1 }]}>
                {currentInstruction.text}
              </Text>
            </View>

            {/* Distance badge */}
            <Text style={styles.instructionDistance}>
              {formatDistance(currentInstruction.distanceM)}
            </Text>
          </View>
        )}

      {/* Bottom Controls */}
      <SafeAreaView style={styles.bottomContainer}>
        <View style={styles.controls}>
          {navState === 'PREVIEW' && (
            <Button
              mode="contained"
              onPress={handleStart}
              disabled={!userLocation}
              style={styles.button}
              labelStyle={{ fontSize: 15, fontWeight: '700' }}
            >
              Start Navigation
            </Button>
          )}

          {navState === 'NAVIGATING' && (navPhase === 'TO_START' || navPhase === 'ON_ROUTE') && (
            <>
              <Button
                mode="outlined"
                onPress={toggleCamera}
                style={[styles.button, { flex: 0.5 }]}
                labelStyle={{ fontSize: 13, fontWeight: '700' }}
              >
                {cameraMode === 'FOLLOW' ? '📍 Overview' : '👁️ Follow'}
              </Button>

              <IconButton
                icon={isMuted ? 'volume-mute' : 'volume-high'}
                iconColor={colors.primary}
                size={24}
                style={[styles.button, { flex: 0.3 }]}
                onPress={() => setIsMuted(!isMuted)}
              />

              {navPhase === 'ON_ROUTE' && (
                <Button
                  mode="contained"
                  onPress={handleComplete}
                  style={[styles.button, { flex: 1 }]}
                  labelStyle={{ fontSize: 15, fontWeight: '700' }}
                >
                  Finish Route
                </Button>
              )}
            </>
          )}

          {navState === 'COMPLETED' && (
            <Button
              mode="contained"
              onPress={() => navigation.goBack()}
              style={styles.button}
              labelStyle={{ fontSize: 15, fontWeight: '700' }}
            >
              Done
            </Button>
          )}
        </View>

        <IconButton
          icon="close"
          size={28}
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
          iconColor={colors.text}
        />
      </SafeAreaView>
    </View>
  );
};

const SPACING_XS = spacing(1);
const SPACING_SM = spacing(2);
const SPACING_MD = spacing(3);

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  infoCard: {
    margin: SPACING_MD,
    borderRadius: 16,
    elevation: 4,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  loadingCard: {
    margin: SPACING_MD,
    borderRadius: 16,
    elevation: 2,
  },
  progressContainer: {
    marginTop: SPACING_SM,
    gap: SPACING_XS,
    paddingTop: SPACING_SM,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  instructionBanner: {
    position: 'absolute',
    top: spacing(8),
    left: SPACING_SM,
    right: SPACING_SM,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing(1),
    paddingHorizontal: SPACING_SM,
    elevation: 5,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionMain: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
    flex: 1,
  },
  instructionDistance: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: spacing(1),
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingVertical: spacing(0.5),
    paddingHorizontal: spacing(1),
    borderRadius: 4,
  },
  roundaboutIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  controls: {
    flexDirection: 'row',
    gap: SPACING_SM,
    padding: SPACING_MD,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: spacing(1),
  },
  closeButton: {
    position: 'absolute',
    right: SPACING_SM,
    bottom: spacing(4),
    backgroundColor: colors.surface,
    borderRadius: 24,
    elevation: 4,
    borderColor: colors.border,
    borderWidth: 1,
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

