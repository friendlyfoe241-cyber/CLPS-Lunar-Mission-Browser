// Site analysis: visibility, illumination, DTE, solar estimate.
// Mirrors scientific/lunasight/illumination/{visibility,solar,analysis}.py

import { SOLAR_CONSTANT_WM2 } from "./constants"

export type VisibilityState = "VISIBLE" | "OBSTRUCTED" | "BELOW HORIZON" | "TERRAIN UNKNOWN"

export interface VisibilityResult {
  geometricVisible: boolean
  terrainVisible: boolean | null // null = unknown (no horizon)
  terrainHorizonDeg: number | null
  clearanceDeg: number | null // sun/body elevation minus horizon elevation (deg)
  state: VisibilityState
}

export function visibilityForBody(
  elevationDeg: number,
  azimuthDeg: number,
  horizonValues?: number[] | null, // length 360, azimuth step 1 deg
): VisibilityResult {
  const geometricVisible = elevationDeg > 0
  if (!horizonValues || horizonValues.length === 0) {
    return {
      geometricVisible,
      terrainVisible: null,
      terrainHorizonDeg: null,
      clearanceDeg: null,
      state: geometricVisible ? "VISIBLE" : "BELOW HORIZON",
    }
  }
  // Linear interpolation of the 1-deg azimuth grid with wraparound
  const az = ((azimuthDeg % 360) + 360) % 360
  const i0 = Math.floor(az)
  const f = az - i0
  const i1 = (i0 + 1) % 360
  const h0 = horizonValues[i0]
  const h1 = horizonValues[i1]
  const horizonDeg = (h0 ?? h1 ?? 0) * (1 - f) + (h1 ?? h0 ?? 0) * f
  const clearance = elevationDeg - horizonDeg
  const terrainVisible = elevationDeg > horizonDeg
  let state: VisibilityState = geometricVisible ? "VISIBLE" : "BELOW HORIZON"
  if (geometricVisible) {
    state = terrainVisible ? "VISIBLE" : "OBSTRUCTED"
  }
  if (!geometricVisible && terrainVisible === false) {
    state = "BELOW HORIZON"
  }
  return { geometricVisible, terrainVisible, terrainHorizonDeg: horizonDeg, clearanceDeg: clearance, state }
}

export interface SolarPanelConfig {
  orientation: "horizontal" | "vertical" | "tracking" | "azimuthElevation"
  azimuthDeg?: number // for custom fixed orientation
  elevationDeg?: number
  areaM2: number
  efficiency: number // Frac (0..1)
  losses: number // Frac (0..1)
}

export interface SolarResult {
  irradianceWm2: number
  incidenceFactor: number
  powerW: number
}

export function solarIrradiance(distanceKm: number): number {
  // solar constant scaled by 1/r^2 (r in AU)
  const au3Km = 149_597_870.7
  const rAU = distanceKm / au3Km
  return SOLAR_CONSTANT_WM2 / (rAU * rAU)
}

function cosineOfIncidence(
  sunElevDeg: number,
  sunAzDeg: number,
  panel: SolarPanelConfig,
): number {
  const elR = (sunElevDeg * Math.PI) / 180
  const azR = (sunAzDeg * Math.PI) / 180
  switch (panel.orientation) {
    case "horizontal": {
      // panel normal is up: cos(incidence) = sin(elevation)
      return Math.max(0, Math.sin(elR))
    }
    case "vertical": {
      // panel normal is horizontal, default face south (=azimuth 180, i.e.
      // toward +X/0E on IAU south polar, toward Earth); cos(theta) =
      // |cos(el)| cos(az - panelAz).  We use a south-facing panel.
      const panelAzR = Math.PI
      return Math.max(0, Math.cos(elR)) * Math.max(0, Math.cos(azR - panelAzR))
    }
    case "tracking": {
      // ideal dual-axis tracking: normal always aligned to Sun
      return 1.0
    }
    case "azimuthElevation": {
      const pAz = ((panel.azimuthDeg ?? 180) * Math.PI) / 180
      const pEl = ((panel.elevationDeg ?? 45) * Math.PI) / 180
      const cosTheta =
        Math.cos(elR) * Math.cos(pEl) * Math.cos(azR - pAz) +
        Math.sin(elR) * Math.sin(pEl)
      return Math.max(0, cosTheta)
    }
    default:
      return Math.max(0, Math.sin(elR))
  }
}

export function estimatedPowerW(
  sunElevDeg: number,
  sunAzDeg: number,
  distanceKm: number,
  panel: SolarPanelConfig,
): SolarResult {

  const irradiance = solarIrradiance(distanceKm)
  const factor = cosineOfIncidence(sunElevDeg, sunAzDeg, panel)
  const power =
    irradiance * factor * panel.areaM2 * panel.efficiency * (1 - panel.losses)
  return { irradianceWm2: irradiance, incidenceFactor: factor, powerW: power }
}