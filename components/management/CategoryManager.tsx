"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Plus,
  Edit3,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: number;
  name: string;
  parentId: number | null;
  image?: string | null;
  productCount?: number;
  childrenCount?: number;
}

export default function CategoryManager({
  categories,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: any) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createParent, setCreateParent] = useState<Category | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [form, setForm] = useState({
    name: "",
    parentId: null as number | null,
    image: null as string | null,
  });

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  /* =========================
     BUILD TREE
  ========================= */

  const buildTree = (items: Category[]) => {
    const map = new Map<number, any>();
    const roots: any[] = [];

    items.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    items.forEach((item) => {
      if (item.parentId) {
        map.get(item.parentId)?.children.push(map.get(item.id));
      } else {
        roots.push(map.get(item.id));
      }
    });

    return roots;
  };

  const filtered = useMemo(() => {
    return categories?.filter((c: any) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [categories, searchTerm]);

  const treeData = useMemo(() => buildTree(filtered || []), [filtered]);

  /* =========================
     TOGGLE
  ========================= */

  const toggle = (id: number) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  /* =========================
     RENDER TREE NODE
  ========================= */

  const renderNode = (node: any, level = 0) => {
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center justify-between py-2 px-3 rounded-md hover:bg-primary/10 transition",
            hasChildren && "cursor-pointer",
          )}
          style={{ paddingLeft: `${level * 24}px` }}
          onClick={() => hasChildren && toggle(node.id)}
        >
          <div className="flex items-center gap-3">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(node.id);
                }}
                className="p-0"
              >
                {expanded[node.id] ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ) : (
              <div className="w-4" />
            )}

            {node.image ? (
              <img
                src={node.image}
                alt={node.name}
                className="h-7 w-7 rounded border object-cover bg-muted"
              />
            ) : (
              <div className="h-7 w-7 rounded border bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                {(node.name?.[0] || "?").toUpperCase()}
              </div>
            )}

            <span className="font-medium">{node.name}</span>

            <span className="text-xs text-muted-foreground ml-2">
              ({node.productCount || 0} products)
            </span>
          </div>

          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openAddModal(node)}
            >
              <Plus size={14} />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => openEditModal(node)}
            >
              <Edit3 size={14} />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDeleteLocal(node.id)}
              className="text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {hasChildren && expanded[node.id] && (
          <div>
            {node.children.map((child: any) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  /* =========================
     CRUD
  ========================= */

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setCreateParent(null);
    setSubmitting(false);
    setImageFile(null);
    setImagePreviewUrl(null);
    setFileInputKey((k) => k + 1);
    setForm({ name: "", parentId: null, image: null });
  };

  const openAddModal = (parent: Category | null = null) => {
    setEditing(null);
    setCreateParent(parent);
    setSubmitting(false);
    setImageFile(null);
    setImagePreviewUrl(null);
    setFileInputKey((k) => k + 1);
    setForm({ name: "", parentId: parent?.id ?? null, image: null });
    setModalOpen(true);
  };

  const openEditModal = (cat: any) => {
    setEditing(cat);
    setCreateParent(null);
    setSubmitting(false);
    setImageFile(null);
    setImagePreviewUrl(cat.image ?? null);
    setFileInputKey((k) => k + 1);
    setForm({ name: cat.name, parentId: cat.parentId, image: cat.image ?? null });
    setModalOpen(true);
  };

  const uploadCategoryImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.fileUrl) {
      throw new Error(data?.error || "Image upload failed");
    }

    return data.fileUrl as string;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter category name");
      return;
    }

    try {
      setSubmitting(true);

      let imageUrl = form.image ?? null;
      if (imageFile) {
        imageUrl = await uploadCategoryImage(imageFile);
      }

      const payload = {
        name: form.name,
        parentId: form.parentId,
        image: imageUrl,
      };

      if (editing) {
        await onUpdate(editing.id, payload);
        toast.success("Category updated");
      } else {
        await onCreate(payload);
        toast.success("Category created");
      }

      closeModal();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLocal = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    await onDelete(id);
    toast.success("Deleted");
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Category Management</h1>

        <Button onClick={() => openAddModal(null)}>
          <Plus size={16} className="mr-2" />
          Add Root Category
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          className="absolute left-3 top-3 text-muted-foreground"
          size={16}
        />
        <Input
          className="pl-10"
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tree */}
      <div className="border rounded-lg p-4 bg-card">
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="flex items-center justify-between py-2 px-3 rounded-md">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-7 bg-muted animate-pulse rounded border" />
                  <div className="h-4 bg-muted animate-pulse rounded w-32" />
                  <div className="h-3 bg-muted animate-pulse rounded w-20" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                  <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                  <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : treeData.length === 0 ? (
          <p className="text-muted-foreground">No categories found</p>
        ) : (
          treeData.map((node) => renderNode(node))
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-card p-6 rounded-lg md:w-[40vw] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editing
                  ? "Edit Category"
                  : createParent
                    ? `Add Subcategory: ${createParent.name}`
                    : "New Root Category"}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={closeModal}
                aria-label="Close modal"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <Label>Image</Label>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-md border bg-muted overflow-hidden flex items-center justify-center">
                    {imagePreviewUrl ? (
                      <img
                        src={imagePreviewUrl}
                        alt="Category image preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        No image
                      </span>
                    )}
                  </div>

                  <Input
                    key={fileInputKey}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      if (imagePreviewUrl?.startsWith("blob:")) {
                        URL.revokeObjectURL(imagePreviewUrl);
                      }
                      setImageFile(file);
                      setImagePreviewUrl(URL.createObjectURL(file));
                    }}
                  />
                </div>

                {(imagePreviewUrl || form.image) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      if (imagePreviewUrl?.startsWith("blob:")) {
                        URL.revokeObjectURL(imagePreviewUrl);
                      }
                      setImageFile(null);
                      setImagePreviewUrl(null);
                      setFileInputKey((k) => k + 1);
                      setForm({ ...form, image: null });
                    }}
                  >
                    Remove image
                  </Button>
                )}
              </div>

              {!editing && (
                <div>
                  <Label>Type</Label>
                  <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {createParent
                      ? `Subcategory under "${createParent.name}"`
                      : "Root category"}
                  </div>
                </div>
              )}

              {editing && (
                <div>
                  <Label>Parent</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-background"
                    value={form.parentId ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        parentId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Root</option>
                    {categories
                      ?.filter((c: any) => c.id !== editing.id)
                      .map((cat: any) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : editing ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
