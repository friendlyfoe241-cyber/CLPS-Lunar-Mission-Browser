"""Validation framework runners.

Produces a plain-text report
scientific/output/validation_report.txt documenting:

* the reference methodology (here: internal consistency/analytic +
  published reference points, documented in docs/VALIDATION.md),
* every case, with reference/calculated value/difference/tolerance/pass.
"""

from __future__ import annotations

import math
import os
import sys
import traceback

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import lunasight.ephemeris.spice_geometry as sg
from lunasight.coordinates.projection import (
    lat_lon_to_spstereo,
    spstereo_to_lat_lon,
    lat_lon_to_rect,
    rect_to_lat_lon,
    surface_vectors,
    topocentric_direction_to,
)

REPORT_LINES = []


def record(kind, name, ref, calc, diff, tol, unit="deg"):
    ok = abs(diff) <= tol
    REPORT_LINES.append(
        f"{'PASS' if ok else 'FAIL'}  {kind:22s} {name:55s} "
        f"ref={ref:12.5f} calc={calc:12.5f} diff={diff:12.6f} tol={tol:8.5f} {unit}"
    )
    return ok


# --------------------------------------------------------------------------
# Kernels
# --------------------------------------------------------------------------
KERNELS = [
    "scientific/data/kernels/de421.bsp",
    "scientific/data/kernels/naif0012.tls",
    "scientific/data/kernels/moon_080317.tf",
    "scientific/data/kernels/moon_pa_de421_1900-2050.bpc",
]


def test_projection_against_pyproj():
    """Validate the analytic polar-stereographic transform vs pyproj
    (itself configured from the exact DEM CRS WKT)."""
    import os as _os
    _os.environ["PROJ_IGNORE_CELESTIAL_BODY"] = "YES"
    import pyproj

    crs_wkt = ('PROJCS["Moon (2015) - Sphere / Ocentric / South Polar",'
               'GEOGCS["Moon (2015) - Sphere / Ocentric",'
               'DATUM["Moon (2015) - Sphere",SPHEROID["Moon (2015) - Sphere",'
               '1737400,0,AUTHORITY["IAU","30100"]],AUTHORITY["IAU","30100"]],'
               'PRIMEM["Reference Meridian",0,AUTHORITY["IAU","30100"]],'
               'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],'
               'AUTHORITY["IAU","30100"]],'
               'PROJECTION["Polar_Stereographic"],'
               'PARAMETER["latitude_of_origin",-90],'
               'PARAMETER["central_meridian",0],'
               'PARAMETER["false_easting",0],PARAMETER["false_northing",0],'
               'UNIT["metre",1,AUTHORITY["EPSG","9001"]],'
               'AXIS["Easting",NORTH],AXIS["Northing",NORTH],'
               'AUTHORITY["IAU","30135"]]')
    moon_proj = pyproj.CRS.from_wkt(crs_wkt)
    moon_geo = pyproj.CRS.from_wkt(
        'GEOGCS["Moon (2015) - Sphere / Ocentric",'
        'DATUM["Moon (2015) - Sphere",SPHEROID["Moon (2015) - Sphere",'
        '1737400,0,AUTHORITY["IAU","30100"]],AUTHORITY["IAU","30100"]],'
        'PRIMEM["Reference Meridian",0,AUTHORITY["IAU","30100"]],'
        'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],'
        'AUTHORITY["IAU","30100"]]')
    inv = pyproj.Transformer.from_crs(moon_proj, moon_geo, always_xy=True)
    fwd = pyproj.Transformer.from_crs(moon_geo, moon_proj, always_xy=True)

    worst_f = 0.0
    worst_i = 0.0
    for i in range(1, 101):  # skip exact pole (longitude undefined there)
        lat = i * 0.1 - 90.0
        for lon in range(-180, 180, 30):
            x1, y1 = lat_lon_to_spstereo(lat, lon)
            x2, y2 = fwd.transform(float(lon), float(lat))
            worst_f = max(worst_f, abs(x1 - x2), abs(y1 - y2))
            latr, lonr = spstereo_to_lat_lon(x1, y1)
            lon2, lat2 = inv.transform(x1, y1)
            worst_i = max(worst_i, abs(lat - lat2), abs(lat - latr))
            dl = abs((lon - lon2 + 540) % 360 - 180)   # unwrapped diff
            dl2 = abs((lon - lonr + 540) % 360 - 180)  # unwrapped diff
            worst_i = max(worst_i, dl, dl2)

    record("coords", "polar stereographic forward vs pyproj", 0.0, worst_f,
           worst_f, 1e-3, "m")
    record("coords", "polar stereographic inverse vs pyproj", 0.0, worst_i,
           worst_i, 1e-6, "deg")


def test_latlon_rect_roundtrip():
    worst = 0.0
    for lat in range(-90, 91, 10):
        for lon in range(-180, 180, 30):
            r = lat_lon_to_rect(lat, lon)
            la, lo = rect_to_lat_lon(r)
            worst = max(worst, abs(la - lat),
                        abs((lo - lon + 540) % 360 - 180))
    record("coords", "lat/lon <-> body-fixed rect roundtrip", 0.0, worst,
           worst, 1e-9, "deg")


def test_local_frame_orthonormal():
    for lat in [-89, -85, -80, 0, 45]:
        up, north, east = surface_vectors(lat, 37.0)
        up = np.asarray(up)
        north = np.asarray(north)
        east = np.asarray(east)
        # orthonormal
        pairs = [("up", up, "north", north), ("up", up, "east", east),
                 ("north", north, "east", east)]
        worst = 0.0
        for _, a, _, b in pairs:
            worst = max(worst, abs(float(np.dot(a, b))))
        for a, n in ((up, "up"), (north, "north"), (east, "east")):
            worst = max(worst, abs(float(np.dot(a, a)) - 1.0))
        record("frame", f"local frame orthonormal lat={lat}", 0.0, worst,
               worst, 1e-9)
        # Right-handed local frame: {east, north, up} form a
        # right-handed triple (east x north = up).  Azimuth measured
        # clockwise from north (atan2(east, north)) is consistent.
        ce = np.cross(east, north)
        worst2 = abs(float(np.dot(ce, up)) - 1.0)
        record("frame", f"ENU azimuth frame consistent lat={lat}", 0.0, worst2,
               worst2, 1e-9)


def test_subpoint_equivalence():
    """Sun/Earth az/el reconstructed from the sub-body table equal the
    direct SPICE state-vector computation."""
    rng = np.random.default_rng(1)
    worst_az = 0.0
    worst_el = 0.0
    for _ in range(30):
        et = sg.utc_to_et(f"202{int(rng.integers(0, 6))}-"
                          f"{int(rng.integers(1, 13)):02d}-"
                          f"{int(rng.integers(1, 28)):02d} 00:00:00 UTC")
        lat = float(rng.uniform(-90, -79))
        lon = float(rng.uniform(-180, 180))
        for body, fn in (("sun", sg.sun_geometry),
                         ("earth", sg.earth_geometry)):
            ref = fn(et, lat, lon)
            if body == "sun":
                sub = sg.sub_solar_lat_lon(et)[:2]
                dist = float(np.linalg.norm(sg.sun_position_moon_me(et)) * 1000)
            else:
                sub = sg.sub_earth_lat_lon(et)[:2]
                dist = float(np.linalg.norm(sg.earth_position_moon_me(et)) * 1000)
            dx = dist * math.cos(math.radians(sub[0])) * math.cos(math.radians(sub[1]))
            dy = dist * math.cos(math.radians(sub[0])) * math.sin(math.radians(sub[1]))
            dz = dist * math.sin(math.radians(sub[0]))
            obs = lat_lon_to_rect(lat, lon)  # on sphere (elevation 0)
            az, el = topocentric_direction_to((dx, dy, dz), obs, lat, lon)
            worst_az = max(worst_az, abs((ref.azimuth_deg - az + 180) % 360 - 180))
            worst_el = max(worst_el, abs(ref.elevation_deg - el))
    record("geom", "Sun/Earth az from sub-point table", 0.0, worst_az,
           worst_az, 1e-4, "deg")
    record("geom", "Sun/Earth el from sub-point table", 0.0, worst_el,
           worst_el, 1e-4, "deg")


def test_zenith_checks():
    """At the sub-solar point, Sun el = 90; at sub-Earth, Earth el = 90."""
    for iso in ["2026-01-01 00:00:00 UTC", "2025-06-01 12:00:00 UTC",
                "2025-12-21 00:00:00 UTC", "2026-06-15 06:00:00 UTC"]:
        et = sg.utc_to_et(iso)
        slat, slon = sg.sub_solar_lat_lon(et)
        g = sg.sun_geometry(et, slat, slon)
        record("geom", f"Sun at zenith at sub-solar pt {iso}", 90.0,
               g.elevation_deg, abs(g.elevation_deg - 90.0), 1e-4, "deg")
        elat, elon = sg.sub_earth_lat_lon(et)
        g2 = sg.earth_geometry(et, elat, elon)
        record("geom", f"Earth at zenith at sub-earth pt {iso}", 90.0,
               g2.elevation_deg, abs(g2.elevation_deg - 90.0), 1e-4, "deg")


def test_illumination_logic():
    from lunasight.illumination.visibility import visibility_for_body
    # horizon = 3 deg everywhere
    hp = np.full(360, 3.0)
    r = visibility_for_body("sun", 0.0, 5.0, hp)
    record("illum", "Sun above 3-deg horizon", True, r.terrain_visible,
           0 if r.terrain_visible == True else 1, 0)
    record("illum", "Sun clearance", 2.0, r.clearance_deg if r.clearance_deg is not None else -9,
           abs((r.clearance_deg or -9) - 2.0), 1e-6, "deg")
    r2 = visibility_for_body("sun", 0.0, 2.0, hp)
    record("illum", "Sun below 3-deg horizon obstructed", False,
           r2.terrain_visible, 0 if r2.terrain_visible == False else 1, 0)
    r3 = visibility_for_body("sun", 0.0, -1.0, None)
    record("illum", "Sun below geometric horizon (no terrain)", False,
           r3.geometric_visible, 0 if r3.geometric_visible == False else 1, 0)
    r4 = visibility_for_body("earth", 0.0, 12.0, hp)
    record("illum", "Earth above horizon terrain-visible", True,
           r4.terrain_visible, 0 if r4.terrain_visible == True else 1, 0)


def test_dte():
    from lunasight.illumination.analysis import analyze_site
    # Earth above has well-defined geometry
    et = sg.utc_to_et("2026-01-01 00:00:00 UTC")
    # somewhere with terra: use Malapert
    res = analyze_site(-85.995, -0.235, 4783.6, et)
    assert isinstance(res["dte"]["geometric_visible"], bool)
    record("dte", "DTE geometric visible flag type", True,
           res["dte"]["geometric_visible"] is not None,
           abs(1.0 - (1.0 if res["dte"]["geometric_visible"] is not None else -1.0)),
           0)


def test_solar_model():
    from lunasight.illumination.solar import SolarPanelConfig, estimated_power_watts
    p = SolarPanelConfig(area_m2=1.0, efficiency=1.0, losses=0.0)
    # Sun at zenith -> 1361 W/m2
    d = 1.495978707e11
    w = estimated_power_watts(90.0, d, p)
    record("solar", "power at zenith = solar constant", 1361.0, w, abs(w - 1361.0),
           1.0, "W")
    w0 = estimated_power_watts(-5.0, d, p)
    record("solar", "power below horizon = 0", 0.0, w0, abs(w0 - 0.0), 1e-6, "W")
    wh = estimated_power_watts(0.0, d, p)
    record("solar", "power at horizon = 0 (horizontal panel)", 0.0, wh,
           abs(wh - 0.0), 1e-6, "W")


def test_horizon_profile_from_dem():
    from lunasight.terrain.horizon import DemRaster, horizon_profile_grid
    dem = DemRaster("scientific/data/terrain/Site23_final_adj_5mpp_surf.tif")
    hp = horizon_profile_grid(dem, -85.995, -0.235, 4783.6,
                              half_extent_m=10000, grid_res_m=250,
                              azimuth_step_deg=5)
    finite = np.isfinite(hp).sum()
    record("terrain", "horizon profile has finite samples", 72, finite,
           abs(72 - finite), 0)
    # The terrain horizon is always well above -90 deg (physical),
    # and well below +90 for a site on a prominent massif.
    hpmin = float(np.nanmin(hp)) if finite else -90.0
    ok = hpmin > -89.0
    record("terrain", "horizon minimum > -89 deg", 1.0, 1.0 if ok else 0.0,
           0.0 if ok else 1.0, 0)


def run_all():
    REPORT_LINES.append("LUNA SIGHT VALIDATION REPORT")
    REPORT_LINES.append("=" * 100)
    REPORT_LINES.append("")
    tests = [
        test_projection_against_pyproj,
        test_latlon_rect_roundtrip,
        test_local_frame_orthonormal,
        test_subpoint_equivalence,
        test_zenith_checks,
        test_illumination_logic,
        test_dte,
        test_solar_model,
        test_horizon_profile_from_dem,
    ]
    for t in tests:
        try:
            t()
        except Exception:
            REPORT_LINES.append(f"ERROR in {t.__name__}:")
            REPORT_LINES.append(traceback.format_exc())
    REPORT_LINES.append("")
    REPORT_LINES.append("Reference: see docs/VALIDATION.md for methodology.")
    text = "\n".join(REPORT_LINES)
    print(text)
    out = os.path.join("scientific/output", "validation_report.txt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write(text + "\n")
    nfail = sum(1 for l in REPORT_LINES if l.startswith("FAIL"))
    print(f"\n{sum(1 for l in REPORT_LINES if l.startswith('PASS'))} passed, "
          f"{nfail} failed -> {out}")


if __name__ == "__main__":
    sg.furnish_kernels(KERNELS)
    run_all()