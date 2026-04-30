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

interface Writer {
  id: number;
  name: string;
  image?: string;
  _count?: {
    products: number;
  };
}

interface WritersManagerProps {
  writers: Writer[];
  loading: boolean;
  onCreate: (writer: { name: string; image?: string }) => Promise<void>;
  onUpdate: (id: number, writer: { name: string; image?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function WritersManager({
  writers = [],
  loading = false,
  onCreate,
  onUpdate,
  onDelete,
}: WritersManagerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Writer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [form, setForm] = useState({
    name: "",
    image: "",
  });

  const filteredWriters = writers.filter((writer) =>
    writer.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddModal = () => {
    setEditing(null);
    setForm({ name: "", image: "" });
    setModalOpen(true);
  };

  const openEditModal = (writer: Writer) => {
    setEditing(writer);
    setForm({
      name: writer.name,
      image: writer.image || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter writer name");
      return;
    }

    setSubmitting(true);

    try {
      if (editing) {
        await onUpdate(editing.id, {
          name: form.name,
          image: form.image,
        });
        toast.success("Writer updated successfully");
      } else {
        await onCreate({
          name: form.name,
          image: form.image,
        });
        toast.success("New writer added successfully");
      }

      setModalOpen(false);
      setForm({ name: "", image: "" });
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLocal = async (id: number) => {
    if (!confirm("Are you sure you want to delete this writer?")) return;

    try {
      await onDelete(id); // this now calls DELETE API and then re-fetches writers
      toast.success("Writer deleted successfully");
    } catch (err) {
      toast.error("Failed to delete writer");
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div>
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: 'hsl(var(--foreground))' }}>
            Writer Management
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage your library's talented authors and writers
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Writers</p>
                <h3 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{writers?.length || 0}</h3>
              </div>
              <div className="p-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                <Users className="h-6 w-6" style={{ color: 'hsl(var(--primary-foreground))' }} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <CardContent className="p-6 flex justify-between items-center">
              <div>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Books</p>
                <h3 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {writers?.reduce(
                    (acc: number, w: any) => acc + (w._count?.products || 0),
                    0
                  ) || 0}
                </h3>
              </div>
              <div className="p-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                <BookOpen className="h-6 w-6" style={{ color: 'hsl(var(--primary-foreground))' }} />
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2 rounded-2xl shadow" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <Input
                  placeholder="Search writers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-full"
                />
              </div>
              <Button
                onClick={openAddModal}
                className="px-6"
              >
                <Plus className="h-4 w-4 mr-1" /> New Writer
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Loading - Skeleton Loader */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, index) => (
              <Card
                key={index}
                className="rounded-2xl shadow"
                style={{ backgroundColor: 'hsl(var(--card))' }}
              >
                <div className="relative h-48">
                  <div className="h-full w-full bg-muted animate-pulse rounded-t-2xl" />
                </div>
                <CardContent className="p-5">
                  <div className="h-6 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-4 bg-muted animate-pulse rounded-full w-3/4" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-9 bg-muted animate-pulse rounded flex-1" />
                    <div className="h-9 bg-muted animate-pulse rounded w-9" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredWriters.map((writer) => (
              <Card
                key={writer.id}
                className="group rounded-2xl shadow hover:shadow-2xl transition"
                style={{ backgroundColor: 'hsl(var(--card))' }}
              >
                <div className="relative h-48">
                  {writer.image ? (
                    <Image
                      src={writer.image}
                      alt={`${writer.name}'s profile`}
                      fill
                      className="object-cover rounded-t-2xl group-hover:scale-110 transition"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                      <Users className="h-16 w-16" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </div>
                  )}

                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex gap-2 transition">
                    <Button
                      size="sm"
                      onClick={() => openEditModal(writer)}
                      className="rounded-full shadow"
                      style={{ backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDeleteLocal(writer.id)}
                      className="rounded-full shadow"
                      style={{ backgroundColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-5">
                  <h3 className="font-bold text-xl mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                    {writer.name}
                  </h3>

                  <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <BookOpen className="h-3 w-3" style={{ color: 'hsl(var(--muted-foreground))' }} /> Total Books:
                    <span style={{ color: 'hsl(var(--foreground))' }}>{writer._count?.products || 0}</span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={() => openEditModal(writer)}
                      variant="outline"
                      className="w-full"
                    >
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteLocal(writer.id)}
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredWriters?.length === 0 && (
          <Card className="rounded-2xl shadow p-12 text-center" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <h3 className="text-2xl font-bold mb-4" style={{ color: 'hsl(var(--foreground))' }}>No writers found</h3>
            <p className="mt-2 mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No writers match your search.
            </p>
            <Button
              onClick={openAddModal}
              className="px-6"
            >
              <Plus className="h-4 w-4 mr-1" /> Add New Writer
            </Button>
          </Card>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                {editing ? "Edit Writer" : "Add New Writer"}
              </h3>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <Label>Writer Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <Label>Upload Image *</Label>

                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const folder = "writers"; // 🔹 এখানে folder নাম

                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                      toast.loading("Uploading...", {
                        id: "upload-writer",
                      });

                      const res = await fetch(`/api/upload/${folder}`, {
                        method: "POST",
                        body: formData,
                      });

                      if (!res.ok) {
                        throw new Error("Upload failed");
                      }

                      const data = await res.json();

                      // বিভিন্ন রেসপন্স কী হ্যান্ডেল:
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

                        finalUrl = `/api/upload/${folder}/${filename}`;
                      } catch {
                        // URL parse error হলে rawUrl ই রাখব
                      }

                      setForm((prev) => ({ ...prev, image: finalUrl }));
                      toast.success("Upload complete!", {
                        id: "upload-writer",
                      });
                    } catch (error) {
                      console.error('Error in form submission:', error);
                      console.error("Writer image upload error:", error);
                      toast.error("Upload failed!", { id: "upload-writer" });
                    }
                  }}
                />

                {form.image && (
                  <div className="relative mt-3 w-24 h-24">
                    <Image
                      src={form.image}
                      alt="Uploaded preview"
                      fill
                      className="object-cover rounded-lg border"
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
                disabled={!form.name || submitting}
                className=""
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                )}
                <Zap className="h-4 w-4 mr-1" />
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
