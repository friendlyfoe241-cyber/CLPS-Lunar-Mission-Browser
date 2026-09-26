"use client"

// Window Finder: find contiguous time windows where a chosen criterion is
// true for the primary site. Rows show start/stop, duration, and a jump
// button. Windows touching the loaded range edge are flagged as such.

import { useMemo, useState } from "react"
import type { TimelineSeries } from "./Timeline"
import { findWindows, PREDICATES, formatWindowDuration, touchesRangeEdge } from "@/lib/sci/windows"

type Criterion = "sunlit" | "dte" | "both" | "power"

interface WindowFinderProps {
  series: TimelineSeries[]
  siteName: string
  onJumpTo: (t: number) => void
}

const CRITERIA: Array<{ id: Criterion; label: string }> = [
  { id: "sunlit", label: "Sunlit" },
  { id: "dte", label: "Direct-to-Earth visible" },
  { id: "both", label: "Both sunlit AND DTE visible" },
  { id: "power", label: "Power ≥ threshold" },
]

export default function WindowFinder({ series, siteName, onJumpTo }: WindowFinderProps) {
  const [criterion, setCriterion] = useState<Criterion>("sunlit")
  const [powerThreshold, setPowerThreshold] = useState(50)
  const [chrono, setChrono] = useState(false)

  const windows = useMemo(() => {
    if (series.length === 0) return []
    let pred = PREDICATES.sunlit
    if (criterion === "dte") pred = PREDICATES.dteVisible
    else if (criterion === "both") pred = PREDICATES.sunlitAndDte
    else if (criterion === "power") pred = PREDICATES.powerAbove(powerThreshold)
    const found = findWindows(series, pred)
    if (chrono) return found
    return [...found].sort((a, b) => b.durationHours - a.durationHours)
  }, [series, criterion, powerThreshold, chrono])

  if (series.length === 0) {
    return <div className="p-3 text-[12px] text-[var(--dim)]">Select a range to see windows.</div>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {CRITERIA.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-1 text-[11px] text-[var(--muted)]">
            <input
              type="radio"
              name="window-criterion"
              checked={criterion === c.id}
              onChange={() => setCriterion(c.id)}
            />
            {c.label}
          </label>
        ))}
        {criterion === "power" && (
          <label className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
            W ≥
            <input
              type="number"
              min={0}
              value={powerThreshold}
              onChange={(e) => setPowerThreshold(Number(e.target.value) || 0)}
              className="w-16 rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-0.5 text-[12px]"
            />
          </label>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--dim)]">
          {siteName} · {windows.length} window{windows.length === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
          <input type="checkbox" checked={chrono} onChange={(e) => setChrono(e.target.checked)} />
          Chronological
        </label>
      </div>

      {windows.length === 0 ? (
        <div className="rounded border border-[var(--border-soft)] bg-[var(--panel-2)] p-3 text-[12px] text-[var(--dim)]">
          No windows matching this criterion in the selected range — try widening the analysis window in the Location panel.
        </div>
      ) : (
        <div className="thin-scroll flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {windows.map((w, i) => {
            const edge = touchesRangeEdge(w, series)
            return (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-1 rounded border border-[var(--border-soft)] bg-[var(--panel-2)] px-2 py-1"
              >
                <div className="mono text-[11px] text-[var(--foreground)]">
                  <span className="text-[var(--ok)]">{fmtShort(w.startIso)}</span>
                  {" → "}
                  <span className="text-[var(--warn)]">{fmtShort(w.stopIso)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono text-[11px] text-[var(--muted)]">{formatWindowDuration(w.durationHours)}</span>
                  {edge && (
                    <span className="text-[9px] text-[var(--dim)]">(continues beyond current range)</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onJumpTo(w.startT)}
                    className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[#1a2030]"
                  >
                    Go to start →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtShort(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ")
}