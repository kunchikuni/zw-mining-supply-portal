import { formatScore } from '@/lib/format';

// Read-only stars for a score, or an average rounded to the nearest whole
// star. The exact value is in the accessible label.
export function RatingStars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const filled = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`${formatScore(value)} out of 5 stars`}
      className={`inline-flex gap-0.5 leading-none ${size === 'lg' ? 'text-xl' : 'text-sm'}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= filled ? 'text-copper-500' : 'text-gray-300'}>
          ★
        </span>
      ))}
    </span>
  );
}
