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

import { logNav } from './navigationLogger';

/**
 * Get directions between waypoints using Mapbox Directions API
 * This is the primary method for converting waypoints to actual driving routes
 */
export async function getDirectionsRoute(
  coordinates: Array<[number, number]>,
  mapboxToken: string,
): Promise<MapMatchedRoute | null> {
  if (!coordinates || coordinates.length < 2) {
    logNav.error('DIRECTIONS_API', `Not enough coordinates: ${coordinates?.length || 0}`);
    return null;
  }

  try {
    // Limit to 25 waypoints if needed (Directions API limit)
    let waypoints = coordinates;
    let sampled = false;
    if (coordinates.length > 25) {
      sampled = true;
      const step = Math.ceil(coordinates.length / 25);
      waypoints = [];
      for (let i = 0; i < coordinates.length; i += step) {
        waypoints.push(coordinates[i]);
      }
      if (waypoints[waypoints.length - 1] !== coordinates[coordinates.length - 1]) {
        waypoints.push(coordinates[coordinates.length - 1]);
      }
    }

    logNav.directionsRequest(coordinates.length, sampled, waypoints.length);

    // Format: lng,lat;lng,lat
    const coordString = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
    logNav.directionsCoords(coordString);

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?access_token=${mapboxToken}&geometries=geojson&overview=full`;

    const response = await fetch(url);
    
    if (!response.ok) {
      logNav.directionsResponse(response.status);
      try {
        const text = await response.text();
        logNav.error('DIRECTIONS_API', `Response body: ${text}`);
      } catch (e) {}
      return null;
    }

    const data = await response.json();
    logNav.directionsResponse(response.status, data.code);

    if (data.code !== 'Ok') {
      logNav.error('DIRECTIONS_API', `API error: ${data.code} - ${data.message}`);
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      logNav.error('DIRECTIONS_API', 'No routes in response');
      return null;
    }

    const route = data.routes[0];
    logNav.directionsResult(data.routes.length, route.geometry.coordinates.length);

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      },
    };
  } catch (error) {
    logNav.directionsError(error);
    return null;
  }
}
