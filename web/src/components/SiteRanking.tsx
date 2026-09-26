"use client"

// Site Ranking: loop every catalog site over the current analysis range,
// compute per-site aggregate stats, and present a sortable table.
// Rows select the site as primary.

import { useEffect, useMemo, useState } from "react"
import type { TimelineSeries } from "./Timeline"
import { analyzeSeries } from "@/lib/sci/analyze"
import { utcToEt } from "@/lib/sci/ephemeris"
import { SITE_ROSTER } from "@/lib/sci/data"
import type { EphemerisTable } from "@/lib/sci/ephemeris"
import type { SolarPanelConfig } from "@/lib/sci/analysis"
import { findWindows, PREDICATES, formatWindowDuration } from "@/lib/sci/windows"

interface SiteRankingProps {
  range: { startIso: string; stopIso: string; stepMin: number }
  table: EphemerisTable | null
  panel: SolarPanelConfig
  onSelectSite: (id: string) => void
}

interface SiteRank {
  id: string
  name: string
  pctSunlit: number
  pctDte: number
  longestSunlitHours: number
  avgPowerW: number
  peakPowerW: number
}

type SortKey = keyof Omit<SiteRank, "id" | "name">

const MAX_POINTS = 2400
const CAP_SERIES_LEN = 2000

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: "pctSunlit", label: "% Sunlit", numeric: true },
  { key: "pctDte", label: "% DTE visible", numeric: true },
  { key: "longestSunlitHours", label: "Longest sunlit", numeric: true },
  { key: "avgPowerW", label: "Avg power", numeric: true },
  { key: "peakPowerW", label: "Peak power", numeric: true },
]

export default function SiteRanking({ range, table, panel, onSelectSite }: SiteRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>("pctSunlit")
  const [asc, setAsc] = useState(false)
  const [computed, setComputed] = useState<SiteRank[]>([])
  const [doneKey, setDoneKey] = useState<string>("")

  const key = `${range.startIso}|${range.stopIso}|${range.stepMin}|${table?.generated ?? ""}`
  const loading = !table || doneKey !== key

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!table) {
        if (!cancelled) {
          setComputed([])
          setDoneKey("")
        }
        return
      }
      const startEt = utcToEt(range.startIso, table.startT, table.startIsoUtc)
      const stopEt = utcToEt(range.stopIso, table.startT, table.startIsoUtc)
      const step = range.stepMin * 60
      const count = Math.max(2, Math.min(MAX_POINTS, Math.round((stopEt - startEt) / step) + 1))
      const nSer = Math.min(CAP_SERIES_LEN, count)

      const { loadSiteInfo } = await import("@/lib/sci/data")
      const ranksArr: SiteRank[] = []
      for (const site of SITE_ROSTER) {
        const info = await loadSiteInfo(site.id)
        const pt = info
          ? {
              kind: "site" as const,
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
              dataQualityStatement: info.uncertainty?.statement ?? "Uncertainty not quantified in this analysis.",
              site: info,
            }
          : {
              kind: "site" as const,
              id: site.id,
              name: site.name,
              lat: site.lat,
              lon: site.lon,
              elevationM: 0,
              slopeDeg: null,
              horizon: null,
              horizonAvailable: false,
              demResolutionM: null,
              demLabel: "LOLA",
              dataQualityStatement: "Uncertainty not quantified in this analysis.",
              site: null,
            }

        const series = analyzeSeries(table.rows, startEt, step, nSer, pt, table.startT, table.startIsoUtc, panel)
        const stats = summarize(series)
        ranksArr.push({ id: site.id, name: site.name, ...stats })
      }
      if (!cancelled) {
        setComputed(ranksArr)
        setDoneKey(key)
      }
    })().catch(() => {
      if (!cancelled) setDoneKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [key, table, range, panel])

  const sorted = useMemo(() => {
    const arr = [...computed]
    if (!sortKey) return arr
    arr.sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      const d = asc ? va - vb : vb - va
      return d
    })
    return arr
  }, [computed, sortKey, asc])

  if (!table) {
    return <div className="p-3 text-[12px] text-[var(--dim)]">Ephemeris table not loaded yet.</div>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--dim)]">
          {computed.length} sites · {range.startIso.slice(0, 10)} → {range.stopIso.slice(0, 10)}, step {range.stepMin} min
        </span>
        <span className="text-[11px] text-[var(--dim)]">{loading ? "Computing…" : "Click a row to select the site."}</span>
      </div>

      <div className="thin-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase tracking-wider text-[var(--dim)]">Site</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === c.key) setAsc((v) => !v)
                      else {
                        setSortKey(c.key)
                        setAsc(false)
                      }
                    }}
                    className={`text-[10px] uppercase tracking-wider ${
                      sortKey === c.key ? "text-[var(--accent)]" : "text-[var(--dim)]"
                    } hover:text-[var(--foreground)]`}
                  >
                    {c.label}
                    {sortKey === c.key ? (asc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelectSite(r.id)}
                className="cursor-pointer border-t border-[var(--border-soft)] hover:bg-[#1a2030]"
              >
                <td className="px-1.5 py-1 text-[var(--foreground)]">{r.name}</td>
                <td className="px-1.5 py-1 text-right mono">{r.pctSunlit.toFixed(1)}%</td>
                <td className="px-1.5 py-1 text-right mono">{r.pctDte.toFixed(1)}%</td>
                <td className="px-1.5 py-1 text-right mono">{r.longestSunlitHours > 0 ? formatWindowDuration(r.longestSunlitHours) : "—"}</td>
                <td className="px-1.5 py-1 text-right mono">{r.avgPowerW.toFixed(1)} W</td>
                <td className="px-1.5 py-1 text-right mono">{r.peakPowerW.toFixed(1)} W</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function summarize(series: TimelineSeries[]): Omit<SiteRank, "id" | "name"> {
  const n = series.length || 1
  let sunlitCount = 0
  let dteCount = 0
  let powerSum = 0
  let powerMax = -Infinity
  for (const s of series) {
    if (s.lit) sunlitCount++
    if (s.earthEl > 0 && s.earthVis !== "OBSTRUCTED") dteCount++
    powerSum += s.powerW
    if (s.powerW > powerMax) powerMax = s.powerW
  }
  const sunlitWindows = findWindows(series, PREDICATES.sunlit)
  let longestSunlit = 0
  for (const w of sunlitWindows) if (w.durationHours > longestSunlit) longestSunlit = w.durationHours
  return {
    pctSunlit: (sunlitCount / n) * 100,
    pctDte: (dteCount / n) * 100,
    longestSunlitHours: longestSunlit,
    avgPowerW: powerSum / n,
    peakPowerW: Number.isFinite(powerMax) ? powerMax : 0,
  }
}