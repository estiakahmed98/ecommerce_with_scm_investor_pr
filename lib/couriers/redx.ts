import type {
  CourierCreateShipmentResult,
  CourierProvider,
  CourierTrackingResult,
  CreateCourierShipmentInput,
} from "./types";
import type { Courier, ShipmentStatus } from "@/generated/prisma";

function mapRedXStatus(raw?: string | null): ShipmentStatus {
  const status = (raw || "").toLowerCase();
  if (status.includes("delivered")) return "DELIVERED";
  if (status.includes("returned") || status.includes("return")) return "RETURNED";
  if (status.includes("on_the_way") || status.includes("in_transit")) return "IN_TRANSIT";
  if (status.includes("out_for_delivery")) return "OUT_FOR_DELIVERY";
  if (status.includes("cancel")) return "CANCELLED";
  return "PENDING";
}

function buildAuthHeaders(courier: Courier): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(courier.apiKey ? { "X-API-KEY": courier.apiKey } : {}),
    ...(courier.secretKey ? { "X-API-SECRET": courier.secretKey } : {}),
  };
}

export const redxProvider: CourierProvider = {
  async createShipment(
    courier: Courier,
    input: CreateCourierShipmentInput,
  ): Promise<CourierCreateShipmentResult> {
    const endpoint = `${courier.baseUrl.replace(/\/$/, "")}/parcel`;

    // Dummy integration point:
    // Replace with real RedX endpoint/SDK payload.
    const payload = {
      merchant_order_id: String(input.orderId),
      customer_name: input.recipient.name,
      customer_phone: input.recipient.phone,
      delivery_area: input.recipient.area || input.recipient.district || "",
      delivery_address: input.recipient.address,
      cash_collection: input.cashOnDelivery ? input.orderAmount : 0,
      parcel_details: input.items.map((item) => `${item.name} x${item.quantity}`).join(", "),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(courier),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RedX create shipment failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const trackingNumber = String(
      data?.data?.tracking_id || data?.tracking_id || `RDX-${input.shipmentId}`,
    );

    return {
      externalId: String(data?.data?.parcel_id || data?.parcel_id || ""),
      trackingNumber,
      trackingUrl:
        data?.data?.tracking_url ||
        `${courier.baseUrl.replace(/\/$/, "")}/tracking/${trackingNumber}`,
      courierStatus: data?.data?.status || data?.status || "created",
      status: "PENDING",
      raw: data,
    };
  },

  async getTracking(
    courier: Courier,
    shipment: { trackingNumber?: string | null; externalId?: string | null },
  ): Promise<CourierTrackingResult> {
    const token = shipment.trackingNumber || shipment.externalId;
    if (!token) {
      throw new Error("RedX tracking requires trackingNumber or externalId");
    }

    const endpoint = `${courier.baseUrl.replace(/\/$/, "")}/tracking/${token}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildAuthHeaders(courier),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RedX tracking failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const rawStatus = data?.data?.status || data?.status || "pending";
    return {
      externalId: shipment.externalId || data?.data?.parcel_id || null,
      trackingNumber: shipment.trackingNumber || data?.data?.tracking_id || null,
      trackingUrl:
        data?.data?.tracking_url ||
        `${courier.baseUrl.replace(/\/$/, "")}/tracking/${token}`,
      courierStatus: rawStatus,
      status: mapRedXStatus(rawStatus),
      lastEventAt: data?.data?.updated_at || null,
      raw: data,
    };
  },
};
