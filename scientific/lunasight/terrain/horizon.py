"""Terrain sampling and horizon profile generation from the LOLA DEMs.

A horizon profile maps azimuth (deg, 0=N, 90=E, ...) to the maximum
elevation angle (deg) of the terrain as seen from an observer point.
This is used for terrain-aware Sun/Earth visibility.

Algorithm
---------
For a given observer (lat, lon, elevation_m), we step outward to a
maximum radius R_max along 360 azimuths.  At each step we visit the
DEM pixel that lies along the azimuth, compute its elevation angle
above the observer (accounting for the spherical Moon curvature), and
keep the running maximum per azimuth.  The result is quantized to a
desired azimuth spacing (default 1 deg).

Elevation angle of a terrain point at horizontal distance d and height
difference dh above an observer on a sphere of radius R:

    Since both points lie on a sphere, the terrain point sits at
    spherical surface distance s = R * alpha (alpha = central angle).
    Horizontal distance in the local frame is approx R sin(alpha);
    the line-of-sight elevation angle is

        tan(el) = ( (R+h2) cos(alpha) - (R+h1) ) / ( (R+h2) sin(alpha) )

    where h2/h1 are the terrain/observer heights above the sphere.
    For small angles this reduces to tan(el) = (h2-h1)/d minus the
    curvature drop.  We implement the exact spherical formula so that
    the horizon reproduces the true geometric horizon angle for a
    smooth sphere (el < 0 beyond a few km on the Moon).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from lunasight.constants import MOON_MEAN_RADIUS_M
from lunasight.coordinates.projection import (
    lat_lon_to_spstereo,
    spstereo_to_lat_lon,
    DEG2RAD,
    RAD2DEG,
)


# --------------------------------------------------------------------------
# Raster sampling helpers
# --------------------------------------------------------------------------
class DemRaster:
    """Thin wrapper around a GeoTIFF DEM (rasterio)."""

    def __init__(self, path: str):
        import rasterio

        self.src = rasterio.open(path)
        self.width = self.src.width
        self.height = self.src.height
        self.transform = self.src.transform
        self.nodata = self.src.nodata
        self.crs = self.src.crs

    def sample_elevation(self, lat_deg, lon_deg, max_dist_m=None) -> Optional[float]:
        """Bilinear elevation at (lat, lon). Returns None if no data."""
        import rasterio

        x, y = lat_lon_to_spstereo(lat_deg, lon_deg)
        # pixel-relative col,row (rasterio projection is pixel era)
        col = (x - self.transform.c) / self.transform.a
        row = (y - self.transform.f) / self.transform.e
        vals = self.src.sample([(x, y)], 1)
        v = next(vals)[0]
        if v is None or (self.nodata is not None and np.isnan(v)):
            return None
        return float(v)

    def sample_height_grid(self, lat_deg: float, lon_deg: float,
                           half_width_m: float, res_m: float):
        """Extract a local elevation grid centered at (lat,lon) in meters.

        Returns (elev_m 2D array, grid_x_m, grid_y_m).
        """
        x0, y0 = lat_lon_to_spstereo(lat_deg, lon_deg)
        n = int(2 * half_width_m / res_m) + 1
        xs = x0 + np.linspace(-half_width_m, half_width_m, n)
        ys = y0 + np.linspace(-half_width_m, half_width_m, n)
        xx, yy = np.meshgrid(xs, ys)
        coords = np.stack([xx.ravel(), yy.ravel()], axis=1)
        vals = np.asarray([self.src.sample([(xx[i], yy[i])], 1) for i in range(len(xx))])
        elev = vals.reshape(n, n).astype(np.float32)
        return elev, xs, ys

    def close(self):
        self.src.close()


# --------------------------------------------------------------------------
# Horizon profile
# --------------------------------------------------------------------------
def _surface_elevation_of_pixel(x_m, y_m, dem: DemRaster) -> float:
    """Sample a pixel elevation at projected coordinate."""
    try:
        v = next(dem.src.sample([(x_m, y_m)], 1))[0]
    except Exception:
        return float("nan")
    return float(v)


def relative_elevation_angle(r_m: float, h_obs: float, h_terrain: float,
                             radius: float = MOON_MEAN_RADIUS_M) -> float:
    """Elevation angle (deg) of a terrain point at horizontal distance r_m.

    Using exact spherical geometry:
      alpha = r_m / R            (central angle, small)
      el = atan2( (R+h2) cos(alpha) - (R+h1), (R+h2) sin(alpha) )
    """
    alpha = r_m / radius
    R1 = radius + h_obs
    R2 = radius + h_terrain
    num = R2 * math.cos(alpha) - R1
    den = R2 * math.sin(alpha)
    if den < 1e-3:
        return math.copysign(90.0, num)
    return math.atan2(num, den) * RAD2DEG


def horizon_profile(dem: DemRaster, lat_deg: float, lon_deg: float,
                    elevation_m: float,
                    max_radius_m: float = 30_000.0,
                    radial_step_m: float = 100.0,
                    azimuth_step_deg: int = 1) -> np.ndarray:
    """Compute a terrain horizon profile for an observer.

    Returns an array of length 360//azimuth_step_deg with, for each
    azimuth (starting at 0 = North, going clockwise/East), the maximum
    terrain elevation angle in degrees (NaN where no terrain).

    Algorithm: for each azimuth, march outward from the observer in
    steps of radial_step_m up to max_radius_m.  The DEM is sampled via
    the map-projected positions.  To keep runtime acceptable the
    default sampling is coarse (100 m); set finer for high quality.
    """
    R = MOON_MEAN_RADIUS_M
    n_az = int(round(360.0 / azimuth_step_deg))
    profile = np.full(n_az, np.nan)
    x0, y0 = lat_lon_to_spstereo(lat_deg, lon_deg)

    n_steps = int(math.ceil(max_radius_m / radial_step_m))
    for iaz in range(n_az):
        az_deg = iaz * azimuth_step_deg
        # local east/north unit vectors (map projection plane):
        # +Y -> 0E, +X -> 90E.  For the map plane, azimuth 0 (N) is
        # toward lon=0E (local north has +y component), 90E is +x.
        # The projected map plane keeps the same metric locally for the
        # stereographic projection (conformal), so we can walk in map
        # X/Y using azimuth measured clockwise from +Y local:
        #   dx = r sin(az), dy = r cos(az)
        az = az_deg * DEG2RAD
        dir_x = math.sin(az)
        dir_y = math.cos(az)
        best = -90.0
        for k in range(1, n_steps + 1):
            r = k * radial_step_m
            x = x0 + dir_x * r
            y = y0 + dir_y * r
            # stop when outside the DEM extent
            if x < dem.transform.c or y < dem.transform.c or \
               x > dem.transform.c + int(abs(dem.transform.a)) * dem.width or \
               y > dem.transform.f + int(abs(dem.transform.e)) * dem.height:
                # Note: transform.f is top border; y grows *down* rows.
                break
            h = _surface_elevation_of_pixel(x, y, dem)
            if math.isnan(h) or h is None:
                continue
            el = relative_elevation_angle(r, elevation_m, h, R)
            if el > best:
                best = el
        profile[iaz] = best
    return profile


def smooth_profile(profile: np.ndarray, window: int = 3) -> np.ndarray:
    """Optional smoothing across azimuth. Circular smoothing."""
    if window <= 1:
        return profile
    kernel = np.ones(window) / window
    return np.convolve(np.concatenate([profile[-window + 1:], profile, profile[:window - 1]]),
                       kernel, mode="valid")[window - 1:1 - window + 1]


# --------------------------------------------------------------------------
# Horizon profile from local raster grid (vectorized; faster)
# --------------------------------------------------------------------------
def horizon_profile_grid(dem: DemRaster, lat_deg: float, lon_deg: float,
                         elevation_m: float,
                         half_extent_m: float = 30_000.0,
                         grid_res_m: float = 100.0,
                         azimuth_step_deg: float = 1.0) -> np.ndarray:
    """Vectorized horizon profile.

    Builds a local rectangular elevation grid in the map projection,
    computes the relative elevation angle of every cell as seen from
    the observer, and reduces to max-per-azimuth via atan2 on the
    local east/north offsets.
    """
    R = MOON_MEAN_RADIUS_M
    n_az = int(round(360.0 / azimuth_step_deg))
    x0, y0 = lat_lon_to_spstereo(lat_deg, lon_deg)
    # grid
    half = half_extent_m
    res = grid_res_m
    xs = x0 + np.arange(-half, half + res, res)
    ys = y0 + np.arange(-half, half + res, res)
    xx, yy = np.meshgrid(xs, ys)
    n = xx.size
    coords = np.stack([xx.ravel(), yy.ravel()], 1)
    vals = np.empty(n, dtype=np.float64)
    for i in range(n):
        try:
            v = next(dem.src.sample([(coords[i, 0], coords[i, 1])], 1))[0]
            vals[i] = v if not math.isnan(v) else np.nan
        except Exception:
            vals[i] = np.nan
    elev_grid = vals.reshape(xx.shape).astype(np.float64)

    # skip the observer pixel
    ddx = xx - x0
    ddy = yy - y0
    dist = np.hypot(ddx, ddy)
    okay = (dist > res * 0.5) & np.isfinite(elev_grid)
    if not okay.any():
        return np.full(n_az, np.nan)

    # elevation angles
    with np.errstate(divide="ignore", invalid="ignore"):
        alpha = dist / R
        num = (R + elev_grid) * np.cos(alpha) - (R + elevation_m)
        den = (R + elev_grid) * np.sin(alpha)
        el = np.degrees(np.arctan2(num, den))
    # azimuth per cell (0=N, 90=E): dig into map plane: dx along +90E, dy along 0E
    az_deg = np.degrees(np.arctan2(ddx[okay], ddy[okay])) % 360.0
    az_idx = np.floor(az_deg / azimuth_step_deg).astype(int) % n_az
    best = np.full(n_az, np.nan)
    for i in range(n_az):
        sel = el[okay][az_idx == i]
        if sel.size:
            best[i] = np.max(sel)
    return best