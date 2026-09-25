"use client"

// Control Panel: location list, date/time, analysis duration, step,
// panel model, and range parameters.

import { SITE_ROSTER } from "@/lib/sci/data"
import type { SolarPanelConfig } from "@/lib/sci/analysis"

interface ControlProps {
  currentSiteId: string | null
  onSelectSite: (id: string) => void
  utcIso: string
  onUtcChange: (iso: string) => void
  panel: SolarPanelConfig
  onPanelChange: (p: SolarPanelConfig) => void
  range: { startIso: string; stopIso: string; stepMin: number }
  onRangeChange: (r: { startIso: string; stopIso: string; stepMin: number }) => void
  canStepBack: boolean
  canStepFwd: boolean
  onStep: (dir: number) => void
}

const SITE_GROUPS: Record<string, string> = {
  pgda: "NASA PGDA / LOLA sites",
  clps: "CLPS / landed missions",
  reference: "Reference points",
}

export default function ControlPanel({
  currentSiteId,
  onSelectSite,
  utcIso,
  onUtcChange,
  panel,
  onPanelChange,
  range,
  onRangeChange,
  canStepBack,
  canStepFwd,
  onStep,
}: ControlProps) {
  const groups: Record<string, typeof SITE_ROSTER> = {}
  for (const s of SITE_ROSTER) {
    ;(groups[s.cls] ??= []).push(s)
  }

  return (
    <div className="luna-panel flex flex-col gap-3 p-3">
      <div>
        <div className="term mb-1">Location</div>
        {Object.entries(groups).map(([cls, list]) => (
          <div key={cls} className="mb-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--dim)]">{SITE_GROUPS[cls] ?? cls}</div>
            <div className="flex flex-col gap-0.5">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSite(s.id)}
                  className={`rounded px-2 py-1 text-left text-[12px] ${
                    currentSiteId === s.id
                      ? "bg-[#20304f] text-white"
                      : "text-[var(--muted)] hover:bg-[#1a2030] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span className="mono text-[10px] text-[var(--dim)]">
                    {s.lat.toFixed(2)}° {s.lon.toFixed(1)}°E
                  </span>{" "}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-1 text-[10px] text-[var(--dim)]">
          Or click directly on the map for a user-defined analysis point.
        </p>
      </div>

      <div className="rule" />

      <div>
        <div className="term mb-1">Time (UTC)</div>
        <input
          type="datetime-local"
          value={toLocalInput(utcIso)}
          onChange={(e) => {
            if (e.target.value) onUtcChange(new Date(e.target.value).toISOString())
          }}
          className="w-full rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-[12px]"
          aria-label="Analysis time in UTC"
        />
        <div className="mt-1 flex gap-1">
          <button type="button" onClick={() => onStep(-1)} disabled={!canStepBack} className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] disabled:opacity-40">
            −30 min
          </button>
          <button type="button" onClick={() => onStep(1)} disabled={!canStepFwd} className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] disabled:opacity-40">
            +30 min
          </button>
        </div>
      </div>

      <div className="rule" />

      <div>
        <div className="term mb-1">Analysis window</div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--muted)]">
            From
            <input
              type="datetime-local"
              value={toLocalInput(range.startIso)}
              onChange={(e) => e.target.value && onRangeChange({ ...range, startIso: new Date(e.target.value).toISOString() })}
              className="ml-2 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-[12px]"
            />
          </label>
          <label className="text-[11px] text-[var(--muted)]">
            To
            <input
              type="datetime-local"
              value={toLocalInput(range.stopIso)}
              onChange={(e) => e.target.value && onRangeChange({ ...range, stopIso: new Date(e.target.value).toISOString() })}
              className="ml-2 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-[12px]"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            Step
            <select
              value={range.stepMin}
              onChange={(e) => onRangeChange({ ...range, stepMin: Number(e.target.value) })}
              className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-0.5 text-[12px]"
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
              <option value={180}>3 h</option>
              <option value={360}>6 h</option>
              <option value={720}>12 h</option>
              <option value={1440}>1 d</option>
            </select>
          </label>
        </div>
        <p className="mt-1 text-[10px] text-[var(--dim)]">
          30-min ephemeris interpolation resolution; finer steps interpolate.
        </p>
      </div>

      <div className="rule" />

      <div>
        <div className="term mb-1">Solar array model (estimate)</div>
        <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          Orientation
          <select
            value={panel.orientation}
            onChange={(e) => onPanelChange({ ...panel, orientation: e.target.value as SolarPanelConfig["orientation"] })}
            className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-0.5 text-[12px]"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical (south-facing)</option>
            <option value="tracking">Ideal Sun-tracking</option>
            <option value="azimuthElevation">Custom (az/el)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          Area
          <input
            type="number"
            min={0.01}
            step={0.05}
            value={panel.areaM2}
            onChange={(e) => onPanelChange({ ...panel, areaM2: Number(e.target.value) })}
            className="w-20 rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-0.5 text-[12px]"
          />{" "}
          m²
        </label>
        <p className="mt-1 text-[10px] text-[var(--dim)]">
          Efficiency 29%, losses 15% fixed in this build (editable later).
        </p>
      </div>
    </div>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}