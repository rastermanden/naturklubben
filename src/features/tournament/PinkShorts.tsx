/**
 * Klubbens pokal: et par lyserøde boxershorts. Tegnet som SVG fremfor et
 * billede, så den er skarp i alle størrelser og ser ens ud i lyst og mørkt
 * tema. Dekorativ -- teksten ved siden af siger, hvem der vandt.
 */
export function PinkShorts({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Selve shortsene: ét stykke stof med en kile skåret op i midten, så
          der bliver to ben. */}
      <path
        d="M6 12 H58 V32 L55 44 H36 L32 30 L28 44 H9 L6 32 Z"
        fill="#f472b6"
      />
      {/* Skyggen i venstre ben giver lidt fald i stoffet. */}
      <path d="M6 12 H20 L17 44 H9 L6 32 Z" fill="#ec4899" opacity="0.45" />
      {/* Gylpen. */}
      <path
        d="M32 16 V27"
        stroke="#be185d"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Linningen. */}
      <rect x="3" y="3" width="58" height="11" rx="3" fill="#db2777" />
      <rect x="3" y="10" width="58" height="2" fill="#9d174d" opacity="0.5" />
    </svg>
  )
}
