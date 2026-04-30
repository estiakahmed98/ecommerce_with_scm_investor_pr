import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { syncDeliveryManWarehouseAccess } from "@/lib/delivery-man-access";
import bcrypt from "bcryptjs";

type ReferencePayload = {
  name: string;
  phone: string;
  relation?: string;
  address?: string;
  occupation?: string;
  identityType?: "NID" | "PASSPORT";
  identityNumber: string;
};

type DocumentPayload = {
  type: string;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  referenceIndex?: number;
};

function sanitizeEmail(email?: string) {
  if (!email?.trim()) return null;
  return email.trim().toLowerCase();
}

function buildFallbackEmail(phone: string) {
  const safePhone = phone.replace(/[^0-9]/g, "") || Date.now().toString();
  return `deliveryman.${safePhone}.${Date.now()}@local.delivery`;
}

function toDeliveryManLogSnapshot(deliveryMan: {
  userId: string;
  fullName: string;
  email?: string | null;
  phone: string;
  warehouseId: number;
  warehouseName: string;
  employeeCode?: string | null;
  identityType: string;
  identityNumber: string;
  joiningDate: Date;
  status: string;
  applicationStatus: string;
  referenceCount: number;
  documentCount: number;
}) {
  return {
    userId: deliveryMan.userId,
    fullName: deliveryMan.fullName,
    email: deliveryMan.email ?? null,
    phone: deliveryMan.phone,
    warehouseId: deliveryMan.warehouseId,
    warehouseName: deliveryMan.warehouseName,
    employeeCode: deliveryMan.employeeCode ?? null,
    identityType: deliveryMan.identityType,
    identityNumber: deliveryMan.identityNumber,
    joiningDate: deliveryMan.joiningDate,
    status: deliveryMan.status,
    applicationStatus: deliveryMan.applicationStatus,
    referenceCount: deliveryMan.referenceCount,
    documentCount: deliveryMan.documentCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status');
    const warehouseId = searchParams.get('warehouseId');

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (warehouseId) {
      where.warehouseId = parseInt(warehouseId);
    }

    const [deliveryMen, total] = await Promise.all([
      prisma.deliveryManProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              createdAt: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              references: true,
              documents: true,
            },
          },
        },
        orderBy: [
          { createdAt: 'desc' },
          { fullName: 'asc' },
        ],
        skip,
        take: limit,
      }),
      prisma.deliveryManProfile.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        deliveryMen,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("DELIVERY_MEN_FETCH_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }
    if (!access.hasAny(["delivery-men.manage", "logistics.manage"])) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await req.json();

    const {
      warehouseId,
      employeeCode,

      fullName,
      phone,
      alternatePhone,
      email,
      password,
      dateOfBirth,
      gender,
      presentAddress,
      permanentAddress,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,

      identityType,
      identityNumber,
      passportExpiryDate,

      fatherName,
      fatherIdentityType,
      fatherIdentityNumber,

      motherName,
      motherIdentityType,
      motherIdentityNumber,

      bankName,
      bankAccountName,
      bankAccountNumber,
      bankChequeNumber,

      bondAmount,
      bondSignedAt,
      bondExpiryDate,

      contractSignedAt,
      contractStartDate,
      contractEndDate,
      contractStatus,

      joiningDate,
      status,
      applicationStatus,
      assignedById,
      note,

      references = [],
      documents = [],
    } = body;

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, message: "warehouseId is required" },
        { status: 400 }
      );
    }

    if (!fullName || !phone || !presentAddress || !permanentAddress || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "fullName, phone, presentAddress, permanentAddress, password are required",
        },
        { status: 400 }
      );
    }

    if (!identityType || !identityNumber) {
      return NextResponse.json(
        {
          success: false,
          message: "identityType and identityNumber are required",
        },
        { status: 400 }
      );
    }

    if (!fatherName || !motherName) {
      return NextResponse.json(
        {
          success: false,
          message: "fatherName and motherName are required",
        },
        { status: 400 }
      );
    }

    if (!joiningDate) {
      return NextResponse.json(
        { success: false, message: "joiningDate is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(references) || references.length < 2) {
      return NextResponse.json(
        { success: false, message: "At least 2 references are required" },
        { status: 400 }
      );
    }

    const finalEmail = sanitizeEmail(email) || buildFallbackEmail(phone);
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: Number(warehouseId) },
      select: { id: true, name: true, code: true },
    });
    if (!warehouse) {
      return NextResponse.json(
        { success: false, message: "Warehouse not found" },
        { status: 400 }
      );
    }

    const existingByPhone = await prisma.user.findFirst({
      where: { phone },
    });

    const existingByEmail = await prisma.user.findUnique({
      where: { email: finalEmail },
    });

    if (existingByPhone || existingByEmail) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A user already exists with this phone or email. Please use different data or link existing user manually.",
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Hash the password before creating user
      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = await tx.user.create({
        data: {
          name: fullName,
          email: finalEmail,
          phone,
          role: "delivery_man",
          passwordHash, // Use passwordHash instead of password
        },
      });

      await syncDeliveryManWarehouseAccess(tx, {
        userId: user.id,
        warehouseId: Number(warehouseId),
        assignedById: access.userId,
      });

      const profile = await tx.deliveryManProfile.create({
        data: {
          userId: user.id,
          warehouseId: Number(warehouseId),
          employeeCode: employeeCode || null,

          fullName,
          phone,
          alternatePhone: alternatePhone || null,
          email: email || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,

          presentAddress,
          permanentAddress,

          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          emergencyContactRelation: emergencyContactRelation || null,

          identityType,
          identityNumber,
          passportExpiryDate: passportExpiryDate
            ? new Date(passportExpiryDate)
            : null,

          fatherName,
          fatherIdentityType: fatherIdentityType || null,
          fatherIdentityNumber: fatherIdentityNumber || null,

          motherName,
          motherIdentityType: motherIdentityType || null,
          motherIdentityNumber: motherIdentityNumber || null,

          bankName: bankName || null,
          bankAccountName: bankAccountName || null,
          bankAccountNumber: bankAccountNumber || null,
          bankChequeNumber: bankChequeNumber || null,

          bondAmount: bondAmount ? Number(bondAmount) : null,
          bondSignedAt: bondSignedAt ? new Date(bondSignedAt) : null,
          bondExpiryDate: bondExpiryDate ? new Date(bondExpiryDate) : null,

          contractSignedAt: contractSignedAt ? new Date(contractSignedAt) : null,
          contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
          contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
          contractStatus: contractStatus || null,

          joiningDate: new Date(joiningDate),
          status: status || "PENDING",
          applicationStatus: applicationStatus || "DRAFT",
          assignedById: assignedById || null,
          note: note || null,
        },
      });

      const createdReferences = [];

      for (const ref of references as ReferencePayload[]) {
        const createdRef = await tx.deliveryManReference.create({
          data: {
            deliveryManProfileId: profile.id,
            name: ref.name,
            phone: ref.phone,
            relation: ref.relation || null,
            address: ref.address || null,
            occupation: ref.occupation || null,
            identityType: ref.identityType || "NID",
            identityNumber: ref.identityNumber,
          },
        });

        createdReferences.push(createdRef);
      }

      const refIdMap = createdReferences.map((item) => item.id);

      for (const doc of documents as DocumentPayload[]) {
        await tx.deliveryManDocument.create({
          data: {
            deliveryManProfileId: profile.id,
            referenceId:
              typeof doc.referenceIndex === "number"
                ? refIdMap[doc.referenceIndex] || null
                : null,
            type: doc.type as any,
            fileUrl: doc.fileUrl,
            fileName: doc.fileName || null,
            mimeType: doc.mimeType || null,
            fileSize: doc.fileSize || null,
          },
        });
      }

      return {
        user,
        profile,
        references: createdReferences,
      };
    });

    await logActivity({
      action: "create_delivery_man",
      entity: "delivery_man",
      entityId: result.profile.id,
      access,
      request: req,
      metadata: {
        message: `Delivery man enlistment created: ${result.profile.fullName} (${result.profile.phone})`,
      },
      after: toDeliveryManLogSnapshot({
        userId: result.user.id,
        fullName: result.profile.fullName,
        email: result.profile.email,
        phone: result.profile.phone,
        warehouseId: result.profile.warehouseId,
        warehouseName: warehouse.code
          ? `${warehouse.name} (${warehouse.code})`
          : warehouse.name,
        employeeCode: result.profile.employeeCode,
        identityType: result.profile.identityType,
        identityNumber: result.profile.identityNumber,
        joiningDate: result.profile.joiningDate,
        status: result.profile.status,
        applicationStatus: result.profile.applicationStatus,
        referenceCount: result.references.length,
        documentCount: Array.isArray(documents) ? documents.length : 0,
      }),
    });

    return NextResponse.json({
      success: true,
      message: "Delivery man user and profile created successfully",
      data: result,
    });
  } catch (error) {
    console.error("DELIVERY_MAN_ENLIST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
