"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import WritersManager from "@/components/management/WritersManager";

interface Writer {
  id: number;
  name: string;
  bio?: string;
  image?: string;
  createdAt: string;
  updatedAt: string;
}

const WritersPage = memo(function WritersPage() {
  const [writers, setWriters] = useState<Writer[]>([]);
  const [loading, setLoading] = useState(true);
  const [writersCache, setWritersCache] = useState<Map<string, Writer[]>>(new Map());

  // Memoize fetch function with caching
  const fetchWriters = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check cache first
      const cacheKey = "all";
      if (writersCache.has(cacheKey)) {
        const cachedData = writersCache.get(cacheKey);
        if (cachedData) {
          setWriters(cachedData);
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/writers");
      const data = await res.json();
      
      // Update cache
      setWritersCache(prev => new Map(prev).set(cacheKey, data));
      setWriters(data);
    } catch (err) {
      console.error("Failed to fetch writers:", err);
    } finally {
      setLoading(false);
    }
  }, [writersCache]);

  useEffect(() => {
    fetchWriters();
  }, [fetchWriters]);

  // Memoize CRUD operations
  const handleCreate = useCallback(async (payload: unknown) => {
    const res = await fetch("/api/writers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const newWriter = await res.json();

    // Update state and cache
    setWriters((prev) => [newWriter, ...prev]);
    setWritersCache(prev => {
      const newCache = new Map(prev);
      const current = newCache.get("all") || [];
      newCache.set("all", [newWriter, ...current]);
      return newCache;
    });
  }, []);

  const handleUpdate = useCallback(async (id: number, payload: unknown) => {
    const res = await fetch(`/api/writers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const updated = await res.json();

    // Update state and cache
    setWriters((prev) =>
      prev.map((writer) => (writer.id === id ? updated : writer))
    );
    setWritersCache(prev => {
      const newCache = new Map(prev);
      const current = newCache.get("all") || [];
      newCache.set("all", current.map((writer) => (writer.id === id ? updated : writer)));
      return newCache;
    });
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    await fetch(`/api/writers/${id}`, {
      method: "DELETE",
    });

    // Clear cache to force refresh
    setWritersCache(new Map());
    await fetchWriters(); // Refresh the list from backend so we only show deleted: false writers
  }, [fetchWriters]);

  // Memoize data to prevent unnecessary re-renders
  const memoizedWriters = useMemo(() => writers, [writers]);

  return (
    <WritersManager
      writers={memoizedWriters}
      loading={loading}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
    />
  );
});

export default WritersPage;
