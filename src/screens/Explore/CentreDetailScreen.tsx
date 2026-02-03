import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, Card, Chip, ActivityIndicator, IconButton, Portal, Modal } from 'react-native-paper';
import MapboxGL from '../../lib/mapbox';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiCentres } from '../../api';
import { useQuery } from '@tanstack/react-query';
import RouteCard from '../../components/RouteCard';
import { colors, spacing } from '../../styles/theme';
import { useEntitlements, hasAccessToCentre } from '../../hooks/useEntitlements';
import PaywallModal from '../../components/PaywallModal';
import { Alert } from 'react-native';
import { openCustomerCenter, presentPaywall, restore } from '../../lib/revenuecat';
import { legalDocs } from '../../content/legal';
import { useAuth } from '../../context/AuthContext';
import { reverseGeocode } from '../../lib/mapboxSearch';

const CentreDetailScreen: React.FC<NativeStackScreenProps<any>> = ({ route, navigation }) => {
  const { guest } = useAuth();
  const centre = route?.params?.centre;
  if (!centre) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(4) }}>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={{ flex: 1, textAlign: 'center', marginRight: spacing(6) }}>
            Test Centre
          </Text>
        </View>
        <Card style={styles.heroCard}>
          <Card.Content>
            <Text variant="bodyLarge">Centre details unavailable.</Text>
            <Text style={{ color: colors.muted, marginTop: spacing(0.5) }}>
              Please return to Explore and select a centre again.
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  }
  const entitlements = useEntitlements();
  const routesQuery = useQuery({
    queryKey: ['centre-routes', centre.id],
    queryFn: () => apiCentres.routes(centre.id).then((res) => res.data.data || (res.data as any)),
  });
  const [paywall, setPaywall] = React.useState(false);
  const [showPayments, setShowPayments] = React.useState(false);
  const [address, setAddress] = React.useState<string | null>(null);
  const [addressLoading, setAddressLoading] = React.useState(false);

  /**
   * Fetch address from coordinates on mount
   */
  React.useEffect(() => {
    const fetchAddress = async () => {
      if (!centre?.lat || !centre?.lng) return;
      try {
        setAddressLoading(true);
        const result = await reverseGeocode(centre.lng, centre.lat);
        setAddress(result.address || result.place_name);
      } catch (error) {
        console.error('Reverse geocoding error:', error);
        // Fallback to using postcode if reverse geocoding fails
        setAddress(centre.postcode ? `${centre.postcode}, ${centre.city}` : centre.city);
      } finally {
        setAddressLoading(false);
      }
    };
    fetchAddress();
  }, [centre]);

  const canAccess = hasAccessToCentre(entitlements.data, centre.id);

  const handlePurchase = async () => {
    try {
      const success = await presentPaywall();
      if (success) entitlements.refetch?.();
    } catch (e) {
      Alert.alert('Purchase failed', 'Please try again.');
    }
    setPaywall(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(4), paddingTop: spacing(3) }}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ flex: 1, textAlign: 'center', marginRight: spacing(6) }}>
          {centre.name}
        </Text>
      </View>
      <Card style={styles.heroCard}>
        <Card.Content>
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall">{centre.name}</Text>
              {addressLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing(0.5) }} />
              ) : (
                <Text style={{ color: colors.muted }}>{address || centre.postcode} • {centre.city}</Text>
              )}
            </View>
            <Chip style={[styles.pill, { backgroundColor: canAccess ? '#e0f7e9' : '#fdecea' }]} textStyle={{ color: canAccess ? '#0f7b32' : '#b12a2a' }}>
              {canAccess ? 'Unlocked' : 'Locked'}
            </Chip>
          </View>
          <View style={styles.mapWrapper}>
            <MapboxGL.MapView style={StyleSheet.absoluteFill} styleURL="mapbox://styles/mapbox/navigation-day-v1">
              <MapboxGL.Camera
                zoomLevel={14}
                centerCoordinate={[centre.lng, centre.lat]}
              />
              <MapboxGL.PointAnnotation id="centre" coordinate={[centre.lng, centre.lat]}>
                <View style={styles.mapMarker} />
              </MapboxGL.PointAnnotation>
            </MapboxGL.MapView>
          </View>
          <View style={styles.ctaRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted }}>Centre pack • £10</Text>
              <Text style={{ fontWeight: '700' }}>{routesQuery.data?.length || 0} routes included</Text>
            </View>
            {!canAccess && (
              <Button mode="contained" onPress={() => setShowPayments(true)}>
                Unlock
              </Button>
            )}
          </View>
          <View style={styles.secondaryRow}>
            <Button mode="outlined" onPress={() => restore()}>
              Restore
            </Button>
            <Button
              mode="outlined"
              disabled={!routesQuery.data?.length}
              onPress={() =>
                canAccess
                  ? navigation.navigate('RouteDetail', { route: routesQuery.data?.[0], centre })
                  : setShowPayments(true)
              }
            >
              Preview
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Text variant="titleMedium" style={{ marginBottom: spacing(1) }}>
        Routes in this centre
      </Text>

      {routesQuery.isLoading && <ActivityIndicator style={{ marginTop: spacing(2) }} />}

      {routesQuery.data?.map((r: any) => (
        <RouteCard
          key={r.id}
          route={r}
          locked={!canAccess}
          onPress={() => (canAccess ? navigation.navigate('RouteDetail', { route: r, centre }) : setPaywall(true))}
        />
      ))}

      {!routesQuery.isLoading && !routesQuery.data?.length && (
        <Card style={{ borderRadius: 14 }}>
          <Card.Content>
            <Text variant="bodyLarge">No routes yet</Text>
            <Text style={{ color: colors.muted, marginTop: spacing(0.5) }}>We’re adding routes for this centre soon.</Text>
          </Card.Content>
        </Card>
      )}

      <PaywallModal
        visible={paywall}
        guest={guest}
        onLogin={() => navigation.navigate('Auth')}
        onClose={() => setPaywall(false)}
        onPurchase={handlePurchase}
        onRestore={() => {
          restore();
        }}
      />
      <Portal>
        <Modal visible={showPayments} onDismiss={() => setShowPayments(false)} contentContainerStyle={styles.paymentsModal}>
          <Text variant="titleLarge">{legalDocs.payments.title}</Text>
          <Text style={styles.paymentsVersion}>{legalDocs.payments.version}</Text>
          <Text style={styles.paymentsBody}>{legalDocs.payments.body}</Text>
          <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
            <Button
              mode="contained"
              onPress={async () => {
                setShowPayments(false);
                setPaywall(true);
              }}
            >
              View Subscription Options
            </Button>
            <Button mode="outlined" onPress={() => openCustomerCenter()}>
              Manage Subscription
            </Button>
            <Button onPress={() => setShowPayments(false)}>Close</Button>
          </View>
        </Modal>
      </Portal>
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
  heroCard: {
    marginBottom: spacing(3),
    borderRadius: 18,
    elevation: 3,
    borderColor: colors.border,
    borderWidth: 1,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing(2),
    marginBottom: spacing(2),
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    fontSize: 12,
  },
  mapWrapper: {
    height: 200,
    marginVertical: spacing(2),
    borderRadius: 14,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: 1,
  },
  map: {
    height: 200,
    marginVertical: spacing(2),
    borderRadius: 14,
  },
  mapMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  ctaRow: {
    marginVertical: spacing(2),
    paddingTop: spacing(2),
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryRow: {
    marginTop: spacing(1.5),
    flexDirection: 'row',
    gap: spacing(1),
  },
  paymentsModal: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing(2),
    padding: spacing(3),
    borderRadius: 18,
    elevation: 5,
  },
  paymentsVersion: {
    color: colors.textSecondary,
    marginTop: spacing(0.5),
    fontSize: 13,
    fontWeight: '500',
  },
  paymentsBody: {
    color: colors.textSecondary,
    marginTop: spacing(1),
    lineHeight: 22,
    fontSize: 14,
  },
});

export default CentreDetailScreen;
