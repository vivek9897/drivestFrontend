export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export const requestForegroundPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);

export const requestBackgroundPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);

export const getCurrentPositionAsync = jest.fn(() =>
  Promise.resolve({
    coords: {
      latitude: 51.5074,
      longitude: -0.1278,
      altitude: 0,
      accuracy: 10,
      altitudeAccuracy: 0,
      heading: 0,
      speed: 0,
    },
    timestamp: Date.now(),
  })
);

export const watchPositionAsync = jest.fn(() =>
  Promise.resolve({ remove: jest.fn() })
);

export const getLastKnownPositionAsync = jest.fn(() => Promise.resolve(null));

export const hasServicesEnabledAsync = jest.fn(() => Promise.resolve(true));

export default {
  Accuracy,
  requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
  getLastKnownPositionAsync,
  hasServicesEnabledAsync,
};
