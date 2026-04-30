"use client";

import { useEffect, useState } from "react";
import BannerManager from "@/components/Settings/BannerManager";

export default function BannersPage() {
  const [banners, setBanners] = useState([]);

  const load = async () => {
    const res = await fetch("/api/banners");
    const data = await res.json();
    setBanners(data);
  };

  useEffect(() => {
    load();
  }, []);

  const createBanner = async (data: any) => {
    await fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  };

  const updateBanner = async (id: number, data: any) => {
    await fetch(`/api/banners/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  };

  const deleteBanner = async (id: number) => {
    await fetch(`/api/banners/${id}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <BannerManager
      banners={banners}
      onCreate={createBanner}
      onUpdate={updateBanner}
      onDelete={deleteBanner}
    />
  );
}