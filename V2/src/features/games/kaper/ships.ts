/**
 * Fjenderne, som de stod i spillets DATA-linjer 840-910: kanoner, besætning,
 * hvad der er i lasten af bral, og hvor mange sække korn der højst er om
 * bord. De syv første er engelske; piratskibet sejler under sit eget flag.
 */
export interface EnemyType {
  id: number
  name: string
  guns: number
  men: number
  taels: number
  maxGrain: number
  english: boolean
}

export const ENEMY_TYPES: readonly EnemyType[] = [
  {
    id: 1,
    name: 'handelsskib',
    guns: 5,
    men: 80,
    taels: 150,
    maxGrain: 30,
    english: true,
  },
  {
    id: 2,
    name: 'troppetransportskib',
    guns: 10,
    men: 480,
    taels: 600,
    maxGrain: 15,
    english: true,
  },
  {
    id: 3,
    name: 'kanonbåd',
    guns: 2,
    men: 40,
    taels: 150,
    maxGrain: 4,
    english: true,
  },
  {
    id: 4,
    name: 'fregat',
    guns: 15,
    men: 140,
    taels: 450,
    maxGrain: 5,
    english: true,
  },
  {
    id: 5,
    name: 'brig',
    guns: 6,
    men: 50,
    taels: 200,
    maxGrain: 4,
    english: true,
  },
  {
    id: 6,
    name: 'skonnert',
    guns: 1,
    men: 10,
    taels: 30,
    maxGrain: 1,
    english: true,
  },
  {
    id: 7,
    name: 'linjeskib',
    guns: 50,
    men: 140,
    taels: 900,
    maxGrain: 20,
    english: true,
  },
  {
    id: 8,
    name: 'piratskib',
    guns: 70,
    men: 200,
    taels: 1500,
    maxGrain: 12,
    english: false,
  },
]

/** "Engelsk fregat" eller "Piratskib" -- som udkiggen råber det. */
export function enemyLabel(type: EnemyType): string {
  const name = type.english ? `engelsk ${type.name}` : type.name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** "englænderen" eller "piratskibet" -- som man taler om dem under kampen. */
export function enemyNoun(type: EnemyType): string {
  return type.english ? 'englænderen' : 'piratskibet'
}
