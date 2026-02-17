import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodePolyline } from '../lib/mapboxNavigation';
import { BannerInstruction, LatLng, NavPackage, Step, VoiceInstruction } from './navTypes';

export type MapMatchingOptions = {
  accessToken?: string;
  profile?: 'driving' | 'driving-traffic' | 'walking' | 'cycling';
  radiuses?: number;
  maxPoints?: number;
  chunkOverlap?: number;
  maxGapMeters?: number;
  bearingThreshold?: number;
  downsampleMeters?: number;
  assumeSpeedMps?: number;
  voiceUnits?: 'metric' | 'imperial' | 'british_imperial';
  language?: string;
  tidy?: boolean;
  waypointNames?: string[];
  timeoutMs?: number;
  debug?: boolean;
};

export type MapMatchingError = {
  code:
    | 'no_match'
    | 'no_segment'
    | 'invalid'
    | 'rate_limit'
    | 'network'
    | 'empty'
    | 'stitch_gap'
    | 'decode_error';
  message: string;
  details?: Record<string, unknown>;
};

export type MapMatchingResult =
  | { navPackage: NavPackage; error?: undefined }
  | { navPackage?: undefined; error: MapMatchingError };

type MatchingStep = {
  distance?: number;
  name?: string;
  destinations?: string;
  rotary_name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    bearing_before?: number;
    bearing_after?: number;
    location?: [number, number];
    exit?: number;
  };
  banner_instructions?: BannerInstruction[];
  voice_instructions?: Array<{
    distanceAlongGeometry: number;
    announcement?: string;
    ssml_announcement?: string;
    ssmlAnnouncement?: string;
  }>;
};

type MatchingLeg = {
  steps?: MatchingStep[];
};

type MatchingRoute = {
  geometry?: string | { coordinates: [number, number][] };
  legs?: MatchingLeg[];
  confidence?: number;
};

type MatchingResponse = {
  code?: string;
  message?: string;
  matchings?: MatchingRoute[];
};

const MEMORY_CACHE = new Map<string, NavPackage>();
const CACHE_LIMIT = 4;
const STORAGE_PREFIX = 'nav-package:';

const DEFAULT_OPTIONS: Required<
  Pick<
    MapMatchingOptions,
    | 'profile'
    | 'radiuses'
    | 'maxPoints'
    | 'chunkOverlap'
    | 'maxGapMeters'
    | 'bearingThreshold'
    | 'downsampleMeters'
    | 'assumeSpeedMps'
    | 'timeoutMs'
    | 'voiceUnits'
    | 'language'
    | 'tidy'
    | 'debug'
  >
> = {
  profile: 'driving',
  radiuses: 15,
  maxPoints: 100,
  chunkOverlap: 4,
  maxGapMeters: 25,
  bearingThreshold: 20,
  downsampleMeters: 15,
  assumeSpeedMps: 8,
  timeoutMs: 12000,
  voiceUnits: 'british_imperial',
  language: 'en',
  tidy: true,
  debug: false,
};

export const buildNavPackage = async (
  originalPolyline: LatLng[],
  options: MapMatchingOptions = {},
): Promise<MapMatchingResult> => {
  if (!originalPolyline.length) {
    return { error: { code: 'empty', message: 'No coordinates provided.' } };
  }
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const accessToken = settings.accessToken || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
  if (!accessToken) {
    return { error: { code: 'invalid', message: 'Missing Mapbox access token.' } };
  }

  const id = buildNavPackageId(originalPolyline, settings);
  const cached = await getCachedPackage(id);
  if (cached) return { navPackage: cached };

  const warnings: string[] = [];
  const cleaned = removeDuplicateCoords(originalPolyline, 2);
  const sampled = downsampleRoute(cleaned, settings.downsampleMeters, settings.bearingThreshold);
  const chunks = createChunks(sampled, settings.maxPoints, settings.chunkOverlap);
  const chunkResults: { polyline: LatLng[]; steps: Step[] }[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const result = await matchChunk(chunk, accessToken, {
      ...settings,
      waypointNames: settings.waypointNames ?? [],
    });
    if (result.ok === false) {
      return { error: result.error };
    }
    chunkResults.push(result.value);
  }

  if (!chunkResults.length) {
    return { error: { code: 'empty', message: 'No matchings returned.' } };
  }

  const matchedPolyline = stitchPolylines(chunkResults.map((c) => c.polyline));
  if (hasLargeGap(matchedPolyline, settings.maxGapMeters * 6)) {
    warnings.push('stitch_gap_detected');
    return { error: { code: 'stitch_gap', message: 'Gap detected while stitching chunks.' } };
  }
  const cumDist = buildCumulativeDistances(matchedPolyline);
  const total = cumDist.length ? cumDist[cumDist.length - 1] : 0;
  const steps = stitchSteps(chunkResults.map((c) => c.steps), chunks.length);

  const navPackage: NavPackage = {
    id,
    originalPolyline,
    matchedPolyline,
    cumDist,
    steps,
    routeLengthM: total,
    startCoord: matchedPolyline[0],
    endCoord: matchedPolyline[matchedPolyline.length - 1],
    meta: {
      createdAt: Date.now(),
      profile: settings.profile,
      radiusesUsed: settings.radiuses,
      chunks: chunks.length,
      warnings,
    },
  };

  await storePackage(id, navPackage);
  return { navPackage };
};

const matchChunk = async (
  coords: LatLng[],
  accessToken: string,
  options: Required<
    Pick<
      MapMatchingOptions,
      'profile' | 'radiuses' | 'assumeSpeedMps' | 'timeoutMs' | 'debug' | 'voiceUnits' | 'language' | 'tidy' | 'waypointNames'
    >
  >,
): Promise<{ ok: true; value: { polyline: LatLng[]; steps: Step[] } } | { ok: false; error: MapMatchingError }> => {
  if (coords.length < 2) {
    return { ok: false, error: { code: 'invalid', message: 'Not enough coordinates for matching.' } };
  }
  const url = buildMatchUrl(coords, accessToken, options);
  const response = await fetchWithTimeout(url, options.timeoutMs);
  if (response.ok === false) {
    return { ok: false, error: response.error };
  }
  if (!response.data) {
    return { ok: false, error: { code: 'network', message: 'Map Matching failed.' } };
  }
  const json = response.data as MatchingResponse;
  if (json.code && json.code !== 'Ok') {
    return { ok: false, error: mapMatchingError(json) };
  }
  const matchings = Array.isArray(json.matchings) ? json.matchings : [];
  if (!matchings.length) {
    return { ok: false, error: { code: 'empty', message: 'No matchings found.' } };
  }
  const matching = matchings.slice().sort((a: MatchingRoute, b: MatchingRoute) => (b.confidence || 0) - (a.confidence || 0))[0];
  const polyline = decodeGeometry(matching.geometry);
  if (!polyline.length) {
    return { ok: false, error: { code: 'decode_error', message: 'Failed to decode matched geometry.' } };
  }
  const steps = extractSteps(matching.legs || []);
  return { ok: true, value: { polyline, steps } };
};

const buildMatchUrl = (
  coords: LatLng[],
  accessToken: string,
  options: Required<
    Pick<MapMatchingOptions, 'profile' | 'radiuses' | 'assumeSpeedMps' | 'voiceUnits' | 'language' | 'tidy' | 'waypointNames'>
  >,
) => {
  const profile = `mapbox/${options.profile}`;
  const coordinates = coords.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const params = new URLSearchParams();
  params.set('steps', 'true');
  params.set('banner_instructions', 'true');
  params.set('voice_instructions', 'true');
  params.set('voice_units', options.voiceUnits);
  params.set('language', options.language);
  params.set('roundabout_exits', 'true');
  params.set('geometries', 'polyline6');
  params.set('overview', 'full');
  params.set('tidy', options.tidy ? 'true' : 'false');
  params.set('radiuses', coords.map(() => `${options.radiuses}`).join(';'));
  params.set('waypoints', `0;${coords.length - 1}`);
  if (options.waypointNames && options.waypointNames.length >= 2) {
    params.set('waypoint_names', options.waypointNames.slice(0, 2).join(';'));
  }

  const timestamps = buildSyntheticTimestamps(coords, options.assumeSpeedMps);
  if (timestamps.length === coords.length) {
    params.set('timestamps', timestamps.join(';'));
  }

  params.set('access_token', accessToken);
  return `https://api.mapbox.com/matching/v5/${profile}/${coordinates}.json?${params.toString()}`;
};

const buildSyntheticTimestamps = (coords: LatLng[], speedMps: number) => {
  const base = Math.floor(Date.now() / 1000);
  let total = 0;
  const timestamps = [base];
  for (let i = 1; i < coords.length; i += 1) {
    total += distanceMeters(coords[i - 1], coords[i]);
    const delta = Math.max(1, Math.round(total / Math.max(speedMps, 1)));
    timestamps.push(base + delta);
  }
  return timestamps;
};

const downsampleRoute = (coords: LatLng[], minGap: number, bearingThreshold: number) => {
  if (coords.length <= 2) return coords.slice();
  const sampled: LatLng[] = [coords[0]];
  let lastKeptIdx = 0;
  for (let i = 1; i < coords.length - 1; i += 1) {
    const prev = coords[lastKeptIdx];
    const current = coords[i];
    const next = coords[i + 1];
    const dist = distanceMeters(prev, current);
    const bearingBefore = bearingDegrees(prev, current);
    const bearingAfter = bearingDegrees(current, next);
    const bearingDelta = angleDelta(bearingBefore, bearingAfter);
    if (dist >= minGap || bearingDelta >= bearingThreshold) {
      sampled.push(current);
      lastKeptIdx = i;
    }
  }
  sampled.push(coords[coords.length - 1]);
  return sampled;
};

const createChunks = (coords: LatLng[], maxPoints: number, overlap: number) => {
  if (coords.length <= maxPoints) return [coords];
  const chunks: LatLng[][] = [];
  let idx = 0;
  while (idx < coords.length) {
    const end = Math.min(coords.length, idx + maxPoints);
    chunks.push(coords.slice(idx, end));
    if (end === coords.length) break;
    idx = Math.max(0, end - overlap);
  }
  return chunks;
};

const stitchPolylines = (polylines: LatLng[][]) => {
  const stitched: LatLng[] = [];
  const threshold = 6;
  for (const poly of polylines) {
    if (!poly.length) continue;
    if (!stitched.length) {
      stitched.push(...poly);
      continue;
    }
    let startIdx = 0;
    const last = stitched[stitched.length - 1];
    for (let i = 0; i < poly.length; i += 1) {
      if (distanceMeters(last, poly[i]) > threshold) {
        startIdx = i;
        break;
      }
    }
    stitched.push(...poly.slice(startIdx));
  }
  return stitched;
};

const extractSteps = (legs: MatchingLeg[]) => {
  const steps: Step[] = [];
  let index = 0;
  legs.forEach((leg) => {
    (leg.steps || []).forEach((step) => {
      const loc = step.maneuver?.location;
      const bannerText = step.banner_instructions?.[0]?.primary?.text;
      const exit = step.maneuver?.exit ?? parseExitFromText(bannerText);
      const voiceInstructions = (step.voice_instructions || [])
        .filter((item) => Number.isFinite(item.distanceAlongGeometry))
        .map((item) => ({
          distanceAlongGeometry: item.distanceAlongGeometry,
          announcement: item.announcement,
          ssmlAnnouncement: item.ssml_announcement || item.ssmlAnnouncement,
        }));
      steps.push({
        stepIndexGlobal: index,
        maneuver: {
          type: step.maneuver?.type,
          modifier: step.maneuver?.modifier,
          bearing_before: step.maneuver?.bearing_before,
          bearing_after: step.maneuver?.bearing_after,
          exit,
          location: loc ? { latitude: loc[1], longitude: loc[0] } : undefined,
        },
        bannerInstructions: step.banner_instructions,
        voiceInstructions,
        distanceAlongRoute: 0,
        distance: step.distance || 0,
        name: step.name,
        destinations: step.destinations,
        rotary_name: step.rotary_name,
        exit,
      });
      index += 1;
    });
  });
  return steps;
};

const stitchSteps = (chunkSteps: Step[][], chunkCount: number) => {
  const stitched: Step[] = [];
  const distanceThreshold = 10;
  let runningTotal = 0;
  chunkSteps.forEach((steps, chunkIdx) => {
    let localRunning = 0;
    let chunkOffset: number | null = null;
    let lastLocation = stitched.length ? stitched[stitched.length - 1].maneuver?.location ?? null : null;
    steps.forEach((step) => {
      const type = step.maneuver?.type;
      const stepDistance = Number.isFinite(step.distance) ? step.distance : 0;
      const stepStartLocal = localRunning;
      const stepEndLocal = stepStartLocal + stepDistance;
      localRunning = stepEndLocal;
      if (type === 'depart' && stitched.length) return;
      if (type === 'arrive' && chunkIdx < chunkCount - 1) return;
      if (lastLocation && step.maneuver?.location) {
        const d = distanceMeters(lastLocation, step.maneuver.location);
        if (d < distanceThreshold) return;
      }
      if (chunkOffset === null) {
        chunkOffset = runningTotal - stepStartLocal;
      }
      const stepStartS = chunkOffset + stepStartLocal;
      const stepEndS = chunkOffset + stepEndLocal;
      stitched.push({
        ...step,
        stepIndexGlobal: stitched.length,
        stepStartS,
        stepEndS,
        distanceAlongRoute: stepEndS,
      });
      lastLocation = step.maneuver?.location ?? lastLocation;
    });
    if (chunkOffset !== null && stitched.length) {
      const lastStep = stitched[stitched.length - 1];
      runningTotal = lastStep.stepEndS ?? runningTotal;
    }
  });
  return stitched;
};

const buildCumulativeDistances = (coords: LatLng[]) => {
  if (coords.length < 2) return [];
  const distances = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += distanceMeters(coords[i - 1], coords[i]);
    distances.push(total);
  }
  return distances;
};


const buildNavPackageId = (coords: LatLng[], options: MapMatchingOptions) => {
  const payload = {
    coords: coords.map((c) => [round(c.latitude, 6), round(c.longitude, 6)]),
    profile: options.profile || DEFAULT_OPTIONS.profile,
    radiuses: options.radiuses || DEFAULT_OPTIONS.radiuses,
    maxGapMeters: options.maxGapMeters || DEFAULT_OPTIONS.maxGapMeters,
    bearingThreshold: options.bearingThreshold || DEFAULT_OPTIONS.bearingThreshold,
    downsampleMeters: options.downsampleMeters || DEFAULT_OPTIONS.downsampleMeters,
    voiceUnits: options.voiceUnits || DEFAULT_OPTIONS.voiceUnits,
    language: options.language || DEFAULT_OPTIONS.language,
    tidy: options.tidy ?? DEFAULT_OPTIONS.tidy,
    maxPoints: options.maxPoints || DEFAULT_OPTIONS.maxPoints,
  };
  return `navpkg_${hashString(JSON.stringify(payload))}`;
};

const getCachedPackage = async (id: string) => {
  if (MEMORY_CACHE.has(id)) return MEMORY_CACHE.get(id) || null;
  try {
    const cached = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as NavPackage;
    MEMORY_CACHE.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const storePackage = async (id: string, navPackage: NavPackage) => {
  MEMORY_CACHE.set(id, navPackage);
  if (MEMORY_CACHE.size > CACHE_LIMIT) {
    const firstKey = MEMORY_CACHE.keys().next().value as string | undefined;
    if (firstKey) MEMORY_CACHE.delete(firstKey);
  }
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(navPackage));
  } catch {
    // ignore cache failures
  }
};

const fetchWithTimeout = async (
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; data: unknown } | { ok: false; error: MapMatchingError }> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      await delay(800);
      const retry = await fetch(url, { signal: controller.signal });
      if (!retry.ok) {
        return { ok: false, error: { code: 'rate_limit', message: 'Rate limited by Mapbox.' } };
      }
      return { ok: true, data: await retry.json() };
    }
    if (!res.ok) {
      return { ok: false, error: { code: 'network', message: `HTTP ${res.status} from Mapbox.` } };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: { code: 'network', message: 'Failed to fetch Mapbox matching.' } };
  } finally {
    clearTimeout(id);
  }
};

const decodeGeometry = (geometry?: string | { coordinates: [number, number][] }) => {
  if (!geometry) return [];
  if (typeof geometry !== 'string') {
    return geometry.coordinates.map((coord) => ({ longitude: coord[0], latitude: coord[1] }));
  }
  return decodePolyline(geometry, 6);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseExitFromText = (text?: string) => {
  if (!text) return undefined;
  const match = text.match(/(\d+)(?:st|nd|rd|th)?\s+exit/i);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
};

const hasLargeGap = (coords: LatLng[], threshold: number) => {
  if (coords.length < 2) return true;
  for (let i = 1; i < coords.length; i += 1) {
    if (distanceMeters(coords[i - 1], coords[i]) > threshold) {
      return true;
    }
  }
  return false;
};

const mapMatchingError = (json: MatchingResponse): MapMatchingError => {
  const code = (json.code || '').toLowerCase();
  if (code === 'nomatch') return { code: 'no_match', message: json.message || 'No match found.' };
  if (code === 'nosegment') return { code: 'no_segment', message: json.message || 'No segment found.' };
  if (code === 'invalidinput') return { code: 'invalid', message: json.message || 'Invalid input.' };
  return { code: 'network', message: json.message || 'Map Matching failed.' };
};

const removeDuplicateCoords = (coords: LatLng[], thresholdMeters: number) => {
  if (!coords.length) return [];
  const cleaned: LatLng[] = [coords[0]];
  for (let i = 1; i < coords.length; i += 1) {
    const prev = cleaned[cleaned.length - 1];
    if (distanceMeters(prev, coords[i]) >= thresholdMeters) {
      cleaned.push(coords[i]);
    }
  }
  return cleaned;
};

const distanceMeters = (a: LatLng, b: LatLng) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    2 * Math.atan2(
      Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
      Math.sqrt(1 - (sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon)),
    );
  return R * c;
};

const bearingDegrees = (a: LatLng, b: LatLng) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
};

const angleDelta = (a: number, b: number) => {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
};

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
};

const round = (value: number, precision: number) => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

export const __test__ = {
  removeDuplicateCoords,
  downsampleRoute,
  createChunks,
  stitchPolylines,
  stitchSteps,
  buildCumulativeDistances,
};
