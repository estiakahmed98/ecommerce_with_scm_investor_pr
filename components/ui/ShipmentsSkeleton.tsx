export default function ShipmentsSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-2 py-2">Shipment</th>
            <th className="px-2 py-2">Order</th>
            <th className="px-2 py-2">Courier</th>
            <th className="px-2 py-2">Tracking</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...Array(8)].map((_, index) => (
            <tr key={index} className="border-b border-border/60 animate-pulse">
              <td className="px-2 py-3">
                <div className="h-4 bg-gray-200 rounded w-12 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="px-2 py-3">
                <div className="h-4 bg-gray-200 rounded w-12 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </td>
              <td className="px-2 py-3">
                <div className="h-4 bg-gray-200 rounded w-16 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-14"></div>
              </td>
              <td className="px-2 py-3">
                <div className="h-4 bg-gray-200 rounded w-20 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </td>
              <td className="px-2 py-3">
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              </td>
              <td className="px-2 py-3">
                <div className="flex flex-wrap gap-2">
                  <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                  <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
