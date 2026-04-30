import type { Courier, CourierType } from "@/generated/prisma";
import type { CourierProvider } from "./types";
import { pathaoProvider } from "./pathao";
import { redxProvider } from "./redx";

const providerMap: Record<CourierType, CourierProvider> = {
  PATHAO: pathaoProvider,
  REDX: redxProvider,
  STEADFAST: {
    async createShipment() {
      throw new Error("STEADFAST courier provider is not implemented");
    },
    async getTracking() {
      throw new Error("STEADFAST courier provider is not implemented");
    },
  },
  CUSTOM: {
    async createShipment() {
      throw new Error("CUSTOM courier provider is not implemented");
    },
    async getTracking() {
      throw new Error("CUSTOM courier provider is not implemented");
    },
  },
};

export function getCourierProvider(courier: Courier): CourierProvider {
  const provider = providerMap[courier.type];
  if (!provider) {
    throw new Error(`Unsupported courier type: ${courier.type}`);
  }
  return provider;
}
