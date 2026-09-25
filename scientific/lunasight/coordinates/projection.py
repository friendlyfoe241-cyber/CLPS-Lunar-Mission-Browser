"""Lunar coordinate transforms.

Conventions (see docs/COORDINATE_SYSTEMS.md):

* Latitude: planetocentric, degrees, positive north (south pole = -90).
* Longitude: planetocentric longitude, degrees east, normalized to
  [-180, 180).
* DEM projection: South polar stereographic, true scale at the pole,
  central meridian 0 deg east, sphere radius R = 1,737,400 m
  (IAU 2015).  This is the CRS of the GSFC/PGDA LOLA south-pole COGs
  (rasterio reports it as "Moon (2015) - Sphere / Ocentric / South
  Polar", authority IAU 30135).
* Body-fixed frame: MOON_ME (DE421) - the IAU mean Earth / polar axis
  system (+Z = north mean rotation axis; prime meridian contains the
  mean Earth direction).

Verified projection mapping (confirmed against pyproj using the exact
DEM CRS WKT; radial profile identical to 6+ digits):

    rho = 2 R tan(pi/4 + phi/2)          phi = planetocentric lat, deg
    X   = rho sin(lambda_e)              lambda_e = east lon, deg
    Y   = rho cos(lambda_e)

    Inverse:
    lambda_e = atan2(X, Y)               (deg)
    phi      = 2 atan(rho / (2 R)) - pi/2  with rho = hypot(X, Y)

In this projection +Y points toward 0 deg E, +X toward 90 deg E.
"""

from __future__ import annotations

import math
from typing import Tuple

from lunasight.constants import MOON_MEAN_RADIUS_M

DEG2RAD = math.pi / 180.0
RAD2DEG = 180.0 / math.pi


# --------------------------------------------------------------------------
# Angle helpers
# --------------------------------------------------------------------------
def normalize_lon(lon_deg: float) -> float:
    """Normalize longitude to [-180, 180) degrees east."""
    lon = math.fmod(lon_deg + 180.0, 360.0)
    if lon < 0.0:
        lon += 360.0
    return lon - 180.0


def normalize_azimuth(deg: float) -> float:
    """Normalize azimuth to [0, 360) degrees."""
    deg = math.fmod(deg, 360.0)
    if deg < 0.0:
        deg += 360.0
    return deg


# --------------------------------------------------------------------------
# Planetocentric lat/lon <-> MOON_ME rectangular
# --------------------------------------------------------------------------
def lat_lon_to_rect(lat_deg: float, lon_deg: float,
                    radius_m: float = MOON_MEAN_RADIUS_M) -> Tuple[float, float, float]:
    """Planetocentric lat/lon (deg) -> MOON_ME rectangular (m)."""
    lat = lat_deg * DEG2RAD
    lon = lon_deg * DEG2RAD
    cos_lat = math.cos(lat)
    return (radius_m * cos_lat * math.cos(lon),
            radius_m * cos_lat * math.sin(lon),
            radius_m * math.sin(lat))


def rect_to_lat_lon(xyz: Tuple[float, float, float]) -> Tuple[float, float]:
    """MOON_ME rectangular (m) -> planetocentric (lat, lon) in deg."""
    x, y, z = xyz
    r = math.sqrt(x * x + y * y + z * z)
    lat = math.asin(z / r) * RAD2DEG
    lon = math.atan2(y, x) * RAD2DEG
    return lat, normalize_lon(lon)


# --------------------------------------------------------------------------
# South polar stereographic (IAU 30135) <-> planetocentric lat/lon
# --------------------------------------------------------------------------
def lat_lon_to_spstereo(lat_deg: float, lon_deg: float,
                        radius_m: float = MOON_MEAN_RADIUS_M) -> Tuple[float, float]:
    """Planetocentric lat/lon (deg) -> south polar stereographic (m).

    Returns (X, Y) in the projection plane, where +Y points toward
    longitude 0 deg E and +X toward longitude 90 deg E.
    """
    phi = lat_deg * DEG2RAD
    lam = lon_deg * DEG2RAD
    rho = 2.0 * radius_m * math.tan(math.pi / 4.0 + phi / 2.0)
    x = rho * math.sin(lam)
    y = rho * math.cos(lam)
    return x, y


def spstereo_to_lat_lon(x_m: float, y_m: float,
                        radius_m: float = MOON_MEAN_RADIUS_M) -> Tuple[float, float]:
    """South polar stereographic (m) -> planetocentric (lat, lon) in deg."""
    rho = math.hypot(x_m, y_m)
    lon = math.atan2(x_m, y_m) * RAD2DEG
    phi = 2.0 * math.atan(rho / (2.0 * radius_m)) - math.pi / 2.0
    return phi * RAD2DEG, normalize_lon(lon)


# --------------------------------------------------------------------------
# Local horizon frame and azimuth/elevation
# --------------------------------------------------------------------------
def surface_vectors(lat_deg: float, lon_deg: float,
                    radius: float = MOON_MEAN_RADIUS_M) -> Tuple[Tuple[float, float, float], ...]:
    """Return the local (up, north, east) unit axes in MOON_ME rectangular.

    East  = normalized d(r_vec)/d(lambda)
    North = normalized d(r_vec)/d(phi_c)   (planetocentric)
    Up    = r_hat
    """
    lat = lat_deg * DEG2RAD
    lon = lon_deg * DEG2RAD
    up = (math.cos(lat) * math.cos(lon),
          math.cos(lat) * math.sin(lon),
          math.sin(lat))
    east = (-math.sin(lon), math.cos(lon), 0.0)
    north = (-math.sin(lat) * math.cos(lon),
             -math.sin(lat) * math.sin(lon),
             math.cos(lat))
    return up, north, east


def vector_in_local(v_rect, up, north, east) -> Tuple[float, float, float]:
    """Express a MOON_ME rectangular vector in the local (up,north,east) frame."""
    return (v_rect[0] * up[0] + v_rect[1] * up[1] + v_rect[2] * up[2],
            v_rect[0] * north[0] + v_rect[1] * north[1] + v_rect[2] * north[2],
            v_rect[0] * east[0] + v_rect[1] * east[1] + v_rect[2] * east[2])


def local_to_azimuth_elevation(v_local) -> Tuple[float, float]:
    """Convert a local-frame (up,north,east) vector to (az, el) in deg.

    Azimuth: 0 = N, 90 = E, 180 = S, 270 = W.
    """
    upc, nc, ec = v_local
    h = math.hypot(nc, ec)
    el = math.atan2(upc, h) * RAD2DEG if h > 1e-9 else (90.0 if upc > 0 else -90.0)
    az = math.atan2(ec, nc) * RAD2DEG
    return normalize_azimuth(az), el


def topocentric_direction_to(target_rect, obs_rect, lat_deg, lon_deg):
    """Azimuth/elevation of target as seen from observer (no terrain).

    obs_rect is the observer position in MOON_ME meters; lat_deg/lon_deg
    is the observer's surface location used to build the local frame.
    """
    up, north, east = surface_vectors(lat_deg, lon_deg)
    rel = (target_rect[0] - obs_rect[0],
           target_rect[1] - obs_rect[1],
           target_rect[2] - obs_rect[2])
    v_local = vector_in_local(rel, up, north, east)
    return local_to_azimuth_elevation(v_local)


# Alias for older API
rect_to_latlon = rect_to_lat_lon