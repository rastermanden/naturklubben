/**
 * Kortet over det danske indhav, som det stod i det oprindelige spil fra
 * 1980'erne: et gitter på 30 × 16 felter, hvor skibet kan sejle på felterne
 * 1..29 × 1..14. Landfelterne er skrevet af efter spillets egne DATA-linjer --
 * det er ikke et kort, man kan navigere efter, men det er *spillets* kort, og
 * de syv havne ligger, hvor de altid har ligget.
 */

export const MAP_COLUMNS = 30
export const MAP_ROWS = 16

export const MIN_X = 1
export const MAX_X = 29
export const MIN_Y = 1
export const MAX_Y = 14

/** Der starter man: midt i Kattegat, syd for Grenaa. */
export const START_POSITION = { x: 10, y: 10 } as const

export const SEA = 0
export const LAND = 1
/**
 * Et felt, hvor et slag er vundet. "Where you have won a battle, the Brits no
 * longer dare to venture": der er ikke flere skibe at møde på det felt.
 */
export const CLEARED = 50

/** Landfelter som (x, y), direkte fra spillets DATA-linjer 650-740. */
const LAND_CELLS: readonly (readonly [number, number])[] = [
  [7, 5],
  [8, 1],
  [8, 2],
  [7, 2],
  [7, 3],
  [7, 4],
  [6, 3],
  [5, 3],
  [4, 5],
  [5, 4],
  [5, 3],
  [4, 2],
  [2, 3],
  [5, 2],
  [3, 3],
  [2, 3],
  [2, 4],
  [2, 5],
  [2, 6],
  [2, 7],
  [2, 8],
  [2, 9],
  [1, 9],
  [6, 11],
  [6, 10],
  [26, 0],
  [27, 0],
  [27, 1],
  [27, 2],
  [28, 1],
  [28, 2],
  [28, 3],
  [26, 4],
  [27, 4],
  [28, 4],
  [26, 5],
  [27, 5],
  [27, 6],
  [27, 7],
  [28, 7],
  [28, 8],
  [28, 9],
  [29, 9],
  [29, 10],
  [29, 11],
  [12, 13],
  [13, 13],
  [13, 12],
  [14, 12],
  [15, 12],
  [16, 12],
  [14, 11],
  [15, 11],
  [15, 10],
  [16, 10],
  [17, 12],
  [15, 9],
  [16, 9],
  [16, 13],
  [17, 13],
  [18, 13],
  [19, 13],
  [19, 12],
  [19, 11],
  [19, 10],
  [20, 13],
  [20, 7],
  [21, 6],
  [21, 7],
  [21, 8],
  [21, 9],
  [21, 10],
  [21, 11],
  [21, 12],
  [21, 13],
  [21, 14],
  [21, 15],
  [22, 6],
  [22, 7],
  [22, 8],
  [22, 9],
  [22, 10],
  [22, 11],
  [22, 12],
  [22, 13],
  [22, 14],
  [22, 15],
  [23, 6],
  [23, 7],
  [23, 8],
  [23, 9],
  [23, 10],
  [23, 11],
  [23, 12],
  [23, 13],
  [23, 14],
  [23, 15],
  [11, 14],
  [24, 7],
  [24, 8],
  [24, 9],
  [24, 10],
  [24, 11],
  [24, 12],
  [24, 13],
  [24, 14],
  [24, 15],
  [11, 9],
  [13, 8],
  [14, 8],
  [12, 12],
  [25, 12],
  [25, 13],
  [25, 14],
  [11, 12],
  [10, 12],
  [6, 9],
  [5, 8],
  [6, 8],
  [3, 12],
  [18, 12],
  [19, 9],
  [25, 3],
  [26, 9],
]

export interface Port {
  /** Feltets værdi på kortet -- 2..8, som i det oprindelige spil. */
  id: number
  name: string
  x: number
  y: number
  /** Hvor navnet står i forhold til havnen, så det ikke ligger hen over land. */
  label: 'left' | 'right' | 'above' | 'below'
}

export const COPENHAGEN = 2

export const PORTS: readonly Port[] = [
  { id: 2, name: 'København', x: 25, y: 12, label: 'above' },
  { id: 3, name: 'Helsingør', x: 25, y: 7, label: 'above' },
  { id: 4, name: 'Hundested', x: 18, y: 8, label: 'above' },
  { id: 5, name: 'Grenaa', x: 9, y: 1, label: 'right' },
  { id: 6, name: 'Ebeltoft', x: 7, y: 4, label: 'right' },
  { id: 7, name: 'Kalundborg', x: 11, y: 13, label: 'left' },
  { id: 8, name: 'Mölle', x: 24, y: 3, label: 'left' },
]

export function portById(id: number): Port | undefined {
  return PORTS.find((port) => port.id === id)
}

export function isPortCell(cell: number): boolean {
  return cell >= 2 && cell <= 9
}

/** Et frisk kort: hav, land og havne -- ingen vundne slag endnu. */
export function createMap(): number[][] {
  const map = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLUMNS }, () => SEA),
  )
  for (const [x, y] of LAND_CELLS) map[y][x] = LAND
  for (const port of PORTS) map[port.y][port.x] = port.id
  return map
}
