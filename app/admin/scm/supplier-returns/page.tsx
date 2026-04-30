"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type GoodsReceipt = {
  id: number;
  receiptNumber: string;
  receivedAt: string;
  warehouseId: number;
  warehouse: Warehouse;
  purchaseOrderId: number;
  purchaseOrder: {
    id: number;
    poNumber: string;
    supplier: {
      id: number;
      name: string;
      code: string;
    };
  };
  items: Array<{
    id: number;
    purchaseOrderItemId: number;
    quantityReceived: number;
    unitCost: string;
    productVariant: {
      id: number;
      sku: string;
      product: {
        name: string;
      };
    };
  }>;
};

type SupplierInvoice = {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  purchaseOrderId: number | null;
  total: string;
  status: string;
};

type SupplierReturn = {
  id: number;
  returnNumber: string;
  status: string;
  requestedAt: string;
  requiredBy: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
  closedAt: string | null;
  ledgerPostedAt: string | null;
  reasonCode: string | null;
  note: string | null;
  supplierId: number;
  warehouseId: number;
  purchaseOrderId: number | null;
  supplierInvoiceId: number | null;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  warehouse: Warehouse;
  purchaseOrder: {
    id: number;
    poNumber: string;
    status: string;
  } | null;
  goodsReceipt: {
    id: number;
    receiptNumber: string;
    receivedAt: string;
  };
  supplierInvoice: {
    id: number;
    invoiceNumber: string;
    status: string;
    total: string;
  } | null;
  items: Array<{
    id: number;
    goodsReceiptItemId: number | null;
    purchaseOrderItemId: number | null;
    quantityRequested: number;
    quantityDispatched: number;
    unitCost: string;
    lineTotal: string;
    reason: string | null;
    productVariant: {
      id: number;
      sku: string;
      product: {
        name: string;
      };
    };
  }>;
};

type DraftItem = {
  goodsReceiptItemId: number;
  productName: string;
  sku: string;
  receivedQty: number;
  availableQty: number;
  unitCost: string;
  quantityRequested: string;
  reason: string;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallback);
  }
  return payload as T;
}

async function readJsonOrEmpty<T>(response: Response, fallback: string, emptyValue: T) {
  if (response.status === 403) {
    return emptyValue;
  }
  return readJson<T>(response, fallback);
}

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function formatMoney(value: string | number) {
  return Number(value || 0).toFixed(2);
}

export default function SupplierReturnsPage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.some((permission) =>
    ["supplier_returns.read", "supplier_returns.manage", "supplier_returns.approve"].includes(permission),
  );
  const canManage = permissions.includes("supplier_returns.manage");
  const canApprove = permissions.includes("supplier_returns.approve");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [returnData, receiptData, invoiceData] = await Promise.all([
        fetch("/api/scm/supplier-returns", { cache: "no-store" }).then((response) =>
          readJson<SupplierReturn[]>(response, "Failed to load supplier returns"),
        ),
        fetch("/api/scm/goods-receipts", { cache: "no-store" }).then((response) =>
          readJson<GoodsReceipt[]>(response, "Failed to load goods receipts"),
        ),
        fetch("/api/scm/supplier-invoices", { cache: "no-store" }).then((response) =>
          readJsonOrEmpty<SupplierInvoice[]>(
            response,
            "Failed to load supplier invoices",
            [],
          ),
        ),
      ]);

      setSupplierReturns(Array.isArray(returnData) ? returnData : []);
      setGoodsReceipts(Array.isArray(receiptData) ? receiptData : []);
      setSupplierInvoices(Array.isArray(invoiceData) ? invoiceData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier return data");
      setSupplierReturns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead]);

  const selectedReceipt = useMemo(
    () =>
      goodsReceipts.find((receipt) => receipt.id === Number(selectedReceiptId)) ?? null,
    [goodsReceipts, selectedReceiptId],
  );

  const selectedReceiptRequestedByItem = useMemo(() => {
    return supplierReturns
      .filter((supplierReturn) => supplierReturn.status !== "CANCELLED")
      .flatMap((supplierReturn) => supplierReturn.items)
      .reduce<Map<number, number>>((acc, item) => {
        if (!item.goodsReceiptItemId) return acc;
        acc.set(
          item.goodsReceiptItemId,
          (acc.get(item.goodsReceiptItemId) ?? 0) + item.quantityRequested,
        );
        return acc;
      }, new Map());
  }, [supplierReturns]);

  const availableInvoices = useMemo(() => {
    if (!selectedReceipt) return [];
    return supplierInvoices.filter(
      (invoice) =>
        invoice.supplierId === selectedReceipt.purchaseOrder.supplier.id &&
        (!invoice.purchaseOrderId ||
          invoice.purchaseOrderId === selectedReceipt.purchaseOrderId),
    );
  }, [selectedReceipt, supplierInvoices]);

  useEffect(() => {
    if (!selectedReceipt) {
      setItems([]);
      setSelectedInvoiceId("");
      return;
    }

    const nextItems = selectedReceipt.items.map((item) => {
      const alreadyRequested = selectedReceiptRequestedByItem.get(item.id) ?? 0;
      const availableQty = Math.max(0, item.quantityReceived - alreadyRequested);

      return {
        goodsReceiptItemId: item.id,
        productName: item.productVariant.product.name,
        sku: item.productVariant.sku,
        receivedQty: item.quantityReceived,
        availableQty,
        unitCost: item.unitCost,
        quantityRequested: availableQty > 0 ? String(availableQty) : "",
        reason: "",
      };
    });

    setItems(nextItems);
    setSelectedInvoiceId("");
  }, [selectedReceipt, selectedReceiptRequestedByItem]);

  const visibleReturns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return supplierReturns.filter((supplierReturn) => {
      if (statusFilter && supplierReturn.status !== statusFilter) return false;
      if (!query) return true;
      return (
        supplierReturn.returnNumber.toLowerCase().includes(query) ||
        supplierReturn.supplier.name.toLowerCase().includes(query) ||
        supplierReturn.warehouse.name.toLowerCase().includes(query) ||
        supplierReturn.goodsReceipt.receiptNumber.toLowerCase().includes(query)
      );
    });
  }, [search, statusFilter, supplierReturns]);

  const createSupplierReturn = async () => {
    if (!selectedReceipt) {
      toast.error("Goods receipt is required");
      return;
    }

    const payloadItems = items
      .map((item) => ({
        goodsReceiptItemId: item.goodsReceiptItemId,
        quantityRequested: Number(item.quantityRequested),
        reason: item.reason.trim(),
      }))
      .filter((item) => Number.isInteger(item.quantityRequested) && item.quantityRequested > 0);

    if (payloadItems.length === 0) {
      toast.error("At least one valid supplier return line is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/scm/supplier-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodsReceiptId: selectedReceipt.id,
          supplierInvoiceId: selectedInvoiceId ? Number(selectedInvoiceId) : null,
          requiredBy: requiredBy || null,
          reasonCode,
          note,
          items: payloadItems,
        }),
      });

      await readJson(response, "Failed to create supplier return");
      toast.success("Supplier return created");
      setSelectedReceiptId("");
      setSelectedInvoiceId("");
      setRequiredBy("");
      setReasonCode("");
      setNote("");
      setItems([]);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create supplier return");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (supplierReturnId: number, action: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/scm/supplier-returns/${supplierReturnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await readJson(response, `Failed to ${action} supplier return`);
      toast.success(`Supplier return ${action}ed`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} supplier return`);
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, key: keyof DraftItem, value: string) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const statusOptions = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "PARTIALLY_DISPATCHED",
    "DISPATCHED",
    "CLOSED",
    "CANCELLED",
  ];

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>
              You do not have permission to access supplier returns.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Returns</h1>
        <p className="text-sm text-muted-foreground">
          Raise vendor returns from received stock, deduct warehouse inventory on dispatch, and post credit adjustments on closure.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Supplier Return</CardTitle>
            <CardDescription>
              Start a supplier return against an existing goods receipt to keep stock and payable adjustments aligned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Goods Receipt</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedReceiptId}
                  onChange={(event) => setSelectedReceiptId(event.target.value)}
                >
                  <option value="">Select goods receipt</option>
                  {goodsReceipts.map((receipt) => (
                    <option key={receipt.id} value={receipt.id}>
                      {receipt.receiptNumber} - {receipt.purchaseOrder.supplier.name} - {receipt.warehouse.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Linked Supplier Invoice</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedInvoiceId}
                  onChange={(event) => setSelectedInvoiceId(event.target.value)}
                  disabled={availableInvoices.length === 0}
                >
                  <option value="">No linked invoice</option>
                  {availableInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} ({invoice.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Required By</Label>
                <Input
                  type="datetime-local"
                  value={requiredBy}
                  onChange={(event) => setRequiredBy(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason Code</Label>
                <Input
                  placeholder="DAMAGED / WRONG_ITEM / EXCESS"
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            {selectedReceipt ? (
              <div className="rounded-lg border">
                <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                  Supplier: {selectedReceipt.purchaseOrder.supplier.name} ({selectedReceipt.purchaseOrder.supplier.code}) | PO: {selectedReceipt.purchaseOrder.poNumber} | Warehouse: {selectedReceipt.warehouse.name}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Return Qty</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.goodsReceiptItemId}>
                        <TableCell>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        </TableCell>
                        <TableCell>{item.receivedQty}</TableCell>
                        <TableCell>{item.availableQty}</TableCell>
                        <TableCell>{formatMoney(item.unitCost)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={item.availableQty}
                            value={item.quantityRequested}
                            onChange={(event) =>
                              updateItem(index, "quantityRequested", event.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.reason}
                            onChange={(event) =>
                              updateItem(index, "reason", event.target.value)
                            }
                            placeholder="Damaged / wrong item"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <Button onClick={() => void createSupplierReturn()} disabled={saving}>
              {saving ? "Saving..." : "Create Supplier Return"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Supplier Return Queue</CardTitle>
          <CardDescription>
            Track the return through submission, approval, warehouse dispatch, and AP closure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
            <Input
              placeholder="Search return number, supplier, warehouse, or receipt..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}

          <div className="space-y-4">
            {visibleReturns.map((supplierReturn) => {
              const totalRequested = supplierReturn.items.reduce(
                (sum, item) => sum + item.quantityRequested,
                0,
              );
              const totalDispatched = supplierReturn.items.reduce(
                (sum, item) => sum + item.quantityDispatched,
                0,
              );
              const dispatchedValue = supplierReturn.items.reduce(
                (sum, item) =>
                  sum + Number(item.unitCost || 0) * item.quantityDispatched,
                0,
              );

              return (
                <Card key={supplierReturn.id}>
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{supplierReturn.returnNumber}</CardTitle>
                        <CardDescription>
                          {supplierReturn.supplier.name} | {supplierReturn.warehouse.name} | GRN {supplierReturn.goodsReceipt.receiptNumber}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/scm/supplier-returns/${supplierReturn.id}`}>Open Detail</Link>
                        </Button>
                        <div className="rounded-full border px-3 py-1 text-xs font-medium">
                          {supplierReturn.status}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                      <div>Requested: {formatDate(supplierReturn.requestedAt)}</div>
                      <div>Required By: {formatDate(supplierReturn.requiredBy)}</div>
                      <div>Dispatched Qty: {totalDispatched} / {totalRequested}</div>
                      <div>Credit Value: {formatMoney(dispatchedValue)}</div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">PO:</span>{" "}
                        {supplierReturn.purchaseOrder?.poNumber ?? "N/A"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Invoice:</span>{" "}
                        {supplierReturn.supplierInvoice?.invoiceNumber ?? "Not linked"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reason:</span>{" "}
                        {supplierReturn.reasonCode || "N/A"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Closed:</span>{" "}
                        {formatDate(supplierReturn.closedAt)}
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Dispatched</TableHead>
                          <TableHead>Unit Cost</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierReturn.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">
                                {item.productVariant.product.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.productVariant.sku}
                              </div>
                            </TableCell>
                            <TableCell>{item.quantityRequested}</TableCell>
                            <TableCell>{item.quantityDispatched}</TableCell>
                            <TableCell>{formatMoney(item.unitCost)}</TableCell>
                            <TableCell>{item.reason || "N/A"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="flex flex-wrap gap-2">
                      {canManage && supplierReturn.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          onClick={() => void runAction(supplierReturn.id, "submit")}
                          disabled={saving}
                        >
                          Submit
                        </Button>
                      ) : null}

                      {canApprove && supplierReturn.status === "SUBMITTED" ? (
                        <Button
                          size="sm"
                          onClick={() => void runAction(supplierReturn.id, "approve")}
                          disabled={saving}
                        >
                          Approve
                        </Button>
                      ) : null}

                      {canManage &&
                      ["APPROVED", "PARTIALLY_DISPATCHED"].includes(supplierReturn.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void runAction(supplierReturn.id, "dispatch")}
                          disabled={saving}
                        >
                          Dispatch
                        </Button>
                      ) : null}

                      {canApprove && supplierReturn.status === "DISPATCHED" ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void runAction(supplierReturn.id, "close")}
                            disabled={saving || dispatchedValue <= 0}
                          >
                            Close & Post Credit
                          </Button>
                          {dispatchedValue <= 0 ? (
                            <p className="self-center text-xs text-destructive">
                              Credit value is 0.00. Review PO/GR unit cost before closing.
                            </p>
                          ) : null}
                        </>
                      ) : null}

                      {(canManage || canApprove) &&
                      ["DRAFT", "SUBMITTED", "APPROVED"].includes(supplierReturn.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runAction(supplierReturn.id, "cancel")}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {!loading && visibleReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No supplier returns found.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
