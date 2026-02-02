/**
 * Search result from Mapbox Geocoding API
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
 * Result from reverse geocoding API
 */
export interface ReverseGeocodeResult {
  address?: string;
  place_name: string;
  postcode?: string;
  city?: string;
  region?: string;
}

/**
 * Options for search requests
 */
export interface SearchOptions {
  proximity?: [number, number]; // [longitude, latitude]
  country?: string;
  limit?: number;
  types?: string[];
}

/**
 * Mapbox API error response
 */
export interface MapboxErrorResponse {
  message: string;
  code?: string;
}

/**
 * Session token for billing optimization
 */
export type SessionToken = string;
