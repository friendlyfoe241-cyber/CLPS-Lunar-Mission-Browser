#!/usr/bin/env python3
"""Generate per-site runtime assets.

For each catalogued site that has a local high-resolution PGDA tile
DEM, this script:

1. samples the elevation and slope at the site point,
2. computes a terrain horizon profile (1-deg azimuth step),
3. writes: scientific/output/sites/<id>/site.json with all metadata,
   horizon profile as JSON array, and slope.

Sites without a tile DEM still get a horizon profile computed from the
base 80 m/pix DEM (regional), which is coarser but still real.

Run: python scientific/preprocessing/generate_site_assets.py
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lunasight.sites.catalog import all_sites, get_site
from lunasight.terrain.horizon import DemRaster, horizon_profile_grid
from lunasight.coordinates.projection import lat_lon_to_spstereo

TILE_MAP = {
    "Site01": ("scientific/data/terrain/Site01_final_adj_5mpp_surf.tif", 5.0),
    "Site04": ("scientific/data/terrain/Site04_final_adj_5mpp_surf.tif", 5.0),
    "Site06": ("scientific/data/terrain/Site06_final_adj_5mpp_surf.tif", 5.0),
    "Site07": ("scientific/data/terrain/Site07_final_adj_5mpp_surf.tif", 5.0),
    "Site11": ("scientific/data/terrain/Site11_final_adj_5mpp_surf.tif", 5.0),
    "Site20": ("scientific/data/terrain/Site20_final_adj_5mpp_surf.tif", 5.0),
    "Site23": ("scientific/data/terrain/Site23_final_adj_5mpp_surf.tif", 5.0),
}

BASE_DEM = "scientific/data/terrain/LDEM_80S_80MPP_ADJ.TIF"


def compute_slope(dem: DemRaster, lat, lon, step_m):
    """Local slope magnitude (deg) using a small 3x3 window."""
    x0, y0 = lat_lon_to_spstereo(lat, lon)
    pts = [
        (x0 - step_m, y0 - step_m), (x0, y0 - step_m), (x0 + step_m, y0 - step_m),
        (x0 - step_m, y0),          (x0, y0),          (x0 + step_m, y0),
        (x0 - step_m, y0 + step_m), (x0, y0 + step_m), (x0 + step_m, y0 + step_m),
    ]
    vals = []
    for x, y in pts:
        try:
            v = next(dem.src.sample([(x, y)], 1))
            vals.append(float(v[0]))
        except Exception:
            vals.append(math.nan)
    h = np.array(vals).reshape(3, 3)
    if np.isnan(h).any():
        return None
    dzdx = ((h[0, 2] + 2 * h[1, 2] + h[2, 2]) - (h[0, 0] + 2 * h[1, 0] + h[2, 0])) / (8 * step_m)
    dzdy = ((h[2, 0] + 2 * h[2, 1] + h[2, 2]) - (h[0, 0] + 2 * h[0, 1] + h[0, 2])) / (8 * step_m)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="scientific/output/sites")
    ap.add_argument("--only", default=None, help="comma-separated site ids")
    ap.add_argument("--horizon-radius-m", type=float, default=30000.0)
    ap.add_argument("--horizon-grid-m", type=float, default=200.0)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    only = set(args.only.split(",")) if args.only else None

    tiles_loaded = {}
    base_dem = None
    for site in all_sites():
        if only and site.id not in only:
            continue
        tile_path = None
        res = 80.0
        if site.pgda_tile:
            entry = TILE_MAP.get(site.pgda_tile)
            if entry and os.path.exists(entry[0]):
                tile_path, res = entry
        print(f"== {site.id} ({site.name}) tile={'yes' if tile_path else 'no'}")

        if tile_path:
            if tile_path not in tiles_loaded:
                tiles_loaded[tile_path] = DemRaster(tile_path)
            dem = tiles_loaded[tile_path]
        else:
            if base_dem is None:
                base_dem = DemRaster(BASE_DEM)
            dem = base_dem

        elev = dem.sample_elevation(site.lat, site.lon)
        if elev is None:
            elev = 0.0
        elev = float(elev)

        slope = None
        try:
            slope = compute_slope(dem, site.lat, site.lon, res)
        except Exception as e:
            print("  slope error:", e)
            slope = None

        hp = horizon_profile_grid(
            dem, site.lat, site.lon, elev,
            half_extent_m=args.horizon_radius_m,
            grid_res_m=args.horizon_grid_m,
            azimuth_step_deg=1.0,
        )
        hp_list = [None if math.isnan(v) else round(float(v), 2) for v in hp]

        site_dir = os.path.join(args.out, site.id)
        os.makedirs(site_dir, exist_ok=True)
        doc = {
            "id": site.id,
            "name": site.name,
            "lat": site.lat,
            "lon": site.lon,
            "lon_east0": site.lon % 360.0,
            "description": site.description,
            "coordinate_source": site.coordinate_source,
            "site_class": site.site_class,
            "region": site.region,
            "elevation_m": round(elev, 2),
            "slope_deg": (round(slope, 2) if slope is not None else None),
            "slope_baseline_m": res,
            "dem": {
                "tile": (site.pgda_tile if tile_path else None),
                "resolution_m_per_px": res,
                "source": ("NASA GSFC/PGDA 5 m/pix LOLA"
                           if tile_path else "NASA GSFC/PGDA 80 m/pix LOLA"),
            },
            "horizon": {
                "azimuth_step_deg": 1.0,
                "units": "terrain elevation angle (deg) above local horizontal",
                "radius_m": args.horizon_radius_m,
                "grid_res_m": args.horizon_grid_m,
                "values": hp_list,
            },
            "uncertainty": {
                "elevation": None,
                "statement": ("Uncertainty not quantified in this analysis."
                              if tile_path is None else
                              "Interpolated LOLA spot predictions; see "
                              "Barker et al. 2021 (median RMS Z error "
                              "~0.3-0.5 m, slope error ~1.5-2.5 deg for "
                              "5 m/pix tiles)."),
            },
            "provenance": {
                "generated": datetime.now(timezone.utc).isoformat(),
                "terrain_source": ("NASA GSFC/PGDA (Barker et al. 2023, "
                                   "docs/DATA_SOURCES.md)"),
            },
        }
        with open(os.path.join(site_dir, "site.json"), "w") as f:
            json.dump(doc, f)
        print(f"  wrote {site_dir}/site.json elev={doc['elevation_m']} "
              f"slope={doc['slope_deg']}")

    print("done")


if __name__ == "__main__":
    main()