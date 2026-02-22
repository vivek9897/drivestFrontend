import React, { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, IconButton, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RouteDto } from '../../api';
import { getRouteCoords } from '../../utils';
import { colors, spacing } from '../../styles/theme';
import { openDrivestNativeFlow, isDrivestNativeFlowAvailable } from '../../lib/drivestNativeFlow';

type Props = NativeStackScreenProps<any>;

const formatDistanceMiles = (meters?: number): string => {
  if (!meters || !Number.isFinite(meters)) return '--';
  return `${(meters / 1609.344).toFixed(1)} mi`;
};

const formatDuration = (seconds?: number): string => {
  if (!seconds || !Number.isFinite(seconds)) return '--';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
};

const PracticeScreen: React.FC<Props> = ({ route, navigation }) => {
  const routeDto = route?.params?.route as RouteDto | undefined;
  const [opening, setOpening] = useState(false);

  const routePointCount = useMemo(() => {
    if (!routeDto) return 0;
    return getRouteCoords(routeDto).length;
  }, [routeDto]);

  const handleOpenNative = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android Only', 'MapboxDrivest native flow is currently wired for Android.');
      return;
    }
    if (!isDrivestNativeFlowAvailable()) {
      Alert.alert('Native Flow Unavailable', 'Drivest native Mapbox flow is not available in this build.');
      return;
    }
    try {
      setOpening(true);
      await openDrivestNativeFlow({
        screen: 'main',
        centreId: routeDto?.centreId,
        routeId: routeDto?.id,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not open native flow';
      Alert.alert('Failed', message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <Text style={styles.title}>Drivest Native Mapbox Flow</Text>
          <Text style={styles.subtitle}>
            Practice/preview/navigation now runs via the imported MapboxDrivest native implementation.
          </Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Route</Text>
            <Text style={styles.infoValue}>{routeDto?.name || '--'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Distance</Text>
            <Text style={styles.infoValue}>{formatDistanceMiles(routeDto?.distanceM)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Estimated</Text>
            <Text style={styles.infoValue}>{formatDuration(routeDto?.durationEstS)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Points</Text>
            <Text style={styles.infoValue}>{routePointCount || '--'}</Text>
          </View>
          <Button
            mode="contained"
            loading={opening}
            disabled={opening}
            onPress={handleOpenNative}
            style={styles.actionButton}
            labelStyle={styles.actionButtonLabel}
          >
            Open Native Navigation
          </Button>
        </Card.Content>
      </Card>
      <IconButton
        icon="close"
        size={28}
        iconColor={colors.text}
        style={styles.closeButton}
        onPress={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing(2),
  },
  card: {
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cardContent: {
    gap: spacing(1),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing(1),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  actionButton: {
    marginTop: spacing(1.5),
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  actionButtonLabel: {
    fontWeight: '700',
  },
  closeButton: {
    position: 'absolute',
    right: spacing(2),
    bottom: spacing(4),
    backgroundColor: colors.surface,
  },
});

export default PracticeScreen;
