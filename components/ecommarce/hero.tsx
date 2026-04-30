"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cachedFetchJson } from "@/lib/client-cache-fetch";

interface Banner {
  id: number;
  title: string;
  image: string;
  type: "HERO" | "BANNER1" | "BANNER2" | "POPUP";
  position: number;
  isActive: boolean;
  href?: string;
}

type Props = {
  heroInterval?: number;
  banner1Interval?: number;
  banner2Interval?: number;
  bannersData?: Banner[];
};

export default function Hero({
  heroInterval = 5000,
  banner1Interval = 3000,
  banner2Interval = 4000,
  bannersData,
}: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentHero, setCurrentHero] = useState(0);
  const [currentBanner1, setCurrentBanner1] = useState(0);
  const [currentBanner2, setCurrentBanner2] = useState(0);

  const heroTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banner1TimerRef = useRef<NodeJS.Timeout | null>(null);
  const banner2TimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ================= FETCH ================= */
  useEffect(() => {
    const load = async () => {
      const data =
        bannersData ??
        (await cachedFetchJson<Banner[]>("/api/banners", {
          ttlMs: 2 * 60 * 1000,
        }));
      setBanners((data as Banner[]).filter((b) => b.isActive && b.type !== "POPUP"));
    };
    load();
  }, [bannersData]);

  /* ================= SPLIT ================= */
  const heroSlides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "HERO")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  const banner1Slides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "BANNER1")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  const banner2Slides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "BANNER2")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  const hasSideBanners = banner1Slides.length > 0 || banner2Slides.length > 0;

  /* ================= AUTO SLIDE HERO ================= */
  useEffect(() => {
    if (heroSlides.length <= 1) return;

    heroTimerRef.current = setInterval(() => {
      setCurrentHero((prev) => (prev + 1) % heroSlides.length);
    }, heroInterval);

    return () => {
      if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    };
  }, [heroSlides.length, heroInterval]);

  /* ================= AUTO SLIDE BANNER1 ================= */
  useEffect(() => {
    if (banner1Slides.length <= 1) return;

    banner1TimerRef.current = setInterval(() => {
      setCurrentBanner1((prev) => (prev + 1) % banner1Slides.length);
    }, banner1Interval);

    return () => {
      if (banner1TimerRef.current) clearInterval(banner1TimerRef.current);
    };
  }, [banner1Slides.length, banner1Interval]);

  /* ================= AUTO SLIDE BANNER2 ================= */
  useEffect(() => {
    if (banner2Slides.length <= 1) return;

    banner2TimerRef.current = setInterval(() => {
      setCurrentBanner2((prev) => (prev + 1) % banner2Slides.length);
    }, banner2Interval);

    return () => {
      if (banner2TimerRef.current) clearInterval(banner2TimerRef.current);
    };
  }, [banner2Slides.length, banner2Interval]);

  if (heroSlides.length === 0) return null;

  return (
    <section className="w-full">
      {/* Same outer padding like screenshot */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Desktop: 2/3 + 1/3 */}
        <div
          className={`grid items-stretch gap-8 ${
            hasSideBanners ? "lg:grid-cols-[2fr_1fr]" : "grid-cols-1"
          }`}
        >
          {/* ================= LEFT HERO (Desktop height fixed 500px) ================= */}
          <div className="relative overflow-hidden rounded-2xl bg-muted">
            <div className="relative h-[240px] sm:h-[320px] lg:h-[500px]">
              {heroSlides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={`absolute inset-0 transition-opacity duration-700 ${
                    index === currentHero ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <Link href={slide.href ?? "#"} className="block h-full w-full">
                    <Image
                      src={slide.image}
                      alt={slide.title}
                      fill
                      priority={index === 0}
                      className="object-cover"
                      sizes="(min-width: 1024px) 66vw, 100vw"
                    />
                  </Link>
                </div>
              ))}

              {/* HERO dots */}
              {heroSlides.length > 1 && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  {heroSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentHero(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        i === currentHero ? "w-10 bg-white/90" : "w-2 bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ================= RIGHT SIDE (2 banners each 245px fixed on desktop) ================= */}
          {hasSideBanners && (
            <div className="flex flex-col gap-8">
              {/* Banner 1 */}
              {banner1Slides.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm">
                  <div className="relative h-[200px] sm:h-[240px] lg:h-[245px]">
                    {banner1Slides.map((banner, index) => (
                      <div
                        key={banner.id}
                        className={`absolute inset-0 transition-opacity duration-700 ${
                          index === currentBanner1 ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <Link
                          href={banner.href ?? "#"}
                          className="block h-full w-full"
                        >
                          <Image
                            src={banner.image}
                            alt={banner.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 1024px) 33vw, 100vw"
                          />
                        </Link>
                      </div>
                    ))}

                    {/* Banner1 dots */}
                    {banner1Slides.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                        {banner1Slides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentBanner1(i)}
                            aria-label={`Go to banner 1 slide ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all ${
                              i === currentBanner1
                                ? "w-8 bg-white/90"
                                : "w-2 bg-white/50"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Banner 2 */}
              {banner2Slides.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm">
                  <div className="relative h-[200px] sm:h-[240px] lg:h-[245px]">
                    {banner2Slides.map((banner, index) => (
                      <div
                        key={banner.id}
                        className={`absolute inset-0 transition-opacity duration-700 ${
                          index === currentBanner2 ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <Link
                          href={banner.href ?? "#"}
                          className="block h-full w-full"
                        >
                          <Image
                            src={banner.image}
                            alt={banner.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 1024px) 33vw, 100vw"
                          />
                        </Link>
                      </div>
                    ))}

                    {/* Banner2 dots */}
                    {banner2Slides.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                        {banner2Slides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentBanner2(i)}
                            aria-label={`Go to banner 2 slide ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all ${
                              i === currentBanner2
                                ? "w-8 bg-white/90"
                                : "w-2 bg-white/50"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
