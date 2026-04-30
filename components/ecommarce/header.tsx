//components/ecommarce/header.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { isDarkLikeTheme } from "@/lib/theme";
import { useSession, signOut } from "@/lib/auth-client";
import { getDashboardRoute } from "@/lib/dashboard-route";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  ShoppingCart,
  Heart,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  LogIn,
  LogOut,
  LayoutDashboard,
  Newspaper,
  Boxes,
  Sun,
  Moon,
  Check,
  X,
} from "lucide-react";

const CATEGORIES_API = "/api/categories";
const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "navy", label: "Navy" },
  { value: "plum", label: "Plum" },
  { value: "olive", label: "Olive" },
  { value: "rose", label: "Rose" },
] as const;

/* =========================
   Types
========================= */
interface ProductSummary {
  id: number | string;
  name: string;
  image?: string | null;
}

interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  image?: string | null;
  parentId: number | null;
}
interface CategoryNode extends CategoryDTO {
  children: CategoryNode[];
}

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

/* =========================
   Helpers
========================= */
function buildCategoryTree(list: CategoryDTO[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  list.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else roots.push(node);
  });

  const sortRec = (arr: CategoryNode[]) => {
    arr.sort((a, b) => a.name.localeCompare(b.name, "bn"));
    arr.forEach((x) => sortRec(x.children));
  };
  sortRec(roots);

  return roots;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/* =========================
   Dropdown shared styles
========================= */
const ddItemBase =
  "w-full flex items-center justify-between px-4 py-2.5 text-sm transition select-none";
const ddItemInactive = "text-foreground hover:bg-accent";
const ddItemActive = "bg-primary text-primary-foreground";

const ddColShell =
  "w-[260px] max-h-[420px] overflow-y-auto overflow-x-hidden bg-popover";

const ddWrapperShell =
  "bg-popover text-foreground border border-border shadow-2xl rounded-md overflow-hidden";

/* =========================
   Row-2 All Category Dropdown (Desktop)
========================= */
function TechlandCategoryDropdown({
  categories,
  loading,
  onClose,
}: {
  categories: CategoryNode[];
  loading: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [activeParentId, setActiveParentId] = useState<number | null>(null);
  const [activeSubId, setActiveSubId] = useState<number | null>(null);

  const activeParent = useMemo(() => {
    if (!activeParentId) return null;
    return categories.find((c) => c.id === activeParentId) ?? null;
  }, [categories, activeParentId]);

  const subList = activeParent?.children ?? [];

  const activeSub = useMemo(() => {
    if (!activeSubId) return null;
    return subList.find((s) => s.id === activeSubId) ?? null;
  }, [subList, activeSubId]);

  const childList = activeSub?.children ?? [];

  useEffect(() => {
    setActiveParentId(null);
    setActiveSubId(null);
  }, [categories.length]);

  const go = (slug: string) => {
    router.push(`/ecommerce/categories/${slug}`);
    onClose();
  };

  if (loading) {
    return (
      <div className="bg-popover text-foreground border border-border shadow-2xl rounded-md px-5 py-4 text-sm">
        Loading...
      </div>
    );
  }

  if (!categories.length) {
    return (
      <div className="bg-popover text-foreground border border-border shadow-2xl rounded-md px-5 py-4 text-sm">
        No categories found.
      </div>
    );
  }

  return (
    <div className={ddWrapperShell}>
      <div className="flex">
        {/* Parent */}
        <div className={`${ddColShell} border-r border-border`}>
          {categories.map((p) => {
            const isActive = p.id === activeParentId;
            const hasSub = (p.children?.length ?? 0) > 0;

            return (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => {
                  setActiveParentId(p.id);
                  setActiveSubId(null);
                }}
                onClick={() => go(p.slug)}
                className={`${ddItemBase} ${
                  isActive ? ddItemActive : ddItemInactive
                }`}
                title={p.name}
              >
                <span className="truncate font-medium">{p.name}</span>
                {hasSub ? (
                  <ChevronRight className="h-4 w-4 opacity-80" />
                ) : (
                  <span className="w-4" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sub */}
        <div
          className={`${ddColShell} border-r border-border ${
            activeParentId ? "block" : "hidden"
          }`}
        >
          {subList.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No subcategories.
            </div>
          ) : (
            subList.map((s) => {
              const isActive = s.id === activeSubId;
              const hasChild = (s.children?.length ?? 0) > 0;

              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseEnter={() => setActiveSubId(s.id)}
                  onClick={() => go(s.slug)}
                  className={`${ddItemBase} ${
                    isActive ? ddItemActive : ddItemInactive
                  }`}
                  title={s.name}
                >
                  <span className="truncate">{s.name}</span>
                  {hasChild ? (
                    <ChevronRight className="h-4 w-4 opacity-80" />
                  ) : (
                    <span className="w-4" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Child */}
        <div className={`${ddColShell} ${activeSubId ? "block" : "hidden"}`}>
          {childList.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No child categories.
            </div>
          ) : (
            childList.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => go(c.slug)}
                className={`${ddItemBase} ${ddItemInactive}`}
                title={c.name}
              >
                <span className="truncate">{c.name}</span>
                <span className="w-4" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   ✅ Mobile Categories Drawer List
========================= */
function MobileCategoryTree({
  categories,
  loading,
  onGo,
}: {
  categories: CategoryNode[];
  loading: boolean;
  onGo: (slug: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());

  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-full rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!categories.length) {
    return (
      <div className="text-sm text-muted-foreground">No categories found.</div>
    );
  }

  const Row = ({ node, level }: { node: CategoryNode; level: number }) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isOpen = openIds.has(node.id);
    const padLeft = 16 + level * 14;

    return (
      <div>
        <div
          className="flex items-center justify-between gap-3 py-3 text-left hover:bg-accent transition"
          style={{ paddingLeft: padLeft, paddingRight: 12 }}
        >
          <button
            type="button"
            onClick={() => onGo(node.slug)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            title={node.name}
          >
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              <Image
                src={node.image || "/placeholder.svg"}
                alt={node.name}
                fill
                className="object-cover"
                sizes="36px"
              />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </span>
          </button>

          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="h-9 w-9 rounded-full border border-border bg-background hover:bg-muted flex items-center justify-center"
              aria-label={isOpen ? "Collapse" : "Expand"}
              title={isOpen ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={`h-5 w-5 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-90" : "rotate-0"
                }`}
              />
            </button>
          ) : (
            <span className="h-9 w-9" />
          )}
        </div>

        {hasChildren && isOpen ? (
          <div
            className="border-l border-border/60"
            style={{ marginLeft: padLeft + 18 }}
          >
            {node.children.map((child) => (
              <Row key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
      {categories.map((c) => (
        <Row key={c.id} node={c} level={0} />
      ))}
    </div>
  );
}

/* =========================
   Header
========================= */
export default function Header({
  siteSettingsData,
  productsData,
  categoriesData,
}: {
  siteSettingsData?: SiteSettings;
  productsData?: ProductSummary[];
  categoriesData?: CategoryDTO[];
}) {
  const router = useRouter();
  const { data: session } = useSession();

  const { theme, resolvedTheme, setTheme } = useTheme();

  const { cartItems } = useCart();
  const { wishlistCount } = useWishlist();

  const [hasMounted, setHasMounted] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Site settings
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    siteSettingsData ?? {},
  );

  // Mobile drawer
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // cart count
  const [cartCount, setCartCount] = useState(0);

  // search
  const [searchTerm, setSearchTerm] = useState("");
  const [allProducts, setAllProducts] = useState<ProductSummary[]>([]);
  const [searchResults, setSearchResults] = useState<ProductSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);

  // categories
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // dropdowns
  const [catOpen, setCatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const catWrapRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setHasMounted(true), []);

  // Load site settings
  useEffect(() => {
    const loadSiteSettings = async () => {
      try {
        if (siteSettingsData) {
          setSiteSettings(siteSettingsData);
          return;
        }

        const data = await cachedFetchJson<any>("/api/site", {
          ttlMs: 5 * 60 * 1000,
        });
        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to load site settings:", error);
      }
    };

    loadSiteSettings();
  }, [siteSettingsData]);

  const activeTheme = (theme === "system" ? resolvedTheme : theme) ?? "light";
  const darkLikeActiveTheme = isDarkLikeTheme(activeTheme);

  useEffect(() => {
    const total =
      cartItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    setCartCount(total);
  }, [cartItems]);

  // load products for search
  useEffect(() => {
    const loadProducts = async () => {
      try {
        if (productsData) {
          setAllProducts(productsData);
          setHasLoadedProducts(true);
          return;
        }

        setSearchLoading(true);
        const data = await cachedFetchJson<any[]>("/api/products", {
          ttlMs: 2 * 60 * 1000,
        });
        const mapped: ProductSummary[] = Array.isArray(data)
          ? data.map((p: any) => ({
              id: p.id,
              name: p.name,
              image: p.image ?? null,
            }))
          : [];
        setAllProducts(mapped);
        setHasLoadedProducts(true);
      } catch (err) {
        console.error(err);
      } finally {
        setSearchLoading(false);
      }
    };
    loadProducts();
  }, [productsData]);

  // load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        if (categoriesData) {
          setCategoryTree(buildCategoryTree(categoriesData));
          setCategoryLoading(false);
          return;
        }

        setCategoryLoading(true);
        const data = await cachedFetchJson<any[]>(CATEGORIES_API, {
          ttlMs: 5 * 60 * 1000,
        });
        const mapped: CategoryDTO[] = Array.isArray(data)
          ? data.map((c) => ({
              id: Number(c.id),
              name: String(c.name),
              slug: String(c.slug),
              image: c.image ?? null,
              parentId: c.parentId ? Number(c.parentId) : null,
            }))
          : [];
        setCategoryTree(buildCategoryTree(mapped));
      } catch (err) {
        console.error(err);
      } finally {
        setCategoryLoading(false);
      }
    };
    loadCategories();
  }, [categoriesData]);

  // search filtering
  useEffect(() => {
    if (!searchTerm || searchTerm.trim().length < 2 || !hasLoadedProducts) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const term = searchTerm.toLowerCase();
    const filtered = allProducts
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, 8);
    setSearchResults(filtered);
    setShowSearchDropdown(filtered.length > 0);
  }, [searchTerm, allProducts, hasLoadedProducts]);

  // outside click close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      if (catWrapRef.current && !catWrapRef.current.contains(target))
        setCatOpen(false);
      if (profileRef.current && !profileRef.current.contains(target))
        setProfileOpen(false);

      const el = e.target as HTMLElement;
      if (!el.closest?.(".header-search-wrapper")) setShowSearchDropdown(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // body scroll lock when drawer open
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const handleSelectProduct = (p: ProductSummary) => {
    setSearchTerm("");
    setShowSearchDropdown(false);
    router.push(`/ecommerce/products/${p.id}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      handleSelectProduct(searchResults[0]);
    }
  };

  const handleSignOut = async () => {
    setIsPending(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsPending(false);
    }
  };

  const sessionUser = (session?.user ?? null) as {
    name?: string | null;
    role?: string;
    roleNames?: string[];
    permissions?: string[];
    defaultAdminRoute?: "/admin" | "/admin/warehouse";
  } | null;
  const userName = sessionUser?.name || "User";
  const userRole = sessionUser?.role || "user";
  const displayRole =
    Array.isArray(sessionUser?.roleNames) && sessionUser.roleNames.length > 0
      ? sessionUser.roleNames.join(", ")
      : userRole;
  const dashboardHref = getDashboardRoute(sessionUser);

  const topBtnClass =
    "h-10 md:h-11 px-3 lg:px-5 rounded-lg bg-muted text-foreground border border-border flex items-center gap-2 lg:gap-2 text-sm font-semibold transition-colors hover:bg-accent hover:text-primary-foreground";

  const goCategoryFromMobile = (slug: string) => {
    setMobileMenuOpen(false);
    router.push(`/ecommerce/categories?slug=${encodeURIComponent(slug)}`);
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-primary text-primary-foreground border-b border-border">
        <div className="container mx-auto px-4 py-4">
          {/* ✅ Desktop: single line header */}
          <div className="hidden md:flex flex-wrap items-center gap-4">
            {/* Left */}
            <Link
              href="/"
              className="order-1 flex items-center gap-3 min-w-0 shrink-0"
            >
              <div className="relative h-12 w-12 rounded-2xl overflow-hidden border border-border bg-background/10 shrink-0">
                <Image
                  src={siteSettings.logo || "/assets/examplelogo.jpg"}
                  alt="Logo"
                  fill
                  className="object-contain 2xl"
                />
              </div>
              <div className="text-lg sm:text-2xl tracking-wider truncate max-w-[260px]">
                {siteSettings.siteTitle}
              </div>
            </Link>

            {/* Middle */}
            <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1 flex items-center min-w-0">
              {/* All Category */}
              <div ref={catWrapRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setCatOpen((p) => !p)}
                  className="
                    h-11 w-full sm:w-[190px]
                    rounded-md sm:rounded-l-md sm:rounded-r-none
                    bg-background text-foreground
                    border border-border
                    flex items-center justify-between
                    px-4 transition focus:outline-none focus:ring-2 focus:ring-primary/40
                  "
                >
                  <span className="text-sm font-semibold">All Category</span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </button>

                {catOpen && (
                  <div className="absolute left-0 mt-2 z-[9999]">
                    <TechlandCategoryDropdown
                      categories={categoryTree}
                      loading={categoryLoading}
                      onClose={() => setCatOpen(false)}
                    />
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex-1 header-search-wrapper relative min-w-0">
                <div className="relative">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() =>
                      searchResults.length > 0 && setShowSearchDropdown(true)
                    }
                    placeholder="Search for products..."
                    className="
                      w-full h-11
                      rounded-md sm:rounded-r-md sm:rounded-l-none
                      bg-background text-foreground
                      border border-border sm:border-l-0
                      pl-4 pr-[54px]
                      placeholder:text-muted-foreground
                      focus:outline-none focus:ring-2 focus:ring-primary/40
                    "
                  />

                  <button
                    type="button"
                    className="
                      absolute right-1 top-1
                      h-9 w-11 rounded-md
                      bg-primary text-primary-foreground
                      border border-border
                      flex items-center justify-center
                      hover:bg-primary/90 transition
                    "
                    onClick={() => {
                      if (searchResults.length > 0)
                        handleSelectProduct(searchResults[0]);
                    }}
                    aria-label="Search"
                  >
                    <Search className="h-4 w-4" />
                  </button>

                  {showSearchDropdown && (
                    <div className="absolute mt-2 w-full bg-popover text-foreground rounded-xl shadow-2xl border border-border max-h-80 overflow-auto z-[9999]">
                      {searchLoading && !hasLoadedProducts ? (
                        <div className="px-4 py-3 text-sm text-muted-foreground">
                          Loading...
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted-foreground">
                          No results found.
                        </div>
                      ) : (
                        searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProduct(p)}
                            className="w-full flex items-start px-4 py-2 text-left hover:bg-accent transition text-sm"
                          >
                            <span className="font-medium">{p.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="order-2 ml-auto flex items-center gap-3 shrink-0">
              {hasMounted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-lg bg-muted hover:bg-accent hover:text-primary-foreground text-foreground h-11 w-11 flex items-center justify-center border border-border"
                      title="Select theme"
                    >
                      {darkLikeActiveTheme ? (
                        <Sun className="h-5 w-5" />
                      ) : (
                        <Moon className="h-5 w-5" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {THEME_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className="flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {activeTheme === option.value ? (
                          <Check className="h-4 w-4" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Link href="/ecommerce/blogs" className={topBtnClass}>
                <Newspaper className="h-4 w-4" />
                <span className="hidden lg:inline">Blog</span>
              </Link>

              <Link href="/ecommerce/products" className={topBtnClass}>
                <Boxes className="h-4 w-4" />
                <span className="hidden lg:inline">All Products</span>
              </Link>

              <Link
                href="/ecommerce/cart"
                className="relative h-11 w-11 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent hover:text-primary-foreground"
              >
                <ShoppingCart className="h-5 w-5" />
                {hasMounted && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              <Link
                href="/ecommerce/wishlist"
                className="relative h-11 w-11 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent hover:text-primary-foreground"
              >
                <Heart className="h-5 w-5" />
                {hasMounted && wishlistCount > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((p) => !p)}
                  className="relative h-11 w-11 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent hover:text-primary-foreground"
                  aria-label="Profile"
                >
                  <UserIcon className="h-5 w-5" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-background text-foreground border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                    {hasMounted && session ? (
                      <>
                        <div className="px-4 py-3 border-b border-border">
                          <div className="text-sm font-semibold">
                            {userName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {displayRole}
                          </div>
                        </div>

                        <Link
                          href={dashboardHref}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition"
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                        </Link>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={async () => {
                            setProfileOpen(false);
                            await handleSignOut();
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition"
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push("/signin")}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition"
                      >
                        <LogIn className="h-4 w-4" />
                        Login
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ✅ Mobile header (same as before) */}
          <div className="flex md:hidden items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3 min-w-0">
              <div className="relative h-12 w-12 rounded-2xl overflow-hidden border border-border bg-background/10 shrink-0">
                <Image
                  src={siteSettings.logo || "/assets/examplelogo.jpg"}
                  alt="Logo"
                  fill
                  className="object-contain 2xl"
                />
              </div>
              <div className="text-md sm:text-3xl tracking-wider truncate">
                {siteSettings.siteTitle || "BOED ECOMMERCE"}
              </div>
            </Link>

            <div className="flex md:hidden items-center gap-2">
              {hasMounted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-lg bg-muted hover:bg-accent text-foreground h-10 w-10 flex items-center justify-center border border-border"
                      title="Select theme"
                    >
                      {darkLikeActiveTheme ? (
                        <Sun className="h-5 w-5" />
                      ) : (
                        <Moon className="h-5 w-5" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {THEME_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className="flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {activeTheme === option.value ? (
                          <Check className="h-4 w-4" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Link
                href="/ecommerce/cart"
                className="relative h-10 w-10 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent"
              >
                <ShoppingCart className="h-5 w-5" />
                {hasMounted && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              <Link
                href="/ecommerce/wishlist"
                className="relative h-10 w-10 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent"
              >
                <Heart className="h-5 w-5" />
                {hasMounted && wishlistCount > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="h-10 w-10 rounded-lg bg-muted text-foreground border border-border flex items-center justify-center transition-colors hover:bg-accent"
                aria-label="Open menu"
              >
                <span className="text-xl leading-none">☰</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Mobile Drawer: All Categories */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[9999]">
          {/* overlay */}
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu overlay"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* panel */}
          <div className="absolute left-0 top-0 h-full w-[86%] max-w-[380px] bg-background text-foreground border-r border-border shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-border">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 min-w-0"
              >
                <div className="relative h-11 w-11 rounded-xl overflow-hidden border border-border bg-muted shrink-0">
                  <Image
                    src={siteSettings.logo || "/assets/examplelogo.jpg"}
                    alt="Logo"
                    fill
                    className="object-contain"
                    sizes="44px"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold leading-tight truncate">
                    {siteSettings.siteTitle || "BOED"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {siteSettings.footerDescription || "E-Commerce"}
                  </div>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 w-10 rounded-lg border border-border bg-muted hover:bg-accent flex items-center justify-center"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="h-[calc(100%-64px)] space-y-5 overflow-y-auto bg-muted/30 p-4">
              {/* account */}
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
                {hasMounted && session ? (
                  <>
                    <div className="border-b border-border/70 bg-primary/5 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                          {userName?.charAt(0)?.toUpperCase() || "U"}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">
                            {userName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {displayRole}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-2">
                      <Link
                        href={dashboardHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition hover:bg-muted"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={async () => {
                          setMobileMenuOpen(false);
                          await handleSignOut();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        router.push("/signin");
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow"
                    >
                      <LogIn className="h-4 w-4" />
                      Login
                    </button>
                  </div>
                )}
              </div>

              <Link
                href="/ecommerce/products"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left shadow-sm hover:bg-accent transition"
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">⚡</span>
                  <span className="text-sm font-bold">All Products</span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>

              {/* categories */}
              <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                <div className="mb-3">
                  <div className="text-sm font-bold">All Categories</div>
                  <div className="text-xs text-muted-foreground">
                    Browse products by category
                  </div>
                </div>

                <MobileCategoryTree
                  categories={categoryTree}
                  loading={categoryLoading}
                  onGo={goCategoryFromMobile}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
