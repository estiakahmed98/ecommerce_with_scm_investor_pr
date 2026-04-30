import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { getAccessContext } from '@/lib/rbac';

function toPaymentLogSnapshot(payment: {
  id: number;
  orderId?: number | null;
  amount?: unknown;
  paymentGatewayData: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: payment.id,
    orderId: payment.orderId ?? null,
    amount: payment.amount === null || payment.amount === undefined ? null : Number(payment.amount),
    paymentGatewayData: payment.paymentGatewayData,
    createdAt: payment.createdAt?.toISOString() ?? null,
    updatedAt: payment.updatedAt?.toISOString() ?? null,
  };
}

// GET all payments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny(['settings.payment.manage', 'settings.manage'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

// CREATE new payment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny(['settings.payment.manage', 'settings.manage'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { paymentGatewayData, orderId, amount } = body;

    const payment = await prisma.payment.create({
      data: {
        ...(orderId && { orderId }),
        ...(amount && { amount }),
        paymentGatewayData,
      },
    });

    const gatewayType =
      typeof paymentGatewayData?.type === 'string'
        ? paymentGatewayData.type
        : 'PAYMENT';

    await logActivity({
      action: 'create_payment_gateway',
      entity: 'payment',
      entityId: payment.id,
      access,
      request,
      metadata: {
        message: `Payment gateway created: ${gatewayType}`,
      },
      after: toPaymentLogSnapshot(payment),
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
