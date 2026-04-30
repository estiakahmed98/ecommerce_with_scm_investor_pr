"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Payload = {
  transaction: {
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
    note: string | null;
    referenceType: string | null;
    referenceNumber: string | null;
    createdAt: string;
    runningBalance: string;
    investor: {
      id: number;
      code: string;
      name: string;
      status: string;
      kycStatus: string;
    };
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    } | null;
    createdBy: { id: string; name: string | null; email: string } | null;
    payout: {
      id: number;
      payoutNumber: string;
      status: string;
      paidAt: string | null;
      payoutAmount: string;
    } | null;
  };
  investorTotals: {
    credit: string;
    debit: string;
    balance: string;
  };
  relatedTransactions: Array<{
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function fmtMoney(value: string) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function InvestorTransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/investor-transactions/${params.id}`, {
          cache: "no-store",
        });
        const next = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(next?.error || "Failed to load investor transaction detail.");
        }
        setPayload(next as Payload);
      } catch (error: any) {
        toast.error(error?.message || "Failed to load investor transaction detail.");
      } finally {
        setLoading(false);
      }
    };
    if (params.id) void load();
  }, [params.id]);

  if (loading || !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading transaction detail...</div>;
  }

  const { transaction, investorTotals, relatedTransactions } = payload;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{transaction.transactionNumber}</h1>
        <p className="text-sm text-muted-foreground">
          Investor ledger drilldown with running balance, references, and downstream payout traceability.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Amount</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(transaction.amount)} {transaction.currency}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Direction</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{transaction.direction}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Running Balance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(transaction.runningBalance)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Investor Total Balance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(investorTotals.balance)}</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction Context</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor</div><Link className="mt-1 block font-medium hover:text-primary" href={`/admin/investors/${transaction.investor.id}`}>{transaction.investor.name} ({transaction.investor.code})</Link></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Type</div><div className="mt-1 font-medium">{transaction.type}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Transaction Date</div><div className="mt-1 font-medium">{fmtDate(transaction.transactionDate)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created At</div><div className="mt-1 font-medium">{fmtDate(transaction.createdAt)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Reference Type</div><div className="mt-1 font-medium">{transaction.referenceType || "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Reference Number</div><div className="mt-1 font-medium">{transaction.referenceNumber || "N/A"}</div></div>
            <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Note</div><div className="mt-1 whitespace-pre-wrap font-medium">{transaction.note || "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created By</div><div className="mt-1 font-medium">{transaction.createdBy?.name || transaction.createdBy?.email || "System"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Linked Variant</div><div className="mt-1 font-medium">{transaction.productVariant ? `${transaction.productVariant.product.name} (${transaction.productVariant.sku})` : "N/A"}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Downstream Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor Status</div><div className="mt-1 font-medium">{transaction.investor.status}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">KYC Status</div><div className="mt-1 font-medium">{transaction.investor.kycStatus}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Linked Payout</div>{transaction.payout ? <Link href={`/admin/investors/payouts`} className="mt-1 block font-medium hover:text-primary">{transaction.payout.payoutNumber} | {transaction.payout.status}</Link> : <div className="mt-1 font-medium">No payout linked</div>}</div>
            {transaction.payout ? <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Payout Amount</div><div className="mt-1 font-medium">{fmtMoney(transaction.payout.payoutAmount)}</div></div> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {relatedTransactions.length > 0 ? (
            relatedTransactions.map((item) => (
              <Link
                key={item.id}
                href={`/admin/investors/ledger/${item.id}`}
                className="block rounded-lg border p-3 text-sm hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="font-medium">{item.transactionNumber}</div>
                <div className="text-muted-foreground">
                  {item.type} | {item.direction} | {fmtMoney(item.amount)} {item.currency} | {fmtDate(item.transactionDate)}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No related transactions for this investor/variant context.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
