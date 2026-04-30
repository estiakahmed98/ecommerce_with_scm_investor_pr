export type DeliveryAssignmentStatusValue =
  | "ASSIGNED"
  | "ACCEPTED"
  | "REJECTED"
  | "PICKUP_CONFIRMED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

export type PickupProofStatusValue = "PENDING" | "CONFIRMED";

export type DeliveryAssignmentActor = {
  id: string;
  name: string | null;
  email?: string | null;
};

export type DeliveryAssignmentLogEntry = {
  id: string;
  fromStatus: DeliveryAssignmentStatusValue | null;
  toStatus: DeliveryAssignmentStatusValue;
  note: string | null;
  createdAt: string;
  actor: DeliveryAssignmentActor | null;
};

export type DeliveryPickupProof = {
  id: string;
  status: PickupProofStatusValue;
  productReceived: boolean;
  packagingOk: boolean;
  productInGoodCondition: boolean;
  imageUrl: string | null;
  note: string | null;
  confirmedAt: string | null;
  createdAt: string;
  actor: DeliveryAssignmentActor | null;
};

export type DeliveryAssignmentItem = {
  id: number;
  quantity: number;
  price: string | number;
  currency: string;
  product: {
    id: number;
    name: string;
    image: string | null;
  };
  variant: {
    id: number;
    sku: string | null;
    options: unknown;
  } | null;
};

export type DeliveryAssignmentData = {
  id: string;
  status: DeliveryAssignmentStatusValue;
  pickupProofStatus: PickupProofStatusValue;
  isCurrent: boolean;
  rejectionReason: string | null;
  note: string | null;
  latestNote: string | null;
  assignedAt: string;
  respondedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  pickupConfirmedAt: string | null;
  inTransitAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  warehouse: {
    id: number;
    name: string;
    code: string;
    area: string | null;
    district: string | null;
    address: unknown;
    locationNote: string | null;
  };
  deliveryMan: {
    id: string;
    userId: string;
    fullName: string;
    phone: string;
    warehouseId: number;
    status: string;
    employeeCode: string | null;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
    };
  };
  order: {
    id: number;
    name: string;
    phone_number: string;
    alt_phone_number: string | null;
    area: string;
    district: string;
    country: string;
    address_details: string;
    grand_total: string | number;
    total: string | number;
    shipping_cost: string | number;
    status: string;
    paymentStatus: string;
    payment_method: string;
    order_date: string;
    orderItems: DeliveryAssignmentItem[];
  };
  shipment: {
    id: number;
    warehouseId: number | null;
    courier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    courierStatus: string | null;
    assignedAt: string | null;
    pickedAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
    dispatchNote: string | null;
    createdAt: string;
    updatedAt: string;
  };
  pickupProof: DeliveryPickupProof | null;
  logs: DeliveryAssignmentLogEntry[];
};

export type DeliveryAssignmentSummary = {
  assigned: number;
  accepted: number;
  rejected: number;
  pickedFromWarehouse: number;
  inTransit: number;
  delivered: number;
};

export type DeliveryAssignmentsApiResponse = {
  success: boolean;
  message?: string;
  data: {
    assignments: DeliveryAssignmentData[];
    summary: DeliveryAssignmentSummary;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
};

export type ShipmentDeliveryAssignmentSummary = {
  id: string;
  status: DeliveryAssignmentStatusValue;
  pickupProofStatus?: PickupProofStatusValue;
  isCurrent?: boolean;
  rejectionReason?: string | null;
  latestNote?: string | null;
  assignedAt: string;
  deliveryMan: {
    id: string;
    userId: string;
    fullName: string;
    phone: string;
    employeeCode: string | null;
  };
  pickupProof?: {
    id: string;
    status: PickupProofStatusValue;
    imageUrl: string | null;
    confirmedAt: string | null;
  } | null;
  logs: Array<{
    id: string;
    fromStatus: DeliveryAssignmentStatusValue | null;
    toStatus: DeliveryAssignmentStatusValue;
    note: string | null;
    createdAt: string;
    actor: {
      id: string;
      name: string | null;
    } | null;
  }>;
};
