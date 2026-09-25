import sys
sys.path.insert(0, "/workspace/project/CLPS-Lunar-Mission-Browser/scientific")
import math
import numpy as np

from lunasight.ephemeris import spice_geometry as sg
sg.furnish_kernels(["scientific/data/kernels/" + k for k in
                    ["de421.bsp", "naif0012.tls", "moon_080317.tf",
                     "moon_pa_de421_1900-2050.bpc"]])

from lunasight.coordinates.projection import (
    spstereo_to_lat_lon, lat_lon_to_spstereo, DEG2RAD, RAD2DEG, normalize_azimuth, normalize_lon,
)

R = 1737400.0


def topocentric_from_sub_point(sub_lat, sub_lon, distance_m, obs_lat, obs_lon):
    """Compute the topocentric azimuth/elevation of a body whose sub-point
    on the sphere is (sub_lat, sub_lon) at distance distance_m from the
    Moon centre, as seen from (obs_lat, obs_lon).

    This is the exact equivalent of the full state-vector calculation,
    because (sub_lat, sub_lon, D) fully defines the body position.
    """
    # target position
    tx, ty, tz = _sph_to_cart(sub_lat, sub_lon)
    tx, ty, tz = tx * distance_m, ty * distance_m, tz * distance_m
    # observer position on sphere
    ox, oy, oz = _sph_to_cart(obs_lat, obs_lon)
    ox, oy, oz = ox * R, oy * R, oz * R
    # relative vector from observer to target
    rx, ry, rz = tx - ox, ty - oy, tz - oz
    # local up/north/east:
    up = (ox / R, oy / R, oz / R)
    east = (-math.sin(math.radians(obs_lon)), math.cos(math.radians(obs_lon)), 0.0)
    north = (-math.sin(math.radians(obs_lat)) * math.cos(math.radians(obs_lon)),
             -math.sin(math.radians(obs_lat)) * math.sin(math.radians(obs_lon)),
             math.cos(math.radians(obs_lat)))
    upc = rx * up[0] + ry * up[1] + rz * up[2]
    nc = rx * north[0] + ry * north[1] + rz * north[2]
    ec = rx * east[0] + ry * east[1] + rz * east[2]
    el = math.degrees(math.atan2(upc, math.hypot(nc, ec)))
    az = math.degrees(math.atan2(ec, nc)) % 360.0
    return az, el


def _sph_to_cart(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))


# Test over random sites and epochs
rng = np.random.default_rng(42)
max_az_err = 0.0
max_el_err = 0.0
for _ in range(50):
    et = sg.utc_to_et(f"202{int(rng.integers(0,7))}-{int(rng.integers(1,13)):02d}-{int(rng.integers(1,28)):02d} 00:00:00 UTC")
    lat = rng.uniform(-90, -79)
    lon = rng.uniform(-180, 180)
    slat, slon = sg.sub_solar_lat_lon(et)
    ref = sg.sun_geometry(et, lat, lon)
    # body distance from Moon centre
    import numpy as np
    spos = sg.sun_position_moon_me(et)
    dist_m = float(np.linalg.norm(spos) * 1000.0)
    az2, el2 = topocentric_from_sub_point(slat, slon, dist_m, lat, lon)
    daz = abs((ref.azimuth_deg - az2 + 180) % 360 - 180)
    del_ = abs(ref.elevation_deg - el2)
    max_az_err = max(max_az_err, daz)
    max_el_err = max(max_el_err, del_)
    # earth
    slat2, slon2 = sg.sub_earth_lat_lon(et)
    refe = sg.earth_geometry(et, lat, lon)
    epos = sg.earth_position_moon_me(et)
    edist = float(np.linalg.norm(epos) * 1000.0)
    az3, el3 = topocentric_from_sub_point(slat2, slon2, edist, lat, lon)
    daz2 = abs((refe.azimuth_deg - az3 + 180) % 360 - 180)
    del2 = abs(refe.elevation_deg - el3)
    max_az_err = max(max_az_err, daz2)
    max_el_err = max(max_el_err, del2)

print(f"Sun+Earth max az error over 50 random (site,epoch): {max_az_err:.6f} deg")
print(f"Sun+Earth max el error: {max_el_err:.6f} deg")