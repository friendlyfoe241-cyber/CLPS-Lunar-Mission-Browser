// High-level site analysis: ephemeris + site terrain + panel -> snapshot.
// Mirrors scientific/lunasight/illumination/analysis.py

import { visibilityForBody, estimatedPowerW, type SolarPanelConfig } from "./analysis"
import { geometryAt, type EphemerisRow } from "./ephemeris"
import type { AnalysisPoint, SiteSnapshot } from "./types"

export function analyzePoint(
  rows: EphemerisRow[],
  t: number,
  pt: AnalysisPoint,
  tableStartEt: number,
  tableStartIsoUtc: string,
  panel?: SolarPanelConfig,
): SiteSnapshot {
  const rawHorizon = pt.horizon
  const horizon: number[] | null =
    rawHorizon && rawHorizon.length > 0 ? rawHorizon.map((h) => h ?? 0) : null
  const geom = geometryAt(rows, t, pt.lat, pt.lon, pt.elevationM, tableStartEt, tableStartIsoUtc)

  const sunVis = visibilityForBody(geom.sun.elevationDeg, geom.sun.azimuthDeg, horizon)
  const earthVis = visibilityForBody(geom.earth.elevationDeg, geom.earth.azimuthDeg, horizon)

  const dteGeometric = geom.earth.elevationDeg > 0
  const dteTerrain = horizon ? earthVis.terrainVisible : null

  const lit = horizon ? (sunVis.terrainVisible ?? sunVis.geometricVisible) : sunVis.geometricVisible

  const defaultPanel: SolarPanelConfig = { orientation: "horizontal", areaM2: 1, efficiency: 0.29, losses: 0.15 }
  const solar = estimatedPowerW(geom.sun.elevationDeg, geom.sun.azimuthDeg, geom.sun.distanceKm, panel ?? defaultPanel)

  return {
    utcIso: geom.utcIso,
    sun: {
      azimuthDeg: geom.sun.azimuthDeg,
      elevationDeg: geom.sun.elevationDeg,
      incidenceDeg: geom.sun.incidenceDeg,
      distanceKm: geom.sun.distanceKm,
      geometricVisible: geom.sun.elevationDeg > 0,
      visibility: {
        geometricVisible: sunVis.geometricVisible,
        terrainVisible: sunVis.terrainVisible,
        horizonDeg: sunVis.terrainHorizonDeg,
        clearanceDeg: sunVis.clearanceDeg,
        state: sunVis.state,
      },
    },
    earth: {
      azimuthDeg: geom.earth.azimuthDeg,
      elevationDeg: geom.earth.elevationDeg,
      distanceKm: geom.earth.distanceKm,
      geometricVisible: dteGeometric,
      visibility: {
        geometricVisible: earthVis.geometricVisible,
        terrainVisible: earthVis.terrainVisible,
        horizonDeg: earthVis.terrainHorizonDeg,
        clearanceDeg: earthVis.clearanceDeg,
        state: earthVis.state,
      },
    },
    dte: { geometricVisible: dteGeometric, terrainVisible: dteTerrain },
    illumination: { lit },
    solar,
  }
}

/** Compute a timeline series for a site at a set of ET epochs. */
export function analyzeSeries(
  rows: EphemerisRow[],
  startEt: number,
  stepEt: number,
  count: number,
  pt: AnalysisPoint,
  tableStartEt: number,
  tableStartIsoUtc: string,
  panel?: SolarPanelConfig,
): Array<{ t: number; utcIso: string; sunEl: number; sunAz: number; earthEl: number; earthAz: number; sunVis: string; earthVis: string; lit: boolean; powerW: number; sunHorizon: number | null; earthHorizon: number | null }> {
  const out = []
  for (let i = 0; i < count; i++) {
    const t = startEt + i * stepEt
    const sn = analyzePoint(rows, t, pt, tableStartEt, tableStartIsoUtc, panel)
    out.push({
      t,
      utcIso: sn.utcIso,
      sunEl: sn.sun.elevationDeg,
      sunAz: sn.sun.azimuthDeg,
      earthEl: sn.earth.elevationDeg,
      earthAz: sn.earth.azimuthDeg,
      sunVis: sn.sun.visibility.state,
      earthVis: sn.earth.visibility.state,
      lit: sn.illumination.lit,
      powerW: sn.solar.powerW,
      sunHorizon: sn.sun.visibility.horizonDeg,
      earthHorizon: sn.earth.visibility.horizonDeg,
    })
  }
  return out
}