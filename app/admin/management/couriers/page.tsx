"use client";

import CourierFormModal from "@/components/Settings/CourierFormModal";
import CourierSkeleton from "@/components/ui/CourierSkeleton";
import { useEffect, useState } from "react";
import { Courier, CourierType } from "@/lib/types/courier";

export default function CourierPage() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [etaModalCourier, setEtaModalCourier] = useState<CourierType | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadCouriers = async () => {
    setLoading(true);
    const res = await fetch("/api/couriers");
    const data = await res.json();
    setCouriers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    loadCouriers();
  }, []);

  return (
    <div className="p-2">
      <div className="flex p-2 justify-between items-center">
        <h1 className="text-2xl font-bold">Courier Management</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary px-4 py-2 rounded"
        >
          Add Courier
        </button>
      </div>

      <div className="card-theme border rounded-lg p-4">
        {loading ? (
          <CourierSkeleton />
        ) : (
          couriers.map((c) => (
            <div key={c.id} className="flex justify-between items-center border-b py-3">
              <div className="flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {c.type} | {c.baseUrl}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: {c.isActive ? "Active" : "Inactive"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingCourier(c)}
                  className="btn-primary px-3 py-1 rounded text-sm"
                >
                  Edit
                </button>
  
                <button
                  onClick={async () => {
                    if (confirm(`Are you sure you want to delete ${c.name}?`)) {
                      await fetch(`/api/couriers/${c.id}`, {
                        method: "DELETE",
                      });
                      loadCouriers();
                    }
                  }}
                  className="btn-danger px-3 py-1 rounded text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>


      {showAddModal && (
        <CourierFormModal
          onClose={() => setShowAddModal(false)}
          refresh={loadCouriers}
        />
      )}

      {editingCourier && (
        <CourierFormModal
          onClose={() => setEditingCourier(null)}
          refresh={loadCouriers}
          editingCourier={editingCourier}
        />
      )}
    </div>
  );
}
