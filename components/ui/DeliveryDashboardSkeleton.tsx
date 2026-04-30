export function DeliveryDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto space-y-6">
        {/* Header Section */}
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="h-4 w-40 bg-gray-200 rounded animate-pulse"></div>
              <div className="mt-2 h-10 w-48 bg-gray-200 rounded animate-pulse"></div>
              <div className="mt-2 h-4 w-full max-w-2xl bg-gray-200 rounded animate-pulse"></div>
            </div>

            <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse"></div>
          </div>

          {/* Notice/Error placeholders */}
          <div className="mt-4 h-4 w-full bg-gray-200 rounded-2xl animate-pulse"></div>
        </section>

        {/* Summary Cards */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[...Array(6)].map((_, index) => (
            <article
              key={index}
              className="rounded-3xl border border-border bg-card p-5 shadow-sm animate-pulse"
            >
              <div className="h-3 w-full bg-gray-200 rounded"></div>
              <div className="mt-3 h-8 w-12 bg-gray-200 rounded"></div>
            </article>
          ))}
        </section>

        {/* Tabs Section */}
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
          {/* Tabs List */}
          <div className="w-full justify-start overflow-x-auto rounded-2xl bg-background p-2 scrollbar-hide flex gap-2">
            {[...Array(7)].map((_, index) => (
              <div key={index} className="rounded-xl px-3 py-2 bg-gray-100 animate-pulse flex items-center gap-2">
                <div className="h-4 w-20 bg-gray-200 rounded"></div>
                <div className="rounded-full bg-gray-200 px-2 py-0.5 w-6 h-4"></div>
              </div>
            ))}
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Delivery Assignment Cards */}
            <div className="space-y-5">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="rounded-2xl border border-border bg-card p-5 shadow-sm animate-pulse">
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-2">
                      <div className="h-5 w-32 bg-gray-200 rounded"></div>
                      <div className="h-4 w-24 bg-gray-200 rounded"></div>
                    </div>
                    <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                  </div>

                  {/* Card Content */}
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="h-3 w-16 bg-gray-200 rounded"></div>
                        <div className="h-4 w-full bg-gray-200 rounded"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-20 bg-gray-200 rounded"></div>
                        <div className="h-4 w-full bg-gray-200 rounded"></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-gray-200 rounded"></div>
                      <div className="h-4 w-3/4 bg-gray-200 rounded"></div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-4 border-t border-border/60 flex gap-2">
                    <div className="h-8 w-20 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
