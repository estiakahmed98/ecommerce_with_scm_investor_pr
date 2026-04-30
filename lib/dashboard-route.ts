type DashboardUserLike =
  | {
      role?: string | null;
      permissions?: string[] | null;
      defaultAdminRoute?: "/admin" | "/admin/warehouse" | null;
    }
  | null
  | undefined;

export const USER_DASHBOARD_ROUTE = "/ecommerce/user/";
export const DELIVERY_DASHBOARD_ROUTE = "/admin/operations/delivery";
export const SUPPLIER_DASHBOARD_ROUTE = "/supplier";
export const INVESTOR_DASHBOARD_ROUTE = "/investor";

const ADMIN_DELIVERY_ROUTE = "/admin/delivery";
const ADMIN_PROFILE_ROUTE = "/admin/profile";
const LEGACY_DELIVERY_ENTRY_ROUTE = "/delivery";
const LEGACY_DELIVERY_DASHBOARD_ROUTE = "/delivery/dashboard";

const AUTH_ROUTES = ["/signin", "/sign-up"];

function isRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function hasAdminDashboardAccess(user?: DashboardUserLike) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("admin.panel.access");
}

export function hasDeliveryDashboardAccess(user?: DashboardUserLike) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("delivery.dashboard.access");
}

export function hasSupplierPortalAccess(user?: DashboardUserLike) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("supplier.portal.access");
}

export function hasInvestorPortalAccess(user?: DashboardUserLike) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("investor.portal.access");
}

export function getDashboardRoute(user?: DashboardUserLike) {
  if (user?.role === "investor") {
    return INVESTOR_DASHBOARD_ROUTE;
  }
  if (hasAdminDashboardAccess(user)) {
    return user?.defaultAdminRoute === "/admin/warehouse"
      ? "/admin/warehouse"
      : "/admin";
  }

  if (hasDeliveryDashboardAccess(user)) {
    return DELIVERY_DASHBOARD_ROUTE;
  }

  if (hasSupplierPortalAccess(user)) {
    return SUPPLIER_DASHBOARD_ROUTE;
  }

  if (hasInvestorPortalAccess(user)) {
    return INVESTOR_DASHBOARD_ROUTE;
  }

  return USER_DASHBOARD_ROUTE;
}

export function isAdminDeliveryRoute(pathname: string) {
  return isRoutePrefix(pathname, ADMIN_DELIVERY_ROUTE);
}

export function isLegacyDeliveryDashboardRoute(pathname: string) {
  return (
    pathname === LEGACY_DELIVERY_ENTRY_ROUTE ||
    isRoutePrefix(pathname, LEGACY_DELIVERY_DASHBOARD_ROUTE)
  );
}

export function isDeliveryAdminShellRoute(pathname: string) {
  return (
    isAdminDeliveryRoute(pathname) ||
    isRoutePrefix(pathname, ADMIN_PROFILE_ROUTE)
  );
}

export function sanitizeReturnUrl(returnUrl?: string | null) {
  const value = String(returnUrl || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  const pathOnly = value.split("?")[0]?.split("#")[0] || value;
  if (AUTH_ROUTES.includes(pathOnly)) {
    return null;
  }

  return value;
}

export function resolvePostAuthRoute(
  user?: DashboardUserLike,
  returnUrl?: string | null,
) {
  return sanitizeReturnUrl(returnUrl) ?? getDashboardRoute(user);
}
