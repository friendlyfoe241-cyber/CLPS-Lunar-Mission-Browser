#!/usr/bin/env python3
"""Generate the compact runtime ephemeris table.

The table stores, at a fixed sample interval, the sub-solar and
sub-earth planetocentric coordinates plus the body distances from the
Moon centre.  From this table the web app reconstructs the Sun/Earth
azimuth/elevation for any site with the exact (validated) sub-point
geometry.  This keeps the runtime asset small and the browser-side
interpolation lightweight.

Input:  SPICE kernels (scientific/data/kernels)
Output: scientific/output/ephemeris/sun_earth_ephemeris.json (or .npy)
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-01-01 00:00:00 UTC")
    ap.add_argument("--stop", default="2027-01-01 00:00:00 UTC")
    ap.add_argument("--step", type=float, default=3600.0,
                    help="sample step in seconds (default 1h)")
    ap.add_argument("--out", default="scientific/output/ephemeris/sun_earth_ephemeris.json")
    args = ap.parse_args()

    from lunasight.ephemeris import spice_geometry as sg
    kernels = [
        "scientific/data/kernels/de421.bsp",
        "scientific/data/kernels/naif0012.tls",
        "scientific/data/kernels/moon_080317.tf",
        "scientific/data/kernels/moon_pa_de421_1900-2050.bpc",
    ]
    sg.furnish_kernels(kernels)

    et_start = sg.utc_to_et(args.start)
    et_stop = sg.utc_to_et(args.stop)
    n = int(math.floor((et_stop - et_start) / args.step)) + 1
    ets = et_start + np.arange(n) * args.step

    sun_lat = np.empty(n)
    sun_lon = np.empty(n)
    sun_dist = np.empty(n)
    earth_lat = np.empty(n)
    earth_lon = np.empty(n)
    earth_dist = np.empty(n)

    for i, et in enumerate(ets):
        lat, lon = sg.sub_solar_lat_lon(float(et))
        sun_lat[i], sun_lon[i] = lat, lon
        p = sg.sun_position_moon_me(float(et))
        sun_dist[i] = float(np.linalg.norm(p))
        lat2, lon2 = sg.sub_earth_lat_lon(float(et))
        earth_lat[i], earth_lon[i] = lat2, lon2
        p2 = sg.earth_position_moon_me(float(et))
        earth_dist[i] = float(np.linalg.norm(p2))
        if i % 500 == 0:
            print(f"  {i}/{n} ({sg.et_to_utc(float(et))})")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    # Round to sensible precision; store lon in [-180,180)
    def _lon360(l):
        return ((l + 180.0) % 360.0) - 180.0

    rows = []
    for i in range(n):
        rows.append({
            "t": round(float(ets[i]), 3),           # ET (TDB seconds past J2000)
            "sun": [round(float(sun_lat[i]), 5),
                    round(_lon360(float(sun_lon[i])), 5),
                    round(float(sun_dist[i]), 2)],
            "earth": [round(float(earth_lat[i]), 5),
                      round(_lon360(float(earth_lon[i])), 5),
                      round(float(earth_dist[i]), 2)],
        })

    meta = {
        "rows": len(rows),
        "start_utc": sg.et_to_utc(float(et_start)),
        "stop_utc": sg.et_to_utc(float(et_stop)),
        "step_sec": args.step,
        "columns": {
            "t": "SPICE ephemeris time seconds past J2000 TDB",
            "sun_lat": "sub-solar planetocentric latitude (deg)",
            "sun_lon": "sub-solar east longitude (deg)",
            "sun_dist": "Sun-Moon centre distance (km)",
            "earth_lat": "sub-Earth planetocentric latitude (deg)",
            "earth_lon": "sub-Earth east longitude (deg)",
            "earth_dist": "Earth-Moon centre distance (km)",
        },
        "frame": "MOON_ME (DE421)",
        "kernels": [os.path.basename(k) for k in kernels],
        "generated": datetime.now(timezone.utc).isoformat(),
        "azimuth_convention": "0=N 90=E 180=S 270=W computed in browser from sub-point",
    }
    doc = {"meta": meta, "data": rows}
    with open(args.out, "w") as f:
        json.dump(doc, f)
    print(f"wrote {args.out} ({os.path.getsize(args.out)/1024:.0f} KB)")

    # compact binary: rows of 7 float64 little-endian
    # [et, sun_lat, sun_lon, sun_dist, earth_lat, earth_lon, earth_dist]
    bin_path = os.path.splitext(args.out)[0] + ".bin"
    arr = np.zeros((n, 7), dtype=np.float64)
    for i in range(n):
        arr[i] = (rows[i]["t"],
                  rows[i]["sun"][0], rows[i]["sun"][1], rows[i]["sun"][2],
                  rows[i]["earth"][0], rows[i]["earth"][1], rows[i]["earth"][2])
    with open(bin_path, "wb") as f:
        f.write(arr.tobytes())
    print(f"wrote {bin_path} ({os.path.getsize(bin_path)/1024:.0f} KB)")

    # small JS-consumable index metadata
    idx = {k: meta[k] for k in ("rows", "start_utc", "stop_utc", "step_sec",
                                "frame", "kernels", "generated",
                                "azimuth_convention", "columns")}
    idx["binary"] = os.path.basename(bin_path)
    idx["dtype"] = "f8"
    idx["ncols"] = 7
    with open(os.path.splitext(args.out)[0] + ".meta.json", "w") as f:
        json.dump(idx, f, indent=2)
    print("done")


if __name__ == "__main__":
    main()