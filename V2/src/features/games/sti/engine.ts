/**
 * Stifinderen -- reglerne.
 *
 * En bane er et kort med poster, der skal tages i nummerorden. Hvert felt
 * koster terræntid, når man går ind på det: stien er hurtig, mosen er langsom,
 * og vand kan man ikke gå over. Pointene er, hvor tæt terræntiden kommer på
 * den hurtigste mulige rute. Uret på væggen tæller ikke, så den, der tænker
 * sig om, ikke straffes i forhold til den, der trykker hurtigst.
 *
 * Loftet er sat, så de tre baner kan ligge på samme liste: en let bane giver
 * højst 1.200, en mellemsvær højst 3.600 og en svær højst 6.000. En svær bane,
 * der er gået halvt så godt som den kunne, lander derfor under en perfekt
 * mellemsvær -- toppen nås kun ved at gå den svære bane rent. Tallene er de
 * samme som i `game_scores_score_plausible` for spillet `sti` (se migrationen
 * `20261007150000_game_scores_sti.sql`): `lines` er antal poster, og `level`
 * er banen.
 *
 * Som i de andre spil er et træk en ren funktion. Terningen bruges kun, når
 * banen lægges, så den samme bane kan spilles igennem i en test.
 */

export type Rng = () => number

export type WalkableTerrain = 'path' | 'meadow' | 'forest' | 'thicket' | 'bog'
export type Terrain = WalkableTerrain | 'water'

/** Hvad det koster at gå ind på feltet. Vand er slet ikke med: der går man ikke. */
export const TERRAIN_COST: Record<WalkableTerrain, number> = {
  path: 1,
  meadow: 2,
  forest: 3,
  thicket: 5,
  bog: 8,
}

export const TERRAIN_LABEL: Record<Terrain, string> = {
  path: 'Sti',
  meadow: 'Eng',
  forest: 'Skov',
  thicket: 'Krat',
  bog: 'Mose',
  water: 'Vand',
}

/** Rækkefølgen i forklaringen under kortet, fra det hurtigste til vand. */
export const TERRAINS: readonly Terrain[] = [
  'path',
  'meadow',
  'forest',
  'thicket',
  'bog',
  'water',
]

export type CourseClass = 1 | 2 | 3

/** Poster på banen. Skal matche `lines` i databasens loft for `sti`. */
export const CLASS_CONTROLS = { 1: 5, 2: 8, 3: 12 } as const satisfies Record<
  CourseClass,
  number
>

/** Højeste pointtal for en bane gået ad den hurtigste rute. */
export const CLASS_MAX_SCORE = {
  1: 1200,
  2: 3600,
  3: 6000,
} as const satisfies Record<CourseClass, number>

const CLASS_SIZE = {
  1: { width: 11, height: 15 },
  2: { width: 13, height: 17 },
  3: { width: 15, height: 21 },
} as const satisfies Record<CourseClass, { width: number; height: number }>

/** Korteste ben, vi prøver at lægge, før vi tager det længste, der er tilbage. */
const MIN_LEG = { 1: 4, 2: 6, 3: 6 } as const satisfies Record<
  CourseClass,
  number
>

export const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const

const COMPASS = [
  { point: 'N', name: 'nord' },
  { point: 'NØ', name: 'nordøst' },
  { point: 'Ø', name: 'øst' },
  { point: 'SØ', name: 'sydøst' },
  { point: 'S', name: 'syd' },
  { point: 'SV', name: 'sydvest' },
  { point: 'V', name: 'vest' },
  { point: 'NV', name: 'nordvest' },
] as const

export interface Pos {
  x: number
  y: number
}

export type Status = 'idle' | 'running' | 'over'
export type Outcome = 'finished' | 'retired'

export interface StiState {
  status: Status
  level: CourseClass
  width: number
  height: number
  terrain: Terrain[][]
  x: number
  y: number
  /** Posterne i den rækkefølge, de skal tages. */
  controls: Pos[]
  /** Hvor mange poster der allerede er taget. Den næste er `controls[nextIndex]`. */
  nextIndex: number
  /** Terræntid brugt indtil nu. Det er den, pointene regnes af. */
  elapsed: number
  /** Terræntid for den hurtigste rute gennem posterne i orden. */
  optimal: number
  score: number
  steps: number
  notice: string | null
  outcome: Outcome | null
}

export type Action =
  { type: 'move'; dx: number; dy: number } | { type: 'retire' }

/** Samme bane hver gang. Bruges til forhåndsvisningen, før man vælger. */
const PREVIEW_SEED = 0x51f1

export function mulberry32(seed: number): Rng {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function className(level: number): string {
  if (level === 1) return 'let'
  if (level === 2) return 'mellemsvær'
  if (level === 3) return 'svær'
  return 'bane'
}

export function classTitle(level: number): string {
  if (level === 1) return 'Let'
  if (level === 2) return 'Mellemsvær'
  if (level === 3) return 'Svær'
  return 'Bane'
}

/**
 * Andel af den hurtigste rute, ganget med banens loft. En rute, der er
 * hurtigere end den hurtigste, kan ikke forekomme -- og rundes heller ikke
 * op over loftet, for det tal afviser databasen.
 */
export function scoreFor(
  level: CourseClass,
  optimal: number,
  elapsed: number,
): number {
  if (optimal <= 0 || elapsed <= 0) return 0
  const ratio = Math.min(1, optimal / elapsed)
  return Math.round(ratio * CLASS_MAX_SCORE[level])
}

export function routeCost(terrain: Terrain[][], route: readonly Pos[]): number {
  return route.reduce((sum, pos) => {
    const cell = terrain[pos.y][pos.x]
    if (cell === 'water') return sum
    return sum + TERRAIN_COST[cell]
  }, 0)
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`
}

function inside(terrain: Terrain[][], x: number, y: number): boolean {
  return y >= 0 && y < terrain.length && x >= 0 && x < terrain[0].length
}

function walkable(terrain: Terrain[][], x: number, y: number): boolean {
  return inside(terrain, x, y) && terrain[y][x] !== 'water'
}

/**
 * Den billigste rute, felt for felt, uden startfeltet. Tom, hvis målet er
 * startfeltet eller ikke kan nås. Prisen ligger på det felt, man går ind på.
 */
export function cheapestRoute(terrain: Terrain[][], from: Pos, to: Pos): Pos[] {
  if (from.x === to.x && from.y === to.y) return []
  if (!walkable(terrain, to.x, to.y)) return []

  const dist = terrain.map((row) => row.map(() => Infinity))
  const prev: (Pos | null)[][] = terrain.map((row) => row.map(() => null))
  dist[from.y][from.x] = 0

  const queue: Pos[] = [from]
  const queued = new Set<string>([keyOf(from.x, from.y)])

  while (queue.length > 0) {
    let best = 0
    for (let index = 1; index < queue.length; index += 1) {
      const candidate = queue[index]
      const chosen = queue[best]
      if (dist[candidate.y][candidate.x] < dist[chosen.y][chosen.x]) {
        best = index
      }
    }
    const current = queue.splice(best, 1)[0]
    queued.delete(keyOf(current.x, current.y))

    for (const dir of DIRS) {
      const x = current.x + dir.dx
      const y = current.y + dir.dy
      if (!walkable(terrain, x, y)) continue
      const cell = terrain[y][x]
      if (cell === 'water') continue
      const cost = dist[current.y][current.x] + TERRAIN_COST[cell]
      if (cost < dist[y][x]) {
        dist[y][x] = cost
        prev[y][x] = current
        const key = keyOf(x, y)
        if (!queued.has(key)) {
          queue.push({ x, y })
          queued.add(key)
        }
      }
    }
  }

  if (!Number.isFinite(dist[to.y][to.x])) return []

  const route: Pos[] = []
  let cursor: Pos | null = to
  while (cursor && !(cursor.x === from.x && cursor.y === from.y)) {
    route.push(cursor)
    cursor = prev[cursor.y][cursor.x]
  }
  route.reverse()
  return route
}

/** Afstand fra ét felt til alle andre. Vand og det, der ikke kan nås, er uendeligt. */
function distancesFrom(terrain: Terrain[][], from: Pos): number[][] {
  const dist = terrain.map((row) => row.map(() => Infinity))
  dist[from.y][from.x] = 0
  const queue: Pos[] = [from]
  const queued = new Set<string>([keyOf(from.x, from.y)])

  while (queue.length > 0) {
    let best = 0
    for (let index = 1; index < queue.length; index += 1) {
      const candidate = queue[index]
      const chosen = queue[best]
      if (dist[candidate.y][candidate.x] < dist[chosen.y][chosen.x]) {
        best = index
      }
    }
    const current = queue.splice(best, 1)[0]
    queued.delete(keyOf(current.x, current.y))

    for (const dir of DIRS) {
      const x = current.x + dir.dx
      const y = current.y + dir.dy
      if (!walkable(terrain, x, y)) continue
      const cell = terrain[y][x]
      if (cell === 'water') continue
      const step = dist[current.y][current.x] + TERRAIN_COST[cell]
      if (step < dist[y][x]) {
        dist[y][x] = step
        const key = keyOf(x, y)
        if (!queued.has(key)) {
          queue.push({ x, y })
          queued.add(key)
        }
      }
    }
  }

  return dist
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function carvePaths(terrain: Terrain[][], rng: Rng) {
  const height = terrain.length
  const width = terrain[0].length
  let x = Math.floor(rng() * width)
  let y = Math.floor(rng() * height)
  let dir = DIRS[Math.floor(rng() * DIRS.length)]
  const walks = 4
  const steps = Math.round((width + height) * 1.6)

  for (let walk = 0; walk < walks; walk += 1) {
    if (walk > 0) {
      const paths: Pos[] = []
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          if (terrain[row][column] === 'path') paths.push({ x: column, y: row })
        }
      }
      const restart = paths[Math.floor(rng() * paths.length)]
      x = restart.x
      y = restart.y
      dir = DIRS[Math.floor(rng() * DIRS.length)]
    }

    for (let step = 0; step < steps; step += 1) {
      terrain[y][x] = 'path'
      if (rng() >= 0.62) dir = DIRS[Math.floor(rng() * DIRS.length)]
      x = clamp(x + dir.dx, 0, width - 1)
      y = clamp(y + dir.dy, 0, height - 1)
    }
  }
}

function paint(
  terrain: Terrain[][],
  rng: Rng,
  kind: WalkableTerrain,
  blobs: number,
  radius: number,
) {
  const height = terrain.length
  const width = terrain[0].length
  for (let blob = 0; blob < blobs; blob += 1) {
    const cx = Math.floor(rng() * width)
    const cy = Math.floor(rng() * height)
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (!inside(terrain, x, y)) continue
        if (terrain[y][x] !== 'forest') continue
        if (Math.abs(x - cx) + Math.abs(y - cy) > radius) continue
        if (rng() < 0.8) terrain[y][x] = kind
      }
    }
  }
}

/** Et felt må blive til vand, hvis de tilbageværende felter stadig hænger sammen. */
function canFlood(terrain: Terrain[][], x: number, y: number): boolean {
  const neighbors: Pos[] = []
  for (const dir of DIRS) {
    const nx = x + dir.dx
    const ny = y + dir.dy
    if (walkable(terrain, nx, ny)) neighbors.push({ x: nx, y: ny })
  }
  if (neighbors.length <= 1) return true

  const seen = new Set<string>([keyOf(x, y)])
  const queue = [neighbors[0]]
  seen.add(keyOf(neighbors[0].x, neighbors[0].y))
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const dir of DIRS) {
      const nx = current.x + dir.dx
      const ny = current.y + dir.dy
      const key = keyOf(nx, ny)
      if (seen.has(key) || !walkable(terrain, nx, ny)) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return neighbors.every((neighbor) => seen.has(keyOf(neighbor.x, neighbor.y)))
}

function placeWater(terrain: Terrain[][], rng: Rng) {
  const height = terrain.length
  const width = terrain[0].length
  const tries = Math.round((width * height) / 28)
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const x = Math.floor(rng() * width)
    const y = Math.floor(rng() * height)
    if (terrain[y][x] !== 'forest') continue
    if (!canFlood(terrain, x, y)) continue
    terrain[y][x] = 'water'
  }
}

function generateTerrain(level: CourseClass, rng: Rng): Terrain[][] {
  const { width, height } = CLASS_SIZE[level]
  const terrain: Terrain[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'forest' as Terrain),
  )
  carvePaths(terrain, rng)
  const area = width * height
  paint(terrain, rng, 'meadow', Math.max(2, Math.round(area / 45)), 2)
  paint(terrain, rng, 'thicket', Math.max(2, Math.round(area / 55)), 2)
  paint(terrain, rng, 'bog', Math.max(1, Math.round(area / 80)), 1)
  placeWater(terrain, rng)
  return terrain
}

interface Candidate {
  x: number
  y: number
  cost: number
}

function placeCourse(
  terrain: Terrain[][],
  level: CourseClass,
  rng: Rng,
): { start: Pos; controls: Pos[]; optimal: number } {
  const paths: Pos[] = []
  const cells: Pos[] = []
  for (let y = 0; y < terrain.length; y += 1) {
    for (let x = 0; x < terrain[0].length; x += 1) {
      if (!walkable(terrain, x, y)) continue
      cells.push({ x, y })
      if (terrain[y][x] === 'path') paths.push({ x, y })
    }
  }

  const pool = paths.length > 0 ? paths : cells
  const start = pool[Math.floor(rng() * pool.length)]
  const used = new Set<string>([keyOf(start.x, start.y)])
  const controls: Pos[] = []
  let from = start
  let optimal = 0

  for (let index = 0; index < CLASS_CONTROLS[level]; index += 1) {
    const dist = distancesFrom(terrain, from)
    const ranked: Candidate[] = []
    for (const cell of cells) {
      if (used.has(keyOf(cell.x, cell.y))) continue
      const cost = dist[cell.y][cell.x]
      if (Number.isFinite(cost) && cost > 0) {
        ranked.push({ x: cell.x, y: cell.y, cost })
      }
    }
    if (ranked.length === 0) {
      throw new Error('Banen kunne ikke sætte den næste post')
    }
    ranked.sort((a, b) => b.cost - a.cost || a.y - b.y || a.x - b.x)
    const spread = ranked.filter(
      (candidate) => candidate.cost >= MIN_LEG[level],
    )
    const choices = spread.length > 0 ? spread : ranked
    const take = Math.max(1, Math.min(8, Math.ceil(choices.length * 0.15)))
    const pick = Math.min(take - 1, Math.floor(rng() * take))
    const next = choices[pick]
    controls.push({ x: next.x, y: next.y })
    used.add(keyOf(next.x, next.y))
    optimal += next.cost
    from = next
  }

  return { start, controls, optimal }
}

export function createGame(): StiState {
  const preview = startGame(1, mulberry32(PREVIEW_SEED))
  return { ...preview, status: 'idle', notice: null }
}

export function startGame(level: CourseClass, rng: Rng): StiState {
  const terrain = generateTerrain(level, rng)
  const course = placeCourse(terrain, level, rng)
  return {
    status: 'running',
    level,
    width: terrain[0].length,
    height: terrain.length,
    terrain,
    x: course.start.x,
    y: course.start.y,
    controls: course.controls,
    nextIndex: 0,
    elapsed: 0,
    optimal: course.optimal,
    score: 0,
    steps: 0,
    notice: null,
    outcome: null,
  }
}

function isStep(dx: number, dy: number): boolean {
  const straight =
    (dx === 0 || dx === 1 || dx === -1) && (dy === 0 || dy === 1 || dy === -1)
  return straight && Math.abs(dx) + Math.abs(dy) === 1
}

export function reduce(state: StiState, action: Action): StiState {
  if (state.status !== 'running') return state
  if (action.type === 'retire') {
    return {
      ...state,
      status: 'over',
      outcome: 'retired',
      score: 0,
      notice: null,
    }
  }
  if (!isStep(action.dx, action.dy)) return state

  const x = state.x + action.dx
  const y = state.y + action.dy
  if (!inside(state.terrain, x, y)) {
    return { ...state, notice: 'Kortet slutter her.' }
  }
  const cell = state.terrain[y][x]
  if (cell === 'water') {
    return { ...state, notice: 'Der er vand. Gå udenom.' }
  }

  const elapsed = state.elapsed + TERRAIN_COST[cell]
  let nextIndex = state.nextIndex
  const control = state.controls[nextIndex]
  if (control && control.x === x && control.y === y) nextIndex += 1
  const finished = nextIndex === state.controls.length

  return {
    ...state,
    x,
    y,
    elapsed,
    steps: state.steps + 1,
    nextIndex,
    notice: null,
    status: finished ? 'over' : 'running',
    outcome: finished ? 'finished' : null,
    score: finished ? scoreFor(state.level, state.optimal, elapsed) : 0,
  }
}

/** Kompasretning mod et felt. Nord er op på kortet. */
export function directionTo(
  from: Pos,
  to: Pos,
): { point: string; phrase: string } | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return null
  // Skærmens y vokser nedad, så nord er negativt y. 0 er nord, og derfra med uret.
  const index = Math.round(Math.atan2(dx, -dy) / (Math.PI / 4))
  const compass = COMPASS[((index % 8) + 8) % 8]
  const fields = Math.max(1, Math.round(Math.hypot(dx, dy)))
  const unit = fields === 1 ? 'felt' : 'felter'
  return { point: compass.point, phrase: `${compass.name}, ${fields} ${unit}` }
}

/** Det, kortet siger om, hvor man står, og hvor næste post er. */
export function mapLabel(state: StiState): string {
  const ground = TERRAIN_LABEL[state.terrain[state.y][state.x]].toLowerCase()
  const here = `Kort over en ${className(state.level)} bane. Du står på ${ground}, felt ${state.x + 1}, ${state.y + 1}.`
  const next = state.controls[state.nextIndex]
  if (!next) return here
  const bearing = directionTo(state, next)
  if (!bearing) return here
  return `${here} Næste post er ${state.nextIndex + 1} af ${state.controls.length}, ${bearing.phrase}.`
}

/** Linjen under kortet, mens man går. Tom, når banen ikke er i gang. */
export function statusLine(state: StiState): string {
  if (state.status !== 'running') return ''
  const next = state.controls[state.nextIndex]
  if (!next) return ''
  const bearing = directionTo(state, next)
  if (!bearing) return ''
  const taken =
    state.nextIndex === 0 ? '' : `Post ${state.nextIndex} er taget. `
  return `${taken}Næste er post ${state.nextIndex + 1} af ${state.controls.length}, ${bearing.phrase}.`
}
