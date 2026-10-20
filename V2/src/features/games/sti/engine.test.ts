import { describe, expect, it } from 'vitest'
import {
  CLASS_CONTROLS,
  CLASS_MAX_SCORE,
  TERRAIN_COST,
  cheapestRoute,
  className,
  createGame,
  directionTo,
  mapLabel,
  mulberry32,
  reduce,
  routeCost,
  scoreFor,
  startGame,
  statusLine,
  type Action,
  type CourseClass,
  type Pos,
  type StiState,
  type Terrain,
} from './engine'

function play(state: StiState, actions: Action[]): StiState {
  return actions.reduce((current, action) => reduce(current, action), state)
}

function follow(state: StiState, route: readonly Pos[]): StiState {
  let current = state
  let x = state.x
  let y = state.y
  for (const step of route) {
    current = reduce(current, {
      type: 'move',
      dx: step.x - x,
      dy: step.y - y,
    })
    x = step.x
    y = step.y
  }
  return current
}

/** Går den hurtigste rute gennem posterne i orden. */
function playOptimal(state: StiState): StiState {
  let current = state
  for (const control of current.controls) {
    const route = cheapestRoute(
      current.terrain,
      { x: current.x, y: current.y },
      control,
    )
    current = follow(current, route)
  }
  return current
}

function fixture(overrides: Partial<StiState> = {}): StiState {
  const terrain: Terrain[][] = [
    ['path', 'water', 'path'],
    ['meadow', 'forest', 'bog'],
  ]
  return {
    status: 'running',
    level: 1,
    width: 3,
    height: 2,
    terrain,
    x: 0,
    y: 0,
    controls: [
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ],
    nextIndex: 0,
    elapsed: 0,
    // Eng, skov, mose: den eneste vej fra start til de to poster.
    optimal: TERRAIN_COST.meadow + TERRAIN_COST.forest + TERRAIN_COST.bog,
    score: 0,
    steps: 0,
    notice: null,
    outcome: null,
    ...overrides,
  }
}

describe('ruten', () => {
  const terrain: Terrain[][] = [
    ['path', 'forest', 'water'],
    ['path', 'bog', 'path'],
  ]

  it('går uden om vandet og tæller prisen på det felt, man træder ind på', () => {
    const route = cheapestRoute(terrain, { x: 0, y: 0 }, { x: 2, y: 1 })

    // Ned ad stien, gennem mosen, ind på stien. Skoven ovenover er dyrere.
    expect(route).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ])
    expect(routeCost(terrain, route)).toBe(
      TERRAIN_COST.path + TERRAIN_COST.bog + TERRAIN_COST.path,
    )
  })

  it('giver en tom rute, når målet er vand eller startfeltet', () => {
    expect(cheapestRoute(terrain, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([])
    expect(cheapestRoute(terrain, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([])
  })
})

describe('point', () => {
  it('giver loftet for den hurtigste rute og aldrig mere', () => {
    expect(scoreFor(1, 13, 13)).toBe(1200)
    expect(scoreFor(1, 13, 1)).toBe(1200)
    expect(scoreFor(2, 10, 10)).toBe(3600)
    expect(scoreFor(3, 10, 10)).toBe(6000)
  })

  it('lader en sjusket svær bane tabe til en perfekt mellemsvær', () => {
    // Halv fart på den svære er under loftet for den mellemsvære.
    expect(scoreFor(3, 100, 200)).toBe(3000)
    expect(scoreFor(3, 100, 200)).toBeLessThan(CLASS_MAX_SCORE[2])
  })

  it('regner omvejen på det lille kort', () => {
    // 13/18 af 1.200.
    expect(scoreFor(1, 13, 18)).toBe(867)
  })
})

describe('startGame', () => {
  it('gør ingenting, før banen er valgt', () => {
    const idle = createGame()
    expect(idle.status).toBe('idle')
    expect(reduce(idle, { type: 'move', dx: 1, dy: 0 })).toBe(idle)
  })

  it.each([1, 2, 3] as const)(
    'lægger en sammenhængende bane i klasse %s, som kan gås rent',
    (level: CourseClass) => {
      for (let seed = 1; seed <= 12; seed += 1) {
        const state = startGame(level, mulberry32(seed * 17 + level))
        expect(state.controls).toHaveLength(CLASS_CONTROLS[level])
        expect(state.optimal).toBeGreaterThan(0)
        expect(state.terrain[state.y][state.x]).not.toBe('water')

        const seen = new Set<string>()
        for (const control of state.controls) {
          const key = `${control.x},${control.y}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          expect(control).not.toEqual({ x: state.x, y: state.y })
          expect(state.terrain[control.y][control.x]).not.toBe('water')
        }

        const finished = playOptimal(state)
        expect(finished.elapsed).toBe(state.optimal)
        expect(finished.score).toBe(CLASS_MAX_SCORE[level])
        expect(finished.outcome).toBe('finished')
        expect(finished.nextIndex).toBe(CLASS_CONTROLS[level])
      }
    },
  )
})

describe('gåturen', () => {
  it('tager posten, når man træder ind på den, og ignorerer en senere post', () => {
    const first = reduce(fixture(), { type: 'move', dx: 0, dy: 1 })
    expect(first).toMatchObject({
      x: 0,
      y: 1,
      nextIndex: 1,
      elapsed: TERRAIN_COST.meadow,
      steps: 1,
      status: 'running',
    })

    const early = reduce(
      { ...fixture(), x: 1, y: 1 },
      { type: 'move', dx: 1, dy: 0 },
    )
    expect(early.nextIndex).toBe(0)
    expect(early.elapsed).toBe(TERRAIN_COST.bog)
  })

  it('afviser vand, kanten og skrå skridt uden at flytte sig', () => {
    const water = reduce(fixture(), { type: 'move', dx: 1, dy: 0 })
    expect(water.x).toBe(0)
    expect(water.notice).toBe('Der er vand. Gå udenom.')

    const edge = reduce(fixture(), { type: 'move', dx: -1, dy: 0 })
    expect(edge.x).toBe(0)
    expect(edge.notice).toBe('Kortet slutter her.')

    const idle = fixture()
    expect(reduce(idle, { type: 'move', dx: 1, dy: 1 })).toBe(idle)
  })

  it('giver loftet, når man går den eneste vej, og mindre, når man går en omvej', () => {
    const straight = play(fixture(), [
      { type: 'move', dx: 0, dy: 1 },
      { type: 'move', dx: 1, dy: 0 },
      { type: 'move', dx: 1, dy: 0 },
    ])
    expect(straight.outcome).toBe('finished')
    expect(straight.score).toBe(CLASS_MAX_SCORE[1])
    expect(straight.elapsed).toBe(straight.optimal)

    const detour = play(fixture(), [
      { type: 'move', dx: 0, dy: 1 },
      { type: 'move', dx: 1, dy: 0 },
      { type: 'move', dx: -1, dy: 0 },
      { type: 'move', dx: 1, dy: 0 },
      { type: 'move', dx: 1, dy: 0 },
    ])
    expect(detour.score).toBe(867)
    expect(detour.score).toBeLessThan(straight.score)
  })

  it('tæller ikke en opgivet bane, og lytter ikke bagefter', () => {
    const retired = reduce(fixture(), { type: 'retire' })
    expect(retired).toMatchObject({
      status: 'over',
      outcome: 'retired',
      score: 0,
    })
    expect(reduce(retired, { type: 'move', dx: 0, dy: 1 })).toBe(retired)

    const finished = play(fixture(), [
      { type: 'move', dx: 0, dy: 1 },
      { type: 'move', dx: 1, dy: 0 },
      { type: 'move', dx: 1, dy: 0 },
    ])
    expect(reduce(finished, { type: 'move', dx: 0, dy: -1 })).toBe(finished)
  })
})

describe('teksten på kortet', () => {
  it('nævner de otte verdenshjørner', () => {
    const origin = { x: 0, y: 0 }
    expect(directionTo(origin, { x: 0, y: -3 })?.phrase).toBe('nord, 3 felter')
    expect(directionTo(origin, { x: 2, y: -2 })?.point).toBe('NØ')
    expect(directionTo(origin, { x: 4, y: 0 })?.phrase).toBe('øst, 4 felter')
    expect(directionTo(origin, { x: 1, y: 1 })?.phrase).toBe('sydøst, 1 felt')
    expect(directionTo(origin, { x: 0, y: 2 })?.point).toBe('S')
    expect(directionTo(origin, { x: -2, y: 2 })?.point).toBe('SV')
    expect(directionTo(origin, { x: -2, y: 0 })?.point).toBe('V')
    expect(directionTo(origin, { x: -2, y: -2 })?.point).toBe('NV')
    expect(directionTo(origin, origin)).toBeNull()
  })

  it('siger, hvor næste post er, og tier, når man ikke går', () => {
    const state = fixture()
    expect(mapLabel(state)).toContain('Du står på sti, felt 1, 1.')
    expect(mapLabel(state)).toContain('Næste post er 1 af 2, syd, 1 felt.')
    expect(statusLine(state)).toBe('Næste er post 1 af 2, syd, 1 felt.')
    expect(className(1)).toBe('let')
    expect(className(2)).toBe('mellemsvær')
    expect(className(3)).toBe('svær')

    const taken = reduce(state, { type: 'move', dx: 0, dy: 1 })
    expect(statusLine(taken)).toBe(
      'Post 1 er taget. Næste er post 2 af 2, øst, 2 felter.',
    )
    expect(statusLine(createGame())).toBe('')
  })
})
