/**
 * Pronominer på profilen.
 *
 * Listen er et tilbud, ikke en grænse: det, medlemmet selv skriver, gemmes
 * som det er skrevet (profiles.pronouns er fri tekst). Listen findes, fordi
 * de fleste vil vælge frem for at stave, og fordi de skal kunne se, at der
 * er plads til dem, før de behøver at skrive noget.
 *
 * `null` i databasen betyder "ikke udfyldt endnu" -- det er dét, appen minder
 * om. Den, der ikke vil oplyse noget, vælger det udtrykkeligt
 * (PRONOUNS_UNDISCLOSED), så påmindelsen holder op uden at nogen skal finde
 * på noget.
 */

/** Skal matche check-constrainten profiles_pronouns_length. */
export const PRONOUNS_MAX_LENGTH = 40

/** Gemmes, når medlemmet vælger ikke at oplyse pronominer. Vises aldrig. */
export const PRONOUNS_UNDISCLOSED = 'vil ikke oplyse'

/** Værdien i vælgeren, der åbner fritekstfeltet. Gemmes aldrig. */
export const PRONOUNS_CUSTOM = '__custom__'

export interface PronounOption {
  value: string
  /** Kun sat, hvor værdien alene ikke forklarer sig selv. */
  hint?: string
}

export interface PronounGroup {
  label: string
  options: readonly PronounOption[]
}

export const PRONOUN_GROUPS: readonly PronounGroup[] = [
  {
    label: 'Dansk',
    options: [
      { value: 'hun/hende' },
      { value: 'han/ham' },
      { value: 'de/dem' },
      { value: 'hen/hen' },
      { value: 'hun/de' },
      { value: 'han/de' },
      { value: 'de/hun' },
      { value: 'de/han' },
      { value: 'hen/hun' },
      { value: 'hen/han' },
      { value: 'hun/han' },
      { value: 'alle pronominer' },
      { value: 'brug mit navn', hint: 'ingen pronominer, brug bare navnet' },
      { value: 'spørg mig' },
      { value: 'sikker/effektiv' },
    ],
  },
  {
    label: 'Engelsk',
    options: [
      { value: 'she/her' },
      { value: 'he/him' },
      { value: 'they/them' },
      { value: 'she/they' },
      { value: 'he/they' },
      { value: 'any pronouns' },
      { value: 'xe/xem' },
      { value: 'ze/zir' },
      { value: 'ze/hir' },
      { value: 'ey/em' },
      { value: 'fae/faer' },
      { value: 'it/its' },
    ],
  },
  {
    label: 'Andre nordiske',
    options: [
      { value: 'hon/henne', hint: 'svensk' },
      { value: 'han/honom', hint: 'svensk' },
      { value: 'hen/hen', hint: 'svensk' },
      { value: 'hun/henne', hint: 'norsk' },
      { value: 'han/ham', hint: 'norsk' },
      { value: 'hen/hen', hint: 'norsk' },
    ],
  },
]

// "Vil ikke oplyse" er også et valg i vælgeren, selv om det ikke er
// pronominer: står det gemt, skal vælgeren vise det -- ikke fritekstfeltet.
const listed = new Set([
  ...PRONOUN_GROUPS.flatMap((group) => group.options.map(({ value }) => value)),
  PRONOUNS_UNDISCLOSED,
])

/** Står værdien på listen, så vælgeren kan vise den uden fritekstfeltet? */
export function isListedPronouns(value: string | null): boolean {
  return value !== null && listed.has(value)
}

/**
 * Det, der gemmes, når medlemmet trykker Gem: trimmet, med indre
 * mellemrum foldet sammen, og tomt bliver til null ("ikke udfyldt").
 * Grænsen på 40 tegn håndhæves også af databasen; her klippes der, så et
 * indsat afsnit ikke ender som en fejl fra serveren.
 */
export function normalizePronouns(
  input: string | null | undefined,
): string | null {
  if (input == null) return null
  const cleaned = input.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, PRONOUNS_MAX_LENGTH).trim() || null
}

/** Det, andre ser ved navnet -- eller intet, hvis der ikke er noget at vise. */
export function displayPronouns(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  if (value === PRONOUNS_UNDISCLOSED) return null
  return value
}

/** Har medlemmet taget stilling -- valgt noget, skrevet noget eller sagt nej tak? */
export function hasAnsweredPronouns(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0
}
