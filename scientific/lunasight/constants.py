"""Physical and coordinate constants for the LunaSight scientific pipeline.

All constants are drawn from authoritative references:

* Moon reference radius: IAU/IAG 2015 report (Archinal et al., 2018),
  radius 1737.4 km (1737400.0 m). This is the sphere used by the
  IAU 30135 / "Moon (2015) - Sphere / Ocentric / South Polar" CRS that
  the LOLA south-pole DEMs are delivered in.
* Coordinate system: IAU mean Earth / polar axis (ME) system, realised
  in SPICE as the frame MOON_ME (FRAME id 31001), aligned with DE421.
* Elevation reference: DEM surface height is measured relative to the
  IAU reference sphere above, i.e. height about the centre of mass.
* Time: all science calculations use TDB internally; UTC is the input
  and display standard.

Latitude convention: planetographic (planetocentric for a sphere they
coincide) latitude, positive north, i.e. -90 at lunar south pole.
Longitude convention: planetocentric east longitude, 0..360 or -180..180.
Azimuth convention used throughout the app:
  0 = North, 90 = East, 180 = South, 270 = West, measured clockwise
  from +North in the local horizon plane.
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Lunar reference sphere
# --------------------------------------------------------------------------
MOON_MEAN_RADIUS_M = 1737400.0  # IAU 2015 (Archinal et al. 2018), meters
MOON_MEAN_RADIUS_KM = 1737.4

# Reference longitudes note: pgda / LOLA DEMs are delivered in
# MOON_ME (DE421) coordinates. For the DEM CRS, longitude_east=0 lies
# along the mean Earth direction.

# --------------------------------------------------------------------------
# Astronomical constants (IAU 2015 / DE421-consistent values)
# --------------------------------------------------------------------------
# Solar irradiance at 1 au, W/m^2 (a IAU nominal value; actual varies
# with Sun-Moon distance).
SOLAR_CONSTANT_W_M2 = 1361.0  # Kopp & Lean 2011 nominal total solar irradiance

ASTRO_UNIT_M = 1.495978707e11  # IAU 2012 definition

# --------------------------------------------------------------------------
# Serialization / provenance
# --------------------------------------------------------------------------
DATA_VERSION = "0.1.0"