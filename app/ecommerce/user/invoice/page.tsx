"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import AccountHeader from "../AccountHeader";
import AccountMenu from "../AccountMenu";
import { Home, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ApiOrder = any;

type OrderRow = {
  id: string;
  createdAt: string;
  total: number;
  status: string;
  paymentStatus: string;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export default function InvoicePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const res = await fetch("/api/orders?limit=50", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          toast.error("Please login to view invoices.", { duration: 3500 });
          setRows([]);
          return;
        }

        if (!res.ok) {
          toast.error(data?.error || "Failed to load orders.", {
            duration: 3500,
          });
          setRows([]);
          return;
        }

        const mapped: OrderRow[] = Array.isArray(data?.orders)
          ? (data.orders as ApiOrder[]).map((o) => ({
              id: String(o.id),
              createdAt: o.createdAt ?? o.order_date ?? "",
              total: Number(o.grand_total ?? o.total ?? 0),
              status: String(o.status ?? "PENDING"),
              paymentStatus: String(o.paymentStatus ?? "UNPAID"),
            }))
          : [];

        setRows(mapped);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load invoices.", { duration: 3500 });
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const empty = useMemo(
    () => !loading && rows.length === 0,
    [loading, rows.length]
  );

  // ✅ Direct download (no new tab)
  const downloadInvoice = async (orderId: string) => {
    const toastId = `inv-${orderId}`;

    try {
      setDownloadingId(orderId);
      toast.loading("Generating invoice…", { id: toastId });

      const res = await fetch(`/api/invoice/${orderId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed to generate invoice.");
      }

      const blob = await res.blob();

      // If server returns JSON mistakenly, prevent downloading a broken file
      if (blob.type && !blob.type.includes("pdf")) {
        throw new Error("Invoice response is not a PDF. Please try again.");
      }

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      toast.success("Invoice downloaded successfully.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Invoice download failed.", { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Breadcrumb */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Link>
          <span>›</span>
          <Link
            href="/ecommerce/user"
            className="hover:text-foreground transition-colors"
          >
            Account
          </Link>
          <span>›</span>
          <span className="text-foreground">Invoices</span>
        </div>
      </div>

      {/* Shared header + menu */}
      <AccountHeader />
      <AccountMenu />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-medium">Invoices</h2>
        </div>

        {loading ? (
          <Card className="p-6 bg-card text-card-foreground border border-border rounded-2xl">
            <p className="text-sm text-muted-foreground">Loading invoices...</p>
          </Card>
        ) : empty ? (
          <Card className="p-8 bg-card text-card-foreground border border-border rounded-2xl text-center">
            <h3 className="text-lg font-semibold mb-1">No invoices found</h3>
            <p className="text-sm text-muted-foreground">
              You don’t have any orders yet.
            </p>
          </Card>
        ) : (
          <Card className="p-0 bg-card text-card-foreground border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="font-semibold">Order Invoices</p>
              <p className="text-xs text-muted-foreground">
                Download PDF invoice for any order
              </p>
            </div>

            <div className="divide-y divide-border">
              {rows.map((o) => {
                const isDownloading = downloadingId === o.id;

                return (
                  <div
                    key={o.id}
                    className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="text-sm">
                      <p className="font-medium">
                        Order ID: <span className="font-mono">{o.id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Date: {formatDateTime(o.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Status: {o.status} • Payment: {o.paymentStatus}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold">
                          TK. {Number(o.total || 0).toFixed(2)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadInvoice(o.id)}
                        disabled={isDownloading}
                        className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 inline-flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Downloading…
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            Download PDF
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}