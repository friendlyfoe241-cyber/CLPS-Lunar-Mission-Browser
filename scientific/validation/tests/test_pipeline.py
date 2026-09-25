import sys
sys.path.insert(0, "/workspace/project/CLPS-Lunar-Mission-Browser/scientific")

from lunasight.ephemeris import spice_geometry as sg
sg.furnish_kernels(["scientific/data/kernels/" + k for k in
                    ["de421.bsp", "naif0012.tls", "moon_080317.tf",
                     "moon_pa_de421_1900-2050.bpc"]])
from lunasight.terrain.horizon import DemRaster, horizon_profile_grid
from lunasight.illumination.analysis import analyze_site
from lunasight.sites.catalog import get_site

site = get_site("malapert-massif")
dem = DemRaster("scientific/data/terrain/Site23_final_adj_5mpp_surf.tif")
el = dem.sample_elevation(site.lat, site.lon)
print("elevation at site:", el)

et = sg.utc_to_et("2026-01-01 00:00:00 UTC")
hp = horizon_profile_grid(dem, site.lat, site.lon, float(el),
                          half_extent_m=20000, grid_res_m=200,
                          azimuth_step_deg=5)
print("horizon profile 5deg step, 72 samples, min/max:",
      min(hp), max(hp))

r = analyze_site(site.lat, site.lon, float(el), et, hp, horizon_step_deg=5)
import json
print(json.dumps({k: r[k] for k in ("sun", "earth", "dte", "illumination")},
                 indent=1))