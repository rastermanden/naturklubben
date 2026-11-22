import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { toFriendlyCalendarError } from './guestRequestErrors'
import {
  MEAL_CATEGORIES,
  wishesByCategory,
  type MealCategoryId,
} from './mealCategories'

/**
 * Mad og indkøb på en begivenhed.
 *
 * Uden en plan ser kun arrangøren og admins sektionen, så de kan oprette den.
 * Alle medlemmer kan skrive ønsker og se listen, når planen findes.
 */
export function EventMealSection({ eventId }: { eventId: Id<'events'> }) {
  const meal = useQuery(api.meals.forEvent, { eventId })
  const members = useQuery(
    api.members.listMembers,
    meal?.canManage === true ? {} : 'skip',
  )
  const startMeal = useMutation(api.meals.startMeal)
  const setBuyer = useMutation(api.meals.setBuyer)
  const addWish = useMutation(api.meals.addWish)
  const deleteWish = useMutation(api.meals.deleteWish)
  const [mainDish, setMainDish] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [wishText, setWishText] = useState('')
  const [category, setCategory] = useState<MealCategoryId>('paalaeg')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (meal === undefined) return null
  if (meal.plan === null && !meal.canManage) return null

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(toFriendlyCalendarError(cause))
    } finally {
      setBusy(false)
    }
  }

  function handleStart(formEvent: FormEvent) {
    formEvent.preventDefault()
    const dish = mainDish.trim()
    if (dish === '') return
    void run(async () => {
      await startMeal({
        eventId,
        mainDish: dish,
        buyerId: buyerId === '' ? null : (buyerId as Id<'profiles'>),
      })
      setMainDish('')
    })
  }

  function handleWish(formEvent: FormEvent) {
    formEvent.preventDefault()
    const text = wishText.trim()
    if (text === '') return
    void run(async () => {
      await addWish({ eventId, category, text })
      setWishText('')
    })
  }

  const groups = meal.plan === null ? [] : wishesByCategory(meal.wishes)

  return (
    <section
      className="mt-6 border-t border-line pt-5"
      aria-labelledby="meal-heading"
    >
      <h3 id="meal-heading" className="font-semibold text-ink-body">
        Mad og indkøb
      </h3>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {meal.plan === null ? (
        <form onSubmit={handleStart} className="mt-3 flex flex-col gap-3">
          <label className="block text-sm text-ink-subtle" htmlFor="meal-dish">
            Hovedret
            <input
              id="meal-dish"
              type="text"
              value={mainDish}
              onChange={(event) => setMainDish(event.target.value)}
              placeholder="Fx chili con carne"
              maxLength={80}
              className="mt-1 min-h-11 w-full rounded border border-line-strong px-3 py-2 text-base text-ink"
            />
          </label>
          <BuyerSelect
            members={members}
            value={buyerId}
            disabled={busy}
            onChange={setBuyerId}
          />
          <button
            type="submit"
            disabled={busy || mainDish.trim() === ''}
            className="min-h-11 self-start rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
          >
            Opret listen
          </button>
        </form>
      ) : (
        <>
          <dl className="mt-3 grid gap-3 text-ink">
            <div>
              <dt className="text-sm font-medium text-ink-subtle">Hovedret</dt>
              <dd>{meal.plan.mainDish}</dd>
            </div>
            {meal.plan.buyerName !== null && (
              <div>
                <dt className="text-sm font-medium text-ink-subtle">
                  Madansvarlig
                </dt>
                <dd>{meal.plan.buyerName}</dd>
              </div>
            )}
          </dl>
          {meal.plan.isBuyer && (
            <p className="mt-3 text-sm text-ink-body">Du står for indkøbet.</p>
          )}
          {meal.canManage && (
            <div className="mt-3">
              <BuyerSelect
                label="Skift madansvarlig"
                members={members}
                value={meal.plan.buyerId ?? ''}
                disabled={busy}
                onChange={(next) => {
                  void run(() =>
                    setBuyer({
                      eventId,
                      buyerId: next === '' ? null : (next as Id<'profiles'>),
                    }),
                  )
                }}
              />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.id}>
                <h4 className="text-sm font-medium text-ink-subtle">
                  {group.label}
                  {group.wishes.length > 0 && (
                    <span className="ml-2 font-normal">
                      ({group.wishes.length})
                    </span>
                  )}
                </h4>
                {group.wishes.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-subtle">Ingen endnu.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-2">
                    {group.wishes.map((wish) => (
                      <li
                        key={wish.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-sunken p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-ink">{wish.text}</p>
                          <p className="text-sm text-ink-subtle">
                            {wish.authorName}
                          </p>
                        </div>
                        {wish.canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              void run(() => deleteWish({ wishId: wish.id }))
                            }
                            disabled={busy}
                            className="min-h-11 rounded border border-danger-line-strong px-3 py-1 text-sm text-danger disabled:opacity-60"
                          >
                            Slet
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleWish}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <label className="sr-only" htmlFor="meal-wish">
              Ønske
            </label>
            <input
              id="meal-wish"
              type="text"
              value={wishText}
              onChange={(event) => setWishText(event.target.value)}
              placeholder="Skriv et ønske"
              maxLength={80}
              className="min-h-11 flex-1 rounded border border-line-strong px-3 py-2 text-base"
            />
            <label className="sr-only" htmlFor="meal-category">
              Kategori
            </label>
            <select
              id="meal-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as MealCategoryId)
              }
              className="min-h-11 rounded border border-line-strong px-3 py-2 text-base"
            >
              {MEAL_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || wishText.trim() === ''}
              className="min-h-11 rounded bg-accent px-4 py-2 text-white disabled:opacity-60"
            >
              Tilføj
            </button>
          </form>
        </>
      )}
    </section>
  )
}

function BuyerSelect({
  label = 'Madansvarlig',
  members,
  value,
  disabled,
  onChange,
}: {
  label?: string
  members: readonly { _id: Id<'profiles'>; fullName?: string }[] | undefined
  value: string
  disabled: boolean
  onChange: (buyerId: string) => void
}) {
  return (
    <label className="block text-sm text-ink-subtle" htmlFor="meal-buyer">
      {label}
      <select
        id="meal-buyer"
        value={value}
        disabled={disabled || members === undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded border border-line-strong px-3 py-2 text-base text-ink"
      >
        <option value="">Ikke valgt</option>
        {(members ?? []).map((member) => (
          <option key={member._id} value={member._id}>
            {member.fullName ?? 'Medlem'}
          </option>
        ))}
      </select>
    </label>
  )
}
