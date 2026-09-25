"use client"

// South-pole polar-stereographic map with pan/zoom and click-to-analyze.
// Background: LOLA-derived elevation render (1024x1024, covers ±304 km,
// rho in [0, 608000] m).  Sites are plotted from catalogued lat/lon via
// the IAU 30135 projection.  Click empty area for a custom point;
// click a marker to select a site; shift-click to add to comparison.

import { useCallback, useMemo, useRef, useState } from "react"
import { latLonToSpstereo, spstereoToLatLon } from "@/lib/sci/coordinates"
import { SITE_ROSTER } from "@/lib/sci/data"
import type { AnalysisPoint } from "@/lib/sci/types"

const IMG_SIZE = 1024
const RWX_HALF = 304_000 // meters half-extent of DEM coverage

interface Pt {
  x: number
  y: number
}

function toPx(xm: number, ym: number): Pt {
  return {
    x: ((xm / RWX_HALF + 1) * IMG_SIZE) / 2,
    y: ((ym / RWX_HALF + 1) * IMG_SIZE) / 2,
  }
}

function fromPx(x: number, y: number): [number, number] {
  const xm = (x / (IMG_SIZE / 2) - 1) * RWX_HALF
  const ym = (y / (IMG_SIZE / 2) - 1) * RWX_HALF
  return spstereoToLatLon(xm, ym)
}

interface SouthPoleMapProps {
  primary: AnalysisPoint | null
  compare: AnalysisPoint | null
  onSelectSite: (id: string) => void
  onAddCompare: (id: string) => void
  onCustomPoint: (lat: number, lon: number) => void
  elevationAt: (lat: number, lon: number) => number | null
}

export default function SouthPoleMap({
  primary,
  compare,
  onSelectSite,
  onAddCompare,
  onCustomPoint,
  elevationAt,
}: SouthPoleMapProps) {
  const [viewX, setViewX] = useState(0)
  const [viewY, setViewY] = useState(0)
  const [viewK, setViewK] = useState(1)
  const [hoverLatLon, setHoverLatLon] = useState<[number, number] | null>(null)
  const drag = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null)

  const toScreen = useCallback(
    (x: number, y: number): Pt => ({ x: x * viewK + viewX, y: y * viewK + viewY }),
    [viewK, viewX, viewY],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      drag.current = { startX: e.clientX, startY: e.clientY, vx: viewX, vy: viewY }
    },
    [viewX, viewY],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (drag.current) {
        const dx = e.clientX - drag.current.startX
        const dy = e.clientY - drag.current.startY
        setViewX(drag.current.vx + dx)
        setViewY(drag.current.vy + dy)
      }
    },
    [],
  )

  const endDrag = useCallback(() => {
    drag.current = null
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.88 : 1 / 0.88
      const kNew = Math.min(8, Math.max(1, viewK * factor))
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setViewX(cx - (cx - viewX) * (kNew / viewK))
      setViewY(cy - (cy - viewY) * (kNew / viewK))
      setViewK(kNew)
    },
    [viewK, viewX, viewY],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) return // was a drag
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
      const px = (e.clientX - rect.left - viewX) / viewK
      const py = (e.clientY - rect.top - viewY) / viewK
      if (px < 0 || px > IMG_SIZE || py < 0 || py > IMG_SIZE) return
      const [lat, lon] = fromPx(px, py)
      onCustomPoint(lat, lon)
    },
    [onCustomPoint, viewX, viewY, viewK],
  )

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
      const px = (e.clientX - rect.left - viewX) / viewK
      const py = (e.clientY - rect.top - viewY) / viewK
      if (px >= 0 && px <= IMG_SIZE && py >= 0 && py <= IMG_SIZE) {
        setHoverLatLon(fromPx(px, py))
      } else {
        setHoverLatLon(null)
      }
    },
    [viewX, viewY, viewK],
  )

  const markers = useMemo(() => {
    return SITE_ROSTER.map((s) => {
      const [xm, ym] = latLonToSpstereo(s.lat, s.lon)
      const p = toPx(xm, ym)
      const sc = toScreen(p.x, p.y)
      return {
        ...s,
        sc,
        active: primary?.id === s.id,
        inCompare: compare?.id === s.id,
        elev: elevationAt ? elevationAt(s.lat, s.lon) : null,
      }
    })
  }, [toScreen, primary?.id, compare?.id, elevationAt])

  const sitePoint = useCallback((p: AnalysisPoint | null): Pt | null => {
    if (!p) return null
    const [xm, ym] = latLonToSpstereo(p.lat, p.lon)
    const pp = toPx(xm, ym)
    return toScreen(pp.x, pp.y)
  }, [toScreen])

  const primaryPt = sitePoint(primary)
  const comparePt = sitePoint(compare)

  const statusLine =
    'South polar stereographic (IAU 30135) · 0°E down (Earth) · +90°E right'

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--border-soft)] bg-black/40">
      <svg
        className="map-canvas h-full w-full"
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          handlePointerMove(e)
          handleMove(e as unknown as React.MouseEvent<SVGSVGElement>)
        }}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag()
          setHoverLatLon(null)
        }}
        onWheel={handleWheel}
        onClick={handleClick}
        role="img"
        aria-label="Lunar south pole polar map. Click to analyze a point, drag to pan, scroll to zoom."
      >
        <image
          href="/data/terrain/south_pole_elevation.png"
          x={viewX}
          y={viewY}
          width={IMG_SIZE * viewK}
          height={IMG_SIZE * viewK}
          preserveAspectRatio="none"
        />
        <g>
          {markers.map((m) => (
            <g
              key={m.id}
              transform={`translate(${m.sc.x},${m.sc.y})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                if (e.shiftKey) onAddCompare(m.id)
                else onSelectSite(m.id)
              }}
            >
              <circle
                r={m.active ? 8 : m.inCompare ? 6 : 5}
                fill="none"
                stroke={m.active ? "#ffcf5c" : m.inCompare ? "#6fa8ff" : "#e6ecf5"}
                strokeWidth={1.5}
              />
              <circle r={2} fill={m.active ? "#ffcf5c" : m.inCompare ? "#6fa8ff" : "#98a6c0"} />
              <title>{m.name}</title>
            </g>
          ))}
        </g>
        {primaryPt && (
          <circle cx={primaryPt.x} cy={primaryPt.y} r={10} fill="none" stroke="#ffcf5c" strokeWidth={2} className="pointer-events-none" />
        )}
        {comparePt && (
          <circle cx={comparePt.x} cy={comparePt.y} r={8} fill="none" stroke="#6fa8ff" strokeWidth={2} strokeDasharray="4 3" className="pointer-events-none" />
        )}
        {hoverLatLon && (
          <g className="pointer-events-none">
            <rect x={8} y={8} width={130} height={18} rx={4} fill="rgba(11,14,20,0.75)" />
            <text x={14} y={20} fill="#dbe3ef" fontSize={11} className="mono">
              {hoverLatLon[0].toFixed(3)}° {hoverLatLon[1].toFixed(3)}°E
            </text>
          </g>
        )}
        <g className="pointer-events-none">
          <text x={12} y={IMG_SIZE * viewK - 10} fill="#8b95a8" fontSize={11}>
            {statusLine}
          </text>
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 rounded bg-[rgba(11,14,20,0.6)] px-2 py-1">
        <span className="term">Click map → custom analysis point</span>
        <span className="term">Shift-click marker → compare</span>
      </div>
    </div>
  )
}