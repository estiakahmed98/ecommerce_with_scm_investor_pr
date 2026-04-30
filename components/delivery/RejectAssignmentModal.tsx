"use client";

import { useState } from "react";
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

export function RejectAssignmentModal({
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
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!reason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const response = await fetch(`/api/delivery-assignments/${assignmentId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rejectionReason: reason.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Failed to reject delivery");
      }

      setReason("");
      onOpenChange(false);
      await onSuccess(payload.message || "Delivery rejected successfully");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to reject delivery",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle>Reject Delivery</DialogTitle>
          <DialogDescription>
            Rejection reason is required and will be visible to admin and warehouse users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
            placeholder="Why are you rejecting this delivery?"
            className="input-theme border-border bg-background"
          />
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
            {submitting ? "Submitting..." : "Reject Delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
