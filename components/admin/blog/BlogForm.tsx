"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { generateSlug } from "@/lib/utils";

interface Blog {
  id: number;
  title: string;
  summary: string;
  content: string;
  date: string | Date;
  author: string;
  image: string;
  ads?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const RichTextEditor = dynamic(() => import("./JoditEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] border border-border rounded-lg p-4 bg-card">
      Loading editor...
    </div>
  ),
});

interface BlogFormProps {
  blog?: Blog;
  onSuccess?: () => void;
}

export default function BlogForm({ blog, onSuccess }: BlogFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAdImage, setUploadingAdImage] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    summary: "",
    content: "",
    date: new Date().toISOString().split("T")[0],
    author: "",
    image: "",
    ads: "",
  });

  // Generate slug from title
  const slug = generateSlug(formData.title);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (blog) {
      const blogDate =
        typeof blog.date === "string" ? new Date(blog.date) : blog.date;

      setFormData({
        title: blog.title || "",
        summary: blog.summary || "",
        content: blog.content || "",
        date: blogDate.toISOString().split("T")[0],
        author: blog.author || "",
        image: blog.image || "",
        ads: blog.ads || "",
      });
    }
  }, [blog]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = blog ? `/api/blog/${blog.id}` : "/api/blog";
      const method = blog ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(
          blog ? "Blog updated successfully" : "Blog created successfully",
        );

        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/admin/management/blogs");
          router.refresh();
        }
      } else {
        const isJson = response.headers
          .get("content-type")
          ?.includes("application/json");
        if (isJson) {
          const error = await response.json();
          toast.error(error.error || "Something went wrong");
        } else {
          const text = await response.text();
          console.error("Non-JSON error response:", text);
          toast.error("Request failed. Please try again.");
        }
      }
    } catch (error) {
      console.error("Error saving blog:", error);
      toast.error("Error saving blog");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleContentChange = (content: string) => {
    setFormData((prev) => ({
      ...prev,
      content,
    }));
  };

  // Main image upload → POST /api/upload (no folder param)
  // /api/upload/${folder} → /api/upload/blogImages

  // Main image upload → /api/upload/${folder}
  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const folder = "blogImages"; // public/upload/blogImages এর জন্য

    try {
      setUploadingImage(true);

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`/api/upload/${folder}`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Image upload failed:", data || res.statusText);
        throw new Error("Image upload failed");
      }

      const data = await res.json();

      if (!data.url) {
        console.error("Invalid upload response:", data);
        throw new Error("Invalid upload response: url missing");
      }

      setFormData((prev) => ({
        ...prev,
        image: data.url,
      }));

      toast.success("Image uploaded successfully");
    } catch (err: any) {
      console.error("Error uploading image:", err);
      toast.error(err.message || "Error uploading image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAdImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const folder = "blogAds";

    try {
      setUploadingAdImage(true);

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`/api/upload/${folder}`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Ad image upload failed:", data || res.statusText);
        throw new Error("Ad image upload failed");
      }

      const data = await res.json();

      if (!data.url) {
        console.error("Invalid upload response:", data);
        throw new Error("Invalid upload response: url missing");
      }

      setFormData((prev) => ({
        ...prev,
        ads: data.url,
      }));

      toast.success("Ad image uploaded successfully");
    } catch (err: any) {
      console.error("Error uploading ad image:", err);
      toast.error(err.message || "Error uploading ad image");
    } finally {
      setUploadingAdImage(false);
    }
  };

  return (
    <div className="bg-card rounded-lg shadow border-border">
      <h2 className="text-lg font-semibold p-4 text-foreground">
        {blog ? "Edit Blog" : "Create New Blog"}
      </h2>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-foreground mb-2"
          >
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="Enter blog title"
          />

          {/* Slug Preview */}
          <div className="mt-2 p-3 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Slug:
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              URL: /ecommerce/blogs/{slug}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="author"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Author *
            </label>
            <input
              type="text"
              id="author"
              name="author"
              value={formData.author}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
              placeholder="Enter author name"
            />
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Publish Date *
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Summary (optional)
          </label>
          <textarea
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
            placeholder="Write summary or leave empty for auto summary"
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Content *
          </label>
          {isClient && (
            <RichTextEditor
              initialValue={formData.content}
              onContentChange={handleContentChange}
              height="400px"
            />
          )}
        </div>

        {/* Featured Image (upload + URL) */}
        <div className="space-y-2">
          <Label className="text-foreground">Featured Image *</Label>

          {/* Preview */}
          {formData.image && (
            <div className="mb-3 flex items-center gap-4">
              <img
                src={formData.image}
                alt="Blog featured"
                className="w-24 h-24 rounded-md object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                className="text-xs text-destructive hover:underline"
              >
                Remove image
              </button>
            </div>
          )}

          {/* File upload → /api/upload */}
          <label
            htmlFor="blog-image-upload"
            className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors cursor-pointer"
          >
            <div className="space-y-1 text-center">
              <div className="flex justify-center">
                <Upload className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="flex text-sm text-muted-foreground justify-center">
                <span className="relative font-medium text-primary hover:text-primary/80 focus-within:outline-none">
                  Upload an image
                </span>
                <span className="pl-1">or drag and drop</span>
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF up to 5MB
              </p>
            </div>
            <input
              id="blog-image-upload"
              name="blog-image-upload"
              type="file"
              className="sr-only"
              accept="image/*"
              onChange={handleImageFileChange}
            />
          </label>

          {uploadingImage && (
            <p className="text-xs text-muted-foreground mt-1">
              Uploading image...
            </p>
          )}

          {/* Optional: manual URL input */}
          <input
            type="text"
            name="image"
            value={formData.image}
            onChange={handleChange}
            placeholder="Or paste image URL (optional)"
            className="mt-2 w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-foreground">
            Advertisement Image (optional)
          </Label>

          {formData.ads && (
            <div className="mb-3 flex items-center gap-4">
              <img
                src={formData.ads}
                alt="Blog ad"
                className="w-24 h-24 rounded-md object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, ads: "" }))}
                className="text-xs text-destructive hover:underline"
              >
                Remove ad image
              </button>
            </div>
          )}

          <label
            htmlFor="blog-ad-image-upload"
            className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors cursor-pointer"
          >
            <div className="space-y-1 text-center">
              <div className="flex justify-center">
                <Upload className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="flex text-sm text-muted-foreground justify-center">
                <span className="relative font-medium text-primary hover:text-primary/80 focus-within:outline-none">
                  Upload an ad image
                </span>
                <span className="pl-1">or drag and drop</span>
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF up to 5MB
              </p>
            </div>
            <input
              id="blog-ad-image-upload"
              name="blog-ad-image-upload"
              type="file"
              className="sr-only"
              accept="image/*"
              onChange={handleAdImageFileChange}
            />
          </label>

          {uploadingAdImage && (
            <p className="text-xs text-muted-foreground mt-1">
              Uploading ad image...
            </p>
          )}

          <input
            type="text"
            name="ads"
            value={formData.ads}
            onChange={handleChange}
            placeholder="Or paste ad image URL (optional)"
            className="mt-2 w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : blog ? "Update Blog" : "Create Blog"}
          </button>
        </div>
      </form>
    </div>
  );
}
