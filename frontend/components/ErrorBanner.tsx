export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50/80 px-4 py-3 text-sm leading-relaxed text-red-800"
    >
      {message}
    </div>
  );
}
