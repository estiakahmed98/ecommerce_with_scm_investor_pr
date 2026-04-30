"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Edit3,
  Trash2,
  BookOpen,
  Users,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface Publisher {
  id: number;
  name: string;
  image?: string;
  productCount?: number;
}

interface PublishersManagerProps {
  publishers: Publisher[];
  loading: boolean;
  onCreate: (data: { name: string; image?: string }) => Promise<void>;
  onUpdate: (
    id: number,
    data: { name: string; image?: string }
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function PublishersManager({
  publishers = [],
  loading = false,
  onCreate,
  onUpdate,
  onDelete,
}: PublishersManagerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Publisher | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [form, setForm] = useState({
    name: "",
    image: "",
  });

  const filtered = publishers.filter((pub) =>
    pub.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", image: "" });
    setModalOpen(true);
  };

  const openEdit = (pub: Publisher) => {
    setEditing(pub);
    setForm({
      name: pub.name,
      image: pub.image || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);

    try {
      if (editing) {
        await onUpdate(editing.id, {
          name: form.name,
          image: form.image,
        });
        toast.success("Publisher updated successfully");
      } else {
        await onCreate({
          name: form.name,
          image: form.image,
        });
        toast.success("New publisher added successfully");
      }
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLocal = (id: number) => {
    setDeletingId(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;

    try {
      await onDelete(deletingId); // wait for soft delete API
      toast.success("Publisher deleted successfully");
    } catch (error) {
      console.error("Error deleting publisher:", error);
      toast.error("Failed to delete publisher");
    } finally {
      setDeleteModalOpen(false);
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'hsl(var(--foreground))' }}>
          Publisher Management
        </h1>
        <p className="text-lg max-w-2xl mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
          View, add and manage publishers
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Card className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <CardContent className="p-6 flex justify-between">
            <div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Publishers</p>
              <h2 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{publishers.length}</h2>
            </div>
            <Users className="h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <CardContent className="p-6 flex justify-between">
            <div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Books</p>
              <h2 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                {publishers.reduce(
                  (a: number, p: any) => a + (p.productCount || 0),
                  0
                )}
              </h2>
            </div>
            <BookOpen className="h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <CardContent className="p-6 flex flex-row gap-4 items-center">
            <div className="relative w-full">
              <Search className="absolute left-3 top-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Input
                placeholder="Search publishers..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Button onClick={openAdd} className="px-5">
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Publishers Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, index) => (
            <Card key={index} className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
              <div className="h-48 rounded-t-2xl overflow-hidden flex items-center justify-center relative bg-muted animate-pulse" />
              <CardContent className="p-5">
                <div className="h-6 bg-muted animate-pulse rounded mb-2" />
                <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-4" />
                <div className="flex gap-3">
                  <div className="h-9 bg-muted animate-pulse rounded flex-1" />
                  <div className="h-9 bg-muted animate-pulse rounded w-9" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="col-span-full text-center py-12">
          <BookOpen className="h-16 w-16 mx-auto mb-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <h3 className="text-lg font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            No publishers found
          </h3>
          <p className="mt-1 mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Click the button below to add a new publisher
          </p>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add New Publisher
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((pub) => (
            <Card key={pub.id} className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
              <div className="h-48 rounded-t-2xl overflow-hidden flex items-center justify-center relative" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                {pub.image ? (
                  <Image
                    src={pub.image}
                    alt={`${pub.name}'s logo`}
                    fill
                    className="object-cover p-3"
                  />
                ) : (
                  <Users className="h-16 w-16" style={{ color: 'hsl(var(--muted-foreground))' }} />
                )}
              </div>

              <CardContent className="p-5">
                <h3 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{pub.name}</h3>
                <p className="mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Total Books: {pub.productCount || 0}
                </p>

                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={() => openEdit(pub)}
                    className="w-full"
                  >
                    <Edit3 className="h-3 w-3 mr-1" /> Edit
                  </Button>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLocal(pub.id);
                    }}
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                {editing ? "Update Publisher" : "New Publisher"}
              </h2>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <Label>Publisher Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <Label>Upload Image</Label>

                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const folder = "publishers"; // 🔹 folder name

                    const fd = new FormData();
                    fd.append("file", file);

                    try {
                      toast.loading("Uploading...", { id: "upload-publisher" });

                      const res = await fetch(`/api/upload/${folder}`, {
                        method: "POST",
                        body: fd,
                      });

                      if (!res.ok) {
                        throw new Error("Upload failed");
                      }

                      const data = await res.json();

                      // বিভিন্ন কী হ্যান্ডেল করি
                      const rawUrl: string | undefined =
                        data.fileUrl || data.url || data.path || data.location;

                      if (!rawUrl) {
                        throw new Error("Server did not return image URL");
                      }

                      let finalUrl = rawUrl;
                      try {
                        const base =
                          typeof window !== "undefined"
                            ? window.location.origin
                            : "http://localhost";
                        const url = new URL(rawUrl, base);
                        const parts = url.pathname.split("/").filter(Boolean);
                        const filename = parts[parts.length - 1];

                        // final public API path
                        finalUrl = `/api/upload/${folder}/${filename}`;
                      } catch {
                        // parse error হলে rawUrl ই ব্যবহার করব
                      }

                      setForm((prev) => ({ ...prev, image: finalUrl }));
                      toast.success("Upload complete!", {
                        id: "upload-publisher",
                      });
                    } catch (error) {
                      console.error("Publisher image upload error:", error);
                      toast.error("Upload failed!", { id: "upload-publisher" });
                    }
                  }}
                />

                {form.image && (
                  <div className="relative w-20 h-20 mt-3">
                    <Image
                      src={form.image}
                      alt="Publisher preview"
                      fill
                      className="rounded-lg border object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !form.name}
                className=""
              >
                <Zap className="h-4 w-4 mr-1" />
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl shadow-xl w-full max-w-md p-6" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="text-center">
              <Trash2 className="h-12 w-12 mx-auto mb-4" style={{ color: 'hsl(var(--destructive))' }} />
              <h3 className="text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>Delete</h3>
              <p className="mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Are you sure you want to delete this publisher? This action
                cannot be undone.
              </p>

              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="px-6"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
