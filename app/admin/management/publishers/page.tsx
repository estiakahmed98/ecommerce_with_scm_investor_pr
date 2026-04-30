"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import PublishersManager from "@/components/management/PublishersManager";

interface Publisher {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
}

const PublishersPage = memo(function PublishersPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishersCache, setPublishersCache] = useState<Map<string, Publisher[]>>(new Map());

  // Memoize fetch function with caching
  const fetchPublishers = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check cache first
      const cacheKey = "all";
      if (publishersCache.has(cacheKey)) {
        const cachedData = publishersCache.get(cacheKey);
        if (cachedData) {
          setPublishers(cachedData);
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/publishers");
      const data = await res.json();
      
      // Update cache
      setPublishersCache(prev => new Map(prev).set(cacheKey, data));
      setPublishers(data);
    } finally {
      setLoading(false);
    }
  }, [publishersCache]);

  useEffect(() => {
    fetchPublishers();
  }, [fetchPublishers]);

  // Memoize CRUD operations
  const onCreate = useCallback(async (payload: unknown) => {
    const res = await fetch("/api/publishers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const newPub = await res.json();

    // Update state and cache
    setPublishers((prev) => [newPub, ...prev]);
    setPublishersCache(prev => {
      const newCache = new Map(prev);
      const current = newCache.get("all") || [];
      newCache.set("all", [newPub, ...current]);
      return newCache;
    });
  }, []);

  const onUpdate = useCallback(async (id: number, payload: unknown) => {
    const res = await fetch(`/api/publishers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const updated = await res.json();

    // Update state and cache
    setPublishers((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setPublishersCache(prev => {
      const newCache = new Map(prev);
      const current = newCache.get("all") || [];
      newCache.set("all", current.map((p) => (p.id === id ? updated : p)));
      return newCache;
    });
  }, []);

  const onDelete = useCallback(async (id: number) => {
    await fetch(`/api/publishers/${id}`, { method: "DELETE" });
    
    // Clear cache to force refresh
    setPublishersCache(new Map());
    await fetchPublishers(); // refresh list instead of manually filtering
  }, [fetchPublishers]);

  // Memoize data to prevent unnecessary re-renders
  const memoizedPublishers = useMemo(() => publishers, [publishers]);

  return (
    <PublishersManager
      publishers={memoizedPublishers}
      loading={loading}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
});

export default PublishersPage;
