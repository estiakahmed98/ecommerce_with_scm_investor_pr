"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Supplier = { id: number; name: string; code: string };

type PaymentRow = {
  id: number;
  paymentNumber: string;
  supplier: Supplier;
  amount: string | number;
  currency: string;
  method: string;
  reference: string | null;
  paymentDate: string;
  supplierInvoice?: { id: number; invoiceNumber: string } | null;
};

type PaymentReport = {
  range: { from: string | null; to: string | null };
  summary: Array<{
    supplier: Supplier;
    totalPaid: number;
    paymentCount: number;
  }>;
  rows: PaymentRow[];
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || errorMessage);
  }
  return (await res.json()) as T;
}

function fmtDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default function PaymentReportsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canRead =
    permissions.includes("payment_reports.read") ||
    permissions.includes("supplier_payments.read") ||
    permissions.includes("supplier_payments.manage");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") || "");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return fmtDate(date);
  });
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [report, setReport] = useState<PaymentReport | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSuppliers = async () => {
    const res = await fetch("/api/scm/suppliers", { cache: "no-store" });
    const data = await readJson<Supplier[]>(res, "Failed to load suppliers");
    setSuppliers(data);
  };

  const loadReport = async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (supplierId) qs.set("supplierId", supplierId);
      const res = await fetch(`/api/scm/payment-reports?${qs.toString()}`, { cache: "no-store" });
      const data = await readJson<PaymentReport>(res, "Failed to load payment report");
      setReport(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load payment report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  useEffect(() => {
    setSupplierId(searchParams.get("supplierId") || "");
  }, [searchParams]);

  useEffect(() => {
    void loadReport();
  }, [from, to, supplierId, canRead]);

  const totals = useMemo(() => {
    if (!report) return { totalPaid: 0, paymentCount: 0 };
    return report.summary.reduce(
      (acc, row) => {
        acc.totalPaid += row.totalPaid;
        acc.paymentCount += row.paymentCount;
        return acc;
      },
      { totalPaid: 0, paymentCount: 0 },
    );
  }, [report]);

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have permission to access payment reports.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vendor Payment Reports</h1>
          <p className="text-sm text-muted-foreground">
            Review vendor-wise payment activity, settlement totals, and invoice references.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadReport()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by supplier and payment date.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Suppliers Paid</div>
            <div className="text-xl font-semibold">{report?.summary.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Payments</div>
            <div className="text-xl font-semibold">{totals.paymentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Total Paid</div>
            <div className="text-xl font-semibold">{totals.totalPaid.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor Summary</CardTitle>
          <CardDescription>Aggregated totals by supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Total Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report?.summary.length ? (
                report.summary.map((row) => (
                  <TableRow key={row.supplier.id}>
                    <TableCell>
                      <Link
                        href={`/admin/scm/payment-reports?supplierId=${row.supplier.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.supplier.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.supplier.code}</div>
                    </TableCell>
                    <TableCell className="text-right">{row.paymentCount}</TableCell>
                    <TableCell className="text-right">{row.totalPaid.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No payment summary available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Register</CardTitle>
          <CardDescription>Detailed payment transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report?.rows.length ? (
                report.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/admin/scm/payment-requests?search=${encodeURIComponent(row.paymentNumber)}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.paymentNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.reference ?? "N/A"}</div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/scm/payment-requests?search=${encodeURIComponent(row.supplier.name)}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.supplier.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.supplier.code}</div>
                    </TableCell>
                    <TableCell>
                      {row.supplierInvoice?.invoiceNumber ? (
                        <Link
                          href={`/admin/scm/payment-requests?search=${encodeURIComponent(row.supplierInvoice.invoiceNumber)}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.supplierInvoice.invoiceNumber}
                        </Link>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell className="text-xs uppercase">{row.method.replaceAll("_", " ")}</TableCell>
                    <TableCell className="text-right">
                      {Number(row.amount).toFixed(2)} {row.currency}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.paymentDate).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No payment records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
