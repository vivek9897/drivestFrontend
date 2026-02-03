import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Alert, View, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text, TextInput, Divider, List, Portal, Modal, Switch } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useForm, Controller } from 'react-hook-form';
import { apiAuth } from '../api';
import { spacing, colors } from '../styles/theme';
import { useEntitlements } from '../hooks/useEntitlements';
import { openCustomerCenter, presentPaywall, restore } from '../lib/revenuecat';
import { legalDocs, legalUrls } from '../content/legal';
import { CONSENT_KEYS, consentNow, getConsentValue, setConsentValue } from '../utils/consent';
import { registerForPushNotifications } from '../lib/notifications';
import { clearLogsAsync, exportLogsAsync, getLogFileUri } from '../lib/appLogger';

const SettingsScreen: React.FC<any> = ({ navigation }) => {
  const { user, logout, refresh, guest } = useAuth();
  const entitlements = useEntitlements();
  const { control, handleSubmit } = useForm({ defaultValues: { name: user?.name || '', phone: user?.phone || '' } });
  const [docKey, setDocKey] = useState<keyof typeof legalDocs | null>(null);
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);

  useEffect(() => {
    (async () => {
      const analyticsChoice = await getConsentValue(CONSENT_KEYS.analyticsChoice);
      const notificationsChoice = await getConsentValue(CONSENT_KEYS.notificationsChoice);
      setAnalyticsOn(analyticsChoice === 'allow');
      setNotificationsOn(notificationsChoice === 'enable');
    })();
  }, []);

  const onSave = async (data: any) => {
    await apiAuth.updateMe(data);
    await refresh();
  };

  const onDelete = async () => {
    Alert.alert('Delete account', 'This will remove your data', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await apiAuth.deleteMe();
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Auth', params: { mode: 'login' } }] });
        },
      },
    ]);
  };

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Auth', params: { mode: 'login' } }] });
  };

  const onExportLogs = async () => {
    try {
      const result = await exportLogsAsync();
      if (!result.shared) {
        Alert.alert('Logs saved', `Log file: ${result.uri}`);
      }
    } catch (error) {
      Alert.alert('Export failed', 'Unable to share logs right now.');
      console.warn('export logs failed', error);
    }
  };

  const onClearLogs = async () => {
    Alert.alert('Clear logs', 'This will remove local diagnostic logs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearLogsAsync();
          Alert.alert('Logs cleared', `Log file: ${getLogFileUri()}`);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing(3), paddingBottom: spacing(5) }}>
      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1.5) }}>Profile</Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <TextInput label="Name" mode="outlined" value={value} onChangeText={onChange} style={{ marginTop: spacing(1.5), marginBottom: spacing(1) }} />
            )}
          />
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <TextInput label="Phone" mode="outlined" value={value} onChangeText={onChange} style={{ marginTop: spacing(1), marginBottom: spacing(1.5) }} />
            )}
          />
          <Button
            mode="contained"
            style={{ marginTop: spacing(1.5), borderRadius: 10 }}
            labelStyle={{ fontSize: 15, fontWeight: '600' }}
            onPress={handleSubmit(onSave)}
            disabled={guest}
          >
            Save Changes
          </Button>
        </Card.Content>
      </Card>
      {guest && (
        <Card style={styles.card}>
          <Card.Content style={{ paddingVertical: spacing(2) }}>
            <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1) }}>Guest Mode</Text>
            <Text style={{ color: colors.muted, marginTop: spacing(0.5), fontSize: 14, lineHeight: 20 }}>
              Sign in to unlock purchases and save your profile.
            </Text>
            <Button
              mode="contained"
              style={{ marginTop: spacing(2), borderRadius: 10 }}
              labelStyle={{ fontSize: 15, fontWeight: '600' }}
              onPress={() => navigation.navigate('Auth', { mode: 'register' })}
            >
              Create Account
            </Button>
          </Card.Content>
        </Card>
      )}

      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1.5) }}>Subscription</Text>
          <View style={{ marginBottom: spacing(1.5), backgroundColor: colors.backgroundAlt, padding: spacing(1.5), borderRadius: 12 }}>
            {entitlements.data?.length ? (
              entitlements.data.map((ent) => (
                <Text key={ent.id} style={{ color: colors.text, fontSize: 13, lineHeight: 18, marginBottom: spacing(0.5) }}>
                  • {ent.scope} {ent.centreId ? `for centre ${ent.centreId}` : ''} until {ent.endsAt || 'ongoing'}
                </Text>
              ))
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>No active entitlements</Text>
            )}
          </View>
          <Button
            mode="outlined"
            onPress={() => restore()}
            style={{ marginTop: spacing(1), borderRadius: 10 }}
            labelStyle={{ fontSize: 14 }}
          >
            Restore Purchases
          </Button>
          <Button
            mode="outlined"
            style={{ marginTop: spacing(1), borderRadius: 10 }}
            labelStyle={{ fontSize: 14 }}
            onPress={async () => {
              const ok = await presentPaywall();
              if (!ok) Alert.alert('Paywall', 'No purchase made.');
            }}
          >
            Open Paywall
          </Button>
          <Button
            mode="outlined"
            style={{ marginTop: spacing(1), borderRadius: 10 }}
            labelStyle={{ fontSize: 14 }}
            onPress={() => openCustomerCenter()}
          >
            Manage Subscription
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1.5) }}>Privacy Controls</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" style={{ fontSize: 15, fontWeight: '600' }}>Analytics</Text>
              <Text style={[styles.muted, { marginTop: spacing(0.25) }]}>Help improve app stability</Text>
            </View>
            <Switch
              value={analyticsOn}
              onValueChange={async (value) => {
                setAnalyticsOn(value);
                await setConsentValue(CONSENT_KEYS.analyticsChoice, value ? 'allow' : 'skip');
                await setConsentValue(CONSENT_KEYS.analyticsAt, consentNow());
                if (!guest) {
                  await apiAuth.updateConsents({
                    analyticsChoice: value ? 'allow' : 'skip',
                    analyticsAt: consentNow(),
                  });
                }
              }}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" style={{ fontSize: 15, fontWeight: '600' }}>Notifications</Text>
              <Text style={[styles.muted, { marginTop: spacing(0.25) }]}>Learning reminders and streaks</Text>
            </View>
            <Switch
              value={notificationsOn}
              onValueChange={async (value) => {
                if (value) {
                  const token = await registerForPushNotifications();
                  const enabled = Boolean(token);
                  setNotificationsOn(enabled);
                  await setConsentValue(CONSENT_KEYS.notificationsChoice, enabled ? 'enable' : 'skip');
                  await setConsentValue(CONSENT_KEYS.notificationsAt, consentNow());
                  if (!guest) {
                    await apiAuth.updateConsents({
                      notificationsChoice: enabled ? 'enable' : 'skip',
                      notificationsAt: consentNow(),
                    });
                    if (token) {
                      await apiAuth.updatePushToken(token);
                    }
                  }
                } else {
                  setNotificationsOn(false);
                  await setConsentValue(CONSENT_KEYS.notificationsChoice, 'skip');
                  await setConsentValue(CONSENT_KEYS.notificationsAt, consentNow());
                  if (!guest) {
                    await apiAuth.updateConsents({
                      notificationsChoice: 'skip',
                      notificationsAt: consentNow(),
                    });
                    await apiAuth.updatePushToken(null);
                  }
                }
              }}
            />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2), paddingHorizontal: spacing(1) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1.5), marginLeft: spacing(1) }}>Legal & Support</Text>
          <List.Section>
            <List.Item
              title="Terms and Conditions"
              description="Read the full terms"
              left={(props) => <List.Icon {...props} icon="file-document" />}
              onPress={() => Linking.openURL(legalUrls.terms)}
            />
            <List.Item
              title="Privacy Policy"
              description="How your data is handled"
              left={(props) => <List.Icon {...props} icon="shield" />}
              onPress={() => Linking.openURL(legalUrls.privacy)}
            />
            <List.Item
              title="Contact Support"
              description="admin@drivest.uk"
              left={(props) => <List.Icon {...props} icon="email" />}
              onPress={() => setDocKey('contact')}
            />
          </List.Section>
          <Divider style={{ marginVertical: spacing(1) }} />
          <List.Section>
            <List.Item
              title="Your Data Rights"
              description="Access, correction, or deletion"
              left={(props) => <List.Icon {...props} icon="account-lock" />}
              onPress={() => setDocKey('dataRights')}
            />
            <List.Item
              title="Content Accuracy Notice"
              description="How content is sourced"
              left={(props) => <List.Icon {...props} icon="alert-circle" />}
              onPress={() => setDocKey('contentAccuracy')}
            />
            <List.Item
              title="Payments and Subscriptions"
              description="Billing and refunds"
              left={(props) => <List.Icon {...props} icon="credit-card" />}
              onPress={() => setDocKey('payments')}
            />
            <List.Item
              title="Service Availability"
              description="Reliability and changes"
              left={(props) => <List.Icon {...props} icon="server" />}
              onPress={() => setDocKey('availability')}
            />
            <List.Item
              title="About Drivest"
              description="Company details"
              left={(props) => <List.Icon {...props} icon="information" />}
              onPress={() => setDocKey('about')}
            />
          </List.Section>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content style={{ paddingVertical: spacing(2) }}>
          <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1) }}>Diagnostics</Text>
          <Text style={[styles.muted, { fontSize: 14, lineHeight: 20, marginBottom: spacing(1.5) }]}>Export logs to share crashes or issues.</Text>
          <Button mode="outlined" style={{ marginTop: spacing(1), borderRadius: 10 }} labelStyle={{ fontSize: 14 }} onPress={onExportLogs}>
            Export Logs
          </Button>
          <Button style={{ marginTop: spacing(1), borderRadius: 10 }} labelStyle={{ fontSize: 14 }} onPress={onClearLogs}>
            Clear Logs
          </Button>
        </Card.Content>
      </Card>

      {!guest && (
        <Card style={styles.card}>
          <Card.Content style={{ paddingVertical: spacing(2) }}>
            <Text variant="headlineSmall" style={{ fontSize: 20, fontWeight: '700', marginBottom: spacing(1.5) }}>Account</Text>
            <Button textColor={colors.danger} style={{ borderRadius: 10 }} labelStyle={{ fontSize: 14 }} onPress={onDelete}>
              Delete Account
            </Button>
            <Button style={{ borderRadius: 10, marginTop: spacing(1) }} labelStyle={{ fontSize: 14 }} onPress={onLogout}>Log Out</Button>
          </Card.Content>
        </Card>
      )}

      <Portal>
        <Modal visible={!!docKey} onDismiss={() => setDocKey(null)} contentContainerStyle={styles.modal}>
          {docKey && (
            <>
              <Text variant="titleLarge">{legalDocs[docKey].title}</Text>
              <Text style={styles.docVersion}>{legalDocs[docKey].version}</Text>
              <Text style={styles.docBody}>{legalDocs[docKey].body}</Text>
              <Button style={{ marginTop: spacing(2) }} onPress={() => setDocKey(null)}>
                Close
              </Button>
            </>
          )}
        </Modal>
      </Portal>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  card: { marginBottom: spacing(2), borderRadius: 18, elevation: 2, borderColor: colors.border, borderWidth: 1 },
  muted: { color: colors.muted, fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(1.5),
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  modal: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing(3),
    padding: spacing(3),
    borderRadius: 18,
    elevation: 4,
    borderColor: colors.border,
    borderWidth: 1,
  },
  docVersion: { color: colors.muted, marginTop: spacing(0.5), fontSize: 12 },
  docBody: { color: colors.text, marginTop: spacing(1), fontSize: 14, lineHeight: 20 },
});

export default SettingsScreen;
