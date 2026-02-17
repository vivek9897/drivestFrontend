import React, { useMemo, useState } from 'react';
import { BackHandler, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, List, Modal, Portal, Text } from 'react-native-paper';
import * as Location from 'expo-location';
import { registerForPushNotifications } from '../../lib/notifications';
import { apiAuth } from '../../api';
import { colors, spacing } from '../../styles/theme';
import { legalDocs, legalUrls } from '../../content/legal';
import { CONSENT_KEYS, consentNow, setConsentValue } from '../../utils/consent';

type Props = {
  onComplete: () => void;
};

const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [docKey, setDocKey] = useState<keyof typeof legalDocs | null>(null);

  const steps = useMemo(
    () => [
      {
        title: 'Welcome to Drivest',
        body: `Drivest supports driving test preparation through learning tools, reconstructed routes, road signs, and quizzes.\nPlease read carefully.`,
        bullets: [
          'Drivest is an independent learning application',
          'Drivest is not affiliated with DVSA or any government authority',
          'Routes and navigation are for practice and learning only',
          'Drivest does not guarantee driving test success',
          'You remain responsible for driving safely and following the law',
        ],
        footer:
          'By continuing, you confirm you are at least 16 years old and agree to the Terms and Conditions and Privacy Policy.',
        actions: [
          {
            label: 'Accept and Continue',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.baseAcceptedAt, consentNow());
              setStep((s) => s + 1);
            },
          },
        ],
        secondary: [
          { label: 'View Terms and Conditions', onPress: () => Linking.openURL(legalUrls.terms) },
          { label: 'View Privacy Policy', onPress: () => Linking.openURL(legalUrls.privacy) },
        ],
      },
      {
        title: 'Age Requirement',
        body: 'Drivest is designed for learner drivers aged 16 and above.\nBy continuing, you confirm you are at least 16 years old.',
        actions: [
          {
            label: 'I Am 16 or Older',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.ageConfirmedAt, consentNow());
              setStep((s) => s + 1);
            },
          },
        ],
        secondary: [
          {
            label: 'Exit App',
            onPress: () => BackHandler.exitApp(),
          },
        ],
      },
      {
        title: 'Help Improve Drivest',
        body:
          'Drivest uses anonymous analytics to understand app performance and fix issues.\n• No personal identification\n• No advertising tracking\n• Used only to improve stability and features\nYou can change this preference anytime in settings.',
        actions: [
          {
            label: 'Allow Analytics',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.analyticsChoice, 'allow');
              await setConsentValue(CONSENT_KEYS.analyticsAt, consentNow());
              setStep((s) => s + 1);
            },
          },
        ],
        secondary: [
          {
            label: 'Skip',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.analyticsChoice, 'skip');
              await setConsentValue(CONSENT_KEYS.analyticsAt, consentNow());
              setStep((s) => s + 1);
            },
          },
        ],
      },
      {
        title: 'Learning Reminders',
        body:
          'Enable notifications to receive reminders about quizzes, streaks, and learning progress.\n• No marketing or promotional spam\n• You control notifications in app settings and device settings',
        actions: [
          {
            label: 'Enable Notifications',
            onPress: async () => {
              const token = await registerForPushNotifications();
              const choice = token ? 'enable' : 'skip';
              await setConsentValue(CONSENT_KEYS.notificationsChoice, choice);
              await setConsentValue(CONSENT_KEYS.notificationsAt, consentNow());
              if (token) {
                await apiAuth.updatePushToken(token);
              }
              setStep((s) => s + 1);
            },
          },
        ],
        secondary: [
          {
            label: 'Skip',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.notificationsChoice, 'skip');
              await setConsentValue(CONSENT_KEYS.notificationsAt, consentNow());
              setStep((s) => s + 1);
            },
          },
        ],
      },
      {
        title: 'Location Access for Route Practice',
        body:
          'Drivest uses your device location to show driving routes and practise navigation.\n• Location is used only when route features are active\n• Continuous location history is not stored on Drivest servers\n• Location data is not sold or used for advertising\nYou can change this permission anytime in your device settings.',
        actions: [
          {
            label: 'Allow Location Access',
            onPress: async () => {
              const perm = await Location.requestForegroundPermissionsAsync();
              const choice = perm.status === 'granted' ? 'allow' : 'deny';
              await setConsentValue(CONSENT_KEYS.locationChoice, choice);
              await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
              onComplete();
            },
          },
        ],
        secondary: [
          {
            label: 'Not Now',
            onPress: async () => {
              await setConsentValue(CONSENT_KEYS.locationChoice, 'skip');
              await setConsentValue(CONSENT_KEYS.locationAt, consentNow());
              onComplete();
            },
          },
        ],
      },
    ],
    [onComplete],
  );

  const current = steps[step];
  const totalSteps = steps.length;
  const progressPercent = ((step + 1) / totalSteps) * 100;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.stepRow}>
            <Text style={styles.stepPill}>
              Step {step + 1} of {totalSteps}
            </Text>
            <Text style={styles.stepLabel}>Account Setup</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            {current.title}
          </Text>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <Text style={styles.body}>{current.body}</Text>
              {!!current.bullets?.length && (
                <List.Section>
                  {current.bullets.map((b) => (
                    <List.Item key={b} title={b} left={(props) => <List.Icon {...props} icon="check" />} />
                  ))}
                </List.Section>
              )}
              {!!current.footer && <Text style={styles.footer}>{current.footer}</Text>}
            </Card.Content>
          </Card>
        </ScrollView>

        <View style={styles.actions}>
          {current.actions.map((a) => (
            <Button key={a.label} mode="contained" onPress={a.onPress} style={styles.primaryBtn}>
              {a.label}
            </Button>
          ))}
          {current.secondary?.map((a) => (
            <Button key={a.label} mode="outlined" onPress={a.onPress} style={styles.secondaryBtn}>
              {a.label}
            </Button>
          ))}
        </View>

        <Portal>
          <Modal visible={!!docKey} onDismiss={() => setDocKey(null)} contentContainerStyle={styles.modal}>
            {docKey && (
              <>
                <Text variant="titleLarge">{legalDocs[docKey].title}</Text>
                <Text style={styles.docVersion}>{legalDocs[docKey].version}</Text>
                <Text style={styles.docBody}>{legalDocs[docKey].body}</Text>
                <Button onPress={() => setDocKey(null)} style={{ marginTop: spacing(2) }}>
                  Close
                </Button>
              </>
            )}
          </Modal>
        </Portal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing(2.5) },
  header: {
    paddingTop: spacing(1),
    paddingBottom: spacing(1.25),
    gap: spacing(0.9),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepPill: {
    backgroundColor: colors.primaryLight,
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
    paddingVertical: spacing(0.45),
    paddingHorizontal: spacing(1),
    borderRadius: 999,
    overflow: 'hidden',
  },
  stepLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  title: {
    marginTop: spacing(0.5),
    color: colors.text,
    fontWeight: '700',
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: spacing(2) },
  card: { borderRadius: 16, backgroundColor: colors.surface },
  cardContent: { paddingVertical: spacing(2.2) },
  body: { color: colors.text, lineHeight: 22 },
  footer: { marginTop: spacing(1), color: colors.textSecondary, lineHeight: 20 },
  actions: {
    paddingTop: spacing(1.25),
    paddingBottom: spacing(1.5),
    gap: spacing(1),
    backgroundColor: colors.background,
  },
  primaryBtn: { borderRadius: 12, paddingVertical: spacing(0.4) },
  secondaryBtn: { borderRadius: 12, paddingVertical: spacing(0.35) },
  modal: {
    backgroundColor: '#fff',
    marginHorizontal: spacing(3),
    padding: spacing(3),
    borderRadius: 16,
  },
  docVersion: { color: colors.textSecondary, marginTop: spacing(0.5) },
  docBody: { color: colors.text, marginTop: spacing(1), lineHeight: 20 },
});

export default OnboardingScreen;
