import React, { useEffect, useMemo, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { Animated, ImageBackground, StyleSheet, View } from 'react-native';
import AuthScreen from '../screens/AuthScreen';
import ExploreScreen from '../screens/Explore/ExploreScreen';
import CentreDetailScreen from '../screens/Explore/CentreDetailScreen';
import RouteDetailScreen from '../screens/Explore/RouteDetailScreen';
import PracticeScreen from '../screens/Practice/PracticeScreen';
import ManeuversScreen from '../screens/Practice/ManeuversScreen';
import ParallelParkingPracticeScreen from '../screens/Practice/ParallelParkingPracticeScreen';
import RoadSignsScreen from '../screens/Practice/RoadSignsScreen';
import ManeuverDetailScreen from '../screens/Practice/ManeuverDetailScreen';
import MyRoutesScreen from '../screens/MyRoutesScreen';
import CashbackScreen from '../screens/CashbackScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import { colors } from '../styles/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ExpoSplashScreen from 'expo-splash-screen';
import OnboardingScreen from '../screens/Onboarding/OnboardingScreen';
import { buildConsentPayload, isOnboardingComplete } from '../utils/consent';
import { apiAuth } from '../api';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

const TabNavigator = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  return (
  <Tab.Navigator
    initialRouteName={isAdmin ? 'Admin' : 'Explore'}
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: '#fff' },
      tabBarIcon: ({ color, size }) => {
        const icons: Record<string, any> = {
          Explore: 'map-search-outline',
          MyRoutes: 'routes',
          PracticeTab: 'steering',
          Cashback: 'cash-refund',
          Settings: 'cog-outline',
          Admin: 'shield-account',
        };
        const name = icons[route.name] || 'circle';
        return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
      },
    })}
  >
    {isAdmin && <Tab.Screen name="Admin" component={AdminDashboardScreen} />}
    <Tab.Screen name="Explore" component={ExploreScreen} />
    <Tab.Screen name="MyRoutes" component={MyRoutesScreen} options={{ title: 'My Routes' }} />
    <Tab.Screen name="PracticeTab" component={ManeuversScreen} options={{ title: 'Practice' }} />
    <Tab.Screen name="Cashback" component={CashbackScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
  );
};

const NavigationRoot = () => {
  const { user, loading, guest } = useAuth();
  const [ready, setReady] = useState(false);
  const [fadeDone, setFadeDone] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const splashOpacity = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (user) {
        const localDone = await isOnboardingComplete();
        const serverDone = Boolean(user.baseAcceptedAt && user.ageConfirmedAt);
        const done = localDone || serverDone;
        if (localDone && !serverDone) {
          try {
            const payload = await buildConsentPayload();
            await apiAuth.updateConsents(payload);
          } catch {
            // keep local onboarding state, retry later
          }
        }
        if (active) setOnboardingDone(done);
        return;
      }
      if (active) setOnboardingDone(true);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!loading && ready && onboardingDone !== null) {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setFadeDone(true);
        ExpoSplashScreen.hideAsync().catch(() => {});
      });
    }
  }, [loading, ready, onboardingDone, splashOpacity]);

  const BootSplash = () => (
    <View style={styles.bootSplash}>
      <Animated.View style={[styles.bootSplashContent, { opacity: splashOpacity }]}>
        <ImageBackground
          source={require('../../assets/applogo.png')}
          style={styles.bootSplashLogo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );

  if (loading || !ready || onboardingDone === null || !fadeDone) {
    return <BootSplash />;
  }

  if (user && !onboardingDone) {
    return (
      <OnboardingScreen
        onComplete={async () => {
          try {
            const payload = await buildConsentPayload();
            await apiAuth.updateConsents(payload);
            setOnboardingDone(true);
          } catch {
            // keep onboarding visible if backend update fails
            setOnboardingDone(false);
          }
        }}
      />
    );
  }

  const isAuthed = Boolean(user) || guest;

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: '#f5f7ff' },
      }}
    >
      <Stack.Navigator
        key={isAuthed ? 'user' : 'guest'}
        initialRouteName={isAuthed ? 'Main' : 'Auth'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="CentreDetail" component={CentreDetailScreen} />
        <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />
        <Stack.Screen name="Practice" component={PracticeScreen} />
        <Stack.Screen name="Maneuvers" component={ManeuversScreen} />
        <Stack.Screen name="ParallelParkingPractice" component={ParallelParkingPracticeScreen} />
        <Stack.Screen name="RoadSigns" component={RoadSignsScreen} />
        <Stack.Screen name="ManeuverDetail" component={ManeuverDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  bootSplash: {
    flex: 1,
    backgroundColor: '#f2f6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootSplashContent: {
    alignItems: 'center',
  },
  bootSplashLogo: {
    width: 360,
    height: 360,
  },
});

export default NavigationRoot;
