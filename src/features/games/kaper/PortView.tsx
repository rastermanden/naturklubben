import { useState, type FormEvent } from 'react'
import {
  MAX_CANNON,
  MAX_GRAIN,
  MAX_MEN,
  portName,
  type Action,
  type BuyItem,
  type KaperState,
  type Prices,
  type SellItem,
} from './engine'

interface PortViewProps {
  state: KaperState
  port: number
  prices: Prices
  arrival: string[] | null
  notice: string | null
  dispatch: (action: Action) => void
}

interface TradeRowProps {
  id: string
  label: string
  price: string
  action: string
  disabled?: boolean
  onSubmit: (amount: number) => void
}

/** Én handel: hvad, til hvilken pris, hvor mange -- og knappen. */
function TradeRow({
  id,
  label,
  price,
  action,
  disabled,
  onSubmit,
}: TradeRowProps) {
  const [amount, setAmount] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) return
    onSubmit(value)
    setAmount('')
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 last:border-b-0"
    >
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-ink-body">{label}</span>
        <span className="text-xs text-ink-subtle">{price}</span>
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Antal"
        disabled={disabled}
        className="h-11 w-20 rounded-lg border border-line bg-field px-2 text-ink-body"
      />
      <button
        type="submit"
        disabled={disabled}
        className="h-11 rounded-lg border border-line-strong bg-surface px-3 font-medium text-ink-body disabled:opacity-40"
      >
        {action}
      </button>
    </form>
  )
}

/**
 * Havnen: hyr folk, reparér, køb kanoner og korn, sælg hvad der kan sælges,
 * og sejl videre. Priserne svinger fra havn til havn, men der prutttes ikke.
 */
export function PortView({
  state,
  port,
  prices,
  arrival,
  notice,
  dispatch,
}: PortViewProps) {
  const buy = (item: BuyItem) => (amount: number) =>
    dispatch({ type: 'buy', item, amount })
  const sell = (item: SellItem) => (amount: number) =>
    dispatch({ type: 'sell', item, amount })

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-ink-body">
        Velkommen til {portName(port)}
      </h2>

      {arrival && (
        <div className="rounded-lg border border-warn-line bg-warn-surface p-3 text-sm text-warn-strong">
          {arrival.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-sm text-ink-muted"
      >
        {notice ?? `Du har ${state.taels} bral. Hvad skal det være?`}
      </p>

      <div className="flex flex-col">
        <TradeRow
          id="kaper-buy-men"
          label="Hyr mænd"
          price={`${prices.men} bral pr. mand · højst ${MAX_MEN - 1} om bord`}
          action="Hyr"
          onSubmit={buy('men')}
        />
        <TradeRow
          id="kaper-buy-repair"
          label="Reparér skibet"
          price={`${prices.repair} bral pr. reparationspoint`}
          action="Reparér"
          onSubmit={buy('repair')}
        />
        <TradeRow
          id="kaper-buy-cannon"
          label="Køb kanoner"
          price={`${prices.cannon} bral pr. kanon · højst ${MAX_CANNON - 1} om bord`}
          action="Køb"
          onSubmit={buy('cannon')}
        />
        <TradeRow
          id="kaper-buy-grain"
          label="Køb korn"
          price={`${prices.grain} bral pr. sæk · højst ${MAX_GRAIN - 1} om bord`}
          action="Køb"
          onSubmit={buy('grain')}
        />
        <TradeRow
          id="kaper-sell-grain"
          label="Sælg korn"
          price={`${prices.grain} bral pr. sæk · du har ${Math.floor(state.grain)}`}
          action="Sælg"
          onSubmit={sell('grain')}
        />
        <TradeRow
          id="kaper-sell-cannon"
          label="Sælg kanoner"
          price={`${prices.cannon} bral pr. kanon · du har ${state.cannon}`}
          action="Sælg"
          onSubmit={sell('cannon')}
        />
        <TradeRow
          id="kaper-sell-jewels"
          label="Sælg juveler"
          price={`${prices.jewels} bral pr. juvel · du har ${state.jewels}`}
          action="Sælg"
          disabled={state.jewels === 0}
          onSubmit={sell('jewels')}
        />
      </div>

      <button
        type="button"
        onClick={() => dispatch({ type: 'leave' })}
        className="min-h-11 self-start rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
      >
        Sejl videre
      </button>
    </div>
  )
}
