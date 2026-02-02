import axios from 'axios';

/**
 * Interface for Mapbox search results
 */
export interface SearchResult {
  id: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  text: string;
  place_type: string[];
  address?: string;
  postcode?: string;
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
}

/**
 * Interface for reverse geocode results
 */
export interface ReverseGeocodeResult {
  address?: string;
  place_name: string;
  postcode?: string;
  city?: string;
  region?: string;
}

/**
 * Search options interface
 */
export interface SearchOptions {
  proximity?: [number, number];
  country?: string;
  limit?: number;
  types?: string[];
}

// Cache for reverse geocode results to avoid duplicate API calls
const reverseGeocodeCache = new Map<string, ReverseGeocodeResult>();

/**
 * Search for places using Mapbox Geocoding API
 * @param query - Search query (address, postcode, place name, etc.)
 * @param proximity - Optional coordinates for proximity bias [longitude, latitude]
 * @returns Array of search results with coordinates and place details
 * @throws Error if API call fails
 *
 * @example
 * const results = await searchPlaces('Edinburgh', [−3.1, 55.95]);
 */
export async function searchPlaces(
  query: string,
  proximity?: [number, number],
): Promise<SearchResult[]> {
  try {
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      throw new Error('EXPO_PUBLIC_MAPBOX_TOKEN not configured');
    }

    const params = new URLSearchParams({
      access_token: token,
      country: 'gb',
      limit: '10',
      language: 'en',
    });

    if (proximity) {
      params.append('proximity', `${proximity[0]},${proximity[1]}`);
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params}`;

    const response = await axios.get(url);

    if (response.status !== 200 || !response.data.features) {
      return [];
    }

    return response.data.features.map((feature: any) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: feature.center as [number, number],
      text: feature.text,
      place_type: feature.place_type,
      address: feature.address,
      postcode: extractPostcode(feature),
      context: feature.context,
    }));
  } catch (error) {
    console.error('Error searching places:', error);
    throw error;
  }
}

/**
 * Convert coordinates to human-readable address using reverse geocoding
 * @param longitude - Longitude coordinate
 * @param latitude - Latitude coordinate
 * @returns Formatted address string
 * @throws Error if API call fails
 *
 * @example
 * const address = await reverseGeocode(-0.1278, 51.5074); // London address
 */
export async function reverseGeocode(
  longitude: number,
  latitude: number,
): Promise<ReverseGeocodeResult> {
  try {
    // Check cache first
    const cacheKey = `${longitude},${latitude}`;
    if (reverseGeocodeCache.has(cacheKey)) {
      return reverseGeocodeCache.get(cacheKey)!;
    }

    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      throw new Error('EXPO_PUBLIC_MAPBOX_TOKEN not configured');
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
    const response = await axios.get(url, {
      params: {
        access_token: token,
        language: 'en',
        limit: 1,
      },
    });

    if (response.status !== 200 || !response.data.features || response.data.features.length === 0) {
      return {
        place_name: `${latitude}, ${longitude}`,
      };
    }

    const feature = response.data.features[0];
    const result: ReverseGeocodeResult = {
      place_name: feature.place_name,
      address: feature.address,
      postcode: extractPostcode(feature),
      city: feature.context?.find((c: any) => c.id.includes('place'))?.text,
      region: feature.context?.find((c: any) => c.id.includes('region'))?.text,
    };

    // Cache the result
    reverseGeocodeCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return {
      place_name: `${latitude}, ${longitude}`,
    };
  }
}

/**
 * Get place suggestions for autocomplete using Mapbox Geocoding API
 * @param query - Partial search query
 * @param sessionToken - Optional session token for billing optimization
 * @returns Array of suggestions as user types
 * @throws Error if API call fails
 *
 * @example
 * const suggestions = await getPlaceSuggestions('Edin', 'session-uuid-here');
 */
export async function getPlaceSuggestions(
  query: string,
  sessionToken?: string,
): Promise<SearchResult[]> {
  try {
    if (!query || query.length < 2) {
      return [];
    }

    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      throw new Error('EXPO_PUBLIC_MAPBOX_TOKEN not configured');
    }

    const params = new URLSearchParams({
      access_token: token,
      country: 'gb',
      limit: '10',
      language: 'en',
    });

    if (sessionToken) {
      params.append('session_token', sessionToken);
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params}`;

    const response = await axios.get(url);

    if (response.status !== 200 || !response.data.features) {
      return [];
    }

    return response.data.features.map((feature: any) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: feature.center as [number, number],
      text: feature.text,
      place_type: feature.place_type,
      address: feature.address,
      postcode: extractPostcode(feature),
      context: feature.context,
    }));
  } catch (error) {
    console.error('Error getting place suggestions:', error);
    return [];
  }
}

/**
 * Extract postcode from Mapbox API response
 * @param feature - Mapbox feature object
 * @returns Postcode string or undefined
 */
function extractPostcode(feature: any): string | undefined {
  if (feature.postcode) {
    return feature.postcode;
  }

  // Try to extract from context
  const postcodeContext = feature.context?.find((c: any) => c.id.includes('postcode'));
  if (postcodeContext) {
    return postcodeContext.text;
  }

  // Try to extract from place_name
  const regex = /\b[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}\b/i;
  const match = feature.place_name?.match(regex);
  return match ? match[0] : undefined;
}

/**
 * Clear reverse geocode cache
 * Useful for testing or if you need to refresh cached data
 */
export function clearReverseGeocodeCache(): void {
  reverseGeocodeCache.clear();
}
