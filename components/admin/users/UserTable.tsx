"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Ban,
  ShieldOff,
  Trash2,
  Mail,
  Phone,
  Calendar,
  ShoppingBag,
  Star,
  Shield,
  User as UserIcon,
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

interface UserTableProps {
  users: User[];
  onUserUpdate: (userId: string, updates: Partial<User>) => void;
  onUserDelete: (userId: string) => void;
}

export default function UserTable({
  users,
  onUserUpdate,
  onUserDelete,
}: UserTableProps) {
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("7"); // days

  const handleBanUser = async (userId: string, email: string) => {
    if (!banReason) {
      alert("Please write a reason for banning the user");
      return;
    }

    const banExpires =
      banDuration === "permanent"
        ? null
        : Date.now() + parseInt(banDuration) * 24 * 60 * 60 * 1000;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          banned: true,
          banReason,
          banExpires: banExpires ? Math.floor(banExpires / 1000) : null,
        }),
      });

      if (response.ok) {
        onUserUpdate(userId, {
          banned: true,
          banReason,
          banExpires: banExpires ? Math.floor(banExpires / 1000) : null,
        });
        setBanReason("");
      } else {
        alert("Failed to ban user");
      }
    } catch (error) {
      console.error("Error banning user:", error);
      alert("Error occurred while banning user");
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          banned: false,
          banReason: null,
          banExpires: null,
        }),
      });

      if (response.ok) {
        onUserUpdate(userId, {
          banned: false,
          banReason: null,
          banExpires: null,
        });
      } else {
        alert("Failed to lift user ban");
      }
    } catch (error) {
      console.error("Error unbanning user:", error);
      alert("Error occurred while lifting user ban");
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (
      !confirm(
        `Are you sure you want to delete user ${email}?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onUserDelete(userId);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Error occurred while deleting user");
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isBanExpired = (banExpires: number | null) => {
    if (!banExpires) return false; // permanent ban
    return Date.now() > banExpires * 1000;
  };

  const getStatusColor = (user: User) => {
    if (user.banned && !isBanExpired(user.banExpires)) {
      return "bg-destructive/10 text-destructive border-destructive/20";
    } else if (user.emailVerified) {
      return "bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-400/10 dark:text-green-400 dark:border-green-400/20";
    } else {
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-400/10 dark:text-yellow-400 dark:border-yellow-400/20";
    }
  };

  const getStatusText = (user: User) => {
    if (user.banned && !isBanExpired(user.banExpires)) {
      return user.banExpires ? "Temporarily Banned" : "Permanently Banned";
    } else if (user.emailVerified) {
      return "Verified";
    } else {
      return "Unverified";
    }
  };

  const getRoleColor = (role: string) => {
    const normalized = role?.toLowerCase?.() || "";
    return normalized.includes("admin")
      ? "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-400/10 dark:text-purple-400 dark:border-purple-400/20"
      : "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/20";
  };

  const formatRoleLabel = (role: string) => {
    if (!role) return "User";
    return role
      .split("_")
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  };

  return (
    <div className="overflow-hidden rounded-2xl shadow-lg border-border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted shadow-sm">
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                User
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                Role
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                Activities
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                Status
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                Joined
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider border-b border-border">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-background divide-y divide-border">
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-muted hover:bg-opacity-50 transition-all duration-300 group"
              >
                {/* User Info */}
                <td className="px-6 py-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-md">
                        <UserIcon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {user.name || "No Name"}
                        </p>
                        {user.role?.toLowerCase?.().includes("admin") && (
                          <Shield className="h-3 w-3 text-purple-600" />
                        )}
                      </div>
                      <div className="flex items-center mt-1 space-x-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      {user.phone && (
                        <div className="flex items-center mt-1 space-x-2 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{user.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getRoleColor(user.role)}`}
                  >
                    {formatRoleLabel(user.role)}
                  </span>
                </td>

                {/* Activities */}
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-1 text-foreground">
                      <ShoppingBag className="h-4 w-4" />
                      <span className="font-semibold">
                        {user._count.orders}
                      </span>
                      <span className="text-xs text-muted-foreground">Orders</span>
                    </div>
                    <div className="flex items-center space-x-1 text-muted-foreground">
                      <Star className="h-4 w-4" />
                      <span className="font-semibold">
                        {user._count.reviews}
                      </span>
                      <span className="text-xs text-muted-foreground">Reviews</span>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(user)}`}
                  >
                    {getStatusText(user)}
                  </span>
                </td>

                {/* Join Date */}
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(user.createdAt)}</span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    {/* View Button */}
                    <Link
                      href={`/admin/operations/users/${user.id}`}
                      className="inline-flex items-center px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 group/action shadow-sm"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>

                    {/* Ban/Unban Button */}
                    {user.banned && !isBanExpired(user.banExpires) ? (
                      <button
                        onClick={() => handleUnbanUser(user.id)}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-all duration-300 group/action shadow-sm"
                        title="Unban"
                      >
                        <ShieldOff className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const modal = document.getElementById(
                            "ban-modal"
                          ) as HTMLDialogElement;
                          if (modal) {
                            modal.showModal();
                            modal.dataset.userId = user.id;
                            modal.dataset.userEmail = user.email;
                          }
                        }}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition-all duration-300 group/action shadow-sm"
                        title="Ban"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteUser(user.id, user.email)}
                      className="inline-flex items-center px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all duration-300 group/action shadow-sm"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {users.length === 0 && (
        <div className="text-center py-12 bg-background">
          <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
            <UserIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No users found
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            No users match your search criteria. Please try different filters.
          </p>
        </div>
      )}

      {/* Ban Modal - Redesigned based on Screenshot & Fixes */}
      <dialog
        id="ban-modal"
        className="modal modal-bottom sm:modal-middle rounded-xl"
      >
        <div className="modal-box p-6 bg-card border-border">
          {/* Close Button at Top Right (✕) */}
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
              ✕
            </button>
          </form>

          {/* Modal Header */}
          <h3 className="text-xl font-bold text-foreground mb-6 flex items-center border-b border-border pb-3">
            {/* Ban icon (h-6 w-6) - Adjusted size for header */}
            <Ban className="h-6 w-6 mr-3 text-destructive" />
            Ban User
          </h3>

          <div className="py-4 space-y-5">
            {/* Ban Reason Field */}
            <div>
              <label className="label">
                <span className="label-text text-foreground font-semibold">
                  Ban Reason
                </span>
              </label>
              <textarea
                placeholder="Write reason for banning user..."
                className="textarea textarea-bordered w-full border-border bg-muted text-foreground focus:border-destructive focus:ring-1 focus:ring-destructive transition-shadow p-2 rounded-lg"
                rows={3}
              />
            </div>

            {/* Ban Duration Field */}
            <div>
              <label className="label">
                <span className="label-text text-foreground font-semibold">
                  Ban Duration
                </span>
              </label>
              <select className="select select-bordered w-full border-border bg-muted text-foreground focus:border-destructive focus:ring-1 focus:ring-destructive transition-shadow p-2 rounded-lg">
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="permanent">Permanent Ban</option>
              </select>
            </div>

            {/* Warning Block - Adjusted to match screenshot style (simpler box) */}
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mt-4">
              <div className="flex items-start space-x-3">
                {/* Warning Icon (h-5 w-5) */}
                <Ban className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Warning</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    Banned users cannot log in to the system or place new orders.
                    Existing orders will not be affected.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Actions (Buttons) - FIXING THE BUTTON LAYOUT ISSUE */}
          <div className="modal-action flex items-center justify-end border-t border-border pt-4 gap-2 mt-6">
            {/* Cancel Button */}
            <button
              className="btn btn-ghost bg-secondary hover:bg-secondary/80 p-2 rounded-xl text-secondary-foreground hover:text-secondary-foreground transition-colors"
              onClick={() => {
                const modal = document.getElementById(
                  "ban-modal"
                ) as HTMLDialogElement;
                modal.close();
              }}
            >
              Cancel
            </button>

            {/* Ban Button - Fixed: Using flex for alignment and ensuring proper button classes */}
            <button
              className="btn flex items-center p-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive hover:border-destructive/90 transition-colors"
              // Add your Ban logic here
              onClick={() => {
                const modal = document.getElementById(
                  "ban-modal"
                ) as HTMLDialogElement;
                modal.close();
              }}
            >
              <Ban className="h-4 w-4 mr-2" />
              Ban User
            </button>
          </div>
        </div>

        {/* Backdrop - Removed the visible "close" text */}
        <form method="dialog" className="modal-backdrop">
          {/* This button should be invisible and is only needed to close the modal on backdrop click */}
          <button aria-label="Close modal"></button>
        </form>
      </dialog>
    </div>
  );
}
