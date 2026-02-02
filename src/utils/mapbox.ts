import { SearchResult } from '../types/mapbox';

/**
 * Format a Mapbox search result for display
 * Returns format: "Place Name, City, Postcode"
 * @param result - Mapbox search result
 * @returns Formatted string for UI display
 *
 * @example
 * const formatted = formatSearchResult(result);
 * // Returns: "Edinburgh City, Edinburgh, EH8 8DX"
 */
export function formatSearchResult(result: SearchResult): string {
  const parts: string[] = [];

  // Add main text
  if (result.text) {
    parts.push(result.text);
  }

  // Add city from context
  const cityContext = result.context?.find((c) => c.id.includes('place'));
  if (cityContext && cityContext.text !== result.text) {
    parts.push(cityContext.text);
  }

  // Add postcode
  if (result.postcode) {
    parts.push(result.postcode);
  }

  return parts.join(', ');
}

/**
 * Extract UK postcode from an address string
 * UK postcode format: "SW1A 1AA", "M1 1AE", etc.
 * @param address - Address string to extract postcode from
 * @returns Extracted postcode or null if not found
 *
 * @example
 * const postcode = extractPostcode("123 Main St, Edinburgh, EH8 8DX");
 * // Returns: "EH8 8DX"
 */
export function extractPostcode(address: string): string | null {
  if (!address) return null;

  // UK postcode regex pattern
  // Format: AN NAA or ANN NAA or AAN NAA or AANN NAA or AAN NAA or AACN NAA
  // Where A = letter, N = number, C = letter
  const postcodeRegex = /\b[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}\b/i;
  const match = address.match(postcodeRegex);

  return match ? match[0].toUpperCase() : null;
}

/**
 * Check if coordinates are within UK bounds
 * UK approximate bounds: lon [-8, 2], lat [49.9, 60.9]
 * @param longitude - Longitude coordinate
 * @param latitude - Latitude coordinate
 * @returns true if coordinates are within UK bounds
 *
 * @example
 * const inUK = isUKLocation(-3.1, 55.95); // Edinburgh
 * // Returns: true
 */
export function isUKLocation(longitude: number, latitude: number): boolean {
  const UK_BOUNDS = {
    minLon: -8.5,
    maxLon: 2.5,
    minLat: 49.5,
    maxLat: 61.0,
  };

  return (
    longitude >= UK_BOUNDS.minLon &&
    longitude <= UK_BOUNDS.maxLon &&
    latitude >= UK_BOUNDS.minLat &&
    latitude <= UK_BOUNDS.maxLat
  );
}

/**
 * Format coordinates for display
 * Returns format: "51.5074°N, 0.1278°W"
 * @param longitude - Longitude coordinate
 * @param latitude - Latitude coordinate
 * @returns Formatted coordinate string
 *
 * @example
 * const formatted = formatCoordinates(-0.1278, 51.5074); // London
 * // Returns: "51.5074°N, 0.1278°W"
 */
export function formatCoordinates(longitude: number, latitude: number): string {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';

  const latAbs = Math.abs(latitude).toFixed(4);
  const lonAbs = Math.abs(longitude).toFixed(4);

  return `${latAbs}°${latDirection}, ${lonAbs}°${lonDirection}`;
}

/**
 * Calculate distance between two coordinates in kilometers
 * Uses Haversine formula
 * @param lon1 - First point longitude
 * @param lat1 - First point latitude
 * @param lon2 - Second point longitude
 * @param lat2 - Second point latitude
 * @returns Distance in kilometers
 *
 * @example
 * const distance = calculateDistance(-0.1278, 51.5074, -2.2426, 53.4808);
 * // Returns: approximate distance between London and Manchester
 */
export function calculateDistance(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate a random session token for billing optimization
 * Uses UUID v4 format
 * @returns Random session token string
 *
 * @example
 * const sessionToken = generateSessionToken();
 */
export function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 *
 * @example
 * const truncated = truncateText("Edinburgh, Scotland", 12);
 * // Returns: "Edinburgh,..."
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
