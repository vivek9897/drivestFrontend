import React, { useEffect, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { Button, Text, TextInput, Card, Chip } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../styles/theme';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const AuthScreen: React.FC<any> = ({ navigation, route }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const { login, register, startGuest } = useAuth();
  const {
    control,
    handleSubmit,
    setError: setFormError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (route?.params?.mode === 'register') {
      setMode('register');
      return;
    }
    if (route?.params?.mode === 'login') {
      setMode('login');
    }
  }, [route?.params?.mode]);

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      if (mode === 'login') {
        await login(data.email, data.password);
      } else {
        if (!data.name || data.name.trim().length < 2) {
          setFormError('name', { type: 'manual', message: 'Name must be at least 2 characters.' });
          return;
        }
        await register(data.email, data.password, data.name || 'New Driver', data.phone);
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        'Unable to authenticate. Please check your details.';
      setError(msg);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/applogo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>RouteMaster</Text>
            <Text style={styles.subtitle}>Master your driving test routes with live navigation.</Text>
            <View style={styles.badges}>
              <Chip icon="map" style={styles.badge} textStyle={styles.badgeText}>
                Live Maps
              </Chip>
              <Chip icon="navigation" style={styles.badge} textStyle={styles.badgeText}>
                Turn-by-turn
              </Chip>
              <Chip icon="cash-refund" style={styles.badge} textStyle={styles.badgeText}>
                Cashback
              </Chip>
            </View>
          </View>

          <Card style={styles.card}>
            <Card.Content style={{ paddingHorizontal: spacing(2.5), paddingVertical: spacing(3) }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.text,
                  marginBottom: spacing(2),
                  textAlign: 'center',
                }}
              >
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </Text>

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Email"
                    mode="outlined"
                    value={value}
                    onChangeText={onChange}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    outlineColor={colors.border}
                    activeOutlineColor={colors.primary}
                    style={{ marginBottom: spacing(2), backgroundColor: colors.surface }}
                    textColor={colors.text}
                  />
                )}
              />
              {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Password"
                    mode="outlined"
                    secureTextEntry
                    value={value}
                    onChangeText={onChange}
                    outlineColor={colors.border}
                    activeOutlineColor={colors.primary}
                    style={{ marginBottom: spacing(2), backgroundColor: colors.surface }}
                    textColor={colors.text}
                  />
                )}
              />
              {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}

              {mode === 'register' && (
                <>
                  <Controller
                    control={control}
                    name="name"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        label="Full Name"
                        mode="outlined"
                        value={value}
                        onChangeText={onChange}
                        outlineColor={colors.border}
                        activeOutlineColor={colors.primary}
                        style={{ marginBottom: spacing(2), backgroundColor: colors.surface }}
                        textColor={colors.text}
                      />
                    )}
                  />
                  {errors.name && <Text style={styles.error}>{errors.name.message}</Text>}
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        label="Phone (Optional)"
                        mode="outlined"
                        value={value}
                        onChangeText={onChange}
                        keyboardType="phone-pad"
                        outlineColor={colors.border}
                        activeOutlineColor={colors.primary}
                        style={{ marginBottom: spacing(3), backgroundColor: colors.surface }}
                        textColor={colors.text}
                      />
                    )}
                  />
                </>
              )}

              <Button
                mode="contained"
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={{
                  marginVertical: spacing(1),
                  paddingVertical: spacing(1),
                  borderRadius: 10,
                }}
                labelStyle={{
                  fontSize: 16,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                }}
              >
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>

              <Button
                mode="outlined"
                onPress={async () => {
                  await startGuest();
                }}
                style={{
                  marginVertical: spacing(1),
                  paddingVertical: spacing(1),
                  borderRadius: 10,
                  borderColor: colors.border,
                }}
                labelStyle={{
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                Continue as guest
              </Button>

              <View style={{ marginTop: spacing(2), alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                </Text>
                <Button
                  mode="text"
                  onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
                  textColor={colors.primary}
                  style={{ marginTop: spacing(-1) }}
                  labelStyle={{
                    fontSize: 14,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
        {error && <Text style={styles.errorBanner}>{error}</Text>}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing(2),
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing(4),
    paddingTop: spacing(2),
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  title: {
    textAlign: 'center',
    marginTop: spacing(1),
    color: colors.text,
    fontWeight: '800',
    fontSize: 28,
    lineHeight: 32,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing(1),
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing(2),
    gap: spacing(1),
  },
  badge: {
    margin: 0,
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    elevation: 2,
    paddingHorizontal: spacing(0),
  },
  error: {
    color: colors.error,
    marginTop: spacing(0.5),
    fontSize: 12,
    fontWeight: '500',
  },
  logo: {
    width: 340,
    height: 340,
    marginBottom: spacing(-6),
  },
  errorBanner: {
    marginHorizontal: spacing(2),
    marginBottom: spacing(2),
    textAlign: 'center',
    color: colors.error,
    backgroundColor: colors.errorLight,
    padding: spacing(2),
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '500',
    overflow: 'hidden',
  },
});

export default AuthScreen;
