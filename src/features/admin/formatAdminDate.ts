/** Kort dato, som den vises på kort og lister i admin-panelet. */
export function formatAdminDate(value: string) {
  return new Date(value).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
