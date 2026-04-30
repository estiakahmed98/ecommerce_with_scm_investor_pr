import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { getAccessContext } from '@/lib/rbac';

function toUserLogSnapshot(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  note: string | null;
}, addresses: string[] = []) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    banned: user.banned,
    banReason: user.banReason,
    banExpires: user.banExpires,
    note: user.note,
    addresses,
  };
}

// Validation schema for user updates
const updateUserSchema = z.object({
  name: z.string().optional(),
  role: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/i, 'Role must be alphanumeric/underscore')
    .optional(),
  phone: z.string().optional(),
  addresses: z.any().optional(),
  banned: z.boolean().optional(),
  banReason: z.string().nullable().optional(),
  banExpires: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

// GET user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny(['users.read', 'users.manage'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const hasGlobalUserAccess = access.hasGlobal('users.read') || access.hasGlobal('users.manage');

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        addresses: true,
        banned: true,
        banReason: true,
        banExpires: true,
        note: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          select: {
            id: true,
            status: true,
            grand_total: true,
            order_date: true,
          },
          orderBy: {
            order_date: 'desc',
          },
          take: 5,
        },
        _count: {
          select: {
            orders: true,
            reviews: true,
            cart: true,
            wishlist: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!hasGlobalUserAccess) {
      const hasWarehouseAccess = await db.warehouseMembership.findFirst({
        where: {
          userId: id,
          warehouseId: { in: access.warehouseIds },
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!hasWarehouseAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH update user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.has('users.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!access.hasGlobal('users.manage')) {
      return NextResponse.json(
        { error: 'Only global user managers can update user profiles from this endpoint' },
        { status: 403 },
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = updateUserSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    let updateData = validation.data;
    if (typeof updateData.role === "string") {
      updateData = {
        ...updateData,
        role: updateData.role.toLowerCase(),
      };
    }
    const { id } = await params;
    const existingUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        banned: true,
        banReason: true,
        banExpires: true,
        note: true,
      },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const existingAddresses = await db.userAddress.findMany({
      where: { userId: id },
      orderBy: { id: 'asc' },
      select: { details: true },
    });

    // Handle addresses separately if provided
    if (updateData.addresses && Array.isArray(updateData.addresses)) {
      // Delete existing addresses
      await db.userAddress.deleteMany({
        where: { userId: id }
      });

      // Create new addresses from string array
      const newAddresses = updateData.addresses
        .filter((addr: string) => addr && addr.trim().length > 0)
        .map((addr: string, index: number) => ({
          userId: id,
          label: index === 0 ? "Home" : `Address ${index + 1}`,
          country: "Bangladesh", // Default country
          district: "Unknown", // Should be parsed from address or made required
          area: "Unknown", // Should be parsed from address or made required
          details: addr.trim(),
          isDefault: index === 0
        }));

      if (newAddresses.length > 0) {
        await db.userAddress.createMany({
          data: newAddresses
        });
      }

      // Remove addresses from updateData to avoid Prisma error
      const { addresses, ...otherUpdateData } = updateData;
      updateData = otherUpdateData;
    }
    const nextAddresses = Array.isArray(body.addresses)
      ? body.addresses
          .filter((addr: string) => addr && addr.trim().length > 0)
          .map((addr: string) => addr.trim())
      : existingAddresses.map((item: { details: string }) => item.details);

    const roleToAssign = typeof updateData.role === "string" ? updateData.role : null;

    const user = await db.user.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        addresses: true,
        banned: true,
        banReason: true,
        banExpires: true,
        note: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          select: {
            id: true,
            status: true,
            grand_total: true,
            order_date: true,
          },
          orderBy: {
            order_date: 'desc',
          },
          take: 5,
        },
        _count: {
          select: {
            orders: true,
            reviews: true,
            cart: true,
            wishlist: true,
          },
        },
      },
    });

    if (roleToAssign) {
      const mappedRole = await db.role.findFirst({
        where: {
          name: roleToAssign,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (mappedRole) {
        const existingAssignment = await db.userRole.findFirst({
          where: {
            userId: id,
            roleId: mappedRole.id,
            scopeType: "GLOBAL",
          },
          select: { id: true },
        });

        if (!existingAssignment) {
          await db.userRole.create({
            data: {
              userId: id,
              roleId: mappedRole.id,
              scopeType: "GLOBAL",
              assignedById: access.userId ?? null,
            },
          });
        }
      }
    }

    await logActivity({
      action: 'update_user',
      entity: 'user',
      entityId: user.id,
      access,
      request,
      metadata: {
        message: `User updated: ${user.email}`,
      },
      before: toUserLogSnapshot(
        existingUser,
        existingAddresses.map((item: { details: string }) => item.details),
      ),
      after: toUserLogSnapshot(user, nextAddresses),
    });

    return NextResponse.json(user);
  } catch (error: any) {
    console.error('Error updating user:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Unique constraint violation' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.has('users.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!access.hasGlobal('users.manage')) {
      return NextResponse.json(
        { error: 'Only global user managers can delete users' },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Check if user exists and has orders before deleting
    const userWithOrders = await db.user.findUnique({
      where: { id },
      include: {
        orders: {
          take: 1,
        },
        _count: {
          select: {
            orders: true,
            reviews: true,
            cart: true,
            wishlist: true,
          },
        },
      },
    });

    if (!userWithOrders) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userWithOrders.orders.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete user with existing orders',
          details: {
            orderCount: userWithOrders._count.orders,
            reviewCount: userWithOrders._count.reviews,
            cartCount: userWithOrders._count.cart,
            wishlistCount: userWithOrders._count.wishlist,
          }
        },
        { status: 400 }
      );
    }

    const userAddresses = await db.userAddress.findMany({
      where: { userId: id },
      orderBy: { id: 'asc' },
      select: { details: true },
    });

    await db.user.delete({
      where: { id },
    });

    await logActivity({
      action: 'delete_user',
      entity: 'user',
      entityId: userWithOrders.id,
      access,
      request,
      metadata: {
        message: `User deleted: ${userWithOrders.email}`,
      },
      before: toUserLogSnapshot(
        userWithOrders,
        userAddresses.map((item: { details: string }) => item.details),
      ),
    });

    return NextResponse.json({ 
      message: 'User deleted successfully',
      deletedUser: {
        id: userWithOrders.id,
        email: userWithOrders.email,
        name: userWithOrders.name,
      }
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete user due to foreign key constraints' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
