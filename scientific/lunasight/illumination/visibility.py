"""Terrain-aware visibility for Sun and Earth.

Combines the geometric body position (from the oracle/ephemeris) with
the precomputed horizon profile to determine whether the body is
blocked by terrain.

A body is terrain-visible at a given azimuth if its elevation is >= the
terrain horizon elevation at (interpolated) azimuth, using a defined
tolerance threshold.  Specular geometric visibility uses the spherical
geometric horizon (elevation >= 0).

The horizon profile azimuth convention matches the app: 0 deg = North,
90 deg = East, ...; elevation in deg above the local horizon plane
(reference sphere).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class VisibilityResult:
    body: str
    azimuth_deg: float
    elevation_deg: float
    geometric_visible: bool
    terrain_visible: Optional[bool]
    terrain_horizon_deg: Optional[float]
    clearance_deg: Optional[float]  # elevation - horizon (positive = visible)

    @property
    def state(self) -> str:
        if self.terrain_visible is None:
            return "VISIBLE" if self.geometric_visible else "BELOW HORIZON"
        if self.terrain_visible:
            return "VISIBLE"
        if self.elevation_deg < 0:
            return "BELOW HORIZON"
        return "OBSTRUCTED"


def interpolate_horizon(profile: np.ndarray, azimuth_deg: float,
                        azimuth_step_deg: float = 1.0) -> Optional[float]:
    """Linear-interpolate a horizon profile at a given azimuth.

    The profile covers azimuths 0, step, 2step, ... < 360.
    """
    n = profile.size
    if n == 0 or not np.isfinite(profile).any():
        return None
    if n == 1:
        return profile[0]
    step = 360.0 / n if azimuth_step_deg != 1.0 else azimuth_step_deg
    # Map azimuth into [0, 360)
    az = azimuth_deg % 360.0
    pos = az / step
    i0 = int(np.floor(pos)) % n
    i1 = (i0 + 1) % n
    frac = pos - np.floor(pos)
    a, b = profile[i0], profile[i1]
    if not np.isfinite(a) and not np.isfinite(b):
        return None
    if not np.isfinite(a):
        a = b
    if not np.isfinite(b):
        b = a
    return float(a * (1.0 - frac) + b * frac)


def visibility_for_body(body_name: str, azimuth_deg: float, elevation_deg: float,
                        horizon_profile: Optional[np.ndarray] = None,
                        horizon_step_deg: float = 1.0,
                        horizon_uncertainty_deg: float = 0.0) -> VisibilityResult:
    """Compute geometric + terrain visibility of a body at (az, el).

    horizon_profile: array of max terrain elevation by azimuth (deg).
    horizon_uncertainty_deg: optional margin added to the horizon (e.g.
        DEM uncertainty).  Visibility requires el >= horizon + margin.
    """
    geometric = elevation_deg >= 0.0
    terrain_visible = None
    horizon = None
    if horizon_profile is not None:
        horizon = interpolate_horizon(horizon_profile, azimuth_deg, horizon_step_deg)
        if horizon is None:
            terrain_visible = None
        else:
            threshold = horizon + horizon_uncertainty_deg
            terrain_visible = elevation_deg >= threshold
    clearance = None
    if horizon is not None:
        clearance = elevation_deg - horizon
    return VisibilityResult(
        body=body_name,
        azimuth_deg=azimuth_deg,
        elevation_deg=elevation_deg,
        geometric_visible=geometric,
        terrain_visible=terrain_visible,
        terrain_horizon_deg=horizon,
        clearance_deg=clearance,
    )