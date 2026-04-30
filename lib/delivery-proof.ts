import { randomInt, randomUUID } from "crypto";
import { Prisma } from "@/generated/prisma";

const FALLBACK_APP_URL = "http://localhost:3000";

function normalizeBaseUrl(raw?: string | null) {
  const value = raw?.trim() || FALLBACK_APP_URL;
  return value.replace(/\/+$/, "");
}

export function getAppBaseUrl() {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || FALLBACK_APP_URL,
  );
}

export function buildDeliveryConfirmationToken() {
  return randomUUID();
}

export function buildDeliveryConfirmationPin() {
  return String(randomInt(100000, 1000000));
}

export function buildDeliveryConfirmationUrl(token: string) {
  return `${getAppBaseUrl()}/customer/confirm/${token}`;
}

export function isDeliveryConfirmationStatus(status: string | null | undefined) {
  const normalized = String(status || "").toUpperCase();
  return normalized === "OUT_FOR_DELIVERY" || normalized === "DELIVERED";
}

export async function ensureShipmentDeliveryConfirmation(
  tx: Prisma.TransactionClient,
  shipmentId: number,
) {
  const shipment = await tx.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      status: true,
      deliveryConfirmationToken: true,
      deliveryConfirmationPin: true,
      deliveryConfirmationRequestedAt: true,
    },
  });

  if (!shipment || !isDeliveryConfirmationStatus(shipment.status)) {
    return shipment;
  }

  if (shipment.deliveryConfirmationToken && shipment.deliveryConfirmationPin) {
    return shipment;
  }

  return tx.shipment.update({
    where: { id: shipmentId },
    data: {
      deliveryConfirmationToken:
        shipment.deliveryConfirmationToken || buildDeliveryConfirmationToken(),
      deliveryConfirmationPin:
        shipment.deliveryConfirmationPin || buildDeliveryConfirmationPin(),
      deliveryConfirmationRequestedAt:
        shipment.deliveryConfirmationRequestedAt || new Date(),
    },
    select: {
      id: true,
      status: true,
      deliveryConfirmationToken: true,
      deliveryConfirmationPin: true,
      deliveryConfirmationRequestedAt: true,
    },
  });
}
