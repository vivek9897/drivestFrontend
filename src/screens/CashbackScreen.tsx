import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Card, Text, ProgressBar, RadioButton, Snackbar, TextInput } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { apiCashback, apiCentres } from '../api';
import { spacing, colors } from '../styles/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import LocationConsentModal from '../components/LocationConsentModal';
import { CONSENT_KEYS, consentNow, getConsentValue, setConsentValue } from '../utils/consent';

const CashbackScreen: React.FC = () => {
  const qc = useQueryClient();
  const statusQuery = useQuery({ queryKey: ['cashback-status'], queryFn: () => apiCashback.status().then((res) => res.data.data || (res.data as any)) });
  const centresQuery = useQuery({ queryKey: ['cashback-centres'], queryFn: () => apiCentres.search({}).then((res) => (res.data as any).data?.items || (res.data as any)) });
  const startMutation = useMutation({
    mutationFn: () => apiCashback.start(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashback-status'] }),
  });
  const submitMutation = useMutation({
    mutationFn: (payload: any) => apiCashback.submit(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashback-status'] }),
  });
  const [centreId, setCentreId] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState<{ latitude: number; longitude: number; t: number }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [testDate, setTestDate] = useState('');
  const [testTime, setTestTime] = useState('');
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const watchRef = React.useRef<any>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      watchRef.current?.remove?.();
    },
    [],
  );

  const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const c =
      2 *
      Math.atan2(
        Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
        Math.sqrt(1 - (sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon)),
      );
    return R * c;
  };

  const buildGpx = () => {
    const head = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Drivest">\n  <trk>\n    <name>Cashback Track</name>\n    <trkseg>\n`;
    const body = points
      .map((p) => `      <trkpt lat="${p.latitude}" lon="${p.longitude}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
      .join('\n');
    const tail = `\n    </trkseg>\n  </trk>\n</gpx>`;
    return head + body + tail;
  };

  const startTracking = async () => {
    if (!centreId) {
      setToast('Select your test centre first');
      return;
    }
    const choice = await getConsentValue(CONSENT_KEYS.locationChoice);
    if (choice !== 'allow') {
      setShowLocationPrompt(true);
      setPendingStart(true);
      return;
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    setToast('Recording started. Head to your test centre and drive the route.');
    setTracking(true);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, distanceInterval: 5, timeInterval: 1000 },
      (loc) => {
        setPoints((p) => {
          const nextPoint = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, t: Date.now() };
          const prev = p[p.length - 1];
          if (prev) {
            setDistance((d) => d + haversine(prev, nextPoint));
          }
          return [...p, nextPoint];
        });
      },
    );
    startMutation.mutate();
  };

  const stopAndSubmit = () => {
    watchRef.current?.remove?.();
    if (timerRef.current) clearInterval(timerRef.current);
    setTracking(false);
    const gpx = buildGpx();
    const avgSpeedKph = distance && elapsed ? (distance / 1000) / (elapsed / 3600) : 0;
    submitMutation.mutate({
      centreId,
      testDateTime: testDate && testTime ? `${testDate} ${testTime}` : undefined,
      trackSummary: {
        durationS: elapsed,
        distanceM: Math.round(distance),
        avgSpeedKph,
        pointCount: points.length,
      },
      pointsS3Key: null,
      gpx,
    });
  };

  const status = statusQuery.data?.status || 'NONE';
  const already = status !== 'NONE' && status !== 'PENDING';
  const centres = centresQuery.data || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing(2.5), paddingTop: spacing(3), paddingBottom: spacing(4) }}>
        <Card style={{ borderRadius: 18, marginBottom: spacing(3), elevation: 2, borderColor: colors.border, borderWidth: 1 }}>
          <Card.Content style={{ paddingVertical: spacing(2.5), paddingHorizontal: spacing(2.5) }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: colors.text,
                marginBottom: spacing(1),
              }}
            >
              💰 Earn £2 Cashback
            </Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing(1), lineHeight: 22, fontSize: 14 }}>
              Drive your test centre route to help improve our route library. Receive a one-time £2 cashback when approved.
            </Text>
            <View style={{ marginTop: spacing(2), paddingTop: spacing(2), borderTopColor: colors.border, borderTopWidth: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Claim Status</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color:
                      status === 'APPROVED'
                        ? colors.success
                        : status === 'PENDING'
                          ? colors.warning
                          : colors.error,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {status}
                </Text>
              </View>
              <ProgressBar
                progress={status === 'APPROVED' ? 1 : status === 'PENDING' ? 0.5 : 0.1}
                color={colors.primary}
                style={{ marginTop: spacing(1), height: 6, borderRadius: 3 }}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={{ borderRadius: 18, marginBottom: spacing(3), elevation: 2, borderColor: colors.border, borderWidth: 1 }}>
          <Card.Content style={{ paddingVertical: spacing(2.5), paddingHorizontal: spacing(2.5) }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.text,
                marginBottom: spacing(1),
              }}
            >
              1. Select Test Centre
            </Text>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing(1.5), fontSize: 13 }}>
              Choose the test centre you'll be driving
            </Text>
            <RadioButton.Group onValueChange={(v) => setCentreId(v)} value={centreId || ''}>
              {centres.map((c: any) => (
                <View key={c.id} style={styles.radioRow}>
                  <RadioButton value={c.id} />
                  <Text
                    style={{
                      marginLeft: spacing(1),
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {c.name}
                  </Text>
                </View>
              ))}
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={{ borderRadius: 18, marginBottom: spacing(3), elevation: 2, borderColor: colors.border, borderWidth: 1 }}>
          <Card.Content style={{ paddingVertical: spacing(2.5), paddingHorizontal: spacing(2.5) }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.text,
                marginBottom: spacing(1),
              }}
            >
              2. Schedule Your Test
            </Text>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing(1.5), fontSize: 13 }}>
              Enter your test date and time
            </Text>
            <TextInput
              label="Test Date (YYYY-MM-DD)"
              value={testDate}
              onChangeText={setTestDate}
              style={{ marginTop: spacing(1), marginBottom: spacing(1) }}
              keyboardType="numbers-and-punctuation"
              mode="outlined"
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />
            <TextInput
              label="Test time (HH:MM)"
              value={testTime}
              onChangeText={setTestTime}
              style={{ marginTop: spacing(1) }}
              keyboardType="numbers-and-punctuation"
            />
          </Card.Content>
        </Card>

        <Card style={{ borderRadius: 16 }}>
          <Card.Content>
            <Text variant="titleMedium">3)Begin your test route drive</Text>
            {!tracking ? (
              <Button mode="contained" onPress={startTracking} disabled={already} style={{ marginTop: spacing(1) }}>
                Start recording
              </Button>
            ) : (
              <>
                <Text style={{ marginVertical: spacing(1) }}>
                  Recording {elapsed}s • {(distance / 1000).toFixed(2)} km • points {points.length}
                </Text>
                <Button mode="contained" onPress={stopAndSubmit} loading={submitMutation.isPending}>
                  Submit
                </Button>
              </>
            )}
            {status === 'PENDING' && <Text style={{ marginTop: spacing(1) }}>We are reviewing your track.</Text>}
            {status === 'APPROVED' && <Text style={{ marginTop: spacing(1), color: colors.primary }}>Approved! £2 on its way.</Text>}
          </Card.Content>
        </Card>
      </ScrollView>
      <LocationConsentModal
        visible={showLocationPrompt}
        onAllow={async () => {
          const perm = await Location.requestForegroundPermissionsAsync();
          const choice = perm.status === 'granted' ? 'allow' : 'deny';
          await setConsentValue(CONSENT_KEYS.locationChoice, choice);
          await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
          setShowLocationPrompt(false);
          if (choice === 'allow' && pendingStart) {
            setPendingStart(false);
            startTracking();
          }
        }}
        onSkip={async () => {
          await setConsentValue(CONSENT_KEYS.locationChoice, 'skip');
          await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
          setShowLocationPrompt(false);
          setPendingStart(false);
        }}
      />
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={2000} style={{ bottom: '40%' }}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(0.5),
  },
  radioLabel: { flexShrink: 1 },
});

export default CashbackScreen;
