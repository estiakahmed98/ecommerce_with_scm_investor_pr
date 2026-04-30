import { NextRequest, NextResponse } from "next/server";
import { CourierETARequest, CourierETAResponse, CourierType } from "@/lib/types/courier";

// Mock ETA data - in production, this would integrate with actual courier APIs
const mockETAResponses: Record<string, Partial<CourierETAResponse>> = {
  PATHAO: {
    status: "in_transit",
    currentLocation: "Dhaka Hub",
    estimatedDelivery: "2024-03-10",
    lastUpdate: "2024-03-08 14:30:00",
  },
  REDX: {
    status: "out_for_delivery",
    currentLocation: "Local Distribution Center",
    estimatedDelivery: "2024-03-09",
    lastUpdate: "2024-03-08 16:45:00",
  },
  STEADFAST: {
    status: "delivered",
    currentLocation: "Customer Address",
    estimatedDelivery: "2024-03-08",
    lastUpdate: "2024-03-08 12:15:00",
  },
  CUSTOM: {
    status: "pending",
    currentLocation: "Warehouse",
    estimatedDelivery: "2024-03-11",
    lastUpdate: "2024-03-08 10:00:00",
  },
};

export async function POST(request: NextRequest) {
  try {
    const body: CourierETARequest = await request.json();
    const { trackingNumber, courierType } = body;

    // Validate input
    if (!trackingNumber || !courierType) {
      return NextResponse.json(
        { error: "Tracking number and courier type are required" },
        { status: 400 }
      );
    }

    // Validate courier type
    const validCourierTypes: CourierType[] = ["PATHAO", "REDX", "STEADFAST", "CUSTOM"];
    if (!validCourierTypes.includes(courierType)) {
      return NextResponse.json(
        { error: "Invalid courier type" },
        { status: 400 }
      );
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get mock data for the courier type
    const mockData = mockETAResponses[courierType];
    
    if (!mockData) {
      return NextResponse.json(
        { error: "Courier service not available" },
        { status: 404 }
      );
    }

    // Return mock ETA response
    const etaResponse: CourierETAResponse = {
      trackingNumber,
      status: mockData.status || "unknown",
      currentLocation: mockData.currentLocation || "Unknown",
      estimatedDelivery: mockData.estimatedDelivery || "Unknown",
      lastUpdate: mockData.lastUpdate || new Date().toISOString(),
    };

    return NextResponse.json(etaResponse);
  } catch (error) {
    console.error("ETA API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
