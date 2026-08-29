import type { Photo } from '../gallery/types'

export interface Observation {
  id: string
  species: string
  location: string | null
  /** Datoen som `YYYY-MM-DD` -- en kalenderdag, ikke et tidspunkt. */
  observed_on: string
  notes: string | null
  latitude: number | null
  longitude: number | null
  photo_id: string | null
  photo: Photo | null
  /** null, når observatøren har slettet sin konto. */
  created_by: string | null
  observer: { id: string; full_name: string | null } | null
  created_at: string
  updated_at: string
}

export interface ObservationInput {
  species: string
  location: string | null
  observed_on: string
  notes: string | null
  latitude: number | null
  longitude: number | null
  photo_id: string | null
}
