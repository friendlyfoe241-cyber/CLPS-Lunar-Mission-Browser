# Data Sources & Methods

This is the central registry for every scientific dataset used by
LunaSight.  Every item lists source/provider, product name, URL/identifier,
mission/instrument, units, coordinate system, resolution, version and
its purpose in the application.

Nothing scientific in the deployed app is fabricated: every value traces
back to one of the rows below or to an explicitly documented calculation
method (see SCIENTIFIC_METHODS.md).

---

##  ​​1. Terrain: LRO / LOLA South Pole DEMs (NASA GSFC/PGDA)

###  a. Regional 80 m/pix DEM

| field | value |
|---|---|
| Source | NASA GSFC Planetary Geodesy & Altimetry Lab (PGDA) |
| Product | LOLA South Pole DEM, 80 m/pix, Adjusted (LDEM_80S_80MPP_ADJ) |
| Identifier | `LDEM_80S_80MPP_ADJ.TIF` (HDD v2; see DOI below) |
| URL | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF |
| DOI | https://doi.org/10.60903/gsfcpgda-lola-spole (`LOLA South Pole DEM` bundle) |
| Mission/Instr. | Lunar Reconnaissance Orbiter (LRO) / Lunar Orbiter Laser Altimeter (LOLA) |
| Units | meters above reference sphere R = 1,737,400 m |
| CRS | IAU 30135: `Moon (2015) - Sphere / Ocentric / South Polar`, polar stereographic, lat_ts=-90, lon_0=0; body-fixed frame MOON_ME (mean Earth / DE421) |
| Resolution | 80 m/pix |
| Coverage |​​ 80S → pole (7600x7600 px, +-304 km) |
| Version | SHADR (v2) adjusted elevation (`_ADJ` suffix, zero-mean-removed per track; see Barker et al. 2021/2023) |
| Purpose | Regional map backdrop, elevation probe on the polar map, regional horizon profiles for sites without 5 m tiles. |

Reference: Barker, M. K., et al. (2023), "A New View of the Lunar South Pole from LOLA", *Plan.Sci. J.* 4, 183; doi:[10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1).

### b. High-resolution 5 m/pix site DEMs

| field | value |
|---|---|
| Source | NASA GSFC/PGDA |
| Product | `*_final_adj_5mpp_surf.tif` site DEMs (3200x3200 px, ~16 km footprint) |
| URL | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/SiteNN/SiteNN_final_adj_5mpp_surf.tif (NN in 01..30) |
| Mission/Instr. | LRO / LOLA |
| Units | meters above reference sphere R = 1,737,400 m |
| CRS | IAU 30135 (same as above) |
| Resolution |​​ 5 m/pix |
| Coverage |​​ 16 km x 16 km tiles centred on the sites of Flahaut et al. (2023) / Mazarico et al. (2011) south-pole sites (see catalog) |
| Purpose | Site elevation/slope sampling, high-resolution local terrain horizon profiles, local illumination analysis. |

Tiles used: Site01 (Connecting Ridge), Site04 (Shackleton rim), Site06 (Nobile Rim 1), Site07 (Peak Near Shackleton), Site11 (de Gerlache Rim), Site20 (Leibnitz Beta Plateau), Site23 (Malapert Massif.



Note: `_surf.tif` surfaces are the *radius-adjusted* `_adj` (adjusted) products; elevations are referenced to the IAU 30135 sphere.


---

##  ​​2. Ephemeris / geometry: JPL NAIF SPICE kernels

| kernel | purpose |
|---|---|
| `de421.bsp` | DE421 planetary+lunar ephemerides: Sun/Earth/Moon barycentres positions. |
| `moon_pa_de421_1900-2050.bpc` | Moon principal-axis (PA) orientation (body-fixed MOON_PA frame, 1900-2050 CE. |
| `moon_080317.tf` | MOON_ME (mean Earth fixed) frame definition via MOON_PA. |
| `naif0012.tls` | Leap-second kernel (UTC↔ET conversion. |

URL: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/

- de421:  `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de421.bsp`
- bpc: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc`
- fk: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/moon/moon_080317.tf`
- lsk: `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls`

Time standard: **TDB seconds past J2000 TDB** (SPICE ET); UTC→ET via leap seconds, useg `str2et`.

Reference frame: **MOON_ME** (mean Earth/polar axis fixed frame): the axisymmetric approximation of the Moon's rotation used by the scientific community for south-pole illumination work (e.g., Flahaut, Mazarico, and NASA's own LOLA visualizations. Earth direction uses MOON_ME; the small (<=~1e-5 radian) librational offset between MOON_ME and MOON_PA is consistent with the DE421-based PA rotation kernel


---

##  ​​3. Site coordinate catalog

| site | latitude (planetocentric, deg) | longitude (east, deg) | source |
|---|---|---|---|
| Peak Near Shackleton (Site 07) | -88.811 |​​123.690 | PGDA Site07 tile centre |
| Connecting Ridge (Site 01) | -89.463 | -137.490 | PGDA Site01 tile centre |
| Shackleton Rim (Site 04) | -89.767 | -171.870 | PGDA Site04 tile centre |
| de Gerlache Rim (Site   11) | -88.683 | -67.932 | PGDA Site11 tile centre |
| Nobile Rim 1 (Site   06) | -85.438 |​​37.367 | PGDA Site06 tile centre |
| Leibnitz Beta Plateau (Site   20) | -85.427 |​​31.743 | PGDA Site20 tile centre |
| Malapert Massif(Site   23) | -85.995 | -0.235 | PGDA Site23 tile centre |
| Mons Mouton / IM-2 | -84.78 |​​29.13 | LROC published IM-2 intended landing site |
| Malapert A / IM-1 | -80.30 |​​14.41 | published IM-1 landing coordinates (approx. |
| South Pole (reference) | -90.0 |​​0. | definition |
| Shackleton centre | -89.67 |​​0.. | published crater centre (approx. |

The Mazarico et al.(2011) site numbering used by PGDA tiles: Sites 01, 04, 06 etc. correspond to the headings in the catalog; tile centres are reprojected with our validated IAU 30135 transform.


---

##  ​​4. Derived runtime assets

| asset | derived from | method |
|---|---|---|
| `output/terrain/south_pole_elevation.png` (~91 KB) | base 80 m DEM | overview+average resample, terrain colormap |
| `output/terrain/south_pole_elev_map.npy` (2 MB) | base 80 m DEM | overview downsampled elevation probe grid (1024x1024, float16, metres given NaN) |
| `output/terrain/metadata.json` | - | provenance |
| `output/sites/<id>/site.json` | site tile DEMs / base DEM | elevation sample + horizon profile + slope (scripts/generate_site_assets.py) |
| `output/ephemeris/sun_earth_ephemeris.json` (3.6 MB) | SPICE DE421+PA kernels | sub-solar/sub-Earth lat/lon + distances every 30 min, 2025-2027 |
| `scientific/data/kernels/*` | NAIF | downloaded reference kernels |
| `web/public/data/terrain/moon_global_basemap.jpg` (233 KB) | see note below | whole-Moon equirectangular basemap, 3D globe view only |


---

##  ​​5. Attribution

- DEM products: NASA GSFC Planetary Geodesy & Altimetry (PGDA)
  at https://pgda.gsfc.nasa.gov/; B. K.Barker et al., *Planet. Sci. J.* 4, 183 (2023), doi:10.3847/PSJ/acf3e1}.
  Site tiles credit: Flahaut, J. et al.,(2023) and Mazarico, E. et al.,(2011, doi:10.1029/2010JE003723}.
- Ephemerides and orientations: NASA/JPL NAIF SPICE kernels}de421: Standish, E. M.,(2000}, JPL IOM 312.F-98-048; Moon FK/PCK: JPL NAIF}.
- LROC IM-2 landing site: LROC website (lroc.im-ldi.com}, NASA/GSFC/Arizona State University}.
- 3D-globe whole-Moon basemap (`moon_global_basemap.jpg`, 1024×512 equirectangular):
  a lunar photographic mosaic bundled as a standard example asset in the
  three.js library's own repository (`examples/textures/planets/moon_1024.jpg`,
  github.com/mrdoob/three.js), used widely across three.js's official
  examples for over a decade. It is decorative/contextual only — general
  whole-Moon visual context for the 3D view — and is NOT treated as a
  scientific source; it carries none of the LOLA/SPICE verification this
  document describes for the other datasets, and its exact prime-meridian
  alignment relative to the IAU/SPICE frame used elsewhere in this app is
  not independently confirmed. The south-pole region — where this app's
  actual analysis happens — is instead rendered from the same verified
  LOLA elevation data as everywhere else (see the polar-cap entries above),
  which sits on top of and visually supersedes this basemap at the pole.


---

##  ​​6. No fabricated data policy

We do not invent NASA endpoints, coordinates, ephemerides, or
values.{  Where a dataset was listed but not yet processed (e.g., certain
site tiles we do not ship, or LROC shape-from-shading products we did not use,
that is stated explicitly.{  No placeholder numbers appear in the deployed app:
if a value cannot be derived from a documented source it is withheld and
labelled "Uncertainty not quantified in this analysis" or "unavailable".