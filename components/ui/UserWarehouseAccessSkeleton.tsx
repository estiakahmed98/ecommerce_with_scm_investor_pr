export default function UserWarehouseAccessSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="space-y-6">
        {/* Header Section */}
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                <div className="h-4 w-4 bg-gray-200 rounded"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
              </div>
              <div className="mt-4 h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
              <div className="mt-2 h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
              <div className="mt-2 h-4 w-full bg-gray-200 rounded animate-pulse"></div>
            </div>

            <div className="h-12 w-32 bg-gray-200 rounded-2xl animate-pulse"></div>
          </div>
        </section>

        {/* Main Grid */}
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          {/* Warehouse Memberships */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="mt-2 h-4 w-full bg-gray-200 rounded animate-pulse"></div>

            <div className="mt-4 space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="flex items-start justify-between gap-4 rounded-2xl border bg-background p-4 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-4 w-4 bg-gray-200 rounded"></div>
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-gray-200 rounded"></div>
                      <div className="h-3 w-24 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                </div>
              ))}
            </div>
          </article>

          {/* Global Roles */}
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="mt-2 h-4 w-full bg-gray-200 rounded animate-pulse"></div>

            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-full bg-gray-200 rounded mb-2"></div>
              <div className="h-3 w-full bg-gray-200 rounded"></div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="rounded-2xl border bg-background p-4 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-4 w-4 bg-gray-200 rounded"></div>
                    <div className="space-y-1">
                      <div className="h-4 w-24 bg-gray-200 rounded"></div>
                      <div className="h-3 w-full bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* Warehouse-Scoped Roles */}
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="mt-2 h-4 w-full bg-gray-200 rounded animate-pulse"></div>

          <div className="mt-4 rounded-2xl border bg-background p-4 text-sm animate-pulse">
            <div className="h-4 w-40 bg-gray-200 rounded mb-2"></div>
            <div className="space-y-1">
              <div className="h-3 w-full bg-gray-200 rounded"></div>
              <div className="h-3 w-3/4 bg-gray-200 rounded"></div>
              <div className="h-3 w-1/2 bg-gray-200 rounded"></div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {[...Array(2)].map((_, warehouseIndex) => (
              <div key={warehouseIndex} className="rounded-2xl border bg-background p-4 animate-pulse">
                <div className="mb-4">
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 w-48 bg-gray-200 rounded"></div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[...Array(3)].map((_, roleIndex) => (
                    <div key={`${warehouseIndex}:${roleIndex}`} className="rounded-2xl border p-4 animate-pulse">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-4 w-4 bg-gray-200 rounded"></div>
                        <div className="space-y-1">
                          <div className="h-4 w-20 bg-gray-200 rounded"></div>
                          <div className="h-3 w-full bg-gray-200 rounded"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
