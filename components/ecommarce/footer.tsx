"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import SpotlightCard from "../SpotlightCard";
import {
  Facebook,
  Instagram,
  Twitter,
  Mail,
  Phone,
  MapPin,
  BookOpen,
  Shield,
  Truck,
  HeadphonesIcon,
  Send,
  Heart,
  CreditCard,
  Clock,
  ChevronRight,
  Award,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ApiCategory = {
  id: number | string;
  name: string;
  slug?: string | null;
  parentId?: number | string | null;
};

type SiteSettings = {
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

export default function Footer({
  siteSettingsData,
  categoriesData,
}: {
  siteSettingsData?: SiteSettings;
  categoriesData?: ApiCategory[];
}) {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Site settings
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});

  // Load site settings
  useEffect(() => {
    const loadSiteSettings = async () => {
      try {
        const data =
          siteSettingsData ??
          (await cachedFetchJson<any>("/api/site", {
            ttlMs: 5 * 60 * 1000,
          }));
        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to load site settings:", error);
      }
    };

    loadSiteSettings();
  }, [siteSettingsData]);

  // ✅ categories from API
  const [categories, setCategories] = useState<
    Array<{ href: string; label: string }>
  >([]);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        const data =
          categoriesData ??
          ((await cachedFetchJson<ApiCategory[]>("/api/categories", {
            ttlMs: 5 * 60 * 1000,
          })) as ApiCategory[]);
        if (!mounted) return;

        const list = Array.isArray(data) ? data : [];

        // optional: show only root categories (parentId null)
        const roots = list.filter(
          (c) => c.parentId === null || c.parentId === undefined,
        );

        const mapped = roots
          .map((c) => {
            const id = Number(c.id);
            const label = String(c.name ?? "").trim();
            if (!label || !Number.isFinite(id)) return null;

            return {
              href: `/ecommerce/categories/${id}`,
              label,
            };
          })
          .filter(Boolean) as Array<{ href: string; label: string }>;

        setCategories(mapped);
      } catch (e) {
        // fail silently in footer
        console.error("Failed to load categories:", e);
      }
    };

    loadCategories();
    return () => {
      mounted = false;
    };
  }, [categoriesData]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsSubscribing(true);

    try {
      const checkRes = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const check = await checkRes.json();

      if (!check.valid) {
        toast.error("This email is not valid or already exists");
        setIsSubscribing(false);
        return;
      }

      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Successfully subscribed!");
        setEmail("");
      } else {
        toast.error(data.error || "Something went wrong while subscribing");
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const features = [
    { icon: Truck, label: "Fast Delivery", desc: "Free shipping over $100" },
    { icon: Clock, label: "24/7 Support", desc: "Always here to help" },
    { icon: CreditCard, label: "Secure Payment", desc: "SSL secured payment" },
    {
      icon: Award,
      label: "100% Authentic",
      desc: "Guaranteed genuine products",
    },
  ];

  const quickLinks = [
    { href: "/ecommerce/products", label: "All Products" },
    { href: "/ecommerce/blogs", label: "Blogs" },
    { href: "/ecommerce/bestsellers", label: "Bestsellers" },
    { href: "/ecommerce/upcoming", label: "Upcoming" },
  ];

  const customerService = [
    { href: "/ecommerce/shipping", label: "Shipping Policy", icon: Truck },
    {
      href: "/ecommerce/returns",
      label: "Return Policy",
      icon: HeadphonesIcon,
    },
    { href: "/ecommerce/privacy", label: "Privacy Policy", icon: Shield },
    { href: "/ecommerce/faq", label: "FAQ", icon: BookOpen },
  ];

  return (
    <footer className="bg-card border-t border-border">
      {/* Features Bar */}
      <div className="border-b border-border bg-muted/30 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-3 group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {feature.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-3 space-y-6">
            <Link href="/" className="inline-block group">
              <div className="flex items-center gap-3">
                <div className="bg-primary rounded-2xl text-primary-foreground">
                  <Image
                    src={siteSettings.logo || "/assets/examplelogo.jpg"}
                    alt="Logo"
                    width={50}
                    height={50}
                    className="object-contain rounded-2xl"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    {siteSettings.siteTitle || "BOED ECOMMERCE"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    The all-in-one global marketplace
                  </p>
                </div>
              </div>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {siteSettings.footerDescription ||
                "BOED Universal is a premier digital marketplace designed to bring the world's products to your fingertips. From essential knowledge to everyday lifestyle needs, we are committed to making high-quality resources accessible to everyone, everywhere."}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Call us</p>
                  <p className="text-sm font-medium text-foreground">
                    {siteSettings.contactNumber || "+88-01234567890"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email us</p>
                  <p className="text-sm font-medium text-foreground">
                    {siteSettings.contactEmail || "e-commerce@example.com"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 mt-1">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {siteSettings.address ||
                      "10A, Tower 71, ECB Chattar, Dhaka Cantonment\nBangladesh"}
                  </p>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-2">
              {[
                {
                  icon: Facebook,
                  href: siteSettings.facebookLink || "https://birdsofeden.me/",
                  label: "Facebook",
                },
                {
                  icon: Instagram,
                  href: siteSettings.instagramLink || "https://birdsofeden.me/",
                  label: "Instagram",
                },
                {
                  icon: Twitter,
                  href: siteSettings.twitterLink || "https://birdsofeden.me/",
                  label: "Twitter",
                },
                {
                  icon: Youtube,
                  href:
                    siteSettings.youtubeLink ||
                    "https://www.youtube.com/@channel",
                  label: "YouTube",
                },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div className="lg:col-span-6 grid grid-cols-2 md:grid-cols-3 gap-6">
            {/* Quick Links */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Quick Links
              </h3>
              <ul className="space-y-2">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 group transition-all duration-300"
                    >
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ✅ Categories (from /api/categories) */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Categories
              </h3>
              <ul className="space-y-2">
                {categories.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Loading...</li>
                ) : (
                  categories.slice(0, 10).map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 group transition-all duration-300"
                      >
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all" />
                        {link.label}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Customer Service */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Customer Service
              </h3>
              <ul className="space-y-2">
                {customerService.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 group transition-all duration-300"
                    >
                      <link.icon className="h-3 w-3" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter Column */}
          <div className="lg:col-span-3">
            <SpotlightCard
              className="!p-0 !border-border !bg-card !rounded-xl overflow-hidden"
              spotlightColor="rgba(0, 229, 255, 0.1)"
            >
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Newsletter
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Subscribe to our newsletter to get the latest updates and
                  exclusive offers.
                </p>

                <form onSubmit={handleSubscribe} className="space-y-3">
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-background border-border text-foreground placeholder:text-muted-foreground/50 pr-10"
                    />
                    <Send className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubscribing}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 disabled:opacity-50"
                  >
                    {isSubscribing ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        Subscribing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Subscribe
                        <Send className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      100% Secure Transactions
                    </p>
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {currentYear} {siteSettings?.siteTitle || "BEOD"} All rights reserved.
            </p>

            <div className="flex items-center gap-6">
              {[
                { href: "/privacy", label: "Privacy Policy" },
                { href: "/terms", label: "Terms of Service" },
                { href: "/sitemap", label: "Sitemap" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                Visa
              </div>
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                Mastercard
              </div>
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                bkash
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
