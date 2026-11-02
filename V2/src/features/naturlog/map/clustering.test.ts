import { describe, expect, it } from 'vitest'
import { clusterPoints, type PositionedObservation } from './clustering'

const payload = 'art'

function point(
  id: string,
  lat: number,
  lng: number,
): PositionedObservation<string> {
  return { id, lat, lng, payload }
}

describe('clusterPoints', () => {
  it('samler observationer, der deler en celle, uden at røre andre', () => {
    const clusters = clusterPoints(
      [
        point('a', 56.22, 10.55),
        point('b', 56.221, 10.551),
        point('c', 57.5, 9.5),
      ],
      5,
      56,
    )
    expect(clusters).toHaveLength(2)
    const cluster = clusters.find((c) => c.kind === 'cluster')
    expect(cluster).toBeDefined()
    if (cluster?.kind === 'cluster') {
      expect(cluster.count).toBe(2)
      expect(cluster.observations.map((o) => o.id).sort()).toEqual(['a', 'b'])
    }
    const alone = clusters.find((c) => c.kind === 'point')
    expect(alone?.kind).toBe('point')
    if (alone?.kind === 'point') expect(alone.observation.id).toBe('c')
  })

  it('skiller klyngen ad, når man zoomer ind', () => {
    const close = [point('a', 56.22, 10.55), point('b', 56.221, 10.551)]
    const atLowZoom = clusterPoints(close, 5, 56)
    expect(atLowZoom.filter((c) => c.kind === 'cluster')).toHaveLength(1)

    const atHighZoom = clusterPoints(close, 17, 56)
    expect(atHighZoom.filter((c) => c.kind === 'cluster')).toHaveLength(0)
    expect(atHighZoom).toHaveLength(2)
  })

  it('lader observationer, der ligger langt fra hinanden, blive stående for sig', () => {
    const clusters = clusterPoints(
      [point('a', 56.22, 10.55), point('b', -33.87, -70.67)],
      5,
      56,
    )
    expect(clusters.every((c) => c.kind === 'point')).toBe(true)
  })

  it('lader tom listen være tom', () => {
    expect(clusterPoints([], 5)).toEqual([])
  })
})
