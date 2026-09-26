// Pure window-detection for timeline series.
// TimeWindow is expressed in time (not pixels), so it can be reused by
// the Window Finder panel, the site-ranking table and site summaries.

import type { TimelineSeries } from "@/components/Timeline"

export interface TimeWindow {
  startT: number
  stopT: number
  startIso: string
  stopIso: string
  durationHours: number
}

/**
 * Finds contiguous windows in `series` where `pred(point)` is true.
 * series must be sorted ascending by `t`. Windows touching the start/end
 * of the series are included (they may be truncated by the series range,
 * not necessarily by the true start/end of the physical event — label
 * this in the UI).
 */
export function findWindows(
  series: TimelineSeries[],
  pred: (s: TimelineSeries) => boolean,
): TimeWindow[] {
  const windows: TimeWindow[] = []
  let startIdx: number | null = null
  for (let i = 0; i < series.length; i++) {
    const on = pred(series[i])
    if (on && startIdx === null) startIdx = i
    if (!on && startIdx !== null) {
      windows.push(toWindow(series, startIdx, i - 1))
      startIdx = null
    }
  }
  if (startIdx !== null) windows.push(toWindow(series, startIdx, series.length - 1))
  return windows
}

function toWindow(series: TimelineSeries[], i0: number, i1: number): TimeWindow {
  const a = series[i0]
  const b = series[i1]
  return {
    startT: a.t,
    stopT: b.t,
    startIso: a.utcIso,
    stopIso: b.utcIso,
    durationHours: (b.t - a.t) / 3600,
  }
}

/** Common named predicates, reused by both the Windows tab and the Rank tab. */
export const PREDICATES = {
  sunlit: (s: TimelineSeries) => s.lit,
  dteVisible: (s: TimelineSeries) => s.earthEl > 0 && s.earthVis !== "OBSTRUCTED",
  sunlitAndDte: (s: TimelineSeries) => s.lit && s.earthEl > 0 && s.earthVis !== "OBSTRUCTED",
  powerAbove: (thresholdW: number) => (s: TimelineSeries) => s.powerW >= thresholdW,
} as const

/** Does this window touch the start or end of the loaded series? */
export function touchesRangeEdge(w: TimeWindow, series: TimelineSeries[]): boolean {
  if (!series.length) return false
  return w.startT <= series[0].t || w.stopT >= series[series.length - 1].t
}

/** Format a duration: "Xd Yh" when > 24h, otherwise "Yh Zm". */
export function formatWindowDuration(hours: number): string {
  if (hours >= 24) {
    const d = Math.floor(hours / 24)
    const h = Math.round(hours % 24)
    return `${d}d ${h}h`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}