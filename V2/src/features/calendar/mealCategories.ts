/** Kategorierne på indkøbslisten, i den rækkefølge madansvarlig ser dem. */
export const MEAL_CATEGORIES = [
  { id: 'paalaeg', label: 'Pålæg' },
  { id: 'broed', label: 'Brød' },
  { id: 'snacks', label: 'Snacks' },
  { id: 'andet', label: 'Andet' },
] as const

export type MealCategoryId = (typeof MEAL_CATEGORIES)[number]['id']

export function wishesByCategory<T extends { category: MealCategoryId }>(
  wishes: readonly T[],
) {
  return MEAL_CATEGORIES.map((category) => ({
    ...category,
    wishes: wishes.filter((wish) => wish.category === category.id),
  }))
}
