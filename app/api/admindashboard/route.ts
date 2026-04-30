import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getAccessContext } from '@/lib/rbac';
import { getInventoryStatus } from '@/lib/stock-status';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.has('dashboard.read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'month';

    // Calculate date ranges
    const now = new Date();
    const startDate = new Date();
    
    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Previous period for growth calculation
    const prevStartDate = new Date(startDate);
    const prevEndDate = new Date(startDate);
    switch (range) {
      case 'today':
        prevStartDate.setDate(startDate.getDate() - 1);
        prevEndDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        prevStartDate.setDate(startDate.getDate() - 7);
        prevEndDate.setDate(startDate.getDate() - 1);
        break;
      case 'month':
        prevStartDate.setMonth(startDate.getMonth() - 1);
        prevEndDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        prevStartDate.setFullYear(startDate.getFullYear() - 1);
        prevEndDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    // Fetch data in parallel
    const [
      totalUsers,
      prevTotalUsers,
      totalOrders,
      prevTotalOrders,
      deliveredOrders,
      totalProducts,
      pendingOrders,
      lowStockProducts,
      recentOrders,
      topProducts,
      totalRevenue,
      prevTotalRevenue,
      refundCount,
      recentRefunds,
      failedOrders,
      returnedOrders,
    ] = await Promise.all([
      // Current period users
      prisma.user.count({
        where: {
          createdAt: { gte: startDate }
        }
      }),
      
      // Previous period users
      prisma.user.count({
        where: {
          createdAt: { gte: prevStartDate, lte: prevEndDate }
        }
      }),
      
      // Current period orders
      prisma.order.count({
        where: {
          order_date: { gte: startDate }
        }
      }),
      
      // Previous period orders
      prisma.order.count({
        where: {
          order_date: { gte: prevStartDate, lte: prevEndDate }
        }
      }),
      
      // Current period delivered orders
      prisma.order.count({
        where: {
          order_date: { gte: startDate },
          status: 'DELIVERED',
        },
      }),
      
      // Total products
      prisma.product.count(),
      
      // Pending orders
      prisma.order.count({
        where: {
          status: 'PENDING'
        }
      }),
      
      // Low stock products (based on variant stocks)
      prisma.product.findMany({
        where: { deleted: false },
        select: {
          id: true,
          type: true,
          variants: {
            select: { stock: true, lowStockThreshold: true },
          },
        },
      }),
      
      // Recent orders
      prisma.order.findMany({
        take: 5,
        orderBy: {
          order_date: 'desc'
        },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      }),
      
      // Top products
      prisma.product.findMany({
        take: 5,
        orderBy: {
          soldCount: 'desc'
        },
        select: {
          id: true,
          name: true,
          basePrice: true,
          currency: true,
          soldCount: true,
          ratingAvg: true
        }
      }),
      
      // Current period revenue
      prisma.order.aggregate({
        where: {
          order_date: { gte: startDate },
          paymentStatus: 'PAID',
          status: {
            notIn: ['CANCELLED', 'FAILED', 'RETURNED'],
          },
        },
        _sum: {
          grand_total: true
        }
      }),
      
      // Previous period revenue
      prisma.order.aggregate({
        where: {
          order_date: { gte: prevStartDate, lte: prevEndDate },
          paymentStatus: 'PAID',
          status: {
            notIn: ['CANCELLED', 'FAILED', 'RETURNED'],
          },
        },
        _sum: {
          grand_total: true
        }
      }),

      // Current period refund requests
      prisma.refund.count({
        where: {
          createdAt: { gte: startDate },
          status: {
            in: ['REQUESTED', 'APPROVED', 'COMPLETED'],
          },
        },
      }),

      // Recent refund requests for dashboard alerts
      prisma.refund.findMany({
        where: {
          createdAt: { gte: startDate },
          status: {
            in: ['REQUESTED', 'APPROVED', 'COMPLETED'],
          },
        },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          order: {
            select: {
              id: true,
              name: true,
              phone_number: true,
            },
          },
          orderItem: {
            select: {
              id: true,
              quantity: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),

      prisma.order.count({
        where: {
          order_date: { gte: startDate },
          status: 'FAILED',
        },
      }),

      prisma.order.count({
        where: {
          order_date: { gte: startDate },
          status: 'RETURNED',
        },
      }),
    ]);

    // Calculate growth percentages
    const userGrowth = prevTotalUsers > 0 
      ? ((totalUsers - prevTotalUsers) / prevTotalUsers) * 100 
      : totalUsers > 0 ? 100 : 0;

    const orderGrowth = prevTotalOrders > 0
      ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
      : totalOrders > 0 ? 100 : 0;

    const currentRevenue = Number(totalRevenue._sum.grand_total || 0);
    const previousRevenue = Number(prevTotalRevenue._sum.grand_total || 0);

    const revenueGrowth = previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : currentRevenue > 0 ? 100 : 0;

    const lowStockProductsCount = Array.isArray(lowStockProducts)
      ? lowStockProducts.filter((p: any) => {
          if (p?.type !== "PHYSICAL") return false;
          return (p?.variants || []).some((variant: any) => {
            const status = getInventoryStatus(variant?.stock, variant?.lowStockThreshold);
            return status === "LOW_STOCK" || status === "OUT_OF_STOCK";
          });
        }).length
      : 0;

    const stats = {
      totalUsers,
      totalOrders,
      totalProducts,
      totalRevenue: currentRevenue,
      pendingOrders,
      failedOrders,
      returnedOrders,
      lowStockProducts: lowStockProductsCount,
      refundRequests: refundCount,
      recentOrders: recentOrders.map((order: any) => ({
        id: order.id,
        grandTotal: Number(order.grand_total),
        status: order.status,
        user: order.user
      })),
      topProducts: topProducts.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: Number(product.basePrice),
        currency: product.currency,
        soldCount: product.soldCount,
        ratingAvg: product.ratingAvg
      })),
      userGrowth: Math.round(userGrowth * 100) / 100,
      revenueGrowth: Math.round(revenueGrowth * 100) / 100,
      orderGrowth: Math.round(orderGrowth * 100) / 100,
      successRate: totalOrders > 0
        ? Math.round(((deliveredOrders / totalOrders) * 100) * 100) / 100
        : 0,
      averageOrderValue: totalOrders > 0
        ? Math.round((currentRevenue / totalOrders) * 100) / 100
        : 0,
      conversionRate: totalUsers > 0
        ? Math.round(((totalOrders / totalUsers) * 100) * 100) / 100
        : 0,
      orders: {
        refundAlerts: recentRefunds.map((refund: any) => ({
          id: refund.id,
          title: refund.orderItem?.product?.name || `Order #${refund.orderId}`,
          subtitle: `Order #${refund.orderId} • Qty ${refund.quantity || refund.orderItem?.quantity || 1}`,
          status: refund.status,
          tone:
            refund.status === 'COMPLETED'
              ? ('good' as const)
              : refund.status === 'APPROVED'
                ? ('warn' as const)
                : ('danger' as const),
          value: `৳${Number(refund.amount || 0).toFixed(2)}`,
        })),
      },
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
