import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, IconButton, Text } from 'react-native-paper';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RouteDto, apiRoutes } from '../../api';
import { getRouteCoords } from '../../utils';
import { spacing, colors } from '../../styles/theme';
import { upsertRouteStat } from '../../db';
import MapboxGL from '../../lib/mapbox';
import MapboxNavigationSdkView, { isMapboxNavSdkAvailable } from '../../components/MapboxNavigationSdkView';
import { calculateDistance } from '../../utils/mapbox';
import { getDirections } from '../../lib/mapboxNavigation';

type Props = NativeStackScreenProps<any>;

type NavigationState = 'PREVIEW' | 'NAVIGATING' | 'COMPLETED';

type NavigationPhase = 'TO_START' | 'ON_ROUTE';

type MapCoord = [number, number];

type LatLng = { latitude: number; longitude: number };

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

const ARRIVAL_THRESHOLD_M = 40;

const PracticeScreen: React.FC<Props> = ({ route: routeNav, navigation }) => {
  const initialRoute = routeNav?.params?.route as RouteDto | undefined;

  const [routeDto, setRouteDto] = useState<RouteDto | undefined>(initialRoute);
  const [navState, setNavState] = useState<NavigationState>('PREVIEW');
  const [navPhase, setNavPhase] = useState<NavigationPhase | null>(null);
  const [userLocation, setUserLocation] = useState<MapCoord | null>(null);
  const [cameraMode, setCameraMode] = useState<'FOLLOW' | 'OVERVIEW'>('OVERVIEW');
  const [elapsed, setElapsed] = useState(0);
  const [navLineCoords, setNavLineCoords] = useState<MapCoord[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

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
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for navigation');
        return;
      }

      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (loc: Location.LocationObject) => {
          setUserLocation([loc.coords.longitude, loc.coords.latitude]);
        },
      );
    })();

    return () => {
      locationWatchRef.current?.remove();
    };
  }, []);

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

  useEffect(() => {
    if (!userLocation || navState !== 'NAVIGATING' || navPhase !== 'TO_START' || routeCoords.length === 0) return;
    const start = routeCoords[0];
    const distanceM = calculateDistance(userLocation[0], userLocation[1], start[0], start[1]) * 1000;
    if (distanceM <= ARRIVAL_THRESHOLD_M) {
      setNavPhase('ON_ROUTE');
      startTimeRef.current = Date.now();
      setElapsed(0);
      setCameraMode('FOLLOW');

      if (routeDto?.id) {
        apiRoutes.startPractice(routeDto.id).catch((err: unknown) => console.warn(err));
      }

      Alert.alert('Route started', 'You have reached the start point. Your test route has started.');
    }
  }, [navPhase, navState, routeCoords, routeDto?.id, userLocation]);

  useEffect(() => {
    if (navState !== 'NAVIGATING' || !userLocation || !navDestination || isMapboxNavSdkAvailable) {
      setNavLineCoords([]);
      return;
    }

    const buildFallbackNav = async () => {
      const start: LatLng = { latitude: userLocation[1], longitude: userLocation[0] };
      const end: LatLng = { latitude: navDestination[1], longitude: navDestination[0] };
      const res = await getDirections(start, end, [], { language: 'en', voiceUnits: 'metric' });
      if (!res?.coords?.length) {
        setNavLineCoords([]);
        return;
      }
      setNavLineCoords(res.coords.map((c) => [c.longitude, c.latitude] as MapCoord));
    };

    buildFallbackNav().catch((err: unknown) => console.warn('Failed to build nav route', err));
  }, [navDestination, navState, userLocation]);

  const handleStart = () => {
    if (!userLocation) {
      Alert.alert('No Location', 'Waiting for GPS signal...');
      return;
    }

    startTimeRef.current = null;
    setElapsed(0);
    setNavState('NAVIGATING');
    setNavPhase('TO_START');
    setCameraMode('FOLLOW');
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
      <MapboxGL.MapView style={styles.map}>
        <MapboxGL.Camera
          defaultSettings={{
            centerCoordinate: routeCoords[0],
            zoomLevel: 14,
          }}
          followUserLocation={cameraMode === 'FOLLOW' && navState === 'NAVIGATING'}
          followZoomLevel={16}
        />

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
            id="routeLine"
            style={{
              lineColor: navState === 'NAVIGATING' ? '#0b6cfb' : '#666',
              lineWidth: 6,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </MapboxGL.ShapeSource>

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
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

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

        {userLocation && (
          <MapboxGL.PointAnnotation id="userLocation" coordinate={userLocation}>
            <View style={styles.userMarker} />
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {navState === 'NAVIGATING' && userLocation && navDestination && isMapboxNavSdkAvailable && (
        <MapboxNavigationSdkView
          key={`${navPhase}-${routeDto.id || 'route'}`}
          style={StyleSheet.absoluteFill}
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
          origin={userLocation}
          destination={navDestination}
          shouldSimulateRoute={false}
          rerouteEnabled={true}
        />
      )}

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
            <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(1) }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Distance</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                  {formatDistance(routeDto.distanceM)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Est. Time</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                  {formatDuration(routeDto.durationEstS)}
                </Text>
              </View>
            </View>

            {navState === 'NAVIGATING' && navPhase === 'TO_START' && (
              <View style={{ marginTop: spacing(1), paddingTop: spacing(1), borderTopColor: colors.border, borderTopWidth: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.warning }}>
                  📍 Navigating to start point
                </Text>
              </View>
            )}

            {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && (
              <View style={{ marginTop: spacing(1), paddingTop: spacing(1), borderTopColor: colors.border, borderTopWidth: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.success }}>
                  ✓ Test route started
                </Text>
              </View>
            )}

            {navState === 'NAVIGATING' && (
              <View style={styles.progressContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Elapsed</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                    {formatDuration(elapsed)}
                  </Text>
                </View>
              </View>
            )}
          </Card.Content>
        </Card>
      </SafeAreaView>

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

          {navState === 'NAVIGATING' && navPhase === 'ON_ROUTE' && (
            <>
              <Button
                mode="outlined"
                onPress={toggleCamera}
                style={styles.button}
                labelStyle={{ fontSize: 15, fontWeight: '700' }}
              >
                {cameraMode === 'FOLLOW' ? '📍 Overview' : '👁️ Follow'}
              </Button>
              <Button
                mode="contained"
                onPress={handleComplete}
                style={styles.button}
                labelStyle={{ fontSize: 15, fontWeight: '700' }}
              >
                Finish Route
              </Button>
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
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  infoCard: {
    margin: SPACING_MD,
    borderRadius: 16,
    elevation: 4,
    borderColor: colors.border,
    borderWidth: 1,
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
  controls: {
    flexDirection: 'row',
    gap: SPACING_SM,
    padding: SPACING_MD,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
});

export default PracticeScreen;
