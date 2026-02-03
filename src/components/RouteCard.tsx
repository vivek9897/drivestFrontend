import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Card, Text, Badge } from 'react-native-paper';
import { RouteDto } from '../api';
import { colors, spacing } from '../styles/theme';
import { metersToKm, secondsToMinutes } from '../utils';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  route: RouteDto;
  locked: boolean;
  downloaded?: boolean;
  stats?: { timesCompleted?: number; lastCompletedAt?: number };
  onPress: () => void;
  onDownload?: () => void;
}

const RouteCard: React.FC<Props> = ({ route, locked, downloaded, stats, onPress, onDownload }) => {
  return (
    <Card style={styles.card} onPress={onPress} mode="elevated">
      <Card.Content style={{ paddingBottom: spacing(1.5) }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
              {route.name}
            </Text>
            <View style={styles.metadataRow}>
              <MaterialCommunityIcons name="directions" size={14} color={colors.primary} />
              <Text style={styles.metadata}>{metersToKm(route.distanceM)}</Text>
              <View style={{ width: 4 }} />
              <MaterialCommunityIcons name="clock-outline" size={14} color={colors.primary} />
              <Text style={styles.metadata}>{secondsToMinutes(route.durationEstS)}</Text>
            </View>
          </View>
          <View style={styles.badgesRow}>
            {locked && (
              <Badge style={styles.lockedBadge}>
                <MaterialCommunityIcons name="lock" size={10} color="#fff" />
              </Badge>
            )}
            {downloaded && (
              <Badge style={styles.downloadedBadge}>
                <MaterialCommunityIcons name="download" size={10} color="#fff" />
              </Badge>
            )}
          </View>
        </View>
        {stats && stats.timesCompleted ? (
          <View style={styles.statsContainer}>
            <MaterialCommunityIcons name="check-circle" size={14} color={colors.success} />
            <Text style={styles.statsText}>
              Completed {stats.timesCompleted}× {stats.lastCompletedAt ? `• ${new Date(stats.lastCompletedAt).toLocaleDateString()}` : ''}
            </Text>
          </View>
        ) : null}
      </Card.Content>
      <Card.Actions style={styles.actions}>
        {onDownload && (
          <Button
            mode={downloaded ? 'outlined' : 'contained-tonal'}
            onPress={onDownload}
            disabled={locked || downloaded}
            style={styles.button}
            labelStyle={styles.buttonLabel}
          >
            {downloaded ? 'Downloaded' : 'Download'}
          </Button>
        )}
        <Button
          mode="contained"
          onPress={onPress}
          disabled={locked}
          style={styles.button}
          labelStyle={styles.buttonLabel}
        >
          {locked ? 'Unlock' : 'Start'}
        </Button>
      </Card.Actions>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing(2),
    borderRadius: 16,
    backgroundColor: colors.surface,
    elevation: 2,
    borderColor: colors.border,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing(0.75),
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.5),
  },
  metadata: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.5),
  },
  lockedBadge: {
    backgroundColor: colors.error,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  downloadedBadge: {
    backgroundColor: colors.success,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.75),
    marginTop: spacing(1.5),
    paddingTop: spacing(1.5),
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  statsText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actions: {
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(1.5),
    gap: spacing(1),
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: spacing(0.75),
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default RouteCard;
