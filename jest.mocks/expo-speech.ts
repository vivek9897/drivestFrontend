export default {
  speak: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isSpeakingAsync: jest.fn(() => Promise.resolve(false)),
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([])),
  maxSpeechInputLength: 4000,
};

export const speak = jest.fn();
export const stop = jest.fn();
export const pause = jest.fn();
export const resume = jest.fn();
export const isSpeakingAsync = jest.fn(() => Promise.resolve(false));
export const getAvailableVoicesAsync = jest.fn(() => Promise.resolve([]));
export const maxSpeechInputLength = 4000;
