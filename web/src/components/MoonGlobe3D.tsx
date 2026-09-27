"use client"

// 3D "space view": the Moon as a globe, seen from above the south pole,
// with real LOLA terrain draped over the polar cap (the same colorized
// elevation image used as the 2D map's backdrop), catalog site markers,
// and — for the selected site — arrows showing the real direction to the
// Sun and to Earth, plus a tangent disc showing that site's local horizon
// plane. Clicking anywhere on the globe selects a site or, off the
// catalog, drops a custom analysis point — the same custom-point flow the
// 2D map uses, so picking a location no longer requires switching views.
//
// The 2D map is still the place for exact panning/zoom and for reading
// precise pixel-level terrain; this view is for orientation, spatial
// intuition, and quick selection. Nothing here computes new science —
// every position and direction is re-expressed from the same verified
// numbers already shown elsewhere (see lib/sci/threeGeometry.ts).
//
// Two approximations, stated plainly:
//  1) The Sun/Earth marker + light direction is computed from the
//     SELECTED site's topocentric az/el and drawn as if it applies
//     Moon-wide. Because the Sun and Earth are enormously far away
//     compared to the Moon's ~1,737 km radius, this introduces negligible
//     error (a fraction of a degree) and is only used for this 3D
//     orientation view — SitePanel's per-site numbers remain authoritative.
//  2) The polar-cap relief is vertically exaggerated (see
//     RELIEF_EXAGGERATION below) purely so real terrain is visible at
//     globe scale — true south-pole relief is only ~0.1–0.3% of the
//     Moon's radius and would look flat otherwise. The underlying
//     elevation values are real (LOLA 80 m/px), only the display scale
//     is stretched, and this is disclosed in the on-screen legend.

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { SITE_ROSTER } from "@/lib/sci/data"
import type { AnalysisPoint, SiteSnapshot } from "@/lib/sci/types"
import { unitPosition, localDirection, surfaceNormal } from "@/lib/sci/threeGeometry"
import { latLonToSpstereo, spstereoToLatLon, rectToLatLon, MOON_RADIUS_M } from "@/lib/sci/coordinates"

interface MoonGlobe3DProps {
  primary: AnalysisPoint | null
  compare: AnalysisPoint | null
  primarySnap: SiteSnapshot | null
  onSelectSite: (id: string) => void
  onCustomPoint: (lat: number, lon: number) => void
  /** Same elevation sampler page.tsx feeds the 2D map — reused here to
   *  build real (if vertically exaggerated) relief on the polar cap. */
  elevationAt: (lat: number, lon: number) => number | null
}

const MARKER_COLOR: Record<string, number> = {
  pgda: 0x5bb8ff,
  clps: 0xffb454,
  reference: 0x8b95a8,
}

// Matches the real coverage of /data/terrain/south_pole_elevation.png and
// the elevation probe grid (see SouthPoleMap.tsx's identical RWX_HALF).
const RWX_HALF_M = 304_000
const [CAP_MIN_LAT] = spstereoToLatLon(RWX_HALF_M, 0)
const RELIEF_EXAGGERATION = 18
const TERRAIN_TEXTURE_URL = "/data/terrain/south_pole_elevation.png"

export default function MoonGlobe3D({
  primary,
  compare,
  primarySnap,
  onSelectSite,
  onCustomPoint,
  elevationAt,
}: MoonGlobe3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // "Latest ref" pattern: kept current via an effect (not during render) so
  // the pointerdown handler registered once in the setup effect below can
  // always call the newest callbacks without re-registering the listener.
  const onSelectSiteRef = useRef(onSelectSite)
  const onCustomPointRef = useRef(onCustomPoint)
  const elevationAtRef = useRef(elevationAt)
  useEffect(() => {
    onSelectSiteRef.current = onSelectSite
    onCustomPointRef.current = onCustomPoint
    elevationAtRef.current = elevationAt
  })

  // Mutable scene refs so the render loop and click handler can reach the
  // latest objects without re-running the whole three.js setup on every
  // React re-render (that setup — renderer, controls — only needs to run once).
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    markerGroup: THREE.Group
    dynamicGroup: THREE.Group
    light: THREE.DirectionalLight
    markerMeshes: THREE.Mesh[]
    pickMeshes: THREE.Object3D[]
    raycaster: THREE.Raycaster
  } | null>(null)

  const [ready, setReady] = useState(false)

  // One-time three.js setup / teardown.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05060a)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(2.6, -2.2, -2.6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, -0.35)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.6
    controls.maxDistance = 8
    controls.update()

    // Starfield backdrop.
    scene.add(makeStarfield())

    // Base Moon sphere — a plain gray placeholder everywhere we don't have
    // high-res imagery loaded (only the south-polar cap, below, has real
    // LOLA terrain draped on it).
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x9aa2b5, roughness: 0.95, metalness: 0.02 }),
    )
    scene.add(moon)

    // Real LOLA terrain, draped over the polar cap this data actually
    // covers, with real (exaggerated-for-visibility) relief.
    const capGeometry = buildTerrainCap(elevationAtRef.current)
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
    const capMesh = new THREE.Mesh(capGeometry, capMaterial)
    scene.add(capMesh)
    new THREE.TextureLoader().load(TERRAIN_TEXTURE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      capMaterial.map = tex
      capMaterial.needsUpdate = true
    })

    // Latitude/longitude graticule for spatial reference near the pole.
    scene.add(makeGraticule())

    // Ambient fill so the far side isn't pure black.
    scene.add(new THREE.AmbientLight(0x30354a, 1.1))

    const light = new THREE.DirectionalLight(0xfff3d6, 1.4)
    light.position.set(1, 0, 0)
    scene.add(light)

    // Groups: markerGroup holds the (mostly static) catalog site markers;
    // dynamicGroup holds things rebuilt every time the primary selection
    // or snapshot changes (arrows, horizon disc, sun/earth glow sprites).
    const markerGroup = new THREE.Group()
    scene.add(markerGroup)
    const dynamicGroup = new THREE.Group()
    scene.add(dynamicGroup)

    const raycaster = new THREE.Raycaster()

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      markerGroup,
      dynamicGroup,
      light,
      markerMeshes: [],
      pickMeshes: [capMesh, moon],
      raycaster,
    }

    const resize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    let raf = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    // Click-to-select: a marker hit selects that site; otherwise a hit on
    // the globe itself (cap or base sphere) drops a custom analysis point
    // at that lat/lon — the same custom-point flow the 2D map uses, so
    // picking a location no longer requires switching views.
    let downX = 0
    let downY = 0
    const handlePointerDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const handlePointerUp = (ev: PointerEvent) => {
      // Ignore drags (orbit-rotate) — only treat a near-stationary
      // press-and-release as a "click" that picks a site or point.
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 4) return
      const s = sceneRef.current
      if (!s) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      s.raycaster.setFromCamera(ndc, s.camera)

      const markerHits = s.raycaster.intersectObjects(s.markerMeshes, false)
      if (markerHits.length > 0) {
        const id = markerHits[0].object.userData?.siteId as string | undefined
        if (id) onSelectSiteRef.current(id)
        return
      }

      const globeHits = s.raycaster.intersectObjects(s.pickMeshes, false)
      if (globeHits.length > 0) {
        const p = globeHits[0].point
        const [lat, lon] = rectToLatLon(p.x, p.y, p.z)
        onCustomPointRef.current(lat, lon)
      }
    }
    renderer.domElement.addEventListener("pointerdown", handlePointerDown)
    renderer.domElement.addEventListener("pointerup", handlePointerUp)

    setReady(true)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)
      renderer.domElement.removeEventListener("pointerup", handlePointerUp)
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          obj.geometry?.dispose?.()
          const mat = obj.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose?.()
        }
      })
      capMaterial.map?.dispose?.()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // Rebuild the static catalog site markers whenever selection changes
  // (colors/sizes depend on which site is primary/compare).
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.markerGroup.clear()
    s.markerMeshes = []

    for (const site of SITE_ROSTER) {
      const [x, y, z] = unitPosition(site.lat, site.lon)
      const isPrimary = primary?.kind === "site" && primary.id === site.id
      const isCompare = compare?.kind === "site" && compare.id === site.id
      const radius = isPrimary ? 0.028 : isCompare ? 0.024 : 0.016
      const color = isPrimary ? 0xffcf5c : isCompare ? 0x6fa8ff : MARKER_COLOR[site.cls] ?? 0x8b95a8
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isPrimary || isCompare ? 0.6 : 0.15 }),
      )
      mesh.position.set(x, y, z)
      mesh.userData.siteId = site.id
      s.markerGroup.add(mesh)
      s.markerMeshes.push(mesh)
    }

    // Custom (non-catalog) point, if that's what's selected.
    if (primary?.kind === "custom") {
      const [x, y, z] = unitPosition(primary.lat, primary.lon)
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffcf5c, emissive: 0xffcf5c, emissiveIntensity: 0.6 }),
      )
      mesh.position.set(x, y, z)
      s.markerGroup.add(mesh)
    }
  }, [primary, compare])

  // Rebuild the dynamic overlay (Sun/Earth arrows, horizon disc, glow
  // sprites, light direction) whenever the primary site or its snapshot changes.
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    disposeGroup(s.dynamicGroup)
    s.dynamicGroup.clear()

    if (!primary || !primarySnap) return

    const [px, py, pz] = unitPosition(primary.lat, primary.lon)
    const origin = new THREE.Vector3(px, py, pz)
    const normal = new THREE.Vector3(...surfaceNormal(primary.lat, primary.lon))

    // Local horizon disc, tangent to the globe at the selected site.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 48),
      new THREE.MeshBasicMaterial({ color: 0x5bb8ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    )
    disc.position.copy(origin).addScaledVector(normal, 0.02)
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    s.dynamicGroup.add(disc)
    const discEdge = new THREE.LineLoop(
      new THREE.EdgesGeometry(new THREE.CircleGeometry(0.16, 48)),
      new THREE.LineBasicMaterial({ color: 0x5bb8ff, transparent: true, opacity: 0.5 }),
    )
    discEdge.position.copy(disc.position)
    discEdge.quaternion.copy(disc.quaternion)
    s.dynamicGroup.add(discEdge)

    // Sun arrow + far glow sprite.
    const sunDir = new THREE.Vector3(
      ...localDirection(primary.lat, primary.lon, primarySnap.sun.azimuthDeg, primarySnap.sun.elevationDeg),
    ).normalize()
    s.dynamicGroup.add(
      new THREE.ArrowHelper(sunDir, origin, 0.42, 0xffcf5c, 0.06, 0.035),
    )
    const sunGlow = new THREE.Sprite(glowMaterial(0xffcf5c))
    sunGlow.scale.setScalar(0.55)
    sunGlow.position.copy(sunDir).multiplyScalar(3.6)
    s.dynamicGroup.add(sunGlow)

    // Earth arrow + far glow sprite.
    const earthDir = new THREE.Vector3(
      ...localDirection(primary.lat, primary.lon, primarySnap.earth.azimuthDeg, primarySnap.earth.elevationDeg),
    ).normalize()
    s.dynamicGroup.add(
      new THREE.ArrowHelper(earthDir, origin, 0.34, 0x6fa8ff, 0.05, 0.03),
    )
    const earthGlow = new THREE.Sprite(glowMaterial(0x6fa8ff))
    earthGlow.scale.setScalar(0.32)
    earthGlow.position.copy(earthDir).multiplyScalar(3.1)
    s.dynamicGroup.add(earthGlow)

    // Aim the scene light along the real Sun direction (see file-level note
    // on why this is a defensible Moon-wide approximation).
    s.light.position.copy(sunDir).multiplyScalar(5)
  }, [primary, primarySnap])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="globe-canvas h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--dim)]">
          Loading 3D view…
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 rounded bg-black/40 px-2 py-1.5 text-[10px] text-[var(--muted)] backdrop-blur-sm">
        <span>Drag to rotate · scroll to zoom · click a marker to select it, or click open ground for a custom point</span>
        <span className="flex flex-wrap items-center gap-3">
          <LegendDot color="#ffcf5c" label="Sun direction" />
          <LegendDot color="#6fa8ff" label="Earth direction" />
          <span>Textured cap: real LOLA terrain, relief ×{RELIEF_EXAGGERATION} for visibility</span>
        </span>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineLoop) {
      obj.geometry?.dispose?.()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose?.()
    }
    if (obj instanceof THREE.Sprite) {
      obj.material?.map?.dispose?.()
      obj.material?.dispose?.()
    }
  })
}

function glowMaterial(color: number): THREE.SpriteMaterial {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const hex = `#${color.toString(16).padStart(6, "0")}`
  grad.addColorStop(0, hex)
  grad.addColorStop(0.4, hex)
  grad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Builds a lat/lon grid mesh covering exactly the region the terrain PNG
 * and elevation probe grid cover (south pole to CAP_MIN_LAT), with:
 *  - vertex positions on the unit sphere, displaced outward by real
 *    elevation (exaggerated by RELIEF_EXAGGERATION for visibility), and
 *  - UV coordinates computed via the SAME polar-stereographic projection
 *    (latLonToSpstereo) used to generate /data/terrain/south_pole_elevation.png
 *    and to place it on the 2D map, so the texture lines up correctly.
 * Triangle winding was verified (see project notes) to produce
 * outward-facing normals for this lat/lon parameterization.
 */
function buildTerrainCap(elevationAt: (lat: number, lon: number) => number | null): THREE.BufferGeometry {
  const latSteps = 56
  const lonSteps = 144
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= latSteps; i++) {
    const lat = -90 + ((90 + CAP_MIN_LAT) * i) / latSteps
    for (let j = 0; j <= lonSteps; j++) {
      const lon = (360 * j) / lonSteps
      const elevM = elevationAt(lat, lon) ?? 0
      const radiusScale = 1 + (RELIEF_EXAGGERATION * elevM) / MOON_RADIUS_M
      const [ux, uy, uz] = unitPosition(lat, lon)
      positions.push(ux * radiusScale, uy * radiusScale, uz * radiusScale)

      const [xm, ym] = latLonToSpstereo(lat, lon)
      uvs.push(clamp01(0.5 + xm / (2 * RWX_HALF_M)), clamp01(0.5 - ym / (2 * RWX_HALF_M)))
    }
  }

  const cols = lonSteps + 1
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      const a = i * cols + j
      const b = a + cols
      const c = a + 1
      const d = b + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

function makeGraticule(): THREE.LineSegments {
  const positions: number[] = []
  const lats = [-60, -70, -80]
  const steps = 96
  for (const lat of lats) {
    for (let i = 0; i < steps; i++) {
      const lon0 = (360 * i) / steps
      const lon1 = (360 * (i + 1)) / steps
      const [x0, y0, z0] = unitPosition(lat, lon0)
      const [x1, y1, z1] = unitPosition(lat, lon1)
      positions.push(x0, y0, z0, x1, y1, z1)
    }
  }
  const meridianSteps = 24
  for (let lon = 0; lon < 360; lon += 30) {
    for (let i = 0; i < meridianSteps; i++) {
      const lat0 = -90 + (30 * i) / meridianSteps
      const lat1 = -90 + (30 * (i + 1)) / meridianSteps
      const [x0, y0, z0] = unitPosition(lat0, lon)
      const [x1, y1, z1] = unitPosition(lat1, lon)
      positions.push(x0, y0, z0, x1, y1, z1)
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({ color: 0x2a3450, transparent: true, opacity: 0.6 })
  return new THREE.LineSegments(geom, mat)
}

function makeStarfield(): THREE.Points {
  const count = 1200
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 30 + Math.random() * 20
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, sizeAttenuation: true })
  return new THREE.Points(geom, mat)
}
