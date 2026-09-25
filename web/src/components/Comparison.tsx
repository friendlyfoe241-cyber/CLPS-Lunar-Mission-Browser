"use client"

// Comparison mode: renders two site panels side by side with
// synchronized metrics, plus a combined multi-site timeline.

import type { AnalysisPoint, SiteSnapshot } from "@/lib/sci/types"
import SitePanel from "./SitePanel"
import Timeline from "./Timeline"
import type { TimelineSeries } from "./Timeline"

interface ComparisonProps {
  a: AnalysisPoint | null
  aSnap: SiteSnapshot | null
  b: AnalysisPoint | null
  bSnap: SiteSnapshot | null
  seriesA: TimelineSeries[]
  seriesB: TimelineSeries[]
  t: number
  onSelectT: (t: number) => void
}

export default function Comparison({ a, aSnap, b, bSnap, seriesA, seriesB, t, onSelectT }: ComparisonProps) {
  if (!a || !b) {
    return (
      <div className="luna-panel p-4 text-[var(--dim)]">
        Shift-click a second marker on the map or pick from the comparison list to enable side-by-side comparison.
      </div>
    )
  }

  // Summary strip of key differences
  const aSeries = seriesA.find((s) => Math.abs(s.t - t) < 1000)
  const bSeries = seriesB.find((s) => Math.abs(s.t - t) < 1000)

  const sunlitA = aSnap?.illumination.lit ?? false
  const sunlitB = bSnap?.illumination.lit ?? false

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SitePanel pt={a} snap={aSnap} title="Site A" accent="#ffcf5c" />
        <SitePanel pt={b} snap={bSnap} title="Site B" accent="#6fa8ff" />
      </div>

      <div className="luna-panel p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="term">Synchronized comparison</span>
          <span className="text-[11px] text-[var(--muted)]">
            {a?.name} vs {b?.name}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <CompStat label="Sun elevation" a={aSnap?.sun.elevationDeg} b={bSnap?.sun.elevationDeg} unit="°" aColor="#ffcf5c" bColor="#ffcf5c" />
          <CompStat label="Sun az" a={aSnap?.sun.azimuthDeg} b={bSnap?.sun.azimuthDeg} unit="°" aColor="#ffcf5c" bColor="#ffcf5c" />
          <CompStat label="Earth elevation" a={aSnap?.earth.elevationDeg} b={bSnap?.earth.elevationDeg} unit="°" aColor="#6fa8ff" bColor="#6fa8ff" />
          <CompStat label="Earth az" a={aSnap?.earth.azimuthDeg} b={bSnap?.earth.azimuthDeg} unit="°" aColor="#6fa8ff" bColor="#6fa8ff" />
          <CompStat label="Sunlight" a={sunlitA ? "YES" : "NO"} b={sunlitB ? "YES" : "NO"} />
          <CompStat label="DTE geometric" a={aSnap?.dte.geometricVisible ? "YES" : "NO"} b={bSnap?.dte.geometricVisible ? "YES" : "NO"} />
          <CompStat
            label="Est. power / m²"
            a={aSnap?.solar.powerW}
            b={bSnap?.solar.powerW}
            unit=" W"
            aColor="#ffcf5c"
            bColor="#ffcf5c"
          />
          <CompStat
            label="Slope"
            a={a?.slopeDeg ?? null}
            b={b?.slopeDeg ?? null}
            unit="°"
          />
        </div>
      </div>

      <div className="luna-panel p-3">
        <Timeline label="Comparison" series={seriesA} t={t} onSelectT={onSelectT} />
      </div>
    </div>
  )
}

function CompStat({ label, a, b, unit = "", aColor, bColor }: { label: string; a?: number | string | null; b?: number | string | null; unit?: string; aColor?: string; bColor?: string }) {
  const fmt = (v: number | string | null | undefined) => (v == null ? "—" : typeof v === "number" ? v.toFixed(2) + unit : `${v}${unit}`)
  return (
    <div className="rounded border border-[var(--border-soft)] bg-[var(--panel-2)] px-2 py-1.5">
      <div className="term">{label}</div>
      <div className="flex items-center justify-between gap-1 mono text-[12px]">
        <span style={{ color: aColor ?? "var(--foreground)" }}>{fmt(a)}</span>
        <span className="text-[var(--dim)]">/</span>
        <span style={{ color: bColor ?? "var(--foreground)" }}>{fmt(b)}</span>
      </div>
    </div>
  )
}