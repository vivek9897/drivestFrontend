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
    setQuery(result.place_name);
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
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(3), paddingTop: spacing(5) }}>
        <Card style={styles.heroCard} mode="contained">
          <Card.Content>
            <Text variant="titleLarge" style={styles.heroTitle}>
              Find your test centre
            </Text>
            <Text style={styles.heroSubtitle}>Search, download routes, and practice like you’re already on the road.</Text>
          </Card.Content>
        </Card>

        <View style={styles.searchCard}>
          <MapboxSearchBox
            onSelectLocation={handleMapboxLocationSelect}
            placeholder="Search by postcode, city, centre name"
            label="Find test centre"
            initialValue={input}
            proximity={userLocation}
          />
          <Button mode="contained" onPress={handleNearMe} style={{ marginTop: spacing(1.5) }}>
            Near me
          </Button>
        </View>

        <Card style={styles.goalCard}>
          <Card.Content>
            <Text variant="titleMedium">Your weekly goal</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>Complete 3 routes this week to keep your streak.</Text>
            <SegmentedButtons
              style={{ marginTop: spacing(1.5) }}
              value={goalChoice}
              onValueChange={setGoalChoice}
              buttons={[
                { value: '1', label: 'XP 120' },
                { value: '2', label: 'XP 240' },
                { value: '3', label: 'XP 360' },
              ]}
            />
          </Card.Content>
        </Card>

        {centresQuery.data?.map((centre: TestCentre) => (
          <CentreCard
            key={centre.id}
            centre={centre}
            onPress={() => navigation.navigate('CentreDetail', { centre })}
          />
        ))}
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
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  heroCard: {
    marginBottom: spacing(2.5),
    borderRadius: 18,
    backgroundColor: '#1f2f73',
  },
  heroTitle: { color: '#fff', fontWeight: '800', letterSpacing: 0.5 },
  heroSubtitle: { color: '#d9e3ff', marginTop: spacing(0.5), lineHeight: 20 },
  searchCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing(2),
    marginBottom: spacing(2),
    elevation: 1,
  },
  goalCard: { marginBottom: spacing(2.5), borderRadius: 16 },
});

export default ExploreScreen;
