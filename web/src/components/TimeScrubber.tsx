"use client"

// A prominent, always-visible "scrub through time" control, separate from
// the precise datetime-local entry in ControlPanel. Dragging the slider —
// or pressing Play — sweeps store.utcIso across the current analysis
// window, so every reactive piece of the UI (map/globe markers, Quick
// Glance, HorizonView, SitePanel, Timeline's playhead) updates live. This
// doesn't add a new time source: it drives the exact same store.setUtcIso
// the manual date field and the ±30 min buttons already use.

import { useEffect, useRef, useState } from "react"

interface TimeScrubberProps {
  range: { startIso: string; stopIso: string; stepMin: number }
  utcIso: string
  onChange: (iso: string) => void
}

// Fixed scrub granularity, independent of the "Analysis window" step
// (which governs chart/table sampling density, a separate concern) — fine
// enough to feel smooth, coarse enough to stay meaningful at lunar scale.
const SCRUB_STEP_MS = 15 * 60 * 1000

// A full hands-off sweep from start to stop takes roughly this many
// on-screen seconds, regardless of how long the analysis window spans.
const PLAY_SWEEP_SECONDS = 25
const PLAY_TICK_MS = 120

export default function TimeScrubber({ range, utcIso, onChange }: TimeScrubberProps) {
  const startMs = new Date(range.startIso).getTime()
  const stopMs = new Date(range.stopIso).getTime()
  const nowMs = new Date(utcIso).getTime()
  const valid = Number.isFinite(startMs) && Number.isFinite(stopMs) && stopMs > startMs

  const [playing, setPlaying] = useState(false)

  // "Latest ref" pattern: the play interval (set up once per play session)
  // reads the current time and fires onChange through these refs, so it
  // always advances from the true latest value without needing to tear
  // down and restart the interval on every tick.
  const onChangeRef = useRef(onChange)
  const latestIsoRef = useRef(utcIso)
  useEffect(() => {
    onChangeRef.current = onChange
    latestIsoRef.current = utcIso
  })

  useEffect(() => {
    if (!playing || !valid) return
    const ticksTotal = (PLAY_SWEEP_SECONDS * 1000) / PLAY_TICK_MS
    const tickMs = Math.max(SCRUB_STEP_MS, (stopMs - startMs) / ticksTotal)
    const intervalId = window.setInterval(() => {
      const current = new Date(latestIsoRef.current).getTime()
      const next = current + tickMs
      if (next >= stopMs) {
        onChangeRef.current(new Date(stopMs).toISOString())
        setPlaying(false)
      } else {
        onChangeRef.current(new Date(next).toISOString())
      }
    }, PLAY_TICK_MS)
    return () => window.clearInterval(intervalId)
  }, [playing, valid, startMs, stopMs])

  if (!valid) return null

  return (
    <div className="luna-panel flex flex-col gap-1 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            aria-label={playing ? "Pause" : "Play through the analysis window"}
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[11px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="term">Scrub time</span>
        </div>
        <span className="mono text-[12px] text-[var(--foreground)]">{fmtDateTime(utcIso)} UTC</span>
      </div>
      <input
        type="range"
        min={startMs}
        max={stopMs}
        step={SCRUB_STEP_MS}
        value={Math.min(stopMs, Math.max(startMs, nowMs))}
        onChange={(e) => {
          if (playing) setPlaying(false)
          onChange(new Date(Number(e.target.value)).toISOString())
        }}
        className="w-full accent-[var(--accent)]"
        aria-label="Scrub the current analysis time across the analysis window"
      />
      <div className="flex justify-between text-[10px] text-[var(--dim)]">
        <span>{fmtDateTime(range.startIso)}</span>
        <span>{fmtDateTime(range.stopIso)}</span>
      </div>
    </div>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ")
}
