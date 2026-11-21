import { describe, expect, it } from 'vitest'
import { formatCanCount } from './draw'
import {
  BELLOWS_BOOST,
  BRAL_CANS_PER_COIN,
  BRAL_DURATION_SECONDS,
  BRAL_MAX_COINS_PER_GAME,
  BRAL_MAX_COIN_VALUE,
  BRAL_MIN_COIN_VALUE,
  BRAL_TABS_PER_COIN,
  CAN_PLAY_BOTTOM_Y,
  MOLTEN_CAPACITY,
  OVEN_COOL_PER_SEC,
  OVEN_MAX_TEMP,
  OVEN_SWEET_MIN,
  RELAY_REFILL_CRUCIBLE_CANS,
  RELAY_TARGET_STEPS,
  SHORTAGE_START_MAX_S,
  SHORTAGE_START_MIN_S,
  STRIKE_COOLDOWN_S,
  bralScoreIsPlausible,
  canStrike,
  catchCanAt,
  catchLowestCan,
  createBralState,
  evaluateStrike,
  ovenZone,
  passRelay,
  pumpBellows,
  startBral,
  startRelay,
  stepBral,
  strikeCoin,
  type BralState,
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

    let state: BralState = {
      ...started,
      cans: [
        {
          id: 99,
          kind: 'can',
          x: 180,
          y: CAN_PLAY_BOTTOM_Y - 1,
          speed: 60,
          tilt: 0,
        },
      ],
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

  it('slutter efter 60 sekunder og når præcis loftet ved perfekt spil med og uden mangel', () => {
    const playPerfect = (withShortage: boolean, rngValue: number) => {
      let state = createBralState()
      expect(state.status).toBe('ready')
      state = startBral(() => rngValue)
      if (!withShortage) {
        state = { ...state, shortage: 'resolved' }
      }

      for (let tick = 0; tick < BRAL_DURATION_SECONDS * 20; tick += 1) {
        if (state.status !== 'playing') break
        if (ovenZone(state.ovenTemp) === 'cold' || state.ovenTemp < 650) {
          state = pumpBellows(state)
        }
        if (state.shortage === 'active') {
          state = startRelay(state)
          while (state.relay.active) {
            state = passRelay(state, state.relay.nextHand, () => rngValue)
          }
        }
        while (state.cans.length > 0) {
          const caught = catchLowestCan(state)
          if (!caught.caught) break
          state = caught.state
        }
        if (canStrike(state)) {
          state = strikeCoin({ ...state, markerPos: 0.5 })
        }
        state = stepBral(state, 0.05, () => rngValue)
      }
      return state
    }

    for (const run of [
      playPerfect(false, 0.5),
      playPerfect(true, 0),
      playPerfect(true, 0.5),
      playPerfect(true, 0.99),
    ]) {
      expect(run.status).toBe('over')
      expect(run.timeLeft).toBe(0)
      expect(run.elapsedSeconds).toBe(BRAL_DURATION_SECONDS)
      expect(run.cans).toEqual([])
      expect(run.coins).toBe(BRAL_MAX_COINS_PER_GAME)
      expect(run.score).toBe(BRAL_MAX_COINS_PER_GAME * BRAL_MAX_COIN_VALUE)
      expect(run.score).toBeGreaterThanOrEqual(run.coins * BRAL_MIN_COIN_VALUE)
      expect(bralScoreIsPlausible(run.score, run.coins, 1)).toBe(true)
    }
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

  it('udløser dåsemangel én gang med markant lavere dåsetakt og afslutter via ølstafet', () => {
    let state = startBral(() => 0.5)
    expect(state.shortage).toBe('pending')
    expect(state.shortageTriggerAt).toBeGreaterThanOrEqual(SHORTAGE_START_MIN_S)
    expect(state.shortageTriggerAt).toBeLessThanOrEqual(SHORTAGE_START_MAX_S)

    // Mål normal dåsetakt over de første 10 sekunder.
    for (let tick = 0; tick < 200; tick += 1) {
      while (state.cans.length > 0) {
        state = catchLowestCan(state).state
      }
      state = stepBral(state, 0.05, () => 0.5)
    }
    const normalCansInTenSeconds = state.cansCaught
    expect(state.shortage).toBe('pending')

    // Kør frem til dåsemanglen udløses.
    while (state.shortage === 'pending') {
      while (state.cans.length > 0) {
        state = catchLowestCan(state).state
      }
      state = stepBral(state, 0.05, () => 0.5)
    }
    expect(state.shortage).toBe('active')
    expect(state.cans.some((item) => item.kind === 'tab')).toBe(true)

    const caughtBeforeShortageWindow = state.cansCaught
    const tabsBeforeShortageWindow = state.tabsCaught
    for (let tick = 0; tick < 200; tick += 1) {
      while (state.cans.length > 0) {
        state = catchLowestCan(state).state
      }
      state = stepBral(state, 0.05, () => 0.5)
    }
    const shortageCansInTenSeconds =
      state.cansCaught - caughtBeforeShortageWindow
    const shortageTabsInTenSeconds = state.tabsCaught - tabsBeforeShortageWindow
    expect(shortageCansInTenSeconds).toBeLessThan(normalCansInTenSeconds / 2)
    expect(shortageTabsInTenSeconds).toBeGreaterThanOrEqual(8)

    // Ølstafet kræver start først og skiftende venstre/højre hænder.
    expect(passRelay(state, 'left').relay.steps).toBe(0)
    state = startRelay(state)
    expect(state.relay.active).toBe(true)
    expect(state.relay.nextHand).toBe('left')
    expect(passRelay(state, 'right').relay.steps).toBe(0)

    const crucibleBeforeRelayEnd = state.crucibleCans
    for (let step = 0; step < RELAY_TARGET_STEPS; step += 1) {
      const hand = step % 2 === 0 ? 'left' : 'right'
      state = passRelay(state, hand, () => 0.5)
    }

    expect(state.shortage).toBe('resolved')
    expect(state.relay.active).toBe(false)
    expect(state.crucibleCans).toBe(
      crucibleBeforeRelayEnd + RELAY_REFILL_CRUCIBLE_CANS,
    )
    expect(state.cans.some((item) => item.kind === 'can')).toBe(true)
    expect(state.shortageNotice?.text).toBe(
      'SHORTAGE CLEARED · RESERVE RESTORED',
    )

    // Manglen kommer aldrig igen resten af partiet.
    while (state.status === 'playing') {
      state = stepBral(state, 0.05, () => 0.5)
    }
    expect(state.shortage).toBe('resolved')
  })

  it('omsætter 5 ringtræk til nødslag i diglen og præger En, Fem og Ti Bral', () => {
    let state: BralState = {
      ...startBral(() => 0.5),
      shortage: 'active',
      ovenTemp: 660,
      cans: [
        { id: 500, kind: 'tab', x: 180, y: 80, speed: 0, tilt: 0 },
        { id: 501, kind: 'tab', x: 120, y: 110, speed: 0, tilt: 0 },
        { id: 502, kind: 'tab', x: 140, y: 115, speed: 0, tilt: 0 },
        { id: 503, kind: 'tab', x: 160, y: 120, speed: 0, tilt: 0 },
        { id: 504, kind: 'tab', x: 200, y: 125, speed: 0, tilt: 0 },
      ],
    }

    const first = catchCanAt(state, 180, 80)
    expect(first.caught).toBe(true)
    state = first.state
    expect(state.pullTabs).toBe(1)
    expect(state.tabsCaught).toBe(1)
    expect(state.crucibleCans).toBe(0)

    for (let index = 1; index < BRAL_TABS_PER_COIN - 1; index += 1) {
      state = catchLowestCan(state).state
    }
    expect(state.pullTabs).toBe(4)
    expect(state.crucibleCans).toBe(0)

    state = catchLowestCan(state).state
    expect(state.pullTabs).toBe(0)
    expect(state.tabsCaught).toBe(BRAL_TABS_PER_COIN)
    expect(state.crucibleCans).toBe(BRAL_CANS_PER_COIN)
    expect(state.shortageNotice?.text).toBe('PULL-TAB STRIKE · METAL READY')

    // Smelt nødslaget ved optimal temperatur og præg alle tre valører.
    for (let step = 0; step < 25; step += 1) {
      state = stepBral({ ...state, ovenTemp: 660 }, 0.1, () => 0.5)
    }
    expect(state.molten).toBe(BRAL_CANS_PER_COIN)

    state = strikeCoin({ ...state, markerPos: 0.05 })
    expect(state.score).toBe(1)
    expect(state.coins).toBe(1)

    state = strikeCoin({
      ...state,
      strikeCooldown: 0,
      molten: BRAL_CANS_PER_COIN,
      markerPos: 0.32,
    })
    expect(state.score).toBe(6)
    expect(state.coins).toBe(2)

    state = strikeCoin({
      ...state,
      strikeCooldown: 0,
      molten: BRAL_CANS_PER_COIN,
      markerPos: 0.5,
    })
    expect(state.score).toBe(16)
    expect(state.coins).toBe(3)
    expect(bralScoreIsPlausible(state.score, state.coins, 1)).toBe(true)
  })

  it('kniber diglen under dåsemangel uden ølstafet men holder ringtræk-prægning i gang under loftet', () => {
    let state = startBral(() => 0.5)

    for (let tick = 0; tick < BRAL_DURATION_SECONDS * 20; tick += 1) {
      if (state.status !== 'playing') break
      if (ovenZone(state.ovenTemp) === 'cold' || state.ovenTemp < 650) {
        state = pumpBellows(state)
      }
      while (state.cans.length > 0) {
        state = catchLowestCan(state).state
      }
      if (canStrike(state)) {
        state = strikeCoin({ ...state, markerPos: 0.5 })
      }
      state = stepBral(state, 0.05, () => 0.5)
    }

    expect(state.status).toBe('over')
    expect(state.shortage).toBe('active')
    expect(state.tabsCaught).toBeGreaterThanOrEqual(BRAL_TABS_PER_COIN)
    expect(state.coins).toBeGreaterThan(15)
    expect(state.coins).toBeLessThan(BRAL_MAX_COINS_PER_GAME)
    expect(bralScoreIsPlausible(state.score, state.coins, 1)).toBe(true)
  })
})
