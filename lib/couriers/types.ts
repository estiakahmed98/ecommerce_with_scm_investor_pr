import type { Courier, CourierType, ShipmentStatus } from "@/generated/prisma";

export interface CourierRecipient {
  name: string;
  phone: string;
  address: string;
  area?: string | null;
  district?: string | null;
  country?: string | null;
}

export interface CourierParcelItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateCourierShipmentInput {
  shipmentId: number;
  orderId: number;
  orderAmount: number;
  cashOnDelivery: boolean;
  recipient: CourierRecipient;
  items: CourierParcelItem[];
  note?: string | null;
}

export interface CourierCreateShipmentResult {
  externalId: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  courierStatus?: string | null;
  status?: ShipmentStatus;
  raw?: unknown;
}

export interface CourierTrackingResult {
  externalId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courierStatus: string;
  status: ShipmentStatus;
  lastEventAt?: string | null;
  raw?: unknown;
}

export interface CourierProvider {
  createShipment(
    courier: Courier,
    input: CreateCourierShipmentInput,
  ): Promise<CourierCreateShipmentResult>;
  getTracking(
    courier: Courier,
    shipment: { trackingNumber?: string | null; externalId?: string | null },
  ): Promise<CourierTrackingResult>;
}

export type CourierWithType = Courier & { type: CourierType };
