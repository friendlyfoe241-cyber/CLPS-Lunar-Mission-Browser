#!/usr/bin/env python3
"""Preprocess LOLA south-pole DEM into compact runtime assets.

Steps:
1. (optional) Download the verified NASA source COG.
2. Inspect metadata (CRS, transform, bounds, overviews).
3. Generate a compact overview pyramid for the web (PNG tiles / WebP or
   a single low-res PNG for the map backdrop plus a medium-res PNG).
4. Write a metadata JSON with full provenance.

The runtime app consumes the compact PNG layers and JSON metadata; it
never downloads the raw DEM.  Heavy processing stays in this script.

Run:  python scientific/preprocessing/preprocess_terrain.py
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import numpy as np

from lunasight.terrain.horizon import DemRaster

SOURCES = {
    "base": {
        "name": "LRO LOLA South Pole 80 m/pix DEM (LDEM_80S_80MPP_ADJ)",
        "url": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF",
        "doi": "10.60903/gsfcpgda-lola-spole",
        "bibtex": ("Barker, M.K., et al. (2023) 'A New View of the Lunar "
                   "South Pole from LOLA', Planet. Sci. J. 4, 183. "
                   "doi:10.3847/PSJ/acf3e1"),
        "crs": "IAU 30135 (Moon 2015 sphere / Ocentric / South Polar)",
        "res": "80 m/pix",
        "coverage": "80S to pole",
        "frame": "MOON_ME (DE421)",
    }
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF")
    ap.add_argument("--out", default="scientific/output/terrain")
    ap.add_argument("--map-size", type=int, default=1024,
                    help="size (px) of the full-region base PNG")
    args = ap.parse_args()

    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)

    src = DemRaster(args.source)
    src.close()
    # rasterio transient handle
    import rasterio
    src_h = rasterio.open(args.source)

    print(f"CRS: {src_h.crs}")
    print(f"size: {src_h.width}x{src_h.height}")
    print(f"bounds: {src_h.bounds}")
    print(f"overviews: {src_h.overviews(1)}")
    print(f"res: {src_h.res}")

    # ---------- build compact map backdrop ----------
    # Read full res at low overview then downsample to map-size
    # (the COG overviews let us read a small decimated array quickly).
    # We will produce a 1024x1024 render of elevation with a good
    # colormap, plus a 4096 version optionally for zoom.
    from rasterio.enums import Resampling
    import rasterio.windows as winmod

    # choose overview index that yields >= map_size
    ovs = src_h.overviews(1)
    target_ov = 1
    for ov in ovs:
        if src_h.width / ov <= args.map_size:
            target_ov = ov
            break
    data = src_h.read(1, out_shape=(1, src_h.height // target_ov, src_h.width // target_ov),
                      resampling=Resampling.average)
    elev = np.squeeze(data).astype(np.float32)
    elev_nan = np.isnan(elev)

    # min/max for mapping (ignore extremes)
    vmin = np.nanpercentile(elev, 0.5)
    vmax = np.nanpercentile(elev, 99.5)
    print(f"elevation range (0.5-99.5 pct): {vmin:.1f} .. {vmax:.1f} m")

    # colormap: dark blues/deep -> lows, dark -> bright tan highs
    # use matplotlib cmap 'rocket' reversed or 'terrain' variant
    import matplotlib.cm as cm
    norm = (np.clip(elev, vmin, vmax) - vmin) / (vmax - vmin)
    from matplotlib import colormaps
    flat = colormaps["terrain"](np.clip(elev, vmin, vmax).ravel())
    rgb = (flat[:, :3].reshape(elev.shape[0], elev.shape[1], 3) * 255).astype(np.uint8)
    # fill NaN as transparent (black with alpha 0)
    alpha = np.where(elev_nan, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])

    from PIL import Image
    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((args.map_size, args.map_size), Image.BILINEAR)
    png_path = os.path.join(out_dir, "south_pole_elevation.png")
    img.save(png_path)
    print(f"wrote {png_path}")

    # Save a lightweight elevation "thumbnail" raw binary for map probe:
    raw = np.where(elev_nan, np.nan, elev).astype(np.float32)
    red = raw
    from scipy.ndimage import zoom as _zoom
    if red.shape != (args.map_size, args.map_size):
        red = _zoom(red, (args.map_size / red.shape[0], args.map_size / red.shape[1]),
                    order=1, mode="nearest")
    np.save(os.path.join(out_dir, "south_pole_elev_map.npy"),
            red.astype(np.float16))
    print("wrote elevation probe npy")

    # ---------- metadata ----------
    meta = {
        "dataset": SOURCES["base"],
        "source_url": args.source,
        "generated": datetime.now(timezone.utc).isoformat(),
        "derived_from": "LDEM_80S_80MPP_ADJ.TIF",
        "crs": str(src_h.crs),
        "proj4": src_h.crs.to_proj4() if hasattr(src_h.crs, "to_proj4") else None,
        "map_size": args.map_size,
        "elevation_vmin_vmax": [float(vmin), float(vmax)],
        "note": ("map backdrop is a derived visualization suitable for "
                 "display; all quantitative elevation probing uses the "
                 "raw preprocessed probe array / tile DEMs."),
    }
    with open(os.path.join(out_dir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)

    src_h.close()
    print("done")


if __name__ == "__main__":
    main()