import { projectLatLng } from './tileMath'

export interface PositionedObservation<TPayload> {
  id: string
  lat: number
  lng: number
  payload: TPayload
}

export type Cluster<TPayload> =
  | {
      kind: 'point'
      id: string
      x: number
      y: number
      observation: PositionedObservation<TPayload>
    }
  | {
      kind: 'cluster'
      id: string
      count: number
      x: number
      y: number
      observations: PositionedObservation<TPayload>[]
    }

export function clusterPoints<TPayload>(
  observations: PositionedObservation<TPayload>[],
  zoom: number,
  gridSize = 56,
): Cluster<TPayload>[] {
  const positioned = observations.map((observation) => ({
    observation,
    ...projectLatLng(observation.lat, observation.lng, zoom),
  }))

  const cells = new Map<string, (typeof positioned)[number][]>()
  for (const entry of positioned) {
    const key = `${Math.floor(entry.x / gridSize)}:${Math.floor(entry.y / gridSize)}`
    const group = cells.get(key)
    if (group) group.push(entry)
    else cells.set(key, [entry])
  }

  const result: Cluster<TPayload>[] = []
  for (const [cellKey, group] of cells) {
    if (group.length === 1) {
      const { observation, x, y } = group[0]
      result.push({ kind: 'point', id: observation.id, x, y, observation })
      continue
    }
    const x = group.reduce((sum, entry) => sum + entry.x, 0) / group.length
    const y = group.reduce((sum, entry) => sum + entry.y, 0) / group.length
    result.push({
      kind: 'cluster',
      id: cellKey,
      count: group.length,
      x,
      y,
      observations: group.map((entry) => entry.observation),
    })
  }
  return result
}
