"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type WishlistContextType = {
  wishlistItems: number[];
  addToWishlist: (productId: number | string) => void;
  removeFromWishlist: (productId: number | string) => void;
  isInWishlist: (productId: number | string) => boolean;
  wishlistCount: number;
};

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined
);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlistItems, setWishlistItems] = useState<number[]>([]);

  // Load wishlist from localStorage on initial render
  useEffect(() => {
    const savedWishlist = localStorage.getItem("wishlist");
    if (savedWishlist) {
      try {
        setWishlistItems(JSON.parse(savedWishlist));
      } catch (error) {
        console.error("Failed to parse wishlist from localStorage:", error);
      }
    }
  }, []);

  // Save wishlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("wishlist", JSON.stringify(wishlistItems));
  }, [wishlistItems]);

  const addToWishlist = async (productId: number | string) => {
    const numericId =
      typeof productId === "string"
        ? Number.parseInt(productId as string, 10)
        : productId;
    if (!wishlistItems.includes(numericId)) {
      setWishlistItems([...wishlistItems, numericId]);
      
      // Also sync with API if user is authenticated
      try {
        const response = await fetch("/api/wishlist", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ productId: numericId }),
        });
        
        // If API call fails, don't remove from localStorage (keep local state)
        if (!response.ok && response.status !== 401) {
          console.warn("Failed to sync with wishlist API");
        }
      } catch (error) {
        console.warn("Failed to sync with wishlist API:", error);
      }
    }
  };

  const removeFromWishlist = async (productId: number | string) => {
    const numericId =
      typeof productId === "string"
        ? Number.parseInt(productId as string, 10)
        : productId;
    setWishlistItems(wishlistItems.filter((id) => id !== numericId));
    
    // Also sync with API if user is authenticated
    try {
      const response = await fetch(`/api/wishlist?productId=${numericId}`, {
        method: "DELETE",
      });
      
      // If API call fails, don't add back to localStorage (keep local state)
      if (!response.ok && response.status !== 401) {
        console.warn("Failed to sync with wishlist API");
      }
    } catch (error) {
      console.warn("Failed to sync with wishlist API:", error);
    }
  };

  const isInWishlist = (productId: number | string) => {
    const numericId =
      typeof productId === "string"
        ? Number.parseInt(productId as string, 10)
        : productId;
    return wishlistItems.includes(numericId);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        wishlistCount: wishlistItems.length,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
}
