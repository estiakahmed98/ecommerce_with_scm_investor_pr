export default function WarehouseDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="space-y-6">
        {/* Header Section */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-96 animate-pulse"></div>
            </div>
            <div className="flex gap-3">
              <div className="h-12 bg-gray-200 rounded w-64 animate-pulse"></div>
              <div className="h-12 bg-gray-200 rounded w-24 animate-pulse"></div>
            </div>
          </div>
          <div className="mt-3 h-3 bg-gray-200 rounded w-80 animate-pulse"></div>
        </section>

        {/* Summary Cards */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <article key={index} className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                  <div className="h-8 bg-gray-200 rounded w-16 animate-pulse"></div>
                </div>
                <div className="h-10 w-10 bg-gray-200 rounded-xl animate-pulse"></div>
              </div>
              <div className="mt-3 h-3 bg-gray-200 rounded w-32 animate-pulse"></div>
            </article>
          ))}
        </section>

        {/* Warehouse Coverage and Low Stock */}
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          {/* Warehouse Coverage */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="space-y-2">
              <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
            </div>
            <div className="mt-4 space-y-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border bg-background p-4 md:grid-cols-5 animate-pulse"
                >
                  <div className="md:col-span-2 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-12"></div>
                    <div className="h-4 bg-gray-200 rounded w-8"></div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-8"></div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Low Stock Watchlist */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="space-y-2">
              <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-56 animate-pulse"></div>
            </div>
            <div className="mt-4 space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-2xl border bg-background p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 rounded w-40"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                  </div>
                  <div className="mt-3 h-3 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* Recent Shipments and Activity */}
        <section className="grid gap-6 xl:grid-cols-2">
          {/* Recent Shipments */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
            </div>
            <div className="mt-4 space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="rounded-2xl border bg-background p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-48"></div>
                      <div className="h-3 bg-gray-200 rounded w-40"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Recent Activity */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
            </div>
            <div className="mt-4 space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="rounded-2xl border bg-background p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 rounded w-36"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded-full w-12"></div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-40"></div>
                    <div className="h-3 bg-gray-200 rounded w-32"></div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
