// The portal's mark: a faceted mineral in gold on a dark hexagon — a nod to
// mining without leaning on picks or hard hats. Plain fills (no gradient
// ids), so it can appear more than once on a page safely.
export function BrandMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <polygon points="20,1.5 36.5,11 36.5,29 20,38.5 3.5,29 3.5,11" fill="#1A1814" />
      <polygon
        points="20,6 32.5,13.25 32.5,26.75 20,34 7.5,26.75 7.5,13.25"
        fill="none"
        stroke="#B48F3E"
        strokeWidth="1"
        opacity="0.55"
      />
      <path d="M20 11.5 L27 19 L20 28.5 L13 19 Z" fill="#C8A452" />
      <path d="M13 19 L27 19 L20 28.5 Z" fill="#957330" />
      <path d="M20 11.5 L23.5 19 L16.5 19 Z" fill="#E8D49E" opacity="0.85" />
    </svg>
  );
}
