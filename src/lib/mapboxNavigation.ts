const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export type LatLng = { latitude: number; longitude: number };

export type BannerComponent = {
  type: string;
  text?: string;
  directions?: string[];
  active?: boolean;
  active_direction?: string;
  imageBaseURL?: string;
  abbr?: string;
  abbr_priority?: number;
};

export type BannerText = {
  text?: string;
  type?: string;
  modifier?: string;
  components?: BannerComponent[];
};

export type BannerInstruction = {
  distanceAlongGeometry: number;
  primary: BannerText;
  secondary?: BannerText | null;
  sub?: BannerText | null;
};

export type VoiceInstruction = {
  distanceAlongGeometry: number;
  announcement?: string;
  ssmlAnnouncement?: string;
};

type VoiceInstructionRaw = {
  distanceAlongGeometry: number;
  announcement?: string;
  ssml_announcement?: string;
  ssmlAnnouncement?: string;
};

export type Maneuver = {
  instruction?: string;
  type?: string;
  modifier?: string;
  location?: [number, number];
  exit?: number;
};

export type NavStep = {
  distance: number;
  duration?: number;
  instruction: string;
  location: LatLng;
  roadName?: string;
  maneuverType?: string;
  maneuverModifier?: string;
  roundaboutExit?: number;
  banner?: BannerInstruction;
  bannerInstructions?: BannerInstruction[];
  voiceInstructions?: VoiceInstruction[];
  maneuverIconKey?: string;
};

export type BearingsInput = { angle: number; tolerance?: number };

export type DirectionsRequestOptions = {
  useTraffic?: boolean;
  language?: string;
  voiceUnits?: 'metric' | 'imperial';
  waypointNames?: Array<string | null | undefined>;
  annotations?: boolean | string[];
  bearing?: BearingsInput | null;
  bearings?: Array<BearingsInput | null | undefined>;
  radiuses?: Array<number | null | undefined>;
  avoidManeuverRadius?: number;
  accessToken?: string;
};

type DirectionsStep = {
  distance?: number;
  duration?: number;
  name?: string;
  maneuver?: Maneuver;
  banner_instructions?: BannerInstruction[];
  bannerInstructions?: BannerInstruction[];
  voice_instructions?: VoiceInstructionRaw[];
  voiceInstructions?: VoiceInstruction[];
};

type DirectionsLeg = {
  steps?: DirectionsStep[];
};

type DirectionsRoute = {
  geometry?: string;
  legs?: DirectionsLeg[];
  distance?: number;
  duration?: number;
};

// Fetch driving directions from Mapbox between start/end with optional vias (limited to stay under waypoint cap)
export async function getDirections(
  start: LatLng,
  end: LatLng,
  via: LatLng[] = [],
  options: DirectionsRequestOptions = {},
): Promise<{ coords: LatLng[]; steps: NavStep[]; distance?: number; duration?: number } | null> {
  const token = options.accessToken || MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const coordsList = [start, ...via.slice(0, 20), end];
    const url = buildDirectionsUrl(coordsList, { ...options, accessToken: token });
    const res = await fetch(url);
    const json = (await res.json()) as { routes?: DirectionsRoute[] };
    const route = json?.routes?.[0];
    if (!route?.geometry) return null;
    const coords = decodePolyline(route.geometry, 6);
    const steps: NavStep[] =
      route.legs?.flatMap((leg) =>
        leg?.steps?.map((step) => buildNavStep(step)) || [],
      ) || [];
    return { coords, steps, distance: route.distance, duration: route.duration };
  } catch (e) {
    console.warn('Mapbox directions failed', e);
    return null;
  }
}

export function buildDirectionsUrl(
  coordsList: LatLng[],
  options: DirectionsRequestOptions,
): string {
  const accessToken = options.accessToken || MAPBOX_TOKEN || '';
  const profile = options.useTraffic ? 'mapbox/driving-traffic' : 'mapbox/driving';
  const language = options.language || getDeviceLanguage();
  const voiceUnits = options.voiceUnits || 'metric';

  const coordinates = coordsList.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const params = new URLSearchParams();
  params.set('steps', 'true');
  params.set('overview', 'full');
  params.set('geometries', 'polyline6');
  params.set('banner_instructions', 'true');
  params.set('voice_instructions', 'true');
  params.set('roundabout_exits', 'true');
  params.set('voice_units', voiceUnits);
  params.set('language', language);
  params.set('access_token', accessToken);

  const waypointNamesParam = buildWaypointNamesParam(coordsList, options.waypointNames);
  if (waypointNamesParam) params.set('waypoint_names', waypointNamesParam);

  const annotations = buildAnnotationsParam(options);
  if (annotations) params.set('annotations', annotations);

  const bearingsParam = buildBearingsParam(coordsList, options);
  if (bearingsParam) params.set('bearings', bearingsParam);

  const radiusesParam = buildRadiusesParam(coordsList, options);
  if (radiusesParam) params.set('radiuses', radiusesParam);

  if (typeof options.avoidManeuverRadius === 'number') {
    params.set('avoid_maneuver_radius', `${Math.max(0, Math.round(options.avoidManeuverRadius))}`);
  }

  return `https://api.mapbox.com/directions/v5/${profile}/${coordinates}?${params.toString()}`;
}

const buildNavStep = (step: DirectionsStep): NavStep => {
  const maneuver = step.maneuver;
  const location = maneuver?.location;
  const bannerInstructions = normalizeBannerInstructions(step);
  const voiceInstructions = normalizeVoiceInstructions(step);
  const exit = maneuver?.exit ?? parseExitFromText(bannerInstructions[0]?.primary?.text);
  const fallbackInstruction = buildFallbackInstruction(maneuver?.instruction, step.name);
  return {
    distance: step.distance || 0,
    duration: step.duration,
    instruction: fallbackInstruction,
    location: {
      latitude: location?.[1] ?? 0,
      longitude: location?.[0] ?? 0,
    },
    roadName: step.name || undefined,
    maneuverType: maneuver?.type,
    maneuverModifier: maneuver?.modifier,
    roundaboutExit: typeof exit === 'number' ? exit : undefined,
    banner: bannerInstructions[0],
    bannerInstructions,
    voiceInstructions,
    maneuverIconKey: getManeuverIconKey(bannerInstructions[0]?.primary, maneuver),
  };
};

const normalizeBannerInstructions = (step: DirectionsStep): BannerInstruction[] => {
  const instructions = step.banner_instructions || step.bannerInstructions || [];
  return Array.isArray(instructions) ? instructions : [];
};

const normalizeVoiceInstructions = (step: DirectionsStep): VoiceInstruction[] => {
  const instructions = step.voice_instructions || step.voiceInstructions || [];
  if (!Array.isArray(instructions)) return [];
  return instructions.map((item) => ({
    distanceAlongGeometry: item.distanceAlongGeometry,
    announcement: item.announcement,
    ssmlAnnouncement: 'ssml_announcement' in item ? (item as any).ssml_announcement : item.ssmlAnnouncement,
  }));
};

const buildFallbackInstruction = (instruction?: string, roadName?: string) => {
  const base = instruction?.trim();
  if (base) return base;
  if (roadName) return `Continue on ${roadName}`;
  return 'Continue';
};

const parseExitFromText = (text?: string) => {
  if (!text) return undefined;
  const match = text.match(/(\d+)(?:st|nd|rd|th)?\s+exit/i);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
};

const getManeuverIconKey = (primary?: BannerText, maneuver?: Maneuver) => {
  const type = (primary?.type || maneuver?.type || '').toLowerCase();
  const modifier = (primary?.modifier || maneuver?.modifier || '').toLowerCase();
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return modifier || 'straight';
  if (type === 'merge') return `merge_${modifier || 'straight'}`;
  if (type === 'fork') return `fork_${modifier || 'straight'}`;
  if (type === 'off ramp' || type === 'on ramp' || type === 'ramp') return `ramp_${modifier || 'straight'}`;
  if (type === 'exit') return `exit_${modifier || 'straight'}`;
  if (modifier) return modifier;
  return type || 'straight';
};

const buildWaypointNamesParam = (
  coordsList: LatLng[],
  waypointNames?: Array<string | null | undefined>,
) => {
  if (!Array.isArray(waypointNames) || waypointNames.length === 0) return '';
  const names = coordsList.map((_, index) => {
    const value = waypointNames[index];
    return typeof value === 'string' ? value.trim() : '';
  });
  if (names.every((name) => !name)) return '';
  return names.join(';');
};

const buildAnnotationsParam = (options: DirectionsRequestOptions) => {
  if (Array.isArray(options.annotations)) return options.annotations.join(',');
  if (options.annotations === true) return 'duration,distance,speed';
  if (options.useTraffic) return 'duration,distance,speed,congestion';
  return '';
};

const buildBearingsParam = (coordsList: LatLng[], options: DirectionsRequestOptions) => {
  const values = coordsList.map((_, index) => {
    const input =
      (options.bearings && options.bearings[index]) ||
      (index === 0 ? options.bearing : null);
    if (!input) return '';
    const angle = normalizeAngle(input.angle);
    const tolerance = Math.max(0, Math.min(180, input.tolerance ?? 45));
    return `${angle},${Math.round(tolerance)}`;
  });
  return values.every((value) => value === '') ? '' : values.join(';');
};

const buildRadiusesParam = (coordsList: LatLng[], options: DirectionsRequestOptions) => {
  const supplied = options.radiuses;
  const shouldApplyDefaults = !supplied && (options.bearing || options.bearings);
  if (!supplied && !shouldApplyDefaults) return '';
  const values = coordsList.map((_, index) => {
    const radius = supplied ? supplied[index] : index === 0 ? 25 : undefined;
    if (radius == null) return 'unlimited';
    return `${Math.max(0, Math.round(radius))}`;
  });
  return values.join(';');
};

const normalizeAngle = (angle: number) => {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle % 360) + 360) % 360;
  return Math.round(wrapped);
};

const getDeviceLanguage = () => {
  try {
    const locale = Intl?.DateTimeFormat?.().resolvedOptions().locale;
    if (locale) return locale.split('-')[0];
  } catch {
    // ignore locale errors
  }
  return 'en';
};

// Local decode to avoid extra imports
export const decodePolyline = (t: string, precision = 6): LatLng[] => {
  if (!t) return [];
  const factor = Math.pow(10, precision);
  let points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < t.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = t.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = t.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
};
