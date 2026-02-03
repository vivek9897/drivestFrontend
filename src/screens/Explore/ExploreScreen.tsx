import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, Button, Text, SegmentedButtons, Card } from 'react-native-paper';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import CentreCard from '../../components/CentreCard';
import { MapboxSearchBox } from '../../components/MapboxSearchBox';
import { apiCentres, TestCentre } from '../../api';
import { spacing, colors } from '../../styles/theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import LocationConsentModal from '../../components/LocationConsentModal';
import { CONSENT_KEYS, consentNow, getConsentValue, setConsentValue } from '../../utils/consent';
import { SearchResult } from '../../types/mapbox';

const ExploreScreen: React.FC<NativeStackScreenProps<any>> = ({ navigation }) => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [near, setNear] = useState<string | undefined>();
  const [goalChoice, setGoalChoice] = useState('1');
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [pendingNear, setPendingNear] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>();

  const centresQuery = useQuery<TestCentre[]>({
    queryKey: ['centres', query, near],
    queryFn: async () => {
      const res = await apiCentres.search({ query: query || undefined, near });
      const data = (res.data as any).data?.items || (res.data as any).items || (res.data as any);
      return data as TestCentre[];
    },
    placeholderData: keepPreviousData,
  });

  /**
   * Handle location selection from MapboxSearchBox
   * Extracts coordinates and searches for nearby centres
   */
  const handleMapboxLocationSelect = (result: SearchResult) => {
    const [longitude, latitude] = result.center;
    setInput(result.place_name);
    setQuery(result.text || result.place_name);
    setNear(`${latitude},${longitude}`);
    setUserLocation([longitude, latitude]);
  };

  const handleNearMe = async () => {
    const choice = await getConsentValue(CONSENT_KEYS.locationChoice);
    if (choice !== 'allow') {
      setShowLocationPrompt(true);
      setPendingNear(true);
      return;
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: 3 });
    setNear(`${loc.coords.latitude},${loc.coords.longitude}`);
    setUserLocation([loc.coords.longitude, loc.coords.latitude]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(2.5), paddingTop: spacing(4) }}>
        <Card style={styles.heroCard} mode="contained">
          <Card.Content style={{ paddingVertical: spacing(2.5) }}>
            <Text variant="headlineSmall" style={styles.heroTitle}>
              Find your test centre
            </Text>
            <Text style={styles.heroSubtitle}>Search, download routes, and practice with live navigation.</Text>
          </Card.Content>
        </Card>

        <View style={styles.searchCard}>
          <MapboxSearchBox
            onSelectLocation={handleMapboxLocationSelect}
            placeholder="Search by postcode or city"
            label="Find test centre"
            initialValue={input}
            proximity={userLocation}
          />
          <Button
            mode="contained"
            onPress={handleNearMe}
            style={{
              marginTop: spacing(1.5),
              borderRadius: 10,
              paddingVertical: spacing(0.5),
            }}
            labelStyle={{
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            Use my location
          </Button>
        </View>

        <Card style={styles.goalCard} mode="contained">
          <Card.Content style={{ paddingVertical: spacing(2.5), paddingHorizontal: spacing(2.5) }}>
            <Text
              variant="titleMedium"
              style={{
                color: colors.text,
                fontWeight: '700',
                fontSize: 16,
              }}
            >
              Your weekly goal
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: spacing(0.5),
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              Complete 3 routes this week to build your confidence.
            </Text>
            <SegmentedButtons
              style={{ marginTop: spacing(2) }}
              value={goalChoice}
              onValueChange={setGoalChoice}
              buttons={[
                { value: '1', label: 'Easy' },
                { value: '2', label: 'Medium' },
                { value: '3', label: 'Advanced' },
              ]}
            />
          </Card.Content>
        </Card>

        <View style={{ marginBottom: spacing(1) }}>
          {centresQuery.data?.length ? (
            <>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.textSecondary,
                  marginBottom: spacing(1.5),
                  marginLeft: spacing(1),
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Test Centres
              </Text>
              {centresQuery.data?.map((centre: TestCentre) => (
                <CentreCard
                  key={centre.id}
                  centre={centre}
                  onPress={() => navigation.navigate('CentreDetail', { centre })}
                />
              ))}
            </>
          ) : (
            <Card style={{ marginTop: spacing(2), borderRadius: 14 }}>
              <Card.Content style={{ paddingVertical: spacing(4), paddingHorizontal: spacing(2) }}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: colors.textSecondary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  Search for a test centre to see available routes
                </Text>
              </Card.Content>
            </Card>
          )}
        </View>
      </ScrollView>
      <LocationConsentModal
        visible={showLocationPrompt}
        onAllow={async () => {
          const perm = await Location.requestForegroundPermissionsAsync();
          const choice = perm.status === 'granted' ? 'allow' : 'deny';
          await setConsentValue(CONSENT_KEYS.locationChoice, choice);
          await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
          setShowLocationPrompt(false);
          if (choice === 'allow' && pendingNear) {
            setPendingNear(false);
            const loc = await Location.getCurrentPositionAsync({ accuracy: 3 });
            setNear(`${loc.coords.latitude},${loc.coords.longitude}`);
            setUserLocation([loc.coords.longitude, loc.coords.latitude]);
          }
        }}
        onSkip={async () => {
          await setConsentValue(CONSENT_KEYS.locationChoice, 'skip');
          await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
          setShowLocationPrompt(false);
          setPendingNear(false);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  heroCard: {
    marginBottom: spacing(2.5),
    borderRadius: 20,
    backgroundColor: colors.primary,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.3,
    fontSize: 26,
    lineHeight: 32,
  },
  heroSubtitle: {
    color: colors.primaryLight,
    marginTop: spacing(1),
    lineHeight: 22,
    fontSize: 15,
    fontWeight: '500',
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing(2.5),
    marginBottom: spacing(2.5),
    elevation: 2,
    borderColor: colors.border,
    borderWidth: 1,
  },
  goalCard: {
    marginBottom: spacing(3),
    borderRadius: 18,
    elevation: 2,
    borderColor: colors.border,
    borderWidth: 1,
  },
});

export default ExploreScreen;
