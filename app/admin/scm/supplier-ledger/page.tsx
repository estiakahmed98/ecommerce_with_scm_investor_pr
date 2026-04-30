"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type SupplierSummary = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  currency: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
};

type SupplierOption = {
  id: number;
  code: string;
  name: string;
  currency: string;
};

type PurchaseOrderOption = {
  id: number;
  poNumber: string;
  supplier: {
    id: number;
    name: string;
  };
  warehouse?: {
    id: number;
    name: string;
    code: string;
  };
  status: string;
  grandTotal: number | string;
  items: Array<{
    id: number;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number | string;
    productVariant: {
      id: number;
      sku: string;
      product: {
        id: number;
        name: string;
      };
    };
  }>;
};

type InvoiceDraftLine = {
  purchaseOrderItemId: string;
  productVariantId: string;
  sku: string;
  productName: string;
  quantityInvoiced: string;
  unitCost: string;
  description: string;
};

type SupplierLedgerDetail = {
  supplier: SupplierOption & { isActive: boolean };
  summary: {
    totalDebit: string;
    totalCredit: string;
    balance: string;
  };
  entries: Array<{
    id: number;
    entryDate: string;
    entryType: string;
    direction: "DEBIT" | "CREDIT";
    amount: number | string;
    currency: string;
    note: string | null;
    referenceNumber: string | null;
    supplierInvoice?: { invoiceNumber: string; status: string } | null;
    supplierPayment?: { paymentNumber: string; method: string } | null;
    purchaseOrder?: { poNumber: string } | null;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    matchStatus?: string;
    issueDate: string;
    dueDate: string | null;
    total: number | string;
    paymentHoldStatus?: "CLEAR" | "HELD" | "OVERRIDDEN";
    paymentHoldReason?: string | null;
    paymentHoldOverrideNote?: string | null;
    slaRecommendedCredit?: number | string;
    slaCreditStatus?: "NONE" | "RECOMMENDED" | "APPLIED" | "WAIVED";
    slaCreditReason?: string | null;
    purchaseOrder?: { poNumber: string } | null;
    threeWayMatch?: {
      status: string;
      summary: {
        varianceCount: number;
      };
    };
    payments: Array<{ id: number; paymentNumber: string; amount: number | string; paymentDate: string }>;
  }>;
  payments: Array<{
    id: number;
    paymentNumber: string;
    paymentDate: string;
    amount: number | string;
    method: string;
    reference: string | null;
    supplierInvoice?: { invoiceNumber: string; status: string } | null;
  }>;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return readJson<T>(response, "Request failed");
}

export default function SupplierLedgerPage() {
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];

  const canManageInvoices = globalPermissions.includes("supplier_invoices.manage");
  const canManagePayments = globalPermissions.includes("supplier_payments.manage");
  const canOverridePaymentHold = globalPermissions.includes("supplier_payments.override_hold");
  const canReadPurchaseOrders = globalPermissions.some((permission) =>
    [
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "goods_receipts.manage",
    ].includes(permission),
  );

  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [detail, setDetail] = useState<SupplierLedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState<number | null>(null);

  const [invoicePurchaseOrderId, setInvoicePurchaseOrderId] = useState("");
  const [invoiceIssueDate, setInvoiceIssueDate] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceSubtotal, setInvoiceSubtotal] = useState("");
  const [invoiceTaxTotal, setInvoiceTaxTotal] = useState("0");
  const [invoiceOtherCharges, setInvoiceOtherCharges] = useState("0");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceDraftLine[]>([]);

  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentHoldOverride, setPaymentHoldOverride] = useState(false);
  const [paymentHoldOverrideNote, setPaymentHoldOverrideNote] = useState("");

  const loadBaseData = async () => {
    try {
      setLoading(true);
      const summary = await getJson<SupplierSummary[]>("/api/scm/supplier-ledger");
      const normalizedSummary = Array.isArray(summary) ? summary : [];
      setSuppliers(normalizedSummary);

      let supplierData: SupplierOption[] = [];
      try {
        supplierData = await getJson<SupplierOption[]>("/api/scm/suppliers");
      } catch (error: any) {
        const message = String(error?.message || "").toLowerCase();
        if (!message.includes("forbidden")) {
          throw error;
        }
      }

      if (Array.isArray(supplierData) && supplierData.length > 0) {
        setSupplierOptions(supplierData);
      } else {
        // Fallback for roles that can read ledger but do not have supplier master read scope.
        setSupplierOptions(
          normalizedSummary.map((supplier) => ({
            id: supplier.id,
            code: supplier.code,
            name: supplier.name,
            currency: supplier.currency,
          })),
        );
      }

      if (canReadPurchaseOrders) {
        try {
          const purchaseOrderData =
            await getJson<PurchaseOrderOption[]>("/api/scm/purchase-orders");
          setPurchaseOrders(Array.isArray(purchaseOrderData) ? purchaseOrderData : []);
        } catch (error: any) {
          const message = String(error?.message || "").toLowerCase();
          if (!message.includes("forbidden")) {
            throw error;
          }
          setPurchaseOrders([]);
        }
      } else {
        setPurchaseOrders([]);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier ledger");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (supplierId: string) => {
    if (!supplierId) {
      setDetail(null);
      return;
    }
    try {
      const data = await getJson<SupplierLedgerDetail>(
        `/api/scm/supplier-ledger?supplierId=${supplierId}`,
      );
      setDetail(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier details");
      setDetail(null);
    }
  };

  useEffect(() => {
    void loadBaseData();
  }, [canReadPurchaseOrders]);

  useEffect(() => {
    if (!selectedSupplierId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedSupplierId);
  }, [selectedSupplierId]);

  const supplierPurchaseOrders = useMemo(() => {
    const supplierId = Number(selectedSupplierId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return [];
    return purchaseOrders.filter((purchaseOrder) => purchaseOrder.supplier.id === supplierId);
  }, [purchaseOrders, selectedSupplierId]);

  const selectedPurchaseOrder = useMemo(() => {
    const purchaseOrderId = Number(invoicePurchaseOrderId);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) return null;
    return supplierPurchaseOrders.find((purchaseOrder) => purchaseOrder.id === purchaseOrderId) || null;
  }, [invoicePurchaseOrderId, supplierPurchaseOrders]);

  useEffect(() => {
    if (!selectedPurchaseOrder) {
      setInvoiceItems([]);
      return;
    }

    const lines = selectedPurchaseOrder.items
      .filter((item) => item.quantityReceived > 0)
      .map((item) => ({
        purchaseOrderItemId: String(item.id),
        productVariantId: String(item.productVariant.id),
        sku: item.productVariant.sku,
        productName: item.productVariant.product.name,
        quantityInvoiced: String(item.quantityReceived),
        unitCost: String(Number(item.unitCost || 0)),
        description: `${item.productVariant.product.name} (${item.productVariant.sku})`,
      }));
    setInvoiceItems(lines);
  }, [selectedPurchaseOrder]);

  useEffect(() => {
    if (invoiceItems.length === 0) {
      if (!selectedPurchaseOrder) {
        setInvoiceSubtotal("");
      }
      return;
    }

    const subtotal = invoiceItems.reduce((sum, item) => {
      const quantity = Number(item.quantityInvoiced);
      const unitCost = Number(item.unitCost);
      if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return sum;
      return sum + quantity * unitCost;
    }, 0);
    setInvoiceSubtotal(subtotal.toFixed(2));
  }, [invoiceItems, selectedPurchaseOrder]);

  const createInvoice = async () => {
    if (!selectedSupplierId) {
      toast.error("Select a supplier");
      return;
    }
    try {
      setSavingInvoice(true);
      const response = await fetch("/api/scm/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(selectedSupplierId),
          purchaseOrderId: invoicePurchaseOrderId ? Number(invoicePurchaseOrderId) : null,
          issueDate: invoiceIssueDate || null,
          dueDate: invoiceDueDate || null,
          subtotal: invoiceSubtotal || 0,
          taxTotal: invoiceTaxTotal || 0,
          otherCharges: invoiceOtherCharges || 0,
          note: invoiceNote,
          items: invoiceItems
            .filter((item) => Number(item.quantityInvoiced) > 0)
            .map((item) => ({
              purchaseOrderItemId: item.purchaseOrderItemId ? Number(item.purchaseOrderItemId) : null,
              productVariantId: item.productVariantId ? Number(item.productVariantId) : null,
              quantityInvoiced: Number(item.quantityInvoiced),
              unitCost: Number(item.unitCost),
              description: item.description,
            })),
        }),
      });
      await readJson(response, "Failed to create supplier invoice");
      toast.success("Supplier invoice created");
      setInvoicePurchaseOrderId("");
      setInvoiceIssueDate("");
      setInvoiceDueDate("");
      setInvoiceSubtotal("");
      setInvoiceTaxTotal("0");
      setInvoiceOtherCharges("0");
      setInvoiceNote("");
      setInvoiceItems([]);
      await Promise.all([loadBaseData(), loadDetail(selectedSupplierId)]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create supplier invoice");
    } finally {
      setSavingInvoice(false);
    }
  };

  const createPayment = async () => {
    if (!selectedSupplierId) {
      toast.error("Select a supplier");
      return;
    }
    try {
      setSavingPayment(true);
      const response = await fetch("/api/scm/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(selectedSupplierId),
          supplierInvoiceId: paymentInvoiceId ? Number(paymentInvoiceId) : null,
          paymentDate: paymentDate || null,
          amount: paymentAmount,
          method: paymentMethod,
          reference: paymentReference,
          note: paymentNote,
          holdOverride: paymentHoldOverride,
          holdOverrideNote: paymentHoldOverrideNote,
        }),
      });
      await readJson(response, "Failed to create supplier payment");
      toast.success("Supplier payment created");
      setPaymentInvoiceId("");
      setPaymentDate("");
      setPaymentAmount("");
      setPaymentMethod("BANK_TRANSFER");
      setPaymentReference("");
      setPaymentNote("");
      setPaymentHoldOverride(false);
      setPaymentHoldOverrideNote("");
      await Promise.all([loadBaseData(), loadDetail(selectedSupplierId)]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create supplier payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const runInvoiceAction = async (
    invoiceId: number,
    action: "reevaluate" | "override_hold" | "clear_override" | "apply_credit" | "waive_credit",
    note?: string,
  ) => {
    if (!selectedSupplierId) return;
    try {
      setInvoiceActionId(invoiceId);
      const response = await fetch(`/api/scm/supplier-invoices/${invoiceId}/hold`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: note || null,
        }),
      });
      await readJson(response, "Failed to update invoice AP control");
      toast.success("Invoice AP control updated");
      await Promise.all([loadBaseData(), loadDetail(selectedSupplierId)]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update invoice AP control");
    } finally {
      setInvoiceActionId(null);
    }
  };

  const updateInvoiceItem = (
    index: number,
    key: keyof InvoiceDraftLine,
    value: string,
  ) => {
    setInvoiceItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Track supplier payable balances using invoice debits and payment credits.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadBaseData()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading supplier balances...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Total Debit</TableHead>
                    <TableHead>Total Credit</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div className="font-medium">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{supplier.code}</div>
                      </TableCell>
                      <TableCell>{supplier.totalDebit}</TableCell>
                      <TableCell>{supplier.totalCredit}</TableCell>
                      <TableCell>{supplier.balance}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSupplierId(String(supplier.id))}
                        >
                          Open Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Supplier</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 md:w-[420px]"
              value={selectedSupplierId}
              onChange={(event) => setSelectedSupplierId(event.target.value)}
            >
              <option value="">Select supplier</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </select>
          </div>

          {detail ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Debit</p>
                    <p className="text-2xl font-semibold">{detail.summary.totalDebit}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Credit</p>
                    <p className="text-2xl font-semibold">{detail.summary.totalCredit}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    <p className="text-2xl font-semibold">{detail.summary.balance}</p>
                  </CardContent>
                </Card>
              </div>

              {(canManageInvoices || canManagePayments) ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  {canManageInvoices ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Create Supplier Invoice</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Purchase Order</Label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2"
                            value={invoicePurchaseOrderId}
                            onChange={(event) => setInvoicePurchaseOrderId(event.target.value)}
                          >
                            <option value="">Optional purchase order</option>
                            {supplierPurchaseOrders.map((purchaseOrder) => (
                              <option key={purchaseOrder.id} value={purchaseOrder.id}>
                                {purchaseOrder.poNumber} • {purchaseOrder.status}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedPurchaseOrder ? (
                          <div className="space-y-3 rounded-lg border p-3">
                            <div className="text-sm font-medium">
                              Matchable invoice lines from {selectedPurchaseOrder.poNumber}
                            </div>
                            {invoiceItems.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No received PO lines available yet. Post goods receipt before invoicing.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {invoiceItems.map((item, index) => (
                                  <div
                                    key={`${item.purchaseOrderItemId}-${index}`}
                                    className="grid gap-3 rounded-md border p-3 md:grid-cols-[2fr_1fr_1fr]"
                                  >
                                    <div>
                                      <Label>Item</Label>
                                      <div className="text-sm font-medium">{item.productName}</div>
                                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                                    </div>
                                    <div>
                                      <Label>Qty Invoiced</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={item.quantityInvoiced}
                                        onChange={(event) =>
                                          updateInvoiceItem(index, "quantityInvoiced", event.target.value)
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label>Unit Cost</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.unitCost}
                                        onChange={(event) =>
                                          updateInvoiceItem(index, "unitCost", event.target.value)
                                        }
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>Issue Date</Label>
                            <Input
                              type="date"
                              value={invoiceIssueDate}
                              onChange={(event) => setInvoiceIssueDate(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Due Date</Label>
                            <Input
                              type="date"
                              value={invoiceDueDate}
                              onChange={(event) => setInvoiceDueDate(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Subtotal</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={invoiceSubtotal}
                              onChange={(event) => setInvoiceSubtotal(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Tax Total</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={invoiceTaxTotal}
                              onChange={(event) => setInvoiceTaxTotal(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Other Charges</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={invoiceOtherCharges}
                              onChange={(event) => setInvoiceOtherCharges(event.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Note</Label>
                          <Textarea
                            rows={4}
                            value={invoiceNote}
                            onChange={(event) => setInvoiceNote(event.target.value)}
                          />
                        </div>
                        <Button onClick={() => void createInvoice()} disabled={savingInvoice}>
                          {savingInvoice ? "Posting..." : "Post Invoice"}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  {canManagePayments ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Create Supplier Payment</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Invoice</Label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2"
                            value={paymentInvoiceId}
                            onChange={(event) => setPaymentInvoiceId(event.target.value)}
                          >
                            <option value="">Optional invoice allocation</option>
                            {detail.invoices
                              .filter((invoice) => invoice.status !== "PAID")
                              .map((invoice) => (
                                <option key={invoice.id} value={invoice.id}>
                                  {invoice.invoiceNumber} • {invoice.status} • {invoice.total}
                                  {invoice.paymentHoldStatus && invoice.paymentHoldStatus !== "CLEAR"
                                    ? ` • HOLD:${invoice.paymentHoldStatus}`
                                    : ""}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>Payment Date</Label>
                            <Input
                              type="date"
                              value={paymentDate}
                              onChange={(event) => setPaymentDate(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Amount</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={paymentAmount}
                              onChange={(event) => setPaymentAmount(event.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Method</Label>
                            <select
                              className="w-full rounded-md border bg-background px-3 py-2"
                              value={paymentMethod}
                              onChange={(event) => setPaymentMethod(event.target.value)}
                            >
                              <option value="BANK_TRANSFER">Bank Transfer</option>
                              <option value="CASH">Cash</option>
                              <option value="MOBILE_BANKING">Mobile Banking</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="ADJUSTMENT">Adjustment</option>
                            </select>
                          </div>
                          <div>
                            <Label>Reference</Label>
                            <Input
                              value={paymentReference}
                              onChange={(event) => setPaymentReference(event.target.value)}
                            />
                          </div>
                        </div>
                        {canOverridePaymentHold ? (
                          <div className="space-y-2 rounded-md border p-3">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={paymentHoldOverride}
                                onChange={(event) =>
                                  setPaymentHoldOverride(event.target.checked)
                                }
                              />
                              Override invoice payment hold (if selected invoice is HELD)
                            </label>
                            {paymentHoldOverride ? (
                              <div>
                                <Label>Override Note</Label>
                                <Textarea
                                  rows={2}
                                  value={paymentHoldOverrideNote}
                                  onChange={(event) =>
                                    setPaymentHoldOverrideNote(event.target.value)
                                  }
                                  placeholder="Write why this hold is being overridden..."
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div>
                          <Label>Note</Label>
                          <Textarea
                            rows={4}
                            value={paymentNote}
                            onChange={(event) => setPaymentNote(event.target.value)}
                          />
                        </div>
                        <Button onClick={() => void createPayment()} disabled={savingPayment}>
                          {savingPayment ? "Posting..." : "Post Payment"}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Ledger Entries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Debit</TableHead>
                            <TableHead>Credit</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.entries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{new Date(entry.entryDate).toLocaleDateString()}</TableCell>
                              <TableCell>{entry.referenceNumber || "-"}</TableCell>
                              <TableCell>{entry.entryType}</TableCell>
                              <TableCell>
                                {entry.direction === "DEBIT" ? Number(entry.amount).toFixed(2) : "-"}
                              </TableCell>
                              <TableCell>
                                {entry.direction === "CREDIT" ? Number(entry.amount).toFixed(2) : "-"}
                              </TableCell>
                              <TableCell className="max-w-[320px] truncate">{entry.note || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Open Invoices</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {detail.invoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No supplier invoices yet.</p>
                    ) : (
                      detail.invoices.map((invoice) => (
                        <div key={invoice.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{invoice.invoiceNumber}</div>
                            <div className="flex gap-1">
                              <Badge
                                variant={
                                  invoice.paymentHoldStatus === "HELD"
                                    ? "destructive"
                                    : invoice.paymentHoldStatus === "OVERRIDDEN"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                Hold: {invoice.paymentHoldStatus || "CLEAR"}
                              </Badge>
                              <Badge
                                variant={
                                  invoice.slaCreditStatus === "RECOMMENDED"
                                    ? "secondary"
                                    : invoice.slaCreditStatus === "APPLIED"
                                      ? "default"
                                      : "outline"
                                }
                              >
                                Credit: {invoice.slaCreditStatus || "NONE"}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {invoice.status} • {Number(invoice.total).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Match: {invoice.threeWayMatch?.status || invoice.matchStatus || "PENDING"}
                            {typeof invoice.threeWayMatch?.summary?.varianceCount === "number"
                              ? ` • Variances: ${invoice.threeWayMatch.summary.varianceCount}`
                              : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {invoice.purchaseOrder?.poNumber || "Direct supplier invoice"}
                          </div>
                          {invoice.paymentHoldReason ? (
                            <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                              {invoice.paymentHoldReason}
                            </div>
                          ) : null}
                          {invoice.paymentHoldOverrideNote ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Override note: {invoice.paymentHoldOverrideNote}
                            </div>
                          ) : null}
                          {invoice.slaCreditStatus === "RECOMMENDED" ? (
                            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                              Suggested credit: {Number(invoice.slaRecommendedCredit || 0).toFixed(2)}
                              {invoice.slaCreditReason ? ` • ${invoice.slaCreditReason}` : ""}
                            </div>
                          ) : null}
                          {(canManageInvoices || canOverridePaymentHold) ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canManageInvoices ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={invoiceActionId === invoice.id}
                                  onClick={() => void runInvoiceAction(invoice.id, "reevaluate")}
                                >
                                  Re-evaluate
                                </Button>
                              ) : null}
                              {canOverridePaymentHold && invoice.paymentHoldStatus === "HELD" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={invoiceActionId === invoice.id}
                                  onClick={() =>
                                    void runInvoiceAction(
                                      invoice.id,
                                      "override_hold",
                                      "AP emergency release approved by authorized user.",
                                    )
                                  }
                                >
                                  Override Hold
                                </Button>
                              ) : null}
                              {canOverridePaymentHold && invoice.paymentHoldStatus === "OVERRIDDEN" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={invoiceActionId === invoice.id}
                                  onClick={() =>
                                    void runInvoiceAction(invoice.id, "clear_override")
                                  }
                                >
                                  Clear Override
                                </Button>
                              ) : null}
                              {canManageInvoices && invoice.slaCreditStatus === "RECOMMENDED" ? (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={invoiceActionId === invoice.id}
                                    onClick={() =>
                                      void runInvoiceAction(invoice.id, "apply_credit")
                                    }
                                  >
                                    Apply SLA Credit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={invoiceActionId === invoice.id}
                                    onClick={() =>
                                      void runInvoiceAction(
                                        invoice.id,
                                        "waive_credit",
                                        "Waived by AP manager after governance review.",
                                      )
                                    }
                                  >
                                    Waive Credit
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Supplier Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payment No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.payments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              No supplier payments found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detail.payments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{payment.paymentNumber}</TableCell>
                              <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                              <TableCell>{payment.method}</TableCell>
                              <TableCell>{payment.supplierInvoice?.invoiceNumber || "-"}</TableCell>
                              <TableCell>{Number(payment.amount).toFixed(2)}</TableCell>
                              <TableCell>{payment.reference || "-"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a supplier to view ledger details and post AP transactions.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
