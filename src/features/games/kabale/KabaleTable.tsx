import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  canLift,
  cardLabel,
  isLegal,
  isRed,
  rankShort,
  stockAction,
  suitSymbol,
  topCard,
  type Card,
  type GameState,
  type Move,
  type Zone,
} from './engine'

interface Selection {
  zone: Zone
  /** Første kort i serien, når zonen er en række. Ellers 0. */
  start: number
}

interface Ghost {
  cards: Card[]
  x: number
  y: number
  width: number
}

const DOUBLE_TAP_MS = 350
const DRAG_SLOP = 12

/**
 * Selve bordet: kortene, tryk og træk. Reglerne bliver spurgt, før et træk
 * sendes videre — en ulovlig landing bliver bare stående.
 */
export function KabaleTable({
  state,
  onMove,
  onDraw,
  onFoundation,
}: {
  state: GameState
  onMove: (move: Move) => void
  onDraw: () => void
  onFoundation: (from: Zone) => void
}) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [seenMoves, setSeenMoves] = useState(state.moves)
  const [seenStatus, setSeenStatus] = useState(state.status)
  if (seenMoves !== state.moves || seenStatus !== state.status) {
    setSeenMoves(state.moves)
    setSeenStatus(state.status)
    setSelection(null)
    setGhost(null)
  }
  const lastTap = useRef<{ key: string; time: number } | null>(null)
  const suppressClick = useRef(false)
  const drag = useRef<{
    source: Selection
    x: number
    y: number
    moved: boolean
    pointerId: number
  } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  function play(source: Selection, to: Zone) {
    const move = selectionMove(state, source, to)
    if (!move || !isLegal(state, move)) return false
    setSelection(null)
    onMove(move)
    return true
  }

  function handleTap(source: Selection) {
    const key = sourceKey(source)
    const now = performance.now()
    const previous = lastTap.current
    if (
      previous &&
      previous.key === key &&
      now - previous.time < DOUBLE_TAP_MS
    ) {
      lastTap.current = null
      if (isTop(state, source)) onFoundation(source.zone)
      setSelection(null)
      return
    }
    lastTap.current = { key, time: now }

    if (selection && !sameSelection(selection, source)) {
      if (play(selection, source.zone)) return
    }
    if (selection && sameSelection(selection, source)) {
      setSelection(null)
      return
    }
    const start = source.zone.kind === 'tableau' ? source.start : 0
    setSelection(canLift(state, source.zone, start) ? source : null)
  }

  function handleZone(zone: Zone) {
    if (!selection) return
    play(selection, zone)
  }

  function onPointerDown(event: ReactPointerEvent, source: Selection) {
    if (event.button !== 0 || state.status !== 'playing') return
    const start = source.zone.kind === 'tableau' ? source.start : 0
    if (!canLift(state, source.zone, start)) return
    const target = event.currentTarget
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // jsdom og en afbrudt pegepind har ikke noget at fange.
      }
    }
    drag.current = {
      source,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    }
  }

  function onPointerMove(event: ReactPointerEvent) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) >
        DRAG_SLOP
    ) {
      current.moved = true
    }
    if (!current.moved) return
    setGhost({
      cards: cardsFor(state, current.source),
      x: event.clientX,
      y: event.clientY,
      width: cardWidth(boardRef.current),
    })
  }

  function onPointerUp(event: ReactPointerEvent) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (!current.moved) return
    setGhost(null)
    const zone = zoneFrom(
      document.elementFromPoint(event.clientX, event.clientY),
    )
    // En lille bevægelse må ikke sluge trykket. Kun et træk, der faktisk
    // lander, erstatter klikket — ellers vælges kortet, som om man trykkede.
    if (zone && play(current.source, zone)) {
      suppressClick.current = true
    }
  }

  function onClick(source: Selection) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    handleTap(source)
  }

  const action = stockAction(state)
  const stockLabel =
    action === 'draw'
      ? `Bunken, ${state.stock.length} kort. Træk ${
          state.drawCount === 1 ? 'et kort' : 'op til tre kort'
        }.`
      : action === 'recycle'
        ? 'Vend bunken'
        : 'Bunken er tom'

  return (
    <div
      ref={boardRef}
      data-testid="kabale-board"
      className="touch-none rounded-xl bg-[#14532d] p-2 select-none sm:p-3"
    >
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        <button
          type="button"
          data-testid="stock"
          data-zone="stock"
          disabled={action === null}
          aria-label={stockLabel}
          onClick={() => {
            setSelection(null)
            onDraw()
          }}
          className="aspect-[5/7] min-w-0 rounded-md disabled:opacity-70"
        >
          {action === 'recycle' ? (
            <EmptySlot label="↻" />
          ) : state.stock.length > 0 ? (
            <span className="relative block h-full">
              <CardBack />
              <span className="absolute right-0.5 bottom-0.5 rounded bg-black/45 px-1 text-[10px] font-semibold text-white">
                {state.stock.length}
              </span>
            </span>
          ) : (
            <EmptySlot />
          )}
        </button>

        <div
          className={`relative col-span-2 min-w-0 ${zoneClass(state, selection, { kind: 'waste' })}`}
          data-zone="waste"
          data-testid="waste"
        >
          {state.waste.length === 0 ? (
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <EmptySlot />
            </div>
          ) : (
            <WastePile
              cards={state.waste}
              drawCount={state.drawCount}
              selected={selection?.zone.kind === 'waste'}
              onClick={onClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          )}
        </div>

        {state.foundations.map((pile, index) => {
          const zone: Zone = { kind: 'foundation', index }
          const top = topCard(pile)
          return (
            <div
              key={index}
              data-zone="foundation"
              data-index={index}
              className={`min-w-0 ${zoneClass(state, selection, zone)}`}
            >
              {top ? (
                <CardButton
                  card={top}
                  label={`${cardLabel(top)}, grundbunke`}
                  pressed={
                    selection?.zone.kind === 'foundation' &&
                    selection.zone.index === index
                  }
                  onClick={() => onClick({ zone, start: 0 })}
                  onPointerDown={(event) =>
                    onPointerDown(event, { zone, start: 0 })
                  }
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Tom grundbunke ${index + 1}`}
                  onClick={() => handleZone(zone)}
                  className="block w-full"
                >
                  <EmptySlot label="E" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-7 items-start gap-1 sm:gap-2">
        {state.tableau.map((column, index) => {
          const zone: Zone = { kind: 'tableau', index }
          return (
            <div
              key={index}
              data-zone="tableau"
              data-index={index}
              className={`min-w-0 rounded-md ${zoneClass(state, selection, zone)}`}
            >
              {column.length === 0 ? (
                <button
                  type="button"
                  aria-label={`Tom række ${index + 1}`}
                  onClick={() => handleZone(zone)}
                  className="block w-full"
                >
                  <EmptySlot />
                </button>
              ) : (
                <ol className="flex flex-col">
                  {column.map((card, cardIndex) => {
                    const faceUp = card.faceUp
                    const source: Selection = { zone, start: cardIndex }
                    const pressed =
                      selection?.zone.kind === 'tableau' &&
                      selection.zone.index === index &&
                      cardIndex >= selection.start
                    return (
                      <li
                        key={card.id}
                        className="relative"
                        style={{
                          zIndex: cardIndex,
                          marginTop:
                            cardIndex === 0
                              ? undefined
                              : faceUp
                                ? '-82%'
                                : '-118%',
                        }}
                      >
                        {faceUp ? (
                          <CardButton
                            card={card}
                            label={`${cardLabel(card)}, række ${index + 1}`}
                            pressed={pressed}
                            onClick={() => onClick(source)}
                            onPointerDown={(event) =>
                              onPointerDown(event, source)
                            }
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                          />
                        ) : (
                          <div
                            className="aspect-[5/7] w-full"
                            aria-hidden="true"
                          >
                            <CardBack />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {selection ? `${labelFor(state, selection)} valgt` : ''}
      </p>

      {ghost &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50"
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghost.width,
              transform: 'translate(-50%, -70%)',
            }}
          >
            {ghost.cards.slice(0, 3).map((card, index) => (
              <div
                key={card.id}
                className="relative"
                style={{ marginTop: index === 0 ? 0 : '-82%' }}
              >
                <CardFace card={card} lifted />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

function WastePile({
  cards,
  drawCount,
  selected,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  cards: Card[]
  drawCount: 1 | 3
  selected: boolean
  onClick: (source: Selection) => void
  onPointerDown: (event: ReactPointerEvent, source: Selection) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  const peek = drawCount === 3 ? 3 : 1
  const visible = cards.slice(-peek)
  const source: Selection = { zone: { kind: 'waste' }, start: 0 }
  return (
    <>
      {visible.map((card, index) => {
        const top = index === visible.length - 1
        return (
          <div
            key={card.id}
            className="absolute top-0 h-full"
            style={{
              left: index * 12,
              aspectRatio: '5 / 7',
              zIndex: index,
            }}
          >
            {top ? (
              <CardButton
                card={card}
                label={`${cardLabel(card)}, talon`}
                pressed={selected}
                onClick={() => onClick(source)}
                onPointerDown={(event) => onPointerDown(event, source)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            ) : (
              <div className="pointer-events-none h-full" aria-hidden="true">
                <CardFace card={card} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function CardButton({
  card,
  label,
  pressed,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card
  label: string
  pressed: boolean
  onClick: () => void
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragStart={(event) => event.preventDefault()}
      className="block w-full rounded-md text-left"
    >
      <CardFace card={card} lifted={pressed} />
    </button>
  )
}

function CardFace({ card, lifted = false }: { card: Card; lifted?: boolean }) {
  const color = isRed(card.suit) ? 'text-[#b91c1c]' : 'text-[#1c1917]'
  return (
    <span
      className={`relative flex aspect-[5/7] w-full flex-col rounded-md bg-white shadow-sm ${color} ${
        lifted
          ? 'ring-2 ring-[#fbbf24] ring-offset-1 ring-offset-[#14532d]'
          : ''
      }`}
    >
      <span className="px-0.5 pt-0.5 text-left text-[0.6rem] leading-none font-bold sm:text-xs">
        {rankShort(card.rank)}
        <span
          className="block text-[0.7rem] leading-none sm:text-sm"
          aria-hidden="true"
        >
          {suitSymbol(card.suit)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-base sm:text-2xl"
      >
        {suitSymbol(card.suit)}
      </span>
    </span>
  )
}

function CardBack() {
  return (
    <span
      aria-hidden="true"
      className="flex aspect-[5/7] w-full items-center justify-center rounded-md border border-white/30 bg-[#0c3d22] text-base text-white/55 sm:text-lg"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.07) 4px, rgba(255,255,255,0.07) 5px)',
      }}
    >
      ♣
    </span>
  )
}

function EmptySlot({ label }: { label?: string }) {
  return (
    <span className="flex aspect-[5/7] w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-black/15 text-sm font-semibold text-white/40">
      {label ?? ''}
    </span>
  )
}

function zoneClass(state: GameState, selection: Selection | null, zone: Zone) {
  if (!selection) return ''
  const move = selectionMove(state, selection, zone)
  if (!move || !isLegal(state, move)) return ''
  return 'rounded-md ring-2 ring-white/90'
}

function selectionMove(
  state: GameState,
  selection: Selection,
  to: Zone,
): Move | null {
  if (selection.zone.kind === 'stock' || to.kind === 'stock') return null
  if (selection.zone.kind === 'tableau') {
    const column = state.tableau[selection.zone.index]
    if (!column) return null
    return {
      from: selection.zone,
      to,
      count: column.length - selection.start,
    }
  }
  return { from: selection.zone, to, count: 1 }
}

function sameSelection(a: Selection, b: Selection): boolean {
  return sourceKey(a) === sourceKey(b)
}

function sourceKey(source: Selection): string {
  if (source.zone.kind === 'tableau') {
    return `tableau-${source.zone.index}-${source.start}`
  }
  if (source.zone.kind === 'foundation')
    return `foundation-${source.zone.index}`
  return source.zone.kind
}

function isTop(state: GameState, source: Selection): boolean {
  if (source.zone.kind !== 'tableau') return true
  const column = state.tableau[source.zone.index]
  return Boolean(column) && source.start === column.length - 1
}

function cardsFor(state: GameState, source: Selection): Card[] {
  if (source.zone.kind === 'waste') {
    const card = topCard(state.waste)
    return card ? [card] : []
  }
  if (source.zone.kind === 'foundation') {
    const card = topCard(state.foundations[source.zone.index] ?? [])
    return card ? [card] : []
  }
  if (source.zone.kind === 'tableau') {
    return state.tableau[source.zone.index]?.slice(source.start) ?? []
  }
  return []
}

function labelFor(state: GameState, source: Selection): string {
  const card = cardsFor(state, source)[0]
  return card ? cardLabel(card) : 'Kort'
}

function zoneFrom(element: Element | null): Zone | null {
  const node = element?.closest('[data-zone]')
  if (!node) return null
  const kind = node.getAttribute('data-zone')
  const index = Number(node.getAttribute('data-index'))
  if (kind === 'waste') return { kind: 'waste' }
  if (kind === 'foundation' && Number.isInteger(index)) {
    return { kind: 'foundation', index }
  }
  if (kind === 'tableau' && Number.isInteger(index)) {
    return { kind: 'tableau', index }
  }
  return null
}

function cardWidth(board: HTMLDivElement | null): number {
  const column = board?.querySelector('[data-zone="tableau"]')
  const width = column?.getBoundingClientRect().width
  return width && width > 0 ? width : 48
}
