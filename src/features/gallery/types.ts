export interface Photo {
  id: string
  storage_path: string
  optimized_path: string | null
  thumbnail_path: string | null
  caption: string | null
  event_id: string | null
  event: { id: string; title: string } | null
  uploaded_by: string
  created_at: string
  optimization_status:
    'pending' | 'processing' | 'ready' | 'failed' | 'deleting' | 'delete_failed'
  optimization_attempts: number
  optimization_started_at: string | null
  optimization_completed_at: string | null
  optimization_error: string | null
}
