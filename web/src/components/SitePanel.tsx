"use client"

// Site information panel: location, Sun, Earth, DTE, power, data quality.

import { useMemo } from "react"
import type { AnalysisPoint, SiteSnapshot } from "@/lib/sci/types"
import { SITE_ROSTER } from "@/lib/sci/data"

interface SitePanelProps {
  pt: AnalysisPoint | null
  snap: SiteSnapshot | null
  title?: string
  accent?: string
}

function fmtBearing(az: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  const i = Math.round((((az % 360) + 360) % 360) / 22.5) % 16
  return dirs[i]
}

export function StatusChip({ state }: { state: string }) {
  const cls =
    state === "VISIBLE" ? "status-visible" : state === "OBSTRUCTED" ? "status-obstructed" : state === "BELOW HORIZON" ? "status-horizon" : "status-unknown"
  return (
    <span className={`chip ${cls}`} style={{ border: "1px solid currentColor" }}>
      {state}
    </span>
  )
}

export default function SitePanel({ pt, snap, title, accent = "#5bb8ff" }: SitePanelProps) {
  const roster = useMemo(() => {
    if (!pt) return null
    return SITE_ROSTER.find((s) => s.id === pt.id)
  }, [pt?.id])

  if (!pt) {
    return (
      <div className="luna-panel p-4 text-[var(--dim)]">
        Select a location on the map or from the list to begin analysis.
      </div>
    )
  }

  const sun = snap?.sun
  const earth = snap?.earth
  const solar = snap?.solar

  return (
    <div className="luna-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: accent }}>
            {title ? `${title}: ` : ""}{pt.name}
          </div>
          <div className="term">
            {pt.kind === "custom" ? "User-defined analysis point" : roster?.region ?? "Catalogued site"}
          </div>
        </div>
        <StatusChip state={chipState(snap)} />
      </div>

      <div className="grid grid-cols-3 gap-px bg-[var(--border-soft)]">
        <Stat label="Latitude (planetoc.)" value={pt.lat.toFixed(3) + "°"} />
        <Stat label="Longitude (east)" value={pt.lon.toFixed(3) + "°"} />
        <Stat label="Elevation (DEM)" value={pt.elevationM.toFixed(0) + " m"} cls={pt.kind === "site" ? "source" : "source"} />
        <Stat label="Slope" value={pt.slopeDeg == null ? "n/a" : pt.slopeDeg.toFixed(2) + "°"} />
        <Stat label="DEM resolution" value={pt.demResolutionM ? `${pt.demResolutionM} m` : "n/a"} />
        <Stat label="Horizon model" value={pt.horizonAvailable ? "precomputed" : "unavailable"} />
      </div>

      <div className="rule" />

      <div className="px-3 py-2">
        <div className="term mb-1">Sun · {snap ? fmtClock(snap.utcIso) : "—"}</div>
        {sun ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <Row k="Elevation" v={`${sun.elevationDeg.toFixed(2)}°`} big />
            <Row k="Azimuth" v={`${sun.azimuthDeg.toFixed(1)}° (${fmtBearing(sun.azimuthDeg)})`} />
            <Row k="Incidence (from zenith)" v={`${sun.incidenceDeg.toFixed(2)}°`} />
            <Row k="Distance" v={`${(sun.distanceKm / 1e6).toFixed(4)} Mkm`} />
            <Row k="Geometric visibility" v={sun.geometricVisible ? "VISIBLE" : "BELOW HORIZON"} />
            <Row k="Terrain visibility" v={sun.visibility.terrainVisible == null ? "n/a" : sun.visibility.terrainVisible ? "VISIBLE" : "OBSTRUCTED"} />
            <Row k="Terrain horizon @Sun az" v={sun.visibility.horizonDeg == null ? "n/a" : `${sun.visibility.horizonDeg.toFixed(1)}°`} />
            <Row k="Horizon clearance" v={sun.visibility.clearanceDeg == null ? "n/a" : `${sun.visibility.clearanceDeg.toFixed(1)}°`} />
          </div>
        ) : (
          <div className="text-[var(--dim)]">loading…</div>
        )}
      </div>

      <div className="rule" />

      <div className="px-3 py-2">
        <div className="term mb-1">Earth / DTE</div>
        {earth ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <Row k="Elevation" v={`${earth.elevationDeg.toFixed(2)}°`} big />
            <Row k="Azimuth" v={`${earth.azimuthDeg.toFixed(1)}° (${fmtBearing(earth.azimuthDeg)})`} />
            <Row k="Distance" v={`${(earth.distanceKm / 1e6).toFixed(4)} Mkm`} />
            <Row k="Geometric DTE" v={earth.geometricVisible ? "VISIBLE" : "BELOW HORIZON"} />
            <Row k="Terrain DTE" v={earth.visibility.terrainVisible == null ? "n/a" : earth.visibility.terrainVisible ? "VISIBLE" : "OBSTRUCTED"} />
            <Row k="Terrain horizon @Earth az" v={earth.visibility.horizonDeg == null ? "n/a" : `${earth.visibility.horizonDeg.toFixed(1)}°`} />
          </div>
        ) : (
          <div className="text-[var(--dim)]">loading…</div>
        )}
      </div>

      <div className="rule" />

      <div className="px-3 py-2">
        <div className="term mb-1">Solar generation model (user-configurable)</div>
        {solar ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <Row k="Irradiance at Moon" v={`${solar.irradianceWm2.toFixed(0)} W/m²`} />
            <Row k="Incidence factor" v={`${solar.incidenceFactor.toFixed(3)}`} />
            <Row k="Est. generation / m² (horizontal)" v={`${solar.powerW.toFixed(1)} W`} big accent="#ffcf5c" />
          </div>
        ) : (
          <div className="text-[var(--dim)]">loading…</div>
        )}
        <div className="mt-1 text-[10px] text-[var(--dim)]">
          Estimated model, not actual spacecraft performance. Assumes a horizontal panel with 29% efficiency, 15% losses; see Data & Methods.
        </div>
      </div>

      <div className="rule" />

      <div className="px-3 py-2">
        <div className="term mb-1">Data quality</div>
        <div className="text-[11px] text-[var(--muted)]">
          {pt.dataQualityStatement}
          {" "}
          <span className="text-[var(--dim)]">Terrain: {pt.demLabel}. Uncertainty not quantified in this analysis unless stated by the source DEM.</span>
        </div>
      </div>
    </div>
  )
}

function fmtClock(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ")
}

function chipState(snap: SiteSnapshot | null): string {
  if (!snap) return "TERRAIN UNKNOWN"
  if (snap.illumination.lit) return "VISIBLE"
  if (snap.sun.elevationDeg > 0 && !snap.sun.visibility.terrainVisible) return "OBSTRUCTED"
  return "BELOW HORIZON"
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="px-2 py-1.5">
      <div className="term">{label}</div>
      <div className={`mono text-[13px] ${cls === "source" ? "text-[var(--ok)]" : "text-[var(--foreground)]"}`}>{value}</div>
    </div>
  )
}

function Row({ k, v, big, accent }: { k: string; v: string; big?: boolean; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-[var(--muted)]">{k}</span>
      <span className={`mono ${big ? "text-[14px] font-semibold" : "text-[12px]"}`} style={accent ? { color: accent } : undefined}>{v}</span>
    </div>
  )
}