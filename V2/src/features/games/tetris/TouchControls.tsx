import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Direction, TetrisControls } from './useTetrisGame'

/**
 * Knapperne under brættet. De findes, selv om brættet også kan styres med
 * fingeren: en knap kan ses, kan rammes uden at kende en gestik, og kan
 * betjenes af en skærmlæser -- det kan et træk hen over et canvas ikke.
 */
interface TouchControlsProps {
  controls: TetrisControls
  disabled: boolean
}

const buttonClass =
  'flex h-14 min-w-14 flex-1 select-none items-center justify-center rounded-xl border border-line-strong bg-surface text-xl text-ink-body active:bg-surface-raised disabled:opacity-40'

/** En knap, der bliver ved, så længe den holdes nede. */
function HoldButton({
  label,
  direction,
  controls,
  disabled,
  children,
}: {
  label: string
  direction: Direction
  controls: TetrisControls
  disabled: boolean
  children: ReactNode
}) {
  function hold(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    controls.press(direction)
  }

  function stop() {
    controls.release(direction)
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={hold}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(event) => {
        // Tastaturets Enter/mellemrum giver et klik uden et forudgående
        // pointer-tryk (detail 0). Så skal knappen flytte brikken ét felt.
        if (event.detail === 0) {
          controls.press(direction)
          controls.release(direction)
        }
      }}
      className={buttonClass}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function TapButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string
  onPress: () => void
  disabled: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={buttonClass}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

export function TouchControls({ controls, disabled }: TouchControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <TapButton
          label="Drej mod uret"
          onPress={controls.rotateCcw}
          disabled={disabled}
        >
          ↺
        </TapButton>
        <TapButton
          label="Drej med uret"
          onPress={controls.rotateCw}
          disabled={disabled}
        >
          ↻
        </TapButton>
        <TapButton
          label="Gem brikken"
          onPress={controls.hold}
          disabled={disabled}
        >
          ⇄
        </TapButton>
      </div>
      <div className="flex gap-2">
        <HoldButton
          label="Flyt til venstre"
          direction="left"
          controls={controls}
          disabled={disabled}
        >
          ←
        </HoldButton>
        <HoldButton
          label="Sænk brikken"
          direction="down"
          controls={controls}
          disabled={disabled}
        >
          ↓
        </HoldButton>
        <HoldButton
          label="Flyt til højre"
          direction="right"
          controls={controls}
          disabled={disabled}
        >
          →
        </HoldButton>
        <TapButton
          label="Smid brikken ned"
          onPress={controls.hardDrop}
          disabled={disabled}
        >
          ⤓
        </TapButton>
      </div>
    </div>
  )
}
