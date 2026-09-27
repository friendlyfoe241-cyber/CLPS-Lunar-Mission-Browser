// Bridges the app's already-validated body-fixed coordinate helpers
// (lib/sci/coordinates.ts) to unit-sphere vectors for the 3D globe view.
// No new geometry/astronomy is introduced here — this only rescales and
// re-expresses the same math already used for the 2D map and HorizonView,
// so the 3D view stays consistent with every other number in the app.

import { latLonToRect, surfaceVectors, MOON_RADIUS_M } from "./coordinates"

/** Point on the unit sphere (radius 1) for a given (lat, lon), in the same
 *  body-fixed axes as the rest of the app (z = polar axis, south pole = -z). */
export function unitPosition(latDeg: number, lonDeg: number): [number, number, number] {
  const [x, y, z] = latLonToRect(latDeg, lonDeg)
  return [x / MOON_RADIUS_M, y / MOON_RADIUS_M, z / MOON_RADIUS_M]
}

/** Unit-length world-frame direction vector for a body seen from (lat, lon)
 *  at a given topocentric azimuth/elevation (same convention as
 *  topocentricDirectionTo: az 0=N, 90=E, 180=S, 270=W; el 0=horizon, 90=zenith).
 *  Reuses surfaceVectors so the arrows drawn in 3D always agree with the
 *  Sun/Earth az/el numbers already shown in SitePanel and HorizonView. */
export function localDirection(
  latDeg: number,
  lonDeg: number,
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] {
  const { up, north, east } = surfaceVectors(latDeg, lonDeg)
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const cn = Math.cos(el) * Math.cos(az)
  const ce = Math.cos(el) * Math.sin(az)
  const cu = Math.sin(el)
  return [
    north[0] * cn + east[0] * ce + up[0] * cu,
    north[1] * cn + east[1] * ce + up[1] * cu,
    north[2] * cn + east[2] * ce + up[2] * cu,
  ]
}

/** Outward surface normal ("up") at (lat, lon) — used to orient the local
 *  horizon disc so it sits flat/tangent to the globe at the selected site. */
export function surfaceNormal(latDeg: number, lonDeg: number): [number, number, number] {
  return surfaceVectors(latDeg, lonDeg).up
}
