"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import BannerManager from "@/components/Settings/BannerManager";
import PaymentGatewayManager from "@/components/PaymentSystem";
import SiteSettingsForm from "@/components/Settings/SiteSettingsForm";

interface Banner {
  id: number;
  title: string;
  image: string;
  type: string;
  position: number;
  isActive: boolean;
}

export default function SettingsPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("site");

  const loadBanners = async () => {
    try {
      const res = await fetch("/api/banners", { cache: "no-store" });
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBanner = async (data: any) => {
    try {
      const res = await fetch("/api/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error();

      await loadBanners();
      toast.success("Banner created successfully");
    } catch {
      toast.error("Failed to create banner");
    }
  };

  const handleUpdateBanner = async (id: number, data: any) => {
    try {
      const res = await fetch(`/api/banners/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error();

      await loadBanners();
      toast.success("Banner updated successfully");
    } catch {
      toast.error("Failed to update banner");
    }
  };

  const handleDeleteBanner = async (id: number) => {
    try {
      const res = await fetch(`/api/banners/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      await loadBanners();
      toast.success("Banner deleted successfully");
    } catch {
      toast.error("Failed to delete banner");
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your application settings and configurations
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 bg-primary/10 rounded-md">
          <TabsTrigger
            value="site"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Site Settings
          </TabsTrigger>

          <TabsTrigger
            value="banners"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Banner Management
          </TabsTrigger>

          <TabsTrigger
            value="payments"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Payment Settings
          </TabsTrigger>
        </TabsList>

        {/* SITE SETTINGS */}
        <TabsContent value="site" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Title & Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <SiteSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BANNERS */}
        <TabsContent value="banners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Banner Management</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">
                    Loading banners...
                  </div>
                </div>
              ) : (
                <BannerManager
                  banners={banners}
                  onCreate={handleCreateBanner}
                  onUpdate={handleUpdateBanner}
                  onDelete={handleDeleteBanner}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENT */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateway Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentGatewayManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
