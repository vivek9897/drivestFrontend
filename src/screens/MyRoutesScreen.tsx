import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Switch, Divider, Card } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiCentres, apiRoutes } from '../api';
import { getDownloadedRoutes, getRouteStats } from '../db';
import RouteCard from '../components/RouteCard';
import { spacing, colors } from '../styles/theme';
import { hasAccessToCentre, useEntitlements } from '../hooks/useEntitlements';
import { useMemo } from 'react';

const MyRoutesScreen: React.FC<any> = ({ navigation }) => {
  const [filterDownloaded, setFilterDownloaded] = React.useState(false);
  const [filterActive, setFilterActive] = React.useState(true);
  const entitlements = useEntitlements();
  const centresQuery = useQuery({ queryKey: ['centres-mini'], queryFn: () => apiCentres.search({}).then((res) => (res.data as any).data?.items || (res.data as any)) });
  const [offlineRoutes, setOfflineRoutes] = React.useState<any[]>([]);
  const [stats, setStats] = React.useState<any[]>([]);

  const { accessByCentre, centreById } = useMemo(() => {
    const accessMap = new Map<string, boolean>();
    const centreMap = new Map<string, any>();
    (centresQuery.data || []).forEach((c: any) => {
      centreMap.set(c.id, c);
      accessMap.set(c.id, hasAccessToCentre(entitlements.data, c.id));
    });
    return { accessByCentre: accessMap, centreById: centreMap };
  }, [centresQuery.data, entitlements.data]);

  React.useEffect(() => {
    getDownloadedRoutes().then(setOfflineRoutes);
    getRouteStats().then(setStats);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(2.5), paddingTop: spacing(3) }}>
        <Card style={styles.filterCard} mode="elevated">
          <Card.Content style={{ paddingVertical: spacing(1.5), paddingHorizontal: spacing(2) }}>
            <View style={styles.filters}>
              <View style={styles.filterRow}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.text,
                  }}
                >
                  Downloaded only
                </Text>
                <Switch
                  value={filterDownloaded}
                  onValueChange={(v) => {
                    const next = !!v;
                    setFilterDownloaded(next);
                    if (next) setFilterActive(false);
                  }}
                />
              </View>
              <View style={styles.filterRow}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.text,
                  }}
                >
                  Active access
                </Text>
                <Switch
                  value={filterActive}
                  onValueChange={(v) => {
                    const next = !!v;
                    setFilterActive(next);
                    if (next) setFilterDownloaded(false);
                  }}
                />
              </View>
            </View>
          </Card.Content>
        </Card>

        {filterDownloaded && offlineRoutes.length > 0 && (
          <View style={{ marginTop: spacing(2.5), marginBottom: spacing(1.5) }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: spacing(1.5),
                marginLeft: spacing(1),
              }}
            >
              Downloaded Routes
            </Text>
            {offlineRoutes.map((r) => {
              const hasAccess = accessByCentre.get(r.centreId) ?? false;
              if (filterActive && !hasAccess) return null;
              const centre = centreById.get(r.centreId);
              return (
                <RouteCard
                  key={r.id}
                  route={r}
                  locked={!hasAccess}
                  downloaded
                  stats={stats.find((s) => s.routeId === r.id)}
                  onPress={() =>
                    hasAccess || r.downloaded
                      ? navigation.navigate('RouteDetail', { route: r, centre })
                      : centre
                      ? navigation.navigate('CentreDetail', { centre })
                      : null
                  }
                />
              );
            })}
          </View>
        )}

        {centresQuery.data?.map((c: any) => (
          <RoutesForCentre
            key={c.id}
            centreId={c.id}
            centre={c}
            centreName={c.name}
            navigation={navigation}
            hasAccess={accessByCentre.get(c.id) ?? false}
            filterDownloaded={filterDownloaded}
            offlineRoutes={offlineRoutes}
            stats={stats}
            filterActive={filterActive}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const RoutesForCentre: React.FC<any> = ({
  centreId,
  centre,
  centreName,
  navigation,
  hasAccess,
  filterDownloaded,
  offlineRoutes,
  stats,
  filterActive,
}) => {
  const routesQuery = useQuery({
    queryKey: ['centre-routes', centreId],
    queryFn: () => apiCentres.routes(centreId).then((res) => res.data.data || (res.data as any)),
  });
  if (filterActive && !hasAccess) return null;
  const downloadedIds = new Set((offlineRoutes || []).map((r: any) => r.id));

  const rendered = (routesQuery.data || []).map((r: any) => {
    const isDownloaded = downloadedIds.has(r.id);
    if (filterDownloaded && !isDownloaded) return null;
    return (
      <RouteCard
        key={r.id}
        route={r}
        locked={!hasAccess}
        downloaded={isDownloaded}
        stats={stats.find((s: any) => s.routeId === r.id)}
        onPress={() =>
          hasAccess || isDownloaded
            ? navigation.navigate('RouteDetail', { route: r, centre })
            : navigation.navigate('CentreDetail', { centre })
        }
      />
    );
  }).filter(Boolean);

  if (!rendered.length) return null;

  return (
    <View style={{ marginTop: spacing(2.5), marginBottom: spacing(1) }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: spacing(1.5),
          marginLeft: spacing(1),
        }}
      >
        {centreName}
      </Text>
      {rendered}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterCard: {
    borderRadius: 16,
    elevation: 2,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: spacing(2),
  },
  filters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing(2),
  },
  filterRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default MyRoutesScreen;
