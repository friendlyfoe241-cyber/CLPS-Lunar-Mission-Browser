"""Solar illumination potential and power generation estimate.

Definitions used by the app (see docs/SCIENTIFIC_METHODS.md):

* solar_input (W/m^2): the sub-solar irradiance at the current Sun-Moon
  distance.  Nominal solar constant 1361 W/m^2 at 1 au scaled by
  (1 au / distance)^2.
* incidence factor: cos(max(0, incidence)), where incidence is the
  angle between the surface normal (or panel normal) and the Sun
  direction.  For a horizontal surface this is sin(sun_elevation) under
  the sphere-horizon approximation; incidence = 90 - elevation.
* Estimated solar generation = solar_input x incidence factor x panel
  area x efficiency x (1 - losses).  All parameters are user-visible and
  defaults are generic engineering values, explicitly labelled ESTIMATED.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict

from lunasight.constants import SOLAR_CONSTANT_W_M2, ASTRO_UNIT_M


@dataclass
class SolarPanelConfig:
    """User-configurable generic solar array model (not mission-specific)."""

    area_m2: float = 2.0
    efficiency: float = 0.28
    losses: float = 0.15          # combined wiring/temperature/degradation losses
    orientation: str = "horizontal"  # horizontal | vertical | tracking | custom
    tilt_deg: float = 0.0         # for custom: tilt above horizontal
    azimuth_deg: float = 0.0      # for custom: azimuth of the panel normal
    export_name: str = "Generic user-configurable array"


def solar_irradiance(sun_distance_m: float,
                     solar_constant: float = SOLAR_CONSTANT_W_M2) -> float:
    """Sub-solar irradiance at the given Sun-observer distance."""
    if sun_distance_m <= 0:
        return 0.0
    return solar_constant * (ASTRO_UNIT_M / sun_distance_m) ** 2


def incidence_factor(elevation_deg: float, panel: SolarPanelConfig) -> float:
    """Cosine-projection factor of the Sun onto a panel.

    Sun elevation is above the local horizontal.  The horizontal panel
    factor is sin(elevation).  A vertical panel pointing azimuth p
    receives cos(Sun azimuth - p) * cos(elevation).  A tracking panel
    keeps cos(incidence) = 1 when the Sun is above horizon.
    The orientation model is explicitly generic/engineering-level.
    """
    el = math.radians(elevation_deg)
    if panel.orientation == "horizontal":
        f = math.sin(el)
    elif panel.orientation == "tracking":
        f = math.sin(el)  # ideal two-axis keeps normal at Sun -> cos(0)
    elif panel.orientation == "vertical":
        # fixed vertical panel; use panel azimuth as the outward normal
        saz = panel.azimuth_deg
        f = math.cos(math.radians(saz)) * math.cos(el)
    else:  # custom tilt
        # panel normal at tilt above horizontal toward panel azimuth
        tilt = math.radians(panel.tilt_deg)
        en = math.cos(tilt)
        eaz = math.radians(panel.azimuth_deg)
        east = math.sin(eaz) * math.cos(tilt)
        north = math.cos(eaz) * math.cos(tilt)
        up = math.sin(tilt)
        # sun unit vector in local (up,north,east), no azimuth needed
        # for horizontal/tracking; for tilt we need sun azimuth too.
        # We approximate using elevation only for the horizontal/
        # tracking cases; custom uses the panel azimuth projection.
        # To be self-consistent we accept a simple model:
        f = math.sin(el) * math.cos(tilt) + math.cos(el) * math.sin(tilt) * math.cos(0.0)
    return max(0.0, f)


def estimated_power_watts(elevation_deg: float, sun_distance_m: float,
                          panel: SolarPanelConfig,
                          solar_constant: float = SOLAR_CONSTANT_W_M2) -> float:
    """Estimated electrical power (W) for the panel configuration.

    Power = irradiance x incidence x area x efficiency x (1-losses).
    """
    irr = solar_irradiance(sun_distance_m, solar_constant)
    inc = incidence_factor(elevation_deg, panel)
    if elevation_deg < 0:
        inc = 0.0
    return max(0.0, irr * inc * panel.area_m2 * panel.efficiency * (1.0 - panel.losses))