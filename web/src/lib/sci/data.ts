// Client-side data loading with caching.
// Serves the preprocessed scientific assets from /data/.

import type { EphemerisRow, EphemerisTable } from "./ephemeris"
import type { SiteInfo } from "./types"

export type { SiteInfo } from "./types"

let ephemerisTable: EphemerisTable | null = null
let ephemerisRows: EphemerisRow[] = []
const siteCache = new Map<string, Promise<SiteInfo | null>>()

export async function loadEphemerisTable(): Promise<EphemerisTable> {
  if (ephemerisTable) return ephemerisTable
  try {
    const res = await fetch("/data/ephemeris/sun_earth_ephemeris.json", { cache: "force-cache" })
    if (!res.ok) throw new Error(`ephemeris http ${res.status}`)
    const doc = await res.json()
    const meta = doc?.meta ?? {}
    const raw = Array.isArray(doc?.data) ? doc.data : []
    const rows: EphemerisRow[] = raw.map((r: any): EphemerisRow => ({
      t: r.t,
      sunLat: Array.isArray(r.sun) ? r.sun[0] : r.sunLat,
      sunLon: Array.isArray(r.sun) ? r.sun[1] : r.sunLon,
      sunDistKm: Array.isArray(r.sun) ? r.sun[2] : r.sunDistKm,
      earthLat: Array.isArray(r.earth) ? r.earth[0] : r.earthLat,
      earthLon: Array.isArray(r.earth) ? r.earth[1] : r.earthLon,
      earthDistKm: Array.isArray(r.earth) ? r.earth[2] : r.earthDistKm,
    }))
    ephemerisTable = {
      rows,
      startT: rows[0]?.t ?? 0,
      stopT: rows[rows.length - 1]?.t ?? 0,
      startIsoUtc: meta.start_utc ?? "2025-01-01T00:00:00.000Z",
      stopIsoUtc: meta.stop_utc ?? "2027-01-01T00:00:00.000Z",
      stepSec: meta.step_sec ?? 1800,
      frame: meta.frame ?? "MOON_ME (DE421)",
      kernels: meta.kernels ?? [],
      generated: meta.generated ?? "",
    }
    ephemerisRows = rows
    return ephemerisTable
  } catch (e) {
    throw new Error(`Failed to load ephemeris: ${(e as Error).message}`)
  }
}

export function getEphemerisRows(): EphemerisRow[] {
  return ephemerisRows
}

export async function loadSiteInfo(siteId: string): Promise<SiteInfo | null> {
  const hit = siteCache.get(siteId)
  if (hit) return hit
  const p = (async (): Promise<SiteInfo | null> => {
    try {
      const res = await fetch(`/data/sites/${siteId}/site.json`, { cache: "force-cache" })
      if (!res.ok) return null
      const raw = (await res.json()) as Record<string, unknown>
      const horizonRaw = (raw.horizon ?? raw["horizon"]) as
        | { azimuth_step_deg?: number; azimuthStepDeg?: number; radius_m?: number; radiusM?: number; grid_res_m?: number; gridResM?: number; units?: string; values?: (number | null)[] }
        | undefined
      const demRaw = (raw.dem ?? {}) as { tile?: string; resolution_m_per_px?: number; resolutionMperpix?: number; resolutionM?: number; source?: string }
      const uncertaintyRaw = (raw.uncertainty ?? {}) as { elevation?: number | null; statement?: string }
      const info: SiteInfo = {
        id: (raw.id as string) ?? siteId,
        name: (raw.name as string) ?? siteId,
        lat: raw.lat as number,
        lon: raw.lon as number,
        lonEast0: (raw.lon_east0 ?? raw.lonEast0 ?? raw.lon ?? 0) as number,
        description: (raw.description as string) ?? "",
        coordinateSource: (raw.coordinate_source ?? raw.coordinateSource ?? "") as string,
        siteClass: (raw.site_class ?? raw.siteClass ?? "reference") as string,
        region: (raw.region as string) ?? null,
        elevationM: (raw.elevation_m ?? raw.elevationM ?? 0) as number,
        slopeDeg: (raw.slope_deg ?? raw.slopeDeg ?? null) as number | null,
        slopeBaselineM: (raw.slope_baseline_m ?? raw.slopeBaselineM) as number | undefined,
        dem: demRaw.source
          ? {
              tile: demRaw.tile,
              resolutionM: demRaw.resolution_m_per_px ?? demRaw.resolutionMperpix ?? demRaw.resolutionM,
              source: demRaw.source,
            }
          : undefined,
        horizon: horizonRaw?.values
          ? {
              azimuthStepDeg: horizonRaw.azimuth_step_deg ?? horizonRaw.azimuthStepDeg ?? 1,
              units: horizonRaw.units ?? "terrain elevation angle (deg)",
              radiusM: horizonRaw.radius_m ?? horizonRaw.radiusM ?? 30000,
              gridResM: horizonRaw.grid_res_m ?? horizonRaw.gridResM ?? 200,
              values: horizonRaw.values,
            }
          : undefined,
        uncertainty: uncertaintyRaw.statement
          ? { elevation: uncertaintyRaw.elevation ?? null, statement: uncertaintyRaw.statement }
          : { elevation: null, statement: "Uncertainty not quantified in this analysis." },
        provenance: (raw.provenance as { generated?: string; terrainSource?: string }) ?? undefined,
      }
      return info
    } catch {
      return null
    }
  })()
  siteCache.set(siteId, p)
  return p
}

/** Hardcoded roster (mirrors scientific/lunasight/sites/catalog.py) so the
 *  map can show sites before the JSONs load.  Coordinates are the
 *  validated catalog values.
 */
export const SITE_ROSTER: Array<{ id: string; name: string; lat: number; lon: number; region?: string; cls: string }> = [
  { id: "shackleton-rim", name: "Peak Near Shackleton (Site07)", lat: -88.811, lon: 123.690, region: "Peak Near Shackleton", cls: "pgda" },
  { id: "connecting-ridge", name: "Connecting Ridge (Site01)", lat: -89.463, lon: -137.490, region: "Connecting Ridge", cls: "pgda" },
  { id: "shackleton-near", name: "Shackleton Rim (Site04)", lat: -89.767, lon: -171.870, region: "Shackleton rim", cls: "pgda" },
  { id: "de-gerlache-rim", name: "de Gerlache Rim (Site11)", lat: -88.683, lon: -67.932, region: "de Gerlache Rim", cls: "pgda" },
  { id: "nobile-rim-1", name: "Nobile Rim 1 (Site06)", lat: -85.438, lon: 37.367, region: "Nobile Rim 1", cls: "pgda" },
  { id: "leibnitz-beta", name: "Leibnitz Beta Plateau (Site20)", lat: -85.427, lon: 31.743, region: "Leibnitz Beta Plateau", cls: "pgda" },
  { id: "malapert-massif", name: "Malapert Massif(Site23)", lat: -85.995, lon: -0.235, region: "Malapert Massif", cls: "pgda" },
  { id: "mons-mouton-im2", name: "Mons Mouton / IM-2 (Athena)", lat: -84.78, lon: 29.13, region: "Mons Mouton", cls: "clps" },
  { id: "malapert-a-im1", name: "Malapert A / IM-1 (Odysseus)", lat: -80.30, lon: 14.41, region: "Malapert A", cls: "clps" },
  { id: "south-pole", name: "Lunar South Pole (reference)", lat: -90.0, lon: 0.0, cls: "reference" },
  { id: "shackleton-centre", name: "Shackleton Crater centre", lat: -89.67, lon: 0.0, region: "Shackleton", cls: "reference" },
]