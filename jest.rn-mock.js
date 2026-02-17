module.exports = {
  StyleSheet: { create: (styles) => styles },
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  Alert: {
    alert: jest.fn(),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 390, height: 844 })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  useColorScheme: jest.fn(() => 'light'),
  Platform: {
    OS: 'ios',
    Version: '16.0',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
};
