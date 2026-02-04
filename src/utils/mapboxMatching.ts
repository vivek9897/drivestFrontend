/**
 * Convert raw GPS coordinates to road-snapped route using Mapbox Map Matching API
 */

export interface MapMatchedRoute {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
}

/**
 * Snap coordinates to roads using Mapbox Map Matching API
 * This converts raw waypoints to actual road geometries
 */
export async function snapCoordinatesToRoads(
  coordinates: Array<[number, number]>,
  mapboxToken: string,
): Promise<MapMatchedRoute | null> {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  try {
    // Map Matching API expects coordinates as lng,lat;lng,lat
    const coordString = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');

    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordString}?access_token=${mapboxToken}&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.matchings && data.matchings.length > 0) {
      const matching = data.matchings[0];
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: matching.geometry.coordinates,
        },
      };
    }

    return null;
  } catch (error) {
    console.warn('[MapboxMatching] Error snapping coordinates:', error);
    return null;
  }
}

/**
 * Get directions between waypoints using Mapbox Directions API
 * This is an alternative to map matching that gets proper turn-by-turn routes
 */
export async function getDirectionsRoute(
  coordinates: Array<[number, number]>,
  mapboxToken: string,
): Promise<MapMatchedRoute | null> {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  try {
    // Only use first and last point for directions (to avoid too many waypoints)
    // Use all intermediate points as waypoints
    const coordString = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?access_token=${mapboxToken}&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.geometry.coordinates,
        },
      };
    }

    return null;
  } catch (error) {
    console.warn('[MapboxDirections] Error getting directions:', error);
    return null;
  }
}
