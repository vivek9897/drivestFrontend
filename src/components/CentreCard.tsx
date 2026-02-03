import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { colors, spacing } from '../styles/theme';
import { TestCentre } from '../api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  centre: TestCentre;
  onPress: () => void;
}

const CentreCard: React.FC<Props> = ({ centre, onPress }) => {
  return (
    <Card style={styles.card} onPress={onPress} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant="titleMedium" style={styles.title}>
              {centre.name}
            </Text>
            <Text style={styles.postcode}>
              <MaterialCommunityIcons name="map-marker" size={14} color={colors.primary} /> {centre.postcode}
            </Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="routes" size={16} color={colors.primary} />
            <Text style={styles.badgeText}>Routes</Text>
          </View>
        </View>
        <Text style={styles.city}>
          {centre.city}
        </Text>
      </Card.Content>
      <Card.Actions style={styles.actions}>
        <Button mode="contained" onPress={onPress} style={styles.button} labelStyle={styles.buttonLabel}>
          View routes
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  postcode: {
    color: colors.primary,
    marginTop: spacing(0.5),
    fontSize: 13,
    fontWeight: '600',
  },
  city: {
    color: colors.textSecondary,
    marginTop: spacing(0.5),
    fontSize: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(1),
    borderRadius: 8,
    gap: spacing(0.5),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  actions: {
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2),
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: spacing(0.75),
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default CentreCard;
