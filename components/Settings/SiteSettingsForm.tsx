"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X } from "lucide-react";

type SiteSettings = {
  id?: number;
  logo?: string | null;
  siteTitle?: string | null;
  footerDescription?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  facebookLink?: string | null;
  instagramLink?: string | null;
  twitterLink?: string | null;
  tiktokLink?: string | null;
  youtubeLink?: string | null;
};

export default function SiteSettingsForm() {
  const [data, setData] = useState<SiteSettings>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/site")
      .then((res) => res.json())
      .then((res) => {
        setData(res);
      });
  }, []);

  const uploadFile = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/upload/${folder}`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.message || "Upload failed");
    }

    return data.url as string;
  };

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file, "site");
      setData({ ...data, logo: url });
    } catch (err: any) {
      toast.error(err?.message || "Logo upload failed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteTitle: data.siteTitle,
          logo: data.logo,
          footerDescription: data.footerDescription,
          contactNumber: data.contactNumber,
          contactEmail: data.contactEmail,
          address: data.address,
          facebookLink: data.facebookLink,
          instagramLink: data.instagramLink,
          twitterLink: data.twitterLink,
          tiktokLink: data.tiktokLink,
          youtubeLink: data.youtubeLink,
        }),
      });

      if (!res.ok) throw new Error("Failed to update site settings");

      const result = await res.json();
      setData(result);

      toast.success("Site settings updated successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update site settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full p-6 bg-card border rounded-xl space-y-6">
      <h2 className="text-xl font-semibold">Site Settings</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* ================= HEADER SECTION ================= */}
          <div className="space-y-6 border rounded-lg p-6">
            <h3 className="text-lg font-semibold">Header Section</h3>

            <div className="space-y-2">
              <Label>Site Title</Label>
              <Input
                value={data.siteTitle || ""}
                onChange={(e) =>
                  setData({ ...data, siteTitle: e.target.value })
                }
              />
            </div>

            {/* LOGO */}
            <div className="space-y-2">
              <Label>Logo</Label>

              {data.logo ? (
                <div className="relative w-32">
                  <Image
                    src={data.logo}
                    alt="Logo preview"
                    width={120}
                    height={120}
                    className="rounded border border-border object-contain"
                  />

                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => setData({ ...data, logo: "" })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Input
                  key={data.logo ? "has-logo" : "no-logo"}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
              )}
            </div>
          </div>

          {/* ================= FOOTER SECTION ================= */}
          <div className="space-y-6 border rounded-lg p-6">
            <h3 className="text-lg font-semibold">Footer Section</h3>

            {/* Footer Description */}
            <div className="space-y-2">
              <Label>Footer Description</Label>
              <textarea
                value={data.footerDescription || ""}
                onChange={(e) =>
                  setData({ ...data, footerDescription: e.target.value })
                }
                className="w-full border rounded-md px-3 py-2 bg-background min-h-[100px]"
                rows={4}
              />
            </div>

            {/* CONTACT */}
            <div className="space-y-4">
              <h4 className="font-medium">Contact Information</h4>

              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input
                  value={data.contactNumber || ""}
                  onChange={(e) =>
                    setData({ ...data, contactNumber: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={data.contactEmail || ""}
                  onChange={(e) =>
                    setData({ ...data, contactEmail: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <textarea
                  value={data.address || ""}
                  onChange={(e) =>
                    setData({ ...data, address: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2 bg-background min-h-[80px]"
                  rows={3}
                />
              </div>
            </div>

            {/* SOCIAL MEDIA */}
            <div className="space-y-4">
              <h4 className="font-medium">Social Media Links</h4>

              <div className="space-y-2">
                <Label>Facebook</Label>
                <Input
                  type="url"
                  value={data.facebookLink || ""}
                  onChange={(e) =>
                    setData({ ...data, facebookLink: e.target.value })
                  }
                  placeholder="https://facebook.com/yourpage"
                />
              </div>

              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  type="url"
                  value={data.instagramLink || ""}
                  onChange={(e) =>
                    setData({ ...data, instagramLink: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Twitter</Label>
                <Input
                  type="url"
                  value={data.twitterLink || ""}
                  onChange={(e) =>
                    setData({ ...data, twitterLink: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input
                  type="url"
                  value={data.tiktokLink || ""}
                  onChange={(e) =>
                    setData({ ...data, tiktokLink: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input
                  type="url"
                  value={data.youtubeLink || ""}
                  onChange={(e) =>
                    setData({ ...data, youtubeLink: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* BUTTON */}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving..." : "Update Settings"}
        </Button>
      </form>
    </div>
  );
}
