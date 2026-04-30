"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import UserTable from "@/components/admin/users/UserTable";
import UserFilters from "@/components/admin/users/UserFilters";
import Pagination from "@/components/admin/users/Pagination";
import {
  Users,
  Loader2,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: number | null;
  note: string | null;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    orders: number;
    reviews: number;
  };
}

interface Role {
  id: string;
  name: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isImmutable: boolean;
  userCount: number;
  permissions: Array<{
    id: string;
    key: string;
    description: string | null;
  }>;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsersCacheEntry {
  users: User[];
  pagination: PaginationInfo;
}

interface UsersQueryState {
  page: number;
  limit: number;
  search: string;
  role: string;
}

const usersCache = new Map<string, UsersCacheEntry>();
let lastUsersQueryState: UsersQueryState = {
  page: 1,
  limit: 10,
  search: "",
  role: "",
};

const getCacheKey = (query: UsersQueryState) =>
  JSON.stringify({
    page: query.page,
    limit: query.limit,
    search: query.search,
    role: query.role,
  });

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const initialCacheKey = getCacheKey(lastUsersQueryState);
  const initialCachedEntry = usersCache.get(initialCacheKey);
  const canCreateUsers = Array.isArray(
    (session?.user as any)?.globalPermissions,
  )
    ? ((session?.user as any).globalPermissions as string[]).includes(
        "users.manage",
      )
    : false;

  const [users, setUsers] = useState<User[]>(
    () => initialCachedEntry?.users ?? [],
  );
  const [pagination, setPagination] = useState<PaginationInfo>(() => ({
    page: lastUsersQueryState.page,
    limit: lastUsersQueryState.limit,
    total: initialCachedEntry?.pagination.total ?? 0,
    totalPages: initialCachedEntry?.pagination.totalPages ?? 0,
  }));
  const [filters, setFilters] = useState({
    search: lastUsersQueryState.search,
    role: lastUsersQueryState.role,
  });
  const [loading, setLoading] = useState(() => !initialCachedEntry);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    role: "user",
    phone: "",
    password: "",
    addresses: [""],
  });
  const [showPassword, setShowPassword] = useState(false);

  // Fetch roles from RBAC API
  const fetchRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      const response = await fetch("/api/admin/rbac/roles");

      if (!response.ok) {
        throw new Error("Failed to load roles");
      }

      const rolesData = await response.json();
      setRoles(rolesData);
    } catch (err) {
      console.error("Error fetching roles:", err);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  // Fetch roles when component mounts
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Update default role when roles are loaded
  useEffect(() => {
    if (roles.length > 0 && newUser.role === "user") {
      // Find a suitable default role (prefer non-system roles, or first available)
      const defaultRole = roles.find((r) => !r.isSystem) || roles[0];
      if (defaultRole) {
        setNewUser((prev) => ({ ...prev, role: defaultRole.name }));
      }
    }
  }, [roles, newUser.role]);

  // Memoize fetch function with persistent page-level caching
  const fetchUsers = useCallback(
    async (showRefresh = false) => {
      const queryState: UsersQueryState = {
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search.trim(),
        role: filters.role,
      };
      const cacheKey = getCacheKey(queryState);
      lastUsersQueryState = queryState;

      if (!showRefresh && usersCache.has(cacheKey)) {
        const cachedData = usersCache.get(cacheKey);
        if (cachedData) {
          setUsers(cachedData.users);
          setPagination(cachedData.pagination);
          setFilters({
            search: queryState.search,
            role: queryState.role,
          });
          setError("");
          setLoading(false);
          return;
        }
      }

      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const params = new URLSearchParams({
          page: queryState.page.toString(),
          limit: queryState.limit.toString(),
          ...(queryState.search && { search: queryState.search }),
          ...(queryState.role && { role: queryState.role }),
        });

        const response = await fetch(`/api/users?${params}`);

        if (!response.ok) {
          throw new Error("Failed to load user data");
        }

        const data = await response.json();

        usersCache.set(cacheKey, {
          users: data.users,
          pagination: data.pagination,
        });

        setUsers(data.users);
        setPagination(data.pagination);
        setError("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error loading user data",
        );
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pagination.page, pagination.limit, filters.search, filters.role],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Memoize handler functions to prevent unnecessary re-renders
  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleSearchChange = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, search }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const handleRoleChange = useCallback((role: string) => {
    setFilters((prev) => ({ ...prev, role }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const handleRefresh = useCallback(() => {
    fetchUsers(true);
  }, [fetchUsers]);

  const handleUserUpdate = useCallback(
    (userId: string, updates: Partial<User>) => {
      setUsers((prev) => {
        const nextUsers = prev.map((user) =>
          user.id === userId ? { ...user, ...updates } : user,
        );

        const cacheKey = getCacheKey({
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search.trim(),
          role: filters.role,
        });
        const cached = usersCache.get(cacheKey);
        if (cached) {
          usersCache.set(cacheKey, {
            ...cached,
            users: nextUsers,
          });
        }

        return nextUsers;
      });
    },
    [filters.role, filters.search, pagination.limit, pagination.page],
  );

  const handleUserDelete = useCallback(
    (userId: string) => {
      setUsers((prev) => {
        const nextUsers = prev.filter((user) => user.id !== userId);

        const cacheKey = getCacheKey({
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search.trim(),
          role: filters.role,
        });
        const cached = usersCache.get(cacheKey);
        if (cached) {
          usersCache.set(cacheKey, {
            ...cached,
            users: nextUsers,
            pagination: {
              ...cached.pagination,
              total: Math.max(0, cached.pagination.total - 1),
            },
          });
        }

        return nextUsers;
      });
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
      }));
    },
    [filters.role, filters.search, pagination.limit, pagination.page],
  );

  const handleResetFilters = useCallback(() => {
    setFilters({ search: "", role: "" });
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  // Memoize filtered users to prevent unnecessary re-calculations
  const filteredUsers = useMemo(() => {
    return users; // Users are already filtered on the server side
  }, [users]);

  // Memoize pagination data
  const paginationData = useMemo(() => pagination, [pagination]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!newUser.email || !newUser.password) {
      setCreateError("Email and password are required");
      return;
    }

    const normalizedAddresses = newUser.addresses
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (normalizedAddresses.length === 0) {
      setCreateError("Please provide at least one address");
      return;
    }

    try {
      setCreating(true);

      const requestData = {
        email: newUser.email,
        name: newUser.name || "",
        role: newUser.role,
        phone: newUser.phone || "",
        password: newUser.password,
        addresses: normalizedAddresses,
      };

      console.log("Sending user creation request:", requestData);

      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      console.log("Response status:", response.status, response.statusText);

      if (!response.ok) {
        const data = await response.json().catch((e) => {
          console.error("Error parsing JSON response:", e);
          return {};
        });
        console.error("Create user error response:", data);
        setCreateError(data?.error || data?.message || "Failed to create user");
        return;
      }

      const successData = await response.json();
      console.log("User created successfully:", successData);
      setShowCreateModal(false);

      // Reset form with proper default role
      const defaultRole = roles.find((r) => !r.isSystem) ||
        roles[0] || { name: "user" };
      setNewUser({
        email: "",
        name: "",
        role: defaultRole.name,
        phone: "",
        password: "",
        addresses: [""],
      });
      usersCache.clear();
      await fetchUsers(true);
    } catch (err) {
      console.error("Error creating user:", err);
      setCreateError("Error creating user");
    } finally {
      setCreating(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-background transition-colors duration-300">
        <div className="p-4 sm:p-8">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="h-10 bg-muted rounded w-48 mb-2 animate-pulse"></div>
                <div className="h-4 bg-muted/60 rounded w-56 animate-pulse mt-2"></div>
              </div>
              <div className="flex gap-2">
                <div className="h-10 bg-muted rounded w-24 animate-pulse"></div>
                <div className="h-10 bg-muted rounded-lg w-10 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-lg p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-24 mb-3 animate-pulse"></div>
                    <div className="h-7 bg-muted rounded w-12 animate-pulse"></div>
                  </div>
                  <div className="w-12 h-12 bg-muted rounded-lg animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters Skeleton */}
          <div className="bg-card rounded-lg border border-border p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="h-10 bg-muted rounded animate-pulse"></div>
              <div className="h-10 bg-muted rounded animate-pulse"></div>
              <div className="h-10 bg-muted rounded animate-pulse"></div>
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Table Header */}
            <div className="p-5 border-b border-border bg-muted/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-5 bg-muted rounded w-32 mb-1 animate-pulse"></div>
                  <div className="h-3 bg-muted/60 rounded w-24 mt-2 animate-pulse"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-8 bg-muted rounded w-20 animate-pulse"></div>
                  <div className="h-8 bg-muted rounded w-24 animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-full animate-pulse"></div>
                      <div className="flex-1">
                        <div className="h-3 bg-muted/60 rounded w-24 mb-2 animate-pulse"></div>
                        <div className="h-2 bg-muted/60 rounded w-32 animate-pulse"></div>
                      </div>
                    </div>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div
                        key={j}
                        className="h-3 bg-muted/60 rounded w-20 animate-pulse"
                      ></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <div className="p-4 sm:p-8">
        {/* Header Section - Refined */}
        <div className="mb-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                  Users
                </h1>
                <p className="text-muted-foreground mt-2 text-base">
                  Manage and monitor all user accounts
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canCreateUsers ? (
                  <button
                    onClick={() => {
                      setCreateError("");
                      setShowCreateModal(true);
                    }}
                    className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 font-medium text-sm"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Add User</span>
                  </button>
                ) : null}

                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="p-2.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300"
                  title="Refresh data"
                >
                  <RefreshCw
                    className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="flex-1">
                <p className="text-destructive font-medium text-sm">{error}</p>
              </div>
              <button
                onClick={() => setError("")}
                className="text-destructive/70 hover:text-destructive transition-colors duration-200 p-1 rounded hover:bg-destructive/10"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid - Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Users
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {pagination.total}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Active Users
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {
                    users.filter(
                      (u) =>
                        !u.banned ||
                        (u.banExpires && Date.now() > u.banExpires * 1000),
                    ).length
                  }
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Admin Accounts
                </p>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {
                    users.filter((u) =>
                      (u.role || "").toLowerCase().includes("admin"),
                    ).length
                  }
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Users Table Section - Streamlined */}
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          {/* Table Header with Filters */}
          <div className="p-5 border-b border-border bg-muted/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  User List
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {pagination.total} total users
                </p>
              </div>

              <div className="flex items-center gap-3 text-sm">
                {pagination.totalPages > 1 && (
                  <div className="bg-background px-2.5 py-1.5 rounded text-xs font-medium text-foreground border border-border">
                    Page {pagination.page} / {pagination.totalPages}
                  </div>
                )}

                {/* Results per page */}
                <select
                  value={pagination.limit}
                  onChange={(e) =>
                    setPagination((prev) => ({
                      ...prev,
                      limit: parseInt(e.target.value),
                      page: 1,
                    }))
                  }
                  className="px-2.5 py-1.5 rounded text-xs border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="10">10 per page</option>
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
              </div>
            </div>

            {/* Filters */}
            <UserFilters
              search={filters.search}
              role={filters.role}
              roles={roles}
              onSearchChange={handleSearchChange}
              onRoleChange={handleRoleChange}
              onReset={handleResetFilters}
            />
          </div>

          {/* Table Content */}
          {users.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No users found
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6 text-sm">
                {filters.search || filters.role
                  ? "No users match your filters. Try adjusting your search criteria."
                  : "No users have been created yet. Start by adding your first user."}
              </p>
              {(filters.search || filters.role) && (
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-all font-medium text-sm"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <>
              <UserTable
                users={filteredUsers}
                onUserUpdate={handleUserUpdate}
                onUserDelete={handleUserDelete}
              />

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="p-5 border-t border-border bg-muted/40">
                  <Pagination
                    currentPage={paginationData.page}
                    totalPages={paginationData.totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add User Modal - Refined Design */}
      {canCreateUsers && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/50 backdrop-blur-sm">
          <div className="bg-card rounded-lg shadow-lg border border-border max-w-lg w-full">
            {/* Modal Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Create New User
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a new user account with basic details
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder-muted-foreground"
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder-muted-foreground"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={(e) =>
                      setNewUser((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder-muted-foreground"
                    placeholder="+1 234 567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Role <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser((prev) => ({ ...prev, role: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    disabled={rolesLoading}
                  >
                    {rolesLoading ? (
                      <option value="">Loading roles...</option>
                    ) : roles.length > 0 ? (
                      roles.map((role) => (
                        <option key={role.id} value={role.name}>
                          {role.label} {role.isSystem && "(System)"}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderator</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder-muted-foreground pr-9"
                      placeholder="Min. 6 characters"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Address Fields */}
              <div className="space-y-3 pt-2">
                <label className="block text-sm font-medium text-foreground">
                  Addresses <span className="text-destructive">*</span>
                </label>
                {newUser.addresses.map((addr, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={addr}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewUser((prev) => {
                            const next = { ...prev };
                            const copy = [...next.addresses];
                            copy[index] = value;
                            next.addresses = copy;
                            return next;
                          });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder-muted-foreground"
                        placeholder={
                          index === 0
                            ? "Main address"
                            : `Additional address ${index}`
                        }
                      />
                    </div>
                    {newUser.addresses.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewUser((prev) => ({
                            ...prev,
                            addresses: prev.addresses.filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                        className="px-3 py-2 rounded-lg text-xs text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setNewUser((prev) => ({
                      ...prev,
                      addresses: [...prev.addresses, ""],
                    }))
                  }
                  className="text-xs px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Another Address
                </button>
              </div>

              {createError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-xs text-destructive">{createError}</p>
                </div>
              )}

              {/* Modal Footer */}
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60 flex items-center gap-2"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{creating ? "Creating..." : "Create User"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
