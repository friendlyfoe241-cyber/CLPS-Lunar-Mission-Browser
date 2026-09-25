"""Site analysis orchestration.

Performs a full site analysis at a given UTC time:

  Sun geometry (azimuth/elevation/incidence, geometric visibility)
  Earth geometry (azimuth/elevation, geometric visibility)
  Terrain-aware visibility using a precomputed or generated horizon
  Illumination state
  DTE geometric visibility
  Estimated solar generation (generic panel model)

The results carry a "provenance" classification: SOURCE for data taken
directly from NASA products, DERIVED for values computed from source
data, ESTIMATED for model-based values.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional, List

import numpy as np

from lunasight.ephemeris import spice_geometry as sg
from lunasight.illumination.visibility import (
    VisibilityResult,
    visibility_for_body,
)
from lunasight.illumination.solar import SolarPanelConfig, estimated_power_watts, solar_irradiance
from lunasight.coordinates.projection import lat_lon_to_spstereo, spstereo_to_lat_lon


@dataclass
class MiniPanels:
    """All panels shown in the site panel with their classifications."""

    sun_azimuth: str = "DERIVED"
    sun_elevation: str = "DERIVED"
    sun_incidence: str = "DERIVED"
    earth_azimuth: str = "DERIVED"
    earth_elevation: str = "DERIVED"
    terrain_horizon: str = "DERIVED"
    dte: str = "DERIVED"
    power: str = "ESTIMATED"
    lighting: str = "DERIVED"


def build_epoch_list(start_et: float, stop_et: float, step_sec: float) -> np.ndarray:
    n = int(np.floor((stop_et - start_et) / step_sec)) + 1
    return start_et + np.arange(n) * step_sec


def analyze_site(lat_deg: float, lon_deg: float, dem_elevation_m: float,
                 et: float,
                 horizon_profile: Optional[np.ndarray] = None,
                 horizon_step_deg: float = 1.0,
                 panel: Optional[SolarPanelConfig] = None,
                 horizon_uncertainty_deg: float = 0.0) -> dict:
    """Analyze a single site at a single epoch.

    Returns a dict with all derived values plus classifications.
    """
    sun = sg.sun_geometry(et, lat_deg, lon_deg, dem_elevation_m)
    earth = sg.earth_geometry(et, lat_deg, lon_deg, dem_elevation_m)

    sun_vis = visibility_for_body("sun", sun.azimuth_deg, sun.elevation_deg,
                                  horizon_profile, horizon_step_deg,
                                  horizon_uncertainty_deg)
    earth_vis = visibility_for_body("earth", earth.azimuth_deg, earth.elevation_deg,
                                    horizon_profile, horizon_step_deg,
                                    horizon_uncertainty_deg)

    if panel is None:
        panel = SolarPanelConfig()
    power_w = estimated_power_watts(sun.elevation_deg, sun.distance_km * 1000.0, panel)
    irradiance = solar_irradiance(sun.distance_km * 1000.0)

    # DTE geometric visibility definition: Earth above geometric horizon
    # and, where modeled, not obstructed by terrain.
    dte_geometric = earth.visible_geometric
    dte_terrain = earth_vis.terrain_visible if horizon_profile is not None else None

    return {
        "utc": sg.et_to_utc(et),
        "et": et,
        "lat": lat_deg,
        "lon": lon_deg,
        "elevation_m": dem_elevation_m,
        "sun": {
            "azimuth_deg": sun.azimuth_deg,
            "elevation_deg": sun.elevation_deg,
            "incidence_deg": sun.incidence_deg,
            "geometric_visible": sun.visible_geometric,
            "terrain_visible": sun_vis.terrain_visible,
            "terrain_horizon_deg": sun_vis.terrain_horizon_deg,
            "clearance_deg": sun_vis.clearance_deg,
            "state": sun_vis.state,
            "distance_km": sun.distance_km,
        },
        "earth": {
            "azimuth_deg": earth.azimuth_deg,
            "elevation_deg": earth.elevation_deg,
            "geometric_visible": earth.visible_geometric,
            "terrain_visible": earth_vis.terrain_visible,
            "terrain_horizon_deg": earth_vis.terrain_horizon_deg,
            "clearance_deg": earth_vis.clearance_deg,
            "state": earth_vis.state,
            "distance_km": earth.distance_km,
        },
        "dte": {
            "geometric_visible": dte_geometric,
            "terrain_visible": dte_terrain,
        },
        "illumination": {
            "lit": sun_vis.terrain_visible if horizon_profile is not None else sun.visible_geometric,
            "sunlight_on_surface": sun.visible_geometric,
        },
        "solar": {
            "irradiance_wm2": irradiance,
            "incidence_factor": max(0.0, np.sin(np.radians(max(sun.elevation_deg, 0)))),
            "power_w": power_w,
            "panel": asdict(panel),
        },
        "classifications": asdict(MiniPanels()),
    }


def analyze_site_series(lat_deg, lon_deg, dem_elevation_m, start_et, stop_et,
                        step_sec, horizon_profile=None,
                        horizon_step_deg=1.0,
                        panel=None,
                        progress=None) -> List[dict]:
    """Run analyze_site over an epoch series (returns list of dicts)."""
    ets = build_epoch_list(start_et, stop_et, step_sec)
    out = []
    for i, et in enumerate(ets):
        out.append(analyze_site(lat_deg, lon_deg, dem_elevation_m, et,
                                horizon_profile, horizon_step_deg, panel))
        if progress:
            progress(i, len(ets))
    return out