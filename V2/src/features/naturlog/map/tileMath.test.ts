import { describe, expect, it } from 'vitest'
import {
  boundsFor,
  fitView,
  panView,
  projectLatLng,
  tilesInView,
  unprojectWorld,
  zoomViewAt,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE,
} from './tileMath'

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

describe('projectLatLng / unprojectWorld', () => {
  it('sætter (0,0) i verdens centrum ved zoom 0', () => {
    const { x, y } = projectLatLng(0, 0, 0)
    expect(round(x)).toBe(128)
    expect(round(y)).toBe(128)
  })

  it('projekterer en række kendte hjørner rigtigt', () => {
    const topLeft = projectLatLng(85.0511287798, -180, 0)
    expect(round(topLeft.x)).toBe(0)
    expect(round(topLeft.y)).toBe(0)
    const topRight = projectLatLng(85.0511287798, 180, 0)
    expect(round(topRight.x)).toBe(256)
    const bottomLeft = projectLatLng(-85.0511287798, -180, 0)
    expect(round(bottomLeft.y)).toBe(256)
  })

  it('fordobler verdensstørrelsen, når zoomen stiger med ét', () => {
    const a = projectLatLng(56, 10, 2)
    const b = projectLatLng(56, 10, 3)
    expect(round(b.x, 3)).toBe(round(a.x * 2, 3))
    expect(round(b.y, 3)).toBe(round(a.y * 2, 3))
  })

  it('rører frem og tilbage mellem lat/lng og verdenspixels', () => {
    for (let zoom = 0; zoom <= 10; zoom += 1) {
      const { x, y } = projectLatLng(56.22, 10.55, zoom)
      const back = unprojectWorld(x, y, zoom)
      expect(round(back.lat, 4)).toBe(56.22)
      expect(round(back.lng, 4)).toBe(10.55)
    }
  })

  it('klemmer breddegraden til Mercators grænse', () => {
    const top = projectLatLng(89, 0, 0)
    const clamped = projectLatLng(85.0511287798, 0, 0)
    expect(round(top.y, 4)).toBe(round(clamped.y, 4))
  })
})

describe('panView', () => {
  it('flytter centeret vestpå, når fingeren trækkes mod højre', () => {
    const view = { center: { lat: 56, lng: 10 }, zoom: 7 }
    const panned = panView(view, 256, 0)
    expect(panned.zoom).toBe(7)
    expect(panned.center.lng).toBeLessThan(10)
    const expectedShift = (360 / (TILE_SIZE * 2 ** 7)) * 256
    expect(round(panned.center.lng - 10, 6)).toBe(round(-expectedShift, 6))
  })

  it('flytter centeret østpå, når fingeren trækkes mod venstre', () => {
    const view = { center: { lat: 56, lng: 10 }, zoom: 7 }
    const panned = panView(view, -256, 0)
    expect(panned.center.lng).toBeGreaterThan(10)
  })

  it('bevarer breddegraden ved et rent vandret pan', () => {
    const view = { center: { lat: 56, lng: 10 }, zoom: 7 }
    expect(round(panView(view, 128, 0).center.lat, 6)).toBe(56)
  })
})

describe('zoomViewAt', () => {
  it('holder punktet under markøren fast', () => {
    const size = { width: 400, height: 300 }
    const view = { center: { lat: 56.2, lng: 10.5 }, zoom: 8 }
    const point = { x: 130, y: 90 }
    const zoomed = zoomViewAt(view, point, 1, size)

    const before = projectLatLng(view.center.lat, view.center.lng, view.zoom)
    const underBefore = unprojectWorld(
      before.x + (point.x - size.width / 2),
      before.y + (point.y - size.height / 2),
      view.zoom,
    )
    const nextCenter = projectLatLng(
      zoomed.center.lat,
      zoomed.center.lng,
      zoomed.zoom,
    )
    const underAfter = unprojectWorld(
      nextCenter.x + (point.x - size.width / 2),
      nextCenter.y + (point.y - size.height / 2),
      zoomed.zoom,
    )
    expect(round(underAfter.lat, 6)).toBe(round(underBefore.lat, 6))
    expect(round(underAfter.lng, 6)).toBe(round(underBefore.lng, 6))
    expect(zoomed.zoom).toBe(9)
  })

  it('klemmer zoomen fast ved grænserne', () => {
    const view = { center: { lat: 56, lng: 10 }, zoom: MAX_ZOOM }
    expect(
      zoomViewAt(view, { x: 1, y: 1 }, 1, { width: 400, height: 300 }).zoom,
    ).toBe(MAX_ZOOM)
    const low = { center: { lat: 56, lng: 10 }, zoom: MIN_ZOOM }
    expect(
      zoomViewAt(low, { x: 1, y: 1 }, -1, { width: 400, height: 300 }).zoom,
    ).toBe(MIN_ZOOM)
  })
})

describe('tilesInView', () => {
  it('udregner tiles, der dækker viewporten, med korrekte positioner', () => {
    const view = { center: { lat: 56.2, lng: 10.5 }, zoom: 8 }
    const size = { width: 514, height: 260 }
    const { tiles, topLeft } = tilesInView(view, size)
    const centerWorld = projectLatLng(56.2, 10.5, 8)
    expect(round(topLeft.x - (centerWorld.x - size.width / 2), 6)).toBe(0)

    const keys = new Set(tiles.map((t) => `${t.x}:${t.y}`))
    expect(keys.size).toBe(tiles.length)
    for (const tile of tiles) {
      expect(tile.left).toBeGreaterThanOrEqual(-TILE_SIZE)
      expect(tile.top).toBeGreaterThanOrEqual(-TILE_SIZE)
      expect(tile.left).toBeLessThan(size.width)
      expect(tile.top).toBeLessThan(size.height)
      expect(tile.x).toBeGreaterThanOrEqual(0)
      expect(tile.y).toBeGreaterThanOrEqual(0)
    }
    expect(
      (size.width / TILE_SIZE + 1) * (size.height / TILE_SIZE + 1),
    ).toBeGreaterThanOrEqual(tiles.length)
  })
})

describe('boundsFor & fitView', () => {
  it('bygger bounds omkring punkterne med lidt luft', () => {
    const bounds = boundsFor(
      [
        { lat: 56, lng: 10 },
        { lat: 57, lng: 11 },
      ],
      0.1,
    )
    expect(bounds).not.toBeNull()
    expect(bounds!.west).toBeLessThanOrEqual(10)
    expect(bounds!.east).toBeGreaterThanOrEqual(11)
    expect(bounds!.south).toBeLessThanOrEqual(56)
    expect(bounds!.north).toBeGreaterThanOrEqual(57)
  })

  it('vender tomme bounds om til standard-visningen', () => {
    const view = fitView(null, { width: 400, height: 300 })
    expect(view.zoom).toBe(7)
    expect(Math.abs(view.center.lat - 56.1634)).toBeLessThan(0.001)
  })

  it('falder tilbage på et enkelt punkt, når alle ligger samme sted', () => {
    const bounds = boundsFor([{ lat: 56.22, lng: 10.55 }])
    const view = fitView(bounds, { width: 400, height: 300 })
    expect(view.zoom).toBeGreaterThanOrEqual(12)
    expect(round(view.center.lat, 2)).toBe(56.22)
  })
})
