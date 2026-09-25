"""SPICE-based ephemeris and geometry for the LunaSight pipeline.

Kernels used (see scientific/data/kernels/README.md and
docs/ARCHITECTURE.md):

* de421.bsp                     -- JPL DE421 planetary ephemeris
* naif0012.tls                  -- leap seconds kernel
* moon_080317.tf                -- lunar reference frames (MOON_ME)
* moon_pa_de421_1900-2050.bpc   -- DE421 lunar orientation (physical libration)

All state vectors are computed with respect to the lunar body centre in
the MOON_ME (DE421) body-fixed frame, using SPICE.

Time convention: the science core uses SPICE ephemeris seconds past J2000
(ET/TDB).  The public API accepts UTC datetime strings / datetimes and
converts internally.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

from lunasight.constants import MOON_MEAN_RADIUS_M

import numpy as np

try:
    import spiceypy as spice
except ImportError:  # pragma: no cover
    spice = None


FRAME = "MOON_ME"
SUN_ID = "SUN"
EARTH_ID = "EARTH"
MOON_ID = "MOON"


class KernelsNotLoadedError(RuntimeError):
    pass


def furnish_kernels(kernel_paths):
    """Furnish SPICE kernels. Should be called once at startup."""
    if spice is None:
        raise ImportError("spiceypy is required for ephemeris calculations")
    for p in kernel_paths:
        spice.furnsh(str(p))


def utc_to_et(utc_str: str) -> float:
    """UTC datetime string (ISO-8601) to SPICE ET (seconds past J2000 TDB)."""
    if spice is None:
        raise ImportError("spiceypy is required")
    return spice.str2et(utc_str)


def utc_to_et_from_datetime(dt_utc: datetime) -> float:
    """Convert a timezone-aware datetime (UTC) to SPICE ET."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    dt_utc = dt_utc.astimezone(timezone.utc)
    return spice.str2et(dt_utc.strftime("%Y-%m-%dT%H:%M:%S.%f") + " UTC")


def et_to_utc(et: float) -> str:
    """SPICE ET to ISO-8601 UTC string."""
    return spice.et2utc(et, "ISOC", 3)


# --------------------------------------------------------------------------
# State vectors
# --------------------------------------------------------------------------
def sun_position_moon_me(et: float) -> np.ndarray:
    """Sun position (km) relative to the Moon, MOON_ME frame."""
    return np.asarray(spice.spkpos(SUN_ID, et, FRAME, "LT+S", MOON_ID)[0])


def earth_position_moon_me(et: float) -> np.ndarray:
    """Earth position (km) relative to the Moon, MOON_ME frame."""
    return np.asarray(spice.spkpos(EARTH_ID, et, FRAME, "LT+S", MOON_ID)[0])


def moon_phase_angle(et: float) -> float:
    """Sub-observer longitude convention check: Earth longitude of Moon."""
    pos = earth_position_moon_me(et)
    lon = math.degrees(math.atan2(pos[1], pos[0]))
    return (lon + 360.0) % 360.0


def sub_solar_lat_lon(et: float) -> tuple:
    """Planetocentric (lat, lon) of the sub-solar point on the sphere."""
    pos = sun_position_moon_me(et) * 1000.0  # km -> m
    return rect_to_lat_lon_tuple(pos)


def sub_earth_lat_lon(et: float) -> tuple:
    """Planetocentric (lat, lon) of the sub-Earth point on the sphere."""
    pos = earth_position_moon_me(et) * 1000.0
    return rect_to_lat_lon_tuple(pos)


def rect_to_lat_lon_tuple(xyz_m: np.ndarray) -> tuple:
    from lunasight.coordinates.projection import normalize_lon, RAD2DEG

    x, y, z = xyz_m
    r = math.sqrt(x * x + y * y + z * z)
    lat = math.asin(z / r) * RAD2DEG
    lon = math.atan2(y, x) * RAD2DEG
    return lat, normalize_lon(lon)


# --------------------------------------------------------------------------
# Observer geometry
# --------------------------------------------------------------------------
@dataclass
class BodyGeometry:
    """Sun or Earth geometry at a site/time."""

    name: str
    azimuth_deg: float   # 0=N 90=E 180=S 270=W
    elevation_deg: float  # degrees above geometric local horizon
    incidence_deg: float  # angle between target direction and local up (0=overhead)
    visible_geometric: bool  # elevation above geometric horizon
    distance_km: float
    sub_observer_lat: float = float("nan")
    sub_observer_lon: float = float("nan")

    @property
    def geometric(self) -> bool:
        return self.visible_geometric


def observer_position(lat_deg: float, lon_deg: float,
                      elevation_m: float = 0.0) -> np.ndarray:
    """Observer position in MOON_ME meters.

    latitude: planetocentric, deg
    longitude: planetocentric, deg east
    elevation_m: surface height above the IAU sphere (from the DEM),
                 meters.
    """
    radius = MOON_MEAN_RADIUS_M + elevation_m
    from lunasight.coordinates.projection import lat_lon_to_rect

    xyz = lat_lon_to_rect(lat_deg, lon_deg, radius)
    return np.asarray(xyz)


def body_geometry(body_id: str, et: float, lat_deg: float, lon_deg: float,
                  elevation_m: float = 0.0) -> BodyGeometry:
    """Compute Sun or Earth geometry for an observer at (lat, lon).

    body_id: "SUN" or "EARTH".
    Returns azimuth/elevation/incidence in the local horizon frame,
    together with geometric visibility (relative to the ideal spherical
    horizon, ignoring terrain).
    """
    from lunasight.coordinates.projection import (
        surface_vectors,
        vector_in_local,
        local_to_azimuth_elevation,
        lat_lon_to_rect,
    )

    body_pos_km = (sun_position_moon_me(et) if body_id == SUN_ID
                   else earth_position_moon_me(et))
    body_pos_m = body_pos_km * 1000.0
    obs = observer_position(lat_deg, lon_deg, elevation_m)
    rel = body_pos_m - obs
    up, north, east = surface_vectors(lat_deg, lon_deg, MOON_MEAN_RADIUS_M)
    v_local = vector_in_local(rel, up, north, east)
    az, el = local_to_azimuth_elevation(v_local)
    # incidence = angle between the (upward) direction to the body and
    # the local zenith = 90 - elevation for a spherical horizon.
    incidence = 90.0 - el
    distance_km = float(np.linalg.norm(rel) / 1000.0)
    if body_id == SUN_ID:
        slat, slon = sub_solar_lat_lon(et)
    else:
        slat, slon = sub_earth_lat_lon(et)
    return BodyGeometry(
        name=body_id.lower(),
        azimuth_deg=az,
        elevation_deg=el,
        incidence_deg=incidence,
        visible_geometric=el >= 0.0,
        distance_km=distance_km,
        sub_observer_lat=slat,
        sub_observer_lon=slon,
    )


def sun_geometry(et: float, lat_deg: float, lon_deg: float,
                 elevation_m: float = 0.0) -> BodyGeometry:
    return body_geometry(SUN_ID, et, lat_deg, lon_deg, elevation_m)


def earth_geometry(et: float, lat_deg: float, lon_deg: float,
                   elevation_m: float = 0.0) -> BodyGeometry:
    return body_geometry(EARTH_ID, et, lat_deg, lon_deg, elevation_m)