import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getAccessContext } from '@/lib/rbac';

const prisma = new PrismaClient();

// Validation schema for password change
const passwordChangeSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters long').max(100, 'Password must be less than 100 characters'),
});

// PATCH change user password
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
        { error: 'Only global user managers can change passwords from this endpoint' },
        { status: 403 },
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = passwordChangeSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { password } = validation.data;
    const { id } = await params;

    // Check if user exists first
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password
    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: 'Password updated successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        updatedAt: user.updatedAt,
      }
    });
  } catch (error: any) {
    console.error('Error changing password:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Database constraint violation' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
