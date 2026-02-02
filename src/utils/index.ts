export const metersToKm = (m: number) => (m / 1000).toFixed(1) + ' km';
export const secondsToMinutes = (s: number) => Math.round(s / 60) + ' min';

export const decodePolyline = (t: string): { latitude: number; longitude: number }[] => {
  if (!t) return [];

  // If the polyline is stored as JSON array of [lng, lat] pairs, parse and return directly.
  if (t.trim().startsWith('[')) {
    try {
      const coords = JSON.parse(t);
      if (Array.isArray(coords)) {
        return coords
          .filter((c: any) => Array.isArray(c) && c.length >= 2)
          .map((c: any) => ({ latitude: Number(c[1]), longitude: Number(c[0]) }))
          .filter((c) => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));
      }
    } catch {
      // fall back to encoded decoding
    }
  }

  let points = [] as { latitude: number; longitude: number }[];
  let index = 0,
    lat = 0,
    lng = 0;
  while (index < t.length) {
    let b,
      shift = 0,
      result = 0;
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
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
};

export const coordsFromGeoJson = (geojson: any): { latitude: number; longitude: number }[] => {
  if (!geojson || !geojson.features) return [];
  const feature = geojson.features.find((f: any) => f.geometry?.type === 'LineString');
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  return coords
    .filter((c: any) => Array.isArray(c) && c.length >= 2)
    .map((c: any) => ({ latitude: Number(c[1]), longitude: Number(c[0]) }))
    .filter((c) => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));
};

export const coordsFromGpx = (gpx?: string | null): { latitude: number; longitude: number }[] => {
  if (!gpx) return [];
  const regex = /<trkpt[^>]*lat=\"([0-9.+-]+)\"[^>]*lon=\"([0-9.+-]+)\"/g;
  const pts: { latitude: number; longitude: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(gpx)) !== null) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    pts.push({ latitude, longitude });
  }
  return pts;
};

export const getRouteCoords = (route: any): { latitude: number; longitude: number }[] => {
  // Priority 1: New coordinates format [{lat, lon}, ...] or [[lon, lat], ...]
  if (route?.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
    const firstCoord = route.coordinates[0];
    // Handle {lat, lon} format
    if (typeof firstCoord === 'object' && 'lat' in firstCoord) {
      return route.coordinates
        .filter((c: any) => c && typeof c === 'object' && 'lat' in c && 'lon' in c)
        .map((c: any) => ({
          latitude: Number(c.lat),
          longitude: Number(c.lon),
        }))
        .filter((c) => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));
    }
    // Handle [lon, lat] format
    if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
      return route.coordinates
        .filter((c: any) => Array.isArray(c) && c.length >= 2)
        .map((c: any) => ({
          latitude: Number(c[1]),
          longitude: Number(c[0]),
        }))
        .filter((c) => !Number.isNaN(c.latitude) && !Number.isNaN(c.longitude));
    }
  }

  // Priority 2: GeoJSON
  const fromGeo = coordsFromGeoJson(route?.geojson);
  if (fromGeo.length) return fromGeo;

  // Priority 3: GPX
  const fromGpx = coordsFromGpx(route?.gpx);
  if (fromGpx.length) return fromGpx;

  // Priority 4: Polyline (legacy, backward compatible)
  return decodePolyline(route?.polyline || '');
};
