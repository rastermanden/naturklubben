export interface Photo {
  id: string
  storage_path: string
  optimized_path: string | null
  thumbnail_path: string | null
  caption: string | null
  event_id: string | null
  event: { title: string } | null
  uploaded_by: string
  created_at: string
}
