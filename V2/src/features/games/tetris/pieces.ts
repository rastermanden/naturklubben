/**
 * Brikkerne og deres drejninger, som de er defineret i Tetris Guideline (SRS).
 *
 * Formerne står som tegninger frem for talpar: en fejl i en form skal kunne
 * ses, ikke regnes ud. `#` er en celle, `.` er tom. Hver brik har fire
 * tegninger -- 0 (spawn), R (én drejning med uret), 2 (på hovedet) og L (én
 * drejning mod uret) -- og de er skrevet ud i stedet for at blive udregnet ved
 * at rotere en matrix, fordi SRS' egne tegninger er dét, spillerne kender.
 */

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z'

/** 0 = spawn, 1 = drejet med uret, 2 = på hovedet, 3 = mod uret. */
export type Rotation = 0 | 1 | 2 | 3

export interface Coordinate {
  x: number
  y: number
}

export const PIECE_TYPES: readonly PieceType[] = [
  'I',
  'J',
  'L',
  'O',
  'S',
  'T',
  'Z',
]

const SHAPES: Record<PieceType, readonly string[][]> = {
  I: [
    ['....', '####', '....', '....'],
    ['..#.', '..#.', '..#.', '..#.'],
    ['....', '....', '####', '....'],
    ['.#..', '.#..', '.#..', '.#..'],
  ],
  J: [
    ['#..', '###', '...'],
    ['.##', '.#.', '.#.'],
    ['...', '###', '..#'],
    ['.#.', '.#.', '##.'],
  ],
  L: [
    ['..#', '###', '...'],
    ['.#.', '.#.', '.##'],
    ['...', '###', '#..'],
    ['##.', '.#.', '.#.'],
  ],
  // O drejer ikke: alle fire tilstande er den samme firkant. Det er ikke en
  // forenkling, men SRS' egen regel.
  O: [
    ['.##.', '.##.', '....', '....'],
    ['.##.', '.##.', '....', '....'],
    ['.##.', '.##.', '....', '....'],
    ['.##.', '.##.', '....', '....'],
  ],
  S: [
    ['.##', '##.', '...'],
    ['.#.', '.##', '..#'],
    ['...', '.##', '##.'],
    ['#..', '##.', '.#.'],
  ],
  T: [
    ['.#.', '###', '...'],
    ['.#.', '.##', '.#.'],
    ['...', '###', '.#.'],
    ['.#.', '##.', '.#.'],
  ],
  Z: [
    ['##.', '.##', '...'],
    ['..#', '.##', '.#.'],
    ['...', '##.', '.##'],
    ['.#.', '##.', '#..'],
  ],
}

function toCoordinates(drawing: readonly string[]): Coordinate[] {
  const cells: Coordinate[] = []
  drawing.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '#') cells.push({ x, y })
    }
  })
  return cells
}

const PIECE_CELLS: Record<PieceType, readonly (readonly Coordinate[])[]> = {
  I: SHAPES.I.map(toCoordinates),
  J: SHAPES.J.map(toCoordinates),
  L: SHAPES.L.map(toCoordinates),
  O: SHAPES.O.map(toCoordinates),
  S: SHAPES.S.map(toCoordinates),
  T: SHAPES.T.map(toCoordinates),
  Z: SHAPES.Z.map(toCoordinates),
}

/** Cellerne i brikkens tegneramme, målt fra rammens øverste venstre hjørne. */
export function pieceCells(
  type: PieceType,
  rotation: Rotation,
): readonly Coordinate[] {
  return PIECE_CELLS[type][rotation]
}

/**
 * Hvor brikkens tegneramme lander, når brikken kommer ind. Rammen er 3 bred for
 * de fleste brikker og 4 for I og O, så den midterste kolonne rammer brættets
 * midte.
 */
export function spawnColumn(type: PieceType, boardWidth: number): number {
  const frameWidth = type === 'I' || type === 'O' ? 4 : 3
  return Math.floor((boardWidth - frameWidth) / 2)
}

/**
 * SRS' kick-tabeller: forsøges drejningen, og står brikken i vejen, prøver
 * spillet de fem forskydninger i rækkefølge og tager den første, der går.
 * Det er dét, der gør en T-spin eller en I-brik ned i en brønd mulig.
 *
 * Tabellerne er noteret med y opad i SRS' egen dokumentation. Her peger y
 * nedad (række 0 er øverst), så alle y-værdier er vendt om ved indtastningen.
 */
type KickKey = `${Rotation}${Rotation}`

const JLSTZ_KICKS: Record<KickKey, readonly Coordinate[]> = {
  '01': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: 2 },
    { x: -1, y: 2 },
  ],
  '10': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: -2 },
    { x: 1, y: -2 },
  ],
  '12': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: -2 },
    { x: 1, y: -2 },
  ],
  '21': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: 2 },
    { x: -1, y: 2 },
  ],
  '23': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ],
  '32': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -2 },
    { x: -1, y: -2 },
  ],
  '30': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -2 },
    { x: -1, y: -2 },
  ],
  '03': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ],
  // De to 180°-drejninger findes ikke i SRS. Spillet tilbyder dem ikke, men
  // tabellen skal være total, så opslaget aldrig kan ramme ved siden af.
  '02': [{ x: 0, y: 0 }],
  '20': [{ x: 0, y: 0 }],
  '13': [{ x: 0, y: 0 }],
  '31': [{ x: 0, y: 0 }],
  '00': [{ x: 0, y: 0 }],
  '11': [{ x: 0, y: 0 }],
  '22': [{ x: 0, y: 0 }],
  '33': [{ x: 0, y: 0 }],
}

const I_KICKS: Record<KickKey, readonly Coordinate[]> = {
  '01': [
    { x: 0, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 1 },
    { x: 1, y: -2 },
  ],
  '10': [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: -1 },
    { x: -1, y: 2 },
  ],
  '12': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: -2 },
    { x: 2, y: 1 },
  ],
  '21': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 2 },
    { x: -2, y: -1 },
  ],
  '23': [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: -1 },
    { x: -1, y: 2 },
  ],
  '32': [
    { x: 0, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 1 },
    { x: 1, y: -2 },
  ],
  '30': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 2 },
    { x: -2, y: -1 },
  ],
  '03': [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: -2 },
    { x: 2, y: 1 },
  ],
  '02': [{ x: 0, y: 0 }],
  '20': [{ x: 0, y: 0 }],
  '13': [{ x: 0, y: 0 }],
  '31': [{ x: 0, y: 0 }],
  '00': [{ x: 0, y: 0 }],
  '11': [{ x: 0, y: 0 }],
  '22': [{ x: 0, y: 0 }],
  '33': [{ x: 0, y: 0 }],
}

export function kickOffsets(
  type: PieceType,
  from: Rotation,
  to: Rotation,
): readonly Coordinate[] {
  // O drejer ikke og har derfor ingen forskydninger at prøve.
  if (type === 'O') return [{ x: 0, y: 0 }]
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS
  return table[`${from}${to}`]
}
