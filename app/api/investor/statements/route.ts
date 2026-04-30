import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToString, resolveInvestorRequestContext } from "@/app/api/investor/shared";

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateStart(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = isDateOnly(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseDateEndExclusive(value: string | null, fallback: Date) {
  if (!value) return fallback;
  if (isDateOnly(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return fallback;
    parsed.setDate(parsed.getDate() + 1);
    return parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.statement.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    defaultFrom.setHours(0, 0, 0, 0);

    const from = parseDateStart(request.nextUrl.searchParams.get("from"), defaultFrom);
    const toDisplay = parseDateStart(request.nextUrl.searchParams.get("to"), now);
    const defaultToExclusive = new Date(now);
    const toExclusive = parseDateEndExclusive(
      request.nextUrl.searchParams.get("to"),
      defaultToExclusive,
    );
    const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();

    const transactions = await prisma.investorCapitalTransaction.findMany({
      where: {
        investorId: resolved.context.investorId,
        transactionDate: {
          gte: from,
          lt: toExclusive,
        },
      },
      orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        transactionNumber: true,
        transactionDate: true,
        type: true,
        direction: true,
        amount: true,
        currency: true,
      },
    });

    const payouts = await prisma.investorProfitPayout.findMany({
      where: {
        investorId: resolved.context.investorId,
        createdAt: {
          gte: from,
          lt: toExclusive,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        payoutNumber: true,
        status: true,
        payoutAmount: true,
        currency: true,
        createdAt: true,
        paidAt: true,
      },
    });

    const totals = transactions.reduce(
      (acc, item) => {
        if (item.direction === "CREDIT") {
          acc.credit = acc.credit.plus(item.amount);
        } else {
          acc.debit = acc.debit.plus(item.amount);
        }
        return acc;
      },
      {
        credit: new Prisma.Decimal(0),
        debit: new Prisma.Decimal(0),
      },
    );

    if (format === "csv") {
      const rows: string[][] = [[
        "Investor Code",
        "Investor Name",
        "From",
        "To",
        "Credit",
        "Debit",
        "Net",
        "Payout Count",
      ]];
      rows.push([
        resolved.context.investorCode,
        resolved.context.investorName,
        from.toISOString(),
        toDisplay.toISOString(),
        totals.credit.toString(),
        totals.debit.toString(),
        totals.credit.minus(totals.debit).toString(),
        String(payouts.length),
      ]);

      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=investor-statement-${from.toISOString().slice(0, 10)}-to-${toDisplay.toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    return NextResponse.json({
      investor: {
        id: resolved.context.investorId,
        code: resolved.context.investorCode,
        name: resolved.context.investorName,
      },
      from: from.toISOString(),
      to: toDisplay.toISOString(),
      totals: {
        credit: totals.credit.toString(),
        debit: totals.debit.toString(),
        net: totals.credit.minus(totals.debit).toString(),
      },
      transactions: transactions.map((item) => ({
        ...item,
        amount: decimalToString(item.amount),
        transactionDate: item.transactionDate.toISOString(),
      })),
      payouts: payouts.map((item) => ({
        ...item,
        payoutAmount: decimalToString(item.payoutAmount),
        createdAt: item.createdAt.toISOString(),
        paidAt: item.paidAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL STATEMENTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor statements." }, { status: 500 });
  }
}
