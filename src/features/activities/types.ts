export interface Activity {
  id: string
  title: string
  description: string
  icon: string | null
  sort_order: number
  link_url: string | null
  link_label: string | null
}

/** Det, admin-formularen skriver. `id` mangler, når aktiviteten er ny. */
export interface ActivityInput {
  title: string
  description: string
  icon: string | null
  link_url: string | null
  link_label: string | null
}
