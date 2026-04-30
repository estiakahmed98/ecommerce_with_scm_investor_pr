"use client";

import { Search, RotateCcw, Shield } from "lucide-react";

interface Role {
  id: string;
  name: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isImmutable: boolean;
  userCount: number;
}

interface UserFiltersProps {
  search: string;
  role: string;
  roles: Role[];
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onReset: () => void;
}

export default function UserFilters({
  search,
  role,
  roles,
  onSearchChange,
  onRoleChange,
  onReset,
}: UserFiltersProps) {
  const formatRoleLabel = (roleName: string) => {
    const role = roles.find((r) => r.name === roleName);
    return role
      ? role.label
      : roleName
          .split("_")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
  };

  return (
    <div className="bg-gradient-to-r from-background to-muted p-6 rounded-2xl shadow-lg border-border mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Search Input */}
        <div className="lg:col-span-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by email or name..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300 text-foreground placeholder-muted-foreground shadow-sm"
            />
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Role Filter */}
        <div>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300 text-foreground shadow-sm"
          >
            <option value="">All Roles</option>
            {roles.length > 0 ? (
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
                <option value="manager">Manager</option>
              </>
            )}
          </select>
        </div>

        {/* Reset Button */}
        <div className="flex items-end">
          <button
            onClick={onReset}
            className="w-full py-3 px-4 rounded-xl bg-background border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300 font-medium shadow-sm hover:shadow-md flex items-center justify-center space-x-2 group"
          >
            <RotateCcw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
            <span>Reset Filters</span>
          </button>
        </div>
      </div>

      {/* Active Filters Indicator */}
      {(search || role) && (
        <div className="mt-4 p-3 bg-muted bg-opacity-50 rounded-lg border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-foreground font-medium">
                Active Filters:
              </span>
              {search && (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary bg-opacity-20 text-foreground text-xs border-border border-opacity-30">
                  <Search className="h-3 w-3 mr-1" />"{search}"
                </span>
              )}
              {role && (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary bg-opacity-20 text-foreground text-xs border-border border-opacity-30">
                  <Shield className="h-3 w-3 mr-1" />
                  {formatRoleLabel(role)}
                </span>
              )}
            </div>
            <button
              onClick={onReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center space-x-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Clear All</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
