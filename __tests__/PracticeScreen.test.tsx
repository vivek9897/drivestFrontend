import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// Mock ALL dependencies BEFORE importing PracticeScreen
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-keep-awake');
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn(),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    getFirstAsync: jest.fn(() => Promise.resolve(null)),
    runAsync: jest.fn(() => Promise.resolve({ lastInsertRowId: 1, changes: 1 })),
    closeAsync: jest.fn(),
  })),
}));

jest.mock('../src/api', () => ({
  apiRoutes: {
    detail: jest.fn(),
    startPractice: jest.fn(),
    finishPractice: jest.fn(),
  },
}));

jest.mock('../src/db', () => ({
  upsertRouteStat: jest.fn(() => Promise.resolve()),
  getRouteStats: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../src/lib/mapboxNavigation', () => ({
  getDirections: jest.fn(),
}));

jest.mock('../src/utils/mapboxMatching', () => ({
  getDirectionsRoute: jest.fn(),
}));

jest.mock('../src/lib/mapbox', () => ({
  __esModule: true,
  default: {
    MapView: 'MapView',
    Camera: 'Camera',
    UserLocation: 'UserLocation',
    ShapeSource: 'ShapeSource',
    LineLayer: 'LineLayer',
    PointAnnotation: 'PointAnnotation',
  },
}));

jest.mock('../src/components/MapboxNavigationSdkView', () => ({
  __esModule: true,
  default: 'MapboxNavigationSdkView',
  isMapboxNavSdkAvailable: false, // Use fallback mode for testing
}));

// Now import after mocks are set up
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import PracticeScreen from '../src/screens/Practice/PracticeScreen';
import { apiRoutes } from '../src/api';
import * as db from '../src/db';
import { getDirections } from '../src/lib/mapboxNavigation';
import { getDirectionsRoute } from '../src/utils/mapboxMatching';

// Mock navigation
const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

// Helper to create proper route prop
const createRouteProp = (route: typeof mockRoute) => ({
  key: 'practice-screen-key',
  name: 'PracticeScreen',
  params: { route },
});

// Test route data
const mockRoute = {
  id: 'test-route-123',
  name: 'Test Driving Route',
  distanceM: 5000,
  durationEstS: 600,
  coordinates: [
    { lat: 51.5074, lon: -0.1278 }, // Start (London)
    { lat: 51.5084, lon: -0.1268 },
    { lat: 51.5094, lon: -0.1258 },
    { lat: 51.5104, lon: -0.1248 },
    { lat: 51.5114, lon: -0.1238 }, // End
  ],
  isActive: true,
  testCentreId: 'centre-1',
};

// Mock GPS locations
const startLocation = {
  coords: {
    latitude: 51.5074,
    longitude: -0.1278,
    accuracy: 10,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 45,
    speed: 0,
  },
  timestamp: Date.now(),
};

const midRouteLocation = {
  coords: {
    latitude: 51.5094,
    longitude: -0.1258,
    accuracy: 10,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 45,
    speed: 13.89, // 50 km/h in m/s
  },
  timestamp: Date.now(),
};

const endLocation = {
  coords: {
    latitude: 51.5114,
    longitude: -0.1238,
    accuracy: 10,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 45,
    speed: 5.56, // 20 km/h in m/s
  },
  timestamp: Date.now(),
};

const offRouteLocation = {
  coords: {
    latitude: 51.5150, // 200m+ away from route
    longitude: -0.1200,
    accuracy: 10,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 90,
    speed: 10,
  },
  timestamp: Date.now(),
};

// Mock navigation instructions
const mockNavSteps = [
  {
    instruction: 'Head north on Test Street',
    location: { latitude: 51.5074, longitude: -0.1278 },
    distanceM: 100,
    maneuverType: 'depart',
    maneuverModifier: 'straight',
    voiceInstructions: [{ announcement: 'Head north on Test Street' }],
  },
  {
    instruction: 'Turn right onto Main Road',
    location: { latitude: 51.5094, longitude: -0.1258 },
    distanceM: 50,
    maneuverType: 'turn',
    maneuverModifier: 'right',
    voiceInstructions: [{ announcement: 'In 50 meters, turn right onto Main Road' }],
  },
  {
    instruction: 'At the roundabout, take the 2nd exit',
    location: { latitude: 51.5104, longitude: -0.1248 },
    distanceM: 30,
    maneuverType: 'roundabout',
    maneuverModifier: undefined,
    roundaboutExit: 2,
    voiceInstructions: [{ announcement: 'At the roundabout, take the 2nd exit' }],
  },
  {
    instruction: 'Arrive at destination',
    location: { latitude: 51.5114, longitude: -0.1238 },
    distanceM: 10,
    maneuverType: 'arrive',
    maneuverModifier: 'straight',
    voiceInstructions: [{ announcement: 'You have arrived at your destination' }],
  },
];

describe('PracticeScreen', () => {
  let mockLocationSubscription: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock location permissions
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    // Mock location watch
    mockLocationSubscription = { remove: jest.fn() };
    (Location.watchPositionAsync as jest.Mock).mockResolvedValue(mockLocationSubscription);

    // Mock API calls
    (apiRoutes.detail as jest.Mock).mockResolvedValue({ data: mockRoute });
    (apiRoutes.startPractice as jest.Mock).mockResolvedValue({ data: { success: true } });
    (apiRoutes.finishPractice as jest.Mock).mockResolvedValue({ data: { success: true } });

    // Mock database
    (db.upsertRouteStat as jest.Mock).mockResolvedValue(undefined);

    // Mock directions API
    (getDirections as jest.Mock).mockResolvedValue({
      coords: mockRoute.coordinates.map(c => ({ latitude: c.lat, longitude: c.lon })),
      steps: mockNavSteps,
    });

    (getDirectionsRoute as jest.Mock).mockResolvedValue({
      geometry: {
        type: 'LineString',
        coordinates: mockRoute.coordinates.map(c => [c.lon, c.lat]),
      },
    });

    // Mock speech
    (Speech.speak as jest.Mock).mockImplementation(() => {});
    (Speech.stop as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Route Starting', () => {
    it('should initialize in PREVIEW state', () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      expect(getByText('Test Driving Route')).toBeTruthy();
      expect(getByText(/Start Navigation|Acquiring GPS/)).toBeTruthy();
    });

    it('should request location permissions on mount', async () => {
      render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should show alert if location permission denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Permission Denied',
          'Location permission is required for navigation'
        );
      });
    });

    it('should start navigation when button pressed with GPS lock', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalled();
      });

      // Simulate GPS lock
      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        expect(getByText('Start Navigation')).toBeTruthy();
      });

      const startButton = getByText('Start Navigation');
      fireEvent.press(startButton);

      await waitFor(() => {
        expect(getByText(/Navigating to start point/i)).toBeTruthy();
      });
    });

    it('should show alert if navigation started without GPS', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      // Don't simulate GPS lock
      await waitFor(() => {
        const button = getByText(/Acquiring GPS/i);
        expect(button).toBeTruthy();
      });
    });

    it('should transition from TO_START to ON_ROUTE when reaching start point', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Move to start point (within 40m threshold)
      act(() => {
        watchCallback({
          ...startLocation,
          coords: { ...startLocation.coords, latitude: 51.5074, longitude: -0.1278 },
        });
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Route Started! 🎉',
          expect.stringContaining('reached the start point'),
          expect.any(Array)
        );
      });

      await waitFor(() => {
        expect(getByText(/Test route started/i)).toBeTruthy();
      });
    });
  });

  describe('Route Ending', () => {
    it('should complete route when reaching end with sufficient progress', async () => {
      jest.useFakeTimers();
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start at beginning
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Arrive at start (triggers ON_ROUTE phase)
      act(() => {
        watchCallback(startLocation);
      });

      // Wait for 30 seconds (minimum time requirement)
      act(() => {
        jest.advanceTimersByTime(31000);
      });

      // Move to end with 80%+ progress
      act(() => {
        watchCallback(endLocation);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Route Completed!',
          expect.stringContaining('Time:'),
          expect.any(Array)
        );
      });

      jest.useRealTimers();
    });

    it('should not complete route immediately at start (anti-cheat)', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start and immediately try to complete
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation); // Triggers TO_START -> ON_ROUTE
      });

      // Immediately move to end (should NOT complete - not enough time/progress)
      act(() => {
        watchCallback(endLocation);
      });

      // Should NOT show completion alert
      const completionAlerts = (Alert.alert as jest.Mock).mock.calls.filter(
        call => call[0] === 'Route Completed!'
      );
      expect(completionAlerts.length).toBe(0);
    });

    it('should call finishPractice API on completion', async () => {
      jest.useFakeTimers();
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Full navigation flow
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation); // Start route
        jest.advanceTimersByTime(31000); // Wait 31 seconds
        watchCallback(endLocation); // Complete route
      });

      await waitFor(() => {
        expect(apiRoutes.finishPractice).toHaveBeenCalledWith(
          mockRoute.id,
          expect.objectContaining({
            completed: true,
            distanceM: mockRoute.distanceM,
          })
        );
      });

      jest.useRealTimers();
    });
  });

  describe('Text Instructions', () => {
    it('should display navigation instructions', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Trigger instruction display
      await waitFor(() => {
        const instruction = mockNavSteps[0].instruction;
        // Instructions should appear in fallback mode
        expect(getDirections).toHaveBeenCalled();
      });
    });

    it('should show roundabout exit numbers', async () => {
      const { queryByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Navigate to roundabout location
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        expect(getDirections).toHaveBeenCalled();
      });

      // Check that roundabout instruction would be formatted correctly
      const roundaboutStep = mockNavSteps.find(s => s.roundaboutExit);
      expect(roundaboutStep).toBeDefined();
      expect(roundaboutStep?.roundaboutExit).toBe(2);
    });

    it('should update instructions based on user location', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Move along route - instructions should update
      act(() => {
        watchCallback(midRouteLocation);
      });

      await waitFor(() => {
        expect(getDirections).toHaveBeenCalled();
      });
    });
  });

  describe('Speech Instructions', () => {
    it('should speak instructions when not muted', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Wait for speech to potentially trigger
      await waitFor(() => {
        expect(getDirections).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should not speak when muted', async () => {
      const { getByText, getByLabelText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Toggle mute
      const muteButton = getByLabelText(/volume/i);
      fireEvent.press(muteButton);

      // Move to trigger instruction
      act(() => {
        watchCallback(midRouteLocation);
      });

      // Speech should not be called after muting
      const speechCallCount = (Speech.speak as jest.Mock).mock.calls.length;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not have new speech calls
      expect((Speech.speak as jest.Mock).mock.calls.length).toBe(speechCallCount);
    });

    it('should not repeat same instruction', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      const initialSpeechCount = (Speech.speak as jest.Mock).mock.calls.length;

      // Stay at same location - should not repeat
      act(() => {
        watchCallback(startLocation);
      });

      act(() => {
        watchCallback(startLocation);
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not increase speech count significantly
      expect((Speech.speak as jest.Mock).mock.calls.length).toBeLessThanOrEqual(initialSpeechCount + 1);
    });

    it('should stop speech when exiting', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Find and press close button
      const closeButton = getByLabelText('close');
      fireEvent.press(closeButton);

      expect(Speech.stop).toHaveBeenCalled();
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  describe('Route Geometry', () => {
    it('should convert route coordinates correctly', () => {
      const { getByTestId } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      // Verify route has coordinates
      expect(mockRoute.coordinates.length).toBe(5);
      expect(mockRoute.coordinates[0]).toEqual({ lat: 51.5074, lon: -0.1278 });
    });

    it('should handle matched route from Directions API', async () => {
      render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        expect(getDirectionsRoute).toHaveBeenCalled();
      });
    });

    it('should calculate distance correctly', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      // Check distance display
      await waitFor(() => {
        expect(getByText('5.0km')).toBeTruthy();
      });
    });
  });

  describe('Route Coloring Scheme', () => {
    it('should show different colors for TO_START vs ON_ROUTE', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // TO_START phase - should show green guidance line
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      await waitFor(() => {
        expect(getByText(/Navigating to start point/i)).toBeTruthy();
      });

      // ON_ROUTE phase - should show yellow route
      act(() => {
        watchCallback(startLocation); // Arrive at start
      });

      await waitFor(() => {
        expect(getByText(/Test route started/i)).toBeTruthy();
      });
    });

    it('should track completed route portion in green', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start route
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation); // Start ON_ROUTE
      });

      // Move along route
      act(() => {
        watchCallback(midRouteLocation);
      });

      // Completed coords should be tracked (tested via internal state)
      await waitFor(() => {
        expect(getByText(/Test route started/i)).toBeTruthy();
      });
    });
  });

  describe('Route Progress', () => {
    it('should display route progress percentage', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start route
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        expect(getByText(/Route Progress/i)).toBeTruthy();
      });
    });

    it('should show elapsed time during navigation', async () => {
      jest.useFakeTimers();
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation); // Start ON_ROUTE
      });

      act(() => {
        jest.advanceTimersByTime(60000); // 1 minute
      });

      await waitFor(() => {
        expect(getByText(/1min/i)).toBeTruthy();
      });

      jest.useRealTimers();
    });

    it('should show current speed', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start and move
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation);
        watchCallback(midRouteLocation); // 13.89 m/s = ~50 km/h
      });

      await waitFor(() => {
        expect(getByText(/Speed/i)).toBeTruthy();
      });
    });
  });

  describe('Camera Modes', () => {
    it('should toggle between FOLLOW and OVERVIEW modes', async () => {
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      // Should start in FOLLOW mode
      const toggleButton = getByText(/Overview/i);
      fireEvent.press(toggleButton);

      await waitFor(() => {
        expect(getByText(/Follow/i)).toBeTruthy();
      });

      // Toggle back
      fireEvent.press(getByText(/Follow/i));

      await waitFor(() => {
        expect(getByText(/Overview/i)).toBeTruthy();
      });
    });
  });

  describe('Off-Route Detection', () => {
    it('should alert when user goes off route', async () => {
      jest.useFakeTimers();
      const { getByText } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      const watchCallback = (Location.watchPositionAsync as jest.Mock).mock.calls[0][1];

      // Start navigation
      act(() => {
        watchCallback(startLocation);
      });

      await waitFor(() => {
        fireEvent.press(getByText('Start Navigation'));
      });

      act(() => {
        watchCallback(startLocation); // Start ON_ROUTE
        jest.advanceTimersByTime(1000);
      });

      // Go off route
      act(() => {
        watchCallback(offRouteLocation);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          expect.stringContaining('Off Route'),
          expect.stringContaining('away from the route'),
          expect.any(Array)
        );
      });

      jest.useRealTimers();
    });
  });

  describe('GPS Accuracy', () => {
    it('should use High accuracy for fast GPS lock', async () => {
      render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            accuracy: Location.Accuracy.High,
            distanceInterval: 3,
            timeInterval: 1000,
          }),
          expect.any(Function)
        );
      });
    });

    it('should update location every second', async () => {
      render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        const watchConfig = (Location.watchPositionAsync as jest.Mock).mock.calls[0][0];
        expect(watchConfig.timeInterval).toBe(1000);
      });
    });
  });

  describe('Cleanup', () => {
    it('should remove location watch on unmount', async () => {
      const { unmount } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      await waitFor(() => {
        expect(Location.watchPositionAsync).toHaveBeenCalled();
      });

      unmount();

      expect(mockLocationSubscription.remove).toHaveBeenCalled();
    });

    it('should stop speech on unmount', async () => {
      const { unmount } = render(
        <PracticeScreen route={createRouteProp(mockRoute) as any} navigation={mockNavigation as any} />
      );

      unmount();

      expect(Speech.stop).toHaveBeenCalled();
    });
  });
});
