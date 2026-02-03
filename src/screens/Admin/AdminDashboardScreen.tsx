import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, RadioButton, Snackbar, Chip, Divider, TextInput } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { apiAdmin, apiCentres } from '../../api';
import { spacing, colors } from '../../styles/theme';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapboxSearchBox } from '../../components/MapboxSearchBox';
import { SearchResult } from '../../types/mapbox';
import { isUKLocation, extractPostcode } from '../../utils/mapbox';

const AdminDashboardScreen: React.FC = () => {
  const qc = useQueryClient();
  const [usersCount, setUsersCount] = useState<number>(0);
  const [centreId, setCentreId] = useState<string>('');
  const [centreName, setCentreName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [routeName, setRouteName] = useState('');
  const [centres, setCentres] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addressPreview, setAddressPreview] = useState<string | null>(null);
  const [showAddressInput, setShowAddressInput] = useState(false);

  useEffect(() => {
    apiAdmin
      .stats()
      .then((res) => setUsersCount(res.data.data.users))
      .catch(() => setUsersCount(0));
    apiCentres
      .search({})
      .then((res) => {
        const data = (res.data as any).data?.items || (res.data as any).items || (res.data as any);
        setCentres(data || []);
      })
      .catch(() => setCentres([]));
  }, []);
  const totalCentres = useMemo(() => centres.length, [centres]);

  /**
   * Handle location selection from MapboxSearchBox
   * Auto-fills centre name and postcode, validates UK location
   */
  const handleAddressSelect = (result: SearchResult) => {
    const [longitude, latitude] = result.center;

    // Validate UK location
    if (!isUKLocation(longitude, latitude)) {
      setToast('Selected location is outside the UK. Please select a UK test centre.');
      setAddressPreview(null);
      return;
    }

    // Extract and set postcode
    const extractedPostcode =
      result.postcode || extractPostcode(result.place_name);
    if (extractedPostcode) {
      setPostcode(extractedPostcode);
    }

    // Set centre name from result
    setCentreName(result.text || result.place_name);

    // Display address preview
    setAddressPreview(result.place_name);
    setShowAddressInput(false);
    setToast('Address autofilled successfully.');
  };

  const pickAndUpload = async () => {
    if (!centreId && !centreName.trim()) {
      setToast('Select a test centre or enter a new centre name.');
      return;
    }
    if (!centreId && !postcode.trim()) {
      setToast('Postcode is required for a new test centre.');
      return;
    }
    if (!routeName.trim()) {
      setToast('Route name is required.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file?.uri) return;
    setUploading(true);
    try {
      await apiAdmin.uploadRoute(centreId || null, {
        uri: file.uri,
        name: file.name || 'route.gpx',
        type: file.mimeType || 'application/gpx+xml',
      }, {
        centreName: centreName.trim() || undefined,
        postcode: postcode.trim() || undefined,
        routeName: routeName.trim(),
      });
      setToast('Route uploaded and parsed.');
      setCentreName('');
      setPostcode('');
      setRouteName('');
      if (!centreId) setCentreId('');
      // refresh centre/route lists for Explore + Centre Detail screens
      qc.invalidateQueries({ queryKey: ['centres'] });
      if (centreId) {
        qc.invalidateQueries({ queryKey: ['centre-routes', centreId] });
      }
      // refresh centres list in admin view
      const res = await apiCentres.search({});
      const data = (res.data as any).data?.items || (res.data as any).items || (res.data as any);
      setCentres(data || []);
    } catch (e) {
      setToast('Upload failed. Check admin access.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(6) }}>
        <Card style={styles.heroCard}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.heroTitle}>Admin Dashboard</Text>
          <Text style={styles.heroSubtitle}>Manage routes, centres, and uploads in one place.</Text>
          <View style={styles.heroStatsRow}>
            <Chip icon="account-group" style={styles.statChip}>Users {usersCount}</Chip>
            <Chip icon="map-marker" style={styles.statChip}>Centres {totalCentres}</Chip>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(0.5) }}>Upload GPX Route</Text>
          <Text style={{ color: colors.muted, marginTop: spacing(0.5), fontSize: 14, lineHeight: 20, marginBottom: spacing(1.5) }}>
            Select the test centre, then upload a GPX file to create the next numbered route.
          </Text>
          <RadioButton.Group onValueChange={(v) => setCentreId(v)} value={centreId}>
            {centres.map((c: any) => (
              <View key={c.id} style={styles.radioRow}>
                <RadioButton value={c.id} />
                <Text style={styles.radioLabel}>{`${c.name} (${c.postcode})`}</Text>
              </View>
            ))}
          </RadioButton.Group>
          <Divider style={{ marginVertical: spacing(1.5) }} />
          <Text variant="labelLarge" style={{ marginBottom: spacing(0.5) }}>
            Or create new test centre
          </Text>
          {!showAddressInput ? (
            <Button
              mode="outlined"
              onPress={() => setShowAddressInput(true)}
              icon="magnify"
              style={{ marginBottom: spacing(1.5), borderRadius: 10 }}
              labelStyle={{ fontSize: 14 }}
            >
              Search Address
            </Button>
          ) : (
            <>
              <MapboxSearchBox
                onSelectLocation={handleAddressSelect}
                placeholder="Search UK test centre address"
                label="Centre Address"
              />
              {addressPreview && (
                <Card style={{ marginTop: spacing(1), backgroundColor: '#f0f8ff', padding: spacing(1.5) }}>
                  <Text variant="bodySmall" style={{ color: colors.primary }}>
                    ✓ Selected: {addressPreview}
                  </Text>
                </Card>
              )}
            </>
          )}
          <TextInput
            label="New centre name (required if not selected)"
            value={centreName}
            onChangeText={setCentreName}
            mode="outlined"
            style={{ marginTop: spacing(1), marginBottom: spacing(1) }}
          />
          <TextInput
            label="Postcode (required if not selected)"
            value={postcode}
            onChangeText={setPostcode}
            mode="outlined"
            style={{ marginTop: spacing(1), marginBottom: spacing(1) }}
          />
          <TextInput
            label="Route name (required)"
            value={routeName}
            onChangeText={setRouteName}
            mode="outlined"
            style={{ marginTop: spacing(1), marginBottom: spacing(1) }}
          />
          <Divider style={{ marginVertical: spacing(1.5) }} />
          <Button mode="contained" onPress={pickAndUpload} loading={uploading} style={{ alignSelf: 'flex-start', borderRadius: 10 }} labelStyle={{ fontSize: 15, fontWeight: '600' }}>
            Upload GPX File
          </Button>
        </Card.Content>
      </Card>

        <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={2000} style={{ bottom: '40%' }}>
          {toast}
        </Snackbar>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: { marginBottom: spacing(2), borderRadius: 18, elevation: 2, borderColor: colors.border, borderWidth: 1 },
  heroCard: { marginBottom: spacing(2), borderRadius: 18, backgroundColor: colors.primary, elevation: 3, borderColor: colors.primary, borderWidth: 0 },
  heroTitle: { color: '#fff', fontWeight: '800', fontSize: 24 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', marginTop: spacing(0.5), fontSize: 14, lineHeight: 20 },
  heroStatsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing(1.5), gap: spacing(1) },
  statChip: { marginRight: 0, marginBottom: 0, backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 },
  row: {
    marginTop: spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(1), borderBottomColor: colors.border, borderBottomWidth: 1 },
  radioLabel: { flexShrink: 1, fontSize: 14, color: colors.text, marginLeft: spacing(1) },
});

export default AdminDashboardScreen;
