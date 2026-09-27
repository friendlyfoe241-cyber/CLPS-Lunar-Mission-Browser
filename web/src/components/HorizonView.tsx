"use client"

// Local horizon / sky view.
// Renders: azimuth (0 = N at top, clockwise), elevation rings,
// the ideal geometric horizon (0 deg), the terrain horizon profile,
// and Sun / Earth markers from the current analysis.

import { useMemo } from "react"
import type { AnalysisPoint, SiteSnapshot } from "@/lib/sci/types"

interface HorizonViewProps {
  pt: AnalysisPoint | null
  snap: SiteSnapshot | null
}

/** top-down polar mapping: north at top, azimuth clockwise;
 *  radius decreases with elevation (outer ring = 0 deg horizon). */
function polar(azDeg: number, elDeg: number, size: number): [number, number] {
  const r = ((90 - elDeg) / 90) * (size / 2 - 6)
  const a = ((azDeg - 90) * Math.PI) / 180
  const x = size / 2 + r * Math.cos(a)
  const y = size / 2 + r * Math.sin(a)
  return [x, y]
}

export default function HorizonView({ pt, snap }: HorizonViewProps) {
  const size = 300
  const horizon = pt?.horizon ?? null

  const horizonPath = useMemo(() => {
    if (horizon && horizon.length > 0) {
      let d = ""
      for (let i = 0; i < horizon.length; i++) {
        const el = horizon[i] ?? 0
        const [x, y] = polar(i, Math.max(-45, Math.min(85, el)), size)
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1)
      }
      return d + " Z"
    }
    return null
  }, [horizon, size])

  const ringLabels = useMemo(() => {
    const out: Array<{ az: number; x: number; y: number }> = []
    for (let az = 0; az < 360; az += 45) {
      const [x, y] = polar(az, 0, size)
      out.push({ az, x, y })
    }
    return out
  }, [size])

  const sunPt = snap ? polar(snap.sun.azimuthDeg, Math.max(0, snap.sun.elevationDeg), size) : null
  const earthPt = snap ? polar(snap.earth.azimuthDeg, Math.max(0, snap.earth.elevationDeg), size) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="term">Local horizon / sky view</div>
      <div className="relative mx-auto w-full" style={{ maxWidth: size, aspectRatio: "1 / 1" }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full"
          role="img"
          aria-label="Top-down sky view: center is zenith, outer ring is horizon; rings mark elevation; terrain horizon shaded; Sun yellow and Earth blue markers."
        >
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#0d1120" stroke="#263048" />
          {[15, 30, 45, 60, 75].map((el) => {
            const r = ((90 - el) / 90) * (size / 2 - 6)
            return <circle key={el} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d2537" strokeWidth={1} />
          })}
          {ringLabels.map(({ az, x, y }) => (
            <g key={az}>
              <line x1={size / 2} y1={size / 2} x2={x} y2={y} stroke="#1d2537" strokeDasharray="2 4" />
              <text
                x={size / 2 + (x - size / 2) * 1.14}
                y={size / 2 + (y - size / 2) * 1.14}
                fill="#5c6578"
                fontSize={10}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {az === 0 ? "N" : az === 90 ? "E" : az === 180 ? "S" : az === 270 ? "W" : `${az}°`}
              </text>
            </g>
          ))}
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 6} fill="none" stroke="#8b95a8" strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={size / 2} y={size / 2 - (size / 2 - 6) + 12} fill="#8b95a8" fontSize={9} textAnchor="middle">
            0° local horizon
          </text>
          {horizonPath && (
            <path d={horizonPath} fill="rgba(255,180,84,0.12)" stroke="#e3b341" strokeWidth={1.2} />
          )}
          <circle cx={size / 2} cy={size / 2} r={2} fill="#5c6578" />
          {sunPt && (
            <g>
              <circle cx={sunPt[0]} cy={sunPt[1]} r={10} fill="rgba(255,207,92,0.18)" />
              <circle cx={sunPt[0]} cy={sunPt[1]} r={5} fill="#ffcf5c" stroke="#0b0e14" strokeWidth={1} />
              <title>{`Sun az ${snap?.sun.azimuthDeg.toFixed(1)}° el ${snap?.sun.elevationDeg.toFixed(1)}°`}</title>
            </g>
          )}
          {earthPt && (
            <g>
              <circle cx={earthPt[0]} cy={earthPt[1]} r={8} fill="rgba(111,168,255,0.18)" />
              <circle cx={earthPt[0]} cy={earthPt[1]} r={4.5} fill="#6fa8ff" stroke="#0b0e14" strokeWidth={1} />
              <title>{`Earth az ${snap?.earth.azimuthDeg.toFixed(1)}° el ${snap?.earth.elevationDeg.toFixed(1)}°`}</title>
            </g>
          )}
          <g className="pointer-events-none">
            <circle cx={10} cy={size - 16} r={3} fill="#ffcf5c" />
            <text x={18} y={size - 12} fill="#dbe3ef" fontSize={9}>Sun</text>
            <circle cx={52} cy={size - 16} r={3} fill="#6fa8ff" />
            <text x={60} y={size - 12} fill="#dbe3ef" fontSize={9}>Earth</text>
            <rect x={104} y={size - 19} width={8} height={6} fill="rgba(255,180,84,0.3)" stroke="#e3b341" />
            <text x={116} y={size - 12} fill="#dbe3ef" fontSize={9}>Terrain horizon</text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
        <span>Radial distance from center = elevation; outer ring = 0° local horizon.</span>
        <span>Bodies below the horizon are shown pinned on the 0° ring.</span>
      </div>
    </div>
  )
}