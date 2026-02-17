/**
 * Waypoint Sampling Utility
 * 
 * Intelligently samples waypoints from driving test routes to ensure:
 * 1. Mapbox Directions API follows the EXACT stored route (not optimized shortcuts)
 * 2. Stays within Mapbox's 25-coordinate limit (origin + 23 waypoints + destination)
 * 3. Preserves route shape, turns, and intersections
 * 
 * Uses Douglas-Peucker simplification + heading change detection
 */

import { calculateDistance } from './mapbox';

export type MapCoord = [number, number]; // [longitude, latitude]

interface SamplingOptions {
  /** Maximum waypoints to return (Mapbox limit is 25 total including origin/dest) */
  maxWaypoints?: number;
  /** Douglas-Peucker tolerance in meters (higher = fewer points) */
  dpTolerance?: number;
  /** Minimum heading change in degrees to keep point as waypoint */
  minHeadingChange?: number;
  /** Minimum distance between waypoints in meters */
  minSpacing?: number;
}

const DEFAULT_OPTIONS: Required<SamplingOptions> = {
  maxWaypoints: 23, // Leave room for origin + destination = 25 total
  dpTolerance: 8,   // 8 meters - preserves shape while reducing points
  minHeadingChange: 30, // 30 degrees - captures turns and direction changes
  minSpacing: 50,   // 50 meters - prevents waypoint clustering
};

/**
 * Calculate bearing (heading) between two coordinates in degrees (0-360)
 */
function calculateBearing(from: MapCoord, to: MapCoord): number {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(point: MapCoord, lineStart: MapCoord, lineEnd: MapCoord): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  
  // Convert to meters using Haversine
  const distToStart = calculateDistance(px, py, x1, y1) * 1000;
  const distToEnd = calculateDistance(px, py, x2, y2) * 1000;
  const lineLength = calculateDistance(x1, y1, x2, y2) * 1000;
  
  if (lineLength === 0) return distToStart;
  
  // Project point onto line segment
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  
  return calculateDistance(px, py, projX, projY) * 1000;
}

/**
 * Douglas-Peucker algorithm for polyline simplification
 * Returns indices of points to keep
 */
function douglasPeucker(coords: MapCoord[], tolerance: number): Set<number> {
  if (coords.length <= 2) return new Set([0, coords.length - 1]);
  
  const keep = new Set<number>();
  keep.add(0);
  keep.add(coords.length - 1);
  
  function recurse(start: number, end: number) {
    if (end - start <= 1) return;
    
    let maxDist = 0;
    let maxIndex = start;
    
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(coords[i], coords[start], coords[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    
    if (maxDist > tolerance) {
      keep.add(maxIndex);
      recurse(start, maxIndex);
      recurse(maxIndex, end);
    }
  }
  
  recurse(0, coords.length - 1);
  return keep;
}

/**
 * Detect points with significant heading changes (turns/intersections)
 * Returns indices of turn points
 */
function detectTurns(coords: MapCoord[], minHeadingChange: number): Set<number> {
  const turns = new Set<number>();
  if (coords.length < 3) return turns;
  
  for (let i = 1; i < coords.length - 1; i++) {
    const bearingBefore = calculateBearing(coords[i - 1], coords[i]);
    const bearingAfter = calculateBearing(coords[i], coords[i + 1]);
    
    let headingChange = Math.abs(bearingAfter - bearingBefore);
    if (headingChange > 180) headingChange = 360 - headingChange;
    
    if (headingChange >= minHeadingChange) {
      turns.add(i);
    }
  }
  
  return turns;
}

/**
 * Enforce minimum spacing between waypoints
 */
function enforceMinSpacing(coords: MapCoord[], indices: number[], minSpacing: number): number[] {
  if (indices.length <= 2) return indices;
  
  const result = [indices[0]]; // Always keep start
  let lastKept = 0;
  
  for (let i = 1; i < indices.length - 1; i++) {
    const idx = indices[i];
    const distFromLast = calculateDistance(
      coords[lastKept][0], coords[lastKept][1],
      coords[idx][0], coords[idx][1]
    ) * 1000;
    
    if (distFromLast >= minSpacing) {
      result.push(idx);
      lastKept = idx;
    }
  }
  
  result.push(indices[indices.length - 1]); // Always keep end
  return result;
}

/**
 * Sample waypoints from route coordinates with intelligent selection
 * 
 * Algorithm:
 * 1. Run Douglas-Peucker to preserve route shape
 * 2. Detect sharp turns/intersections via heading change
 * 3. Merge both sets of important points
 * 4. Enforce minimum spacing between points
 * 5. Cap at maxWaypoints (evenly sample if still too many)
 * 6. Always include first and last points
 * 
 * @param coords - Full route coordinates [longitude, latitude][]
 * @param options - Sampling parameters
 * @returns Sampled waypoint coordinates (always includes start + end)
 */
export function sampleRouteWaypoints(
  coords: MapCoord[],
  options: SamplingOptions = {}
): MapCoord[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (coords.length === 0) return [];
  if (coords.length === 1) return [coords[0]];
  if (coords.length === 2) return [coords[0], coords[1]];
  
  // If already within limit, return as-is (but still apply min spacing)
  if (coords.length <= opts.maxWaypoints + 2) {
    const allIndices = coords.map((_, i) => i);
    const spaced = enforceMinSpacing(coords, allIndices, opts.minSpacing);
    return spaced.map(i => coords[i]);
  }
  
  // Step 1: Douglas-Peucker simplification
  const dpIndices = douglasPeucker(coords, opts.dpTolerance);
  
  // Step 2: Detect turns/intersections
  const turnIndices = detectTurns(coords, opts.minHeadingChange);
  
  // Step 3: Merge important points
  const importantIndices = new Set([...dpIndices, ...turnIndices]);
  
  // Step 4: Convert to sorted array
  let selectedIndices = Array.from(importantIndices).sort((a, b) => a - b);
  
  // Step 5: Enforce minimum spacing
  selectedIndices = enforceMinSpacing(coords, selectedIndices, opts.minSpacing);
  
  // Step 6: Priority-based capping (preserves critical maneuver points)
  if (selectedIndices.length > opts.maxWaypoints + 2) {
    // Calculate priority for each waypoint based on heading change
    const priorities = new Map<number, number>();
    
    for (let i = 0; i < selectedIndices.length; i++) {
      const idx = selectedIndices[i];
      
      // First and last always kept
      if (i === 0 || i === selectedIndices.length - 1) {
        priorities.set(idx, 6); // Sentinel priority for endpoints
        continue;
      }
      
      // Calculate heading change at this point
      const prevIdx = selectedIndices[i - 1];
      const nextIdx = selectedIndices[i + 1];
      
      const bearingBefore = calculateBearing(coords[prevIdx], coords[idx]);
      const bearingAfter = calculateBearing(coords[idx], coords[nextIdx]);
      
      let headingChange = Math.abs(bearingAfter - bearingBefore);
      if (headingChange > 180) headingChange = 360 - headingChange;
      
      // Classify by importance
      if (headingChange >= 70) {
        priorities.set(idx, 5); // Critical: roundabout/fork/major turn
      } else if (headingChange >= 45) {
        priorities.set(idx, 4); // Important: sharp turn
      } else if (headingChange >= 25) {
        priorities.set(idx, 3); // Moderate: curve/bend
      } else if (dpIndices.has(idx)) {
        priorities.set(idx, 2); // DP shape-preserving point
      } else {
        priorities.set(idx, 1); // Spacing-only point
      }
    }
    
    // Always keep: first, last, all priority 5, all priority 4
    const mustKeep = new Set<number>();
    for (let i = 0; i < selectedIndices.length; i++) {
      const idx = selectedIndices[i];
      const priority = priorities.get(idx) ?? 1;
      if (priority >= 4) {
        mustKeep.add(idx);
      }
    }
    
    // If critical points already exceed limit, keep them anyway (turns > API limit)
    if (mustKeep.size >= opts.maxWaypoints + 2) {
      selectedIndices = Array.from(mustKeep).sort((a, b) => a - b);
    } else {
      // Fill remaining slots with priority 3 → 2 → 1 (highest first)
      const candidates = selectedIndices
        .map((idx, i) => ({ idx, priority: priorities.get(idx) ?? 1, position: i }))
        .filter(p => !mustKeep.has(p.idx));
      
      // Sort by priority (descending), then by position (preserve order)
      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.position - b.position;
      });
      
      const toKeep = new Set(mustKeep);
      
      // Add highest priority candidates until limit reached
      for (const candidate of candidates) {
        if (toKeep.size >= opts.maxWaypoints + 2) break;
        toKeep.add(candidate.idx);
      }
      
      // Check for isolated high-priority points (never remove both neighbors)
      const finalIndices = Array.from(toKeep).sort((a, b) => a - b);
      for (let i = 1; i < finalIndices.length - 1; i++) {
        const idx = finalIndices[i];
        const priority = priorities.get(idx) ?? 1;
        
        // If this is high-priority (≥3) and both neighbors are removed, restore one
        if (priority >= 3) {
          const prevInOriginal = selectedIndices[selectedIndices.indexOf(idx) - 1];
          const nextInOriginal = selectedIndices[selectedIndices.indexOf(idx) + 1];
          
          const prevKept = toKeep.has(prevInOriginal);
          const nextKept = toKeep.has(nextInOriginal);
          
          // If isolated, restore the higher-priority neighbor
          if (!prevKept && !nextKept && toKeep.size < opts.maxWaypoints + 2) {
            const prevPriority = priorities.get(prevInOriginal) ?? 1;
            const nextPriority = priorities.get(nextInOriginal) ?? 1;
            toKeep.add(prevPriority >= nextPriority ? prevInOriginal : nextInOriginal);
          }
        }
      }
      
      selectedIndices = Array.from(toKeep).sort((a, b) => a - b);
    }
  }
  
  return selectedIndices.map(i => coords[i]);
}

/**
 * Cache for sampled waypoints (avoid recomputation on every GPS update)
 */
const waypointCache = new Map<string, MapCoord[]>();

/**
 * Get sampled waypoints with caching (keyed by route ID)
 * 
 * @param routeId - Unique route identifier for cache key
 * @param coords - Full route coordinates
 * @param options - Sampling parameters
 * @returns Cached or freshly computed waypoints
 */
export function getCachedWaypoints(
  routeId: string,
  coords: MapCoord[],
  options?: SamplingOptions
): MapCoord[] {
  const cacheKey = `${routeId}-${coords.length}`;
  
  if (waypointCache.has(cacheKey)) {
    return waypointCache.get(cacheKey)!;
  }
  
  const waypoints = sampleRouteWaypoints(coords, options);
  waypointCache.set(cacheKey, waypoints);
  
  return waypoints;
}

/**
 * Clear waypoint cache (call when routes are updated)
 */
export function clearWaypointCache() {
  waypointCache.clear();
}
