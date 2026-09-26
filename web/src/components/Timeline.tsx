"use client"

// Time Explorer: synchronized timeline for Sun elevation, Earth elevation,
// sunlight band and DTE-geometric band.  Click to move the analysis time.

import { useMemo } from "react"
import { findWindows } from "@/lib/sci/windows"

export interface TimelineSeries {
  t: number
  utcIso: string
  sunEl: number
  sunAz: number
  earthEl: number
  earthAz: number
  sunVis: string
  earthVis: string
  lit: boolean
  powerW: number
  sunHorizon: number | null
  earthHorizon: number | null
}

interface TimelineProps {
  series: TimelineSeries[]
  t: number
  onSelectT: (t: number) => void
  label?: string
}

const W = 640
const H = 320
const PAD = { l: 40, r: 12, t: 16, b: 20 }

function fmtT(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().slice(0, 16).replace("T", " ")
}

interface Band {
  x0: number
  x1: number
}

/** Run-length-encode contiguous `true` stretches of `pred` into pixel
 *  bands using the shared findWindows helper, then mapping each window
 *  through the pixel function x().
 */
function buildBands(series: TimelineSeries[], x: (t: number) => number, pred: (s: TimelineSeries) => boolean): Band[] {
  return findWindows(series, pred).map((w) => ({ x0: x(w.startT), x1: x(w.stopT) }))
}

export default function Timeline({ series, t, onSelectT, label = "Analysis" }: TimelineProps) {
  const chart = useMemo(() => {
    if (!series.length) return null
    const iw = W - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const t0 = series[0].t
    const t1 = series[series.length - 1].t
    const span = t1 - t0 || 1
    const x = (tt: number) => PAD.l + ((tt - t0) / span) * iw
    const yFor = (el: number) => PAD.t + ih / 2 - (el / 30) * (ih / 2)
    const yClamp = (el: number) => Math.max(PAD.t, Math.min(PAD.t + ih, yFor(el)))

    const sunPath = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.t).toFixed(1)},${yClamp(s.sunEl).toFixed(1)}`).join("")
    const earthPath = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.t).toFixed(1)},${yClamp(s.earthEl).toFixed(1)}`).join("")

    // Terrain horizon band (mean of available sun horizon values) at 5..9 deg
    const litBands = buildBands(series, x, (s) => s.lit)
    const dteBands = buildBands(series, x, (s) => s.earthEl > 0)

    const xTicks: Array<{ x: number; lab: string }> = []
    const nT = 6
    for (let i = 0; i <= nT; i++) {
      const tt = t0 + (span * i) / nT
      xTicks.push({ x: x(tt), lab: fmtT(series[Math.round(i * (series.length - 1) / nT)].utcIso).slice(5) })
    }

    return { iw, ih, x, yClamp, sunPath, earthPath, litBands, dteBands, xTicks, t0, t1 }
  }, [series])

  if (!chart) return <div className="p-4 text-[var(--dim)]">No timeline data.</div>

  const selX = chart.x(t)
  const selIdx = series.findIndex((s) => s.t >= t)
  const idx = selIdx >= 0 ? selIdx : series.length - 1
  const sel = series[idx]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="term">{label} — Time Explorer</span>
        <span className="mono text-[11px] text-[var(--muted)]">{fmtT(sel.utcIso)} UTC</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Timeline chart of Sun and Earth elevation over the analysis window, with sunlight and direct-to-Earth bands. Click to select a time."
      >
        {/* DTE band background + filled */}
        <rect x={PAD.l} y={chart.yClamp(-22)} width={chart.iw} height={chart.yClamp(-8) - chart.yClamp(-22)} fill="rgba(111,168,255,0.05)" />
        {chart.dteBands.map((b, i) => (
          <rect key={i} x={b.x0} y={chart.yClamp(-22)} width={Math.max(0, b.x1 - b.x0)} height={chart.yClamp(-8) - chart.yClamp(-22)} fill="rgba(111,168,255,0.30)" rx={1} />
        ))}
        <text x={PAD.l + 2} y={chart.yClamp(-20)} fill="#6fa8ff" fontSize={9}>DTE (geo)</text>

        {/* sunlight band */}
        {chart.litBands.map((b, i) => (
          <rect key={i} x={b.x0} y={chart.yClamp(10)} width={Math.max(0, b.x1 - b.x0)} height={6} fill="rgba(255,207,92,0.5)" rx={1} />
        ))}
        <text x={PAD.l + 2} y={chart.yClamp(8)} fill="#ffcf5c" fontSize={9}>Sunlight</text>

        {/* gridlines */}
        {[-30, -15, 0, 15, 30].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={chart.yClamp(v)} y2={chart.yClamp(v)} stroke={v === 0 ? "#2a3450" : "#1d2537"} strokeWidth={v === 0 ? 1 : 0.6} />
            <text x={PAD.l - 4} y={chart.yClamp(v) + 3} fill="#5c6578" fontSize={9} textAnchor="end">{v}°</text>
          </g>
        ))}

        <path d={chart.sunPath} fill="none" stroke="#ffcf5c" strokeWidth={1.6} />
        <path d={chart.earthPath} fill="none" stroke="#6fa8ff" strokeWidth={1.6} />

        {/* selection marker */}
        <line x1={selX} x2={selX} y1={PAD.t} y2={PAD.t + chart.ih} stroke="#dbe3ef" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={selX} cy={chart.yClamp(sel.sunEl)} r={3.5} fill="#ffcf5c" stroke="#0b0e14" strokeWidth={1} />
        <circle cx={selX} cy={chart.yClamp(sel.earthEl)} r={3.5} fill="#6fa8ff" stroke="#0b0e14" strokeWidth={1} />

        {chart.xTicks.map((tk, i) => (
          <text key={i} x={tk.x} y={H - 5} fill="#5c6578" fontSize={9} textAnchor="middle">{tk.lab}</text>
        ))}

        <rect
          x={PAD.l}
          y={PAD.t}
          width={chart.iw}
          height={chart.ih}
          fill="transparent"
          onClick={(e) => {
            const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
            const rel = (e.clientX - rect.left) / rect.width
            const tt = chart.t0 + rel * (chart.t1 - chart.t0)
            onSelectT(tt)
          }}
          style={{ cursor: "pointer" }}
        />

        <g className="pointer-events-none">
          <line x1={10} x2={26} y1={H - 28} y2={H - 28} stroke="#ffcf5c" strokeWidth={1.6} />
          <text x={30} y={H - 24} fill="#dbe3ef" fontSize={9}>Sun elevation</text>
          <line x1={126} x2={142} y1={H - 28} y2={H - 28} stroke="#6fa8ff" strokeWidth={1.6} />
          <text x={146} y={H - 24} fill="#dbe3ef" fontSize={9}>Earth elevation</text>
          <rect x={250} y={H - 31} width={10} height={6} fill="rgba(111,168,255,0.30)" />
          <text x={264} y={H - 24} fill="#dbe3ef" fontSize={9}>DTE geometric window</text>
        </g>
      </svg>
      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>Click chart to move analysis time.</span>
        <span className="mono">{fmtT(series[0].utcIso)} → {fmtT(series[series.length - 1].utcIso)}</span>
      </div>
    </div>
  )
}