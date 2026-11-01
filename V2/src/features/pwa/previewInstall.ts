/**
 * Preview-buildet må ikke tilbyde installation. Den deler oprindelse med
 * produktionen, og en installeret preview-app ville lægge sig oven i den
 * rigtige. Produktionsbuildet har base `/` (eller den sti, deployet sætter)
 * og viser derfor den samme knap som den nuværende app.
 */
export function isPreviewDeployment(): boolean {
  return (import.meta.env.BASE_URL ?? '').includes('pr-preview')
}
