const React = require('react');
const { View } = require('react-native');

export const SafeAreaView = ({ children, style, ...props }: any) =>
  React.createElement(View, { style, ...props }, children);

export const SafeAreaProvider = ({ children }: any) => children;

export const useSafeAreaInsets = () => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export const useSafeAreaFrame = () => ({
  x: 0,
  y: 0,
  width: 390,
  height: 844,
});

export const initialWindowMetrics = {
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
