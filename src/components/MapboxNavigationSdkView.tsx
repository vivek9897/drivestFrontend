import React from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  requireNativeComponent,
  View,
  ViewProps,
} from 'react-native';

const CANDIDATE_COMPONENT_NAMES = ['DrivestNavigationView'] as const;

type UIManagerWithHasViewManagerConfig = typeof UIManager & {
  hasViewManagerConfig?: (viewManagerName: string) => boolean;
};

const uiManager = UIManager as UIManagerWithHasViewManagerConfig;

const hasRegisteredViewManager = (componentName: string): boolean => {
  if (Platform.OS === 'web') return false;

  try {
    if (typeof uiManager.hasViewManagerConfig === 'function') {
      return !!uiManager.hasViewManagerConfig(componentName);
    }
    return !!uiManager.getViewManagerConfig?.(componentName);
  } catch {
    return false;
  }
};

const isNativeRuntime = Platform.OS !== 'web';

export type MapboxNavSdkEvent = {
  nativeEvent: {
    latitude: number;
    longitude: number;
    distanceRemaining?: number;
    durationRemaining?: number;
    fractionTraveled?: number;  // Route progress as fraction (0.0 to 1.0)
    instruction?: string;
    instructionSecondary?: string;
    distanceToInstruction?: number;
    voiceInstruction?: string;
    voiceInstructionText?: string;
    voiceInstructionSsml?: string;
    voiceDistanceAlongGeometry?: number;
    maneuverType?: string;
    maneuverModifier?: string;
    roundaboutExit?: number;
    nativeBannerVisible?: boolean;
    nativeBannerActuallyVisible?: boolean;
    nativeFallbackBannerVisible?: boolean;
    nativeBannerWidth?: number;
    nativeBannerHeight?: number;
    nativeBannerChildCount?: number;
    nativeRootWidth?: number;
    nativeRootHeight?: number;
    nativeTripVisible?: boolean;
    nativeTripActuallyVisible?: boolean;
    nativeTripWidth?: number;
    nativeTripHeight?: number;
    nativeMode?: string;
    nativeManeuverCount?: number;
  };
};

export type MapboxNavSdkProps = ViewProps & {
  accessToken?: string;
  styleURL?: string;
  navigationMode?: 'PREVIEW' | 'TO_START' | 'ON_ROUTE';
  origin: [number, number];
  destination: [number, number];
  destinationName?: string;
  routeCoordinates?: [number, number][];
  waypoints?: [number, number][];
  shouldSimulateRoute?: boolean;
  isMuted?: boolean;
  rerouteEnabled?: boolean;
  onProgressChange?: (event: MapboxNavSdkEvent) => void;
};

let componentName: string | null = null;
let NativeView: React.ComponentType<MapboxNavSdkProps> | null = null;

const resolveNativeView = (): boolean => {
  if (!isNativeRuntime) return false;
  if (NativeView && componentName) return true;

  for (const candidate of CANDIDATE_COMPONENT_NAMES) {
    // Try requiring directly first. UIManager introspection can return false-negatives
    // in some release/new-arch builds even when the native view is present.
    try {
      NativeView = requireNativeComponent(candidate) as React.ComponentType<MapboxNavSdkProps>;
      componentName = candidate;
      return true;
    } catch {
      if (!hasRegisteredViewManager(candidate)) {
        continue;
      }
      NativeView = null;
    }
  }

  return false;
};

resolveNativeView();

export const isMapboxNavSdkReady = (): boolean => resolveNativeView();
export const isMapboxNavSdkAvailable = isMapboxNavSdkReady();

const MapboxNavigationSdkView: React.FC<MapboxNavSdkProps> = (props) => {
  if (!resolveNativeView() || !NativeView || !componentName) {
    return <View style={props.style} />;
  }
  return (
    <NativeView
      {...props}
      collapsable={false}
      style={[styles.nativeView, props.style]}
    />
  );
};

const styles = StyleSheet.create({
  nativeView: {
    flex: 1,
    minWidth: 1,
    minHeight: 1,
  },
});

export default MapboxNavigationSdkView;
