"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLunaStore } from "@/lib/sci/useStore"
import { analyzeSeries } from "@/lib/sci/analyze"
import { utcToEt } from "@/lib/sci/ephemeris"
import { latLonToSpstereo } from "@/lib/sci/coordinates"
import SouthPoleMap from "@/components/SouthPoleMap"
import SitePanel from "@/components/SitePanel"
import HorizonView from "@/components/HorizonView"
import ControlPanel from "@/components/ControlPanel"
import Timeline from "@/components/Timeline"
import Comparison from "@/components/Comparison"
import { SITE_ROSTER } from "@/lib/sci/data"

// elevation probe grid loaded from the preprocessed NPY asset
let probeGrid: Float32Array | null = null
const GRID = 1024
const RWX_HALF = 304000

async function loadProbeGrid(): Promise<void> {
  if (probeGrid) return
  try {
    const res = await fetch("/data/terrain/south_pole_elev_map.npy")
    if (!res.ok) return
    const buf = await res.arrayBuffer()
    const head = new TextDecoder().decode(buf.slice(0, 6))
    if (head !== "\x93NUMPY") return
    const headLen = new DataView(buf, 8, 2).getUint16(0, true)
    const dataStart = 10 + headLen
    probeGrid = new Float32Array(buf, dataStart, GRID * GRID)
  } catch {
    probeGrid = new Float32Array(0)
  }
}

export default function AppPage() {
  const store = useLunaStore()
  const [compareMode, setCompareMode] = useState(false)
  const [showPro, setShowPro] = useState(false)

  useEffect(() => {
    void loadProbeGrid()
  }, [])

  useEffect(() => {
    if (store.ready && !store.primary) {
      void store.selectSite("malapert-massif")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.primary])

  const elevationAt = useCallback((lat: number, lon: number): number | null => {
    if (!probeGrid || probeGrid.length === 0) return null
    const [xm, ym] = latLonToSpstereo(lat, lon)
    if (Math.abs(xm) > RWX_HALF || Math.abs(ym) > RWX_HALF) return null
    const px = Math.round(((xm / RWX_HALF + 1) / 2) * (GRID - 1))
    const py = Math.round(((ym / RWX_HALF + 1) / 2) * (GRID - 1))
    const v = probeGrid[py * GRID + px]
    return Number.isFinite(v) && v > -9000 ? v : null
  }, [])

  const handleCustomPoint = useCallback(
    (lat: number, lon: number) => {
      const elev = elevationAt(lat, lon)
      // custom points: geometric-only horizon (all zeros) — honest default
      store.setCustomPoint(lat, lon, elev ?? 0, new Array(360).fill(0))
    },
    [elevationAt, store],
  )

  const handleSelectSite = useCallback(
    (siteId: string) => {
      void store.selectSite(siteId)
    },
    [store],
  )

  const handleSelectCompare = useCallback(
    (siteId: string) => {
      void store.addCompareSite(siteId)
    },
    [store],
  )

  const series = useMemo(() => {
    if (!store.table || !store.primary) return []
    const startEt = utcToEt(store.range.startIso, store.table.startT, store.table.startIsoUtc)
    const stopEt = utcToEt(store.range.stopIso, store.table.startT, store.table.startIsoUtc)
    const step = store.range.stepMin * 60
    const count = Math.max(2, Math.min(2400, Math.round((stopEt - startEt) / step) + 1))
    return analyzeSeries(
      store.table.rows,
      startEt,
      step,
      count,
      store.primary,
      store.table.startT,
      store.table.startIsoUtc,
      store.panel,
    )
  }, [store.table, store.primary, store.range, store.panel])

  const seriesB = useMemo(() => {
    if (!store.table || !store.compare) return []
    const startEt = utcToEt(store.range.startIso, store.table.startT, store.table.startIsoUtc)
    const stopEt = utcToEt(store.range.stopIso, store.table.startT, store.table.startIsoUtc)
    const step = store.range.stepMin * 60
    const count = Math.max(2, Math.min(2400, Math.round((stopEt - startEt) / step) + 1))
    return analyzeSeries(
      store.table.rows,
      startEt,
      step,
      count,
      store.compare,
      store.table.startT,
      store.table.startIsoUtc,
      store.panel,
    )
  }, [store.table, store.compare, store.range, store.panel])

  const selectedT = useMemo(() => {
    if (!store.table) return 0
    return utcToEt(store.utcIso, store.table.startT, store.table.startIsoUtc)
  }, [store.table, store.utcIso])

  const handleSelectT = useCallback(
    (t: number) => {
      if (!store.table) return
      const tClamp = Math.max(store.table.startT, Math.min(store.table.stopT, t))
      const ms = (tClamp - store.table.startT) * 1000 + new Date(store.table.startIsoUtc).getTime()
      store.setUtcIso(new Date(ms).toISOString())
    },
    [store],
  )

  const handleStep = useCallback(
    (dir: number) => {
      const delta = dir * 30 * 60
      handleSelectT(selectedT + delta)
    },
    [selectedT, handleSelectT],
  )

  const canStepBack = !!store.table && selectedT > store.table.startT
  const canStepFwd = !!store.table && selectedT < store.table.stopT

  if (!store.ready) {
    return <LoadingScreen />
  }
  if (store.error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="luna-panel max-w-md p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">LunaSight</h1>
          <p className="text-[var(--bad)]">Error loading scientific assets: {store.error}</p>
        </div>
      </div>
    )
  }

  const currentSiteId = store.primary?.kind === "site" ? store.primary.id : null

  return (
    <div className="flex min-h-screen flex-col">
      <Header onTogglePro={() => setShowPro((v) => !v)} />
      <main className="mx-auto grid w-full max-w-[1700px] flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[290px_1fr]">
        <aside className="flex flex-col gap-3">
          <ControlPanel
            currentSiteId={currentSiteId}
            onSelectSite={handleSelectSite}
            utcIso={store.utcIso}
            onUtcChange={store.setUtcIso}
            panel={store.panel}
            onPanelChange={store.setPanel}
            range={store.range}
            onRangeChange={store.setRange}
            canStepBack={canStepBack}
            canStepFwd={canStepFwd}
            onStep={handleStep}
          />
          <div className="luna-panel p-3">
            <label className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
              <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
              Comparison mode
            </label>
            {compareMode && (
              <div className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {SITE_ROSTER.filter((s) => s.id !== currentSiteId).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectCompare(s.id)}
                    className={`rounded px-2 py-1 text-left text-[11px] ${
                      store.compare?.id === s.id
                        ? "bg-[#20304f] text-white"
                        : "text-[var(--muted)] hover:bg-[#1a2030] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span className="mono text-[10px] text-[var(--dim)]">{s.lat.toFixed(2)}° {s.lon.toFixed(1)}°E</span> {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showPro && <ProPanel store={store} />}
        </aside>

        <section className="flex flex-col gap-3">
          <div className="grid flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col">
              <div className="mb-1 flex items-center justify-between">
                <span className="term">South Polar Map — LOLA terrain (IAU 30135)</span>
                <span className="term">80 m baseline · 1024² probe</span>
              </div>
              <div className="min-h-[520px] flex-1">
                <SouthPoleMap
                  primary={store.primary}
                  compare={compareMode && store.compare ? store.compare : null}
                  onSelectSite={handleSelectSite}
                  onAddCompare={handleSelectCompare}
                  onCustomPoint={handleCustomPoint}
                  elevationAt={elevationAt}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="luna-panel p-3">
                <HorizonView pt={store.primary} snap={store.primarySnapshot} />
              </div>
              <SitePanel pt={store.primary} snap={store.primarySnapshot} title="Primary" />
            </div>
          </div>

          <div className="luna-panel p-3">
            <Timeline series={series} t={selectedT} onSelectT={handleSelectT} label="Primary" />
          </div>

          {compareMode && (
            <Comparison
              a={store.primary}
              aSnap={store.primarySnapshot}
              b={store.compare}
              bSnap={store.compareSnapshot}
              seriesA={series}
              seriesB={seriesB}
              t={selectedT}
              onSelectT={handleSelectT}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-[var(--border-soft)] px-4 py-3 text-[11px] text-[var(--dim)]">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-2">
          <span>
            © 2026 LunaSight · NASA Space Apps Challenge · LRO/LOLA + JPL NAIF SPICE geometry (DE421 / MOON_ME)
          </span>
          <Link href="/methods" className="text-[var(--accent)] hover:underline">
            Data Sources &amp; Methods
          </Link>
        </div>
      </footer>
    </div>
  )
}

function ProPanel({ store }: { store: ReturnType<typeof useLunaStore> }) {
  const t = store.table
  if (!t) return null
  return (
    <div className="luna-panel p-3">
      <div className="term mb-2">Reference frame &amp; source panel</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-[var(--muted)]">Frame</span>
        <span className="mono text-right">MOON_ME</span>
        <span className="text-[var(--muted)]">Ephemeris</span>
        <span className="mono text-right">DE421</span>
        <span className="text-[var(--muted)]">Terrain</span>
        <span className="mono text-right">LOLA South Pole</span>
        <span className="text-[var(--muted)]">Orient.</span>
        <span className="mono text-right">naif0012.tls</span>
        <span className="text-[var(--muted)]">Table</span>
        <span className="mono text-right">{t.stepSec / 60} min / {toShort((t.stopT - t.startT) / 86400)} d</span>
        <span className="text-[var(--muted)]">Generated</span>
        <span className="mono text-right text-[10px]">{t.generated.slice(0, 10)}</span>
      </div>
    </div>
  )
}

function toShort(days: number): string {
  return Number.isFinite(days) ? days.toFixed(0) : "—"
}

function Header({ onTogglePro }: { onTogglePro: () => void }) {
  return (
    <header className="border-b border-[var(--border-soft)] bg-[var(--background-soft)]">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent)] text-[var(--accent)]">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="7" cy="7" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">
              LunaSight <span className="text-[var(--muted)]">· CLPS Lunar Mission Browser</span>
            </h1>
            <div className="term">NASA Space Apps Challenge 2026</div>
          </div>
        </div>
        <nav className="flex items-center gap-3">
          <button type="button" onClick={onTogglePro} className="term cursor-pointer text-[var(--muted)] hover:text-[var(--accent)]">
            Professional
          </button>
          <Link href="/methods" className="term text-[var(--muted)] hover:text-[var(--accent)]">
            Data &amp; Methods
          </Link>
        </nav>
      </div>
    </header>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-2 text-[15px] font-semibold">LunaSight</div>
        <div className="text-[var(--dim)]">Loading scientific assets…</div>
      </div>
    </div>
  )
}