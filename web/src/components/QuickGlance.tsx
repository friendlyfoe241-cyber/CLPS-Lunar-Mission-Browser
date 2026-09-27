"use client"

import type { AnalysisPoint, SiteSnapshot } from "@/lib/sci/types"

interface QuickGlanceProps {
  pt: AnalysisPoint | null
  snap: SiteSnapshot | null
}

/** A large, plain-language "at a glance" readout of the same verified
 *  numbers already shown in full detail in SitePanel — nothing here is a
 *  new calculation, it's just the existing sunlit / DTE / power values
 *  surfaced at a size and vocabulary that doesn't require scrolling or
 *  decoding jargon first. Full detail stays one click away below. */
export default function QuickGlance({ pt, snap }: QuickGlanceProps) {
  if (!pt) {
    return (
      <div className="luna-panel p-4 text-center text-[13px] text-[var(--muted)]">
        Pick a landing site on the map, or from the list on the left, to see what&apos;s happening there right now.
      </div>
    )
  }
  if (!snap) {
    return <div className="luna-panel p-4 text-[var(--dim)]">Loading…</div>
  }

  const sunlit = snap.illumination.lit
  const canTalk = snap.dte.geometricVisible && snap.dte.terrainVisible !== false
  const powerW = snap.solar.powerW

  let headline: string
  if (sunlit && canTalk) headline = "Good conditions for both power and communication."
  else if (sunlit && !canTalk) headline = "Sunlit, but this site can't reach Earth right now."
  else if (!sunlit && canTalk) headline = "In darkness, but Earth is still in view for communication."
  else headline = "In darkness and unable to reach Earth right now."

  return (
    <div className="luna-panel p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-[15px] font-semibold text-[var(--foreground)]">{pt.name}</div>
        <div className="mono text-[11px] text-[var(--dim)]">{fmtClock(snap.utcIso)} UTC</div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <GlanceBadge
          emoji="☀️"
          label="Sunlit"
          value={sunlit ? "Yes" : "No"}
          tone={sunlit ? "ok" : "dim"}
        />
        <GlanceBadge
          emoji="📡"
          label="Talking to Earth"
          value={canTalk ? "Possible" : "Blocked"}
          tone={canTalk ? "ok" : "bad"}
        />
        <GlanceBadge
          emoji="⚡"
          label="Est. solar power"
          value={`${powerW.toFixed(0)} W/m²`}
          tone="neutral"
        />
      </div>

      <p className="mt-2 text-[12px] text-[var(--muted)]">{headline}</p>
    </div>
  )
}

function fmtClock(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ")
}

function GlanceBadge({
  emoji,
  label,
  value,
  tone,
}: {
  emoji: string
  label: string
  value: string
  tone: "ok" | "bad" | "dim" | "neutral"
}) {
  const color =
    tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : tone === "dim" ? "var(--dim)" : "var(--accent-2)"
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel-2)] px-2 py-2 text-center">
      <div className="text-[16px] leading-none">{emoji}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--dim)]">{label}</div>
      <div className="mono text-[13px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
