export interface ObservationPhoto {
  id: string
  caption: string | null
  thumbnailUrl: string | null
  displayUrl: string | null
}

/** Samme felter som den nuværende app, så kort og artsfane kan genbruges. */
export interface Observation {
  id: string
  species: string
  location: string | null
  observed_on: string
  notes: string | null
  latitude: number | null
  longitude: number | null
  photo_id: string | null
  photo: ObservationPhoto | null
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
