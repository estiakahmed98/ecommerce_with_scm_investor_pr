"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DigitalAsset {
  id: number;
  title: string;
  fileUrl: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DigitalAssetManagerModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<DigitalAsset[]>([]);
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const sorted = useMemo(() => [...assets].sort((a, b) => b.id - a.id), [assets]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/digital-assets", { cache: "no-store" });
      const data = await res.json();
      setAssets(data || []);
    } catch {
      toast.error("Failed to load digital assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload/digital-assets", {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.message || "Upload failed");
    }
    return data.url as string;
  };

  const handleFilePick = async (file: File) => {
    try {
      setUploading(true);
      const url = await uploadFile(file);
      setFileUrl(url);
      if (!title.trim()) {
        setTitle(file.name);
      }
      toast.success("Uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const createAsset = async () => {
    const t = title.trim();
    const u = fileUrl.trim();
    if (!t || !u) {
      toast.error("Title and file URL are required");
      return;
    }

    try {
      const res = await fetch("/api/digital-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, fileUrl: u }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Create failed");

      toast.success("Digital asset created");
      setTitle("");
      setFileUrl("");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Create failed");
    }
  };

  const deleteAsset = async (id: number) => {
    if (!confirm("Delete this digital asset?")) return;
    try {
      const res = await fetch(`/api/digital-assets/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      toast.success("Deleted");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Digital Assets
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-semibold">Add Digital Asset</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading || uploading}
                />
              </div>
              <div>
                <Label>File URL</Label>
                <Input
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  disabled={loading || uploading}
                  placeholder="/api/upload/digital-assets/..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFilePick(f);
                }}
                disabled={loading || uploading}
              />
              <Button onClick={createAsset} disabled={loading || uploading}>
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No digital assets yet</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {sorted.map((a) => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground break-all">
                        {a.fileUrl}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => deleteAsset(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
