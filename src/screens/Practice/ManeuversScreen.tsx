import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Button, IconButton } from 'react-native-paper';
import { colors, spacing } from '../../styles/theme';
import { useNavigation } from '@react-navigation/native';
import { maneuvers as interactiveManeuvers } from '../../content/maneuvers';

const ManeuversScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <FlatList
        data={interactiveManeuvers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(6), paddingTop: spacing(3) }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing(2.5) }}>
            <View style={styles.headerRow}>
              <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: colors.text,
                  flex: 1,
                }}
              >
                Practice Modules
              </Text>
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: spacing(1),
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              Interactive practice cards and guided walkthroughs to master essential maneuvers.
            </Text>
            <View style={{ marginTop: spacing(2.5) }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.text,
                }}
              >
                Maneuvers
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing(0.5), fontSize: 13 }}>
                Tap any maneuver to practice with animations
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content style={{ paddingVertical: spacing(2), paddingHorizontal: spacing(2.5) }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.text,
                }}
              >
                {item.title}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing(0.75), fontSize: 13, lineHeight: 20 }}>
                {item.officialText}
              </Text>
              <Button
                mode="contained"
                style={{ marginTop: spacing(1.5), borderRadius: 10, paddingVertical: spacing(0.75) }}
                labelStyle={{ fontSize: 14, fontWeight: '700' }}
                onPress={() => navigation.navigate('ManeuverDetail', { id: item.id })}
              >
                Practice Now
              </Button>
            </Card.Content>
          </Card>
        )}
        ListFooterComponent={
          <View>
            <Card style={styles.card}>
              <Card.Content style={{ paddingVertical: spacing(2), paddingHorizontal: spacing(2.5) }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: colors.text,
                  }}
                >
                  🛑 Road Signs
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: spacing(0.75), fontSize: 13, lineHeight: 20 }}>
                  Flip through UK road signs with detailed explanations. Test your knowledge on all major signs.
                </Text>
                <Button
                  mode="contained"
                  style={{ marginTop: spacing(1.5), borderRadius: 10, paddingVertical: spacing(0.75) }}
                  labelStyle={{ fontSize: 14, fontWeight: '700' }}
                  onPress={() => {
                    const parent = navigation.getParent();
                    const root = parent?.getParent?.();
                    if (root) {
                      root.navigate('RoadSigns');
                    } else if (parent) {
                      parent.navigate('RoadSigns');
                    } else {
                      navigation.navigate('RoadSigns');
                    }
                  }}
                >
                  Start Learning Signs
                </Button>
              </Card.Content>
            </Card>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    marginBottom: spacing(2),
    borderRadius: 18,
    elevation: 2,
    borderColor: colors.border,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default ManeuversScreen;
