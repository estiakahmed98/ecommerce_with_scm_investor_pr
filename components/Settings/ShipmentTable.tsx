"use client";

interface Props {
  shipments: any[];
  refresh: () => void;
}

export default function ShipmentTable({ shipments, refresh }: Props) {
  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/shipments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  };

  const deleteShipment = async (id: number) => {
    await fetch(`/api/shipments/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="card-theme shadow rounded-lg overflow-x-auto border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="p-3 text-left">ID</th>
            <th className="p-3 text-left">Order</th>
            <th className="p-3 text-left">Courier</th>
            <th className="p-3 text-left">Tracking</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(shipments) &&
            shipments.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3">{s.id}</td>
                <td className="p-3">#{s.orderId}</td>
                <td className="p-3">{s.courier}</td>
                <td className="p-3">{s.trackingNumber}</td>
                <td className="p-3">
                  <select
                    value={s.status}
                    onChange={(e) => updateStatus(s.id, e.target.value)}
                    className="input-theme border rounded px-2 py-1"
                  >
                    <option>PENDING</option>
                    <option>IN_TRANSIT</option>
                    <option>OUT_FOR_DELIVERY</option>
                    <option>DELIVERED</option>
                    <option>RETURNED</option>
                    <option>CANCELLED</option>
                  </select>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => deleteShipment(s.id)}
                    className="btn-danger px-3 py-1 rounded text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
