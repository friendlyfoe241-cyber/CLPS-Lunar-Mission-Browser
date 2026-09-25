import Link from "next/link"

export const metadata = {
  title: "Data Sources & Methods — LunaSight",
  description:
    "Provenance, coordinate systems, geometry methods and validation for the LunaSight CLPS lunar mission browser.",
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 id={id} className="mb-2 border-b border-[var(--border-soft)] pb-1 text-[15px] font-semibold text-[var(--accent)]">
        {title}
      </h2>
      <div className="text-[13px] leading-relaxed text-[var(--foreground)]/85">{children}</div>
    </section>
  )
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 border-b border-[var(--border-soft)]/60 px-1 py-1.5">
      <span className="term pt-0.5 text-[var(--muted)]">{k}</span>
      <span className="text-[12px]">{v}</span>
    </div>
  )
}

export default function MethodsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/" className="term text-[var(--accent)] hover:underline">← Back to LunaSight</Link>
      <h1 className="mt-3 mb-1 text-2xl font-semibold tracking-tight">Data Sources &amp; Methods</h1>
      <p className="mb-6 text-[12px] text-[var(--muted)]">
        Complete provenance for every scientific number shown in the application.  See also the repository docs
        (<code className="mono text-[11px]">/docs</code>) which are the source of truth.
      </p>

      <Section id="terrain" title="1 · Terrain — LRO/LOLA">
        <Item k="Product" v="LOLA South Pole DEM (PGDA).  Regional: <code>LDEM_80S_80MPP_ADJ.TIF</code> (80 m/pix, 7600×7600 px, 80°S→pole).  Sites: <code>*_final_adj_5mpp_surf.tif</code> (5 m/pix, 16 km tiles)." />
        <Item k="Provider" v="NASA GSFC Planetary Geodesy &amp; Altimetry (PGDA)" />
        <Item k="URLs" v="<a class='text-[var(--accent)]' href='https://pgda.gsfc.nasa.gov/'>https://pgda.gsfc.nasa.gov/</a>" />
        <Item k="Units / datum" v="Meters above the IAU 30135 reference sphere (R = 1 737 400 m)" />
        <Item k="Coordinate system" v="IAU 30135 south polar stereographic, lat_ts = −90, lon_0 = 0, X toward 90°E, Y toward 0°E" />
        <Item k="Version / ref" v="SHADR v2 adjusted (Barker et al. 2021/2023, doi:10.3847/PSJ/acf3e1); 5 m tiles after Mazarico et al. (2011), Flahaut et al. (2023)" />
        <Item k="Use" v="Map backdrop, elevation probe grid, site elevation/slope, terrain horizon profiles" />
      </Section>

      <Section id="ephemeris" title="2 · Ephemeris &amp; geometry — JPL NAIF SPICE">
        <Item k="Kernels" v="de421.bsp (planetary + lunar positions), moon_pa_de421_1900-2050.bpc (principal-axis orientation), moon_080317.tf (MOON_ME frame definition), naif0012.tls (leap seconds)" />
        <Item k="Time" v="UTC → SPICE ET (TDB seconds past J2000) via str2et; all browser math anchored to the SPICE-era anchored table" />
        <Item k="Reference frame" v="MOON_ME (mean Earth / polar axis body-fixed)" />
        <Item k="Method" v="For each timestamp we precompute the sub-solar and sub-Earth lat/lon and body distance from SPICE state vectors; the browser interpolates this compact table (verified equivalent to running the full SPICE vector chain to machine precision)." />
      </Section>

      <Section id="horizon" title="3 · Terrain horizon model">
        <Item k="Definition" v="azimuth → maximum terrain elevation angle, sampled on a ring around the site" />
        <Item k="Generation" v="Python (rasterio/scipy): for each of 360 azimuths, samples the LOLA DEM along a fan and records the maximum local elevation angle with distance falloff (horizon radius typically 10–20 km)" />
        <Item k="Runtime" v="The browser compares Sun/Earth elevation at their azimuth against the horizon value to decide geometric vs terrain-visible" />
      </Section>

      <Section id="illumination" title="4 · Illumination &amp; DTE">
        <Item k="Geometric visibility" v="Body elevation above the ideal 0° local horizon" />
        <Item k="Terrain visibility" v="Body elevation above the terrain horizon at that azimuth" />
        <Item k="DTE geometric visibility" v="Earth above the local geometric horizon AND (where terrain model exists) above the terrain horizon.  This is geometry only — not a guarantee of a usable telecom link." />
        <Item k="Solar estimate" v="Irradiance = 1361 W/m² × (1 AU / r)², times cos(incidence), panel area, 29% efficiency, 15% losses.  Explicitly an engineering model, not official mission performance." />
      </Section>

      <Section id="validation" title="5 · Validation">
        <Item k="Suite" v="34 automated checks in the repository (scientific/validation/run_validation.py): coordinate transforms vs pyproj (< 1e-11 m), frame orthonormality, sub-point table vs full SPICE, Sun/Earth zenith self-checks (< 1e-4°), horizon profile physical consistency, solar model, DTE type-logic." />
        <Item k="Report" v="scientific/output/validation_report.txt" />
      </Section>

      <Section id="limitations" title="6 · Limitations">
        <Item k="DEM" v="80 m regional baseline / 5 m site tiles.  Horizon profiles are sampled from these grids; higher-frequency terrain can locally differ." />
        <Item k="Ephemeris" v="DE421 is a high-fidelity ephemeris but older than DE440; differences are at the arcsecond level, irrelevant for this study." />
        <Item k="DTE" v="Geometry only.  Real links depend on antenna pattern, attitude, ground network and scheduling." />
        <Item k="Solar" v="Model assumes plane-parallel incidence, uniform panel assumptions.  Lander attitude and thermal state not modelled." />
        <Item k="Uncertainty" v="Where no defensible uncertainty estimate exists the UI states “Uncertainty not quantified for this analysis”." />
      </Section>

      <p className="mt-8 text-[11px] text-[var(--dim)]">
        This page is a developer-curated summary. The full authoritative documentation lives in the repository at{" "}
        <code className="mono">/docs</code> (DATA_SOURCES.md, SCIENTIFIC_METHODS.md, COORDINATE_SYSTEMS.md, VALIDATION.md,
        LIMITATIONS.md, ARCHITECTURE.md).
      </p>
    </div>
  )
}