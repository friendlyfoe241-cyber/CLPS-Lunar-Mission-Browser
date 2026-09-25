"""Catalog of lunar south-pole sites available in LunaSight.

Every site has a `source` description and a `coordinate_source` string
explaining where the coordinates come from.  We only include sites with
documented/verifiable coordinates.  No fabricated coordinates.

Coordinate conventions: planetocentric latitude (-90 = south pole),
planetocentric east longitude in [-180, 180).  "east0" shows the same
longitude in [0, 360) for display.

Sources:
* PGDA (NASA GSFC Planetary Geodesy & Altimetry Laboratory) high
  resolution LOLA 5 m/pix site DEMs.  The center of each site tile is
  computed by reprojecting the tile's map-projected center with the
  verified IAU 30135 <-> lat/lon transform (analytic, validated to
  machine precision against pyproj).
* NASA Artemis III candidate regions list (RELEASE22-089) -- the region
  names only; representative site point is the PGDA tile center that
  falls inside the region.
* LROC IM-2 landing site published coordinates (-84.78, 29.13E).

The `dem` field references a preprocessed runtime asset (see
scientific/output/sites/<site>/) used for high-resolution local
analysis.  `base_dem` is always the PGDA LDEM_80S_80MPP_ADJ COG.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import List, Optional


@dataclass(frozen=True)
class LunarSite:
    id: str
    name: str
    lat: float                 # planetocentric, deg, -90 = south pole
    lon: float                 # deg, [-180, 180)
    description: str
    coordinate_source: str
    site_class: str            # "artemis-region" | "clps" | "pgda" | "reference"
    # region name from NASA candidate regions when applicable
    region: Optional[str] = None
    # PGDA site tile id used for high-res local DEM (optional)
    pgda_tile: Optional[str] = None

    @property
    def lon_east0(self) -> float:
        return self.lon % 360.0


# Reference sites (spacecraft / landmarks with published coordinates)
# -------------------------------------------------------------------
TRUSTED_SITES: List[LunarSite] = [
    LunarSite(
        id="shackleton-rim",
        name="Peak Near Shackleton (Site 07)",
        lat=-88.811,
        lon=123.690,
        description=("High-priority Artemis region near the rim of "
                     "Shackleton crater; the LOLA Site 07 local DEM "
                     "center."),
        coordinate_source=("Center of NASA GSFC/PGDA Site07 LOLA 5 m/pix DEM tile "
                           "(Site07_final_adj_5mpp_surf.tif), reprojected from "
                           "its IAU 30135 polar stereographic origin."),
        site_class="pgda",
        region="Peak Near Shackleton",
        pgda_tile="Site07",
    ),
    LunarSite(
        id="connecting-ridge",
        name="Connecting Ridge (Site 01)",
        lat=-89.463,
        lon=-137.490,
        description=("Connecting ridge between Shackleton and de Gerlache; "
                     "Site 01 of Mazarico et al. 2011, IM-2 skin also near. "
                     "Tile center of PGDA Site01 DEM."),
        coordinate_source=("Center of NASA GSFC/PGDA Site01 LOLA 5 m/pix DEM tile."),
        site_class="pgda",
        region="Connecting Ridge",
        pgda_tile="Site01",
    ),
    LunarSite(
        id="shackleton-near",
        name="Shackleton Rim (Site 04)",
        lat=-89.767,
        lon=-171.870,
        description=("Site 04 of Mazarico et al. 2011: rim segment of "
                     "Shackleton crater."),
        coordinate_source=("Center of NASA GSFC/PGDA Site04 LOLA 5 m/pix DEM tile."),
        site_class="pgda",
        region="Shackleton rim",
        pgda_tile="Site04",
    ),
    LunarSite(
        id="de-gerlache-rim",
        name="de Gerlache Rim (Site 11)",
        lat=-88.683,
        lon=-67.932,
        description=("Rim segment of de Gerlache crater; Artemis candidate "
                     "region 'de Gerlache Rim 1/2'."),
        coordinate_source=("Center of NASA GSFC/PGDA Site11 LOLA 5 m/pix DEM tile."),
        site_class="pgda",
        region="de Gerlache Rim",
        pgda_tile="Site11",
    ),
    LunarSite(
        id="nobile-rim-1",
        name="Nobile Rim 1 (Site 06)",
        lat=-85.438,
        lon=37.367,
        description=("Nobile crater rim, Artemis candidate region "
                     "'Nobile Rim 1'."),
        coordinate_source=("Center of NASA GSFC/PGDA Site06 LOLA 5 m/pix DEM tile."),
        site_class="pgda",
        region="Nobile Rim 1",
        pgda_tile="Site06",
    ),
    LunarSite(
        id="leibnitz-beta",
        name="Leibnitz Beta Plateau (Site 20)",
        lat=-85.427,
        lon=31.743,
        description=("High-standing plateau bounded by Leibnitz and Beta "
                     "craters; Artemis candidate region 'Leibnitz Beta "
                     "Plateau'."),
        coordinate_source=("Center of NASA GSFC/PGDA Site20 LOLA 5 m/pix DEM tile."),
        site_class="pgda",
        region="Leibnitz Beta Plateau",
        pgda_tile="Site20",
    ),
    LunarSite(
        id="malapert-massif",
        name="Malapert Massif (Site 23)",
        lat=-85.995,
        lon=-0.235,
        description=("Malapert Massif, a high plateau ~120 km from the "
                     "south pole with ~5 km peaks; Artemis candidate "
                     "region 'Malapert Massif'."),
        coordinate_source=("Center of NASA GSFC/PGDA Site23 LOLA 5 m/pix DEM tile "
                           "(Site23_final_adj_5mpp_surf.tif), reprojected."),
        site_class="pgda",
        region="Malapert Massif",
        pgda_tile="Site23",
    ),
    LunarSite(
        id="mons-mouton-im2",
        name="Mons Mouton / IM-2 (Athena)",
        lat=-84.78,
        lon=29.13,
        description=("Intuitive Machines IM-2 Athena intended landing site "
                     "on Mons Mouton, a lunar plateau ~160 km from the "
                     "south pole (LROC)."),
        coordinate_source=("Published LROC (lroc.im-ldi.com / NASA GSFC/Arizona "
                           "State University) IM-2 intended landing site "
                           "(-84.78, 29.13E)."),
        site_class="clps",
        region="Mons Mouton",
    ),
    LunarSite(
        id="malapert-a-im1",
        name="Malapert A / IM-1 (Odysseus)",
        lat=-80.30,
        lon=14.41,
        description=("Intuitive Machines IM-1 Odysseus landing site near "
                     "Malapert A crater (~80S, 14.4E)."),
        coordinate_source=("Published IM-1 landing coordinates (Malapert A "
                           "crater, -80.13S, 14.41E per orbitcodex/LROC "
                           "public reporting); approximate with caution."),
        site_class="clps",
        region="Malapert A",
    ),
    LunarSite(
        id="south-pole",
        name="Lunar South Pole (reference)",
        lat=-90.0,
        lon=0.0,
        description=("The lunar south pole point itself (reference)."),
        coordinate_source=("Definition (planetocentric lat -90)."),
        site_class="reference",
        region=None,
    ),
    LunarSite(
        id="shackleton-centre",
        name="Shackleton Crater centre",
        lat=-89.67,
        lon=0.0,
        description=("Approximate centre of Shackleton crater; a reference "
                     "location commonly used for illumination studies. "
                     "Historic value; use with caution."),
        coordinate_source=("Approximate published centre of Shackleton "
                           "(e.g., LPI/USGS gazetteer)."),
        site_class="reference",
        region="Shackleton",
    ),
]

SITES_BY_ID: dict = {s.id: s for s in TRUSTED_SITES}

DEM_TILE_DIR = {
    s.id: f"/sites/{s.pgda_tile}/" if s.pgda_tile else None
    for s in TRUSTED_SITES
}


def get_site(site_id: str) -> Optional[LunarSite]:
    return SITES_BY_ID.get(site_id)


def all_sites() -> List[LunarSite]:
    return TRUSTED_SITES