import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import {
  ensurePayrollAccess,
  toOptionalDate,
  toOptionalDecimal,
  toOptionalInt,
  toOptionalString,
  toRequiredDecimal,
} from "@/lib/payroll";

const db = prisma as any;

function toPayrollProfileLogSnapshot(profile: any) {
  return {
    id: profile.id,
    userId: profile.userId,
    userName: profile.user?.name ?? null,
    userEmail: profile.user?.email ?? null,
    warehouseId: profile.warehouseId ?? null,
    warehouseCode: profile.warehouse?.code ?? null,
    employeeCode: profile.employeeCode ?? null,
    paymentType: profile.paymentType,
    baseSalary: Number(profile.baseSalary),
    paymentMethod: profile.paymentMethod ?? null,
    isActive: profile.isActive,
    notes: profile.notes ?? null,
  };
}

function toPayrollPeriodLogSnapshot(period: any) {
  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate?.toISOString() ?? null,
    endDate: period.endDate?.toISOString() ?? null,
    status: period.status,
    notes: period.notes ?? null,
  };
}

function toPayrollEntryLogSnapshot(entry: any) {
  return {
    id: entry.id,
    payrollProfileId: entry.payrollProfileId,
    payrollPeriodId: entry.payrollPeriodId,
    userId: entry.userId,
    userName: entry.payrollProfile?.user?.name ?? null,
    userEmail: entry.payrollProfile?.user?.email ?? null,
    warehouseId: entry.warehouseId ?? null,
    warehouseCode: entry.warehouse?.code ?? null,
    basicAmount: Number(entry.basicAmount),
    overtimeAmount: Number(entry.overtimeAmount),
    bonusAmount: Number(entry.bonusAmount),
    deductionAmount: Number(entry.deductionAmount),
    netAmount: Number(entry.netAmount),
    paymentStatus: entry.paymentStatus,
    paidAt: entry.paidAt?.toISOString() ?? null,
    note: entry.note ?? null,
  };
}

function computeNetAmount(
  basicAmount: unknown,
  overtimeAmount: unknown,
  bonusAmount: unknown,
  deductionAmount: unknown,
  netAmount?: unknown,
) {
  if (netAmount !== undefined && netAmount !== null && netAmount !== "") {
    return toRequiredDecimal(netAmount, "netAmount");
  }

  const basic = Number(basicAmount || 0);
  const overtime = Number(overtimeAmount || 0);
  const bonus = Number(bonusAmount || 0);
  const deduction = Number(deductionAmount || 0);
  const calculated = basic + overtime + bonus - deduction;

  if (!Number.isFinite(calculated) || calculated < 0) {
    throw new Error("Calculated netAmount must be a non-negative number");
  }

  return toRequiredDecimal(calculated, "netAmount");
}

export async function GET() {
  try {
    const auth = await ensurePayrollAccess();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const [profiles, periods, entries, users, warehouses] = await Promise.all([
      db.payrollProfile.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          _count: {
            select: { entries: true },
          },
        },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      }),
      db.payrollPeriod.findMany({
        include: {
          _count: {
            select: { entries: true },
          },
        },
        orderBy: [{ startDate: "desc" }],
      }),
      db.payrollEntry.findMany({
        include: {
          payrollPeriod: true,
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          payrollProfile: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 100,
      }),
      db.user.findMany({
        select: { id: true, name: true, email: true, phone: true },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
      db.warehouse.findMany({
        select: { id: true, name: true, code: true },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    const summary = entries.reduce(
      (acc: any, entry: any) => {
        const net = Number(entry.netAmount || 0);
        if (entry.paymentStatus === "PAID") {
          acc.paidAmount += net;
          acc.paidCount += 1;
        } else {
          acc.pendingAmount += net;
          acc.pendingCount += 1;
        }
        return acc;
      },
      {
        activeProfiles: profiles.filter((item: any) => item.isActive).length,
        openPeriods: periods.filter((item: any) => item.status === "OPEN").length,
        paidCount: 0,
        pendingCount: 0,
        paidAmount: 0,
        pendingAmount: 0,
      },
    );

    return NextResponse.json({
      summary,
      profiles,
      periods,
      entries,
      users,
      warehouses,
    });
  } catch (error) {
    console.error("GET PAYROLL ERROR:", error);
    return NextResponse.json({ error: "Failed to load payroll data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await ensurePayrollAccess();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const entity = String(body?.entity || "").trim().toLowerCase();

    if (entity === "profile") {
      const userId = String(body.userId || "").trim();
      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

      const warehouseId = toOptionalInt(body.warehouseId, "warehouseId");
      const created = await db.payrollProfile.create({
        data: {
          userId,
          warehouseId,
          employeeCode: toOptionalString(body.employeeCode),
          paymentType: toOptionalString(body.paymentType) || "MONTHLY",
          baseSalary: toRequiredDecimal(body.baseSalary, "baseSalary"),
          bankName: toOptionalString(body.bankName),
          bankAccountNo: toOptionalString(body.bankAccountNo),
          accountHolder: toOptionalString(body.accountHolder),
          mobileBankingNo: toOptionalString(body.mobileBankingNo),
          paymentMethod: toOptionalString(body.paymentMethod),
          joiningDate: toOptionalDate(body.joiningDate, "joiningDate"),
          isActive: body.isActive === undefined ? true : Boolean(body.isActive),
          notes: toOptionalString(body.notes),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          warehouse: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await logActivity({
        action: "create_payroll_profile",
        entity: "payroll",
        entityId: created.id,
        access: auth.access,
        request,
        metadata: {
          message: `Payroll profile created for ${created.user?.name || created.user?.email || userId}`,
        },
        after: toPayrollProfileLogSnapshot(created),
      });

      return NextResponse.json(created, { status: 201 });
    }

    if (entity === "period") {
      const startDate = toOptionalDate(body.startDate, "startDate");
      const endDate = toOptionalDate(body.endDate, "endDate");
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "startDate and endDate are required" },
          { status: 400 },
        );
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "endDate must be greater than or equal to startDate" },
          { status: 400 },
        );
      }

      const created = await db.payrollPeriod.create({
        data: {
          name: String(body.name || "").trim() || `${startDate.toISOString().slice(0, 7)} Payroll`,
          startDate,
          endDate,
          status: toOptionalString(body.status) || "OPEN",
          notes: toOptionalString(body.notes),
        },
      });

      await logActivity({
        action: "create_payroll_period",
        entity: "payroll",
        entityId: created.id,
        access: auth.access,
        request,
        metadata: {
          message: `Payroll period created: ${created.name}`,
        },
        after: toPayrollPeriodLogSnapshot(created),
      });

      return NextResponse.json(created, { status: 201 });
    }

    if (entity === "entry") {
      const payrollProfileId = toOptionalInt(body.payrollProfileId, "payrollProfileId");
      const payrollPeriodId = toOptionalInt(body.payrollPeriodId, "payrollPeriodId");
      if (!payrollProfileId || !payrollPeriodId) {
        return NextResponse.json(
          { error: "payrollProfileId and payrollPeriodId are required" },
          { status: 400 },
        );
      }

      const profile = await db.payrollProfile.findUnique({
        where: { id: payrollProfileId },
        select: { id: true, userId: true, warehouseId: true, baseSalary: true },
      });
      if (!profile) {
        return NextResponse.json({ error: "Payroll profile not found" }, { status: 400 });
      }

      const userId = String(body.userId || profile.userId);
      const warehouseId = toOptionalInt(body.warehouseId, "warehouseId") ?? profile.warehouseId;
      const basicAmount = body.basicAmount ?? Number(profile.baseSalary);
      const overtimeAmount = body.overtimeAmount ?? 0;
      const bonusAmount = body.bonusAmount ?? 0;
      const deductionAmount = body.deductionAmount ?? 0;

      const existingEntry = await db.payrollEntry.findUnique({
        where: {
          payrollPeriodId_payrollProfileId: {
            payrollPeriodId,
            payrollProfileId,
          },
        },
        include: {
          payrollPeriod: true,
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          payrollProfile: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      const saved = await db.payrollEntry.upsert({
        where: {
          payrollPeriodId_payrollProfileId: {
            payrollPeriodId,
            payrollProfileId,
          },
        },
        update: {
          userId,
          warehouseId,
          basicAmount: toRequiredDecimal(basicAmount, "basicAmount"),
          overtimeAmount: toRequiredDecimal(overtimeAmount, "overtimeAmount"),
          bonusAmount: toRequiredDecimal(bonusAmount, "bonusAmount"),
          deductionAmount: toRequiredDecimal(deductionAmount, "deductionAmount"),
          netAmount: computeNetAmount(
            basicAmount,
            overtimeAmount,
            bonusAmount,
            deductionAmount,
            body.netAmount,
          ),
          paymentStatus: toOptionalString(body.paymentStatus) || "PENDING",
          paidAt: toOptionalDate(body.paidAt, "paidAt"),
          note: toOptionalString(body.note),
        },
        create: {
          payrollPeriodId,
          payrollProfileId,
          userId,
          warehouseId,
          basicAmount: toRequiredDecimal(basicAmount, "basicAmount"),
          overtimeAmount: toRequiredDecimal(overtimeAmount, "overtimeAmount"),
          bonusAmount: toRequiredDecimal(bonusAmount, "bonusAmount"),
          deductionAmount: toRequiredDecimal(deductionAmount, "deductionAmount"),
          netAmount: computeNetAmount(
            basicAmount,
            overtimeAmount,
            bonusAmount,
            deductionAmount,
            body.netAmount,
          ),
          paymentStatus: toOptionalString(body.paymentStatus) || "PENDING",
          paidAt: toOptionalDate(body.paidAt, "paidAt"),
          note: toOptionalString(body.note),
        },
        include: {
          payrollPeriod: true,
          warehouse: {
            select: { id: true, name: true, code: true },
          },
          payrollProfile: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      await logActivity({
        action: existingEntry ? "update_payroll_entry" : "create_payroll_entry",
        entity: "payroll",
        entityId: saved.id,
        access: auth.access,
        request,
        metadata: {
          message: existingEntry
            ? `Payroll entry updated for ${saved.payrollProfile?.user?.name || saved.payrollProfile?.user?.email || saved.userId}`
            : `Payroll entry created for ${saved.payrollProfile?.user?.name || saved.payrollProfile?.user?.email || saved.userId}`,
        },
        before: existingEntry ? toPayrollEntryLogSnapshot(existingEntry) : null,
        after: toPayrollEntryLogSnapshot(saved),
      });

      return NextResponse.json(saved, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported payroll entity" }, { status: 400 });
  } catch (error: any) {
    console.error("POST PAYROLL ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save payroll data" },
      { status: 500 },
    );
  }
}
