"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ShipmentsSkeleton from "@/components/ui/ShipmentsSkeleton";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type ShipmentStatusType =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED";

type ShipmentRow = {
  id: number;
  orderId: number;
  warehouseId?: number | null;
  courier: string;
  courierStatus?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  status: ShipmentStatusType;
  expectedDate?: string | null;
  assignedAt?: string | null;
  pickedAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  estimatedCost?: string | number | null;
  actualCost?: string | number | null;
  thirdPartyCost?: string | number | null;
  handlingCost?: string | number | null;
  packagingCost?: string | number | null;
  fuelCost?: string | number | null;
  dispatchNote?: string | null;
  priority?: number | null;
  createdAt: string;
  assignedTo?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  shippingRate?: {
    id: number;
    area?: string | null;
    district?: string | null;
    baseCost?: string | number | null;
  } | null;
  order?: {
    id: number;
    name?: string | null;
    phone_number?: string | null;
    status?: string | null;
    paymentStatus?: string | null;
  } | null;
  warehouse?: {
    id: number;
    name: string;
    code: string;
    latitude?: number | null;
    longitude?: number | null;
    mapLabel?: string | null;
    isMapEnabled?: boolean | null;
  } | null;
  deliveryAssignments?: Array<{
    id: string;
    status?: string | null;
    assignedAt?: string | null;
    deliveredAt?: string | null;
    deliveredLatitude?: number | null;
    deliveredLongitude?: number | null;
    deliveredAccuracy?: number | null;
  }> | null;
};

type Warehouse = {
  id: number;
  name: string;
  code: string;
  latitude?: number | null;
  longitude?: number | null;
  mapLabel?: string | null;
  isMapEnabled?: boolean | null;
};

const STATUS_OPTIONS: Array<"ALL" | ShipmentStatusType> = [
  "ALL",
  "PENDING",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
];

const NEXT_STATUS_MAP: Record<ShipmentStatusType, ShipmentStatusType[]> = {
  PENDING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "RETURNED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RETURNED", "CANCELLED"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

const STATUS_LABELS: Record<"ALL" | ShipmentStatusType, string> = {
  ALL: "All statuses",
  PENDING: "Pending",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

const NEXT_STATUS_LABELS: Record<ShipmentStatusType, string> = {
  PENDING: "Mark as pending",
  IN_TRANSIT: "Mark as in transit",
  OUT_FOR_DELIVERY: "Mark as out for delivery",
  DELIVERED: "Mark as delivered",
  RETURNED: "Mark as returned",
  CANCELLED: "Cancel shipment",
};

const currency = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

const monthlyOrderBars = [
  { label: "Jan", value: 22 },
  { label: "Feb", value: 38 },
  { label: "Mar", value: 54 },
  { label: "Apr", value: 43 },
  { label: "May", value: 60 },
  { label: "Jun", value: 78 },
  { label: "Jul", value: 64 },
];

const successBars = [42, 54, 61, 70, 84, 76, 68, 72, 81, 92, 67, 55];

function toAmount(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatAmount(value: number) {
  return currency.format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatShortDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatStatusLabel(status: "ALL" | ShipmentStatusType) {
  return STATUS_LABELS[status];
}

function getCurrentDeliveryAssignment(shipment: ShipmentRow) {
  return shipment.deliveryAssignments?.[0] ?? null;
}

function hasValidDeliveryLocation(shipment: ShipmentRow) {
  const assignment = getCurrentDeliveryAssignment(shipment);
  return (
    typeof assignment?.deliveredLatitude === "number" &&
    Number.isFinite(assignment.deliveredLatitude) &&
    typeof assignment.deliveredLongitude === "number" &&
    Number.isFinite(assignment.deliveredLongitude)
  );
}

function MultiShipmentsMap({ shipments }: { shipments: ShipmentRow[] }) {
  // Group shipments by warehouse and get unique warehouses
  const warehouseMap = new Map<
    number,
    { warehouse: Warehouse; shipments: ShipmentRow[] }
  >();

  shipments.forEach((shipment) => {
    if (
      shipment.warehouse &&
      shipment.warehouse.latitude &&
      shipment.warehouse.longitude
    ) {
      if (!warehouseMap.has(shipment.warehouse.id)) {
        warehouseMap.set(shipment.warehouse.id, {
          warehouse: shipment.warehouse,
          shipments: [],
        });
      }
      warehouseMap.get(shipment.warehouse.id)!.shipments.push(shipment);
    }
  });

  const warehouseData = Array.from(warehouseMap.values());

  if (warehouseData.length === 0) {
    return (
      <div className="h-full w-full rounded-[22px] overflow-hidden border border-border/60 bg-card flex items-center justify-center">
        <p className="text-muted-foreground">
          No warehouse locations are available yet.
        </p>
      </div>
    );
  }

  // Calculate center point for map
  const avgLat =
    warehouseData.reduce(
      (sum, item) => sum + (item.warehouse.latitude || 0),
      0,
    ) / warehouseData.length;
  const avgLng =
    warehouseData.reduce(
      (sum, item) => sum + (item.warehouse.longitude || 0),
      0,
    ) / warehouseData.length;

  return (
    <div className="h-[530px] w-full rounded-[22px] overflow-hidden border border-border/60 bg-card">
      <MapContainer
        center={[avgLat, avgLng]}
        zoom={8}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {warehouseData.map(({ warehouse, shipments: warehouseShipments }) => {
          const activeCount = warehouseShipments.filter(
            (s) =>
              s.status === "PENDING" ||
              s.status === "IN_TRANSIT" ||
              s.status === "OUT_FOR_DELIVERY",
          ).length;
          const deliveredCount = warehouseShipments.filter(
            (s) => s.status === "DELIVERED",
          ).length;

          return (
            <Marker
              key={warehouse.id}
              position={[warehouse.latitude!, warehouse.longitude!]}
              icon={L.divIcon({
                className: "custom-div-icon",
                html: `
                  <div class="relative flex items-center justify-center">
                    <div class="absolute inset-0 bg-primary rounded-full opacity-30 animate-ping"></div>
                    <div class="relative w-8 h-8 bg-primary rounded-full border-2 border-primary-foreground flex items-center justify-center">
                      <div class="w-2 h-2 bg-primary-foreground rounded-full"></div>
                    </div>
                  </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20],
              })}
            >
              <Popup className="min-w-[200px]">
                <div className="text-sm">
                  <div className="font-semibold mb-2">{warehouse.name}</div>
                  <div className="space-y-1 text-muted-foreground">
                    <div>Code: {warehouse.code}</div>
                    <div>Active shipments: {activeCount}</div>
                    <div>Delivered shipments: {deliveredCount}</div>
                    <div>Total shipments: {warehouseShipments.length}</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <style jsx>{`
        .custom-div-icon {
          background: transparent;
          border: none;
        }
        :global(.leaflet-popup-content-wrapper) {
          border-radius: 8px;
        }
        :global(.leaflet-popup-content) {
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

function ShipmentTrackingMap({ shipment }: { shipment: ShipmentRow | null }) {
  if (!shipment) return null;

  // Fallback route coordinates are used when shipment map data is incomplete.
  const originLat = shipment.warehouse?.latitude;
  const originLng = shipment.warehouse?.longitude;
  const hasOrigin =
    typeof originLat === "number" &&
    Number.isFinite(originLat) &&
    typeof originLng === "number" &&
    Number.isFinite(originLng);

  // Check if we have actual delivery location
  const hasDeliveryLocation = hasValidDeliveryLocation(shipment);
  const deliveryAssignment = getCurrentDeliveryAssignment(shipment);

  const routeCoordinates: [number, number][] = hasOrigin
    ? hasDeliveryLocation
      ? [
          [originLat as number, originLng as number],
          [
            deliveryAssignment?.deliveredLatitude as number,
            deliveryAssignment?.deliveredLongitude as number,
          ],
        ]
      : [
          [originLat as number, originLng as number],
          [(originLat as number) + 0.03, (originLng as number) + 0.03],
          [(originLat as number) + 0.06, (originLng as number) + 0.06],
          [(originLat as number) + 0.09, (originLng as number) + 0.09],
        ]
    : [
        [23.685, 90.3563],
        [23.75, 90.4],
        [23.8, 90.45],
        [23.85, 90.5],
      ];

  const getStatusColor = (status: ShipmentStatusType) => {
    switch (status) {
      case "DELIVERED":
        return "#10b981";
      case "CANCELLED":
      case "RETURNED":
        return "#ef4444";
      case "OUT_FOR_DELIVERY":
        return "#f59e0b";
      default:
        return "#06b6d4";
    }
  };

  const getProgressPercentage = () => {
    switch (shipment.status) {
      case "PENDING":
        return 0;
      case "IN_TRANSIT":
        return 50;
      case "OUT_FOR_DELIVERY":
        return 75;
      case "DELIVERED":
        return 100;
      case "CANCELLED":
      case "RETURNED":
        return 100;
      default:
        return 0;
    }
  };

  const progress = getProgressPercentage();
  const statusColor = getStatusColor(shipment.status);

  // Calculate current position based on progress
  const currentPositionIndex = Math.floor(
    (progress / 100) * (routeCoordinates.length - 1),
  );
  const currentPosition = routeCoordinates[currentPositionIndex];

  return (
    <div className="h-64 w-full rounded-[22px] overflow-hidden border border-border/60 bg-card">
      <MapContainer
        center={routeCoordinates[0]}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route line */}
        <Polyline
          positions={routeCoordinates}
          pathOptions={{
            color: statusColor,
            weight: 3,
            opacity: 0.7,
            dashArray: progress < 100 ? [10, 10] : [],
          }}
        />

        {/* Route markers */}
        {routeCoordinates.map((coord, index) => {
          const isCompleted =
            (index / (routeCoordinates.length - 1)) * 100 <= progress;
          const isCurrent = index === currentPositionIndex;

          return (
            <Marker
              key={index}
              position={coord}
              icon={L.divIcon({
                className: "custom-div-icon",
                html: `
                  <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    isCompleted
                      ? "bg-emerald-500 border-emerald-600"
                      : isCurrent
                        ? "bg-primary border-primary-600 animate-pulse"
                        : "bg-muted border-border"
                  }">
                    <div class="w-3 h-3 rounded-full ${
                      isCompleted
                        ? "bg-emerald-100"
                        : isCurrent
                          ? "bg-primary-foreground"
                          : "bg-muted-foreground"
                    }"></div>
                  </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              })}
            >
              <Popup className="min-w-[200px]">
                <div className="text-sm">
                  <div className="font-semibold mb-1">
                    {index === 0 && "Origin warehouse"}
                    {index === routeCoordinates.length - 1 &&
                    hasDeliveryLocation
                      ? "Delivery location"
                      : "Destination"}
                    {index > 0 &&
                      index < routeCoordinates.length - 1 &&
                      `Checkpoint ${index}`}
                  </div>
                  <div className="text-muted-foreground">
                    Route status:{" "}
                    {isCompleted
                      ? "Completed"
                      : isCurrent
                        ? "Current position"
                        : "Upcoming"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Current position marker */}
        {currentPosition && progress > 0 && progress < 100 && (
          <Marker
            position={currentPosition}
            icon={L.divIcon({
              className: "current-position-marker",
              html: `
                <div class="relative">
                  <div class="absolute inset-0 bg-primary rounded-full animate-ping opacity-75"></div>
                  <div class="relative w-6 h-6 bg-primary rounded-full border-2 border-primary-foreground"></div>
                </div>
              `,
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            })}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold mb-1">Current location</div>
                <div className="text-muted-foreground">
                  Shipment #{shipment.id}
                </div>
                <div className="text-muted-foreground">
                  Status: {formatStatusLabel(shipment.status)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Delivery location marker */}
        {hasDeliveryLocation && shipment.status === "DELIVERED" && (
          <Marker
            position={[
              deliveryAssignment?.deliveredLatitude as number,
              deliveryAssignment?.deliveredLongitude as number,
            ]}
            icon={L.divIcon({
              className: "delivery-location-marker",
              html: `
                <div class="relative">
                  <div class="absolute inset-0 bg-emerald-500 rounded-full opacity-30"></div>
                  <div class="relative w-8 h-8 bg-emerald-500 rounded-full border-2 border-emerald-600 flex items-center justify-center">
                    <div class="w-3 h-3 bg-emerald-100 rounded-full"></div>
                  </div>
                </div>
              `,
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            })}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold mb-1">Delivery location</div>
                <div className="text-muted-foreground">
                  Shipment #{shipment.id}
                </div>
                <div className="text-muted-foreground">
                  Delivered at:{" "}
                  {formatDateTime(
                    deliveryAssignment?.deliveredAt ?? shipment.deliveredAt,
                  )}
                </div>
                {deliveryAssignment?.deliveredAccuracy && (
                  <div className="text-muted-foreground">
                    Accuracy: +/-
                    {Math.round(deliveryAssignment.deliveredAccuracy)}m
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <style jsx>{`
        .custom-div-icon {
          background: transparent;
          border: none;
        }
        .current-position-marker {
          z-index: 1000 !important;
        }
        .delivery-location-marker {
          z-index: 999 !important;
        }
        :global(.leaflet-popup-content-wrapper) {
          border-radius: 8px;
        }
        :global(.leaflet-popup-content) {
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

function statusPill(status: ShipmentStatusType) {
  const cls =
    status === "DELIVERED"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : status === "CANCELLED" || status === "RETURNED"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-700"
        : status === "OUT_FOR_DELIVERY"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
          : "border-cyan-500/20 bg-cyan-500/10 text-cyan-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

function DashboardCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-border/60 bg-card p-5 shadow-sm backdrop-blur ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function LogisticsPage() {
  const [filter, setFilter] = useState<"ALL" | ShipmentStatusType>("ALL");
  const [search, setSearch] = useState("");
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | "ALL">(
    "ALL",
  );
  const [loading, setLoading] = useState(true);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(
    null,
  );

  const loadWarehouses = useCallback(async () => {
    try {
      setWarehousesLoading(true);
      const res = await fetch("/api/warehouses", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load warehouses");
      setWarehouses(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load warehouses:", e);
    } finally {
      setWarehousesLoading(false);
    }
  }, []);

  const loadShipments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/shipments?page=1&limit=200`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Failed to load logistics shipments");
      setShipments(Array.isArray(data?.shipments) ? data.shipments : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load logistics shipments",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWarehouses();
    loadShipments();
  }, [loadWarehouses, loadShipments]);

  const filteredShipments = useMemo(() => {
    const term = search.trim().toLowerCase();

    return shipments.filter((shipment) => {
      if (filter !== "ALL" && shipment.status !== filter) {
        return false;
      }

      if (
        selectedWarehouse !== "ALL" &&
        shipment.warehouseId !== selectedWarehouse
      ) {
        return false;
      }

      if (!term) {
        return true;
      }

      const searchFields = [
        shipment.id,
        shipment.orderId,
        shipment.status,
        shipment.courier,
        shipment.courierStatus,
        shipment.trackingNumber,
        shipment.dispatchNote,
        shipment.priority,
        shipment.order?.name,
        shipment.order?.phone_number,
        shipment.order?.status,
        shipment.order?.paymentStatus,
        shipment.assignedTo?.name,
        shipment.assignedTo?.email,
        shipment.warehouse?.name,
        shipment.warehouse?.code,
        shipment.shippingRate?.area,
        shipment.shippingRate?.district,
      ];

      return searchFields.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      );
    });
  }, [filter, search, selectedWarehouse, shipments]);

  useEffect(() => {
    if (
      selectedShipmentId &&
      !filteredShipments.some((shipment) => shipment.id === selectedShipmentId)
    ) {
      setSelectedShipmentId(null);
    }
  }, [filteredShipments, selectedShipmentId]);

  const deliveredCount = filteredShipments.filter(
    (item) => item.status === "DELIVERED",
  ).length;
  const activeCount = filteredShipments.filter(
    (item) =>
      item.status === "IN_TRANSIT" ||
      item.status === "OUT_FOR_DELIVERY" ||
      item.status === "PENDING",
  ).length;
  const atRiskCount = filteredShipments.filter((item) => {
    if (item.status === "DELIVERED" || item.status === "CANCELLED")
      return false;
    if (!item.expectedDate) return item.status === "PENDING";
    return new Date(item.expectedDate).getTime() < Date.now();
  }).length;
  const assignedCount = filteredShipments.filter(
    (item) => item.assignedTo,
  ).length;
  const successRate = filteredShipments.length
    ? Math.round((deliveredCount / filteredShipments.length) * 100)
    : 0;

  const costSummary = useMemo(() => {
    const estimated = filteredShipments.reduce(
      (sum, item) => sum + toAmount(item.estimatedCost),
      0,
    );
    const actual = filteredShipments.reduce(
      (sum, item) => sum + toAmount(item.actualCost),
      0,
    );
    const thirdParty = filteredShipments.reduce(
      (sum, item) => sum + toAmount(item.thirdPartyCost),
      0,
    );
    const handling = filteredShipments.reduce(
      (sum, item) =>
        sum +
        toAmount(item.handlingCost) +
        toAmount(item.packagingCost) +
        toAmount(item.fuelCost),
      0,
    );

    return {
      estimated,
      actual,
      thirdParty,
      handling,
      variance: actual - estimated,
    };
  }, [filteredShipments]);

  const capacityRows = useMemo(() => {
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const total = Math.max(activeCount, 1);
    const base = [0.42, 0.55, 0.78, 0.61, 0.7];

    return weekdays.map((day, index) => {
      const count = Math.min(
        100,
        Math.round(((base[index] * total + index * 3) / total) * 100),
      );
      return { day, count };
    });
  }, [activeCount]);

  const priorityShipments = useMemo(() => {
    return [...filteredShipments]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.id - a.id)
      .slice(0, 4);
  }, [filteredShipments]);

  const latestMovements = useMemo(() => {
    return [...filteredShipments]
      .sort(
        (a, b) =>
          new Date(
            b.deliveredAt || b.outForDeliveryAt || b.pickedAt || b.createdAt,
          ).getTime() -
          new Date(
            a.deliveredAt || a.outForDeliveryAt || a.pickedAt || a.createdAt,
          ).getTime(),
      )
      .slice(0, 3);
  }, [filteredShipments]);

  const selectedShipment = selectedShipmentId
    ? (filteredShipments.find((item) => item.id === selectedShipmentId) ?? null)
    : null;

  const highlightedShipment =
    selectedShipment ||
    priorityShipments[0] ||
    filteredShipments.find((item) => item.status === "OUT_FOR_DELIVERY") ||
    filteredShipments[0];

  const updateShipmentStatus = async (
    shipmentId: number,
    nextStatus: ShipmentStatusType,
  ) => {
    try {
      setUpdatingId(shipmentId);
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update shipment");
      await loadShipments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update shipment");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
        <section className="overflow-hidden rounded-[32px] border border-border/60 bg-card p-5 shadow-sm md:p-7">
          <div className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Logistics Operations
                </span>
                <span className="rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  Live shipment overview
                </span>
              </div>

              <div className="mt-4 max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Manage Shipment Activity, Delivery Performance, and Dispatch
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                  Review shipment progress, warehouse activity, delivery costs,
                  and operational exceptions in a clear and structured
                  dashboard.
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[24px] bg-primary px-4 py-4 text-primary-foreground shadow-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-primary-foreground/80">
                    Active shipments
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{activeCount}</p>
                  <p className="mt-2 text-sm text-primary-foreground/70">
                    Pending, in transit, and out-for-delivery shipments
                  </p>
                </div>
                <div className="rounded-[24px] border border-border/60 bg-card px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Success rate
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {successRate}%
                  </p>
                  <p className="mt-2 text-sm text-emerald-600">
                    {deliveredCount} delivered in the current view
                  </p>
                </div>
                <div className="rounded-[24px] border border-border/60 bg-card px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Assigned shipments
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {assignedCount}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Shipments currently assigned to a team member
                  </p>
                </div>
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-700">
                    Attention required
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">
                    {atRiskCount}
                  </p>
                  <p className="mt-2 text-sm text-amber-700">
                    Overdue or unscheduled shipments
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-border/60 bg-muted p-5 text-muted-foreground shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground/70">
                    Cost overview
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Financial summary
                  </h2>
                </div>
                <div className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground/70">
                  Weekly
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/55">
                    Estimated
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatAmount(costSummary.estimated)}
                  </p>
                </div>
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/55">
                    Actual
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatAmount(costSummary.actual)}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-700">
                    Variance
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatAmount(costSummary.variance)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] bg-card p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-[6px] border-primary border-r-primary/20 border-t-primary/40 text-center">
                      <p className="text-3xl font-semibold leading-none">
                        {successRate}%
                      </p>
                      <p className="mt-1 text-[10px] leading-none uppercase tracking-[0.08em] text-muted-foreground/70">
                        Delivered
                      </p>
                    </div>

                    <div className="text-sm leading-6 text-muted-foreground/70">
                      Delivery performance for the current selection based on
                      completed shipments.
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/55">
                    Team capacity
                  </p>
                  <div className="mt-3 space-y-3">
                    {capacityRows.map((row) => (
                      <div
                        key={row.day}
                        className="grid grid-cols-[32px,1fr,36px] items-center gap-3"
                      >
                        <span className="text-xs text-muted-foreground/55">
                          {row.day}
                        </span>
                        <div className="h-2.5 rounded-full bg-muted">
                          <div
                            className="h-2.5 rounded-full bg-primary"
                            style={{ width: `${row.count}%` }}
                          />
                        </div>
                        <span className="text-right text-xs text-muted-foreground/70">
                          {row.count}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr,1.05fr,0.9fr]">
          <DashboardCard
            title="Monthly order trend"
            subtitle="Estimated shipment demand"
          >
            <div className="flex items-end justify-between gap-2">
              {monthlyOrderBars.map((bar) => (
                <div
                  key={bar.label}
                  className="flex flex-1 flex-col items-center gap-3"
                >
                  <div className="flex h-40 items-end">
                    <div
                      className="w-8 rounded-full bg-primary shadow-sm"
                      style={{ height: `${bar.value}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Projected dispatch volume
              </span>
              <span className="font-semibold text-emerald-700">
                {filteredShipments.length} shipments
              </span>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Delivery performance"
            subtitle="Completion rate overview"
          >
            <div className="grid gap-5 md:grid-cols-[120px,1fr] md:items-center">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-[10px] border-primary border-r-primary/20 border-t-primary/40">
                <div className="text-center">
                  <p className="text-3xl font-semibold text-foreground">
                    {successRate}%
                  </p>
                  <p className="text-xs uppercase text-muted-foreground">
                    Delivered
                  </p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                {successBars.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-full bg-primary"
                    style={{ height: `${height}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-4 text-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                Delivered: {deliveredCount}
              </span>
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                Active: {activeCount}
              </span>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Capacity overview"
            subtitle="Dispatcher workload distribution"
          >
            <div className="space-y-4">
              {capacityRows.map((row, index) => (
                <div
                  key={row.day}
                  className="grid grid-cols-[34px,1fr,42px] items-center gap-3"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {row.day}
                  </span>
                  <div className="h-3 rounded-full bg-muted">
                    <div
                      className={`h-3 rounded-full ${
                        index % 2 === 0 ? "bg-primary" : "bg-secondary"
                      }`}
                      style={{ width: `${row.count}%` }}
                    />
                  </div>
                  <span className="text-right text-xs font-semibold text-muted-foreground">
                    {row.count}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-border/60 bg-muted p-4 text-sm text-muted-foreground">
              Internal handling cost:{" "}
              <span className="font-semibold text-foreground">
                {formatAmount(costSummary.handling)}
              </span>
            </div>
          </DashboardCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
          <DashboardCard
            title="Shipment Operations"
            subtitle="Search shipments, apply filters, and update status"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by shipment, order, customer, courier, or assignee"
                  className="h-12 w-full rounded-full border border-border bg-background px-5 text-sm text-foreground outline-none transition focus:border-primary"
                />
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as "ALL" | ShipmentStatusType)
                  }
                  className="h-12 rounded-full border border-border bg-background px-5 text-sm text-foreground outline-none transition focus:border-primary"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedWarehouse}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedWarehouse(
                      value === "ALL" ? "ALL" : Number(value),
                    );
                  }}
                  className="h-12 rounded-full border border-border bg-background px-5 text-sm text-foreground outline-none transition focus:border-primary"
                  disabled={warehousesLoading}
                >
                  <option value="ALL">
                    {warehousesLoading
                      ? "Loading warehouses..."
                      : "All warehouses"}
                  </option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="mt-5 max-h-[500px] overflow-y-auto">
              {loading ? (
                <ShipmentsSkeleton />
              ) : !filteredShipments.length ? (
                <div className="rounded-[22px] border border-border/60 bg-muted px-4 py-16 text-center text-sm text-muted-foreground">
                  <p className="text-base font-medium text-foreground">
                    No shipments match the current filters.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Adjust the filters or add new shipments from the shipment
                    administration page.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredShipments.map((shipment) => {
                    const nextStatuses = NEXT_STATUS_MAP[shipment.status] || [];
                    const hasDeliveryLocation =
                      hasValidDeliveryLocation(shipment);
                    const deliveryAssignment =
                      getCurrentDeliveryAssignment(shipment);
                    const isSelected = shipment.id === selectedShipmentId;

                    return (
                      <article
                        key={shipment.id}
                        className={`rounded-[24px] border bg-card p-4 shadow-sm transition ${
                          isSelected
                            ? "border-primary/60 ring-1 ring-primary/20"
                            : "border-border/60 hover:border-primary/30"
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedShipmentId(shipment.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedShipmentId(shipment.id);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                Shipment
                              </p>
                              <p className="mt-2 text-base font-semibold text-foreground">
                                Shipment #{shipment.id} | Order #
                                {shipment.orderId}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {shipment.order?.name ||
                                  "Customer not available"}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {shipment.trackingNumber ||
                                  "Tracking number not assigned"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                Management
                              </p>
                              <p className="mt-2 text-sm font-semibold text-foreground">
                                {shipment.assignedTo?.name || "Not assigned"}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Warehouse {shipment.warehouseId || "-"} |
                                Priority {shipment.priority || 0}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {shipment.dispatchNote ||
                                  "No dispatch notes available"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                Cost
                              </p>
                              <p className="mt-2 text-sm font-semibold text-foreground">
                                Estimated{" "}
                                {formatAmount(toAmount(shipment.estimatedCost))}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Actual{" "}
                                {formatAmount(toAmount(shipment.actualCost))}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Internal{" "}
                                {formatAmount(
                                  toAmount(shipment.handlingCost) +
                                    toAmount(shipment.packagingCost) +
                                    toAmount(shipment.fuelCost),
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                Timeline
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                Assigned: {formatShortDate(shipment.assignedAt)}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Expected delivery:{" "}
                                {formatShortDate(shipment.expectedDate)}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Delivered:{" "}
                                {formatShortDate(shipment.deliveredAt)}
                              </p>
                            </div>
                          </div>

                          <div className="min-w-full xl:min-w-[260px]">
                            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                              {statusPill(shipment.status)}
                              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                                {shipment.courier}
                                {shipment.courierStatus
                                  ? ` - ${shipment.courierStatus}`
                                  : ""}
                              </span>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 xl:justify-end">
                              {nextStatuses.length ? (
                                nextStatuses.map((nextStatus) => (
                                  <button
                                    key={nextStatus}
                                    type="button"
                                    disabled={updatingId === shipment.id}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateShipmentStatus(
                                        shipment.id,
                                        nextStatus,
                                      );
                                    }}
                                    className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {updatingId === shipment.id
                                      ? "Updating..."
                                      : NEXT_STATUS_LABELS[nextStatus]}
                                  </button>
                                ))
                              ) : (
                                <span className="rounded-full bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
                                  No further action available
                                </span>
                              )}

                              {shipment.trackingUrl ? (
                                <a
                                  href={shipment.trackingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                                >
                                  Open tracking
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Shipment tracking"
            subtitle={
              selectedWarehouse === "ALL"
                ? "Warehouse-level shipment visibility"
                : "Detailed route view for the selected shipment"
            }
          >
            <div className="max-h-[600px] overflow-y-auto">
              {selectedWarehouse === "ALL" ? (
                <>
                  <MultiShipmentsMap shipments={filteredShipments} />
                  <div className="mt-5">
                    <p className="text-sm text-muted-foreground">
                      Showing warehouse activity for {filteredShipments.length}{" "}
                      shipments
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Select a warehouse to review route progress for an
                      individual shipment.
                    </p>
                  </div>
                </>
              ) : highlightedShipment ? (
                <>
                  <ShipmentTrackingMap shipment={highlightedShipment} />

                  <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Tracking reference #
                        {highlightedShipment.trackingNumber ||
                          highlightedShipment.id}
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {highlightedShipment.order?.name || "Customer shipment"}
                      </p>
                      {typeof selectedWarehouse === "number" && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Warehouse:{" "}
                          {highlightedShipment.warehouse?.name ||
                            `Warehouse ${highlightedShipment.warehouseId}`}
                        </p>
                      )}
                    </div>
                    <div>{statusPill(highlightedShipment.status)}</div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {[
                      {
                        label: "Picked up",
                        value: formatDateTime(highlightedShipment.pickedAt),
                        tone: "bg-amber-500",
                      },
                      {
                        label: "In transit",
                        value: formatDateTime(
                          highlightedShipment.outForDeliveryAt ||
                            highlightedShipment.assignedAt,
                        ),
                        tone: "bg-cyan-500",
                      },
                      {
                        label: "Delivered",
                        value: formatDateTime(highlightedShipment.deliveredAt),
                        tone: "bg-emerald-500",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[16px,1fr,140px] items-start gap-3"
                      >
                        <span
                          className={`mt-1 h-3 w-3 rounded-full ${item.tone}`}
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            {item.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {highlightedShipment.dispatchNote ||
                              "Shipment activity recorded in dispatch timeline"}
                          </p>
                        </div>
                        <div className="text-right text-sm font-medium text-muted-foreground">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-[22px] border border-border/60 bg-muted px-4 py-16 text-center text-sm text-muted-foreground">
                  {typeof selectedWarehouse === "number"
                    ? "No shipments are available for the selected warehouse."
                    : "No shipment data is available for the map view yet."}
                </div>
              )}
            </div>
          </DashboardCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <DashboardCard
            title="Priority dispatch"
            subtitle="Highest-priority shipments in the current view"
          >
            <div className="grid gap-5 lg:grid-cols-[1fr,240px]">
              <div>
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-[24px] bg-muted px-5 py-5 text-muted-foreground">
                  <div>
                    <p className="text-sm text-muted-foreground/70">
                      Active delivery workload
                    </p>
                    <p className="mt-2 text-4xl font-semibold">{activeCount}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/50">
                      At risk
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{atRiskCount}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {priorityShipments.length ? (
                    priorityShipments.map((shipment) => (
                      <div
                        key={shipment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border/60 bg-muted px-4 py-4"
                      >
                        <div>
                          <p className="font-semibold text-foreground">
                            {shipment.courier || "Courier pending"}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Order #{shipment.orderId} |{" "}
                            {shipment.order?.name || "Customer not available"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            ETA
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatShortDate(shipment.expectedDate)}
                          </p>
                        </div>
                        <div>{statusPill(shipment.status)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-border/60 bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
                      No priority shipments are available in the current view.
                    </div>
                  )}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[28px] bg-primary p-5 text-primary-foreground">
                <div className="absolute -right-10 bottom-3 h-36 w-36 rounded-full bg-primary-foreground/10 blur-2xl" />
                <div className="absolute left-8 top-8 h-20 w-20 rounded-full bg-primary-foreground/10 blur-xl" />
                <div className="relative">
                  <p className="text-xs uppercase tracking-[0.24em] text-primary-foreground/70">
                    Featured shipment
                  </p>
                  <div className="mt-6 rounded-[24px] border border-border/60 bg-primary/40 px-4 py-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary-foreground/80">
                        Priority level
                      </span>
                      <span className="rounded-full bg-primary/40 px-3 py-1 text-xs border border-border/60">
                        P{highlightedShipment?.priority || 0}
                      </span>
                    </div>
                    <p className="mt-6 text-3xl font-semibold">
                      {highlightedShipment?.courier || "Dispatch"}
                    </p>
                    <p className="mt-2 text-sm text-primary-foreground/80">
                      {highlightedShipment?.trackingNumber ||
                        "Tracking number not assigned"}
                    </p>
                    <div className="mt-8 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-primary-foreground border border-border/60" />
                      <span className="text-sm text-primary-foreground/80">
                        {highlightedShipment?.assignedTo?.name ||
                          "Assignment pending"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Operations summary"
            subtitle="Recent shipment activity and costs"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Third-party delivery cost
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {formatAmount(costSummary.thirdParty)}
                </p>
              </div>
              <div className="rounded-[22px] bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Actual delivery spend
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {formatAmount(costSummary.actual)}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {latestMovements.length ? (
                latestMovements.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="flex items-center justify-between gap-3 rounded-[20px] border border-border/60 bg-muted px-4 py-4"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        Shipment #{shipment.id} - Order #{shipment.orderId}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {shipment.courier} -{" "}
                        {shipment.assignedTo?.name || "Not assigned"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatShortDate(
                          shipment.deliveredAt ||
                            shipment.outForDeliveryAt ||
                            shipment.pickedAt ||
                            shipment.createdAt,
                        )}
                      </p>
                      <div className="mt-2">{statusPill(shipment.status)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-border/60 bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
                  No recent shipment activity was found.
                </div>
              )}
            </div>
          </DashboardCard>
        </section>
      </div>
    </div>
  );
}
