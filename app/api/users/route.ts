import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getAccessContext } from '@/lib/rbac';
import { logActivity } from '@/lib/activity-log';

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().nullable().optional(),
  role: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .default('user'),
  phone: z.string().nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  addresses: z.array(z.string()).min(1, 'At least one address is required'),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional().nullable(),
  role: z.string().trim().min(1).max(40).optional().nullable(),
});

// GET all users with pagination and search
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    
    // Validate query parameters
    const queryValidation = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search'),
      role: searchParams.get('role'),
    });

    if (!queryValidation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryValidation.error.issues },
        { status: 400 }
      );
    }

    const { page, limit, search, role } = queryValidation.data;
    const skip = (page - 1) * limit;
    const hasGlobalUserAccess = access.hasGlobal("users.read") || access.hasGlobal("users.manage");

    // Build where condition
    const where: any = {};
    if (!hasGlobalUserAccess) {
      if (access.warehouseIds.length === 0) {
        return NextResponse.json({
          users: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }
      where.warehouseMemberships = {
        some: {
          warehouseId: { in: access.warehouseIds },
          status: "ACTIVE",
        },
      };
    }
    if (search) {
      const searchConditions = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
      if (where.AND) {
        where.AND.push({ OR: searchConditions });
      } else if (where.warehouseMemberships) {
        where.AND = [{ OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }
    if (role) {
      where.role = { equals: role, mode: "insensitive" };
    }

    // Get users with order count
    const users = await db.user.findMany({
      where,
      skip,
      take: limit,
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
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            reviews: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get total count for pagination
    const total = await db.user.count({ where });
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create new user
export async function POST(request: NextRequest) {
  console.log('POST /api/users - Request received');
  
  try {
    const session = await getServerSession(authOptions);
    console.log('Session:', session?.user?.id, session?.user?.role);
    
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    console.log('Access context:', access.userId, access.permissions);
    
    if (!access.userId) {
      console.log('Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.has('users.manage')) {
      console.log('Forbidden - no users.manage permission');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!access.hasGlobal('users.manage')) {
      return NextResponse.json({ error: 'Only global user managers can create users' }, { status: 403 });
    }

    const body = await request.json();
    console.log('Request body:', body);
    
    // Validate request body
    const validation = createUserSchema.safeParse(body);
    console.log('Validation result:', validation.success, validation.error?.issues);
    
    if (!validation.success) {
      console.log('Validation error details:', validation.error.issues);
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, name, role, phone, password, addresses } = validation.data;
    console.log('Original role from frontend:', role);
    const normalizedRole = role.toLowerCase().trim();
    console.log('Normalized role:', normalizedRole);

    // Normalize addresses
    const normalizedAddresses = addresses
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (normalizedAddresses.length === 0) {
      console.log('No valid addresses');
      return NextResponse.json(
        { error: 'At least one valid address is required' },
        { status: 400 }
      );
    }

    // Hash the password before storing
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('Password hashed');

    const user = await db.user.create({
      data: {
        email,
        name,
        role: normalizedRole,
        phone,
        passwordHash,
      },
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
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            reviews: true,
          },
        },
      },
    });
    console.log('User created with role:', user.role);

    // Create user addresses
    if (normalizedAddresses.length > 0) {
      console.log('Creating addresses...');
      await db.userAddress.createMany({
        data: normalizedAddresses.map((address, index) => ({
          userId: user.id,
          label: `Address ${index + 1}`,
          country: "Bangladesh", // Default country
          district: "Not Specified", // Default district
          area: "Not Specified", // Default area
          details: address, // Store the full address in details
          isDefault: index === 0, // First address is default
        })),
      });
      console.log('Addresses created');
    }

    const mappedRole = await db.role.findFirst({
      where: {
        name: normalizedRole,
        deletedAt: null,
      },
      select: { id: true },
    });
    console.log('Mapped role:', mappedRole);

    if (mappedRole) {
      const existingAssignment = await db.userRole.findFirst({
        where: {
          userId: user.id,
          roleId: mappedRole.id,
          scopeType: "GLOBAL",
        },
        select: { id: true },
      });

      if (!existingAssignment) {
        await db.userRole.create({
          data: {
            userId: user.id,
            roleId: mappedRole.id,
            scopeType: "GLOBAL",
            assignedById: access.userId ?? null,
          },
        });
      }
      console.log('UserRole assigned');
    }

    console.log('User creation complete');

    await logActivity({
      action: 'create_user',
      entity: 'user',
      entityId: user.id,
      access,
      request,
      metadata: {
        message: `User created: ${user.email}`,
      },
      after: {
        email: user.email,
        name: user.name ?? null,
        role: user.role,
        phone: user.phone ?? null,
        addresses: normalizedAddresses,
      },
    });

    return NextResponse.json({
      message: 'User created successfully',
      user
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating user:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Foreign key constraint violation' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
