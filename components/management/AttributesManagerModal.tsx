"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AttributeValue {
  id: number;
  value: string;
}

interface Attribute {
  id: number;
  name: string;
  values: AttributeValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AttributesManagerModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [newAttributeName, setNewAttributeName] = useState("");
  const [valueDraft, setValueDraft] = useState<Record<number, string>>({});

  const sortedAttributes = useMemo(() => {
    return [...attributes].sort((a, b) => b.id - a.id);
  }, [attributes]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/attributes", { cache: "no-store" });
      const data = await res.json();
      setAttributes(data || []);
    } catch (err) {
      toast.error("Failed to load attributes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  const createAttribute = async () => {
    const name = newAttributeName.trim();
    if (!name) {
      toast.error("Attribute name is required");
      return;
    }

    try {
      const res = await fetch("/api/attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Create failed");

      toast.success("Attribute created");
      setNewAttributeName("");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Create failed");
    }
  };

  const addValue = async (attributeId: number) => {
    const value = (valueDraft[attributeId] || "").trim();
    if (!value) {
      toast.error("Value is required");
      return;
    }

    try {
      const res = await fetch(`/api/attributes/${attributeId}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Create failed");

      toast.success("Value added");
      setValueDraft((prev) => ({ ...prev, [attributeId]: "" }));
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Create failed");
    }
  };

  const deleteValue = async (valueId: number) => {
    if (!confirm("Delete this value?")) return;

    try {
      const res = await fetch(`/api/attribute-values/${valueId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      toast.success("Value deleted");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  const deleteAttribute = async (attributeId: number) => {
    if (!confirm("Delete this attribute?")) return;

    try {
      const res = await fetch(`/api/attributes/${attributeId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      toast.success("Attribute deleted");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Attributes
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              placeholder="New attribute name (e.g. Color)"
              value={newAttributeName}
              onChange={(e) => setNewAttributeName(e.target.value)}
              disabled={loading}
            />
            <Button onClick={createAttribute} disabled={loading}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : sortedAttributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attributes yet</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {sortedAttributes.map((attr) => (
                <div key={attr.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{attr.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {attr.values?.length || 0} values
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => deleteAttribute(attr.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Add value (e.g. Red)"
                      value={valueDraft[attr.id] || ""}
                      onChange={(e) =>
                        setValueDraft((prev) => ({
                          ...prev,
                          [attr.id]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() => addValue(attr.id)}
                    >
                      Add
                    </Button>
                  </div>

                  {attr.values?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {attr.values.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="text-xs px-2 py-1 rounded-full border hover:bg-muted"
                          title="Click to delete"
                          onClick={() => deleteValue(v.id)}
                        >
                          {v.value}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No values</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
