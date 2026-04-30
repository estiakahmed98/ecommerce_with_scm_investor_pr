export type CourierType = "PATHAO" | "REDX" | "STEADFAST" | "CUSTOM";

export type Courier = {
  id: number;
  name: string;
  type: CourierType;
  baseUrl: string;
  apiKey?: string;
  secretKey?: string;
  clientId?: string;
  isActive: boolean;
};

export type CourierForm = {
  name: string;
  type: CourierType;
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  clientId: string;
};

export type CourierETARequest = {
  trackingNumber: string;
  courierType: CourierType;
};

export type CourierETAResponse = {
  trackingNumber: string;
  status: string;
  estimatedDelivery: string;
  currentLocation: string;
  lastUpdate: string;
};
