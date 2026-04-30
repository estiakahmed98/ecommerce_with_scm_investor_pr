"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import GradientBorder from "@/components/ui/GradientBorder";

interface Banner {
  id: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  image: string;
  mobileImage?: string | null;
  buttonText?: string | null;
  buttonLink?: string | null;
  position: number;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  type: "HERO" | "BANNER1" | "BANNER2" | "POPUP";
}

interface PopupBannerProps {
  banners: Banner[];
}

export default function PopupBanner({ banners }: PopupBannerProps) {
  const [showPopup, setShowPopup] = useState(false);
  const popupBanner = banners.find((b) => b.type === "POPUP");

  useEffect(() => {
    if (popupBanner) {
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [popupBanner]);

  if (!showPopup || !popupBanner) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="relative card-theme bg-secondary  rounded-2xl shadow-xl md:w-[35vw] w-[90vh] p-6 border border-border">
        {/* Close Button */}
        <button
          onClick={() => setShowPopup(false)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-xl transition"
        >
          ✕
        </button>

        {/* Image */}
        <div className="relative w-full h-80">
          <Image
            src={popupBanner.image}
            alt={popupBanner.title}
            fill
            className="object-contain rounded"
          />
        </div>

        {/* Button */}
        {popupBanner.buttonText && popupBanner.buttonLink && (
          <div className="mt-5 text-center">
            <a
              href={popupBanner.buttonLink}
              className="btn-primary px-6 py-2 rounded-md inline-block transition"
            >
              {popupBanner.buttonText}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
