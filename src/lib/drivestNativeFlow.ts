import { NativeModules, Platform } from 'react-native';

type DrivestNativeFlowOptions = {
  screen?:
    | 'home'
    | 'practice'
    | 'practice-entry'
    | 'navigation'
    | 'navigation-entry'
    | 'centre-picker'
    | 'practice-routes'
    | 'destination-search'
    | 'main';
  centreId?: string;
  routeId?: string;
  destinationName?: string;
  destinationLat?: number;
  destinationLon?: number;
};

type DrivestNativeFlowModuleShape = {
  open: (options?: DrivestNativeFlowOptions) => Promise<boolean>;
};

const getModule = (): DrivestNativeFlowModuleShape | null => {
  const module = (NativeModules as any)?.DrivestNativeFlow as DrivestNativeFlowModuleShape | undefined;
  return module || null;
};

export const isDrivestNativeFlowAvailable = (): boolean => {
  if (Platform.OS !== 'android') return false;
  return !!getModule();
};

export const openDrivestNativeFlow = async (
  options: DrivestNativeFlowOptions = {},
): Promise<boolean> => {
  const module = getModule();
  if (!module?.open) {
    throw new Error('DrivestNativeFlow native module is not registered');
  }
  return module.open(options);
};

