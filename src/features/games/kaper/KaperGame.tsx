import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/useAuth'
import { formatScore } from '../leaderboard'
import { usePersonalBest, useSubmitScore } from '../useGameScores'
import { CannonView } from './CannonView'
import {
  COMTESSE,
  HARBOUR_STEPS,
  RIVAL,
  enemyLabel,
  enemyNoun,
  levelOf,
  portName,
  rankName,
  type Action,
  type KaperState,
  type Screen,
} from './engine'
import { HarbourView } from './HarbourView'
import { MapView } from './MapView'
import { PortView } from './PortView'
import { useKaperGame } from './useKaperGame'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line-soft bg-surface px-2 py-1.5">
      <span className="text-xs text-ink-subtle">{label}</span>
      <span className="truncate font-semibold text-ink-body tabular-nums">
        {value}
      </span>
    </div>
  )
}

const primaryButton =
  'min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent'
const secondaryButton =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-5 py-2 font-medium text-ink-body'

/** En tekstskærm, som originalen havde dem: overskrift, et par linjer, valg. */
function Panel({
  title,
  lines,
  children,
}: {
  title: string
  lines?: readonly string[]
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-xl font-semibold text-ink-body">{title}</h2>
      {lines?.map((line, index) => (
        <p key={index} className="text-ink-muted">
          {line}
        </p>
      ))}
      {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
    </div>
  )
}

/** Fjendens tal ved siden af ens egne -- tavlen fra bunden af kanondækket. */
function StrengthTable({
  state,
  enemy,
}: {
  state: KaperState
  enemy: Extract<Screen, { kind: 'cannon' }>['enemy']
}) {
  const rows: [string, number, number][] = [
    ['Kanoner', state.cannon, enemy.guns],
    ['Mand', state.men, enemy.men],
    ['Reparation', state.repair, enemy.repair],
  ]
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-ink-subtle">
          <th scope="col" className="text-left font-normal" />
          <th scope="col" className="text-right font-normal">
            Dig
          </th>
          <th scope="col" className="text-right font-normal">
            {enemyLabel(enemy.type)}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, own, theirs]) => (
          <tr key={label} className="text-ink-body">
            <th scope="row" className="text-left font-normal text-ink-muted">
              {label}
            </th>
            <td className="text-right">{own}</td>
            <td className="text-right">{theirs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function describeShot(
  shot: NonNullable<Extract<Screen, { kind: 'cannon' }>['shot']>,
) {
  const own: string[] = []
  if (shot.repairLost > 0) own.push(`${shot.repairLost} reparationspoint`)
  if (shot.menLost > 0) own.push(`${shot.menLost} mand`)
  if (shot.cannonLost) own.push('en kanon')
  const reply =
    own.length > 0
      ? `Fjendens bredside kostede dig ${own.join(', ')}.`
      : 'Fjendens bredside gik forbi.'
  switch (shot.outcome) {
    case 'left':
      return `Forbi til venstre! ${reply}`
    case 'right':
      return `Forbi til højre! ${reply}`
    case 'short':
      return `For kort! ${reply}`
    case 'long':
      return `For langt -- kuglen gik hen over hende. ${reply}`
    default:
      return `Fuldtræffer! ${reply}`
  }
}

interface StageProps {
  state: KaperState
  dispatch: (action: Action) => void
}

/** Den skærm, spilleren står på lige nu. */
function Stage({ state, dispatch }: StageProps) {
  const { screen } = state
  const rank = rankName(levelOf(state))

  switch (screen.kind) {
    case 'map':
      return <MapView state={state} />

    case 'encounter':
      return (
        <Panel
          title="Udkiggen råber: Skib ohøj!"
          lines={[
            ...(screen.preface ? [screen.preface] : []),
            `${enemyLabel(screen.enemy.type)} i sigte, ${screen.enemy.distance} fod borte.`,
            `Nå, ${rank} ${state.captain} -- så må du vælge.`,
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'attack' })}
          >
            Angrib
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => dispatch({ type: 'flee' })}
          >
            Flygt
          </button>
        </Panel>
      )

    case 'attack':
      return (
        <Panel
          title="Hvordan vil du tage hende?"
          lines={[
            `${enemyLabel(screen.enemy.type)} med ${screen.enemy.guns} kanoner og ${screen.enemy.men} mand.`,
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'board' })}
          >
            Entring
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'shoot' })}
          >
            Kanoner
          </button>
        </Panel>
      )

    case 'cannon':
      return (
        <div className="flex flex-col gap-3">
          <CannonView
            enemy={screen.enemy}
            aim={screen.aim}
            wind={screen.wind}
            shot={screen.shot}
            onAim={(aim) => dispatch({ type: 'setAim', ...aim })}
          />
          <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <StrengthTable state={state} enemy={screen.enemy} />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-ink-muted"
              >
                {screen.shot
                  ? describeShot(screen.shot)
                  : `Sigte: ${screen.aim.elevation} i højden, ${screen.aim.side} til siden.`}
              </p>
              {screen.shot ? (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => dispatch({ type: 'dismissShot' })}
                >
                  Videre
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <div className="grid grid-cols-3 gap-1">
                    <span />
                    <button
                      type="button"
                      aria-label="Sigt højere"
                      className={secondaryButton + ' px-3'}
                      onClick={() =>
                        dispatch({ type: 'aim', elevation: -5, side: 0 })
                      }
                    >
                      ↑
                    </button>
                    <span />
                    <button
                      type="button"
                      aria-label="Sigt til venstre"
                      className={secondaryButton + ' px-3'}
                      onClick={() =>
                        dispatch({ type: 'aim', elevation: 0, side: -5 })
                      }
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="Sigt lavere"
                      className={secondaryButton + ' px-3'}
                      onClick={() =>
                        dispatch({ type: 'aim', elevation: 5, side: 0 })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Sigt til højre"
                      className={secondaryButton + ' px-3'}
                      onClick={() =>
                        dispatch({ type: 'aim', elevation: 0, side: 5 })
                      }
                    >
                      →
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className={primaryButton}
                      onClick={() => dispatch({ type: 'fire' })}
                    >
                      Fyr!
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => dispatch({ type: 'withdraw' })}
                    >
                      Træk dig tilbage
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )

    case 'boarding':
      return (
        <Panel
          title={`Kampen raser om bord på ${enemyNoun(screen.enemy.type)}!`}
          lines={[
            `Fjenden har ${screen.enemyDead} døde, men har ${screen.enemy.men} tilbage.`,
            `Du har mistet ${screen.ownDead} af dine tapre folk.`,
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'board' })}
          >
            Kæmp videre
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => dispatch({ type: 'retreat' })}
          >
            Tilbage til skibet
          </button>
        </Panel>
      )

    case 'surrender':
      return (
        <Panel
          title="De overgiver sig!"
          lines={[
            `Der er ${screen.enemy.taels} taels om bord på hende.`,
            screen.survivors > 1
              ? `Der er ${screen.survivors} overlevende.`
              : 'Dækket er oversvømmet af lig.',
            `Der er ${screen.grain} sække korn om bord. Dem tager du!`,
            `Skibet kræver et prisemandskab på ${screen.prizeCrew} mand. Du har ${state.men} mand.`,
            'Sænker du hende, eller tager du hende som prise?',
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'sink' })}
          >
            Sænk hende
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'prize' })}
          >
            Tag hende som prise
          </button>
        </Panel>
      )

    case 'mist':
      return (
        <Panel
          title="Udkiggen melder: Ohøj!"
          lines={[
            'Der ligger en sær tåge et par sømil om styrbord. Der ser ud til at være noget inde i den.',
            `Nå, ${rank} ${state.captain} -- så må du vælge. Vil du undersøge den?`,
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'investigate' })}
          >
            Ja, sejl derind
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => dispatch({ type: 'ignore' })}
          >
            Nej, sejl videre
          </button>
        </Panel>
      )

    case 'harbourIntro':
      return (
        <Panel
          title={`Du sejler ind i ${portName(screen.port)}`}
          lines={[
            'Styr uden om skibene, der ligger for anker uden for havnen. Rammer du et af dem, tager dit skib skade -- men rammer du ved siden af havneindløbet, overlever du det ikke!',
            `Pas på vindstød fra ${screen.windDirection < 0 ? 'højre' : 'venstre'}!`,
            'Tryk i venstre eller højre side af billedet -- eller brug pilene -- for at styre.',
          ]}
        >
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'continue' })}
          >
            Sæt kursen
          </button>
        </Panel>
      )

    case 'harbour':
      return (
        <div className="flex flex-col gap-3">
          <HarbourView
            harbour={screen.harbour}
            onSteer={(dx) => dispatch({ type: 'steer', dx })}
          />
          <div className="flex items-center justify-between gap-3 px-3 pb-3">
            <button
              type="button"
              aria-label="Styr til venstre"
              className={secondaryButton + ' flex-1 text-xl'}
              onClick={() => dispatch({ type: 'steer', dx: -1 })}
            >
              ←
            </button>
            <p role="status" className="text-sm text-ink-muted tabular-nums">
              {screen.harbour.row} / {HARBOUR_STEPS}
            </p>
            <button
              type="button"
              aria-label="Styr til højre"
              className={secondaryButton + ' flex-1 text-xl'}
              onClick={() => dispatch({ type: 'steer', dx: 1 })}
            >
              →
            </button>
          </div>
        </div>
      )

    case 'port':
      return (
        <div className="p-4">
          <PortView
            state={state}
            port={screen.port}
            prices={screen.prices}
            arrival={screen.arrival}
            notice={screen.notice}
            dispatch={dispatch}
          />
        </div>
      )

    case 'report':
      return (
        <Panel title={screen.title} lines={screen.lines}>
          <button
            type="button"
            className={primaryButton}
            onClick={() => dispatch({ type: 'continue' })}
          >
            Videre
          </button>
        </Panel>
      )

    case 'over':
      return <Panel title={screen.title} lines={screen.lines} />

    default:
      return null
  }
}

/** Otte-vejs-styring til kortet. */
function Compass({
  dispatch,
  disabled,
}: {
  dispatch: (action: Action) => void
  disabled: boolean
}) {
  // Skrå pile er en drejet lige pil: tegnene ↖↗↙↘ bliver til emoji på en
  // telefon og ligner så ikke de andre fire.
  const directions: {
    label: string
    rotate: string
    dx: -1 | 0 | 1
    dy: -1 | 0 | 1
  }[] = [
    { label: 'Nordvest', rotate: '-rotate-45', dx: -1, dy: -1 },
    { label: 'Nord', rotate: '', dx: 0, dy: -1 },
    { label: 'Nordøst', rotate: 'rotate-45', dx: 1, dy: -1 },
    { label: 'Vest', rotate: '-rotate-90', dx: -1, dy: 0 },
    { label: 'Øst', rotate: 'rotate-90', dx: 1, dy: 0 },
    { label: 'Sydvest', rotate: '-rotate-135', dx: -1, dy: 1 },
    { label: 'Syd', rotate: 'rotate-180', dx: 0, dy: 1 },
    { label: 'Sydøst', rotate: 'rotate-135', dx: 1, dy: 1 },
  ]
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
      {directions.map((direction, index) => (
        <button
          key={direction.label}
          type="button"
          aria-label={`Sejl mod ${direction.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() =>
            dispatch({ type: 'move', dx: direction.dx, dy: direction.dy })
          }
          className={`flex h-14 select-none items-center justify-center rounded-xl border border-line-strong bg-surface text-xl text-ink-body active:bg-surface-raised disabled:opacity-40 ${
            index === 4 ? 'col-start-3' : ''
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block ${direction.rotate}`}
          >
            ↑
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Kaptajn Kaper i Kattegat, som medlemmerne møder det: tallene, kortet og de
 * skærme, spillet skifter imellem -- og turen fra "spillet er slut" til en
 * linje på klubbens resultatliste.
 */
export function KaperGame() {
  const { session } = useAuth()
  const userId = session?.user.id
  const metadataName = session?.user.user_metadata?.full_name
  const defaultName =
    typeof metadataName === 'string' ? metadataName.trim().split(/\s+/)[0] : ''

  const controls = useKaperGame()
  const { state, dispatch } = controls
  const [captain, setCaptain] = useState(defaultName)

  const personalBest = usePersonalBest('kaper', userId)
  const submitScore = useSubmitScore('kaper', userId)
  const submitted = useRef(false)
  const bestBeforeGame = useRef(0)
  const [record, setRecord] = useState(false)

  function startGame() {
    submitted.current = false
    setRecord(false)
    bestBeforeGame.current = personalBest.data?.score ?? 0
    controls.start(captain)
  }

  const saveResult = useCallback(() => {
    if (!userId || state.points <= 0) return
    submitScore.mutate({
      score: state.points,
      lines: state.moves,
      level: levelOf(state),
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - controls.startedAt) / 1000),
      ),
    })
  }, [controls.startedAt, state, submitScore, userId])

  useEffect(() => {
    if (state.status !== 'over' || submitted.current) return
    submitted.current = true
    setRecord(state.points > bestBeforeGame.current)
    saveResult()
  }, [saveResult, state.points, state.status])

  const onMap = state.status === 'running' && state.screen.kind === 'map'
  const level = levelOf(state)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Point" value={formatScore(state.points)} />
        <StatTile label="Mål" value={formatScore(state.pointGoal)} />
        <StatTile label="Træk" value={String(state.moves)} />
        <StatTile label="Frist (træk)" value={String(state.moveLimit)} />
        <StatTile label="Rang" value={rankName(level)} />
        <StatTile label="Taels" value={formatScore(state.taels)} />
        <StatTile label="Mand" value={String(state.men)} />
        <StatTile label="Kanoner" value={String(state.cannon)} />
        <StatTile label="Korn" value={String(Math.floor(state.grain))} />
        <StatTile label="Reparation" value={String(state.repair)} />
        <StatTile label="Juveler" value={String(state.jewels)} />
        <StatTile
          label="Prise på vej"
          value={state.prizeMen > 0 ? `${state.prizeMen} mand` : '–'}
        />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line-soft bg-surface">
        {state.status === 'idle' ? (
          <>
            <div aria-hidden="true" className="opacity-40">
              <MapView state={state} />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                startGame()
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65 p-4 text-center text-white"
            >
              <p className="text-xl font-semibold">Kaptajn Kaper i Kattegat</p>
              <p className="max-w-sm text-sm text-white/80">
                Kongen har givet dig kaperbrev. Tag de engelske skibe, sejl
                priserne til København, og bliv adlet, før {RIVAL} får{' '}
                {COMTESSE}.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                Hvad hedder du, kaptajn?
                <input
                  type="text"
                  value={captain}
                  onChange={(event) => setCaptain(event.target.value)}
                  maxLength={30}
                  autoComplete="off"
                  className="h-11 rounded-lg border border-white/40 bg-white/10 px-3 text-center text-white"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-white px-5 py-2 font-medium text-ink"
              >
                Stik til søs
              </button>
            </form>
          </>
        ) : (
          <Stage state={state} dispatch={dispatch} />
        )}

        {state.status === 'over' && (
          <div className="flex flex-col items-start gap-2 border-t border-line-soft p-4">
            <p className="font-medium text-ink-body">
              {state.outcome === 'won' ? 'Du vandt' : 'Spillet er slut'} med{' '}
              {formatScore(state.points)} point efter {state.moves} træk.
            </p>
            {record && state.points > 0 && (
              <p className="text-sm font-medium text-warn">
                Ny personlig rekord!
              </p>
            )}
            {submitScore.isPending && (
              <p className="text-sm text-ink-subtle">Gemmer resultatet…</p>
            )}
            {submitScore.isError && (
              <button
                type="button"
                onClick={saveResult}
                className={secondaryButton + ' text-sm'}
              >
                Resultatet blev ikke gemt. Prøv igen
              </button>
            )}
            {submitScore.isSuccess && (
              <p className="text-sm text-ink-subtle">
                Resultatet er på listen.
              </p>
            )}
            <button type="button" onClick={startGame} className={primaryButton}>
              Spil igen
            </button>
          </div>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center text-sm text-ink-subtle"
      >
        {state.status === 'running' && state.screen.kind === 'map'
          ? (state.notice ?? '')
          : ''}
      </p>

      {(state.status !== 'running' || onMap) && (
        <Compass dispatch={dispatch} disabled={!onMap} />
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {personalBest.data && (
          <p className="text-sm text-ink-subtle">
            Din rekord: {formatScore(personalBest.data.score)} point
          </p>
        )}
      </div>

      {!userId && (
        <p className="text-center text-sm text-ink-subtle">
          Log ind for at få dit resultat på klubbens liste.
        </p>
      )}

      <details className="rounded-xl border border-line-soft bg-surface p-4 text-sm text-ink-muted">
        <summary className="cursor-pointer font-medium text-ink-body">
          Sådan spiller du
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p>
            Vi skriver tiden lige efter Slaget på Reden. Englænderne har taget
            det meste af flåden, og kongen har givet dig kaperbrev: tag alle de
            engelske skibe, du kan finde, og sejl priserne til København. Får du
            point nok, adler kongen dig -- og så kan du gifte dig med {COMTESSE}
            . Men skynd dig: {RIVAL} har også et godt øje til hende.
          </p>
          <ul className="flex flex-col gap-1">
            <li>
              <strong className="text-ink-body">Kortet:</strong> sejl i otte
              retninger med knapperne, piletasterne eller taltastaturet. Land
              koster reparationspoint, og for hvert træk spiser besætningen
              korn.
            </li>
            <li>
              <strong className="text-ink-body">Møder:</strong> angrib eller
              flygt. Hver flugt sænker moralen, så folkene kæmper dårligere
              bagefter.
            </li>
            <li>
              <strong className="text-ink-body">Kanoner:</strong> sigt højere
              for at skyde længere, og hold imod sidevinden. Sprøjtet viser,
              hvor kuglen landede. Er afstanden håbløs, så træk dig tilbage og
              prøv fra en ny afstand.
            </li>
            <li>
              <strong className="text-ink-body">Entring:</strong> koster folk på
              begge sider, men skibet synker aldrig, så pengene er dine.
            </li>
            <li>
              <strong className="text-ink-body">Priser:</strong> et
              prisemandskab sejler skibet til København. De fleste når frem --
              og venter dér med prisepengene.
            </li>
            <li>
              <strong className="text-ink-body">Havne:</strong> styr uden om
              skibene på reden og ind gennem hullet i molen. Så kan du hyre
              folk, reparere, købe kanoner og korn og sælge, hvad du har.
            </li>
            <li>
              <strong className="text-ink-body">Grænser:</strong> under 20
              reparationspoint eller 10 mand synker skibet. Mere end 500 mand,
              150 kanoner, 700 sække korn eller 30.000 taels gør det samme.
            </li>
          </ul>
          <p>
            Spillet er en genskrivning af P.O. Frederiksens "Kaptajn Kaper i
            Kattegat" fra 1980'erne, som han selv gav fri til alle.
          </p>
        </div>
      </details>
    </div>
  )
}
