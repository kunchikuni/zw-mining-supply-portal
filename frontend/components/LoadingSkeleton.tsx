export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 p-4">
      <div className="h-4 w-2/3 rounded bg-gray-200" />
      <div className="mt-3 h-3 w-1/3 rounded bg-gray-200" />
      <div className="mt-4 h-3 w-full rounded bg-gray-200" />
      <div className="mt-2 h-3 w-5/6 rounded bg-gray-200" />
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
