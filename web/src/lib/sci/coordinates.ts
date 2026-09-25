// LunaSight scientific constants and coordinate conventions.
// Mirrors scientific/lunasight/constants.py and coordinates/projection.py.

export const MOON_RADIUS_M = 1_737_400.0
export const SOLAR_CONSTANT_WM2 = 1_361.0 // mean Solar irradiance at 1 AU (W/m2)
export const DEG2RAD = Math.PI / 180.0
export const RAD2DEG = 180.0 / Math.PI

// --- longitude / azimuth helpers (planetocentric; east-positive)
export function normalizeLon(lon: number): number {
  return ((((lon + 180.0) % 360.0) + 360.0) % 360.0) - 180.0
}

export function normalizeAzimuth(az: number): number {
  const a = az % 360.0
  return a < 0 ? a + 360.0 : a
}

export function latLonToRect(
  latDeg: number,
  lonDeg: number,
): [number, number, number] {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const cl = Math.cos(lat)
  const x = cl * Math.cos(lon) * MOON_RADIUS_M
  const y = cl * Math.sin(lon) * MOON_RADIUS_M
  const z = Math.sin(lat) * MOON_RADIUS_M
  return [x, y, z]
}

export function rectToLatLon(x: number, y: number, z: number): [number, number] {
  const r = Math.sqrt(x * x + y * y + z * z) || 1
  const lat = Math.asin(z / r) * RAD2DEG
  const lon = Math.atan2(y, x) * RAD2DEG
  return [lat, normalizeLon(lon)]
}

/**
 * IAU 30135 south polar stereographic transform (sphere R = MOON_RADIUS_M).
 *   rho = 2 R tan(pi/4 + lat/2)
 *   X = rho sin(lon)   Y = rho cos(lon)
 * So +X -> 90E (near-side up on PGDA products), +Y -> 0E (toward Earth).
 */
export const TWOPI = 2 * Math.PI

export function spstereoToLatLon(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y)
  const lat = 2 * Math.atan2(rho, 2 * MOON_RADIUS_M) * RAD2DEG - 90.0
  const lon = Math.atan2(x, y) * RAD2DEG
  return [lat, normalizeLon(lon)]
}

export function latLonToSpstereo(latDeg: number, lonDeg: number): [number, number] {
  const phi = latDeg * DEG2RAD
  const rho = 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + phi / 2)
  const lon = lonDeg * DEG2RAD
  return [rho * Math.sin(lon), rho * Math.cos(lon)]
}

/** Local tangent-plane basis at (lat, lon): up outward radial,
 *  north toward -lat, east toward +lon.  Right-handed triple
 *  {east, north, up} (east x north = up).
 */
export function surfaceVectors(latDeg: number, lonDeg: number): {
  up: [number, number, number]
  north: [number, number, number]
  east: [number, number, number]
} {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const cl = Math.cos(lat)
  const sl = Math.sin(lat)
  const co = Math.cos(lon)
  const so = Math.sin(lon)
  const up: [number, number, number] = [cl * co, cl * so, sl]
  const north: [number, number, number] = [-sl * co, -sl * so, cl]
  const east: [number, number, number] = [-so, co, 0]
  return { up, north, east }
}

/** Topocentric azimuth/elevation of a body at body-fixed (x,y,z)
 *  from observer at body-fixed (ox,oy,oz), located at (latDeg, lonDeg).
 *  Azimuth convention: 0=N, 90=E, 180=S, 270=W.
 */
export function topocentricDirectionTo(
  body: [number, number, number],
  observer: [number, number, number],
  latDeg: number,
  lonDeg: number,
): { azimuthDeg: number; elevationDeg: number } {
  const { up, north, east } = surfaceVectors(latDeg, lonDeg)
  const rx = body[0] - observer[0]
  const ry = body[1] - observer[1]
  const rz = body[2] - observer[2]
  const upC = rx * up[0] + ry * up[1] + rz * up[2]
  const nC = rx * north[0] + ry * north[1] + rz * north[2]
  const eC = rx * east[0] + ry * east[1] + rz * east[2]
  const elev = Math.atan2(upC, Math.hypot(nC, eC)) * RAD2DEG
  const az = normalizeAzimuth(Math.atan2(eC, nC) * RAD2DEG)
  return { azimuthDeg: az, elevationDeg: elev }
}