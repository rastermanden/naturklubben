import { useEffect, useState } from 'react'

/**
 * Holder en værdi tilbage, indtil den har stået stille i `delay` millisekunder.
 *
 * Søgefeltet i chatten slår op ved hvert tastetryk. Nu hvor søgningen også
 * matcher ordstumper, ville "skovsøen" udløse otte opslag, hvoraf de syv er
 * smidt væk, inden svaret når frem.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
