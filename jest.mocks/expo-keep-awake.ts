export const activateKeepAwake = jest.fn();
export const deactivateKeepAwake = jest.fn();
export const activateKeepAwakeAsync = jest.fn(() => Promise.resolve());
export const deactivateKeepAwakeAsync = jest.fn(() => Promise.resolve());

export default {
  activateKeepAwake,
  deactivateKeepAwake,
  activateKeepAwakeAsync,
  deactivateKeepAwakeAsync,
};
