import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET available payment gateways (public endpoint for checkout)
export async function GET(request: NextRequest) {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        // Only return active payment gateways
        // Add any active field if exists in your schema
      },
      select: {
        id: true,
        paymentGatewayData: true,
        // Only return necessary fields for checkout
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform data to only include gateway information
    const gateways = payments.map(payment => ({
      id: payment.id,
      paymentGatewayData: payment.paymentGatewayData
    }));

    // If no payment gateways are configured, return empty array
    // The frontend will always show Cash On Delivery as default
    return NextResponse.json({ gateways });
  } catch (error) {
    console.error('Error fetching payment gateways:', error);
    // Even on error, return empty array so checkout doesn't break
    return NextResponse.json({ gateways: [] });
  }
}
