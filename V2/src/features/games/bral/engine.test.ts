import { describe, expect, it } from 'vitest'
import { formatCanCount } from './draw'
import {
  BELLOWS_BOOST,
  BRAL_CANS_PER_COIN,
  BRAL_DURATION_SECONDS,
  BRAL_MAX_COINS_PER_GAME,
  BRAL_MAX_COIN_VALUE,
  BRAL_MIN_COIN_VALUE,
  CAN_PLAY_BOTTOM_Y,
  MOLTEN_CAPACITY,
  OVEN_COOL_PER_SEC,
  OVEN_MAX_TEMP,
  OVEN_SWEET_MIN,
  STRIKE_COOLDOWN_S,
  bralScoreIsPlausible,
  canStrike,
  catchCanAt,
  catchLowestCan,
  createBralState,
  evaluateStrike,
  ovenZone,
  pumpBellows,
  startBral,
  stepBral,
  strikeCoin,
} from './engine'

describe('bral-motor', () => {
  it('griber faldende dåser ved tryk og med tastatur, og fjerner udbundne dåser', () => {
    const started = startBral(() => 0.5)
    expect(started.status).toBe('playing')
    expect(started.cans.length).toBe(2)

    const miss = catchCanAt(started, 0, 310)
    expect(miss.caught).toBe(false)
    expect(miss.state.crucibleCans).toBe(0)

    const target = started.cans[1]
    const hit = catchCanAt(started, target.x + 10, target.y - 10)
    expect(hit.caught).toBe(true)
    expect(hit.state.crucibleCans).toBe(1)
    expect(hit.state.cansCaught).toBe(1)
    expect(hit.state.cans).toHaveLength(1)

    const lowest = catchLowestCan(hit.state)
    expect(lowest.caught).toBe(true)
    expect(lowest.state.crucibleCans).toBe(2)
    expect(lowest.state.cans).toHaveLength(0)

    let state = {
      ...started,
      cans: [{ id: 99, x: 180, y: CAN_PLAY_BOTTOM_Y - 1, speed: 60, tilt: 0 }],
    }
    state = stepBral(state, 0.05, () => 0.5)
    expect(state.cans.some((can) => can.id === 99)).toBe(false)
  })

  it('spawner nye dåser over tid op til loftet for aktive dåser', () => {
    let state = startBral(() => 0.5)
    for (let step = 0; step < 60; step += 1) {
      state = stepBral(state, 0.1, () => 0.5)
    }
    expect(state.cans.length).toBeGreaterThan(0)
    expect(state.cans.length).toBeLessThanOrEqual(6)
  })

  it('smelter dåser i grøn zone, stopper når ovnen er kold, og taber metal ved overophedning', () => {
    let optimal = {
      ...startBral(() => 0.5),
      ovenTemp: 680,
      crucibleCans: 4,
      molten: 0,
    }
    for (let step = 0; step < 25; step += 1) {
      optimal = stepBral({ ...optimal, ovenTemp: 660 }, 0.1, () => 0.5)
    }
    expect(optimal.crucibleCans).toBe(0)
    expect(optimal.molten).toBe(BRAL_CANS_PER_COIN)

    const cold = stepBral(
      {
        ...startBral(() => 0.5),
        ovenTemp: OVEN_SWEET_MIN - 20,
        crucibleCans: 4,
        molten: 1,
      },
      0.1,
      () => 0.5,
    )
    expect(ovenZone(cold.ovenTemp)).toBe('cold')
    expect(cold.crucibleCans).toBe(4)
    expect(cold.molten).toBe(1)

    const hot = stepBral(
      {
        ...startBral(() => 0.5),
        ovenTemp: 820,
        crucibleCans: 4,
        molten: 3,
      },
      0.1,
      () => 0.5,
    )
    expect(ovenZone(hot.ovenTemp)).toBe('hot')
    expect(hot.molten).toBeLessThan(3)

    const pumped = pumpBellows({ ...startBral(), ovenTemp: 600 })
    expect(pumped.ovenTemp).toBe(600 + BELLOWS_BOOST)
    const capped = pumpBellows({
      ...startBral(),
      ovenTemp: OVEN_MAX_TEMP - 10,
    })
    expect(capped.ovenTemp).toBe(OVEN_MAX_TEMP)

    const cooled = stepBral(
      { ...startBral(() => 0.5), ovenTemp: 660 },
      0.1,
      () => 0.5,
    )
    expect(cooled.ovenTemp).toBeCloseTo(660 - OVEN_COOL_PER_SEC * 0.1)
  })

  it('præger Ti, Fem og En Bral efter markøren, bruger 4 smeltet og respekterer pause mellem slag', () => {
    expect(evaluateStrike(0.5)).toEqual({
      denomination: 'ti',
      label: 'Ti Bral',
      value: 10,
    })
    expect(evaluateStrike(0.32)).toEqual({
      denomination: 'fem',
      label: 'Fem Bral',
      value: 5,
    })
    expect(evaluateStrike(0.05)).toEqual({
      denomination: 'en',
      label: 'En Bral',
      value: 1,
    })

    const notReady = strikeCoin({ ...startBral(), molten: 3.9 })
    expect(notReady.coins).toBe(0)
    expect(notReady.score).toBe(0)

    const ready = { ...startBral(), molten: 8, markerPos: 0.5 }
    expect(canStrike(ready)).toBe(true)
    const struck = strikeCoin(ready)
    expect(struck.coins).toBe(1)
    expect(struck.score).toBe(10)
    expect(struck.molten).toBe(4)
    expect(struck.lastCoin?.label).toBe('Ti Bral')
    expect(struck.strikeCooldown).toBe(STRIKE_COOLDOWN_S)

    expect(canStrike(struck)).toBe(false)
    const ignored = strikeCoin(struck)
    expect(ignored.coins).toBe(1)
  })

  it('begrænser smeltet metal til diglens kapacitet', () => {
    const state = stepBral(
      {
        ...startBral(() => 0.5),
        ovenTemp: 660,
        crucibleCans: 5,
        molten: MOLTEN_CAPACITY - 0.05,
      },
      0.1,
      () => 0.5,
    )
    expect(state.molten).toBe(MOLTEN_CAPACITY)
  })

  it('slutter efter 60 sekunder og når præcis loftet ved perfekt spil', () => {
    let state = createBralState()
    expect(state.status).toBe('ready')
    state = startBral(() => 0.5)

    for (let tick = 0; tick < BRAL_DURATION_SECONDS * 20; tick += 1) {
      if (state.status !== 'playing') break
      if (ovenZone(state.ovenTemp) === 'cold' || state.ovenTemp < 650) {
        state = pumpBellows(state)
      }
      while (state.cans.length > 0) {
        const caught = catchLowestCan(state)
        if (!caught.caught) break
        state = caught.state
      }
      if (canStrike(state)) {
        state = strikeCoin({ ...state, markerPos: 0.5 })
      }
      state = stepBral(state, 0.05, () => 0.5)
    }

    expect(state.status).toBe('over')
    expect(state.timeLeft).toBe(0)
    expect(state.elapsedSeconds).toBe(BRAL_DURATION_SECONDS)
    expect(state.cans).toEqual([])
    expect(state.coins).toBe(BRAL_MAX_COINS_PER_GAME)
    expect(state.score).toBe(BRAL_MAX_COINS_PER_GAME * BRAL_MAX_COIN_VALUE)
    expect(state.score).toBeGreaterThanOrEqual(
      state.coins * BRAL_MIN_COIN_VALUE,
    )
    expect(bralScoreIsPlausible(state.score, state.coins, 1)).toBe(true)
  })

  it('begrænser akkumuleret spilletid pr. step ved langt spring mellem billeder', () => {
    const started = startBral(() => 0.5)
    const stepped = stepBral(started, 90, () => 0.5)
    expect(stepped.elapsedSeconds).toBeCloseTo(0.1)
    expect(stepped.timeLeft).toBeCloseTo(BRAL_DURATION_SECONDS - 0.1)
  })

  it('formaterer antal dåser i diglen uden at runde brøkdele op', () => {
    expect(formatCanCount(0)).toBe('0')
    expect(formatCanCount(4)).toBe('4')
    expect(formatCanCount(0.32)).toBe('0,3')
    expect(formatCanCount(2.01)).toBe('2')
  })
})
