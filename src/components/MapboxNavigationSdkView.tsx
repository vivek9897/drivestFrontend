import React from 'react';
import { Platform, UIManager, requireNativeComponent, View, ViewProps } from 'react-native';

const COMPONENT_NAME = 'DrivestNavigationView';
const isSupported =
  Platform.OS !== 'web' && !!UIManager.getViewManagerConfig?.(COMPONENT_NAME);

const NativeView = isSupported
  ? (requireNativeComponent(COMPONENT_NAME) as React.ComponentType<MapboxNavSdkProps>)
  : null;

export type MapboxNavSdkEvent = {
  nativeEvent: {
    latitude: number;
    longitude: number;
    distanceRemaining?: number;
    durationRemaining?: number;
    instruction?: string;
    instructionSecondary?: string;
    distanceToInstruction?: number;
    voiceInstruction?: string;
    voiceDistanceAlongGeometry?: number;
    maneuverType?: string;
    maneuverModifier?: string;
    roundaboutExit?: number;
  };
};

export type MapboxNavSdkProps = ViewProps & {
  accessToken?: string;
  origin: [number, number];
  destination: [number, number];
  waypoints?: [number, number][];
  shouldSimulateRoute?: boolean;
  isMuted?: boolean;
  rerouteEnabled?: boolean;
  onProgressChange?: (event: MapboxNavSdkEvent) => void;
};

export const isMapboxNavSdkAvailable = isSupported;

const MapboxNavigationSdkView: React.FC<MapboxNavSdkProps> = (props) => {
  if (!NativeView) return <View style={props.style} />;
  return <NativeView {...props} />;
};

export default MapboxNavigationSdkView;
