import { describe, expect, it } from 'vitest'
import {
  ENCOUNTER_CHANCE,
  FINAL_DIFFICULTY,
  HARBOUR_MAX_X,
  HARBOUR_MIN_X,
  HARBOUR_START_X,
  HARBOUR_STEPS,
  MAX_MEN,
  MAX_TAELS,
  START_SHIP,
  createGame,
  inHarbourGap,
  levelOf,
  rankName,
  reduce,
  startGame,
  type Action,
  type Enemy,
  type KaperState,
  type Rng,
  type Screen,
} from './engine'
import { CLEARED, COPENHAGEN, LAND, START_POSITION } from './map'
import { ENEMY_TYPES } from './ships'

/**
 * En terning, der slår, hvad testen beder om, i rækkefølge -- og 0,5 derefter,
 * så en test ikke behøver at kende hvert eneste kast i en lang kæde.
 */
function scripted(...values: number[]): Rng {
  const queue = [...values]
  return () => (queue.length > 0 ? queue.shift()! : 0.5)
}

/** En terning, der aldrig lader noget ske: ingen møder, ingen vindstød. */
const calm: Rng = () => 0.99

function running(overrides: Partial<KaperState> = {}): KaperState {
  return { ...startGame('Tordenskjold'), ...overrides }
}

function enemy(id: number, overrides: Partial<Enemy> = {}): Enemy {
  const type = ENEMY_TYPES[id - 1]
  return {
    type,
    taels: type.taels,
    distance: 700,
    repair: 120,
    guns: type.guns,
    men: type.men,
    grain: 5,
    ...overrides,
  }
}

function withScreen(screen: Screen, overrides: Partial<KaperState> = {}) {
  return running({ screen, ...overrides })
}

function play(state: KaperState, actions: Action[], rng: Rng = calm) {
  return actions.reduce(
    (current, action) => reduce(current, action, rng),
    state,
  )
}

describe('startGame', () => {
  it('stævner ud med originalens skib, mål og frist', () => {
    const state = startGame('  Tordenskjold ')

    expect(state.status).toBe('running')
    expect(state.captain).toBe('Tordenskjold')
    expect(state).toMatchObject({
      ...START_SHIP,
      x: START_POSITION.x,
      y: START_POSITION.y,
      difficulty: 2,
      moveLimit: 300,
      pointGoal: 1000,
      points: 0,
      moves: 0,
    })
    expect(levelOf(state)).toBe(1)
    expect(rankName(levelOf(state))).toBe('matros')
  })

  it('giver en navnløs kaptajn et navn', () => {
    expect(startGame('   ').captain).toBe('kaptajn')
  })

  it('gør ingenting, før spillet er startet', () => {
    const idle = createGame()
    expect(reduce(idle, { type: 'move', dx: 1, dy: 0 }, calm)).toBe(idle)
  })
})

describe('sejlads', () => {
  it('flytter skibet ét felt og tæller trækket', () => {
    const state = reduce(running(), { type: 'move', dx: 1, dy: 1 }, calm)

    expect(state.x).toBe(START_POSITION.x + 1)
    expect(state.y).toBe(START_POSITION.y + 1)
    expect(state.moves).toBe(1)
    expect(state.screen.kind).toBe('map')
  })

  it('lader besætningen spise af kornet for hvert træk', () => {
    const state = reduce(running(), { type: 'move', dx: 1, dy: 0 }, calm)
    // 200 mand × (2 / 800) = en halv sæk pr. træk.
    expect(state.grain).toBeCloseTo(START_SHIP.grain - 0.5)
  })

  it('lader besætningen sulte, når kornet slipper op', () => {
    const state = reduce(
      running({ grain: 0.1 }),
      { type: 'move', dx: 1, dy: 0 },
      calm,
    )

    expect(state.grain).toBe(0)
    expect(state.men).toBe(180)
    expect(state.notice).toMatch(/sulter/)
  })

  it('bliver på kanten af kortet', () => {
    const state = reduce(
      running({ x: 29, y: 1 }),
      { type: 'move', dx: 1, dy: -1 },
      calm,
    )
    expect(state.x).toBe(29)
    expect(state.y).toBe(1)
  })

  it('går på grund på land og bliver, hvor det var', () => {
    // (6, 10) er land lige vest for startfeltet -- hen over (7..9, 10), som er hav.
    const start = running({ x: 7, y: 10 })
    expect(start.map[10][6]).toBe(LAND)

    const state = reduce(start, { type: 'move', dx: -1, dy: 0 }, calm)

    expect(state.x).toBe(7)
    expect(state.repair).toBe(START_SHIP.repair - 3)
    expect(state.moves).toBe(1)
    expect(state.notice).toMatch(/Grundstødning/)
  })

  it('synker, når reparationspointene er brugt op', () => {
    const state = reduce(
      running({ x: 7, y: 10, repair: 23 }),
      { type: 'move', dx: -1, dy: 0 },
      calm,
    )
    expect(state.status).toBe('over')
    expect(state.outcome).toBe('lost')
  })

  it('taber, når fristen løber ud, og komtessen gifter sig med en anden', () => {
    const state = reduce(
      running({ moves: 299 }),
      { type: 'move', dx: 1, dy: 0 },
      calm,
    )
    expect(state.status).toBe('over')
    expect(state.screen.kind).toBe('over')
    if (state.screen.kind === 'over') {
      expect(state.screen.lines.join(' ')).toMatch(/gift/)
    }
  })

  it('møder et skib på hvert fjerde frie havfelt', () => {
    // Første kast afgør mødet, næste hvilket skib: 0 -> handelsskib.
    const state = reduce(
      running(),
      { type: 'move', dx: 1, dy: 0 },
      scripted(ENCOUNTER_CHANCE - 0.01, 0),
    )

    expect(state.screen.kind).toBe('encounter')
    if (state.screen.kind === 'encounter') {
      expect(state.screen.enemy.type.name).toBe('handelsskib')
      expect(state.screen.enemy.distance).toBe(750)
    }
    expect(state.fights).toBe(3)
  })

  it('ser en sær tåge, når terningen viser 9 eller 10', () => {
    const state = reduce(
      running(),
      { type: 'move', dx: 1, dy: 0 },
      scripted(0, 0.85),
    )
    expect(state.screen.kind).toBe('mist')
  })

  it('møder ingen på et felt, hvor et slag er vundet', () => {
    const map = running().map.map((row) => [...row])
    map[10][11] = CLEARED
    const state = reduce(
      running({ map }),
      { type: 'move', dx: 1, dy: 0 },
      scripted(0, 0),
    )
    expect(state.screen.kind).toBe('map')
  })

  it('sejler ind i havnen, når man rammer et havnefelt', () => {
    const state = reduce(
      running({ x: 8, y: 1 }),
      { type: 'move', dx: 1, dy: 0 },
      calm,
    )
    expect(state.screen).toMatchObject({ kind: 'harbourIntro', port: 5 })
  })
})

describe('møder', () => {
  const sighting = withScreen({
    kind: 'encounter',
    enemy: enemy(1),
    preface: null,
  })

  it('lader en flugt koste moral', () => {
    const state = reduce(sighting, { type: 'flee' }, calm)
    expect(state.screen.kind).toBe('map')
    expect(state.flights).toBe(2)
  })

  it('giver valget mellem entring og kanoner', () => {
    const state = reduce(sighting, { type: 'attack' }, calm)
    expect(state.screen.kind).toBe('attack')
  })

  it('åbner kanonduellen med en vind', () => {
    const attack = reduce(sighting, { type: 'attack' }, calm)
    // Sidevind fra kast 0,7 -> 10, medvind fra 0,1 -> -10, styrke 1 + 0,55·10.
    const state = reduce(attack, { type: 'shoot' }, scripted(0.7, 0.1, 0.55))

    expect(state.screen).toMatchObject({
      kind: 'cannon',
      aim: { elevation: 0, side: 0 },
      wind: { side: 10, range: -10, strength: 6 },
      shot: null,
    })
  })

  it('har ingen vindstyrke i vindstille', () => {
    const attack = reduce(sighting, { type: 'attack' }, calm)
    const state = reduce(attack, { type: 'shoot' }, scripted(0.5, 0.5, 0.9))
    expect(state.screen).toMatchObject({
      wind: { side: 0, range: 0, strength: 0 },
    })
  })
})

describe('kanonduel', () => {
  function duel(
    overrides: Partial<Enemy> = {},
    wind = { side: 0, range: 0, strength: 0 },
  ) {
    return withScreen({
      kind: 'cannon',
      enemy: enemy(1, overrides),
      aim: { elevation: 0, side: 0 },
      wind,
      shot: null,
    })
  }

  it('holder sigtet inden for rammen', () => {
    const state = play(duel(), [{ type: 'aim', elevation: 100, side: -100 }])
    expect(state.screen).toMatchObject({ aim: { elevation: 30, side: -50 } })

    const set = reduce(
      state,
      { type: 'setAim', elevation: -7.4, side: 12.6 },
      calm,
    )
    expect(set.screen).toMatchObject({ aim: { elevation: -7, side: 13 } })
  })

  it('rammer, når skuddet ligger inden for 50 fod bag fjenden', () => {
    // Fjenden svarer ikke (kast < 0,4), ingen mistet kanon (0,99), ingen
    // afdrift (0,5), og spredningen ophæver sig selv (0,5 og 0,5).
    // Rækkevidden er 700 og afstanden 700, så kuglen lander præcis i skroget.
    const rng = scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(duel({ repair: 120, men: 80 }), { type: 'fire' }, rng)

    expect(state.screen.kind).toBe('cannon')
    if (state.screen.kind !== 'cannon') return
    expect(state.screen.shot).toEqual({
      outcome: 'hit',
      repairLost: 0,
      menLost: 0,
      cannonLost: false,
    })
    // 120 - floor(2·20/2) + 0 = 100 reparationspoint tilbage.
    expect(state.screen.enemy.repair).toBe(100)
    // 80 - floor(0,9·80·(20 + 0 + 0)/100) = 80 - 14 = 66 mand.
    expect(state.screen.enemy.men).toBe(66)
  })

  it('skyder for kort, når sigtet er for lavt', () => {
    const rng = scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(duel({ distance: 900 }), { type: 'fire' }, rng)
    expect(state.screen).toMatchObject({ shot: { outcome: 'short' } })
  })

  it('skyder for langt, når sigtet er for højt', () => {
    const start = play(duel({ distance: 500 }), [
      { type: 'aim', elevation: -30, side: 0 },
    ])
    const rng = scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(start, { type: 'fire' }, rng)
    expect(state.screen).toMatchObject({ shot: { outcome: 'long' } })
  })

  it('lader sidevinden drive kuglen forbi -- og sigtet rette den op', () => {
    const wind = { side: 10, range: 0, strength: 8 }
    const rng = () => scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)

    const missed = reduce(duel({}, wind), { type: 'fire' }, rng())
    expect(missed.screen).toMatchObject({ shot: { outcome: 'left' } })

    // Afdriften er 8 + floor(1 - 0,2·side): sigt 40 til højre giver 8 - 7 = 1.
    const aimed = play(duel({}, wind), [
      { type: 'aim', elevation: 0, side: 40 },
    ])
    const hit = reduce(aimed, { type: 'fire' }, rng())
    expect(hit.screen).toMatchObject({ shot: { outcome: 'hit' } })
  })

  it('lader fjenden svare på salven', () => {
    // Begge svar-kast over 0,4; frigat: 15 kanoner.
    const rng = scripted(0.9, 0, 0.9, 0, 0, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(
      withScreen({
        kind: 'cannon',
        enemy: enemy(4),
        aim: { elevation: 0, side: 0 },
        wind: { side: 0, range: 0, strength: 0 },
        shot: null,
      }),
      { type: 'fire' },
      rng,
    )

    // Moral (2+1)/2 = 1,5: floor(15/1,3·1,5) = 17 og floor(15/1,4·1,5) = 16.
    expect(state.repair).toBe(START_SHIP.repair - 17)
    expect(state.men).toBe(START_SHIP.men - 16)
    expect(state.cannon).toBe(START_SHIP.cannon - 1)
    expect(state.screen).toMatchObject({
      shot: { repairLost: 17, menLost: 16, cannonLost: true },
    })
  })

  it('synker, hvis fjendens bredside er for meget', () => {
    const rng = scripted(0.9, 0)
    const state = reduce(duel({ guns: 50 }), { type: 'fire' }, rng)
    expect(state.status).toBe('running')

    const battered = reduce(
      { ...duel({ guns: 50 }), repair: 30 },
      { type: 'fire' },
      scripted(0.9, 0),
    )
    expect(battered.status).toBe('over')
    expect(battered.outcome).toBe('lost')
  })

  it('får fjenden til at stryge flaget, når hun er skudt mør', () => {
    const rng = scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(duel({ repair: 50 }), { type: 'fire' }, rng)

    // 50 - 20 = 30 < 40 - 2: overgivelse. Pengene og kornet tages straks.
    expect(state.screen.kind).toBe('surrender')
    expect(state.taels).toBe(START_SHIP.taels + 150)
    expect(state.points).toBe(15)
    expect(state.grain).toBe(START_SHIP.grain + 5)
    expect(state.map[state.y][state.x]).toBe(CLEARED)
  })

  it('sænker fjenden, når skroget ikke holder', () => {
    const rng = scripted(0.1, 0.1, 0.99, 0.5, 0.5, 0.5, 0, 0)
    const state = reduce(duel({ repair: 30 }), { type: 'fire' }, rng)

    expect(state.screen).toMatchObject({ kind: 'report', title: 'Skibet sank' })
    expect(state.points).toBe(15)
    expect(state.taels).toBe(START_SHIP.taels)
  })

  it('kan trækkes tilbage til en ny afstand', () => {
    const state = reduce(duel(), { type: 'withdraw' }, scripted(0.2))
    expect(state.screen).toMatchObject({
      kind: 'encounter',
      enemy: { distance: 600 },
    })
  })

  it('kvitterer skuddet, før der kan sigtes igen', () => {
    const fired = reduce(
      duel({ distance: 900 }),
      { type: 'fire' },
      scripted(0.1, 0.1, 0.99),
    )
    const ignored = reduce(fired, { type: 'aim', elevation: 5, side: 0 }, calm)
    expect(ignored).toBe(fired)

    const ready = reduce(fired, { type: 'dismissShot' }, calm)
    expect(ready.screen).toMatchObject({ shot: null })
  })
})

describe('entring', () => {
  const attack = withScreen({ kind: 'attack', enemy: enemy(4) })

  it('koster begge sider folk og lader kampen fortsætte', () => {
    // Egne tab: floor(200·1,5·(2·0,5/30)) = 10. Styrkeforhold: (140/200)·1,5·0,2
    // = 0,21, løftet til 0,6. Fjendens tab: floor(10/0,6) = 16.
    const state = reduce(attack, { type: 'board' }, scripted(0.5))

    expect(state.men).toBe(190)
    expect(state.screen).toMatchObject({
      kind: 'boarding',
      ownDead: 10,
      enemyDead: 16,
      enemy: { men: 124 },
    })
  })

  it('tager mindst en tiendedel af fjenden, selv når ingen egne falder', () => {
    const state = reduce(attack, { type: 'board' }, scripted(0))
    expect(state.men).toBe(200)
    expect(state.screen).toMatchObject({
      enemyDead: 14,
      enemy: { men: 126 },
    })
  })

  it('får fjenden til at overgive sig under tyve mand', () => {
    const weak = withScreen({ kind: 'attack', enemy: enemy(4, { men: 25 }) })
    const state = reduce(weak, { type: 'board' }, scripted(0.5))
    expect(state.screen.kind).toBe('surrender')
  })

  it('kan trækkes tilbage til skibet', () => {
    const fighting = reduce(attack, { type: 'board' }, scripted(0.5))
    const state = reduce(fighting, { type: 'retreat' }, calm)
    expect(state.screen.kind).toBe('encounter')
  })
})

describe('efter overgivelsen', () => {
  const surrendered = withScreen(
    {
      kind: 'surrender',
      enemy: enemy(2, { men: 60 }),
      survivors: 60,
      grain: 5,
      prizeCrew: 35,
    },
    { points: 60 },
  )

  it('lader de overlevende gå med, når prisen sænkes -- og tæller point igen', () => {
    const state = reduce(surrendered, { type: 'sink' }, calm)
    expect(state.men).toBe(260)
    expect(state.points).toBe(120)
    expect(state.screen).toMatchObject({ kind: 'report', title: 'Skibet sank' })
  })

  it('smider overskydende mænd til hajerne', () => {
    const state = reduce({ ...surrendered, men: 480 }, { type: 'sink' }, calm)
    expect(state.men).toBe(MAX_MEN)
  })

  it('sender prisen hjem med et prisemandskab, der kommer frem', () => {
    // 2 < floor(0,9·16) = 14: prisen når frem.
    const state = reduce(surrendered, { type: 'prize' }, scripted(0.9))
    expect(state.men).toBe(165)
    expect(state.prizeMen).toBe(35)
    expect(state.prizeTaels).toBe(600)
    expect(state.screen.kind).toBe('report')
  })

  it('lader prisen forsvinde, uden at nogen får det at vide', () => {
    const state = reduce(surrendered, { type: 'prize' }, scripted(0.1))
    expect(state.men).toBe(165)
    expect(state.prizeMen).toBe(0)
    expect(state.prizeTaels).toBe(0)
    expect(state.screen.kind).toBe('report')
  })
})

describe('tågen', () => {
  const mist = withScreen({ kind: 'mist' })

  it('kan lades være', () => {
    expect(reduce(mist, { type: 'ignore' }, calm).screen.kind).toBe('map')
  })

  it('gemmer en skattekiste', () => {
    const state = reduce(mist, { type: 'investigate' }, scripted(0.25))
    expect(state.taels).toBe(START_SHIP.taels + 600)
    expect(state.screen.kind).toBe('report')
  })

  it('gemmer et frygtindgydende skib', () => {
    const state = reduce(mist, { type: 'investigate' }, scripted(0.05, 0.99))
    expect(state.screen).toMatchObject({
      kind: 'encounter',
      enemy: { type: { name: 'piratskib' } },
    })
    if (state.screen.kind === 'encounter') {
      expect(state.screen.preface).toMatch(/tåge/)
    }
  })

  it('gemmer pesten', () => {
    const state = reduce(mist, { type: 'investigate' }, scripted(0.95))
    expect(state.men).toBe(134)
    expect(state.screen).toMatchObject({ kind: 'report', title: 'Pest!' })
  })

  it('gemmer ingenting', () => {
    const state = reduce(mist, { type: 'investigate' }, scripted(0.65))
    expect(state.men).toBe(START_SHIP.men)
    expect(state.taels).toBe(START_SHIP.taels)
    expect(state.screen.kind).toBe('report')
  })
})

describe('indsejlingen', () => {
  function approach(rng: Rng = calm) {
    return reduce(
      withScreen({ kind: 'harbourIntro', port: 5, windDirection: 1 }),
      { type: 'continue' },
      rng,
    )
  }

  it('lægger skibe for anker og efterlader et hul i molen', () => {
    const state = approach()
    expect(state.screen.kind).toBe('harbour')
    if (state.screen.kind !== 'harbour') return
    const { harbour } = state.screen
    expect(harbour.x).toBe(HARBOUR_START_X)
    expect(harbour.row).toBe(0)
    expect(harbour.ships).toHaveLength(11)
    expect(harbour.gapWidth).toBe(5)
    expect(harbour.gapStart).toBeGreaterThanOrEqual(HARBOUR_MIN_X)
    expect(harbour.gapStart + harbour.gapWidth - 1).toBeLessThanOrEqual(
      HARBOUR_MAX_X,
    )
  })

  it('styrer skibet til siden inden for reden', () => {
    const state = play(approach(), [
      { type: 'steer', dx: -1 },
      { type: 'steer', dx: -1 },
    ])
    expect(state.screen).toMatchObject({ harbour: { x: HARBOUR_START_X - 2 } })

    const edge = play(
      state,
      Array.from({ length: 30 }, () => ({ type: 'steer', dx: 1 }) as const),
    )
    expect(edge.screen).toMatchObject({ harbour: { x: HARBOUR_MAX_X } })
  })

  it('kommer i havn, når man rammer hullet', () => {
    // Ingen skibe i vejen: terningen lægger dem alle i søjle 3, række 1, og
    // skibet starter i søjle 15.
    let state = approach(scripted(...Array(22).fill(0), 0.5))
    if (state.screen.kind !== 'harbour') throw new Error('ingen indsejling')
    const { gapStart } = state.screen.harbour
    const steps = gapStart - HARBOUR_START_X
    for (let index = 0; index < Math.abs(steps); index += 1) {
      state = reduce(state, { type: 'steer', dx: steps > 0 ? 1 : -1 }, calm)
    }
    for (let step = 0; step < HARBOUR_STEPS; step += 1) {
      state = reduce(state, { type: 'harbourTick' }, calm)
    }

    expect(state.screen).toMatchObject({ kind: 'port', port: 5 })
    expect(state.repair).toBe(START_SHIP.repair)
  })

  it('går til, hvis man rammer molen', () => {
    let state = approach(scripted(...Array(22).fill(0), 0.5))
    if (state.screen.kind !== 'harbour') throw new Error('ingen indsejling')
    const { harbour } = state.screen
    expect(inHarbourGap(harbour, HARBOUR_MAX_X)).toBe(false)
    state = play(
      state,
      Array.from({ length: 30 }, () => ({ type: 'steer', dx: 1 }) as const),
    )
    for (let step = 0; step < HARBOUR_STEPS; step += 1) {
      state = reduce(state, { type: 'harbourTick' }, calm)
    }

    expect(state.status).toBe('over')
    expect(state.outcome).toBe('lost')
  })

  it('tager skade af et skib på reden', () => {
    let state = approach(scripted(...Array(22).fill(0), 0.5))
    if (state.screen.kind !== 'harbour') throw new Error('ingen indsejling')
    const ship: [number, number] = [HARBOUR_START_X, 1]
    state = {
      ...state,
      screen: {
        ...state.screen,
        harbour: { ...state.screen.harbour, ships: [ship] },
      },
    }

    const hit = reduce(state, { type: 'harbourTick' }, calm)

    expect(hit.repair).toBe(START_SHIP.repair - 30)
    expect(hit.screen).toMatchObject({ harbour: { row: 1, lastEvent: 'hit' } })
  })

  it('lader et vindstød skubbe skibet', () => {
    const state = approach(scripted(...Array(22).fill(0), 0.5))
    const gust = reduce(state, { type: 'harbourTick' }, scripted(0))
    expect(gust.screen).toMatchObject({
      harbour: { x: HARBOUR_START_X + 1, lastEvent: 'gust' },
    })
  })
})

describe('havnen', () => {
  const prices = { men: 10, repair: 8, cannon: 100, grain: 5, jewels: 50 }
  const docked = withScreen({
    kind: 'port',
    port: 5,
    prices,
    arrival: null,
    notice: null,
  })

  it('sælger mænd, reparation, kanoner og korn', () => {
    const state = play(docked, [
      { type: 'buy', item: 'men', amount: 10 },
      { type: 'buy', item: 'repair', amount: 5 },
      { type: 'buy', item: 'cannon', amount: 1 },
      { type: 'buy', item: 'grain', amount: 20 },
    ])
    expect(state.men).toBe(210)
    expect(state.repair).toBe(205)
    expect(state.cannon).toBe(21)
    expect(state.grain).toBe(50)
    expect(state.taels).toBe(600 - 100 - 40 - 100 - 100)
  })

  it('afviser, hvad man ikke har råd til', () => {
    const state = reduce(
      docked,
      { type: 'buy', item: 'cannon', amount: 7 },
      calm,
    )
    expect(state.cannon).toBe(20)
    expect(state.taels).toBe(600)
    expect(state.screen).toMatchObject({ notice: 'Det har du ikke råd til!' })
  })

  it('afviser en last, skibet ikke kan bære', () => {
    const state = reduce(
      { ...docked, taels: 100000 },
      { type: 'buy', item: 'grain', amount: 680 },
      calm,
    )
    expect(state.grain).toBe(30)
    expect(state.screen).toMatchObject({
      notice: expect.stringMatching(/for meget/),
    })
  })

  it('ignorerer et vrøvlet antal', () => {
    expect(reduce(docked, { type: 'buy', item: 'men', amount: 0 }, calm)).toBe(
      docked,
    )
    expect(
      reduce(docked, { type: 'buy', item: 'men', amount: 2.5 }, calm),
    ).toBe(docked)
    expect(
      reduce(docked, { type: 'sell', item: 'grain', amount: -3 }, calm),
    ).toBe(docked)
  })

  it('køber korn, kanoner og juveler', () => {
    const state = play({ ...docked, jewels: 4 }, [
      { type: 'sell', item: 'grain', amount: 10 },
      { type: 'sell', item: 'cannon', amount: 2 },
      { type: 'sell', item: 'jewels', amount: 3 },
    ])
    expect(state.grain).toBe(20)
    expect(state.cannon).toBe(18)
    expect(state.jewels).toBe(1)
    expect(state.taels).toBe(600 + 50 + 200 + 150)
  })

  it('afviser at købe mere, end man har', () => {
    const state = reduce(
      docked,
      { type: 'sell', item: 'jewels', amount: 1 },
      calm,
    )
    expect(state.taels).toBe(600)
    expect(state.screen).toMatchObject({ notice: 'Så mange har du ikke!' })
  })

  it('sender skibet ud igen', () => {
    expect(reduce(docked, { type: 'leave' }, calm).screen.kind).toBe('map')
  })

  it('udbetaler prisepengene i København', () => {
    const state = reduce(
      withScreen(
        { kind: 'harbourIntro', port: COPENHAGEN, windDirection: 1 },
        { prizeMen: 35, prizeTaels: 600, points: 60 },
      ),
      { type: 'continue' },
      calm,
    )
    // Spring indsejlingen over: stil skibet i hullet og sejl de 18 skridt.
    if (state.screen.kind !== 'harbour') throw new Error('ingen indsejling')
    let docked: KaperState = {
      ...state,
      screen: {
        ...state.screen,
        harbour: {
          ...state.screen.harbour,
          ships: [],
          x: state.screen.harbour.gapStart,
        },
      },
    }
    for (let step = 0; step < HARBOUR_STEPS; step += 1) {
      docked = reduce(docked, { type: 'harbourTick' }, calm)
    }

    expect(docked.screen).toMatchObject({ kind: 'port', port: COPENHAGEN })
    expect(docked.men).toBe(235)
    expect(docked.taels).toBe(1200)
    expect(docked.points).toBe(120)
    expect(docked.prizeMen).toBe(0)
    if (docked.screen.kind === 'port') {
      expect(docked.screen.arrival?.join(' ')).toMatch(/35 tapre mænd/)
    }
  })
})

describe('forfremmelse', () => {
  it('kommer, når målet er nået, og sætter et nyt', () => {
    const state = reduce(
      withScreen(
        { kind: 'report', title: 'Skibet sank', lines: [] },
        { points: 1000, moves: 120 },
      ),
      { type: 'continue' },
      calm,
    )

    expect(state.screen).toMatchObject({ kind: 'report', title: 'Tillykke!' })
    expect(state.difficulty).toBe(4)
    expect(state.moveLimit).toBe(120 + 275)
    expect(state.pointGoal).toBe(1000 + 1500)
    expect(rankName(levelOf(state))).toBe('kaptajn')

    const back = reduce(state, { type: 'continue' }, calm)
    expect(back.screen.kind).toBe('map')
  })

  it('vinder spillet ved den sidste forfremmelse', () => {
    const state = reduce(
      withScreen(
        { kind: 'report', title: '', lines: [] },
        { points: 5000, pointGoal: 5000, difficulty: FINAL_DIFFICULTY - 2 },
      ),
      { type: 'continue' },
      calm,
    )
    expect(state.status).toBe('over')
    expect(state.outcome).toBe('won')
    expect(levelOf(state)).toBe(5)
  })

  it('synker skibet under en for tung last', () => {
    const state = reduce(
      withScreen(
        { kind: 'report', title: '', lines: [] },
        { taels: MAX_TAELS + 1 },
      ),
      { type: 'continue' },
      calm,
    )
    expect(state.status).toBe('over')
    if (state.screen.kind === 'over') {
      expect(state.screen.lines[0]).toMatch(/penge/)
    }
  })
})
