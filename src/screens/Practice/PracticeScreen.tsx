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

type Props = NativeStackScreenProps<any>;

type NavigationState = 'PREVIEW' | 'NAVIGATING' | 'COMPLETED';

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

const PracticeScreen: React.FC<Props> = ({ route: routeNav, navigation }) => {
  const initialRoute = routeNav?.params?.route as RouteDto | undefined;

  const [routeDto, setRouteDto] = useState<RouteDto | undefined>(initialRoute);
  const [navState, setNavState] = useState<NavigationState>('PREVIEW');
  const [userLocation, setUserLocation] = useState<MapCoord | null>(null);
  const [cameraMode, setCameraMode] = useState<'FOLLOW' | 'OVERVIEW'>('OVERVIEW');
  const [elapsed, setElapsed] = useState(0);

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
    if (navState === 'NAVIGATING') {
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
  }, [navState]);

  const routeCoords = useMemo(() => {
    const coords = routeDto ? getRouteCoords(routeDto) : [];
    return coords.map((c: LatLng): MapCoord => [c.longitude, c.latitude]);
  }, [routeDto]);

  const handleStart = () => {
    if (!userLocation) {
      Alert.alert('No Location', 'Waiting for GPS signal...');
      return;
    }

    startTimeRef.current = Date.now();
    setNavState('NAVIGATING');
    setCameraMode('FOLLOW');

    if (routeDto?.id) {
      apiRoutes.startPractice(routeDto.id).catch((err: unknown) => console.warn(err));
    }
  };

  const handleComplete = async () => {
    setNavState('COMPLETED');

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

      <SafeAreaView style={styles.topContainer}>
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium">{routeDto.name}</Text>
            <Text variant="bodySmall">
              {formatDistance(routeDto.distanceM)} • {formatDuration(routeDto.durationEstS)}
            </Text>

            {navState === 'NAVIGATING' && (
              <View style={styles.progressContainer}>
                <Text variant="bodySmall">Elapsed: {formatDuration(elapsed)}</Text>
              </View>
            )}
          </Card.Content>
        </Card>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomContainer}>
        <View style={styles.controls}>
          {navState === 'PREVIEW' && (
            <Button mode="contained" onPress={handleStart} disabled={!userLocation} style={styles.button}>
              Start Navigation
            </Button>
          )}

          {navState === 'NAVIGATING' && (
            <>
              <Button mode="outlined" onPress={toggleCamera} style={styles.button}>
                {cameraMode === 'FOLLOW' ? 'Overview' : 'Follow'}
              </Button>
              <Button mode="contained" onPress={handleComplete} style={styles.button}>
                Finish
              </Button>
            </>
          )}

          {navState === 'COMPLETED' && (
            <Button mode="contained" onPress={() => navigation.goBack()} style={styles.button}>
              Done
            </Button>
          )}
        </View>

        <IconButton icon="close" size={24} onPress={() => navigation.goBack()} style={styles.closeButton} />
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
  },
  loadingCard: {
    margin: SPACING_MD,
  },
  progressContainer: {
    marginTop: SPACING_SM,
    gap: SPACING_XS,
  },
  controls: {
    flexDirection: 'row',
    gap: SPACING_SM,
    padding: SPACING_MD,
  },
  button: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: SPACING_SM,
    bottom: SPACING_SM,
  },
  startMarker: {
    backgroundColor: colors.success,
    padding: SPACING_XS,
    borderRadius: 4,
  },
  endMarker: {
    backgroundColor: colors.danger,
    padding: SPACING_XS,
    borderRadius: 4,
  },
  markerText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  userMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'white',
  },
});

export default PracticeScreen;
