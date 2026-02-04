import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, Chip, IconButton, Divider } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiRoutes } from '../../api';
import { spacing, colors } from '../../styles/theme';
import { saveDownloadedRoute } from '../../db';
import { coordsFromGpx, metersToKm, secondsToMinutes } from '../../utils';
import MapboxGL from '../../lib/mapbox';
import { useEntitlements, hasAccessToCentre } from '../../hooks/useEntitlements';
import PaywallModal from '../../components/PaywallModal';
import { useAuth } from '../../context/AuthContext';
import { snapCoordinatesToRoads } from '../../utils/mapboxMatching';

const RouteDetailScreen: React.FC<NativeStackScreenProps<any>> = ({ route, navigation }) => {
  const { guest } = useAuth();
  const initialRoute = route?.params?.route;
  const centre = route?.params?.centre;
  if (!initialRoute) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(4) }}>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={{ flex: 1, textAlign: 'center', marginRight: spacing(6) }}>
            Route
          </Text>
        </View>
        <Card style={{ borderRadius: 16, marginTop: spacing(1) }}>
          <Card.Content>
            <Text variant="bodyLarge">Route details unavailable.</Text>
            <Text style={{ color: colors.muted, marginTop: spacing(0.5) }}>
              Please return to the centre and choose a route again.
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  }
  const entitlements = useEntitlements();
  const canAccess = hasAccessToCentre(entitlements.data, initialRoute.centreId);
  const [routeDto, setRouteDto] = useState(initialRoute);
  const [downloading, setDownloading] = useState(false);
  const [matchedRoute, setMatchedRoute] = useState<any>(null);
  const isDownloaded = !!routeDto?.downloaded;
  const [paywall, setPaywall] = useState(false);

  const handleDownload = async () => {
    if (!canAccess) {
      setPaywall(true);
      return;
    }
    setDownloading(true);
    const res = await apiRoutes.detail(routeDto.id);
    const data = res.data.data || (res.data as any);
    setRouteDto({ ...data, downloaded: true });
    saveDownloadedRoute(data);
    setDownloading(false);
  };

  // Snap coordinates to roads when route changes
  useEffect(() => {
    const snapRoute = async () => {
      if (routeDto?.coordinates && Array.isArray(routeDto.coordinates) && routeDto.coordinates.length > 0) {
        try {
          const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
          if (token) {
            const snapped = await snapCoordinatesToRoads(routeDto.coordinates, token);
            if (snapped) {
              setMatchedRoute(snapped);
            }
          }
        } catch (e) {
          console.warn('Map matching failed, using original geometry');
        }
      }
    };
    snapRoute();
  }, [routeDto?.id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(4), paddingTop: spacing(3) }}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ flex: 1, textAlign: 'center', marginRight: spacing(6) }}>
          Route
        </Text>
      </View>

      <Card style={{ borderRadius: 18, marginTop: spacing(1.5), elevation: 2, borderColor: colors.border, borderWidth: 1 }}>
        <Card.Content style={{ paddingVertical: spacing(2.5), paddingHorizontal: spacing(2.5) }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.text,
              marginBottom: spacing(1),
            }}
          >
            {routeDto.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(1.5) }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing(0.25) }}>
                Distance
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
                {metersToKm(routeDto.distanceM)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing(0.25) }}>
                Duration
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
                {secondsToMinutes(routeDto.durationEstS)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: spacing(1.5), flexWrap: 'wrap', gap: spacing(0.75) }}>
            <Chip
              style={{
                backgroundColor: colors.secondaryLight,
                borderRadius: 8,
              }}
              textStyle={{ color: colors.secondaryDark, fontSize: 12 }}
            >
              v{routeDto.version}
            </Chip>
          </View>
          <Divider style={{ marginVertical: spacing(1.5), backgroundColor: colors.border }} />
          <View style={{ height: 240, borderRadius: 14, overflow: 'hidden', borderColor: colors.border, borderWidth: 1 }}>
            <MapboxGL.MapView style={StyleSheet.absoluteFill} styleURL="mapbox://styles/mapbox/navigation-day-v1">
              <MapboxGL.Camera
                bounds={routeDto.bbox ? bboxToBounds(routeDto.bbox) : undefined}
                zoomLevel={routeDto.bbox ? undefined : 13}
                centerCoordinate={
                  routeDto.bbox ? undefined : [routeDto.lng ?? routeDto.centre?.lng ?? 0, routeDto.lat ?? routeDto.centre?.lat ?? 0]
                }
              />
              <MapboxGL.ShapeSource id="preview-route" shape={matchedRoute || lineString(routeDto.geojson || routeDto.polyline, routeDto)}>
                <MapboxGL.LineLayer id="preview-route-line" style={{ lineColor: colors.primary, lineWidth: 4 }} />
              </MapboxGL.ShapeSource>
            </MapboxGL.MapView>
          </View>
          <Text style={{ marginTop: spacing(1), color: colors.muted }}>
            Practice this DVSA-style route with turn-by-turn guidance, speed, and progress tracking.
          </Text>
          {!canAccess && !isDownloaded ? (
            <Button mode="contained" style={{ marginTop: spacing(2) }} onPress={() => setPaywall(true)}>
              Unlock this centre
            </Button>
          ) : (
            <>
              {!isDownloaded ? (
                <Button mode="contained" onPress={handleDownload} loading={downloading} style={{ marginTop: spacing(2) }}>
                  Download for offline
                </Button>
              ) : (
                <Chip style={{ marginTop: spacing(2), alignSelf: 'flex-start' }} icon="check">
                  Downloaded for offline
                </Chip>
              )}
              <Button
                mode="outlined"
                style={{ marginTop: spacing(1) }}
                onPress={() => {
                  navigation.navigate('Practice', { route: routeDto });
                }}
              >
                Start practice
              </Button>
            </>
          )}
        </Card.Content>
      </Card>
      <PaywallModal
        visible={paywall}
        guest={guest}
        onLogin={() => navigation.navigate('Auth')}
        onClose={() => setPaywall(false)}
        onPurchase={() => {
          setPaywall(false);
          entitlements.refetch?.();
        }}
        onRestore={() => {
          entitlements.refetch?.();
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default RouteDetailScreen;

const lineString = (geojsonOrPolyline: any, route: any) => {
  // If geojson is already a proper FeatureCollection with geometry, use it
  if (geojsonOrPolyline?.type === 'FeatureCollection') {
    // Extract the first feature's geometry if it exists
    const feature = geojsonOrPolyline?.features?.[0];
    if (feature?.geometry) {
      return feature;
    }
  }
  // If geojson is already a Feature, use it directly
  if (geojsonOrPolyline?.type === 'Feature') {
    return geojsonOrPolyline;
  }
  
  if (route?.gpx) {
    const coords = coordsFromGpx(route.gpx);
    if (coords.length) {
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords.map((c) => [c.longitude, c.latitude]) },
      };
    }
  }
  
  // fallback to polyline - which is a stringified JSON array of [lon, lat] pairs OR coordinates array
  let coords: any[] = [];
  if (typeof route?.polyline === 'string') {
    try {
      coords = JSON.parse(route.polyline);
    } catch (e) {
      coords = [];
    }
  } else if (Array.isArray(route?.polyline)) {
    coords = route.polyline;
  } else if (Array.isArray(route?.coordinates)) {
    coords = route.coordinates;
  }
  
  // Return as proper GeoJSON Feature with LineString
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
  };
};

const bboxToBounds = (bbox: any) => {
  // bbox from backend stored as [minLng, minLat, maxLng, maxLat]
  if (!Array.isArray(bbox) || bbox.length !== 4) return undefined;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return { ne: [maxLng, maxLat] as [number, number], sw: [minLng, minLat] as [number, number], padding: 20 };
};
