"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { loadEphemerisTable, loadSiteInfo, type SiteInfo } from "./data"
import type { EphemerisTable } from "./ephemeris"
import type { AnalysisPoint, SiteSnapshot } from "./types"
import { analyzePoint } from "./analyze"
import { utcToEt } from "./ephemeris"
import type { SolarPanelConfig } from "./analysis"

export interface AppState {
  ready: boolean
  error: string | null
  ephemeris: EphemerisTable | null
  sites: SiteInfo[]
  primary: AnalysisPoint | null
  compare: AnalysisPoint | null
  utcIso: string
  panel: SolarPanelConfig
  analysisRange: { startIso: string; stopIso: string; stepMin: number }
}

const DEFAULT_PANEL: SolarPanelConfig = {
  orientation: "horizontal",
  areaM2: 1.0,
  efficiency: 0.29,
  losses: 0.15,
}

export function useLunaStore() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<EphemerisTable | null>(null)
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [primary, setPrimary] = useState<AnalysisPoint | null>(null)
  const [compare, setCompare] = useState<AnalysisPoint | null>(null)
  const [utcIso, setUtcIso] = useState<string>("2026-01-01T00:00:00.000Z")
  const [panel, setPanel] = useState<SolarPanelConfig>(DEFAULT_PANEL)
  const [range, setRange] = useState({
    startIso: "2025-06-01T00:00:00.000Z",
    stopIso: "2026-06-01T00:00:00.000Z",
    stepMin: 30,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ephem = await loadEphemerisTable()
        if (cancelled) return
        setTable(ephem)
        // default: load all site info
        const loaded = await Promise.all(
          ephem ? [] : [],
        )
        void loaded
        setReady(true)
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const makeAnalysisPoint = useCallback(
    async (siteId: string): Promise<AnalysisPoint | null> => {
      const info = await loadSiteInfo(siteId)
      if (!info) return null
      return {
        kind: "site",
        id: info.id,
        name: info.name,
        lat: info.lat,
        lon: info.lon,
        elevationM: info.elevationM,
        slopeDeg: info.slopeDeg ?? null,
        horizon: info.horizon?.values ?? null,
        horizonAvailable: !!info.horizon?.values?.length,
        demResolutionM: info.dem?.resolutionM ?? null,
        demLabel: info.dem?.source ?? "LOLA",
        dataQualityStatement:
          info.uncertainty?.statement ??
          "Uncertainty not quantified in this analysis.",
        site: info,
      }
    },
    [],
  )

  const selectSite = useCallback(
    async (siteId: string) => {
      const pt = await makeAnalysisPoint(siteId)
      if (pt) setPrimary(pt)
    },
    [makeAnalysisPoint],
  )

  const addCompareSite = useCallback(
    async (siteId: string) => {
      const pt = await makeAnalysisPoint(siteId)
      if (pt) setCompare(pt)
    },
    [makeAnalysisPoint],
  )

  const setCustomPoint = useCallback(
    (
      lat: number,
      lon: number,
      elevationM: number,
      horizon: (number | null)[],
      horizonQuality: "computed" | "flat" = "flat",
    ) => {
      const hasRealHorizon = horizonQuality === "computed" && horizon.some((v) => v != null)
      setPrimary({
        kind: "custom",
        id: `custom:${lat.toFixed(3)}:${lon.toFixed(3)}`,
        name: "User-defined analysis point",
        lat,
        lon,
        elevationM,
        slopeDeg: null,
        horizon,
        horizonAvailable: hasRealHorizon,
        demResolutionM: 80,
        demLabel: hasRealHorizon ? "LOLA 80 m/px regional (runtime horizon)" : "LOLA 80 m/px regional",
        dataQualityStatement: hasRealHorizon
          ? "Terrain horizon computed at runtime from the 80 m/px regional grid — lower resolution than the 5 m site-specific horizons used for catalog sites, but a real terrain estimate, not a flat assumption."
          : "Flat horizon assumed — the regional terrain grid was not available when this point was analyzed, so Sun/Earth visibility below uses geometry only, not terrain obstruction.",
        site: null,
      })
    },
    [],
  )

  const et = useMemo(() => {
    if (!table) return 0
    return utcToEt(utcIso, table.startT, table.startIsoUtc)
  }, [utcIso, table])

  const primarySnapshot = useMemo<SiteSnapshot | null>(() => {
    if (!table || !primary) return null
    return analyzePoint(table.rows, et, primary, table.startT, table.startIsoUtc, panel)
  }, [table, et, primary, panel])

  const compareSnapshot = useMemo<SiteSnapshot | null>(() => {
    if (!table || !compare) return null
    return analyzePoint(table.rows, et, compare, table.startT, table.startIsoUtc, panel)
  }, [table, et, compare, panel])

  return {
    ready,
    error,
    table,
    sites,
    primary,
    compare,
    utcIso,
    setUtcIso,
    panel,
    setPanel,
    range,
    setRange,
    selectSite,
    addCompareSite,
    setCustomPoint,
    primarySnapshot,
    compareSnapshot,
  }
}

export type LunaStore = ReturnType<typeof useLunaStore>