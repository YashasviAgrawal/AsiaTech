/** Shown instantly while a page's server data loads, so navigation never feels frozen. */
export default function Loading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="mb-6 space-y-2.5">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-8 w-72 rounded-lg" />
        <div className="skeleton h-3.5 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-card">
            <div className="skeleton h-8 w-8 rounded-xl" />
            <div className="skeleton mt-4 h-6 w-20" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-card xl:col-span-2">
          <div className="skeleton h-4 w-40" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-2.5 w-1/3" />
                </div>
                <div className="skeleton h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-card">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mx-auto mt-6 h-28 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
