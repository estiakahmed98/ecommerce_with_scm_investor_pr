"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type WarehouseOption = {
  id: number;
  name: string;
  code: string;
  address?: {
    location: string;
  } | null;
  isDefault: boolean;
};

type CourierOption = {
  id: number;
  name: string;
  type: "PATHAO" | "REDX" | "STEADFAST" | "CUSTOM";
  baseUrl: string;
  isActive: boolean;
};

type OrderOption = {
  id: number;
  email: string;
  name: string | null;
  total: number;
  status: string;
  shipment?: {
    id: number;
    status: string;
  } | null;
};

type ShipmentResponse = {
  id: number;
  orderId: number;
  courier: string;
  trackingNumber?: string | null;
  status: string;
  courierStatus?: string | null;
  trackingUrl?: string | null;
};

interface ShipmentCreateFormProps {
  onCreated?: () => void | Promise<void>;
  onClose?: () => void;
}

export default function ShipmentCreateForm({
  onCreated,
  onClose,
}: ShipmentCreateFormProps) {
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(true);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShipmentResponse | null>(null);

  const [orderId, setOrderId] = useState("");
  const [courierId, setCourierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const loadCouriers = async () => {
      try {
        setLoadingCouriers(true);
        const res = await fetch("/api/couriers", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load couriers");
        const data = (await res.json()) as CourierOption[];
        setCouriers(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load couriers");
      } finally {
        setLoadingCouriers(false);
      }
    };

    const loadOrders = async () => {
      try {
        setLoadingOrders(true);
        const res = await fetch("/api/orders?hasShipment=false&limit=200");
        if (!res.ok) throw new Error("Failed to load orders");
        const data = (await res.json()) as { orders: OrderOption[] };
        const eligible = (data.orders || []).filter((order) =>
          ["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status),
        );
        setOrders(eligible);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load orders");
      } finally {
        setLoadingOrders(false);
      }
    };

    const loadWarehouses = async () => {
      try {
        setLoadingWarehouses(true);
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses");
        const data = (await res.json()) as WarehouseOption[];
        setWarehouses(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load warehouses");
      } finally {
        setLoadingWarehouses(false);
      }
    };

    loadCouriers();
    loadOrders();
    loadWarehouses();
  }, []);

  const selectedCourier = useMemo(
    () => couriers.find((c) => String(c.id) === courierId),
    [courierId, couriers],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      if (!orderId || !courierId) {
        throw new Error("Order ID and courier are required");
      }

      const payload = {
        orderId: Number(orderId),
        courierId: Number(courierId),
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        note: note || undefined,
      };

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create shipment");
      }

      setResult(data as ShipmentResponse);
      if (onCreated) {
        await onCreated();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
        <h2 className="text-xl font-semibold text-foreground">Create Shipment</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select courier dynamically and create shipment for an existing order.
      </p>
      </div>


      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted"
      >
        Close
      </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">Order</span>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            required
            className="h-10 rounded-md border border-border bg-background px-3"
            disabled={loadingOrders}
          >
            <option value="">
              {loadingOrders ? "Loading orders..." : "Select an order"}
            </option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.id} - {order.name || order.email} (${order.total})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">Courier</span>
          <select
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
            required
            className="h-10 rounded-md border border-border bg-background px-3"
            disabled={loadingCouriers}
          >
            <option value="">
              {loadingCouriers ? "Loading couriers..." : "Select a courier"}
            </option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name} ({courier.type})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">Warehouse (optional)</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3"
            disabled={loadingWarehouses}
          >
            <option value="">
              {loadingWarehouses
                ? "Loading warehouses..."
                : "Select a warehouse"}
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm md:col-span-2">
          <span className="text-muted-foreground">Courier Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[90px] rounded-md border border-border bg-background px-3 py-2"
            placeholder="Delivery note for courier"
          />
        </label>

        {selectedCourier && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground md:col-span-2">
            <p>
              <span className="font-medium text-foreground">Provider:</span>{" "}
              {selectedCourier.name} ({selectedCourier.type})
            </p>
            <p>
              <span className="font-medium text-foreground">Endpoint:</span>{" "}
              {selectedCourier.baseUrl}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive md:col-span-2">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 md:col-span-2">
            <p>Shipment created. ID: {result.id}</p>
            <p>Status: {result.status}</p>
            <p>Tracking: {result.trackingNumber || "N/A"}</p>
            {result.trackingUrl && (
              <a
                href={result.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open tracking URL
              </a>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60 md:col-span-2"
        >
          {submitting ? "Creating..." : "Create Shipment"}
        </button>
      </form>
    </div>
  );
}
