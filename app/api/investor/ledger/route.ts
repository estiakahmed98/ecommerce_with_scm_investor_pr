import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToString, resolveInvestorRequestContext } from "@/app/api/investor/shared";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.ledger.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "50");
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 50;
    const type = request.nextUrl.searchParams.get("type")?.trim().toUpperCase() || "";

    const rows = await prisma.investorCapitalTransaction.findMany({
      where: {
        investorId: resolved.context.investorId,
        ...(type ? { type: type as Prisma.EnumInvestorTransactionTypeFilter["equals"] } : {}),
      },
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        transactionNumber: true,
        transactionDate: true,
        type: true,
        direction: true,
        amount: true,
        currency: true,
        note: true,
        referenceType: true,
        referenceNumber: true,
        productVariant: {
          select: {
            id: true,
            sku: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const totals = rows.reduce(
      (acc, row) => {
        if (row.direction === "CREDIT") {
          acc.credit = acc.credit.plus(row.amount);
        } else {
          acc.debit = acc.debit.plus(row.amount);
        }
        return acc;
      },
      { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) },
    );

    return NextResponse.json({
      investor: {
        id: resolved.context.investorId,
        code: resolved.context.investorCode,
        name: resolved.context.investorName,
      },
      totals: {
        credit: totals.credit.toString(),
        debit: totals.debit.toString(),
        balance: totals.credit.minus(totals.debit).toString(),
      },
      transactions: rows.map((row) => ({
        ...row,
        amount: decimalToString(row.amount),
        transactionDate: row.transactionDate.toISOString(),
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL LEDGER GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor ledger." }, { status: 500 });
  }
}
