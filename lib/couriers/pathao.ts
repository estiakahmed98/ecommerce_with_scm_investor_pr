import type {
  CourierCreateShipmentResult,
  CourierProvider,
  CourierTrackingResult,
  CreateCourierShipmentInput,
} from "./types";
import type { Courier, ShipmentStatus } from "@/generated/prisma";

function mapPathaoStatus(raw?: string | null): ShipmentStatus {
  const status = (raw || "").toLowerCase();
  if (status.includes("delivered")) return "DELIVERED";
  if (status.includes("return")) return "RETURNED";
  if (status.includes("out_for_delivery")) return "OUT_FOR_DELIVERY";
  if (status.includes("in_transit") || status.includes("picked")) return "IN_TRANSIT";
  if (status.includes("cancel")) return "CANCELLED";
  return "PENDING";
}

function buildAuthHeaders(courier: Courier): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(courier.apiKey ? { Authorization: `Bearer ${courier.apiKey}` } : {}),
    ...(courier.clientId ? { "X-Client-Id": courier.clientId } : {}),
    ...(courier.secretKey ? { "X-Client-Secret": courier.secretKey } : {}),
  };
}

export const pathaoProvider: CourierProvider = {
  async createShipment(
    courier: Courier,
    input: CreateCourierShipmentInput,
  ): Promise<CourierCreateShipmentResult> {
    const endpoint = `${courier.baseUrl.replace(/\/$/, "")}/orders`;

    // Dummy integration point:
    // Replace payload shape & endpoint with real Pathao docs/SDK methods.
    const payload = {
      merchant_order_id: String(input.orderId),
      recipient_name: input.recipient.name,
      recipient_phone: input.recipient.phone,
      recipient_address: input.recipient.address,
      recipient_city: input.recipient.district || "",
      amount_to_collect: input.cashOnDelivery ? input.orderAmount : 0,
      item_type: "parcel",
      special_instruction: input.note || "",
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(courier),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pathao create shipment failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    return {
      externalId: String(data?.data?.consignment_id || data?.consignment_id || ""),
      trackingNumber: String(
        data?.data?.tracking_number || data?.tracking_number || `PTH-${input.shipmentId}`,
      ),
      trackingUrl:
        data?.data?.tracking_url ||
        data?.tracking_url ||
        `${courier.baseUrl.replace(/\/$/, "")}/track/${data?.data?.tracking_number || data?.tracking_number || ""}`,
      courierStatus: data?.data?.status || data?.status || "created",
      status: "PENDING",
      raw: data,
    };
  },

  async getTracking(
    courier: Courier,
    shipment: { trackingNumber?: string | null; externalId?: string | null },
  ): Promise<CourierTrackingResult> {
    const token = shipment.externalId || shipment.trackingNumber;
    if (!token) {
      throw new Error("Pathao tracking requires externalId or trackingNumber");
    }

    const endpoint = `${courier.baseUrl.replace(/\/$/, "")}/track/${token}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildAuthHeaders(courier),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pathao tracking failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    const rawStatus = data?.data?.status || data?.status || "pending";
    return {
      externalId: shipment.externalId || data?.data?.consignment_id || null,
      trackingNumber: shipment.trackingNumber || data?.data?.tracking_number || null,
      trackingUrl:
        data?.data?.tracking_url ||
        `${courier.baseUrl.replace(/\/$/, "")}/track/${shipment.trackingNumber || ""}`,
      courierStatus: rawStatus,
      status: mapPathaoStatus(rawStatus),
      lastEventAt: data?.data?.updated_at || null,
      raw: data,
    };
  },
};
