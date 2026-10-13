export function CardSkeleton() {
  return (
    <div className="card animate-pulse p-6">
      <div className="h-5 w-2/3 rounded bg-gray-100" />
      <div className="mt-3 h-3 w-1/3 rounded bg-gray-100" />
      <div className="mt-6 h-3 w-full rounded bg-gray-100" />
      <div className="mt-2 h-3 w-5/6 rounded bg-gray-100" />
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
