export const TILE_SIZE = 256
export const MIN_ZOOM = 2
export const MAX_ZOOM = 18
export const DEFAULT_ZOOM = 7

/** Midt i Danmark -- bruges, når et tomt kort skal vise noget nyttigt. */
export const DENMARK_CENTER = { lat: 56.1634, lng: 10.2036 }

/** Web Mercator kan ikke vise polerne; helt ud til 85° er rigeligt. */
export const MAX_MERCATOR_LATITUDE = 85.0511287798

export interface LatLng {
  lat: number
  lng: number
}

export interface MapView {
  center: LatLng
  zoom: number
}

export interface Size {
  width: number
  height: number
}

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom
}

export function clampLatitude(lat: number): number {
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat))
}

/** Breddegrad/længdegrad → position i verdenspixels ved den givne zoom. */
export function projectLatLng(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const size = worldSize(zoom)
  const x = ((lng + 180) / 360) * size
  const sin = Math.sin((clampLatitude(lat) * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
  return { x, y }
}

/** Verdenspixels ved den givne zoom → breddegrad/længdegrad. */
export function unprojectWorld(x: number, y: number, zoom: number): LatLng {
  const size = worldSize(zoom)
  const lng = (x / size) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / size
  const lat = (180 / Math.PI) * Math.atan((Math.exp(n) - Math.exp(-n)) / 2)
  return { lat, lng }
}

/** Ny center efter et pan med en forskydning i CSS-pixels. */
export function panView(view: MapView, dx: number, dy: number): MapView {
  const start = projectLatLng(view.center.lat, view.center.lng, view.zoom)
  const center = unprojectWorld(start.x - dx, start.y - dy, view.zoom)
  return { center, zoom: view.zoom }
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)))
}

/**
 * Zoom ind/ud med `delta` trin, så det punkt, der ligger under `point`
 * (CSS-pixels i kortet), bliver liggende under `point`.
 */
export function zoomViewAt(
  view: MapView,
  point: { x: number; y: number },
  delta: number,
  size: Size,
): MapView {
  const zoom = clampZoom(view.zoom + delta)
  if (zoom === view.zoom) return view
  const centerWorld = projectLatLng(view.center.lat, view.center.lng, view.zoom)
  const offsetX = point.x - size.width / 2
  const offsetY = point.y - size.height / 2
  const under = unprojectWorld(
    centerWorld.x + offsetX,
    centerWorld.y + offsetY,
    view.zoom,
  )
  const nextWorld = projectLatLng(under.lat, under.lng, zoom)
  const center = unprojectWorld(
    nextWorld.x - offsetX,
    nextWorld.y - offsetY,
    zoom,
  )
  return { center, zoom }
}

export interface ViewportTile {
  x: number
  y: number
  left: number
  top: number
}

export interface ViewportTiles {
  tiles: ViewportTile[]
  /** Verdenspixels for kortets øverste venstre hjørne. */
  topLeft: { x: number; y: number }
}

/** Udregn, hvilke tiles der fylder viewporten, og hvor de skal stå. */
export function tilesInView(view: MapView, size: Size): ViewportTiles {
  const zoom = view.zoom
  const maxTile = 2 ** zoom - 1
  const centerWorld = projectLatLng(view.center.lat, view.center.lng, zoom)
  const topLeft = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  }
  const tiles: ViewportTile[] = []
  const minX = Math.max(0, Math.floor(topLeft.x / TILE_SIZE))
  const maxX = Math.min(
    maxTile,
    Math.floor((topLeft.x + size.width) / TILE_SIZE),
  )
  const minY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE))
  const maxY = Math.min(
    maxTile,
    Math.floor((topLeft.y + size.height) / TILE_SIZE),
  )
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({
        x,
        y,
        left: x * TILE_SIZE - topLeft.x,
        top: y * TILE_SIZE - topLeft.y,
      })
    }
  }
  return { tiles, topLeft }
}

export interface LatLngBounds {
  north: number
  south: number
  east: number
  west: number
}

/** Bounds for et sæt observationer med position -- null, hvis ingen har én. */
export function boundsFor(
  points: LatLng[],
  paddingDegrees = 0,
): LatLngBounds | null {
  if (points.length === 0) return null
  let north = -Infinity
  let south = Infinity
  let east = -Infinity
  let west = Infinity
  for (const point of points) {
    north = Math.max(north, point.lat)
    south = Math.min(south, point.lat)
    east = Math.max(east, point.lng)
    west = Math.min(west, point.lng)
  }
  if (north - south < paddingDegrees) {
    const half = Math.max((paddingDegrees - (north - south)) / 2, 0.005)
    north += half
    south -= half
  }
  if (east - west < paddingDegrees) {
    const half = Math.max((paddingDegrees - (east - west)) / 2, 0.005)
    east += half
    west -= half
  }
  north = clampLatitude(north)
  south = clampLatitude(south)
  return { north, south, east, west }
}

/** En zoom, hvor `bounds` lige præcis er synlig med lidt luft omkring. */
export function fitView(
  bounds: LatLngBounds | null,
  size: Size,
  padding = 48,
): MapView {
  if (!bounds) return { center: DENMARK_CENTER, zoom: DEFAULT_ZOOM }
  const dX = ((bounds.east - bounds.west) / 360) * worldSize(0)
  const dY =
    projectLatLng(bounds.south, 0, 0).y - projectLatLng(bounds.north, 0, 0).y
  if (!Number.isFinite(dX) || !Number.isFinite(dY) || dX <= 0 || dY <= 0) {
    return {
      center: {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
      },
      zoom: 15,
    }
  }
  const scale = Math.min(
    (size.width - padding) / dX,
    (size.height - padding) / dY,
  )
  const zoom = clampZoom(Math.floor(Math.log2(scale)))
  return {
    center: {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    },
    zoom,
  }
}

/** OpenStreetMap-tile-URL. Kortet, der bruger den, skal vise attribution. */
export function osmTileUrl(x: number, y: number, z: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}
