# AGENTS.md — LunaSight (CLPS Lunar Mission Browser)

Persistent context for AI agents working in this repository. Read this first; if something here contradicts your training data, trust this file + the code.

## What this is

A production-quality scientific web application for the **2026 NASA Space Apps Challenge — CLPS Lunar Mission Browser**. Working name: **LunaSight**. It turns real NASA/JPL data (LOLA terrain ∩ JL NAIF SPICE kernels) into a lunar south-pole mission-planning / site-analysis workstation: compare landing sites and dates by Sun/Earth geometry, terrain-obstructed illumination, direct-to-Earth (DTE) visibility, and solar-power estimates.

 It is NOT a game or a generic space map. All values trace to real datasets or documented calculations — no fabricated numbers.

## Repository layout

```
/README.md                # full spec coverage (overview.. attribution)
/docs/DATA_SOURCES.md     # central data-source registry (the ONLY docs file so far)
/scientific/              # Python scientific pipeline (offline preprocessing/validation)
  /lunasight/           #   installable-ish package
    /ephemeris/spice_geometry.py   # SPICE Sun/Earth state → topocentric az/el (DE421, MOON_ME)
    /illumination/{analysis,solar,visibility}.py
    /sites/catalog.py    # site catalog (CLPS/IM-2 Mons Mouton,et al.
    /terrain/horizon.py   # horizon-profile generation
    /coordinates/          # lunLatlon ↔ SPSTereo ↔ body-fixed ↔ local horizon
  /validation/run_validation.py  # → scientific/output/validation_report.txt
  /validation/tests/{test_pipeline,test_subpoint_equiv}.py
  /requirements.txt, /scripts/, /data/ (raw DEMs/kernels gitignored), /output/ (committed: compact derived assets),
/web/                     # Next.js 16.3.6 / React 19 / TS / Tailwind v4 app (deployed to Vercel)
```

## Web app structure (web/)

- `src/app/page.tsx` — main workstation (map, controls, horizon, timeline, site panel, comparison mode, professional mode). Key handlers: `handleSelectSite`, `handleSelectCompare`(→ `store.addCompareSite`}, `handleCustomPoint` (map click → user-defined point, geometric-only horizon(360 zeros], elevation from probe grid}, `handleStep(±30 min`, `handleSelectT` (chart scrub)}.
- `src/app/methods/page.tsx` — "Data Sources & Methods" page (renders docs content).
- `src/components/` — `SouthPoleMap`, `SitePanel`, `HorizonView`, `Timeline`, `ControlPanel`, `Comparison`.
- `src/lib/sci/` — **the client-side science core** (imports use `@/lib/sci/...` path alias)
  - `types.ts` (AnalysisPoint/SiteSnapshot/TimelineSeries…), `constants.ts` (site roster,in units, frame names…), `coordinates.ts` (latLonToRect, latLonToSpstereo, topocentricDirectionTo…), `ephemeris.ts` (utcToEt, geometryAt, geometryFromValues…), `analysis.ts` (classification/solar model…), `analyze.ts` (analyzePoint → SiteSnapshot; analyzeSeries → TimelineSeries[]), `data.ts` (SITE_ROSTER, tabled loading of JSON + NPY probe grid), `useStore.ts` (zustand-style store: primary, compare, utcIso, range, panel params; `utcToEt(utcIso, table.startT, table.startIsoUtc)`).
- `public/data/` — runtime assets (committed:
  - `ephemeris/sun_earth_ephemeris.json` — 35,040 rows (30-min step); row = {t (ET s}, sun[lat,lon,distKm], earth[…]}; meta.start_utc.
 ET anchor: `2026-01-01T00:00:00Z` ≈ `820,497,669.184` s,
  - `sites/<11-slug>/site.json` — per-site: coords, elevation, slope, DEM resolution, horizon values(360 @1°} etc,
  - `terrain/` — `metadata.json`, `south_pole_elev_map.npy` (Float32 1024×1024 probe grid, t80 m baseline}, `south_pole_elevation.png` slogow overlay).

## Key scientific conventions

- Terrain: LRO/LOLA **80 m/pix adjusted south-pole DEM** (PGDA `LDEM_80S_80MPP_ADJ`; IAU 30135 polar stereographic, lt_ts=-90, lon_0=0; sphere R=1,737,400 m; body frame **MOON_ME** (mean Earth / DE421)). Probed grid: 1024². Purpose-built 5 m/pix site tiles used for horizon profiles in `scientific/` but onlycompact 1° horizon JSON goes to the browser.

- Ephemeris: JPL NAIF **SPICE**, kernels DE421 + leapseconds;body-fixed **MOON_ME**; internal time **ET (TDB)**. `utcToEt` in web mirrors Python SPICE conversion (validated to <0.01°}.
- Azimuth convention: **0°=N, 90°=E, 180°=S,  ​270°=W** (east-positive, north=0}. Elevation: degrees above local tangent plane (geometric horizon at  ​0°}.
- Classify every number: **SOURCE** (direct NASA), **DERIVED** (computed from source), **ESTIMATED** (model w/ assumptions). UI shows this (SitePanel "Data quality" section, e.g., "Est. generation").
- Time: all scientific input is UTC ISO; NEVER browser-local time. 30-min ephemeris interpolation resolution; finer time steps interpolate.



## Verified reference values (browser == Python SPICE — PASS)

At `2026-01-01T00:00:00Z`:

| site | Sun az | Sun el | Incidence( from zenith) | Earth az | Earth el | hor Sun az | clearance | DTE |
|---|---|---|---|---|---|---|---|---|
| Malapert Massif | 32.87° | 4.71° |  ​85.29° |  ​358.95° |  ​10.29° |​  ​2.9° |​  ​1.8° | geo+terrain VISIBLE |
| Mons Mouton / IM-2 |​  ​3.41° |​  ​6.56° |​  ​83.44° |​  ​329.18° |​  ​10.78° |​  -1.18° |​  ​7.73° | geo+terrain VISIBLE |

Full-pipeline regression (node strip-types run of the real `src/lib/sci` code): Malapert ≈ **254.3 sunlight-days/yr**, DTE **240.3**; Mons Mouton ≈ **184.0** sunlight, **241.5** DTE — meaningful (Malapert's higher latitude/elevation wins sunlight; that's expected physics,. Report: `scientific/output/validation_report.txt`.

## Gotchas

- **Stale server**: the prod server process shows as `next-server` (not `next start`) in `ps`. A `pkill -f "next start"` will NOT kill it. Check `ps aux | grep next-server`; kill by PID: `kill <pid>` (use `kill -9` if needed}. Then relaunch:[`cd web && (nohup npx next start -p 12000 -H 0.0.0.0 > /tmp/lunasight-server.log 2>&1 &)` — repeat for **12001** (work-2 host)]. Verify the served build matches the disk: `curl -s http://localhost:12000/_next/static/$(cat web/.next/BUILD_ID)/_buildManifest.js`(should return the manifest; and check the page chunk for a marker like `max-h-48` (comparison button list) or `Select second location` (OLD selector — should be absent).
- **Local hosts**: work-1 ⇆ port **12000**; work-2 ⇆ **12001**. Public URLs: `https://work-1-xtojpfpppgikwcvt.prod-runtime.all-hands.dev/` and `…work-2…`. Both should serve the same build.
.
- **Browser automation may fail hard**: in this environment the browser tool can go permanently `about:blank` (even for `example.com`) — an infra issue, not an app bug. Verify via `curl` (served HTML/chunk contents, `200`s for endpoints} or node-based tests instead.
- **datetime-local manual typing**: automation typing into the native datetime input may not fire React `onChange` (browser/automation quirk). The **±30 min step buttons are the reliable time control**, and work (verified). Do not "fix" this by adding side-effect hacks; real users type fine.

- **Comparison mode**: toggle "Comparison mode" checkbox → a button list renders (`max-h-48 flex-col`) for the second site (replaced an old native `<select>` that didn't fire onChange under automation). Map shift-click a marker also adds a compare site. `Comparison.tsx` renders Site A/B panels + synchronized stat strip + combined timeline (seriesA/B from `analyzeSeries` stored in page.tsx useMemos}.
- **The "85.29° under Azimuth" is not a bug**: it's the **Incidence (from zenith)** row (90° − elevation). The a11y dump can mislabel it; the actual Sun Azimuth row reads 32.9° (NNE)for Malapert.

- **TS type-check quirks**: `npx tsc --noEmit` works clean. Direct node import of `.ts` needs `node --experimental-strip-types --no-warnings file.mjs` and the imports must carry explicit `.ts` extensions (copy `src/lib/sci/*.ts` toa scratch dir,and `sed 's|"\./x"|"./x.ts"|'`; `undici-types` missing can break plain tsc in some setups — use the node strip-types route for standalone sci tests.
.
- **No database**: this project deliberately uses **no Supabase/Postgres/auth**. Assets are static preprocessed files. Do not add a DB unless requirements genuinely change.
- **next dev rewrites** `web/AGENTS.md` via `node_modules/next/dist/server/lib/generate-agent-files.js` (auto block;committing it with work keeps tree clean; post-rebase duplicates may need merging.



## Build / test / run

```bash
# Python scientific env
cd scientific && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python scientific/validation/run_validation.py          # → scientific/output/validation_report.txt
python scientific/validation/tests/test_pipeline.py -v    # (internal consistency
# Web
cd web && npm install
npx tsc --noEmit                                   # type-check (clean)
npx next build                                      # production build (static: /.  /methods)
npx next start -p 12000 -H 0.0.0.0     # serve work-1
npx next start -p 12001 -H 0.0.0.0     # serve work-2 (second instance)
```

## Data provenance summary (see docs/DATA_SOURCES.md for full registry)

- Terrain: NASA GSFC/PGDA LOLA South Pole DEMs (80 m/pix regional `LDEM_80S_80MPP_ADJ` + 5 m/pix site tiles); IAU 30135 polar-stereographic; committed derived forms only (raw `.tif`s gitignored, re-downloadable via scripts}..
- Ephemeris/geometry: JPL NAIF SPICE (DE421 + leapseconds, MOON_ME frame) — used offline in Python to generate the compact 30-min browser table + per-site derived products..
- Site catalog: NASA CLPS / landed missions incl. **Mons Mouton — IM-2 (Athena** and **Malapert A — IM-1 (Odysseus**), plus reference/known candidate points (all labeled per kind in `SITE_ROSTER`}.
- Everything committed is reproducible from the scripts + documented sources (see README/docs and `/scientific/`).

## Verification state (as of last session)

- TS geometry core matches Python SPICE for Malapert Massif and Mons Mouton/IM-2 at ious timestamps — no geometry bug found..
- Time stepping (±30 min) verified in live browser (PASS).
- Comparison-mode second-site selector switched from `<select>` to clickable button list (code done; bundle verified via curl servung `max-h-48` and no `Select second location`). Live end-to-end click-through was NOT re-verified in-browser because the browser automation broke (infra) — treat as pending if doing final QA.

- Commits: `0d45dcb` (scientific core), `f3b308f` (web app) — pushed to `origin/main`://github.com/friendlyfoe241-cyber/CLPS-Lunar-Mission-Browser.git. Working tree was clean at push time.

## Repo house rules

- NEVER fabricate NASA endpoints/datasets/coordinates/ephemerides/values. If a source is missing, ship geometric-only analysis with an honest "Terrain-aware analysis unavailable" state rather than fake data.

- Prefer Python preprocessing over re-creating heavy pipelines in the browser; browser does only light/validated math + interpolation + rendering..
- Prefix derived data provenance: source, version, script, params, resolution, frame, date, lib versions (see docs/DATA_SOURCES.md}.