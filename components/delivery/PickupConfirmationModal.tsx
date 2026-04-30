"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload-file";

export function PickupConfirmationModal({
  assignmentId,
  open,
  onOpenChange,
  onSuccess,
}: {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => Promise<void> | void;
}) {
  const [productReceived, setProductReceived] = useState(false);
  const [packagingOk, setPackagingOk] = useState(false);
  const [productInGoodCondition, setProductInGoodCondition] = useState(false);
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedFile]);

  function resetForm() {
    setProductReceived(false);
    setPackagingOk(false);
    setProductInGoodCondition(false);
    setNote("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setError("");
  }

  async function handleSubmit() {
    if (!productReceived) {
      setError("Please confirm that the product was received.");
      return;
    }

    if (!selectedFile) {
      setError("Please capture or upload a proof image.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const imageUrl = await uploadFile(selectedFile);
      const response = await fetch(`/api/delivery-assignments/${assignmentId}/pickup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productReceived,
          packagingOk,
          productInGoodCondition,
          note: note.trim() || null,
          imageUrl,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to confirm pickup");
      }

      resetForm();
      onOpenChange(false);
      await onSuccess(
        payload.message || "Successfully product received from warehouse",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to confirm pickup",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle>Collect Product From Warehouse</DialogTitle>
          <DialogDescription>
            Confirm warehouse handover and upload a pickup proof image before moving forward.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-2xl border border-border bg-background p-4">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={productReceived}
                onChange={(event) => setProductReceived(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>Product received</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={packagingOk}
                onChange={(event) => setPackagingOk(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>Packaging OK</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={productInGoodCondition}
                onChange={(event) =>
                  setProductInGoodCondition(event.target.checked)
                }
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <span>Product in good condition</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Pickup note</label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              placeholder="Add any packaging, handover, or condition note"
              className="input-theme border-border bg-background"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Pickup proof image
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-4 py-8 text-center hover:bg-muted/50">
              <span className="text-sm font-medium text-foreground">
                {selectedFile ? selectedFile.name : "Capture or upload image"}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Mobile camera is supported
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
            </label>

            {previewUrl ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <img
                  src={previewUrl}
                  alt="Pickup proof preview"
                  className="h-64 w-full object-cover"
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Confirm Pickup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
