export default function UserDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-card border text-muted-foreground animate-pulse mb-6 shadow-sm font-medium w-40">
            <div className="h-4 w-4 bg-gray-200 rounded"></div>
            <div className="h-4 w-24 bg-gray-200 rounded"></div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div className="relative">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse"></div>
              <div className="h-10 w-32 bg-gray-200 rounded-xl animate-pulse"></div>
              <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse"></div>
              <div className="h-10 w-20 bg-gray-200 rounded-xl animate-pulse"></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="xl:col-span-2 space-y-6">
            {/* Profile Information */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <div className="h-4 w-16 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div>
                  <div className="h-4 w-12 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div>
                  <div className="h-4 w-20 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div>
                  <div className="h-4 w-28 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>

                {/* Addresses */}
                <div className="md:col-span-2 space-y-3">
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-12 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div className="md:col-span-2">
                  <div className="h-4 w-12 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-24 w-full bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 mt-6 border-t">
                <div className="h-10 w-20 bg-gray-200 rounded-xl animate-pulse"></div>
                <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse"></div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center space-x-2 mb-6">
                <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>

              <div className="space-y-4">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-xl animate-pulse">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center space-x-3">
                        <div className="h-5 w-24 bg-gray-200 rounded"></div>
                        <div className="h-5 w-16 bg-gray-200 rounded-full"></div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="h-4 w-32 bg-gray-200 rounded"></div>
                        <div className="h-4 w-20 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Statistics */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center space-x-2 mb-4">
                <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
                </div>

                <div className="flex items-center justify-between p-3 bg-pink-50 dark:bg-pink-950 rounded-lg border border-pink-200 dark:border-pink-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Account Status */}
            <div className="bg-card rounded-2xl shadow-lg border p-6">
              <div className="flex items-center space-x-2 mb-4">
                <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-5 w-28 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                  <div className="flex items-center space-x-1">
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="flex items-center space-x-1">
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>

                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-start space-x-2">
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse mt-0.5"></div>
                    <div className="flex-1">
                      <div className="h-4 w-20 bg-gray-200 rounded mb-1 animate-pulse"></div>
                      <div className="h-3 w-full bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <div className="h-3 w-3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
