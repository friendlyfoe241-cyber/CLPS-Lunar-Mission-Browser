"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useLunaStore } from "@/lib/sci/useStore"
import { analyzeSeries } from "@/lib/sci/analyze"
import { utcToEt } from "@/lib/sci/ephemeris"
import { latLonToSpstereo } from "@/lib/sci/coordinates"
import { computeRuntimeHorizon } from "@/lib/sci/runtimeHorizon"
import SouthPoleMap from "@/components/SouthPoleMap"
import SitePanel from "@/components/SitePanel"
import HorizonView from "@/components/HorizonView"
import ControlPanel from "@/components/ControlPanel"
import Timeline, { type TimelineSeries } from "@/components/Timeline"
import Comparison from "@/components/Comparison"
import WindowFinder from "@/components/WindowFinder"
import SiteRanking from "@/components/SiteRanking"
import QuickGlance from "@/components/QuickGlance"
import OnboardingBanner from "@/components/OnboardingBanner"
import { PREDICATES } from "@/lib/sci/windows"
import type { EphemerisTable } from "@/lib/sci/ephemeris"
import type { SolarPanelConfig } from "@/lib/sci/analysis"
import { SITE_ROSTER } from "@/lib/sci/data"

// three.js touches `window`, so the 3D globe must never run during SSR.
const MoonGlobe3D = dynamic(() => import("@/components/MoonGlobe3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[520px] items-center justify-center text-[var(--dim)]">
      Loading 3D view…
    </div>
  ),
})

const MAP_MODE_KEY = "lunasight_map_mode"

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
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d")

  useEffect(() => {
    void loadProbeGrid()
    // One-time restore of a saved UI preference from localStorage. Kept as a
    // post-mount effect (rather than a lazy useState initializer) so the very
    // first client render always matches the server-rendered "2d" markup —
    // avoiding a hydration mismatch — then swaps to the saved mode right after.
    try {
      const saved = window.localStorage.getItem(MAP_MODE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage, not a state sync loop
      if (saved === "2d" || saved === "3d") setMapMode(saved)
    } catch {
      // localStorage unavailable — fall back to the 2D default silently
    }
  }, [])

  const handleSetMapMode = useCallback((mode: "2d" | "3d") => {
    setMapMode(mode)
    try {
      window.localStorage.setItem(MAP_MODE_KEY, mode)
    } catch {
      // nothing to persist if storage isn't available; the toggle still works this session
    }
  }, [])

  const buildShareUrl = useCallback((): string => {
    const params = new URLSearchParams()
    if (store.primary?.kind === "site") params.set("site", store.primary.id)
    else if (store.primary?.kind === "custom") {
      params.set("custom", `${store.primary.lat.toFixed(4)},${store.primary.lon.toFixed(4)}`)
    }
    if (compareMode && store.compare?.kind === "site") params.set("compare", store.compare.id)
    params.set("t", store.utcIso)
    params.set("from", store.range.startIso)
    params.set("to", store.range.stopIso)
    params.set("step", String(store.range.stepMin))
    params.set("view", mapMode)
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`
  }, [store.primary, store.compare, compareMode, store.utcIso, store.range, mapMode])

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
      if (probeGrid && probeGrid.length > 0) {
        // Real terrain horizon, sampled at runtime from the loaded 80 m/px
        // regional grid — see lib/sci/runtimeHorizon.ts.
        const horizon = computeRuntimeHorizon(lat, lon, elev ?? 0, elevationAt)
        store.setCustomPoint(lat, lon, elev ?? 0, horizon, "computed")
      } else {
        // Grid genuinely unavailable (e.g. still loading) — fall back to an
        // honestly-labeled flat horizon rather than a silently wrong one.
        store.setCustomPoint(lat, lon, elev ?? 0, new Array(360).fill(null), "flat")
      }
    },
    [elevationAt, store],
  )

  useEffect(() => {
    if (store.ready && !store.primary) {
      // Restore a shared view from the URL if one was passed (see buildShareUrl
      // above for how these params are produced), otherwise fall back to the
      // usual default site. This only ever runs once, right after the
      // scientific assets finish loading.
      const params = new URLSearchParams(window.location.search)
      const siteParam = params.get("site")
      const customParam = params.get("custom")
      const compareParam = params.get("compare")
      const tParam = params.get("t")
      const fromParam = params.get("from")
      const toParam = params.get("to")
      const stepParam = params.get("step")
      const viewParam = params.get("view")

      if (fromParam && toParam) {
        const stepMin = stepParam ? Number(stepParam) : store.range.stepMin
        if (Number.isFinite(stepMin) && stepMin > 0) {
          store.setRange({ startIso: fromParam, stopIso: toParam, stepMin })
        }
      }
      if (tParam) store.setUtcIso(tParam)
      if (viewParam === "3d" || viewParam === "2d") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from a shared URL, not a state sync loop
        setMapMode(viewParam)
        try {
          window.localStorage.setItem(MAP_MODE_KEY, viewParam)
        } catch {
          // nothing to persist if storage isn't available
        }
      }

      if (customParam) {
        const [latS, lonS] = customParam.split(",")
        const lat = Number(latS)
        const lon = Number(lonS)
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          handleCustomPoint(lat, lon)
        } else {
          void store.selectSite("malapert-massif")
        }
      } else if (siteParam && SITE_ROSTER.some((s) => s.id === siteParam)) {
        void store.selectSite(siteParam)
      } else {
        void store.selectSite("malapert-massif")
      }

      if (compareParam && SITE_ROSTER.some((s) => s.id === compareParam)) {
        void store.addCompareSite(compareParam)
        setCompareMode(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready, store.primary, handleCustomPoint])

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

  const downloadSeriesCsv = useCallback(() => {
    const rows: string[] = [
      "site,utc_iso,sun_elevation_deg,sun_azimuth_deg,earth_elevation_deg,earth_azimuth_deg,sunlit,dte_visible,power_w",
    ]
    const appendSeries = (name: string, s: TimelineSeries[]) => {
      for (const p of s) {
        rows.push(
          [
            csvEscape(name),
            p.utcIso,
            p.sunEl.toFixed(3),
            p.sunAz.toFixed(3),
            p.earthEl.toFixed(3),
            p.earthAz.toFixed(3),
            p.lit ? "1" : "0",
            PREDICATES.dteVisible(p) ? "1" : "0",
            p.powerW.toFixed(2),
          ].join(","),
        )
      }
    }
    appendSeries(store.primary?.name ?? "primary", series)
    if (compareMode && store.compare) appendSeries(store.compare.name, seriesB)

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const siteSlug = (store.primary?.id ?? "site").replace(/[^a-z0-9-]+/gi, "_")
    const fromDate = store.range.startIso.slice(0, 10)
    const toDate = store.range.stopIso.slice(0, 10)
    a.href = url
    a.download = `lunasight_${siteSlug}_${fromDate}_${toDate}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [store.primary, store.compare, compareMode, series, seriesB, store.range])

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
      <Header onTogglePro={() => setShowPro((v) => !v)} onCopyLink={buildShareUrl} />
      <div className="mx-auto w-full max-w-[1700px] px-3 pt-3">
        <OnboardingBanner />
      </div>
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
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="term">
                  {mapMode === "2d" ? "South Polar Map — LOLA terrain (IAU 30135)" : "3D Globe — south-pole orientation view"}
                </span>
                <div className="flex items-center gap-2">
                  {mapMode === "2d" && <span className="term hidden sm:inline">80 m baseline · 1024² probe</span>}
                  <div className="flex overflow-hidden rounded border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => handleSetMapMode("2d")}
                      className={`px-2 py-0.5 text-[11px] ${mapMode === "2d" ? "bg-[#20304f] text-white" : "text-[var(--muted)] hover:bg-[#1a2030]"}`}
                    >
                      2D Map
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetMapMode("3d")}
                      className={`px-2 py-0.5 text-[11px] ${mapMode === "3d" ? "bg-[#20304f] text-white" : "text-[var(--muted)] hover:bg-[#1a2030]"}`}
                    >
                      3D Globe
                    </button>
                  </div>
                </div>
              </div>
              <div className="min-h-[520px] flex-1">
                {mapMode === "2d" ? (
                  <SouthPoleMap
                    primary={store.primary}
                    compare={compareMode && store.compare ? store.compare : null}
                    onSelectSite={handleSelectSite}
                    onAddCompare={handleSelectCompare}
                    onCustomPoint={handleCustomPoint}
                    elevationAt={elevationAt}
                  />
                ) : (
                  <MoonGlobe3D
                    primary={store.primary}
                    compare={compareMode && store.compare ? store.compare : null}
                    primarySnap={store.primarySnapshot}
                    onSelectSite={handleSelectSite}
                  />
                )}
              </div>
              {mapMode === "3d" && (
                <p className="mt-1 text-[10px] text-[var(--dim)]">
                  Switch to the 2D map to click a custom (non-catalog) point — the 3D view is for orientation and site selection.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <QuickGlance pt={store.primary} snap={store.primarySnapshot} />
              <div className="luna-panel p-3">
                <HorizonView pt={store.primary} snap={store.primarySnapshot} />
              </div>
              <SitePanel pt={store.primary} snap={store.primarySnapshot} title="Primary" />
            </div>
          </div>

          <div className="luna-panel p-3">
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={downloadSeriesCsv}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                ⬇ Export CSV
              </button>
            </div>
            <Timeline series={series} t={selectedT} onSelectT={handleSelectT} label="Primary" />
          </div>

          <div className="luna-panel p-3">
            <FindWindowsSection
              series={series}
              siteName={store.primary?.name ?? "Primary site"}
              onJumpTo={handleSelectT}
              range={store.range}
              table={store.table}
              panel={store.panel}
              onSelectSite={handleSelectSite}
            />
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

function FindWindowsSection({
  series,
  siteName,
  onJumpTo,
  range,
  table,
  panel,
  onSelectSite,
}: {
  series: TimelineSeries[]
  siteName: string
  onJumpTo: (t: number) => void
  range: { startIso: string; stopIso: string; stepMin: number }
  table: EphemerisTable | null
  panel: SolarPanelConfig
  onSelectSite: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"windows" | "rank">("windows")

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="term">Find windows &amp; rank sites</span>
        <span className="text-[11px] text-[var(--dim)]">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("windows")}
              className={`rounded px-2 py-0.5 text-[11px] ${tab === "windows" ? "bg-[#20304f] text-white" : "text-[var(--muted)] hover:bg-[#1a2030]"}`}
            >
              Windows
            </button>
            <button
              type="button"
              onClick={() => setTab("rank")}
              className={`rounded px-2 py-0.5 text-[11px] ${tab === "rank" ? "bg-[#20304f] text-white" : "text-[var(--muted)] hover:bg-[#1a2030]"}`}
            >
              Rank sites
            </button>
          </div>
          {tab === "windows" ? (
            <WindowFinder series={series} siteName={siteName} onJumpTo={onJumpTo} />
          ) : (
            <SiteRanking range={range} table={table} panel={panel} onSelectSite={onSelectSite} />
          )}
        </div>
      )}
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

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function Header({ onTogglePro, onCopyLink }: { onTogglePro: () => void; onCopyLink: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const url = onCopyLink()
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API unavailable (older browser / no permission) — fall
      // back to a hidden, selected input so the person can still copy manually.
      const input = document.createElement("input")
      input.value = url
      input.style.position = "fixed"
      input.style.opacity = "0"
      document.body.appendChild(input)
      input.focus()
      input.select()
      try {
        document.execCommand("copy")
      } catch {
        // give up silently — the URL is still visible in the address bar workflow
      }
      document.body.removeChild(input)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

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
          <button
            type="button"
            onClick={handleCopy}
            className="term cursor-pointer text-[var(--muted)] hover:text-[var(--accent)]"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
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