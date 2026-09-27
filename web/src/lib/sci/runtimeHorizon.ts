// Approximate terrain horizon for a user-clicked point that doesn't have a
// precomputed 5 m site-specific horizon profile. Samples outward from the
// point along each compass direction using the client-side 80 m/px regional
// elevation grid, and reuses the app's existing topocentricDirectionTo /
// latLonToRect helpers (the same ones used for Sun/Earth az-el) so results
// stay on the same footing as every other number in the app.
//
// This is deliberately lower fidelity than the 5 m catalog-site horizons —
// see the "computed" vs "flat" quality label this feeds back to SitePanel —
// and returns `null` (never a fabricated 0) wherever no valid sample exists.

import { latLonToRect, topocentricDirectionTo, MOON_RADIUS_M } from "./coordinates"

/** Standard spherical "destination point given distance and initial bearing"
 *  formula (great-circle navigation on a sphere of radius MOON_RADIUS_M). */
export function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const R = MOON_RADIUS_M
  const lat1 = (latDeg * Math.PI) / 180
  const lon1 = (lonDeg * Math.PI) / 180
  const brng = (bearingDeg * Math.PI) / 180
  const dR = distanceM / R
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng))
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(brng) * Math.sin(dR) * Math.cos(lat1), Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2))
  return [(lat2 * 180) / Math.PI, (((lon2 * 180) / Math.PI + 540) % 360) - 180]
}

function pointAtElevation(latDeg: number, lonDeg: number, elevationM: number): [number, number, number] {
  const [x, y, z] = latLonToRect(latDeg, lonDeg)
  const scale = (MOON_RADIUS_M + elevationM) / MOON_RADIUS_M
  return [x * scale, y * scale, z * scale]
}

/**
 * Returns one terrain-horizon elevation angle (degrees) per integer azimuth
 * 0..359 around (latDeg, lonDeg), or `null` at azimuths where no valid
 * terrain sample was available (grid edge / missing data).
 *
 * `elevationAt(lat, lon)` is injected rather than imported so this module
 * stays independent of how/where the probe grid is loaded (see page.tsx).
 */
export function computeRuntimeHorizon(
  latDeg: number,
  lonDeg: number,
  observerElevationM: number,
  elevationAt: (lat: number, lon: number) => number | null,
  opts: { maxRadiusM?: number; steps?: number } = {},
): (number | null)[] {
  const maxRadiusM = opts.maxRadiusM ?? 30000
  const steps = opts.steps ?? 30
  const observerPt = pointAtElevation(latDeg, lonDeg, observerElevationM)
  const horizon: (number | null)[] = new Array(360).fill(null)

  for (let az = 0; az < 360; az++) {
    let best: number | null = null
    for (let i = 1; i <= steps; i++) {
      const d = (maxRadiusM * i) / steps
      const [tLat, tLon] = destinationPoint(latDeg, lonDeg, az, d)
      const elevM = elevationAt(tLat, tLon)
      if (elevM == null) continue
      const targetPt = pointAtElevation(tLat, tLon, elevM)
      const { elevationDeg } = topocentricDirectionTo(targetPt, observerPt, latDeg, lonDeg)
      if (best == null || elevationDeg > best) best = elevationDeg
    }
    horizon[az] = best
  }
  return horizon
}
