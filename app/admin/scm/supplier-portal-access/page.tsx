"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SupplierOption = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  supplierPortalAccess: {
    id: string;
    supplierId: number;
    status: string;
  } | null;
};

type AccessRecord = {
  id: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  twoFactorRequired: boolean;
  twoFactorMethod: string | null;
  twoFactorLastVerifiedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: SupplierOption;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  };
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type AccessPayload = {
  records: AccessRecord[];
  suppliers: SupplierOption[];
  users: UserOption[];
};

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierPortalAccessPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<AccessRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED" | "REVOKED">("ACTIVE");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState("EMAIL_OTP");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(
        `/api/admin/supplier-portal-access${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load supplier portal access.");
      }
      const data = payload as AccessPayload;
      setRecords(Array.isArray(data.records) ? data.records : []);
      setSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier portal access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [query]);

  const availableUsers = useMemo(
    () =>
      users.filter((user) => {
        if (!editingId) return true;
        if (user.id === selectedUserId) return true;
        return !user.supplierPortalAccess;
      }),
    [editingId, selectedUserId, users],
  );

  const resetForm = () => {
    setEditingId(null);
    setSelectedUserId("");
    setSelectedSupplierId("");
    setStatus("ACTIVE");
    setTwoFactorRequired(false);
    setTwoFactorMethod("EMAIL_OTP");
    setNote("");
  };

  const startEdit = (record: AccessRecord) => {
    setEditingId(record.id);
    setSelectedUserId(record.user.id);
    setSelectedSupplierId(String(record.supplier.id));
    setStatus(record.status);
    setTwoFactorRequired(Boolean(record.twoFactorRequired));
    setTwoFactorMethod(record.twoFactorMethod || "EMAIL_OTP");
    setNote(record.note ?? "");
  };

  const saveRecord = async () => {
    if (!selectedUserId || !selectedSupplierId) {
      toast.error("User and supplier are required.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/admin/supplier-portal-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          userId: selectedUserId,
          supplierId: Number(selectedSupplierId),
          status,
          twoFactorRequired,
          twoFactorMethod: twoFactorRequired ? twoFactorMethod : null,
          note,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save supplier portal access.");
      }
      toast.success(editingId ? "Access updated." : "Access created.");
      resetForm();
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save supplier portal access.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Portal Access</h1>
        <p className="text-sm text-muted-foreground">
          Assign supplier users to exactly one supplier scope for secure portal access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit Supplier Portal Access" : "Create Supplier Portal Access"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>User</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">Select user</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || "Unnamed"} ({user.email || "No email"})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Supplier</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedSupplierId}
                onChange={(event) => setSelectedSupplierId(event.target.value)}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "ACTIVE" | "SUSPENDED" | "REVOKED")
                }
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="REVOKED">REVOKED</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>2FA Policy</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={twoFactorRequired ? twoFactorMethod : "DISABLED"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "DISABLED") {
                    setTwoFactorRequired(false);
                    setTwoFactorMethod("EMAIL_OTP");
                    return;
                  }
                  setTwoFactorRequired(true);
                  setTwoFactorMethod(value);
                }}
              >
                <option value="DISABLED">Disabled (Preferred only)</option>
                <option value="EMAIL_OTP">Required: Email OTP</option>
                <option value="TOTP">Required: TOTP App</option>
                <option value="AUTH_APP">Required: Authenticator App</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea
              placeholder="Optional governance note..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveRecord()} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Access" : "Create Access"}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetForm} disabled={saving}>
                Cancel Edit
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access Registry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search supplier or user..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="max-w-md"
            />
            <Button variant="outline" onClick={() => void loadData()}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supplier portal assignments found.</p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {record.user.name || "Unnamed user"} ({record.user.email || "No email"})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Supplier: {record.supplier.name} ({record.supplier.code})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={record.status === "ACTIVE" ? "default" : "outline"}>
                        {record.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(record)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated: {fmtDate(record.updatedAt)} | Created by:{" "}
                    {record.createdBy?.email || "N/A"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    2FA: {record.twoFactorRequired ? `Required (${record.twoFactorMethod || "EMAIL_OTP"})` : "Not required"}
                    {record.twoFactorLastVerifiedAt
                      ? ` | Last verified: ${fmtDate(record.twoFactorLastVerifiedAt)}`
                      : ""}
                  </p>
                  {record.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">Note: {record.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
