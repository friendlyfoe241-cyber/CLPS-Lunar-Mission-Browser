// Shared types for LunaSight site analysis.

export interface SiteInfo {
  id: string
  name: string
  lat: number
  lon: number
  lonEast0: number
  description: string
  coordinateSource: string
  siteClass: string
  region?: string | null
  elevationM: number
  slopeDeg?: number | null
  slopeBaselineM?: number
  dem?: {
    tile?: string | null
    resolutionM?: number
    source?: string
  }
  horizon?: {
    azimuthStepDeg: number
    units: string
    radiusM: number
    gridResM: number
    values?: (number | null)[]
  }
  uncertainty?: { elevation?: number | null; statement?: string }
  provenance?: { generated?: string; terrainSource?: string }
}

export interface AnalysisPoint {
  kind: "site" | "custom"
  id: string
  name: string
  lat: number
  lon: number
  elevationM: number
  slopeDeg: number | null
  horizon: (number | null)[] | null
  horizonAvailable: boolean
  demResolutionM: number | null
  demLabel: string
  dataQualityStatement: string
  site: SiteInfo | null
}

export interface VisibilityView {
  geometricVisible: boolean
  terrainVisible: boolean | null
  horizonDeg: number | null
  clearanceDeg: number | null
  state: string
}

export interface SolarView {
  irradianceWm2: number
  incidenceFactor: number
  powerW: number
}

export interface SiteSnapshot {
  utcIso: string
  sun: {
    azimuthDeg: number
    elevationDeg: number
    incidenceDeg: number
    distanceKm: number
    geometricVisible: boolean
    visibility: VisibilityView
  }
  earth: {
    azimuthDeg: number
    elevationDeg: number
    distanceKm: number
    geometricVisible: boolean
    visibility: VisibilityView
  }
  dte: {
    geometricVisible: boolean
    terrainVisible: boolean | null
  }
  illumination: {
    lit: boolean
  }
  solar: SolarView
}