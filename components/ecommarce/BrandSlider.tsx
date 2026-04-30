"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import SliderNavButton from "./SliderNavButton";

type Brand = {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function BrandSlider({
  title = "Our Brands",
  subtitle = "Shop from your favorite brands",
  limit = 20,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const brandsData = await cachedFetchJson<Brand[]>("/api/brands", {
          ttlMs: 5 * 60 * 1000,
        });

        if (!mounted) return;

        setBrands(Array.isArray(brandsData) ? brandsData : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load brands");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const visible = useMemo(() => brands.slice(0, limit), [brands, limit]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;

    const card = el.querySelector<HTMLElement>("[data-brand-card='1']");
    const cardW = card ? card.offsetWidth : 200;

    el.scrollBy({
      left: dir === "left" ? -cardW * 1.2 : cardW * 1.2,
      behavior: "smooth",
    });
  };

  return (
    <section className="w-full bg-background">
      <div className="w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-border bg-background p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="group/slider relative mt-5 overflow-visible sm:mt-6">
          {visible.length >= 6 && (
            <SliderNavButton
              direction="left"
              onClick={() => scrollByCards("left")}
            />
          )}

          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 sm:gap-6"
            style={{ scrollbarWidth: "none" }}
          >
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="snap-start min-w-[160px] max-w-[160px] overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:min-w-[180px] sm:max-w-[180px]"
                  >
                    <div className="flex h-[100px] w-full items-center justify-center bg-white p-4 sm:h-[110px]">
                      <div className="h-10 w-20 animate-pulse rounded bg-muted sm:h-12 sm:w-24" />
                    </div>
                  </div>
                ))
              : visible.map((brand) => (
                  <div
                    key={brand.id}
                    className="snap-start"
                    data-brand-card="1"
                  >
                    <Link
                      href={`/ecommerce/brands/${brand.slug}`}
                      className="group block min-w-[160px] max-w-[160px] overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg sm:min-w-[180px] sm:max-w-[180px]"
                    >
                      <div className="flex h-[100px] w-full items-center justify-center bg-white px-6 py-4 sm:h-[110px]">
                        {brand.logo ? (
                          <Image
                            src={brand.logo}
                            alt={brand.name}
                            width={140}
                            height={80}
                            className="h-auto max-h-12 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-105 sm:max-h-14"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground sm:h-14 sm:w-14">
                            {brand.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
          </div>

          {visible.length >= 6 && (
            <SliderNavButton
              direction="right"
              onClick={() => scrollByCards("right")}
            />
          )}
        </div>

        <div className="mt-4 h-px w-full bg-border" />

        {!loading && visible.length === 0 ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            No brands found.
          </div>
        ) : null}
      </div>
    </section>
  );
}